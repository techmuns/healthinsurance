// ---------------------------------------------------------------------------
//  Analysis Builder — registry + scoring for the user-built comparison view.
//
//  The Builder lets the user assemble their own peer comparison from ANY metric
//  already present in the dashboard's canonical `insurers` model. The single
//  source of truth is the BUILDER_METRICS registry below: add a metric here (or
//  it gets added when a new Insurer field is surfaced) and it AUTOMATICALLY
//  appears in the picker, the table, the heatmap and the presets — no UI edit.
//
//  Honesty: every value reads straight from the same model the Scorecard / Table
//  tabs use (no new data source, no new calculation). Missing values stay null
//  and render as an honest "n/a" — never coerced to 0. The heatmap tone is a
//  display-only ranking of the existing numbers, identical in spirit to the
//  peer scorecard's tones.
// ---------------------------------------------------------------------------

import type { Insurer } from '@/data/types'
import valuationSnapshot from '@/data/snapshots/valuation-snapshot.json'
import {
  ANNUAL_PERIODS,
  getBasisNep,
  getBasisProfit,
  getInvestment,
  getInvestmentLeverage,
  getNetWorth,
  type BasisPeriod,
} from '@/data/accountingBasis'

// Latest annual (FY23→FY26) value with data, for the curated dual-basis module
// (net worth, investment book, premium/profit). Companies not tracked there
// resolve to null → honest n/a, never 0.
function latestAnnual(get: (p: BasisPeriod) => number | null): number | null {
  for (let i = ANNUAL_PERIODS.length - 1; i >= 0; i--) {
    const v = get(ANNUAL_PERIODS[i])
    if (v != null) return v
  }
  return null
}

// Listed-insurer valuation multiples (P/E, P/B) from the daily valuation feed.
// The feed is currently pending (no rows) so these resolve to null → honest
// "n/a"; the moment NSE/BSE quotes are ingested the columns light up with no UI
// change. Keyed by company_id, tolerant of a few field-name spellings.
interface ValuationRow { company_id?: string; price_to_earnings?: number | null; price_to_book?: number | null }
const VALUATION_BY_CO = new Map<string, ValuationRow>(
  ((valuationSnapshot.data as ValuationRow[]) ?? [])
    .filter((r) => !!r.company_id)
    .map((r) => [r.company_id as string, r]),
)
function valuationMultiple(i: Insurer, kind: 'pe' | 'pb'): number | null {
  const r = VALUATION_BY_CO.get(i.id)
  if (!r) return null
  const v = kind === 'pe' ? r.price_to_earnings : r.price_to_book
  return typeof v === 'number' && isFinite(v) ? v : null
}

export type BuilderCategory =
  | 'Growth'
  | 'Profitability'
  | 'Capital'
  | 'Distribution'
  | 'Valuation'
  | 'Ownership'
  | 'Management'
  | 'Operations'
  | 'Market Position'

/** Canonical category order for the picker. */
export const BUILDER_CATEGORIES: BuilderCategory[] = [
  'Growth',
  'Profitability',
  'Capital',
  'Distribution',
  'Valuation',
  'Operations',
  'Market Position',
  'Ownership',
  'Management',
]

export type BuilderUnit = '%' | 'pp' | 'x' | 'cr'
/** higher = bigger is better · lower = smaller is better · rich = neutral (richness). */
export type BuilderPolarity = 'higher' | 'lower' | 'rich'

export interface BuilderMetric {
  key: string
  /** Direct Insurer field, OR use `resolve` for values from another snapshot. */
  field?: keyof Insurer
  /** Custom value resolver (e.g. valuation multiples from the valuation feed). */
  resolve?: (i: Insurer) => number | null
  label: string
  category: BuilderCategory
  unit: BuilderUnit
  polarity: BuilderPolarity
  /** Treat as "not available" (render n/a) — missing ≠ zero. */
  naWhen?: (i: Insurer) => boolean
}

