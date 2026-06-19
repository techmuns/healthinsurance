// ---------------------------------------------------------------------------
//  Insights — SOURCE MAP & FRESHNESS (display-only, deterministic).
//
//  This module makes every insight *auditable from the card*: it answers
//  "where in the dashboard does this number live?" and "how fresh is it?" —
//  purely from fields already present on the committed insight (category,
//  evidence metrics, periods, provenance layers).
//
//  It NEVER fabricates a value or a period. It only:
//    • maps an insight to the dashboard tab/table it was drawn from, so the
//      card can offer a real "Go to source data" jump (section-level when a
//      finer cell anchor isn't wired — and it says so honestly), and
//    • reads the *actual* latest period the insight uses and labels it (FY26
//      when the insight genuinely uses FY26; FY25 when FY25 is the latest
//      source-backed value it has — never silently upgraded).
//
//  No scraper, generation, signal or audit-table logic is touched here.
// ---------------------------------------------------------------------------

import type { Insight, InsightCategory, ProvenanceLayer } from './types'

/** The dashboard's top-level pages (mirrors HeaderSwitcher's TopPage, kept local
 *  so this display map doesn't import a component). */
export type NavPage = 'industry' | 'sahi' | 'audit' | 'insights'

/** How precisely an insight maps onto the Data Audit verification layer. */
export type AuditMappingStatus = 'exact_cell' | 'audit_row' | 'chart_fallback' | 'pending'

/** A Data-Audit landing target — the company/metric/year cell to verify against. */
export interface AuditFocus {
  company?: string // audit company id
  companyLabel?: string
  metricKey?: string // AUDIT_METRICS key
  metricLabel?: string // audit metric label
  year?: string // FY label (audit column)
  valueLabel?: string // formatted value used by the insight
  status: AuditMappingStatus
}

/** Where the "Go to source" button should land the reader. Data-Audit first
 *  (the real verification layer); the chart is only the fallback. */
export interface NavTarget {
  page: NavPage
  /** SAHI sub-tab id when page === 'sahi' (e.g. 'profitability'). */
  sahiTab?: string
  /** Company id to highlight on arrival, so the row reads pre-selected. */
  company?: string
  /** Data-Audit focus when page === 'audit'. */
  audit?: AuditFocus
}

/** A compact, pre-navigation read of the data behind an insight. */
export interface SourcePreview {
  metric: string
  companyLabel: string
  period: string
  valueLabel: string
  sourceType: string // 'Annual Report' / 'IRDAI filing' / 'Broker report' / …
  confidence: 'High' | 'Medium' | 'Low' | 'Pending'
  auditStatus: AuditMappingStatus
  auditStatusLabel: string // 'Exact audit cell available' / 'Audit row available' / …
}

/** A resolved location for one insight — what the audit view shows + jumps to. */
export interface SourceLocation {
  /** Human breadcrumb, e.g. ['Data Audit', 'Combined ratio', 'FY25']. */
  breadcrumb: string[]
  /** The tab/area leaf, e.g. 'Data Audit' or 'Profitability'. */
  area: string
  /** The specific table/section within the area. */
  table: string
  /** Where the jump button navigates. */
  target: NavTarget
  /** How precisely we can point. */
  precision: 'cell' | 'table' | 'section'
  /** Honest one-liner about cell-level mapping (never faked). */
  cellStatus: string
  /** Plain-English provenance, e.g. 'IRDAI statutory filings & annual reports'. */
  provenance: string
  /** The action label — 'Go to Data Audit' when audit-mapped, else 'Go to Chart'. */
  buttonLabel: string
  /** The audit-mapping status (drives the preview + button). */
  auditStatus: AuditMappingStatus
  /** The compact data read shown before navigation. */
  preview: SourcePreview
}

// ── period ranking & freshness ───────────────────────────────────────────────

/** Numeric recency rank for a period label. Higher = more recent.
 *  FY26 → 26 ; FY25 → 25 ; a Q4 FYxx print ranks just under the full FYxx year
 *  (the audited annual is the canonical full-year figure). Unknown → -1. */
export function periodRank(period: string): number {
  const fy = period.match(/FY\s?(\d{2})/i)
  if (!fy) return -1
  const year = Number(fy[1])
  const q = period.match(/Q\s?([1-4])/i)
  return q ? year - 0.5 + Number(q[1]) / 10 : year
}

/** The most recent period the insight actually uses (across its evidence). */
export function latestPeriodOf(ins: Insight): string {
  const periods = ins.evidence.map((e) => e.period).filter(Boolean)
  if (periods.length === 0) return ins.chart?.period ?? ''
  return periods.reduce((best, p) => (periodRank(p) > periodRank(best) ? p : best), periods[0])
}

