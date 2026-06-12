// ---------------------------------------------------------------------------
//  extractedDataAudit — the read model behind the "Extracted Data Audit" tab.
//
//  This is a QA surface, not an analysis surface. Its job is to let a reviewer
//  confirm, cell by cell, that every value the Excel/source template expects is
//  fetched, normalized, source-linked and routed into the dashboard correctly.
//
//  SINGLE SOURCE OF TRUTH: it reads the SAME normalized pipeline the dashboard
//  is built from — `extracted-data-audit.json` is a compact projection of
//  schema-map.json (the cell contract) + data/processed/excel-values.json (the
//  normalized value store) + held-back + blocked-filings, produced by
//  scripts/excel/build_audit_index.py. No number is re-sourced or re-derived
//  here; this module only JOINS the binding (what the template expects) to the
//  value (what was extracted) and classifies the result, mirroring the
//  Fetched / Missing / Blocked semantics of scripts/excel/fill_template.py.
//
//  Honesty rules inherited from the pipeline: missing != zero, official sources
//  first, the template is layout-only, period/basis labels are honest.
// ---------------------------------------------------------------------------

import auditIndex from '@/data/snapshots/extracted-data-audit.json'
import companyMaster from '@/data/snapshots/company-master.json'
import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'
import priceHistory from '@/data/snapshots/price-history-snapshot.json'

// ─── Raw index shapes (as emitted by build_audit_index.py) ──────────────────

interface RawFormulaInput {
  ref: string
  label: string
  sheet?: string
  entity?: string
  metric?: string
  period?: string
}

interface RawBindingCell {
  cell: string
  section?: string
  entity?: string
  metric?: string
  period?: string
  period_type?: string
  unit?: string
  cell_kind?: string
  fillable?: boolean
  source_key?: string
  source_status?: string
  /** Curated reason for a genuinely not-applicable cell (insurer not operating). */
  na_reason?: string
  /** Computed (formula) cells only: the recipe + where each number comes from. */
  formula?: string
  calc?: string
  inputs?: RawFormulaInput[]
  /** Value worked out from our source data — only when every input is present. */
  calculated_value?: number
}

interface RawSheet {
  sheet: string
  role: string
  dimensions?: string
  computed_cells?: number
  cells: RawBindingCell[]
}

interface RawValue {
  entity?: string
  metric?: string
  period?: string
  unit?: string
  raw_value?: number | string | null
  normalized_value?: number | string | null
  transformation_used?: string | null
  source_name?: string | null
  source_url?: string | null
  source_file?: string | null
  fetched_at?: string | null
  filing_date?: string | null
  confidence?: string | null
  source_status?: string | null
  source_layer?: string | null
  priority_rank?: number | null
  document_type?: string | null
  document_title?: string | null
  extraction_status?: string | null
  conflict_status?: string | null
  basis_note?: string | null
  eligible_for_excel?: boolean
}

interface RawHeld {
  company_id?: string
  metric?: string
  filing_period?: string
  raw_value?: number | string | null
  normalized_value?: number | string | null
  unit?: string
  document_type?: string | null
  document_title?: string | null
  filing_date?: string | null
  source_url?: string | null
  source_file?: string | null
  confidence?: string | null
  hold_reason?: string | null
  note?: string | null
}

interface RawBlockedFiling {
  company_id?: string
  metric?: string
  filing_period?: string
  document_type?: string | null
  document_title?: string | null
  raw_value?: number | string | null
  normalized_value?: number | string | null
  unit?: string
  filing_date?: string | null
  source_url?: string | null
  source_file?: string | null
  extraction_status?: string | null
  sanity_status?: string | null
  sanity_reason?: string | null
  parser_notes?: string | null
  suggested_manual_fallback?: string | null
}

interface RawIndex {
  _meta: {
    template_file?: string
    template_sha256?: string
    last_updated?: string | null
    generated_at?: string
    source_policy?: string
    counts?: Record<string, number>
  }
  sources: Record<string, { primary_source?: string; primary_url?: string; status?: string }>
  sheets: RawSheet[]
  values: Record<string, RawValue>
  held_back: RawHeld[]
  blocked_filings: RawBlockedFiling[]
}

const INDEX = auditIndex as unknown as RawIndex

// ── Historical Stock Movement (market_quote) values ─────────────────────────
// The price-history snapshot is the single source of truth for daily stock
// movement (Yahoo Finance keeps it current; the workbook seeds listing→Jul-25).
// Project it into the audit value store so the market_quote cells fill honestly:
// close_price + traded_quantity are source-backed; deliverable_quantity is real
// only where the workbook/NSE carries it and stays absent (never 0) on the days
// only Yahoo covers. Keyed exactly like the template binding (entity::metric::date).
interface RawPriceRow {
  company_id: string
  date: string
  close: number | null
  traded_qty: number | null
  deliverable_qty: number | null
  provenance?: { source_name?: string; source_url?: string; source_file?: string; fetched_at?: string; confidence?: string }
}
const MARKET_VALUES: Record<string, RawValue> = (() => {
  const out: Record<string, RawValue> = {}
  const rows = (priceHistory as unknown as { data?: RawPriceRow[] }).data ?? []
  for (const r of rows) {
    const p = r.provenance ?? {}
    const put = (metric: string, value: number | null, unit: string) => {
      if (value === null || value === undefined) return
      out[joinKey(r.company_id, metric, r.date)] = {
        entity: r.company_id,
        metric,
        period: r.date,
        unit,
        raw_value: value,
        normalized_value: value,
        source_name: p.source_name ?? 'muns market-data API / Yahoo Finance — daily price history',
        source_url: p.source_url ?? null,
        source_file: p.source_file ?? null,
        fetched_at: p.fetched_at ?? null,
        filing_date: r.date,
        confidence: p.confidence ?? 'high',
      }
    }
    put('close_price', r.close, 'INR')
    put('traded_quantity', r.traded_qty, 'shares')
    put('deliverable_quantity', r.deliverable_qty, 'shares')
  }
  return out
})()