// The registry. Every entry maps a numeric Insurer field to a category + display
// rules. New dashboard metrics are wired in here once and surface everywhere.
export const BUILDER_METRICS: BuilderMetric[] = [
  // ── Growth ────────────────────────────────────────────────────────────────
  { key: 'growth', field: 'growth', label: 'GWP Growth', category: 'Growth', unit: '%', polarity: 'higher' },
  { key: 'premiumCollection', field: 'premiumCollection', label: 'GWP (₹ Cr)', category: 'Growth', unit: 'cr', polarity: 'higher' },
  { key: 'nep', resolve: (i) => latestAnnual((p) => getBasisNep(i.id, p)), label: 'Net Earned Premium (₹ Cr)', category: 'Growth', unit: 'cr', polarity: 'higher' },

  // ── Profitability ─────────────────────────────────────────────────────────
  { key: 'combinedRatio', field: 'combinedRatio', label: 'Combined Ratio', category: 'Profitability', unit: '%', polarity: 'lower', naWhen: (i) => i.combinedRatio === 0 },
  { key: 'claimsRatio', resolve: (i) => latestAnnual((p) => getBasisProfit(i.id, 'igaap', p)?.claimsRatio ?? null), label: 'Claims Ratio', category: 'Profitability', unit: '%', polarity: 'lower' },
  { key: 'expenseRatio', resolve: (i) => latestAnnual((p) => getBasisProfit(i.id, 'igaap', p)?.expenseRatio ?? null), label: 'Expense Ratio', category: 'Profitability', unit: '%', polarity: 'lower' },
  { key: 'margin', field: 'margin', label: 'Underwriting Margin', category: 'Profitability', unit: '%', polarity: 'higher', naWhen: (i) => i.margin === 0 },
  { key: 'pat', resolve: (i) => latestAnnual((p) => getBasisProfit(i.id, 'igaap', p)?.pat ?? null), label: 'Profit After Tax (₹ Cr)', category: 'Profitability', unit: 'cr', polarity: 'higher' },
  { key: 'roe', field: 'roe', label: 'Return on Equity', category: 'Profitability', unit: '%', polarity: 'higher' },

  // ── Capital ───────────────────────────────────────────────────────────────
  { key: 'solvency', field: 'solvency', label: 'Solvency Ratio', category: 'Capital', unit: 'x', polarity: 'higher' },
  { key: 'netWorth', resolve: (i) => latestAnnual((p) => getNetWorth(i.id, p)), label: 'Net Worth (₹ Cr)', category: 'Capital', unit: 'cr', polarity: 'higher' },
  { key: 'investmentAum', resolve: (i) => latestAnnual((p) => getInvestment(i.id, p)?.aum ?? null), label: 'Investment AUM (₹ Cr)', category: 'Capital', unit: 'cr', polarity: 'higher' },
  { key: 'investmentYield', resolve: (i) => latestAnnual((p) => getInvestment(i.id, p)?.yield ?? null), label: 'Investment Yield', category: 'Capital', unit: '%', polarity: 'higher' },
  { key: 'investmentLeverage', resolve: (i) => latestAnnual((p) => getInvestmentLeverage(i.id, p)), label: 'Investment Leverage', category: 'Capital', unit: 'x', polarity: 'higher' },

  // ── Distribution ──────────────────────────────────────────────────────────
  { key: 'retailMix', field: 'retailMix', label: 'Retail Mix', category: 'Distribution', unit: '%', polarity: 'higher', naWhen: (i) => i.retailMix === 0 },
  { key: 'renewalRate', field: 'renewalRate', label: 'Renewal Rate', category: 'Distribution', unit: '%', polarity: 'higher', naWhen: (i) => i.renewalRate === 0 },

  // ── Valuation ─────────────────────────────────────────────────────────────
  { key: 'pe', resolve: (i) => valuationMultiple(i, 'pe'), label: 'Price / Earnings', category: 'Valuation', unit: 'x', polarity: 'rich' },
  { key: 'pb', resolve: (i) => valuationMultiple(i, 'pb'), label: 'Price / Book Value', category: 'Valuation', unit: 'x', polarity: 'rich' },
  { key: 'valuation', field: 'valuation', label: 'Price / GWP', category: 'Valuation', unit: 'x', polarity: 'rich', naWhen: (i) => i.valuation === 0 },

  // ── Operations ────────────────────────────────────────────────────────────
  { key: 'settlementRatio', field: 'settlementRatio', label: 'Claims Settlement Ratio', category: 'Operations', unit: '%', polarity: 'higher', naWhen: (i) => i.settlementRatio === 0 },
  { key: 'customerRetention', field: 'customerRetention', label: 'Customer Retention', category: 'Operations', unit: '%', polarity: 'higher', naWhen: (i) => i.customerRetention === 0 },

  // ── Market Position ───────────────────────────────────────────────────────
  { key: 'marketShare', field: 'marketShare', label: 'Market Share', category: 'Market Position', unit: '%', polarity: 'higher' },
  { key: 'marketShareChange', field: 'marketShareChange', label: 'Market-Share Gain', category: 'Market Position', unit: 'pp', polarity: 'higher' },
]