/** The most recent period present anywhere across the supplied insights. */
export function latestPeriodAcross(insights: Insight[]): string {
  return insights
    .map(latestPeriodOf)
    .filter(Boolean)
    .reduce((best, p) => (periodRank(p) > periodRank(best) ? p : best), 'FY25')
}

export interface Freshness {
  /** The actual latest period the insight is built on (e.g. 'FY26' or 'FY25'). */
  period: string
  /** True when that equals the newest period available across the run. */
  isLatest: boolean
  /** Compact chip text for the card front, e.g. 'Based on FY26 data'. */
  shortLabel: string
  /** Honest, fuller sentence for the audit view. */
  detail: string
  tone: 'fresh' | 'older'
}

/**
 * Honest freshness read for one insight, compared against the run's newest
 * period. Never claims a newer figure exists for *this* metric — only states the
 * basis it actually uses and, when that trails the run, says so plainly.
 */
export function freshnessOf(ins: Insight, panelLatest: string): Freshness {
  const period = latestPeriodOf(ins)
  const isLatest = periodRank(period) >= periodRank(panelLatest)
  return {
    period,
    isLatest,
    shortLabel: `Based on ${period} data`,
    detail: isLatest
      ? `Built on ${period} — the latest period in this run.`
      : `Built on ${period}: the latest source-backed value for this metric. A newer period (${panelLatest}) exists elsewhere in the dashboard but isn't reflected in this insight yet.`,
    tone: isLatest ? 'fresh' : 'older',
  }
}

// ── provenance phrasing ──────────────────────────────────────────────────────

const LAYER_PHRASE: Record<ProvenanceLayer, string> = {
  statutory: 'IRDAI statutory filings',
  annual_report: 'annual reports',
  ifrs: 'IFRS accounts',
  broker: 'broker notes',
  aggregator: 'market aggregators',
  exchange: 'exchange data',
  derived: 'derived metrics',
  manual: 'curated filings',
}

