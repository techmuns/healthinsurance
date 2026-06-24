// ---------------------------------------------------------------------------
//  Ownership-trend read API — Governance → Ownership Trend module.
//
//  Reads the two Screener-sourced snapshots (ownership-holdings + ownership-
//  trends) and shapes them for the UI: the group-level holding series over
//  time, the latest-vs-previous movement, the insight-strip figures and the
//  source/audit metadata. The Annual ↔ Quarterly choice comes from the global
//  `period` (Annual → yearly table, Quarterly → quarterly table); the FY / QTR
//  range narrows which periods show. Real, source-backed only — a period exists
//  here only if Screener carried it; nothing is averaged across period types.
// ---------------------------------------------------------------------------

import holdingsSnap from '@/data/snapshots/ownership-holdings.json'
import trendsSnap from '@/data/snapshots/ownership-trends.json'
import type {
  OwnershipHoldingRow,
  OwnershipTrendRow,
  OwnershipScreenerMeta,
  OwnershipPeriodType,
  OwnershipHolderGroup,
} from '@/data/snapshots/_schemas'
import type { TimePeriod } from '@/data/types'
import { type DateRange, labelInRange, fyEndIdx, quarterEndIdx } from '@/lib/dateRange'

const HOLDINGS = (holdingsSnap as { data?: OwnershipHoldingRow[] }).data ?? []
const TRENDS = (trendsSnap as { data?: OwnershipTrendRow[] }).data ?? []
const META = (holdingsSnap as { _meta: OwnershipScreenerMeta })._meta

/** The four % holder groups plotted on the trend (shareholder count is separate). */
export const TREND_GROUPS: OwnershipHolderGroup[] = ['Promoters', 'FIIs', 'DIIs', 'Public']
const SHAREHOLDER_ROW: OwnershipHolderGroup = 'No. of Shareholders'

/** Global period → which Screener table. Quarterly → quarterly; else yearly. */
export function ownershipPeriodType(period: TimePeriod): OwnershipPeriodType {
  return period === 'Quarterly' ? 'quarterly' : 'yearly'
}

export interface TrendPeriod {
  fiscal: string // dashboard label, e.g. "Q3 FY25" / "FY25"
  raw: string // Screener label, e.g. "Dec 2024"
  endDate: string // ISO YYYY-MM-DD
}

export interface OwnershipTrendView {
  available: boolean
  periodType: OwnershipPeriodType
  /** Visible periods (ascending) after the FY/QTR range narrows them. */
  periods: TrendPeriod[]
  /** Holding %, aligned to `periods`, per group. */
  seriesByGroup: Record<OwnershipHolderGroup, (number | null)[]>
  /** Shareholder count aligned to `periods`. */
  shareholderCounts: (number | null)[]
  latest: TrendPeriod | null
  previous: TrendPeriod | null
  /** The group trend rows for the latest transition (sorted by |change|). */
  latestMovement: OwnershipTrendRow[]
  /** True when the FY/QTR range was widened back to full history (so a usable
   *  ≥2-point trend always renders). */
  showingFullHistory: boolean
  meta: OwnershipScreenerMeta
}

/** End fiscal-month index of a dashboard period label (for range clipping). */
function fiscalEndIdx(fiscal: string): number | null {
  let m = /^FY(\d{2})$/.exec(fiscal)
  if (m) return fyEndIdx(+m[1])
  m = /^Q([1-4])\s+FY(\d{2})$/.exec(fiscal)
  if (m) return quarterEndIdx(+m[2], +m[1])
  return null
}

function rowsFor(companyId: string, periodType: OwnershipPeriodType): OwnershipHoldingRow[] {
  return HOLDINGS.filter((r) => r.company_id === companyId && r.period_type === periodType)
}

/** Ordered (ascending by end date), unique periods present for a company/type. */
function periodsOf(rows: OwnershipHoldingRow[]): TrendPeriod[] {
  const seen = new Map<string, TrendPeriod>()
  for (const r of rows) {
    if (!seen.has(r.period_label)) seen.set(r.period_label, { fiscal: r.fiscal_period, raw: r.period_label, endDate: r.period_end_date })
  }
  return [...seen.values()].sort((a, b) => (a.endDate < b.endDate ? -1 : a.endDate > b.endDate ? 1 : 0))
}

/**
 * Build the trend view for a company at the active period + range. Always keeps
 * the freshest period (extends the upper bound), so the latest Screener data is
 * never hidden by a default window that predates it; falls back to full history
 * if the range would leave fewer than two points.
 */
