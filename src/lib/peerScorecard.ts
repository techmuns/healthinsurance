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
  },
  {
    key: 'solvency', field: 'solvency', label: 'Solvency', short: 'Solvency', group: 'Capital', unit: 'x', polarity: 'higher',
    whyItMatters: 'Solvency above the 1.5x regulatory floor is the cushion that lets a company grow safely without raising equity.',
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

function valueOf(i: Insurer, m: MetricDef): number | null {
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

/** Build the full scorecard for the active company + peer group. */
export function getScorecard(filters: FilterInput): Scorecard {
  const list = getFilteredInsurers(filters)
  const focal = getHighlightedInsurer(filters)
  // Focal first, then peers (stable order otherwise).
  const ordered = [focal, ...list.filter((i) => i.id !== focal.id)]

  // Pre-compute per-metric ranking context (median + ordered ids) once.
  const ctx = new Map<string, { med: number | null; rankedIds: string[]; count: number }>()
  for (const m of METRICS) {
    const present = list
      .map((i) => ({ id: i.id, v: valueOf(i, m) }))
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
      const value = valueOf(insurer, m)
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
