// ---------------------------------------------------------------------------
//  Chunk 2A (hardened) - Company official filings adapter (extract -> snapshot).
//
//  Reads the registry + filings inventory, parses STAGED official PDFs, and
//  writes a rich, SAFETY-GATED sidecar snapshot company-filings-snapshot.json
//  for review. Accuracy > coverage: a value is only eligible_for_excel when it
//  is source-backed, unit-correct, period/company-correct and passes sanity.
//
//  Governing rules honoured here:
//   * Full source-proof per value (source_name/url, document_type, filing_period,
//     filing_date, raw_value, normalized_value, transformation_used, confidence,
//     review status, source_description for staged docs).
//   * ONE unit convention: ratios -> FRACTION (0.65), solvency -> multiple (3.03),
//     premiums/PAT -> INR crore. Single-normalization (never double-divide).
//   * PPT values: confidence low, eligible_for_excel=false (slide text unreliable).
//   * Mangled annual extraction (fused-column tell: >2 decimal places on an INR-cr
//     value) -> eligible_for_excel=false. Generic, not company-specific.
//   * Scale vs insurer-annual-snapshot is a FLAG (needs_review), not auto-reject;
//     only order-of-magnitude-off is failed.
//   * Care: dedicated decimal NL-form path; premiums skipped (unit ambiguity).
//   * parser_failed / no-metric rows carry NULL values, never look real.
//   * Religare consolidated -> Care only if the excerpt says "Care Health".
//
//  SCOPE: only this file + the snapshot. No bridge / Excel / QA / CI changes.
//  Runnable: npx tsx scripts/ingest/fetch-company-filings.ts  (or npm run ingest:filings)
// ---------------------------------------------------------------------------

import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { REPO_ROOT, writeSnapshot, nowIso } from './util'
import { parsePdf, extractByPatterns } from './parsers'
import { extractDisclosure, isPublicDisclosureForm } from './disclosure-extract'
import { QUARTERLY_PATTERNS, sanitiseQuarterly } from './quarterly-extract'
import { parseNl20, parseRevenueAccount, type Nl20Result, type Nl1Result } from './nl-form-parser'

const PARSER_NAME = 'fetch-company-filings'
const REGISTRY = resolve(REPO_ROOT, 'data/source-map/company-source-registry.json')
const MASTER = resolve(REPO_ROOT, 'src/data/snapshots/company-master.json')
const INVENTORY = resolve(REPO_ROOT, 'data/source-map/filings-inventory.json')
const ANNUAL_REF = resolve(REPO_ROOT, 'src/data/snapshots/insurer-annual-snapshot.json')

const FINANCIAL_TYPES = new Set([
  'annual_report', 'public_disclosure', 'quarterly_results', 'quarterly_ppt', 'investor_presentation',
])
const PPT_TYPES = new Set(['investor_presentation', 'quarterly_ppt'])
const INR_CR_METRICS = new Set(['gwp', 'nwp', 'nep', 'pat', 'net_worth', 'investment_aum'])
const RATIO_METRICS = new Set(['claims_ratio', 'expense_ratio', 'combined_ratio', 'commission_ratio', 'roe'])
const RECENT_PERIOD_FROM = '2022-04-01'
const RECENT_FILING_FROM = '2023-01-01'
// Raised from 8: once the inventory period labels were corrected (Chunk 2F), a
// company like Niva has 10+ correctly-recent disclosures, and a cap of 8 dropped
// the quarterly ones when the year-end files were (correctly) admitted. 14 keeps
// the quarterly + year-end public disclosures without losing coverage.
const PER_COMPANY_CAP = 14

interface InvRow {
  company_id: string; document_title: string; document_type: string
  filing_period: string | null; period_start: string | null; period_end: string | null
  filing_date: string | null; checksum_sha256: string | null; fetch_status: string
  exclude_from_metrics: boolean; source_file: string | null
}
interface RegRow { company_id: string; public_disclosure_url?: string | null; [k: string]: unknown }
interface MasterRow { company_id: string; exclude_from_company_filings?: boolean }

