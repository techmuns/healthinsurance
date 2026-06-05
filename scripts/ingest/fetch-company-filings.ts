// ---------------------------------------------------------------------------
//  Chunk 2A - Company official filings adapter (extract -> snapshot only).
//
//  Reads the registry + filings inventory, parses the STAGED official PDFs
//  (annual reports / public disclosures / quarterly results / PPTs) with the
//  existing extractors, and writes a RICH sidecar snapshot
//  src/data/snapshots/company-filings-snapshot.json for review.
//
//  Deliberately SCOPED for Chunk 2A:
//    * Reuses parsePdf + extractDisclosure + QUARTERLY_PATTERNS/sanitiseQuarterly
//      (no new extraction engine).
//    * Skips companies flagged exclude_from_company_filings (e.g. defunct
//      reliance-health) and non-financial docs.
//    * Parses recent docs only (FY23+) so we work newest -> back.
//    * Care/Religare rule: a value parsed from a Religare (parent) document is
//      attributed to Care ONLY if the excerpt explicitly says "Care Health";
//      otherwise it stays a Religare figure. (Dormant until a Religare doc is
//      staged.)
//    * Does NOT touch build_value_store.py, fill_template.py, qa_checks.py, the
//      workflow, or the existing insurer-*-snapshot files. It only writes the
//      sidecar, so extracted values can be reviewed before any Excel filling.
//
//  Offline-first: reads bytes already staged under data/raw/; never fetches
//  here (every official site 403s this box). Runnable via:
//      npx tsx scripts/ingest/fetch-company-filings.ts
// ---------------------------------------------------------------------------

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { REPO_ROOT, writeSnapshot, nowIso } from './util'
import { parsePdf, extractByPatterns } from './parsers'
import { extractDisclosure, isPublicDisclosureForm } from './disclosure-extract'
import { QUARTERLY_PATTERNS, sanitiseQuarterly } from './quarterly-extract'

const PARSER_NAME = 'fetch-company-filings'
const REGISTRY = resolve(REPO_ROOT, 'data/source-map/company-source-registry.json')
const MASTER = resolve(REPO_ROOT, 'src/data/snapshots/company-master.json')
const INVENTORY = resolve(REPO_ROOT, 'data/source-map/filings-inventory.json')

const FINANCIAL_TYPES = new Set([
  'annual_report', 'public_disclosure', 'quarterly_results', 'quarterly_ppt', 'investor_presentation',
])
const RECENT_PERIOD_FROM = '2022-04-01' // FY23 onward (newest -> back)
const RECENT_FILING_FROM = '2023-01-01'
const PER_COMPANY_CAP = 8

const METRIC_UNIT: Record<string, string> = {
  gwp: 'INR_cr', nwp: 'INR_cr', nep: 'INR_cr', pat: 'INR_cr',
  combined_ratio: 'percent', claims_ratio: 'percent', expense_ratio: 'percent',
  commission_ratio: 'percent', solvency_ratio: 'x', roe: 'percent',
}
// Labels used only to locate a raw excerpt around the parsed value.
const METRIC_LABEL: Record<string, RegExp> = {
  gwp: /Gross\s+(?:Written|Direct)\s+Premium|GWP|GDPI/i,
  nwp: /Net\s+Written\s+Premium|NWP/i,
  nep: /Net\s+Earned\s+Premium|NEP/i,
  pat: /Profit\s+After\s+Tax|Net\s+Profit|PAT/i,
  combined_ratio: /Combined\s+Ratio/i,
  claims_ratio: /Incurred\s+Claims|Claims\s+Ratio|Loss\s+Ratio/i,
  expense_ratio: /Expense[s]?\s+(?:of\s+Management|Ratio)|Management\s+Expense/i,
  commission_ratio: /Commission/i,
  solvency_ratio: /Solvency/i,
  roe: /Return\s+on\s+Equity|ROE/i,
}
const DOC_TYPE_URL_FIELD: Record<string, string> = {
  annual_report: 'annual_report_url',
  public_disclosure: 'public_disclosure_url',
  quarterly_results: 'quarterly_results_url',
  quarterly_ppt: 'quarterly_ppt_url',
  investor_presentation: 'quarterly_ppt_url',
}