// ─── Public types ───────────────────────────────────────────────────────────

/** The QA status ladder. The first five are the ones Neha asked to see by name;
 *  `transformed`, `blocked`, `not_applicable` and `unused` are honest extras. */
export type AuditStatus =
  | 'fetched'
  | 'transformed'
  | 'manual_override'
  | 'missing'
  | 'parser_issue'
  | 'source_unavailable'
  | 'web_blocked'
  | 'blocked'
  | 'computed'
  | 'not_applicable'
  | 'not_in_ppt'
  | 'unused'

/** Cell-level QA colour (Neha's legend). `info` = neutral context (unused). */
export type QaColor = 'green' | 'yellow' | 'red' | 'grey' | 'info'

export interface StatusMeta {
  key: AuditStatus
  label: string
  color: QaColor
}

export const STATUS_META: Record<AuditStatus, StatusMeta> = {
  fetched: { key: 'fetched', label: 'Fetched', color: 'green' },
  transformed: { key: 'transformed', label: 'Fetched (unit adjusted)', color: 'yellow' },
  manual_override: { key: 'manual_override', label: 'Typed in by hand', color: 'yellow' },
  missing: { key: 'missing', label: 'Not reachable', color: 'red' },
  parser_issue: { key: 'parser_issue', label: "Couldn't extract", color: 'red' },
  source_unavailable: { key: 'source_unavailable', label: 'Not found', color: 'red' },
  web_blocked: { key: 'web_blocked', label: 'Awaiting source file', color: 'grey' },
  blocked: { key: 'blocked', label: 'On hold', color: 'yellow' },
  computed: { key: 'computed', label: 'Calculated', color: 'info' },
  not_applicable: { key: 'not_applicable', label: 'Not needed here', color: 'grey' },
  not_in_ppt: { key: 'not_in_ppt', label: 'Not found in PPT', color: 'grey' },
  unused: { key: 'unused', label: 'Extra — not used', color: 'info' },
}

/** One operand of a computed cell's formula, traced to its source value. */
export interface FormulaInput {
  ref: string
  label: string
  sheet?: string
  entityLabel?: string
  metricLabel?: string
  period?: string
  /** Source-backed value of this input (null when it isn't itself fetched). */
  value: number | string | null
  unit?: string
  sourceUrl?: string | null
}

export interface AuditCell {
  id: string
  sheet: string
  role: string
  /** 'sahi' = the standalone-health deep-dive (the priority); 'industry' = the
   *  all-company / market context that the dashboard only needs at industry level. */
  scope: 'sahi' | 'industry'
  /** 0 = Niva Bupa (focus), 1 = other SAHI peer, 2 = non-SAHI / segment. */
  companyRank: number
  section: string
  entityId: string
  entityLabel: string
  metricId: string
  metricLabel: string
  period: string
  periodType: string
  cellRef: string
  unit: string
  cellKind: string
  rawValue: number | string | null
  normalizedValue: number | string | null
  transformation: string | null
  sourceName: string | null
  sourceUrl: string | null
  sourceFile: string | null
  /** Source / filing date (the period the document covers, when known). */
  sourceDate: string | null
  /** Last fetched / last updated (ISO). */
  fetchedAt: string | null
  /** Investor-readable dashboard destination for this value. */
  dashboardField: string
  status: AuditStatus
  qaColor: QaColor
  confidence: string | null
  note: string
  /** Computed cells: the Excel formula, a plain "calculation in words", and the
   *  resolved inputs (so a reviewer can see the recipe and replicate it). */
  formula?: string
  calc?: string
  inputs?: FormulaInput[]
  /** The value worked out from our source data (only when every input exists). */
  calculatedValue?: number | null
}

export interface SheetStats {
  total: number
  fetched: number
  transformed: number
  manualOverride: number
  missing: number
  parserIssue: number
  sourceUnavailable: number
  blocked: number
  notApplicable: number
  valuePresent: number
}

export interface AuditGroup {
  key: string
  sheet: string
  role: string
  scope: 'sahi' | 'industry'
  dimensions: string | null
  dashboardSection: string
  computedCells: number
  cells: AuditCell[]
  stats: SheetStats
}

export interface UnusedField {
  id: string
  entityId: string
  entityLabel: string
  metricId: string
  metricLabel: string
  period: string
  unit: string
  normalizedValue: number | string | null
  rawValue: number | string | null
  sourceName: string | null
  sourceUrl: string | null
  fetchedAt: string | null
}