type Conf = 'high' | 'medium' | 'low'

interface FilingRecord {
  company_id: string
  source_company: string
  metric: string
  raw_value: number | null
  normalized_value: number | null
  unit: string
  transformation_used: string
  filing_period: string | null
  period_start: string | null
  period_end: string | null
  document_type: string
  document_title: string
  filing_date: string | null
  source_url: string | null
  source_file: string | null
  source_description: string
  source_priority_field: string | null
  raw_excerpt: string | null
  checksum_sha256: string | null
  extraction_status: 'extracted' | 'no_metrics_found' | 'parser_failed' | 'mangled'
  sanity_status: 'ok' | 'flagged' | 'failed' | 'n/a'
  sanity_reason: string
  needs_review: boolean
  eligible_for_excel: boolean
  suggested_manual_fallback: string | null
  parser_notes: string
  // Which NL-form column a public-disclosure value came from (Chunk 2C-A). Present
  // only on column-aware NL-20 records; the bridge requires "year_to_date" before
  // it will wire a full-year flow ratio. Absent on all other extraction routes.
  column_basis?: string
  provenance: { source_name: string; parser_name: string; parsed_at: string; confidence: Conf; extraction_route: string }
}

const DOC_TYPE_URL_FIELD: Record<string, string> = {
  annual_report: 'annual_report_url', public_disclosure: 'public_disclosure_url',
  quarterly_results: 'quarterly_results_url', quarterly_ppt: 'quarterly_ppt_url',
  investor_presentation: 'quarterly_ppt_url',
}
const METRIC_LABEL: Record<string, RegExp> = {
  gwp: /Gross\s+(?:Written|Direct)\s+Premium|GWP|GDPI/i, nwp: /Net\s+Written\s+Premium|NWP/i,
  nep: /Net\s+Earned\s+Premium|NEP/i, pat: /Profit\s+After\s+Tax|Net\s+Profit|PAT/i,
  combined_ratio: /Combined\s+Ratio/i, claims_ratio: /Incurred\s+Claims|Claims\s+Ratio|Loss\s+Ratio/i,
  expense_ratio: /Expense[s]?\s+(?:of\s+Management|Ratio)|Management\s+Expense/i,
  commission_ratio: /Commission/i, solvency_ratio: /Solvency/i, roe: /Return\s+on\s+Equity|ROE/i,
}

function readJson<T>(path: string): Promise<T> {
  return readFile(path, 'utf8').then((t) => JSON.parse(t) as T)
}

async function loadRefGwp(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  try {
    const snap = await readJson<{ data: Array<{ company_id: string; fiscal_year: string; gwp: number | null; gross_direct_premium?: number | null }> }>(ANNUAL_REF)
    const latest = new Map<string, string>()
    for (const r of snap.data) {
      const g = (typeof r.gwp === 'number' ? r.gwp : null) ?? (typeof r.gross_direct_premium === 'number' ? r.gross_direct_premium : null)
      if (g == null) continue
      const prev = latest.get(r.company_id)
      if (!prev || r.fiscal_year > prev) { latest.set(r.company_id, r.fiscal_year); out.set(r.company_id, g) }
    }
  } catch { /* no reference -> scale checks simply skip */ }
  return out
}

function selectDocs(inv: InvRow[], excluded: Set<string>): InvRow[] {
  const recent = inv.filter((r) =>
    r.fetch_status === 'staged_local' && FINANCIAL_TYPES.has(r.document_type) &&
    !r.exclude_from_metrics && !excluded.has(r.company_id) &&
    ((r.period_end && r.period_end >= RECENT_PERIOD_FROM) || (r.filing_date && r.filing_date >= RECENT_FILING_FROM)))
  const byCompany = new Map<string, InvRow[]>()
  for (const r of recent) { const a = byCompany.get(r.company_id) ?? []; a.push(r); byCompany.set(r.company_id, a) }
  const out: InvRow[] = []
  for (const a of byCompany.values()) {
    a.sort((x, y) => (y.period_end ?? y.filing_date ?? '').localeCompare(x.period_end ?? x.filing_date ?? ''))
    out.push(...a.slice(0, PER_COMPANY_CAP))
  }
  return out
}