interface InvRow {
  company_id: string
  document_title: string
  document_type: string
  filing_period: string | null
  period_start: string | null
  period_end: string | null
  filing_date: string | null
  checksum_sha256: string | null
  fetch_status: string
  exclude_from_metrics: boolean
  source_file: string | null
}

interface RegRow {
  company_id: string
  public_disclosure_url?: string | null
  [k: string]: unknown
}
interface MasterRow {
  company_id: string
  exclude_from_company_filings?: boolean
}

interface FilingRecord {
  company_id: string
  source_company: string // who the document is FROM (≠ company_id only for parent docs)
  metric: string
  value: number
  unit: string
  filing_period: string | null
  period_start: string | null
  period_end: string | null
  document_type: string
  document_title: string
  filing_date: string | null
  source_url: string | null
  source_file: string | null
  source_priority_field: string | null
  raw_excerpt: string | null
  checksum_sha256: string | null
  provenance: {
    source_name: string
    parser_name: string
    parsed_at: string
    confidence: 'high' | 'medium' | 'low'
    extraction_route: string
  }
}

function readJson<T>(path: string): Promise<T> {
  return readFile(path, 'utf8').then((t) => JSON.parse(t) as T)
}

/** Pick recent financial docs, capped per company, newest first. */
function selectDocs(inv: InvRow[], excluded: Set<string>): InvRow[] {
  const recent = inv.filter((r) => {
    if (r.fetch_status !== 'staged_local') return false
    if (!FINANCIAL_TYPES.has(r.document_type)) return false
    if (r.exclude_from_metrics) return false
    if (excluded.has(r.company_id)) return false
    if (r.period_end && r.period_end >= RECENT_PERIOD_FROM) return true
    if (r.filing_date && r.filing_date >= RECENT_FILING_FROM) return true
    return false // ambiguous / ancient → skip in 2A
  })
  const byCompany = new Map<string, InvRow[]>()
  for (const r of recent) {
    const arr = byCompany.get(r.company_id) ?? []
    arr.push(r)
    byCompany.set(r.company_id, arr)
  }
  const out: InvRow[] = []
  for (const arr of byCompany.values()) {
    arr.sort((a, b) => (b.period_end ?? b.filing_date ?? '').localeCompare(a.period_end ?? a.filing_date ?? ''))
    out.push(...arr.slice(0, PER_COMPANY_CAP))
  }
  return out
}

function excerptAround(text: string, label: RegExp): string | null {
  const m = label.exec(text)
  if (!m || m.index == null) return null
  const start = Math.max(0, m.index - 40)
  const slice = text.slice(start, m.index + 200).replace(/\s+/g, ' ').trim()
  return slice.length > 240 ? slice.slice(0, 240) + '…' : slice
}

