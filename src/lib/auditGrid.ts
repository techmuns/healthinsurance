// ---------------------------------------------------------------------------
//  auditGrid — a normalized Company × Fiscal-Year × Metric master grid for the
//  Extracted Data Audit page's "Data Grid" view.
//
//  Unlike the Excel-cell audit (buildAudit), this is a clean, dashboard-shaped
//  grid: one row per (company, year, metric), joined from the real source
//  layers and classified by a strict, honest status ladder.
//
//  Source layers, merged best-first (Step 3 priority + overwrite rules):
//    1. audit-overlay.json        — values staged/approved by the ingest CLI,
//                                    each carrying its own priority + source.
//    2. excel-values.json store   — the Python pipeline's official value store
//                                    (already projected into extracted-data-audit.json).
//    3. sahi-share-history.json    — Niva Bupa DRHP (Redseer) share series, FY22–24.
//    4. insurer-annual-snapshot.json — dashboard data layer (settlement / renewal /
//                                    retention not carried in the value store).
//
//  Honesty rules baked in: real, source-linked values only; a blank never
//  overwrites a sourced value; conflicting non-blank values keep BOTH and flag
//  the cell "Needs review"; missing renders "Missing in source", never 0.
// ---------------------------------------------------------------------------

import auditIndex from '@/data/snapshots/extracted-data-audit.json'
import shareHistory from '@/data/snapshots/sahi-share-history.json'
import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'
import overlay from '@/data/snapshots/audit-overlay.json'

// ── Grid axes ───────────────────────────────────────────────────────────────
export interface CompanyDef {
  id: string
  label: string
}
export const AUDIT_COMPANIES: CompanyDef[] = [
  { id: 'niva-bupa', label: 'Niva Bupa' },
  { id: 'star-health', label: 'Star Health' },
  { id: 'care-health', label: 'Care Health' },
  { id: 'aditya-birla', label: 'Aditya Birla' },
  { id: 'manipalcigna', label: 'ManipalCigna' },
]
export const COMPANY_LABEL: Record<string, string> = Object.fromEntries(
  AUDIT_COMPANIES.map((c) => [c.id, c.label]),
)

export const AUDIT_YEARS = ['FY22', 'FY23', 'FY24', 'FY25'] as const
export type AuditYear = (typeof AUDIT_YEARS)[number]

export type MetricCategory = 'Premium' | 'Profitability' | 'Ratios' | 'Capital' | 'Market share' | 'Quality'
export type DashboardArea = 'Industry Insights' | 'SAHI Analysis' | 'Company-Specific Analysis'

type ShareField = 'segment_share_pct' | 'retail_share_pct' | 'overall_share_pct'

export interface GridMetricDef {
  key: string
  label: string
  category: MetricCategory
  unit: string
  /** Where this metric surfaces on the dashboard (for the wiring-visibility field). */
  usage: DashboardArea[]
  /** Value-store metric key (excel-values.json), when the store carries it. */
  store?: string
  /** SAHI-share-history field, when sourced from the DRHP series (FY22–24). */
  share?: ShareField
  /** insurer-annual-snapshot field, when sourced from the dashboard data layer. */
  annual?: string
}