function excerptAround(text: string, label: RegExp): string | null {
  const m = label.exec(text)
  if (!m || m.index == null) return null
  const slice = text.slice(Math.max(0, m.index - 40), m.index + 200).replace(/\s+/g, ' ').trim()
  return slice.length > 240 ? slice.slice(0, 240) + '…' : slice
}

const VALID_PERIOD = /^(Q[1-4])?FY\d{2}$/
function isValidPeriod(p: string | null): boolean {
  return !!p && VALID_PERIOD.test(p)
}
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
/** Quarter-end (month,year) -> "QnFYyy" (Indian FY ends 31 Mar). */
function periodFromEndDate(month: number, year: number): string | null {
  let q: number, fyEnd: number
  if (month >= 4 && month <= 6) { q = 1; fyEnd = year + 1 }
  else if (month >= 7 && month <= 9) { q = 2; fyEnd = year + 1 }
  else if (month >= 10 && month <= 12) { q = 3; fyEnd = year + 1 }
  else if (month >= 1 && month <= 3) { q = 4; fyEnd = year }
  else return null
  return `Q${q}FY${String(fyEnd % 100).padStart(2, '0')}`
}
/** Recover the reporting period from a disclosure's own "... ended <date>" header. */
function extractReportingPeriod(text: string): string | null {
  const head = text.slice(0, 4000)
  // "year ended March 31, 2025" -> full-year FY
  const ann = head.match(/year\s+ended[^0-9A-Za-z]{0,8}(?:31st?\s+)?march[,\s]+(\d{4})/i)
  if (ann) return `FY${ann[1].slice(2)}`
  // "ended <Month> <day>, <year>"
  let m = head.match(/ended[^A-Za-z0-9]{0,12}([A-Za-z]{3,9})[,\s]+(\d{1,2})[,\s]+(\d{4})/i)
  if (m) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mo) return periodFromEndDate(mo, parseInt(m[3], 10)) }
  // "ended <dd>-<Mon>-<yyyy>" or "<dd> <Month> <yyyy>"
  m = head.match(/ended[^A-Za-z0-9]{0,12}(\d{1,2})[.\-/\s]+([A-Za-z]{3,9})[.,\-/\s]+(\d{4})/i)
  if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return periodFromEndDate(mo, parseInt(m[3], 10)) }
  // "ended <dd>.<mm>.<yyyy>"
  m = head.match(/ended[^A-Za-z0-9]{0,12}(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/)
  if (m) return periodFromEndDate(parseInt(m[2], 10), parseInt(m[3], 10))
  return null
}

/** Care public-disclosure ratios are DECIMALS (1.10 = 110%) with no '%'/'**'. */
function extractCareDisclosure(text: string): Record<string, number | null> {
  const firstDecimalAfter = (label: RegExp): number | null => {
    const m = label.exec(text)
    if (!m || m.index == null) return null
    const window = text.slice(m.index, m.index + 120)
    const d = window.match(/(\d+\.\d{1,2})/)
    return d ? parseFloat(d[1]) : null
  }
  const out: Record<string, number | null> = {
    combined_ratio: firstDecimalAfter(/Combined\s+Ratio/i),
    claims_ratio: firstDecimalAfter(/Net\s+Incurred\s+Claims\s+to\s+Net\s+Earned\s+Premium|Incurred\s+Claims\s+to\s+Net\s+Earned/i),
    solvency_ratio: firstDecimalAfter(/Solvency\s+margin\s+Ratio\s+to\s+Required\s+Solvency\s+Margin\s+Ratio|Solvency\s+margin\s+Ratio/i),
  }
  return out
}