/** Plain-English provenance from the evidence layers (deduped, up to 3). */
export function provenancePhrase(ins: Insight): string {
  const words = [...new Set(ins.evidence.flatMap((e) => e.layers).map((l) => LAYER_PHRASE[l]))].filter(Boolean)
  if (words.length === 0) return 'dashboard data'
  const shown = words.slice(0, 3)
  return shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} & ${shown[shown.length - 1]}`
}

// ── the primary stat + plain labels ──────────────────────────────────────────

const COMPANY_LABEL: Record<string, string> = {
  'niva-bupa': 'Niva Bupa', 'star-health': 'Star Health', 'care-health': 'Care Health',
  'aditya-birla': 'Aditya Birla', 'manipalcigna': 'ManipalCigna', panel: 'Across the panel',
}
const pretty = (id?: string) => (id ? COMPANY_LABEL[id] ?? id : '—')
const fmtVal = (v: number | null | undefined, unit?: string): string =>
  v == null ? 'n/a' : unit === 'x' ? `${v}x` : unit === '%' || unit === 'pp' ? `${v}${unit}` : `${v} ${unit ?? ''}`.trim()

/** The evidence row the front leads with — the first with a value, else the first. */
function primaryStat(ins: Insight) {
  return ins.evidence.find((e) => e.value != null) ?? ins.evidence[0]
}
const primaryMetric = (ins: Insight): string => primaryStat(ins)?.metric ?? ''

const SOURCE_TYPE: Record<ProvenanceLayer, string> = {
  statutory: 'IRDAI filing', annual_report: 'Annual Report', ifrs: 'IFRS / Ind AS accounts',
  broker: 'Broker report', aggregator: 'Market aggregator', exchange: 'Exchange data',
  derived: 'Derived metric', manual: 'Curated filing',
}
const sourceTypeOf = (layers?: ProvenanceLayer[]): string => (layers && layers[0] ? SOURCE_TYPE[layers[0]] : 'Source pending')
const confidenceOf = (layers?: ProvenanceLayer[]): SourcePreview['confidence'] => {
  const l = layers?.[0]
  if (!l) return 'Pending'
  if (l === 'statutory' || l === 'annual_report' || l === 'ifrs' || l === 'exchange') return 'High'
  if (l === 'derived') return 'Low'
  return 'Medium'
}

// ── Data-Audit mapping ───────────────────────────────────────────────────────
//
//  Mirrors the Data Audit grid taxonomy (AUDIT_COMPANIES / AUDIT_YEARS /
//  AUDIT_METRICS in src/lib/auditGrid.ts) as light constants, so the insight tab
//  can route to the verification layer WITHOUT pulling the heavy audit index into
//  its bundle. Keep in sync if the audit metric set changes.

const AUDIT_COMPANY_IDS = new Set(['niva-bupa', 'star-health', 'care-health', 'aditya-birla', 'manipalcigna'])
const AUDIT_YEARS = new Set(['FY22', 'FY23', 'FY24', 'FY25', 'FY26'])
const AUDIT_METRIC_RULES: { test: RegExp; key: string; label: string }[] = [
  { test: /combined ratio/i, key: 'combined_ratio_igaap', label: 'Combined ratio' },
  { test: /solvency/i, key: 'solvency_ratio', label: 'Solvency ratio' },
  { test: /claims ratio/i, key: 'claims_ratio_igaap', label: 'Claims ratio (IGAAP)' },
  { test: /expense ratio/i, key: 'expense_ratio_igaap', label: 'Expense ratio' },
  { test: /commission ratio/i, key: 'commission_ratio_igaap', label: 'Commission ratio' },
  { test: /retail health (share|market share)|retail.*market share/i, key: 'retail_health_market_share', label: 'Retail health share' },
  { test: /overall health (share|market share)/i, key: 'overall_health_market_share', label: 'Overall health share' },
  { test: /segment share/i, key: 'sahi_segment_share', label: 'SAHI segment share' },
  { test: /total gwp|gross written/i, key: 'total_gwp', label: 'Total GWP' },
  { test: /\bnwp\b|net written/i, key: 'nwp', label: 'Net written premium (NWP)' },
  { test: /\bnep\b|net earned/i, key: 'nep', label: 'Net earned premium (NEP)' },
  { test: /\bpat\b|profit after tax/i, key: 'pat_igaap', label: 'PAT (IGAAP)' },
  { test: /net worth/i, key: 'net_worth_ifrs', label: 'Net worth' },
  { test: /settlement/i, key: 'settlement_ratio', label: 'Claim settlement ratio' },
  { test: /renewal/i, key: 'renewal_rate', label: 'Renewal rate' },
  { test: /retention/i, key: 'customer_retention', label: 'Customer retention' },
]

const AUDIT_STATUS_LABEL: Record<AuditMappingStatus, string> = {
  exact_cell: 'Exact audit cell available',
  audit_row: 'Audit row available',
  chart_fallback: 'Chart fallback only',
  pending: 'Source mapping pending',
}

/** Map an insight onto the Data Audit grid (company × metric × year). The richest
 *  precision wins: an exact cell when company + metric + year all resolve; an
 *  audit row when only the metric resolves; a chart fallback when the metric
 *  isn't in the audit set (valuation / analyst-coverage); pending when no data. */
export function resolveAuditTarget(ins: Insight): AuditFocus {
  const stat = primaryStat(ins)
  if (!stat) return { status: 'pending' }
  const rule = AUDIT_METRIC_RULES.find((r) => r.test.test(stat.metric))
  const company = AUDIT_COMPANY_IDS.has(stat.insurer) ? stat.insurer : undefined
  const year = AUDIT_YEARS.has(stat.period) ? stat.period : undefined
  const valueLabel = fmtVal(stat.value, stat.unit)
  if (!rule) return { status: 'chart_fallback', company, companyLabel: pretty(stat.insurer), valueLabel }
  const status: AuditMappingStatus = company && year ? 'exact_cell' : 'audit_row'
  return { status, company, companyLabel: pretty(stat.insurer), metricKey: rule.key, metricLabel: rule.label, year, valueLabel }
}

/** The compact data read shown on the back BEFORE the user navigates. */
export function buildSourcePreview(ins: Insight): SourcePreview {
  const stat = primaryStat(ins)
  const audit = resolveAuditTarget(ins)
  return {
    metric: stat?.metric ?? '—',
    companyLabel: pretty(stat?.insurer),
    period: stat?.period ?? '—',
    valueLabel: fmtVal(stat?.value, stat?.unit),
    sourceType: sourceTypeOf(stat?.layers),
    confidence: confidenceOf(stat?.layers),
    auditStatus: audit.status,
    auditStatusLabel: AUDIT_STATUS_LABEL[audit.status],
  }
}

// ── chart fallback resolver (when the metric isn't in the Data Audit set) ──────

interface Dest { tab: string; area: string; table: string }

const TAB_LABEL: Record<string, string> = {
  companies: 'Companies',
  distribution: 'Premium & Distribution',
  profitability: 'Profitability',
  valuation: 'Valuation',
  'street-view': 'Street View',
  governance: 'Governance',
  'sector-news': 'Key Sectoral News',
}

const METRIC_RULES: { test: RegExp; dest: Dest }[] = [
  { test: /solvency|capital|raise[- ]?pressure|runway|headroom/i, dest: { tab: 'profitability', area: 'Profitability', table: 'Solvency & capital' } },
  { test: /combined ratio|underwriting|loss ratio|expense ratio/i, dest: { tab: 'profitability', area: 'Profitability', table: 'Combined ratio' } },
  { test: /p\/b|p\s?\/\s?gwp|warranted|\broe\b|cost of equity|\bcoe\b|valuation/i, dest: { tab: 'valuation', area: 'Valuation', table: 'P/B vs ROE' } },
  { test: /retail|group health|\bmix\b|channel|distribution|agency|bancass/i, dest: { tab: 'distribution', area: 'Premium & Distribution', table: 'Retail vs group mix' } },
  { test: /growth|\bgwp\b|premium|\bnwp\b|\bnep\b/i, dest: { tab: 'distribution', area: 'Premium & Distribution', table: 'Premium growth' } },
  { test: /guidance|consensus|target|analyst|coverage|dispersion/i, dest: { tab: 'street-view', area: 'Street View', table: 'Analyst targets & consensus' } },
  { test: /ownership|stake|holding|pledge|promoter|board|management/i, dest: { tab: 'governance', area: 'Governance', table: 'Ownership & management' } },
  { test: /regulat|irdai|policy|reform|sector/i, dest: { tab: 'sector-news', area: 'Key Sectoral News', table: 'Sector developments' } },
]

const CATEGORY_DEST: Record<InsightCategory, Dest> = {
  capital: { tab: 'profitability', area: 'Profitability', table: 'Solvency & capital' },
  earnings_quality: { tab: 'profitability', area: 'Profitability', table: 'Combined ratio' },
  valuation: { tab: 'valuation', area: 'Valuation', table: 'P/B vs ROE' },
  growth: { tab: 'distribution', area: 'Premium & Distribution', table: 'Premium growth' },
  quality: { tab: 'profitability', area: 'Profitability', table: 'Combined ratio' },
  management: { tab: 'street-view', area: 'Street View', table: 'Analyst targets & consensus' },
  regulatory: { tab: 'sector-news', area: 'Key Sectoral News', table: 'Sector developments' },
  market_structure: { tab: 'companies', area: 'Companies', table: 'Peer scoreboard' },
}

/** Resolve where "Go to source" lands — Data Audit first (the verification
 *  layer), the dashboard chart only when the metric isn't audited. Deterministic;
 *  honest about exact-cell vs row vs fallback. */
export function resolveSource(ins: Insight): SourceLocation {
  const audit = resolveAuditTarget(ins)
  const preview = buildSourcePreview(ins)

  // Priority 1 & 2 — Data Audit (exact cell, else the metric row/section).
  if (audit.status === 'exact_cell' || audit.status === 'audit_row') {
    const exact = audit.status === 'exact_cell'
    return {
      breadcrumb: ['Data Audit', audit.metricLabel ?? 'Metric', audit.year ?? audit.companyLabel ?? ''].filter(Boolean) as string[],
      area: 'Data Audit',
      table: audit.metricLabel ?? 'Metric',
      target: { page: 'audit', company: audit.company, audit },
      precision: exact ? 'cell' : 'section',
      cellStatus: exact
        ? 'Exact audit cell available — opens Data Audit at this company, metric and year.'
        : 'Exact audit cell mapping pending — opens the Data Audit metric row to verify.',
      provenance: provenancePhrase(ins),
      buttonLabel: 'Go to Data Audit',
      auditStatus: audit.status,
      preview,
    }
  }

  // Priority 3 — the metric isn't in the Data Audit set; open the dashboard chart.
  const metric = primaryMetric(ins)
  const dest = METRIC_RULES.find((r) => r.test.test(metric))?.dest ?? CATEGORY_DEST[ins.category]
  const named = ins.affectedInsurers.filter((id) => id !== 'panel')
  return {
    breadcrumb: ['SAHI Analysis', TAB_LABEL[dest.tab] ?? dest.area, dest.table],
    area: dest.area,
    table: dest.table,
    target: { page: 'sahi', sahiTab: dest.tab, company: named[0] },
    precision: 'table',
    cellStatus: 'Not in the Data Audit metric set — opens the dashboard chart for this metric.',
    provenance: provenancePhrase(ins),
    buttonLabel: 'Go to Chart',
    auditStatus: 'chart_fallback',
    preview,
  }
}
