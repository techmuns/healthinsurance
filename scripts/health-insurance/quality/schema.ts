// ---------------------------------------------------------------------------
//  Schema validation (zero-dependency).
//
//  The spec calls for schema validation before any output is written, and a
//  hard failure (exit 1) on corrupt data. We hand-roll it rather than pull a
//  runtime dependency: the existing repo validates the same way, the rules are
//  few and explicit, and the error messages are precise and auditable.
//
//  validateCompanyData returns every problem it finds (not just the first), so
//  one run surfaces all schema breaks at once.
// ---------------------------------------------------------------------------

import type { CompanyData, DocumentRecord, MetricObservation, Tag } from '../types.js'
import { METRIC_KEYS } from '../config/metrics.js'

const DOCUMENT_TYPES = new Set([
  'quarterly_result', 'earnings_presentation', 'investor_presentation', 'press_release',
  'annual_report', 'integrated_report', 'esg_report', 'corporate_governance_report',
  'earnings_call_transcript', 'analyst_call_transcript', 'investor_day_presentation',
  'stock_exchange_filing', 'irdai_disclosure', 'regulatory_circular', 'industry_report', 'unknown',
])
const TAGS = new Set<Tag>(['confirmed', 'derived', 'fallback', 'review_required', 'blocked_source', 'low_confidence'])
const PERIOD_TYPES = new Set(['quarter', 'annual', 'ttm', 'unknown'])
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
// FY2025 · Q1FY2026 · H1FY2026 · 9MFY2026 · TTMFY2026 · unknown
const PERIOD_RE = /^(unknown|FY20\d{2}|(?:Q[1-4]|H1|9M|TTM)FY20\d{2})$/
const METRIC_SET = new Set(METRIC_KEYS)

export interface ValidationResult {
  ok: boolean
  errors: string[]
}

function isUrlOrPath(s: unknown): boolean {
  return typeof s === 'string' && s.length > 0 && (/^https?:\/\//.test(s) || s.startsWith('/') || /^[\w.-]+\//.test(s))
}

export function validateMetricObservation(o: MetricObservation, where: string): string[] {
  const e: string[] = []
  if (!METRIC_SET.has(o.metric)) e.push(`${where}: unknown metric "${o.metric}"`)
  if (!PERIOD_RE.test(o.period)) e.push(`${where}: bad period "${o.period}"`)
  if (!PERIOD_TYPES.has(o.periodType)) e.push(`${where}: bad periodType "${o.periodType}"`)
  if (!(o.value === null || typeof o.value === 'number')) e.push(`${where}: value must be number|null`)
  if (typeof o.value === 'number' && !Number.isFinite(o.value)) e.push(`${where}: value not finite`)
  if (!isUrlOrPath(o.sourceUrl)) e.push(`${where}: bad sourceUrl`)
  if (!DOCUMENT_TYPES.has(o.documentType)) e.push(`${where}: bad documentType "${o.documentType}"`)
  if (!TAGS.has(o.tag)) e.push(`${where}: bad tag "${o.tag}"`)
  if (typeof o.confidence !== 'number' || o.confidence < 0 || o.confidence > 1) e.push(`${where}: confidence out of [0,1]`)
  if (typeof o.slug !== 'string' || !SLUG_RE.test(o.slug)) e.push(`${where}: bad slug "${o.slug}"`)
  return e
}

export function validateDocumentRecord(d: DocumentRecord, where: string): string[] {
  const e: string[] = []
  if (!d.title) e.push(`${where}: missing title`)
  if (!DOCUMENT_TYPES.has(d.documentType)) e.push(`${where}: bad documentType "${d.documentType}"`)
  if (!isUrlOrPath(d.sourceUrl)) e.push(`${where}: bad sourceUrl`)
  if (!['pdf', 'html', 'xlsx', 'csv', 'unknown'].includes(d.fileType)) e.push(`${where}: bad fileType`)
  if (!['downloaded', 'skipped', 'blocked', 'failed', 'review_required'].includes(d.status)) e.push(`${where}: bad status`)
  return e
}

export function validateCompanyData(data: CompanyData): ValidationResult {
  const errors: string[] = []
  if (!data.company) errors.push('company name missing')
  if (!SLUG_RE.test(data.slug ?? '')) errors.push(`bad slug "${data.slug}"`)
  if (typeof data.lastUpdated !== 'string') errors.push('lastUpdated missing')

  const buckets = ['quarterlyResults', 'annualReports', 'transcripts', 'stockExchangeFilings', 'irdaiDisclosures', 'otherDisclosures'] as const
  for (const b of buckets) {
    if (!Array.isArray(data.documents?.[b])) errors.push(`documents.${b} must be an array`)
    else data.documents[b].forEach((d, i) => errors.push(...validateDocumentRecord(d, `${data.slug}.documents.${b}[${i}]`)))
  }

  if (typeof data.metrics !== 'object' || data.metrics === null) {
    errors.push('metrics must be an object')
  } else {
    for (const [key, series] of Object.entries(data.metrics)) {
      if (!METRIC_SET.has(key)) errors.push(`metrics: unknown key "${key}"`)
      if (!Array.isArray(series)) {
        errors.push(`metrics.${key} must be an array`)
        continue
      }
      series.forEach((o, i) => errors.push(...validateMetricObservation(o, `${data.slug}.metrics.${key}[${i}]`)))
    }
  }

  if (!Array.isArray(data.sourceStatus)) errors.push('sourceStatus must be an array')
  if (!Array.isArray(data.reviewQueue)) errors.push('reviewQueue must be an array')

  return { ok: errors.length === 0, errors }
}

/** Validate that a value round-trips as JSON (catches corruption / cycles). */
export function validateJsonSerialisable(data: unknown, label: string): ValidationResult {
  try {
    const s = JSON.stringify(data)
    JSON.parse(s)
    return { ok: true, errors: [] }
  } catch (err) {
    return { ok: false, errors: [`${label}: not JSON-serialisable — ${err instanceof Error ? err.message : String(err)}`] }
  }
}
