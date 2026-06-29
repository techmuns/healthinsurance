// ---------------------------------------------------------------------------
//  Peer Positioning scorecard engine.
//
//  Turns the canonical `insurers` model + the active dashboard filters into a
//  multi-metric peer scorecard: per-metric value, rank WITHIN the selected
//  peer group, peer median, difference vs median, best-in-column flag, a
//  strength tone, and an investor signal. NA-aware (missing ≠ zero) and fully
//  driven by the selected company + peer group, so it works for any selection.
//
//  No fabrication: every value reads from the snapshot-built `insurers` model
//  (company-master + insurer-annual-snapshot) and the daily valuation feed.
//  All source-backed — the page carries a "Source-backed" tag, never mock.
// ---------------------------------------------------------------------------

import { getFilteredInsurers, getHighlightedInsurer } from '@/lib/insurers'
import { lookupProvenance, getAnnualRowProvenance, getValuationProvenance, getMetricRowProvenance, latestRetailMixPoint, getLatestAnnualFyLabel, RETAIL_MIX_SOURCE } from '@/lib/dataLayer'
import { hasBasisData, getBasisProfit, ANNUAL_PERIODS, BASIS_SOURCE_LABEL, type AccountingBasis, type BasisPeriod } from '@/data/accountingBasis'
import type { DashboardFilters, Insurer } from '@/data/types'
import valuationSnapshot from '@/data/snapshots/valuation-snapshot.json'

type FilterInput = Pick<DashboardFilters, 'peerGroup' | 'highlightedCompany'>

/** higher = bigger is better · lower = smaller is better · rich = richness (valuation). */
export type Polarity = 'higher' | 'lower' | 'rich'
export type CellTone = 'leader' | 'strong' | 'neutral' | 'watch' | 'weak' | 'na'
export type SignalKind = 'Strong' | 'Decent' | 'Watch' | 'Weak' | 'Premium' | 'Value' | 'NA'
export type MetricGroup = 'Growth' | 'Quality' | 'Capital' | 'Valuation'

export interface MetricDef {
  key: string
  /** Direct Insurer field, OR use `resolve` for feed-derived values (P/E, P/B). */
  field?: keyof Insurer
  /** Custom value resolver — e.g. valuation multiples read from the daily feed. */
  resolve?: (i: Insurer) => number | null
  label: string
  short: string
  group: MetricGroup
  unit: '%' | 'pp' | 'x'
  polarity: Polarity
  whyItMatters: string
  naWhen?: (i: Insurer) => boolean
}

// Listed-insurer valuation multiples (P/E, P/B) read straight from the daily
// valuation feed. These are kept OUT of the canonical Insurer model (they are
// listed-only and market-driven) — exactly as the Analysis Builder does it.
// Unlisted SAHIs have no market price → null → rendered as an honest "—", never 0.
interface ValuationFeedRow { company_id?: string; price_to_earnings?: number | null; price_to_book?: number | null }
const VALUATION_BY_CO = new Map<string, ValuationFeedRow>(
  ((valuationSnapshot.data as ValuationFeedRow[]) ?? [])
    .filter((r) => !!r.company_id)
    .map((r) => [r.company_id as string, r]),
)
function valuationMultiple(i: Insurer, kind: 'pe' | 'pb'): number | null {
  const r = VALUATION_BY_CO.get(i.id)
  if (!r) return null
  const v = kind === 'pe' ? r.price_to_earnings : r.price_to_book
  return typeof v === 'number' && isFinite(v) ? v : null
}