function normalizeValue(metric: string, raw: number): { normalized: number; unit: string; transformation: string } {
  if (INR_CR_METRICS.has(metric)) return { normalized: raw, unit: 'INR_cr', transformation: 'INR crore (as reported)' }
  if (metric === 'solvency_ratio') return { normalized: raw, unit: 'x', transformation: 'solvency multiple (identity)' }
  if (RATIO_METRICS.has(metric)) {
    // Single-normalization: percent (>5) -> fraction; already-fraction (<=5) kept.
    if (raw > 5) return { normalized: raw / 100, unit: 'fraction', transformation: 'percent -> fraction (value / 100)' }
    return { normalized: raw, unit: 'fraction', transformation: 'already a fraction (no division)' }
  }
  return { normalized: raw, unit: 'unknown', transformation: 'identity' }
}

function decimalPlaces(n: number): number {
  const s = String(n)
  const i = s.indexOf('.')
  return i < 0 ? 0 : s.length - i - 1
}

function runSanity(
  metric: string, raw: number, normalized: number, docType: string, refGwp: number | undefined,
): { status: FilingRecord['sanity_status']; reason: string; needs_review: boolean; mangled: boolean } {
  // Fused-column tell: an INR-cr figure with >2 decimal places (e.g. 255.94282).
  if (INR_CR_METRICS.has(metric) && decimalPlaces(raw) > 2) {
    return { status: 'failed', reason: `>2 decimal places (${raw}) - fused-column / mangled extraction`, needs_review: true, mangled: true }
  }
  if ((metric === 'gwp' || metric === 'nwp' || metric === 'nep') && raw <= 0) {
    return { status: 'failed', reason: 'non-positive premium', needs_review: true, mangled: false }
  }
  // Scale vs reference: order-of-magnitude off = failed; moderate diff = flag only.
  if (metric === 'gwp' && refGwp != null && refGwp > 0) {
    const ratio = raw / refGwp
    if (ratio < 0.1 || ratio > 10) return { status: 'failed', reason: `GWP ${raw} implausible vs reference ${refGwp} (${ratio.toFixed(2)}x)`, needs_review: true, mangled: true }
    if (ratio < 0.8 || ratio > 1.25) return { status: 'flagged', reason: `GWP ${raw} differs from reference ${refGwp} (${ratio.toFixed(2)}x) - verify vintage/period`, needs_review: true, mangled: false }
  }
  if (metric === 'solvency_ratio') {
    if (raw <= 0) return { status: 'failed', reason: 'non-positive solvency', needs_review: true, mangled: false }
    if (docType === 'annual_report' && raw <= 1.1 && Number.isInteger(raw)) {
      return { status: 'flagged', reason: `solvency=${raw} from annual report - possible fused-column truncation`, needs_review: true, mangled: false }
    }
    if (raw > 10) return { status: 'flagged', reason: `solvency ${raw} unusually high`, needs_review: true, mangled: false }
  }
  if (RATIO_METRICS.has(metric)) {
    if (normalized > 3.0) return { status: 'flagged', reason: `${metric} ${(normalized * 100).toFixed(0)}% > 300%`, needs_review: true, mangled: false }
    if (normalized > 0 && normalized < 0.05) return { status: 'flagged', reason: `${metric} ${normalized} looks too low (under-normalized?)`, needs_review: true, mangled: false }
  }
  return { status: 'ok', reason: '', needs_review: false, mangled: false }
}

/**
 * Build column-aware FilingRecords from a parsed NL-20 analytical-ratios
 * schedule (Chunk 2C-A). Each value already carries its own header-derived
 * period and the column it came from, so one document yields several
 * period-correct records (standalone quarter, full-year YTD, prior full-year).
 * Period is always known from the form header, so there is no period_unclear
 * here; uncertain column alignment is surfaced as a withheld (blocked) record.
 */