export interface MappingIssue {
  id: string
  entityId: string
  entityLabel: string
  metricId: string
  metricLabel: string
  period: string
  dashboardValue: number | string | null
  reason: string
}

export interface AuditSummary {
  totalExpected: number
  fetched: number
  missing: number
  parserIssues: number
  sourceUnavailable: number
  manualOverride: number
  transformed: number
  blocked: number
  sourceLinked: number
  dashboardMapped: number
  computed: number
  unusedExtracted: number
  mappingIssues: number
}

export interface FilterOptions {
  companies: { id: string; label: string }[]
  periods: string[]
  sourceTypes: { id: string; label: string }[]
  sections: string[]
  statuses: AuditStatus[]
}

export interface AuditModel {
  meta: RawIndex['_meta']
  groups: AuditGroup[]
  unused: UnusedField[]
  mappingIssues: MappingIssue[]
  summary: AuditSummary
  filterOptions: FilterOptions
}

// ─── Label helpers ──────────────────────────────────────────────────────────

const MASTER = (companyMaster as { data: { company_id: string; display_name: string; peer_group?: string }[] }).data
const COMPANY_NAME: Record<string, string> = Object.fromEntries(MASTER.map((c) => [c.company_id, c.display_name]))
const SAHI_SET = new Set(MASTER.filter((c) => c.peer_group === 'SAHI').map((c) => c.company_id))

/** The focal insurer — the template is the Niva Bupa portfolio review. */
export const FOCAL_COMPANY = 'niva-bupa'

/** Sort priority: Niva Bupa first, then other SAHI peers, then everyone else. */
export function companyRank(id: string): number {
  if (id === FOCAL_COMPANY) return 0
  if (SAHI_SET.has(id)) return 1
  return 2
}

// Scope split (kept as a small set so it's trivial to re-tune). The SAHI
// deep-dive is the per-insurer financial comparison; everything else is the
// all-company / market context the dashboard only needs at industry level.
const SAHI_ROLES = new Set(['company_financials'])
export function roleScope(role: string): 'sahi' | 'industry' {
  return SAHI_ROLES.has(role) ? 'sahi' : 'industry'
}

function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim()
}

/** Entity id (company-id or template segment) → readable label. */
export function entityLabel(id: string | undefined): string {
  if (!id) return '—'
  return COMPANY_NAME[id] ?? titleCase(id)
}

const METRIC_LABEL: Record<string, string> = {
  total_gwp: 'Gross Written Premium',
  gross_direct_premium: 'Gross Direct Premium',
  retail_health_gwp: 'Retail Health GWP',
  group_health_gwp: 'Group Health GWP',
  nwp: 'Net Written Premium',
  nep: 'Net Earned Premium',
  pat_igaap: 'Profit After Tax (IGAAP)',
  pat_ifrs: 'Profit After Tax (IFRS)',
  combined_ratio_igaap: 'Combined Ratio',
  claims_ratio_igaap: 'Claims Ratio',
  expense_ratio_igaap: 'Expense Ratio',
  commission_ratio_igaap: 'Commission Ratio',
  solvency_ratio: 'Solvency Ratio',
  net_worth_igaap: 'Net Worth (IGAAP)',
  net_worth_ifrs: 'Net Worth (IFRS)',
  enterprise_value: 'Enterprise Value',
  gi_segment_gross_premium: 'GI Segment Gross Premium',
  market_share: 'Market Share',
  close_price: 'Closing Price',
  market_cap: 'Market Cap',
  gwp: 'GWP',
  pe_ttm: 'P/E (TTM)',
  pe_3yr_avg: '3-Yr Avg P/E',
  price_to_gwp: 'P/GWP',
  pe_igaap: 'P/E (IGAAP)',
  pb_igaap: 'P/B (IGAAP)',
  roe_igaap: 'ROE (IGAAP)',
  pe_ifrs: 'P/E (IFRS)',
  pb_ifrs: 'P/B (IFRS)',
  roe_ifrs: 'ROE (IFRS)',
  pb: 'Price / Book',
}

/** Metric id → readable label (curated where it matters, humanized otherwise). */
export function metricLabel(id: string | undefined): string {
  if (!id) return '—'
  if (id.includes('::')) {
    const [base, sub] = id.split('::')
    return `${metricLabel(base)} · ${titleCase(sub)}`
  }
  if (METRIC_LABEL[id]) return METRIC_LABEL[id]
  return titleCase(id)
    .replace(/\bIgaap\b/i, '(IGAAP)')
    .replace(/\bIfrs\b/i, '(IFRS)')
    .replace(/\bGwp\b/i, 'GWP')
    .replace(/\bNwp\b/i, 'NWP')
    .replace(/\bNep\b/i, 'NEP')
    .replace(/\bPat\b/i, 'PAT')
    .replace(/\bTtm\b/i, 'TTM')
    .replace(/\bYoy\b/i, 'YoY')
}

// ─── Dashboard destination map (role + metric → where the value is used) ─────
// This is the traceability index: it connects each template role/metric to the
// dashboard section that consumes it. It is metadata (a routing table), not a
// re-implementation of any data logic.