export async function runCompanyFilings(): Promise<{ records: FilingRecord[]; warnings: string[] }> {
  const fetched_at = nowIso()
  const registry = (await readJson<{ data: RegRow[] }>(REGISTRY)).data
  const regById = new Map<string, RegRow>(registry.map((c) => [c.company_id, c]))
  const master = (await readJson<{ data: MasterRow[] }>(MASTER)).data
  const excluded = new Set(master.filter((c) => c.exclude_from_company_filings).map((c) => c.company_id))
  const inv = (await readJson<{ data: InvRow[] }>(INVENTORY)).data

  const docs = selectDocs(inv, excluded)
  const records: FilingRecord[] = []
  const warnings: string[] = []
  const perDoc: Array<{ doc: string; company: string; metrics: number }> = []

  for (const doc of docs) {
    if (!doc.source_file) continue
    const abs = resolve(REPO_ROOT, doc.source_file)
    let text = ''
    try {
      const buf = await readFile(abs)
      text = (await parsePdf(buf)).text ?? ''
    } catch (err) {
      warnings.push(`${doc.company_id}: parse failed for ${doc.source_file} (${err instanceof Error ? err.message : err})`)
      continue
    }
    if (!text || text.length < 200) {
      warnings.push(`${doc.company_id}: empty/too-short text from ${doc.source_file}`)
      continue
    }

    // Route to the right extractor.
    let extracted: Record<string, number | null> = {}
    let route = ''
    let confidence: 'high' | 'medium' | 'low' = 'medium'
    if (doc.document_type === 'public_disclosure' && isPublicDisclosureForm(text)) {
      extracted = extractDisclosure(text) ?? {}
      route = 'extractDisclosure (IRDAI NL-form)'
      confidence = 'high'
    } else {
      extracted = sanitiseQuarterly(extractByPatterns(text, QUARTERLY_PATTERNS))
      route = 'extractByPatterns + sanitiseQuarterly'
      // Slide-deck text defeats simple label patterns -> down-weight PPT values.
      confidence = doc.document_type === 'quarterly_ppt' || doc.document_type === 'investor_presentation'
        ? 'low'
        : 'medium'
    }

    const reg = regById.get(doc.company_id)
    const urlField = DOC_TYPE_URL_FIELD[doc.document_type] ?? null
    const fieldVal = reg && urlField ? reg[urlField] : null
    const source_url = (typeof fieldVal === 'string' ? fieldVal : null) ?? (reg?.public_disclosure_url ?? null)

    let metricCount = 0
    for (const [metric, value] of Object.entries(extracted)) {
      if (value == null || !Number.isFinite(value)) continue
      const excerpt = excerptAround(text, METRIC_LABEL[metric] ?? new RegExp(metric, 'i'))

      // Care/Religare guard: a parent (Religare) document only feeds Care when the
      // excerpt explicitly names Care Health; otherwise it stays the parent's figure.
      let targetCompany = doc.company_id
      let sourceCompany = doc.company_id
      if (doc.company_id === 'religare-enterprises') {
        sourceCompany = 'religare-enterprises'
        targetCompany = excerpt && /care\s*health/i.test(excerpt) ? 'care-health' : 'religare-enterprises'
      }

      records.push({
        company_id: targetCompany,
        source_company: sourceCompany,
        metric,
        value,
        unit: METRIC_UNIT[metric] ?? 'unknown',
        filing_period: doc.filing_period,
        period_start: doc.period_start,
        period_end: doc.period_end,
        document_type: doc.document_type,
        document_title: doc.document_title,
        filing_date: doc.filing_date,
        source_url,
        source_file: doc.source_file,
        source_priority_field: urlField,
        raw_excerpt: excerpt,
        checksum_sha256: doc.checksum_sha256,
        provenance: {
          source_name: `${doc.company_id} ${doc.document_type} (${doc.filing_period ?? doc.filing_date ?? 'period n/a'})`,
          parser_name: PARSER_NAME,
          parsed_at: nowIso(),
          confidence,
          extraction_route: route,
        },
      })
      metricCount++
    }
    perDoc.push({ doc: doc.source_file.split('/').slice(-1)[0], company: doc.company_id, metrics: metricCount })
  }

  await writeSnapshot('company-filings-snapshot.json', {
    _meta: {
      snapshot_id: 'company-filings-snapshot',
      description: 'Chunk 2A: metrics extracted from STAGED official company filings (annual reports / public disclosures / quarterly results+PPT). Rich sidecar for review; NOT yet merged into insurer snapshots or the Excel value store.',
      schema_version: '1.0.0',
      dataset: records.length ? 'official' : 'pending',
      source_policy: 'official-first. Care primary = own disclosures; Religare attributed to Care only when excerpt names "Care Health".',
      parser: PARSER_NAME,
      generated_at: fetched_at,
      docs_parsed: docs.length,
      records: records.length,
      scope_note: 'Recent docs only (FY23+), capped per company. Defunct/industry-only companies excluded. Bridge + Excel filling intentionally deferred to a later chunk.',
    },
    data: records,
  })

  // Human-readable summary for review.
  const byCompany = new Map<string, number>()
  for (const r of records) byCompany.set(r.company_id, (byCompany.get(r.company_id) ?? 0) + 1)
  console.log(`fetch-company-filings: parsed ${docs.length} docs, extracted ${records.length} metric values`)
  for (const [c, n] of [...byCompany.entries()].sort()) {
    console.log(`  ${c.padEnd(20)} ${n} values`)
  }
  if (warnings.length) console.log(`  warnings: ${warnings.length}`)
  return { records, warnings }
}

// Run directly: npx tsx scripts/ingest/fetch-company-filings.ts
const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  runCompanyFilings().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