function buildNl20Records(
  doc: InvRow, nl20: Nl20Result, source_url: string | null, source_description: string,
  urlField: string | null, fallback: string, refGwp: number | undefined,
): FilingRecord[] {
  const out: FilingRecord[] = []
  const common = {
    company_id: doc.company_id, source_company: doc.company_id,
    document_type: doc.document_type, document_title: doc.document_title, filing_date: doc.filing_date,
    source_url, source_file: doc.source_file, source_description, source_priority_field: urlField,
    checksum_sha256: doc.checksum_sha256,
    provenance: {
      source_name: source_description, parser_name: PARSER_NAME, parsed_at: nowIso(),
      confidence: 'high' as Conf, extraction_route: 'parseNl20 (column-aware NL-20 analytical ratios)',
    },
  }
  for (const v of nl20.values) {
    const { normalized, unit, transformation } = normalizeValue(v.metric, v.raw_value)
    const san = runSanity(v.metric, v.raw_value, normalized, doc.document_type, refGwp)
    const extraction_status: FilingRecord['extraction_status'] = san.mangled ? 'mangled' : 'extracted'
    const eligible = extraction_status === 'extracted' && san.status === 'ok'
    out.push({
      ...common, metric: v.metric, raw_value: v.raw_value,
      normalized_value: extraction_status === 'mangled' || san.status === 'failed' ? null : normalized,
      unit, transformation_used: transformation,
      filing_period: v.period, period_start: v.period_start, period_end: v.period_end,
      raw_excerpt: `${v.column_header} | "${v.row_label}" cells=[${v.row_cells.join(', ')}] -> ${v.column_kind} = ${v.raw_value}`,
      extraction_status, sanity_status: san.status, sanity_reason: san.reason,
      needs_review: san.needs_review, eligible_for_excel: eligible,
      suggested_manual_fallback: eligible ? null : fallback,
      parser_notes: `column-aware NL-20: ${v.column_kind} -> ${v.period} (${v.column_basis}); ${v.column_header}`,
      column_basis: v.column_basis,
    })
  }
  for (const b of nl20.blocked) {
    out.push({
      ...common, metric: b.metric, raw_value: null, normalized_value: null, unit: 'n/a',
      transformation_used: 'n/a', filing_period: doc.filing_period,
      period_start: doc.period_start, period_end: doc.period_end, raw_excerpt: null,
      extraction_status: 'extracted', sanity_status: 'flagged',
      sanity_reason: `${b.reason}: ${b.detail}`, needs_review: true, eligible_for_excel: false,
      suggested_manual_fallback: fallback,
      parser_notes: `NL-20 column-aware parser withheld a value (${b.reason}); column alignment not certain`,
    })
  }
  return out
}

/**
 * Build FilingRecords from a parsed NL-1 Revenue Account (Chunk 2E). Only NEP
 * ("Premiums earned (Net)") is taken - the one revenue-account line whose basis
 * unambiguously matches a cell. Amounts are converted from the form's stated unit
 * (e.g. Rs Lakhs) to INR crore here, so normalizeValue is NOT re-applied. The
 * bridge still holds premiums from filings pending a basis/scope sign-off.
 */
function buildNl1Records(
  doc: InvRow, ra: Nl1Result, source_url: string | null, source_description: string,
  urlField: string | null, fallback: string, refGwp: number | undefined,
): FilingRecord[] {
  const out: FilingRecord[] = []
  const common = {
    company_id: doc.company_id, source_company: doc.company_id,
    document_type: doc.document_type, document_title: doc.document_title, filing_date: doc.filing_date,
    source_url, source_file: doc.source_file, source_description, source_priority_field: urlField,
    checksum_sha256: doc.checksum_sha256,
    provenance: {
      source_name: source_description, parser_name: PARSER_NAME, parsed_at: nowIso(),
      confidence: 'high' as Conf, extraction_route: 'parseRevenueAccount (NL-1 statutory revenue account)',
    },
  }
  for (const v of ra.values) {
    const normalized = v.normalized_crore
    const san = runSanity(v.metric, normalized, normalized, doc.document_type, refGwp)
    const eligible = san.status === 'ok'
    out.push({
      ...common, metric: v.metric, raw_value: v.raw_value,
      normalized_value: san.status === 'failed' ? null : normalized,
      unit: 'INR_cr', transformation_used: `${v.unit_label} -> INR crore (x${ra.to_crore})`,
      filing_period: v.period, period_start: v.period_start, period_end: v.period_end,
      raw_excerpt: `${v.column_header} | "${v.row_label}" -> ${v.column_kind} = ${v.raw_value} ${v.unit_label} = ${normalized} cr`,
      extraction_status: 'extracted', sanity_status: san.status, sanity_reason: san.reason,
      needs_review: san.needs_review, eligible_for_excel: eligible,
      suggested_manual_fallback: eligible ? null : fallback,
      parser_notes: `NL-1 revenue account: ${v.metric.toUpperCase()} (${v.column_kind}); ${v.unit_label} -> crore; ${v.column_header}`,
      column_basis: v.column_basis,
    })
  }
  for (const b of ra.blocked) {
    out.push({
      ...common, metric: b.metric, raw_value: null, normalized_value: null, unit: 'n/a',
      transformation_used: 'n/a', filing_period: doc.filing_period,
      period_start: doc.period_start, period_end: doc.period_end, raw_excerpt: null,
      extraction_status: 'extracted', sanity_status: 'flagged',
      sanity_reason: `${b.reason}: ${b.detail}`, needs_review: true, eligible_for_excel: false,
      suggested_manual_fallback: fallback,
      parser_notes: `NL-1 revenue-account parser withheld a value (${b.reason})`,
    })
  }
  return out
}