const ROLE_SECTION: Record<string, string> = {
  industry_premium: 'Industry Insights · Market structure & GI pool',
  company_premium_quarterly: 'SAHI · Companies / Premium engine',
  company_premium_monthly: 'SAHI · Companies / Premium engine',
  company_financials: 'SAHI · Companies / Profitability',
  valuation: 'SAHI · Valuation',
  shareholding: 'SAHI · Governance / Ownership',
  distribution: 'SAHI · Distribution',
  analyst_coverage: 'SAHI · Street View',
  management_commentary: 'SAHI · Governance / Management',
  sector_news: 'Industry Insights · Sector news (narrative)',
  market_quote: 'SAHI · Valuation / Price history',
}

const PROFIT_METRICS = new Set([
  'pat_igaap', 'pat_ifrs', 'combined_ratio_igaap', 'claims_ratio_igaap',
  'expense_ratio_igaap', 'commission_ratio_igaap', 'solvency_ratio', 'net_worth_igaap',
])
const PREMIUM_METRICS = new Set([
  'total_gwp', 'gross_direct_premium', 'retail_health_gwp', 'group_health_gwp', 'nwp', 'nep',
])

function dashboardField(role: string, metricId: string): string {
  if (role === 'company_financials') {
    if (PROFIT_METRICS.has(metricId)) return 'SAHI · Profitability'
    if (PREMIUM_METRICS.has(metricId)) return 'SAHI · Companies / Premium engine'
    return 'SAHI · Companies'
  }
  return ROLE_SECTION[role] ?? 'SAHI Analysis'
}

/** Friendly source-type label for a template role (the source family filter). */
export function sourceTypeLabel(role: string): string {
  const src = INDEX.sources[role]
  switch (role) {
    case 'industry_premium': return 'IRDAI / GI Council'
    case 'company_premium_quarterly':
    case 'company_premium_monthly': return 'IRDAI / company disclosures'
    case 'company_financials': return 'Company disclosures / annual reports'
    case 'valuation':
    case 'market_quote':
    case 'market_cap':
    case 'valuation_history': return 'Exchange (NSE/BSE) / market data'
    case 'shareholding': return 'Exchange shareholding filings'
    case 'analyst_coverage': return 'Analyst aggregators (backup)'
    case 'distribution': return 'Company reports / IRDAI NL forms'
    case 'management_commentary': return 'Earnings calls / presentations'
    case 'sector_news': return 'Financial press (curated)'
    default: return src?.primary_source ? src.primary_source.split('(')[0].trim() : titleCase(role)
  }
}

// ─── Metric family (snapshot-style id ↔ template id), for held/blocked match ─

const SNAPSHOT_TO_TEMPLATE: Record<string, string> = {
  gwp: 'total_gwp',
  total_gwp: 'total_gwp',
  gross_direct_premium: 'gross_direct_premium',
  nwp: 'nwp',
  nep: 'nep',
  pat: 'pat_igaap',
  pat_igaap: 'pat_igaap',
  combined_ratio: 'combined_ratio_igaap',
  combined_ratio_igaap: 'combined_ratio_igaap',
  claims_ratio: 'claims_ratio_igaap',
  claims_ratio_igaap: 'claims_ratio_igaap',
  expense_ratio: 'expense_ratio_igaap',
  expense_ratio_igaap: 'expense_ratio_igaap',
  solvency_ratio: 'solvency_ratio',
  net_worth: 'net_worth_igaap',
  net_worth_igaap: 'net_worth_igaap',
}

function templateMetric(snapshotMetric: string): string {
  return SNAPSHOT_TO_TEMPLATE[snapshotMetric] ?? snapshotMetric
}

function joinKey(entity: string, metric: string, period: string): string {
  return `${entity}::${metric}::${period}`
}

// ─── Value formatting (by unit) ─────────────────────────────────────────────