export function getOwnershipTrendView(companyId: string, period: TimePeriod, range: DateRange): OwnershipTrendView {
  const periodType = ownershipPeriodType(period)
  const rows = rowsFor(companyId, periodType)
  const allPeriods = periodsOf(rows)

  if (!allPeriods.length) {
    return {
      available: false,
      periodType,
      periods: [],
      seriesByGroup: { Promoters: [], FIIs: [], DIIs: [], Public: [], 'No. of Shareholders': [], Other: [] },
      shareholderCounts: [],
      latest: null,
      previous: null,
      latestMovement: [],
      showingFullHistory: false,
      meta: META,
    }
  }

  // Clip to the range, but always reach through to the latest period; fall back
  // to the full history if the window leaves fewer than two points.
  const latestEnd = fiscalEndIdx(allPeriods[allPeriods.length - 1].fiscal) ?? range.to
  const effTo = Math.max(range.to, latestEnd)
  let visible = allPeriods.filter((p) => labelInRange(p.fiscal, { from: range.from, to: effTo }))
  let showingFullHistory = false
  if (visible.length < 2) {
    visible = allPeriods
    showingFullHistory = visible.length !== allPeriods.filter((p) => labelInRange(p.fiscal, { from: range.from, to: effTo })).length
  }

  const valueAt = (group: OwnershipHolderGroup, raw: string): number | null => {
    const r = rows.find((x) => x.holder_group === group && x.period_label === raw)
    return r ? r.holding_pct : null
  }
  const countAt = (raw: string): number | null => {
    const r = rows.find((x) => x.holder_group === SHAREHOLDER_ROW && x.period_label === raw)
    return r ? r.shareholder_count : null
  }

  const seriesByGroup = {
    Promoters: visible.map((p) => valueAt('Promoters', p.raw)),
    FIIs: visible.map((p) => valueAt('FIIs', p.raw)),
    DIIs: visible.map((p) => valueAt('DIIs', p.raw)),
    Public: visible.map((p) => valueAt('Public', p.raw)),
    'No. of Shareholders': [] as (number | null)[],
    Other: [] as (number | null)[],
  } as Record<OwnershipHolderGroup, (number | null)[]>

  const shareholderCounts = visible.map((p) => countAt(p.raw))
  const latest = visible[visible.length - 1] ?? null
  const previous = visible.length > 1 ? visible[visible.length - 2] : null

  // Latest movement = the precomputed trend rows whose current period is the
  // latest visible period (comparison is always vs the immediately-prior period).
  const latestMovement = latest
    ? TRENDS.filter((t) => t.company_id === companyId && t.period_type === periodType && t.current_period === latest.fiscal).sort(
        (a, b) => (a.rank_by_change ?? 99) - (b.rank_by_change ?? 99),
      )
    : []

  return {
    available: true,
    periodType,
    periods: visible,
    seriesByGroup,
    shareholderCounts,
    latest,
    previous,
    latestMovement,
    showingFullHistory,
    meta: META,
  }
}

export interface InsightFigure {
  latest: number | null
  previousValue: number | null
  changePp: number | null
}

/** One group's latest value + change vs the immediately-prior period. */
export function groupInsight(view: OwnershipTrendView, group: OwnershipHolderGroup): InsightFigure {
  const series = view.seriesByGroup[group] ?? []
  const latest = series.length ? series[series.length - 1] : null
  const previousValue = series.length > 1 ? series[series.length - 2] : null
  const changePp = latest != null && previousValue != null ? Math.round((latest - previousValue) * 100) / 100 : null
  return { latest, previousValue, changePp }
}

/** Combined FII + DII (institutional) latest + change. */
export function institutionalInsight(view: OwnershipTrendView): InsightFigure {
  const fii = view.seriesByGroup.FIIs ?? []
  const dii = view.seriesByGroup.DIIs ?? []
  const sumAt = (i: number): number | null => {
    const a = fii[i]
    const b = dii[i]
    return a == null && b == null ? null : (a ?? 0) + (b ?? 0)
  }
  const n = view.periods.length
  const latest = n ? sumAt(n - 1) : null
  const previousValue = n > 1 ? sumAt(n - 2) : null
  const changePp = latest != null && previousValue != null ? Math.round((latest - previousValue) * 100) / 100 : null
  return { latest, previousValue, changePp }
}

/** Shareholder count latest + change (a count, not a percentage). */
export function shareholderInsight(view: OwnershipTrendView): { latest: number | null; previousValue: number | null; change: number | null } {
  const s = view.shareholderCounts
  const latest = s.length ? s[s.length - 1] : null
  const previousValue = s.length > 1 ? s[s.length - 2] : null
  const change = latest != null && previousValue != null ? latest - previousValue : null
  return { latest, previousValue, change }
}
