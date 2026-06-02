// ---------------------------------------------------------------------------
//  Pipeline orchestration.
//
//  Per company, in order:
//    1. Discover  — live IR / exchange / IRDAI page walk (gated by HI_LIVE).
//                   In a blocked/offline environment every endpoint reports
//                   blocked/skipped honestly and we proceed.
//    2. Catalog   — enumerate the cached raw corpus, hash + classify each file.
//    3. Extract   — parse the most relevant documents, pull metric observations.
//    4. Merge     — fold documents + observations into the existing artifact,
//                   preserving history and flagging conflicts.
//    5. Review    — route low-confidence / unknown / conflict items to the queue.
//    6. Validate  — schema-check before the artifact is allowed to be written.
//
//  A failure in one company, source, or document never aborts the run; it is
//  recorded and the pipeline moves on. Only code-level / schema / corruption
//  failures escalate to a non-zero exit (handled by the entry script).
// ---------------------------------------------------------------------------

import type {
  CompanyConfig, CompanyData, DocumentRecord, MetricObservation,
  ReviewItem, RunReportSource, SourceStatusRecord, SourceStatusValue, SourceType,
} from './types.js'
import { endpointsFor } from './config/sources.js'
import { discoverCompanyIr, isLive, type DiscoveryResult } from './scrapers/company-ir.js'
import { discoverExchange } from './scrapers/exchange.js'
import { discoverIrdai } from './scrapers/irdai.js'
import { listRawFiles, readRaw, hashBuffer, saveRaw, type RawFile } from './storage/raw-store.js'
import { httpGet } from './utils/http.js'
import type { DiscoveredDoc } from './scrapers/company-ir.js'
import { readCompanyData } from './storage/json-store.js'
import { mergeDocuments, mergeMetricSeries } from './storage/merge-history.js'
import { classifyDocument, documentBucket } from './extractors/document-classifier.js'
import { parsePeriod } from './extractors/period-parser.js'
import { extractPdfText } from './extractors/pdf-text.js'
import { extractTableRows } from './extractors/pdf-tables.js'
import { extractMetrics } from './extractors/metric-extractor.js'
import { validateCompanyData } from './quality/schema.js'
import { reviewItemsFromObservations, reviewItemForUnknownDoc, dedupeReviewQueue } from './quality/review-queue.js'
import { needsReview } from './quality/confidence.js'
import { nowIso, looseDateToIso } from './utils/dates.js'
import { log } from './utils/logger.js'

const MAX_CATALOG = Number(process.env.HI_MAX_CATALOG ?? '400')
const MAX_EXTRACT = Number(process.env.HI_MAX_DOCS ?? '60')
const MAX_EXTRACT_BYTES = 60 * 1024 * 1024

// Document-type priority for bounding which corpus files we deep-extract first.
const TYPE_PRIORITY: Record<string, number> = {
  annual_report: 100, integrated_report: 96, earnings_presentation: 92, investor_presentation: 88,
  quarterly_result: 84, earnings_call_transcript: 72, analyst_call_transcript: 70,
  irdai_disclosure: 64, industry_report: 60, press_release: 44, corporate_governance_report: 40,
  esg_report: 40, investor_day_presentation: 86, regulatory_circular: 50, stock_exchange_filing: 34, unknown: 10,
}

export interface CompanyRunResult {
  data: CompanyData
  sourceStatus: SourceStatusRecord[]
  runSources: RunReportSource[]
  reviewItems: ReviewItem[]
  discovered: number
  downloaded: number
  metricsExtracted: number
  valid: boolean
  validationErrors: string[]
}

function sourceTypeForDoc(documentType: string): SourceType {
  if (documentType === 'stock_exchange_filing') return 'exchange'
  // Corpus files were cached from the company's own public-disclosure pages,
  // so company_ir is the accurate provenance even for IRDAI-format NL/L forms.
  return 'company_ir'
}