const BY_KEY = new Map(BUILDER_METRICS.map((m) => [m.key, m]))
export function metricByKey(key: string): BuilderMetric | undefined {
  return BY_KEY.get(key)
}

/** Categories that currently carry at least one metric, in canonical order. */
export function categoriesWithMetrics(): { category: BuilderCategory; metrics: BuilderMetric[] }[] {
  return BUILDER_CATEGORIES.map((category) => ({
    category,
    metrics: BUILDER_METRICS.filter((m) => m.category === category),
  })).filter((g) => g.metrics.length > 0)
}

// ── Preset templates — each loads a curated set of existing metric keys ───────
export interface BuilderPreset {
  id: string
  label: string
  description: string
  metricKeys: string[]
}

export const BUILDER_PRESETS: BuilderPreset[] = [
  { id: 'growth-investor', label: 'Growth Investor', description: 'Top-line momentum and share gains', metricKeys: ['growth', 'premiumCollection', 'marketShareChange', 'retailMix'] },
  { id: 'quality-investor', label: 'Quality Investor', description: 'Underwriting discipline and returns', metricKeys: ['combinedRatio', 'roe', 'settlementRatio'] },
  { id: 'valuation-investor', label: 'Valuation Investor', description: 'What you pay vs the quality you get', metricKeys: ['valuation', 'roe', 'growth'] },
  { id: 'capital-strength', label: 'Capital Strength', description: 'Balance-sheet cushion and returns', metricKeys: ['solvency', 'roe', 'combinedRatio'] },
  { id: 'management-quality', label: 'Management Quality', description: 'Execution outcomes management controls', metricKeys: ['roe', 'combinedRatio', 'marketShareChange'] },
  { id: 'distribution-strength', label: 'Distribution Strength', description: 'Channel mix and book stickiness', metricKeys: ['retailMix', 'renewalRate', 'premiumCollection'] },
]

// ── Values + formatting ───────────────────────────────────────────────────────
export function valueFor(i: Insurer, m: BuilderMetric): number | null {
  if (m.naWhen?.(i)) return null
  if (m.resolve) return m.resolve(i)
  const v = m.field ? i[m.field] : null
  return typeof v === 'number' && isFinite(v) ? v : null
}

export function formatMetricValue(m: BuilderMetric, v: number | null): string {
  if (v == null) return 'n/a'
  switch (m.unit) {
    case 'x':
      return `${v.toFixed(2)}x`
    case 'pp':
      return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}pp`
    case 'cr':
      return `₹${Math.round(v).toLocaleString('en-IN')} Cr`
    default:
      return `${v.toFixed(1)}%`
  }
}

// ── Heatmap tone — display-only ranking of the existing column values ─────────
export type HeatTone = 'best' | 'strong' | 'neutral' | 'weak' | 'poor' | 'na'

/**
 * Classify one value against the column's other (non-null) values. `rich`
 * metrics (valuation) are intentionally neutral — richness isn't strength.
 */
export function columnTone(m: BuilderMetric, value: number | null, values: number[]): HeatTone {
  if (value == null) return 'na'
  if (m.polarity === 'rich') return 'neutral'
  const n = values.length
  if (n <= 1) return 'neutral'
  // best first (lower-is-better metrics ascend, the rest descend)
  const sorted = [...values].sort((a, b) => (m.polarity === 'lower' ? a - b : b - a))
  const rank = sorted.indexOf(value) // 0 = best
  const p = rank / (n - 1)
  if (p === 0) return 'best'
  if (p <= 0.25) return 'strong'
  if (p <= 0.5) return 'neutral'
  if (p <= 0.75) return 'weak'
  return 'poor'
}

/** Default sort direction so the BEST value sits on top for a metric. */
export function bestFirstDir(m: BuilderMetric): 'asc' | 'desc' {
  return m.polarity === 'lower' ? 'asc' : 'desc'
}