/** The eight scorecard columns, grouped Growth · Quality · Capital · Valuation. */
export const METRICS: MetricDef[] = [
  {
    key: 'growth', field: 'growth', label: 'GWP Growth', short: 'Growth', group: 'Growth', unit: '%', polarity: 'higher',
    whyItMatters: 'Sustained premium growth builds scale advantage and can unlock operating leverage over time.',
  },
  {
    key: 'retailMix', field: 'retailMix', label: 'Retail Mix', short: 'Retail', group: 'Growth', unit: '%', polarity: 'higher',
    whyItMatters: 'A higher retail mix means more granular, renewable, higher-margin premium versus lumpy group business.',
    naWhen: (i) => i.retailMix === 0,
  },
  {
    key: 'marketShareChange', field: 'marketShareChange', label: 'Share Gain', short: 'Share', group: 'Quality', unit: 'pp', polarity: 'higher',
    whyItMatters: 'Share gains show the company is winning customers faster than the market is growing.',
  },
  {
    key: 'combinedRatio', field: 'combinedRatio', label: 'Combined Ratio', short: 'Combined', group: 'Quality', unit: '%', polarity: 'lower',
    whyItMatters: 'Below 100% means underwriting profit; lower is better and signals pricing + claims discipline.',
    naWhen: (i) => i.combinedRatio === 0,
  },
  {
    key: 'roe', field: 'roe', label: 'ROE', short: 'ROE', group: 'Quality', unit: '%', polarity: 'higher',
    whyItMatters: 'Return on equity shows how well growth converts into shareholder returns — the ultimate quality test.',
    // 0 is the model's "missing" sentinel (no operating insurer reports exactly 0%
    // ROE) — render an honest N/A, never a fake zero that ranks the company last.
    naWhen: (i) => i.roe === 0,
  },
  {
    key: 'solvency', field: 'solvency', label: 'Solvency', short: 'Solvency', group: 'Capital', unit: 'x', polarity: 'higher',
    whyItMatters: 'Solvency above the 1.5x regulatory floor is the cushion that lets a company grow safely without raising equity.',
    // 0 = missing (regulatory floor is 1.5x; a real reading is never 0) → N/A, not zero.
    naWhen: (i) => i.solvency === 0,
  },
  {
    key: 'priceToEarnings', resolve: (i) => valuationMultiple(i, 'pe'), label: 'P/E', short: 'P/E', group: 'Valuation', unit: 'x', polarity: 'rich',
    whyItMatters: 'Price-to-earnings (market price ÷ trailing profit) is the classic richness gauge — how many years of current profit the market is paying for. Listed, profitable insurers only.',
    naWhen: (i) => valuationMultiple(i, 'pe') == null,
  },
  {
    key: 'priceToBook', resolve: (i) => valuationMultiple(i, 'pb'), label: 'P/B', short: 'P/B', group: 'Valuation', unit: 'x', polarity: 'rich',
    whyItMatters: 'Price-to-book (market price ÷ net worth) shows the premium over the capital base — for insurers it ties straight to ROE: a richer P/B has to be earned with a higher return on equity.',
    naWhen: (i) => valuationMultiple(i, 'pb') == null,
  },
  {
    key: 'valuation', field: 'valuation', label: 'P/GWP', short: 'P/GWP', group: 'Valuation', unit: 'x', polarity: 'rich',
    whyItMatters: 'Price-to-GWP (market cap ÷ gross written premium) prices in future growth and quality — it has to be justified by ROE and underwriting improvement. Premium metric, not profit.',
    naWhen: (i) => i.valuation === 0,
  },
]

export interface Cell {
  metric: MetricDef
  value: number | null
  rank: number | null
  count: number
  median: number | null
  diff: number | null
  best: boolean
  tone: CellTone
  signal: SignalKind
}

export interface ScoreRow {
  insurer: Insurer
  focal: boolean
  cells: Record<string, Cell>
}