async function discoverAll(company: CompanyConfig): Promise<DiscoveryResult[]> {
  const results: DiscoveryResult[] = []
  for (const ep of endpointsFor(company)) {
    try {
      if (ep.sourceType === 'company_ir') results.push(await discoverCompanyIr(company, ep))
      else if (ep.sourceType === 'exchange') results.push(await discoverExchange(company, ep))
      else if (ep.sourceType === 'irdai') results.push(await discoverIrdai(company, ep))
    } catch (err) {
      results.push({
        endpointId: ep.id, url: ep.url, status: 'failed',
        httpStatus: null, error: err instanceof Error ? err.message : String(err), documents: [],
      })
    }
  }
  return results
}

/** Build a catalog DocumentRecord from a cached raw file. */
async function catalogRawFile(company: CompanyConfig, f: RawFile): Promise<{ record: DocumentRecord; buffer: Buffer | null }> {
  const cls = classifyDocument({ filename: f.relPath, sourceType: sourceTypeForDoc('unknown') })
  const period = parsePeriod(f.relPath)
  let hash: string | null = null
  let buffer: Buffer | null = null
  try {
    buffer = await readRaw(f.path)
    hash = hashBuffer(buffer)
  } catch {
    /* unreadable file — catalog without hash */
  }
  const record: DocumentRecord = {
    title: f.filename.replace(/\.[^.]+$/, ''),
    company: company.name,
    slug: company.slug,
    publishedDate: looseDateToIso(f.relPath),
    period: period.period === 'unknown' ? null : period.period,
    sourceUrl: company.disclosureUrls[0] ?? company.investorRelationsUrls[0] ?? f.relPath,
    finalUrl: null,
    localPath: f.path,
    documentType: cls.documentType,
    sourceType: sourceTypeForDoc(cls.documentType),
    fileType: f.fileType,
    downloadedAt: null, // cached prior to this run; not freshly downloaded
    hash,
    status: 'downloaded',
  }
  return { record, buffer }
}

const DOWNLOAD = process.env.HI_DOWNLOAD === '1'

/**
 * Catalog a live-discovered document, downloading it only when downloads are
 * enabled and the host permits it. Returns a DocumentRecord (deduped by hash
 * against the corpus catalog) or null on a hard download failure we'd rather
 * not record as a phantom document.
 */
async function catalogDiscovered(
  company: CompanyConfig, sourceType: SourceType, doc: DiscoveredDoc,
): Promise<DocumentRecord | null> {
  const filename = doc.url.split('/').pop()?.split('?')[0] ?? doc.title
  const cls = classifyDocument({ filename, title: doc.title, url: doc.url, sourceType })
  const period = parsePeriod(`${doc.title} ${filename}`)
  let localPath: string | null = null
  let hash: string | null = null
  let status: DocumentRecord['status'] = 'skipped' // discovered but not downloaded
  let downloadedAt: string | null = null

  if (DOWNLOAD && isLive()) {
    const res = await httpGet(doc.url, { binary: true, timeoutMs: 30_000 })
    if (res.blocked) status = 'blocked'
    else if (res.ok && res.buffer) {
      const saved = await saveRaw(company, sourceType, filename, res.buffer)
      localPath = saved.path; hash = saved.hash; status = 'downloaded'; downloadedAt = nowIso()
    } else status = 'failed'
  }

  return {
    title: doc.title || filename, company: company.name, slug: company.slug,
    publishedDate: looseDateToIso(`${doc.title} ${filename}`),
    period: period.period === 'unknown' ? null : period.period,
    sourceUrl: doc.url, finalUrl: doc.url, localPath,
    documentType: cls.documentType, sourceType, fileType: doc.fileType,
    downloadedAt, hash, status,
  }
}

function relevance(rec: DocumentRecord): number {
  const base = TYPE_PRIORITY[rec.documentType] ?? 10
  // Recency boost from the fiscal year embedded in the period (FY2026 > FY2013).
  const fy = rec.period?.match(/FY(20\d{2})/)
  const recency = fy ? (Number(fy[1]) - 2010) * 2 : 0
  return base + recency
}