export async function runCompanyFilings(): Promise<{ records: FilingRecord[]; warnings: string[] }> {
  const fetched_at = nowIso()
  const registry = (await readJson<{ data: RegRow[] }>(REGISTRY)).data
  const regById = new Map<string, RegRow>(registry.map((c) => [c.company_id, c]))
  const master = (await readJson<{ data: MasterRow[] }>(MASTER)).data
  const excluded = new Set(master.filter((c) => c.exclude_from_company_filings).map((c) => c.company_id))
  const inv = (await readJson<{ data: InvRow[] }>(INVENTORY)).data
  const refGwp = await loadRefGwp()

  const docs = selectDocs(inv, excluded)
  const records: FilingRecord[] = []
  const warnings: string[] = []

  for (const doc of docs) {
    if (!doc.source_file) continue
    const reg = regById.get(doc.company_id)
    const urlField = DOC_TYPE_URL_FIELD[doc.document_type] ?? null
    const fieldVal = reg && urlField ? reg[urlField] : null
    const source_url = (typeof fieldVal === 'string' ? fieldVal : null) ?? (reg?.public_disclosure_url ?? null)
    const source_description =
      `${doc.company_id} ${doc.document_type.replace(/_/g, ' ')} for ${doc.filing_period ?? 'period n/a'}` +
      `${doc.filing_date ? ` (filed ${doc.filing_date})` : ''} - ` +
      `${source_url ? `public source: ${source_url}` : `staged file: ${basename(doc.source_file)}`}`
    const fallback = `data/raw/company-filings/${doc.company_id}/${doc.filing_period ?? 'latest'}/`

    const failRow = (status: FilingRecord['extraction_status'], reason: string, notes: string): FilingRecord => ({
      company_id: doc.company_id, source_company: doc.company_id, metric: '(none)',
      raw_value: null, normalized_value: null, unit: 'n/a', transformation_used: 'n/a',
      filing_period: doc.filing_period, period_start: doc.period_start, period_end: doc.period_end,
      document_type: doc.document_type, document_title: doc.document_title, filing_date: doc.filing_date,
      source_url, source_file: doc.source_file, source_description, source_priority_field: urlField,
      raw_excerpt: null, checksum_sha256: doc.checksum_sha256,
      extraction_status: status, sanity_status: 'n/a', sanity_reason: reason, needs_review: true,
      eligible_for_excel: false, suggested_manual_fallback: fallback, parser_notes: notes,
      provenance: { source_name: source_description, parser_name: PARSER_NAME, parsed_at: nowIso(), confidence: 'low', extraction_route: 'none' },
    })

    let text = ''
    try {
      text = (await parsePdf(await readFile(resolve(REPO_ROOT, doc.source_file)))).text ?? ''
    } catch (err) {
      warnings.push(`${doc.company_id}: parse failed ${doc.source_file}`)
      records.push(failRow('parser_failed', `PDF parse error: ${err instanceof Error ? err.message : String(err)}`, 'Could not read PDF; stage a clean copy.'))
      continue
    }
    if (!text || text.length < 200) {
      records.push(failRow('parser_failed', 'empty/too-short text (possibly image-based / needs OCR)', 'Likely scanned PDF; manual capture or OCR needed.'))
      continue
    }

    // Chunk 2C-A: column-aware NL-20 (analytical ratios) path for public
    // disclosures. It reads the statutory schedule's column headers and maps
    // each ratio to the correct period per column (standalone quarter / YTD
    // full-year / prior-year), emitting several period-correct records per doc.
    // Decimal layout only (e.g. Care Health); the percentage/** layout returns
    // found:false and falls through to the existing extractDisclosure path.
    if (doc.document_type === 'public_disclosure') {
      const nl20 = parseNl20(text)
      const ra = parseRevenueAccount(text)  // Chunk 2E: NL-1 statutory NEP
      const recs: FilingRecord[] = []
      if (nl20.found && (nl20.values.length > 0 || nl20.blocked.length > 0)) {
        recs.push(...buildNl20Records(doc, nl20, source_url, source_description, urlField, fallback, refGwp.get(doc.company_id)))
      }
      // Only emit NL-1 records when NEP was actually extracted. A found-but-blocked
      // revenue account (e.g. a different unit/layout on non-Niva disclosures) is
      // left untouched here - this keeps Chunk 2E's effect to the validated cases.
      if (ra.found && ra.values.length > 0) {
        recs.push(...buildNl1Records(doc, ra, source_url, source_description, urlField, fallback, refGwp.get(doc.company_id)))
      }
      if (recs.length > 0) { records.push(...recs); continue }
    }

    // Route to the right extractor.
    let extracted: Record<string, number | null> = {}
    let route = ''
    let confidence: Conf = 'medium'
    if (doc.document_type === 'public_disclosure' && isPublicDisclosureForm(text)) {
      const std = extractDisclosure(text)
      if (std && Object.values(std).some((v) => v != null)) { extracted = std; route = 'extractDisclosure (NL-form, %/**)' }
      else { extracted = extractCareDisclosure(text); route = 'Care decimal NL-form path' }
      confidence = 'high'
    } else {
      extracted = sanitiseQuarterly(extractByPatterns(text, QUARTERLY_PATTERNS))
      route = 'extractByPatterns + sanitiseQuarterly'
      confidence = PPT_TYPES.has(doc.document_type) ? 'low' : 'medium'
    }

    const usable = Object.entries(extracted).filter(([, v]) => v != null && Number.isFinite(v as number))
    if (usable.length === 0) {
      records.push(failRow('no_metrics_found', 'no recognised metric in document layout', `Layout not matched by ${route}; consider a layout-specific parser or manual capture.`))
      continue
    }

    // Resolve the reporting period (filename first, else the doc's own header).
    const effectivePeriod = isValidPeriod(doc.filing_period) ? doc.filing_period : (extractReportingPeriod(text) ?? doc.filing_period)
    const periodOk = isValidPeriod(effectivePeriod)
    const docRecords: FilingRecord[] = []
    for (const [metric, value] of usable) {
      const raw = value as number
      const { normalized, unit, transformation } = normalizeValue(metric, raw)
      const excerpt = excerptAround(text, METRIC_LABEL[metric] ?? new RegExp(metric, 'i'))
      const san = runSanity(metric, raw, normalized, doc.document_type, refGwp.get(doc.company_id))
      const extraction_status: FilingRecord['extraction_status'] = san.mangled ? 'mangled' : 'extracted'
      const isPpt = PPT_TYPES.has(doc.document_type)
      const eligible = extraction_status === 'extracted' && san.status === 'ok' &&
        (confidence === 'high' || confidence === 'medium') && !isPpt && periodOk

      // Care/Religare guard.
      let targetCompany = doc.company_id
      let sourceCompany = doc.company_id
      if (doc.company_id === 'religare-enterprises') {
        sourceCompany = 'religare-enterprises'
        targetCompany = excerpt && /care\s*health/i.test(excerpt) ? 'care-health' : 'religare-enterprises'
      }

      const notes: string[] = []
      if (isPpt) notes.push('investor PPT: slide text unreliable; needs a slide/table extractor before use')
      if (extraction_status === 'mangled') notes.push('fused-column / mangled extraction; prefer public disclosure / exchange results')
      if (!periodOk) notes.push('period_unclear: reporting period not confirmed from filename or document header')
      if (san.status === 'flagged') notes.push('passed but differs from reference or borderline - review')

      const reason = [san.reason, !periodOk ? 'period_unclear' : ''].filter(Boolean).join('; ')
      docRecords.push({
        company_id: targetCompany, source_company: sourceCompany, metric,
        raw_value: raw,
        normalized_value: extraction_status === 'mangled' || san.status === 'failed' ? null : normalized,
        unit, transformation_used: transformation,
        filing_period: effectivePeriod, period_start: doc.period_start, period_end: doc.period_end,
        document_type: doc.document_type, document_title: doc.document_title, filing_date: doc.filing_date,
        source_url, source_file: doc.source_file, source_description, source_priority_field: urlField,
        raw_excerpt: excerpt, checksum_sha256: doc.checksum_sha256,
        extraction_status, sanity_status: san.status === 'ok' && !periodOk ? 'flagged' : san.status,
        sanity_reason: reason,
        needs_review: san.needs_review || isPpt || !periodOk, eligible_for_excel: eligible,
        suggested_manual_fallback: eligible ? null : fallback,
        parser_notes: notes.join('; '),
        provenance: { source_name: source_description, parser_name: PARSER_NAME, parsed_at: nowIso(), confidence, extraction_route: route },
      })
    }
    // Document-level quarantine: if ANY value is mangled, the table parse is
    // suspect -> block ALL values from this document (accuracy charter, item 4).
    if (docRecords.some((r) => r.extraction_status === 'mangled')) {
      for (const r of docRecords) {
        r.eligible_for_excel = false
        r.needs_review = true
        r.suggested_manual_fallback = fallback
        r.parser_notes = (r.parser_notes ? r.parser_notes + '; ' : '') +
          'document has fused-column/mangled extraction; ALL values quarantined pending a column-aware parser'
      }
    }
    records.push(...docRecords)
  }

  await writeSnapshot('company-filings-snapshot.json', {
    _meta: {
      snapshot_id: 'company-filings-snapshot',
      description: 'Chunk 2A (hardened): metrics extracted from staged official filings, safety-gated. Rich review sidecar; NOT merged into insurer snapshots or the Excel value store.',
      schema_version: '2.0.0',
      dataset: records.some((r) => r.eligible_for_excel) ? 'official' : 'pending',
      unit_convention: 'ratios -> fraction (0.65); solvency -> multiple (3.03x); premiums/PAT -> INR crore. transformation_used recorded per value.',
      governing_objective: 'accuracy > coverage; only eligible_for_excel values may later enter the workbook; every eligible value carries dashboard-ready source proof.',
      parser: PARSER_NAME,
      generated_at: fetched_at,
      docs_parsed: docs.length,
      records: records.length,
      eligible_for_excel: records.filter((r) => r.eligible_for_excel).length,
      blocked: records.filter((r) => !r.eligible_for_excel).length,
    },
    data: records,
  })

  // Summary
  const elig = records.filter((r) => r.eligible_for_excel).length
  console.log(`fetch-company-filings: ${docs.length} docs -> ${records.length} rows (${elig} eligible / ${records.length - elig} blocked)`)
  const byc = new Map<string, { e: number; b: number }>()
  for (const r of records) { const o = byc.get(r.company_id) ?? { e: 0, b: 0 }; if (r.eligible_for_excel) o.e++; else o.b++; byc.set(r.company_id, o) }
  for (const [c, o] of [...byc.entries()].sort()) console.log(`  ${c.padEnd(20)} eligible=${o.e} blocked=${o.b}`)
  if (warnings.length) console.log(`  warnings: ${warnings.length}`)
  return { records, warnings }
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  runCompanyFilings().catch((err) => { console.error(err); process.exitCode = 1 })
}