// The dashboard's metric set — premium, profitability, ratios, capital, share,
// and the quality ratios. No metric here that the app doesn't already use.
export const AUDIT_METRICS: GridMetricDef[] = [
  { key: 'total_gwp', label: 'Total GWP', category: 'Premium', unit: 'INR_cr', usage: ['SAHI Analysis', 'Company-Specific Analysis'], store: 'total_gwp', annual: 'gwp' },
  { key: 'gross_direct_premium', label: 'Gross direct premium (1/n)', category: 'Premium', unit: 'INR_cr', usage: ['SAHI Analysis'], store: 'gross_direct_premium', annual: 'gross_direct_premium' },
  { key: 'nwp', label: 'Net written premium (NWP)', category: 'Premium', unit: 'INR_cr', usage: ['SAHI Analysis'], store: 'nwp', annual: 'nwp' },
  { key: 'nep', label: 'Net earned premium (NEP)', category: 'Premium', unit: 'INR_cr', usage: ['SAHI Analysis'], store: 'nep', annual: 'nep' },
  { key: 'pat_igaap', label: 'PAT (IGAAP)', category: 'Profitability', unit: 'INR_cr', usage: ['SAHI Analysis'], store: 'pat_igaap', annual: 'pat' },
  { key: 'pat_ifrs', label: 'PAT (IFRS / Ind AS)', category: 'Profitability', unit: 'INR_cr', usage: ['SAHI Analysis'], store: 'pat_ifrs' },
  { key: 'claims_ratio_igaap', label: 'Claims ratio (IGAAP)', category: 'Ratios', unit: '%', usage: ['SAHI Analysis', 'Company-Specific Analysis'], store: 'claims_ratio_igaap', annual: 'claims_ratio' },
  { key: 'claims_ratio_ifrs', label: 'Claims ratio (IFRS)', category: 'Ratios', unit: '%', usage: ['SAHI Analysis'], store: 'claims_ratio_ifrs' },
  { key: 'expense_ratio_igaap', label: 'Expense ratio', category: 'Ratios', unit: '%', usage: ['SAHI Analysis'], store: 'expense_ratio_igaap', annual: 'expense_ratio' },
  { key: 'commission_ratio_igaap', label: 'Commission ratio', category: 'Ratios', unit: '%', usage: ['SAHI Analysis'], store: 'commission_ratio_igaap', annual: 'commission_ratio' },
  { key: 'combined_ratio_igaap', label: 'Combined ratio', category: 'Ratios', unit: '%', usage: ['SAHI Analysis', 'Company-Specific Analysis'], store: 'combined_ratio_igaap', annual: 'combined_ratio' },
  { key: 'solvency_ratio', label: 'Solvency ratio', category: 'Capital', unit: 'x', usage: ['SAHI Analysis', 'Company-Specific Analysis'], store: 'solvency_ratio', annual: 'solvency_ratio' },
  { key: 'net_worth_ifrs', label: 'Net worth (IFRS)', category: 'Capital', unit: 'INR_cr', usage: ['SAHI Analysis'], store: 'net_worth_ifrs' },
  { key: 'sahi_segment_share', label: 'SAHI segment share', category: 'Market share', unit: '%', usage: ['SAHI Analysis', 'Company-Specific Analysis'], share: 'segment_share_pct' },
  { key: 'retail_health_market_share', label: 'Retail health share', category: 'Market share', unit: '%', usage: ['Industry Insights', 'SAHI Analysis', 'Company-Specific Analysis'], store: 'retail_health_market_share', share: 'retail_share_pct' },
  { key: 'overall_health_market_share', label: 'Overall health share', category: 'Market share', unit: '%', usage: ['Industry Insights', 'SAHI Analysis', 'Company-Specific Analysis'], store: 'overall_health_market_share', share: 'overall_share_pct' },
  { key: 'settlement_ratio', label: 'Claim settlement ratio', category: 'Quality', unit: '%', usage: ['SAHI Analysis'], annual: 'claims_settlement_ratio' },
  { key: 'renewal_rate', label: 'Renewal rate', category: 'Quality', unit: '%', usage: ['SAHI Analysis'], annual: 'renewal_rate' },
  { key: 'customer_retention', label: 'Customer retention', category: 'Quality', unit: '%', usage: ['SAHI Analysis'], annual: 'customer_retention' },
]
export const METRIC_BY_KEY: Record<string, GridMetricDef> = Object.fromEntries(
  AUDIT_METRICS.map((m) => [m.key, m]),
)

// ── Status ladder (Step 5) ──────────────────────────────────────────────────
export type GridStatus =
  | 'filled'
  | 'missing_in_source'
  | 'source_not_fetched'
  | 'needs_review'
  | 'basis_mismatch'
  | 'superseded'

export interface GridStatusMeta {
  key: GridStatus
  label: string
  tone: 'green' | 'red' | 'amber' | 'navy' | 'grey'
}
export const GRID_STATUS_META: Record<GridStatus, GridStatusMeta> = {
  filled: { key: 'filled', label: 'Filled', tone: 'green' },
  missing_in_source: { key: 'missing_in_source', label: 'Missing in source', tone: 'red' },
  source_not_fetched: { key: 'source_not_fetched', label: 'Source not fetched', tone: 'amber' },
  needs_review: { key: 'needs_review', label: 'Needs review', tone: 'amber' },
  basis_mismatch: { key: 'basis_mismatch', label: 'Basis mismatch', tone: 'navy' },
  superseded: { key: 'superseded', label: 'Superseded', tone: 'grey' },
}

// ── Candidate source value ──────────────────────────────────────────────────
export interface SourceRef {
  value: number | null
  unit: string
  sourceName: string | null
  sourceUrl: string | null
  sourceFile: string | null
  page: string | null
  fetchedAt: string | null
  confidence: string | null
  /** 1 = best (official filing / managed) … 5 = staging only. */
  priority: number
  layer: string
  note: string | null
}

