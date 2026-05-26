// ---------------------------------------------------------------------------
// Derivation helpers — the single bridge between the canonical `insurers`
// model and the Executive Overview UI. Every chart/card reads through these so
// that changing a filter updates the whole page from one source of truth.
// ---------------------------------------------------------------------------

import { insurers, FOCAL_COMPANY, PEER_GROUP_LABEL } from '@/data/mockData'
import type { ShareSlice } from '@/data/mockData'
import type { DashboardFilters, Insurer } from '@/data/types'

type FilterInput = Pick<DashboardFilters, 'peerGroup' | 'highlightedCompany'>

/** Numeric Insurer metrics that can be ranked. */
export type MetricKey =
  | 'marketShare'
  | 'premiumCollection'
  | 'settlementRatio'
  | 'renewalRate'
  | 'customerRetention'
  | 'growth'
  | 'margin'
  | 'combinedRatio'
  | 'solvency'
  | 'roe'
  | 'valuation'

/** Lower-is-better metrics (handled when ranking / picking leaders). */
const INVERTED: Partial<Record<MetricKey, true>> = {
  combinedRatio: true,
  valuation: true,
}

/** Industry-leader tabs shown on the overview, all higher-is-better. */
export interface LeaderMetricDef {
  id: string
  label: string
  key: MetricKey
  format: (v: number) => string
}

export const leaderMetricDefs: LeaderMetricDef[] = [
  { id: 'premium', label: 'Premium Collection', key: 'premiumCollection', format: (v) => `₹${v.toLocaleString('en-IN')} Cr` },
  { id: 'settlement', label: 'Settlement Ratio', key: 'settlementRatio', format: (v) => `${v.toFixed(1)}%` },
  { id: 'renewal', label: 'Renewal Rate', key: 'renewalRate', format: (v) => `${v.toFixed(0)}%` },
  { id: 'retention', label: 'Customer Retention', key: 'customerRetention', format: (v) => `${v.toFixed(0)}%` },
  { id: 'share', label: 'Market Share', key: 'marketShare', format: (v) => `${v.toFixed(0)}%` },
]

/** Insurers in the active peer group ('All' = full universe). */
export function getFilteredInsurers(filters: FilterInput): Insurer[] {
  if (filters.peerGroup === 'All') return insurers
  return insurers.filter((i) => i.peerGroup === filters.peerGroup)
}

/** The currently highlighted insurer (falls back to the focal default). */
export function getHighlightedInsurer(filters: FilterInput): Insurer {
  return (
    insurers.find((i) => i.id === filters.highlightedCompany) ??
    insurers.find((i) => i.id === FOCAL_COMPANY) ??
    insurers[0]
  )
}

/** Top insurer by a metric within a list (respects lower-is-better metrics). */
export function getLeaderByMetric(metric: MetricKey, list: Insurer[]): Insurer | undefined {
  const ranked = rankList(metric, list)
  return ranked[0]
}

/** Rank (1 = best) of an insurer by a metric within a list; 0 if absent. */
export function getRankByMetric(metric: MetricKey, insurer: Insurer, list: Insurer[]): number {
  const ranked = rankList(metric, list)
  const idx = ranked.findIndex((i) => i.id === insurer.id)
  return idx === -1 ? 0 : idx + 1
}

function rankList(metric: MetricKey, list: Insurer[]): Insurer[] {
  const invert = INVERTED[metric]
  return [...list]
    // Drop N/A values (0) so life carriers don't "win" combined ratio.
    .filter((i) => !(invert && i[metric] === 0))
    .sort((a, b) => (invert ? a[metric] - b[metric] : b[metric] - a[metric]))
}

/**
 * Donut slices for the active group. For a single segment, slices use each
 * insurer's segment share with an "Others" remainder; for 'All', slices are
 * premium-weighted across the whole universe. The highlighted insurer is
 * flagged `focal` so the chart and center label stay in sync.
 */
export function getMarketShareSlices(filters: FilterInput): ShareSlice[] {
  const list = getFilteredInsurers(filters)
  const highlightId = filters.highlightedCompany

  if (filters.peerGroup === 'All') {
    const total = list.reduce((s, i) => s + i.premiumCollection, 0) || 1
    return list
      .map((i) => ({
        name: i.shortName,
        value: Math.round((i.premiumCollection / total) * 1000) / 10,
        focal: i.id === highlightId,
        id: i.id,
        takeaway: i.takeaway,
      }))
      .sort((a, b) => b.value - a.value)
  }

  const slices: ShareSlice[] = list
    .map((i) => ({ name: i.shortName, value: i.marketShare, focal: i.id === highlightId, id: i.id, takeaway: i.takeaway }))
    .sort((a, b) => b.value - a.value)
  const others = Math.round((100 - slices.reduce((s, d) => s + d.value, 0)) * 10) / 10
  if (others >= 0.5) slices.push({ name: 'Others', value: others })
  return slices
}

export interface ScorecardSummary {
  growthLeader: Insurer
  /** Margin proxy leader (combined ratio where available, else ROE). */
  marginLeader: Insurer
  marginByCombined: boolean
  highlighted: Insurer
  inGroup: boolean
  growthRank: number
  marginRank: number
  count: number
  groupLabel: string
}

export interface ScorecardRow {
  label: string
  focal: boolean
  values: Record<string, number>
}

export interface PeerScorecardData {
  rows: ScorecardRow[]
  summary: ScorecardSummary
}

/** Heatmap rows + a dynamic plain-English summary for the Peer Scorecard. */
export function getPeerScorecardData(filters: FilterInput): PeerScorecardData {
  const list = getFilteredInsurers(filters)
  const highlighted = getHighlightedInsurer(filters)
  const inGroup = list.some((i) => i.id === highlighted.id)

  const rows: ScorecardRow[] = list.map((i) => ({
    label: i.shortName,
    focal: i.id === highlighted.id,
    values: {
      growth: i.growth,
      marketShareChange: i.marketShareChange,
      combinedRatio: i.combinedRatio,
      solvency: i.solvency,
      valuation: i.valuation,
    },
  }))

  const growthLeader = getLeaderByMetric('growth', list) ?? highlighted
  const hasMargin = list.some((i) => i.combinedRatio > 0)
  const marginLeader =
    (hasMargin ? getLeaderByMetric('combinedRatio', list) : getLeaderByMetric('roe', list)) ?? highlighted

  return {
    rows,
    summary: {
      growthLeader,
      marginLeader,
      marginByCombined: hasMargin,
      highlighted,
      inGroup,
      growthRank: getRankByMetric('growth', highlighted, list),
      marginRank: getRankByMetric(hasMargin ? 'combinedRatio' : 'roe', highlighted, list),
      count: list.length,
      groupLabel: PEER_GROUP_LABEL[filters.peerGroup],
    },
  }
}