export async function runCompany(company: CompanyConfig): Promise<CompanyRunResult> {
  log.info('pipeline', `→ ${company.name}`, { slug: company.slug, live: isLive() })
  const data = await readCompanyData(company)

  const sourceStatus: SourceStatusRecord[] = []
  const runSources: RunReportSource[] = []
  const newDocs: DocumentRecord[] = []
  const allObservations: MetricObservation[] = []
  const reviewItems: ReviewItem[] = []
  let downloaded = 0 // freshly downloaded this run (live)
  let extractedDocs = 0 // corpus documents parsed this run

  // ── 1. Discovery (live, gated) ────────────────────────────────────────────
  const discovery = await discoverAll(company)
  for (const d of discovery) {
    const sourceType = d.endpointId.includes(':nse') || d.endpointId.includes(':bse')
      ? 'exchange'
      : d.endpointId.includes('irdai') ? 'irdai' : 'company_ir'
    sourceStatus.push({
      company: company.name, slug: company.slug, source: sourceType, id: d.endpointId,
      url: d.url, status: d.status, httpStatus: d.httpStatus, error: d.error, checkedAt: nowIso(),
    })
    runSources.push({ company: company.name, source: sourceType, url: d.url, status: d.status, count: d.documents.length, error: d.error })
    if (d.status === 'blocked') {
      reviewItems.push({
        slug: company.slug, company: company.name, reason: 'blocked_source',
        detail: `${sourceType} blocked (HTTP ${d.httpStatus ?? '—'}) at ${d.url}`,
        sourceUrl: d.url, createdAt: nowIso(),
      })
    }

    // Catalog every live-discovered document. Download it only when explicitly
    // enabled (HI_DOWNLOAD=1) and access is permitted; a downloaded file lands
    // in the corpus and is deduped by hash against the corpus catalog below.
    for (const doc of d.documents) {
      const rec = await catalogDiscovered(company, sourceType, doc)
      if (rec) { newDocs.push(rec); if (rec.status === 'downloaded') downloaded++ }
    }
  }

  // ── 2. Catalog the cached corpus ──────────────────────────────────────────
  const rawFiles = await listRawFiles(company)
  const discoveredCount = rawFiles.length + discovery.reduce((n, d) => n + d.documents.length, 0)

  // Catalog the most relevant files first, bounded so the artifact stays sane.
  const cataloged: Array<{ record: DocumentRecord; buffer: Buffer | null; relPath: string }> = []
  const prelim = rawFiles
    .map((f) => ({ f, score: relevance({ documentType: classifyDocument({ filename: f.relPath, sourceType: 'company_ir' }).documentType, period: parsePeriod(f.relPath).period } as DocumentRecord) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CATALOG)

  for (const { f } of prelim) {
    try {
      const { record, buffer } = await catalogRawFile(company, f)
      cataloged.push({ record, buffer, relPath: f.relPath })
      newDocs.push(record)
    } catch (err) {
      log.warn('pipeline', 'catalog failed', { file: f.relPath, error: String(err) })
    }
  }

  // ── 3. Extract metrics from the top-N catalogued PDFs ─────────────────────
  const toExtract = cataloged
    .filter((c) => c.record.fileType === 'pdf' && c.buffer && c.buffer.length <= MAX_EXTRACT_BYTES)
    .sort((a, b) => relevance(b.record) - relevance(a.record))
    .slice(0, MAX_EXTRACT)

  for (const c of toExtract) {
    try {
      const { text, pages } = await extractPdfText(c.buffer as Buffer)
      if (!text || text.length < 40) continue
      // Refine classification with a content sample now that we have text.
      const cls = classifyDocument({ filename: c.relPath, sourceType: c.record.sourceType, text })
      c.record.documentType = cls.documentType
      c.record.sourceType = sourceTypeForDoc(cls.documentType)
      const period = parsePeriod(c.relPath, text)
      c.record.period = period.period === 'unknown' ? null : period.period

      if (cls.documentType === 'unknown') reviewItems.push(reviewItemForUnknownDoc(c.record))

      const rows = extractTableRows(text)
      const obs = extractMetrics({
        company, text, pages, tableRows: rows,
        documentType: cls.documentType, period, sourceType: c.record.sourceType,
        sourceUrl: c.record.sourceUrl, documentTitle: c.record.title,
      })
      // Two document classes never yield "confirmed" metrics, only review items:
      //   • IRDAI NL/L-form disclosures — dense, multi-column, reported in
      //     ₹'000/lakhs (not crores); scale and period column aren't reliably
      //     resolvable without a form-specific parser.
      //   • Call transcripts — Q&A prose where numbers are usually comparatives
      //     ("doubled from ₹60cr last year"), not clean period figures.
      // Both are still catalogued and their observations preserved for review.
      const lowTrust = (['irdai_disclosure', 'regulatory_circular', 'earnings_call_transcript', 'analyst_call_transcript'] as const)
        .includes(cls.documentType as 'irdai_disclosure')
      const finalObs = lowTrust
        ? obs.map((o) => ({ ...o, tag: needsReview(o.tag) ? o.tag : ('review_required' as const), confidence: Math.min(o.confidence, 0.5) }))
        : obs
      allObservations.push(...finalObs)
      extractedDocs++
      log.debug('pipeline', 'extracted', { file: c.relPath, type: cls.documentType, period: period.period, metrics: obs.length })
    } catch (err) {
      log.warn('pipeline', 'extraction failed', { file: c.relPath, error: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── 4. Merge documents into their buckets ─────────────────────────────────
  for (const bucketName of Object.keys(data.documents) as Array<keyof CompanyData['documents']>) {
    const incoming = newDocs.filter((d) => documentBucket(d.documentType) === bucketName)
    data.documents[bucketName] = mergeDocuments(data.documents[bucketName], incoming)
  }

  // ── 4b. Merge metric observations, collecting conflicts ───────────────────
  const byMetric = new Map<string, MetricObservation[]>()
  for (const o of allObservations) {
    const arr = byMetric.get(o.metric) ?? []
    arr.push(o)
    byMetric.set(o.metric, arr)
  }
  for (const [metric, obs] of byMetric) {
    const existing = data.metrics[metric] ?? []
    const { merged, conflicts } = mergeMetricSeries(metric, company.name, company.slug, existing, obs)
    data.metrics[metric] = merged
    reviewItems.push(...conflicts)
  }

  // ── 5. Review queue (low-confidence + unknown + conflicts + blocked) ──────
  reviewItems.push(...reviewItemsFromObservations(allObservations))
  const dedupedReview = dedupeReviewQueue(reviewItems)

  // ── 6. Assemble + validate ────────────────────────────────────────────────
  data.sourceStatus = sourceStatus
  data.reviewQueue = dedupedReview
  data.lastUpdated = nowIso()

  const metricsExtracted = allObservations.filter((o) => !needsReview(o.tag)).length
  // Corpus extraction shows up as a company_ir "source" row for the report.
  runSources.push({
    company: company.name, source: 'company_ir', url: '(local raw cache)',
    status: (toExtract.length ? 'ok' : 'skipped') as SourceStatusValue,
    count: allObservations.length, error: null,
  })

  const validation = validateCompanyData(data)
  if (!validation.ok) {
    log.error('pipeline', `schema validation failed for ${company.slug}`, { errors: validation.errors.slice(0, 8) })
  }

  log.info('pipeline', `✓ ${company.name}`, {
    discovered: discoveredCount, cataloged: newDocs.length, extractedDocs, downloaded,
    observations: allObservations.length, review: dedupedReview.length, valid: validation.ok,
  })

  return {
    data, sourceStatus, runSources, reviewItems: dedupedReview,
    discovered: discoveredCount, downloaded, metricsExtracted,
    valid: validation.ok, validationErrors: validation.errors,
  }
}