export interface GridCell {
  company: string
  companyLabel: string
  year: string
  metric: string
  metricLabel: string
  category: MetricCategory
  unit: string
  status: GridStatus
  value: number | null
  chosen: SourceRef | null
  /** Other non-blank candidates that disagree (kept, never discarded). */
  competing: SourceRef[]
  usage: DashboardArea[]
  notes: string
}

export interface GridSummary {
  expected: number
  filled: number
  missing: number
  needsReview: number
  conflicts: number
  sourceNotFetched: number
  coverage: number // filled / expected, 0..1
}

export interface GridModel {
  cells: GridCell[]
  summary: GridSummary
}

// ── Raw shapes (loosely typed JSON) ─────────────────────────────────────────
interface StoreEntry {
  entity: string
  metric: string
  period: string
  unit?: string
  normalized_value?: number | string | null
  raw_value?: number | string | null
  source_name?: string | null
  source_url?: string | null
  source_file?: string | null
  fetched_at?: string | null
  confidence?: string | null
  conflict_status?: string | null
  competing_values?: unknown[]
  basis_note?: string | null
  source_layer?: string | null
}
type Store = Record<string, StoreEntry>

interface OverlayEntry {
  value: number | null
  unit?: string
  source_name?: string
  source_url?: string
  source_file?: string
  source_page?: string
  fetched_at?: string
  confidence?: string
  priority?: number
  layer?: string
  note?: string
  superseded?: boolean
}
interface OverlayFile {
  _meta?: Record<string, unknown>
  data?: Record<string, OverlayEntry>
}

interface ShareRow {
  company_id: string
  segment_share_pct?: Record<string, number | null>
  retail_share_pct?: Record<string, number | null>
  overall_share_pct?: Record<string, number | null>
}
interface AnnualRow {
  company_id: string
  fiscal_year: string
  provenance?: { source_name?: string; source_url?: string; source_file?: string; confidence?: string; fetched_at?: string }
  [field: string]: unknown
}

const STORE = (auditIndex as { values?: Store }).values ?? {}
const OVERLAY = ((overlay as OverlayFile).data ?? {}) as Record<string, OverlayEntry>
const SHARE_ROWS = (shareHistory as { data: ShareRow[] }).data
const SHARE_SRC = (shareHistory as { _meta: { source: { source_name: string; source_url: string; fetched_at?: string } } })._meta.source
const ANNUAL_ROWS = (annualSnapshot as { data: AnnualRow[] }).data

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// ── Per-source candidate extractors ─────────────────────────────────────────
function fromOverlay(company: string, metric: string, year: string): SourceRef | null {
  const e = OVERLAY[`${company}::${metric}::${year}`]
  if (!e) return null
  return {
    value: num(e.value),
    unit: e.unit ?? METRIC_BY_KEY[metric]?.unit ?? '',
    sourceName: e.source_name ?? null,
    sourceUrl: e.source_url ?? null,
    sourceFile: e.source_file ?? null,
    page: e.source_page ?? null,
    fetchedAt: e.fetched_at ?? null,
    confidence: e.confidence ?? null,
    priority: e.priority ?? 1,
    layer: e.layer ?? 'overlay',
    note: e.note ?? null,
  }
}

function fromStore(company: string, m: GridMetricDef, year: string): SourceRef | null {
  if (!m.store) return null
  const e = STORE[`${company}::${m.store}::${year}`]
  if (!e) return null
  const conflicted = (e.conflict_status && e.conflict_status !== 'none') || (Array.isArray(e.competing_values) && e.competing_values.length > 0)
  return {
    value: num(e.normalized_value ?? e.raw_value),
    unit: e.unit ?? m.unit,
    sourceName: e.source_name ?? null,
    sourceUrl: e.source_url ?? null,
    sourceFile: e.source_file ?? null,
    page: null,
    fetchedAt: e.fetched_at ?? null,
    confidence: e.confidence ?? null,
    priority: 1,
    layer: e.source_layer ?? 'official_snapshot',
    note: e.basis_note ?? (conflicted ? `Store flagged: ${e.conflict_status}` : null),
  }
}

function fromShare(company: string, m: GridMetricDef, year: string): SourceRef | null {
  if (!m.share) return null
  const row = SHARE_ROWS.find((r) => r.company_id === company)
  const v = num(row?.[m.share]?.[year])
  if (row == null || v == null) return null
  return {
    value: v,
    unit: '%',
    sourceName: SHARE_SRC.source_name,
    sourceUrl: SHARE_SRC.source_url,
    sourceFile: null,
    page: m.share === 'overall_share_pct' ? 'Exhibit 40' : 'Exhibit 41',
    fetchedAt: SHARE_SRC.fetched_at ?? null,
    confidence: 'high',
    priority: 1,
    layer: 'company_filing',
    note: 'Niva Bupa DRHP (Redseer) — premium-share series.',
  }
}