export function formatValue(value: number | string | null, unit: string | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string') return value
  const u = (unit ?? '').toLowerCase()
  // Whole-number display: the grid reads as a clean, decision-grade surface (no
  // trailing decimals). The exact figure is never lost — it stays one click away
  // in the cell detail card and in the "As printed" (raw) view. A genuinely small
  // value (|x| < 1, e.g. a 0.4% share) keeps a single decimal so it never
  // collapses to a misleading "0".
  const dp = (v: number) => (Math.abs(v) > 0 && Math.abs(v) < 1 ? 1 : 0)
  if (u === 'inr_cr') {
    return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: dp(value) })} cr`
  }
  if (u === 'fraction' || u === 'ratio') {
    // stored as a fraction (0.92) or ratio (1.05) → show as a percent.
    const pct = value * 100
    return `${pct.toLocaleString('en-IN', { maximumFractionDigits: dp(pct) })}%`
  }
  // Solvency-style multiples keep 2 decimals — rounding 1.85x to "2x" would
  // change the number's meaning.
  if (u === 'x') return `${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}x`
  if (u === 'percent' || u === '%') {
    return `${value.toLocaleString('en-IN', { maximumFractionDigits: dp(value) })}%`
  }
  return value.toLocaleString('en-IN', { maximumFractionDigits: dp(value) })
}

/** Raw value verbatim (what the source printed) — never unit-massaged. */
export function formatRaw(value: number | string | null): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number') return value.toLocaleString('en-IN', { maximumFractionDigits: 6 })
  return value
}

// ─── Status classification (mirrors fill_template.py's join) ────────────────

const MISSING_REASON: Record<string, string> = {
  available: "Not reachable yet — we know the official source, but the site blocks automated pulls (or it hasn't been pulled in).",
  partial: 'Only part of this is available so far.',
  backup: 'Data not found — no official source publishes this number.',
  computed: 'Calculated by the sheet — nothing to fetch.',
  narrative: 'This is a written note, not a number to fetch.',
  excluded_from_core: 'Outside the main data we track.',
}

function numbersDiffer(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > 1e-9
  return a !== b
}

function isManual(entry: RawValue): boolean {
  const layer = entry.source_layer ?? ''
  const ext = entry.extraction_status ?? ''
  return (
    layer === 'annual_report' ||
    layer === 'company_deck' ||
    ext === 'annual_report_transcribed' ||
    ext === 'deck_transcribed' ||
    entry.source_status === 'deck'
  )
}

/** Status + note for any entry that already carries a value (shared by template
 *  cells and the "data we have, no fixed cell" rows). */
function valueStatus(entry: RawValue): { status: AuditStatus; note: string } {
  if (entry.conflict_status === 'conflict_needs_review')
    return { status: 'parser_issue', note: 'Two sources disagree on this number — held back until someone checks.' }
  if (isManual(entry))
    return {
      status: 'manual_override',
      note: entry.basis_note
        ? `Typed in by hand from the report. ${entry.basis_note}`
        : 'Typed in by hand from the report (with the page noted).',
    }
  if (entry.basis_note) return { status: 'transformed', note: entry.basis_note }
  if (numbersDiffer(entry.raw_value, entry.normalized_value))
    return { status: 'transformed', note: 'Tidied up from how the source printed it (e.g. a percentage written as a decimal).' }
  return { status: 'fetched', note: '' }
}

// ─── Build the model ────────────────────────────────────────────────────────

let CACHE: AuditModel | null = null

export function buildAudit(): AuditModel {
  if (CACHE) return CACHE

  const values = INDEX.values
  const boundKeys = new Set<string>()

  // Index held-back + blocked filings by template join key for enrichment.
  const heldByKey = new Map<string, RawHeld>()
  for (const h of INDEX.held_back) {
    if (!h.company_id || !h.metric || !h.filing_period) continue
    heldByKey.set(joinKey(h.company_id, templateMetric(h.metric), h.filing_period), h)
  }
  const blockedByKey = new Map<string, RawBlockedFiling>()
  for (const f of INDEX.blocked_filings) {
    if (!f.company_id || !f.metric || !f.filing_period) continue
    blockedByKey.set(joinKey(f.company_id, templateMetric(f.metric), f.filing_period), f)
  }

  const groups: AuditGroup[] = []

  for (const sheet of INDEX.sheets) {
    const cells: AuditCell[] = []
    for (const b of sheet.cells) {
      const entity = b.entity ?? ''
      const metric = b.metric ?? ''
      const period = b.period ?? ''
      const key = joinKey(entity, metric, period)
      boundKeys.add(key) // every template cell (input, formula or n/a), not only fillable ones
      const entry = values[key] ?? MARKET_VALUES[key]
      const hasValue = !!entry && entry.normalized_value !== null && entry.normalized_value !== undefined
      const held = heldByKey.get(key)
      const blocked = blockedByKey.get(key)

      let status: AuditStatus
      let note = ''
      let sourceName: string | null = null
      let sourceUrl: string | null = null
      let sourceFile: string | null = null
      let fetchedAt: string | null = null
      let sourceDate: string | null = null
      let rawValue: number | string | null = null
      let normalizedValue: number | string | null = null
      let transformation: string | null = null
      let confidence: string | null = null

      if (b.cell_kind === 'input_na') {
        status = 'not_applicable'
        note = "This cell isn't used in the template."
      } else if (hasValue && entry) {
        rawValue = entry.raw_value ?? null
        normalizedValue = entry.normalized_value ?? null
        transformation = entry.transformation_used ?? null
        sourceName = entry.source_name ?? null
        sourceUrl = entry.source_url ?? null
        sourceFile = entry.source_file ?? null
        fetchedAt = entry.fetched_at ?? null
        sourceDate = entry.filing_date ?? period
        confidence = entry.confidence ?? null
        if (entry.conflict_status === 'conflict_needs_review') {
          status = 'parser_issue'
          note = 'Two sources disagree on this number — held back until someone checks.'
        } else if (isManual(entry)) {
          status = 'manual_override'
          note = entry.basis_note
            ? `Typed in by hand from the report. ${entry.basis_note}`
            : 'Typed in by hand from the report (with the page noted).'
        } else if (entry.basis_note) {
          status = 'transformed'
          note = entry.basis_note
        } else if (numbersDiffer(entry.raw_value, entry.normalized_value)) {
          status = 'transformed'
          note = 'Tidied up from how the source printed it (e.g. a percentage written as a decimal).'
        } else {
          status = 'fetched'
          note = ''
        }
        if (b.cell_kind === 'formula') {
          note = note ? `${note} The sheet also calculates it.` : 'We have this number; the sheet also calculates it.'
        }
      } else if (b.cell_kind === 'formula') {
        status = 'computed'
        note = 'Calculated from other cells (for example, claims + expense). Nothing to fetch.'
      } else if (blocked) {
        status = 'parser_issue'
        sourceUrl = blocked.source_url ?? null
        sourceFile = blocked.source_file ?? null
        sourceDate = blocked.filing_date ?? period
        rawValue = blocked.raw_value ?? null
        note = "Couldn't extract — we reached the file, but this number came out garbled, so we left it out."
      } else if (held) {
        status = 'blocked'
        sourceUrl = held.source_url ?? null
        sourceFile = held.source_file ?? null
        sourceDate = held.filing_date ?? period
        rawValue = held.raw_value ?? null
        normalizedValue = null
        confidence = held.confidence ?? null
        note = held.note || 'We found this number but are holding it back for a check.'
      } else if ((b.source_status ?? '') === 'not_applicable') {
        status = 'not_applicable'
        note = b.na_reason ?? 'Not applicable in this period — the insurer was not operating.'
      } else if ((b.source_status ?? '') === 'not_in_ppt') {
        // The company's investor presentations / annual reports were swept
        // page-by-page and do not print this number. Grey, per Neha
        // (2026-06-11); a statutory filing can still fill the cell later.
        status = 'not_in_ppt'
        note = b.na_reason ?? 'Searched the investor presentations — this number is not disclosed there.'
      } else if ((b.source_status ?? '') === 'web_blocked') {
        status = 'web_blocked'
        // A curated per-cell reason (source-blocked-cells.json) explains exactly
        // which filing carries the figure and why the pipeline can't pull it;
        // fall back to the IRDAI-handbook case (the original web_blocked use).
        note = b.na_reason ?? 'IRDAI web blocked — this figure is published in the IRDAI Handbook on Indian Insurance Statistics, but IRDAI blocks automated downloads and the files corrupt in transit via every proxy. It needs a browser-downloaded handbook dropped into data/raw/irdai/ to fill.'
      } else if (sheet.role === 'market_quote' && metric === 'deliverable_quantity') {
        // Deliverable quantity is an NSE-only field; Yahoo (the reachable daily
        // source) doesn't carry it. Honest "not from this source", not a defect.
        status = 'source_unavailable'
        note =
          'Deliverable quantity is an exchange-only field (NSE) — the price feeds (muns / Yahoo) do not carry it. ' +
          'It auto-fills from the daily NSE delivery (MTO) file; this day is only blank if that file is not published yet.'
      } else {
        const ss = b.source_status ?? 'available'
        status = ss === 'backup' || ss === 'excluded_from_core' ? 'source_unavailable' : 'missing'
        note = MISSING_REASON[ss] ?? 'No source value yet.'
      }

      if (!sourceName) sourceName = INDEX.sources[b.source_key ?? '']?.primary_source ?? null
      if (!sourceUrl && status !== 'fetched' && status !== 'transformed' && status !== 'manual_override') {
        sourceUrl = INDEX.sources[b.source_key ?? '']?.primary_url || null
      }

      const inputs = b.inputs?.map<FormulaInput>((inp) => {
        const v = inp.entity && inp.metric && inp.period ? values[joinKey(inp.entity, inp.metric, inp.period)] : undefined
        return {
          ref: inp.ref,
          label: inp.label,
          sheet: inp.sheet,
          entityLabel: inp.entity ? entityLabel(inp.entity) : undefined,
          metricLabel: inp.metric ? metricLabel(inp.metric) : undefined,
          period: inp.period,
          value: v?.normalized_value ?? null,
          unit: v?.unit ?? undefined,
          sourceUrl: v?.source_url ?? null,
        }
      })

      // For a Calculated cell, say plainly whether we can show a number, and if
      // not, exactly which input is still missing.
      if (status === 'computed') {
        if (b.calculated_value != null) {
          note = "Calculated from the cells below — we have all of them, so the number is shown."
        } else {
          const missingLabels = [...new Set(
            (inputs ?? []).filter((i) => i.value === null).map((i) => `${i.label}${i.period ? ` (${i.period})` : ''}`),
          )]
          note = missingLabels.length
            ? `Can't calculate this yet — it needs ${missingLabels.join(' and ')}, which we don't have.`
            : "Calculated from other cells, but some of those aren't available yet."
        }
      }

      cells.push({
        id: `${sheet.sheet}!${b.cell}`,
        sheet: sheet.sheet,
        role: sheet.role,
        scope: roleScope(sheet.role),
        companyRank: companyRank(entity),
        section: b.section ?? '—',
        entityId: entity,
        entityLabel: entityLabel(entity),
        metricId: metric,
        metricLabel: metricLabel(metric),
        period,
        periodType: b.period_type ?? '',
        cellRef: b.cell,
        unit: b.unit ?? entry?.unit ?? '',
        cellKind: b.cell_kind ?? '',
        rawValue,
        normalizedValue,
        transformation,
        sourceName,
        sourceUrl,
        sourceFile,
        sourceDate,
        fetchedAt,
        dashboardField: dashboardField(sheet.role, metric),
        status,
        qaColor: STATUS_META[status].color,
        confidence,
        note,
        formula: b.formula,
        calc: b.calc,
        inputs,
        calculatedValue: b.calculated_value ?? null,
      })
    }

    const stats = tally(cells)
    groups.push({
      key: sheet.sheet,
      sheet: sheet.sheet,
      role: sheet.role,
      scope: roleScope(sheet.role),
      dimensions: sheet.dimensions ?? null,
      dashboardSection: ROLE_SECTION[sheet.role] ?? 'SAHI Analysis',
      computedCells: sheet.computed_cells ?? 0,
      cells,
      stats,
    })
  }

  // ── Include EVERY number we've gathered ───────────────────────────────────
  // Any store value the parsed template didn't pin to a cell is still real
  // pipeline data, so it's added to the coverage as a row (cell shown as "—",
  // since the current template layout has no fixed slot for that period/metric).
  // Nothing is sidelined as "unused".
  const groupBySheet = new Map(groups.map((g) => [g.sheet, g]))
  const metricSheet = new Map<string, string>()
  {
    const counts = new Map<string, Map<string, number>>()
    for (const g of groups)
      for (const c of g.cells) {
        if (!c.metricId) continue
        const m = counts.get(c.metricId) ?? new Map<string, number>()
        m.set(g.sheet, (m.get(g.sheet) ?? 0) + 1)
        counts.set(c.metricId, m)
      }
    for (const [metric, m] of counts)
      metricSheet.set(metric, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0])
  }
  const FALLBACK_SHEET: Record<string, string> = {
    gross_direct_premium: 'SAHIs comparison',
    commission_ratio_igaap: 'SAHIs comparison',
  }
  const placeFor = (metric: string): AuditGroup | null => {
    if (metric.startsWith('channel_')) return groupBySheet.get('Channel Mix') ?? null
    const target = metricSheet.get(metric) ?? FALLBACK_SHEET[metric] ?? 'SAHIs comparison'
    return groupBySheet.get(target) ?? groups[0] ?? null
  }

  const touched = new Set<AuditGroup>()
  for (const [key, entry] of Object.entries(values)) {
    if (boundKeys.has(key)) continue
    if (entry.normalized_value === null || entry.normalized_value === undefined) continue
    const g = placeFor(entry.metric ?? '')
    if (!g) continue
    const { status, note } = valueStatus(entry)
    const ent = entry.entity ?? ''
    g.cells.push({
      id: `extra!${key}`,
      sheet: g.sheet,
      role: g.role,
      scope: g.scope,
      companyRank: companyRank(ent),
      section: 'Data we have (not in the Excel template)',
      entityId: ent,
      entityLabel: entityLabel(ent),
      metricId: entry.metric ?? '',
      metricLabel: metricLabel(entry.metric),
      period: entry.period ?? '',
      periodType: '',
      cellRef: '—',
      unit: entry.unit ?? '',
      cellKind: 'extra',
      rawValue: entry.raw_value ?? null,
      normalizedValue: entry.normalized_value ?? null,
      transformation: entry.transformation_used ?? null,
      sourceName: entry.source_name ?? null,
      sourceUrl: entry.source_url ?? null,
      sourceFile: entry.source_file ?? null,
      sourceDate: entry.filing_date ?? entry.period ?? null,
      fetchedAt: entry.fetched_at ?? null,
      dashboardField: dashboardField(g.role, entry.metric ?? ''),
      status,
      qaColor: STATUS_META[status].color,
      confidence: entry.confidence ?? null,
      note: note
        ? `${note} (This company/period/metric isn't in the Excel template's layout.)`
        : "Data we have — this company/period/metric isn't in the Excel template's layout.",
      calculatedValue: null,
    })
    touched.add(g)
  }
  for (const g of touched) g.stats = tally(g.cells)

  const unused: UnusedField[] = [] // everything is merged into the coverage above

  // ── Mapping issues: a value the dashboard renders but the audit can't trace ─
  // Cross-check the dashboard's canonical annual financial snapshot against the
  // value store. Any non-null dashboard figure with no traced store value is a
  // routing gap the reviewer should see.
  const mappingIssues: MappingIssue[] = []
  const DASH_METRICS = ['gwp', 'nwp', 'nep', 'pat', 'combined_ratio', 'claims_ratio', 'expense_ratio', 'solvency_ratio']
  type AnnualRow = { company_id: string; fiscal_year: string } & Record<string, unknown>
  for (const row of (annualSnapshot as { data: AnnualRow[] }).data) {
    for (const m of DASH_METRICS) {
      const v = row[m]
      if (v === null || v === undefined || typeof v !== 'number') continue
      const tMetric = templateMetric(m)
      const key = joinKey(row.company_id, tMetric, row.fiscal_year)
      const traced = !!values[key] && values[key].normalized_value !== null && values[key].normalized_value !== undefined
      if (!traced) {
        mappingIssues.push({
          id: `${key}#dash`,
          entityId: row.company_id,
          entityLabel: entityLabel(row.company_id),
          metricId: tMetric,
          metricLabel: metricLabel(tMetric),
          period: row.fiscal_year,
          dashboardValue: v,
          reason: "This number shows on the dashboard, but we can't trace where it came from here. Worth a check.",
        })
      }
    }
  }
  mappingIssues.sort((a, b) => a.entityLabel.localeCompare(b.entityLabel) || a.metricId.localeCompare(b.metricId))

  // ── Summary strip ──────────────────────────────────────────────────────
  const allCells = groups.flatMap((g) => g.cells)
  const isExpected = (c: AuditCell) => c.cellKind === 'input' || c.cellKind === 'input_date'
  // Parser issues = every blocked filing + any in-cell source conflict that
  // isn't already one of those blocked filings (so nothing is double-counted).
  const inCellConflicts = allCells.filter(
    (c) => c.status === 'parser_issue' && !blockedByKey.has(joinKey(c.entityId, c.metricId, c.period)),
  ).length
  const summary: AuditSummary = {
    totalExpected: allCells.filter(isExpected).length,
    fetched: allCells.filter((c) => c.status === 'fetched' || c.status === 'transformed' || c.status === 'manual_override').length,
    missing: allCells.filter((c) => c.status === 'missing').length,
    parserIssues: INDEX.blocked_filings.length + inCellConflicts,
    sourceUnavailable: allCells.filter((c) => c.status === 'source_unavailable').length,
    manualOverride: allCells.filter((c) => c.status === 'manual_override').length,
    transformed: allCells.filter((c) => c.status === 'transformed').length,
    blocked: allCells.filter((c) => c.status === 'blocked').length,
    sourceLinked: allCells.filter((c) => !!c.sourceUrl).length,
    dashboardMapped: allCells.filter((c) => isExpected(c) && c.normalizedValue !== null).length,
    computed: groups.reduce((n, g) => n + g.computedCells, 0),
    unusedExtracted: unused.length,
    mappingIssues: mappingIssues.length,
  }

  // ── Filter options ─────────────────────────────────────────────────────
  const companyMap = new Map<string, string>()
  const periodSet = new Set<string>()
  const sectionSet = new Set<string>()
  const sourceTypeMap = new Map<string, string>()
  const statusSet = new Set<AuditStatus>()
  for (const c of allCells) {
    if (c.entityId) companyMap.set(c.entityId, c.entityLabel)
    if (c.period) periodSet.add(c.period)
    sectionSet.add(c.dashboardField)
    sourceTypeMap.set(c.role, sourceTypeLabel(c.role))
    statusSet.add(c.status)
  }
  const filterOptions: FilterOptions = {
    companies: [...companyMap.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)),
    periods: [...periodSet].sort(periodSort),
    sourceTypes: [...sourceTypeMap.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)),
    sections: [...sectionSet].sort(),
    statuses: [...statusSet].sort((a, b) => STATUS_META[a].label.localeCompare(STATUS_META[b].label)),
  }

  CACHE = { meta: INDEX._meta, groups, unused, mappingIssues, summary, filterOptions }
  return CACHE
}