export interface Scorecard {
  rows: ScoreRow[]
  metrics: MetricDef[]
  groupLabel: string
  count: number
  focal: Insurer
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ── Accounting-basis lens ────────────────────────────────────────────────────
// Combined Ratio is the only scorecard metric with a published dual-basis
// representation (IGAAP/Statutory vs IFRS), and only for the SAHIs that file IFRS
// accounts (Niva Bupa, Star Health, Care Health). Under the IFRS lens that
// metric reads from the curated dual-basis dataset; insurers that don't publish
// IFRS show an honest NA (never a cross-basis fill). All other columns — premium,
// market-share, solvency, valuation — are basis-neutral. ROE has no clean IFRS
// equity, so it stays on its statutory basis on both lenses (see the page note).

/** Combined ratio on a basis for a dual-basis SAHI, PINNED to the dashboard's
 *  canonical annual FY — so the IGAAP↔IFRS toggle is a true like-for-like basis
 *  comparison (same company, SAME year), never FY25-IGAAP vs FY26-IFRS. Returns
 *  null when the company isn't dual-basis tracked, or when it has no published
 *  figure on that basis for that exact FY (→ honest NA, never a cross-year fill).
 *  Auto-advances with the dashboard: when the canonical annual rolls to FY26,
 *  both lenses move to FY26 together. */
function basisCombinedPoint(companyId: string, basis: AccountingBasis): { fy: string; cr: number } | null {
  if (!hasBasisData(companyId)) return null
  const fy = getLatestAnnualFyLabel()
  if (!(ANNUAL_PERIODS as string[]).includes(fy)) return null
  const cr = getBasisProfit(companyId, basis, fy as BasisPeriod)?.combinedRatio
  return typeof cr === 'number' ? { fy, cr } : null
}

function valueOf(i: Insurer, m: MetricDef, basis: AccountingBasis): number | null {
  // IFRS lens only re-points Combined Ratio; IGAAP keeps the reported snapshot
  // value so the default view is byte-for-byte unchanged.
  if (m.key === 'combinedRatio' && basis === 'ifrs') return basisCombinedPoint(i.id, 'ifrs')?.cr ?? null
  if (m.naWhen?.(i)) return null
  const v = m.resolve ? m.resolve(i) : m.field ? i[m.field] : null
  return typeof v === 'number' && isFinite(v) ? v : null
}

function toneFor(polarity: Polarity, value: number, med: number | null, best: boolean, rank: number, count: number): CellTone {
  if (polarity === 'rich') return 'neutral' // valuation is richness, not strength
  if (best) return 'leader'
  if (med == null) return 'neutral'
  const eps = Math.max(Math.abs(med) * 0.02, 0.05)
  const better = polarity === 'higher' ? value > med + eps : value < med - eps
  const worse = polarity === 'higher' ? value < med - eps : value > med + eps
  if (better) return 'strong'
  if (!worse) return 'neutral'
  return rank >= count ? 'weak' : 'watch'
}

function signalFor(m: MetricDef, value: number, med: number | null, tone: CellTone): SignalKind {
  if (m.polarity === 'rich') return med != null && value >= med ? 'Premium' : 'Value'
  if (tone === 'leader' || tone === 'strong') return 'Strong'
  if (tone === 'neutral') return 'Decent'
  if (tone === 'watch') return 'Watch'
  return 'Weak'
}

/** Build the full scorecard for the active company + peer group, on the chosen
 *  accounting basis (default IGAAP/Statutory — the unchanged reported view). */
export function getScorecard(filters: FilterInput, basis: AccountingBasis = 'igaap'): Scorecard {
  const list = getFilteredInsurers(filters)
  const focal = getHighlightedInsurer(filters)
  // Focal first, then peers (stable order otherwise).
  const ordered = [focal, ...list.filter((i) => i.id !== focal.id)]

  // Pre-compute per-metric ranking context (median + ordered ids) once.
  const ctx = new Map<string, { med: number | null; rankedIds: string[]; count: number }>()
  for (const m of METRICS) {
    const present = list
      .map((i) => ({ id: i.id, v: valueOf(i, m, basis) }))
      .filter((x): x is { id: string; v: number } => x.v != null)
    const med = median(present.map((x) => x.v))
    const dir =
      m.polarity === 'lower'
        ? (a: { v: number }, b: { v: number }) => a.v - b.v // smaller first
        : (a: { v: number }, b: { v: number }) => b.v - a.v // bigger first (higher + rich)
    const rankedIds = [...present].sort(dir).map((x) => x.id)
    ctx.set(m.key, { med, rankedIds, count: present.length })
  }

  const rows: ScoreRow[] = ordered.map((insurer) => {
    const cells: Record<string, Cell> = {}
    for (const m of METRICS) {
      const c = ctx.get(m.key)!
      const value = valueOf(insurer, m, basis)
      if (value == null) {
        cells[m.key] = { metric: m, value: null, rank: null, count: c.count, median: c.med, diff: null, best: false, tone: 'na', signal: 'NA' }
        continue
      }
      const rank = c.rankedIds.indexOf(insurer.id) + 1
      const best = rank === 1
      const diff = c.med != null ? value - c.med : null
      const tone = toneFor(m.polarity, value, c.med, best, rank, c.count)
      const signal = signalFor(m, value, c.med, tone)
      cells[m.key] = { metric: m, value, rank, count: c.count, median: c.med, diff, best, tone, signal }
    }
    return { insurer, focal: insurer.id === focal.id, cells }
  })

  return {
    rows,
    metrics: METRICS,
    groupLabel: filters.peerGroup,
    count: list.length,
    focal,
  }
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

export function fmtValue(c: Cell): string {
  if (c.value == null) return c.metric.naWhen ? 'NA' : '—'
  if (c.metric.unit === 'x') return `${c.value.toFixed(2)}x`
  if (c.metric.unit === 'pp') return `${c.value >= 0 ? '+' : '−'}${Math.abs(c.value).toFixed(1)}pp`
  return `${c.value.toFixed(1)}%`
}

/** Difference vs peer median, expressed in the metric's natural unit. */
export function fmtDiff(c: Cell): string | null {
  if (c.diff == null || c.value == null) return null
  const unit = c.metric.unit === 'x' ? 'x' : 'pp'
  const v = Math.abs(c.diff)
  const sign = c.diff >= 0 ? '+' : '−'
  return `${sign}${v.toFixed(unit === 'x' ? 2 : 1)}${unit}`
}

/** Is the difference in the "good" direction for this metric? */
export function diffIsGood(c: Cell): boolean | null {
  if (c.diff == null) return null
  if (c.metric.polarity === 'rich') return c.diff >= 0 // premium reads positive
  return c.metric.polarity === 'higher' ? c.diff >= 0 : c.diff <= 0
}

export function rankLabel(c: Cell): string {
  return c.rank != null ? `#${c.rank}` : 'NA'
}

// ─── Per-cell source resolution ──────────────────────────────────────────────
// Every scorecard cell (company × metric) resolves to the real document the
// number came from, so the right-hand panel can show a clickable source link.
// No fabrication: each URL is read from a snapshot; a cell with no source on
// record returns null and the panel shows a quiet, link-free label.

export interface CellSource {
  /** SourceTag label, e.g. 'Company filing' or 'Valuation feed'. */
  label: string
  period?: string
  confidence: 'high' | 'medium' | 'low' | 'pending'
  provenance: { source_name?: string; source_url?: string; fetched_at?: string | null }
}

// Scorecard metric key → the annual-snapshot column whose value drives it.
// `growth` is computed from GWP, so its source is the GWP row (which for SAHIs is
// the provisional FY26 GI-Council premium; for others the latest reported GWP).
// NB: retailMix is intentionally absent — it is resolved separately to the GI
// Council Health Portfolio (the chart's source), not the annual-disclosure row.
const METRIC_PROV_FIELD: Record<string, string> = {
  growth: 'gwp',
  marketShareChange: 'market_share',
  combinedRatio: 'combined_ratio',
  roe: 'roe',
  solvency: 'solvency_ratio',
}
// Valuation multiples come from the daily market feed, not the annual filing.
const VALUATION_KEYS = new Set(['priceToEarnings', 'priceToBook', 'valuation'])

function labelFor(sourceName?: string): string {
  return /GI Council/i.test(sourceName ?? '') ? 'GI Council' : 'Company filing'
}

/**
 * Resolve a real, clickable source for one scorecard cell — with the EXACT
 * fiscal year that cell's shown value came from (so a FY26 GWP-growth cell links
 * to the FY26 GI-Council premium while a FY25 ROE cell links to the FY25 annual
 * report). Priority:
 *   1. the snapshot row that supplied this metric's latest real value,
 *   2. the per-metric provenance map (data-provenance.json),
 *   3. the company's annual-report filing,
 *   4. for valuation multiples, the daily valuation feed.
 * Returns null only when no source URL is on record.
 */
export function resolveCellSource(companyId: string, metricKey: string, basis: AccountingBasis = 'igaap'): CellSource | null {
  // Under the IFRS lens, Combined Ratio comes from the company's IFRS accounts
  // (annual report / investor presentation), not the statutory filing — cite that
  // with the FY actually shown. Null (link-free) for insurers without IFRS.
  if (metricKey === 'combinedRatio' && basis === 'ifrs') {
    const pt = basisCombinedPoint(companyId, 'ifrs')
    if (!pt) return null
    return {
      label: BASIS_SOURCE_LABEL.ifrs,
      period: pt.fy,
      confidence: 'high',
      provenance: { source_name: 'IFRS accounts (annual report / investor presentation)', source_url: '', fetched_at: null },
    }
  }

  if (VALUATION_KEYS.has(metricKey)) {
    const v = getValuationProvenance(companyId)
    if (v?.source_url) {
      return {
        label: 'Valuation feed',
        period: v.source_period ?? 'TTM',
        confidence: v.confidence ?? 'medium',
        provenance: { source_name: v.source_name, source_url: v.source_url, fetched_at: v.fetched_at },
      }
    }
    return null
  }

  // Retail Mix is derived from the GI Council health portfolio (retail ÷ total
  // health premium) — the SAME source/formula as the Product Mix chart — so its
  // source drawer must cite the GI Council with the actual latest reported FY,
  // not the company's annual report. Returns null (→ link-free label) only when
  // the GI Council has no health split on record for this insurer.
  if (metricKey === 'retailMix') {
    const pt = latestRetailMixPoint(companyId)
    if (!pt) return null
    return {
      label: RETAIL_MIX_SOURCE.source,
      period: pt.fy,
      confidence: RETAIL_MIX_SOURCE.confidence,
      provenance: RETAIL_MIX_SOURCE.provenance,
    }
  }

  const field = METRIC_PROV_FIELD[metricKey]
  if (field) {
    // The row that actually supplied this metric's value — carries the right FY.
    const rp = getMetricRowProvenance(companyId, field)
    if (rp?.source_url) {
      return {
        label: labelFor(rp.source_name),
        period: rp.source_period,
        confidence: rp.confidence ?? 'high',
        provenance: { source_name: rp.source_name, source_url: rp.source_url, fetched_at: rp.fetched_at },
      }
    }
    const p = lookupProvenance(`company.${field}`, companyId, 'Annual')
    if (p?.source_url) {
      return {
        label: labelFor(p.source_name),
        period: p.source_period,
        confidence: p.confidence,
        provenance: { source_name: p.source_name, source_url: p.source_url, fetched_at: p.fetched_at },
      }
    }
  }

  // Fall back to the company's annual-report filing — the document the reported
  // figures are drawn from — so every disclosed cell still links to a real source.
  const row = getAnnualRowProvenance(companyId)
  if (row?.source_url) {
    return {
      label: labelFor(row.source_name),
      period: row.source_period,
      confidence: row.confidence ?? 'high',
      provenance: { source_name: row.source_name, source_url: row.source_url, fetched_at: row.fetched_at },
    }
  }

  return null
}