function fromAnnual(company: string, m: GridMetricDef, year: string): SourceRef | null {
  if (!m.annual) return null
  const row = ANNUAL_ROWS.find((r) => r.company_id === company && r.fiscal_year === year)
  const v = num(row?.[m.annual])
  if (row == null || v == null) return null
  return {
    value: v,
    unit: m.unit,
    sourceName: row.provenance?.source_name ?? 'Insurer annual snapshot (dashboard data layer)',
    sourceUrl: row.provenance?.source_url ?? null,
    sourceFile: row.provenance?.source_file ?? null,
    page: null,
    fetchedAt: row.provenance?.fetched_at ?? null,
    confidence: row.provenance?.confidence ?? 'medium',
    priority: 2,
    layer: 'annual_snapshot',
    note: null,
  }
}

/** Two non-null values disagree materially (ratios: >0.1 abs; else >1% rel). */
function materiallyDifferent(a: number, b: number, unit: string): boolean {
  if (unit === '%' || unit === 'x') return Math.abs(a - b) > 0.1
  const denom = Math.max(Math.abs(a), Math.abs(b), 1)
  return Math.abs(a - b) / denom > 0.01
}

function classifyCell(company: string, m: GridMetricDef, year: string): GridCell {
  const base = {
    company,
    companyLabel: COMPANY_LABEL[company] ?? company,
    year,
    metric: m.key,
    metricLabel: m.label,
    category: m.category,
    unit: m.unit,
    usage: m.usage,
  }

  const overlayRef = fromOverlay(company, m.key, year)
  // An overlay entry can explicitly mark a value superseded (kept for the record).
  const overlaySuperseded = OVERLAY[`${company}::${m.key}::${year}`]?.superseded === true

  const candidates = [overlayRef, fromStore(company, m, year), fromShare(company, m, year), fromAnnual(company, m, year)]
    .filter((c): c is SourceRef => c != null && c.value != null)
    .sort((a, b) => a.priority - b.priority)

  if (candidates.length === 0) {
    return { ...base, status: 'missing_in_source', value: null, chosen: null, competing: [], notes: 'Not found in currently fetched public source.' }
  }

  const chosen = candidates[0]
  const competing = candidates.slice(1).filter((c) => c.value != null && materiallyDifferent(c.value, chosen.value as number, m.unit))

  let status: GridStatus = 'filled'
  let notes = chosen.note ?? ''
  if (overlaySuperseded) {
    status = 'superseded'
    notes = notes || 'Superseded by a better source (kept for the record).'
  } else if (chosen.note && /basis[_ ]?mismatch/i.test(chosen.note)) {
    status = 'basis_mismatch'
  } else if (competing.length > 0) {
    status = 'needs_review'
    notes = `Sources disagree — ${chosen.value} vs ${competing.map((c) => c.value).join(', ')}. Both kept for review.`
  }

  return { ...base, status, value: chosen.value, chosen, competing, notes }
}

export function buildAuditGrid(): GridModel {
  const cells: GridCell[] = []
  for (const c of AUDIT_COMPANIES) {
    for (const y of AUDIT_YEARS) {
      for (const m of AUDIT_METRICS) {
        cells.push(classifyCell(c.id, m, y))
      }
    }
  }
  const filled = cells.filter((c) => c.status === 'filled' || c.status === 'basis_mismatch').length
  const missing = cells.filter((c) => c.status === 'missing_in_source' || c.status === 'source_not_fetched').length
  const needsReview = cells.filter((c) => c.status === 'needs_review').length
  const conflicts = cells.filter((c) => c.competing.length > 0).length
  const summary: GridSummary = {
    expected: cells.length,
    filled,
    missing,
    needsReview,
    conflicts,
    sourceNotFetched: cells.filter((c) => c.status === 'source_not_fetched').length,
    coverage: cells.length ? filled / cells.length : 0,
  }
  return { cells, summary }
}

/** Human display for a grid value (units kept honest; null → em dash handled by UI). */
export function formatGridValue(value: number | null, unit: string): string {
  if (value == null) return '—'
  if (unit === '%') return `${value.toFixed(1)}%`
  if (unit === 'x') return `${value.toFixed(2)}x`
  if (unit === 'INR_cr') return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`
  return `${value}`
}
