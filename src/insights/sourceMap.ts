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

/** Where the "Go to source data" button should land the reader. */
export interface NavTarget {
  page: NavPage
  /** SAHI sub-tab id when page === 'sahi' (e.g. 'profitability'). */
  sahiTab?: string
  /** Company id to highlight on arrival, so the row reads pre-selected. */
  company?: string
}

/** A resolved dashboard location for one insight — what the audit view shows. */
export interface SourceLocation {
  /** Human breadcrumb, e.g. ['SAHI Analysis', 'Profitability', 'Combined ratio']. */
  breadcrumb: string[]
  /** The tab/area leaf, e.g. 'Profitability'. */
  area: string
  /** The specific table/section within the area, e.g. 'Combined ratio'. */
  table: string
  /** Where the jump button navigates. */
  target: NavTarget
  /** How precisely we can point today — we land on the table, not the cell. */
  precision: 'table' | 'section'
  /** Honest one-liner about cell-level mapping (never faked). */
  cellStatus: string
  /** Plain-English provenance, e.g. 'IRDAI statutory filings & annual reports'. */
  provenance: string
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

// ── source resolver ──────────────────────────────────────────────────────────
//
//  A metric-first resolver: the primary evidence metric decides the destination
//  (so a "retail-mix" quality flag lands in Premium & Distribution while a
//  "combined-ratio" quality flag lands in Profitability). Category is the
//  fallback when no metric keyword matches. Both are deterministic.

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

/** The single metric the front leads with — the first evidence row with a value. */
function primaryMetric(ins: Insight): string {
  const stat = ins.evidence.find((e) => e.value != null) ?? ins.evidence[0]
  return stat?.metric ?? ''
}

/** Resolve the dashboard location for an insight. Deterministic; honest about
 *  the fact that we land on the table, not the exact cell. */
export function resolveSource(ins: Insight): SourceLocation {
  const metric = primaryMetric(ins)
  const dest = METRIC_RULES.find((r) => r.test.test(metric))?.dest ?? CATEGORY_DEST[ins.category]

  // Highlight the focal company on arrival (single-name insight), else the first
  // named insurer so a panel-wide read still pre-selects a row.
  const named = ins.affectedInsurers.filter((id) => id !== 'panel')
  const company = named[0]

  return {
    breadcrumb: ['SAHI Analysis', TAB_LABEL[dest.tab] ?? dest.area, dest.table],
    area: dest.area,
    table: dest.table,
    target: { page: 'sahi', sahiTab: dest.tab, company },
    precision: 'table',
    cellStatus: 'Dashboard section available — exact cell mapping pending.',
    provenance: provenancePhrase(ins),
  }
}