function tally(cells: AuditCell[]): SheetStats {
  const s: SheetStats = {
    total: cells.length, fetched: 0, transformed: 0, manualOverride: 0, missing: 0,
    parserIssue: 0, sourceUnavailable: 0, blocked: 0, notApplicable: 0, valuePresent: 0,
  }
  for (const c of cells) {
    if (c.normalizedValue !== null && c.normalizedValue !== undefined) s.valuePresent++
    switch (c.status) {
      case 'fetched': s.fetched++; break
      case 'transformed': s.transformed++; break
      case 'manual_override': s.manualOverride++; break
      case 'missing': s.missing++; break
      case 'parser_issue': s.parserIssue++; break
      case 'source_unavailable': s.sourceUnavailable++; break
      case 'blocked': s.blocked++; break
      case 'not_applicable': s.notApplicable++; break
      case 'not_in_ppt': s.notApplicable++; break // grey family — searched, not disclosed
      default: break
    }
  }
  return s
}

export interface StripCounts {
  totalExpected: number
  fetched: number
  missing: number
  parserIssues: number
  manualOverride: number
  sourceLinked: number
  dashboardMapped: number
  computed: number
}

/** Summary-strip counts for an arbitrary slice of cells (e.g. one scope). */
export function stripFor(cells: AuditCell[]): StripCounts {
  const expected = (c: AuditCell) => c.cellKind === 'input' || c.cellKind === 'input_date'
  return {
    totalExpected: cells.filter(expected).length,
    fetched: cells.filter((c) => c.status === 'fetched' || c.status === 'transformed' || c.status === 'manual_override').length,
    missing: cells.filter((c) => c.status === 'missing').length,
    parserIssues: cells.filter((c) => c.status === 'parser_issue').length,
    manualOverride: cells.filter((c) => c.status === 'manual_override').length,
    sourceLinked: cells.filter((c) => !!c.sourceUrl).length,
    dashboardMapped: cells.filter((c) => expected(c) && c.normalizedValue !== null).length,
    computed: cells.filter((c) => c.status === 'computed').length,
  }
}

/** Sort period labels: fiscal years, then quarters, then dates, then the rest. */
export function periodSort(a: string, b: string): number {
  const rank = (p: string) => {
    if (/^FY\d/.test(p)) return 1
    if (/FY\d/.test(p)) return 2
    if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return 4
    return 3
  }
  const ra = rank(a)
  const rb = rank(b)
  if (ra !== rb) return ra - rb
  return a.localeCompare(b, undefined, { numeric: true })
}
