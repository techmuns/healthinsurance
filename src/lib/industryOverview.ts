// ---------------------------------------------------------------------------
//  Industry Overview model — one consolidated read of the active insurer pool
//  for the Overview page. Every card, the bubble chart, the ranking table and
//  the insight strip derive from this single builder, so changing the global
//  Peer Group / Highlight selector (or the on-page metric toggle) re-flows the
//  whole page from one honest source of truth.
//
//  Honesty rules baked in here (see CLAUDE.md):
//    • Missing ≠ zero — a metric that is null/0 in the snapshot is flagged
//      `available: false` so the UI renders an "n/a" marker and omits the bar
//      /bubble, never a fake 0.
//    • Premium ≠ profit — GWP is a premium metric; callers tag it accordingly.
//    • Share basis is consistent with the rest of the dashboard: segment groups
//      use each insurer's segment-pool share (+ an "Others" remainder); the
//      "All" universe uses premium-weighted share.
// ---------------------------------------------------------------------------

import { getFilteredInsurers, getHighlightedInsurer, type MetricKey } from '@/lib/insurers'
import { PEER_GROUP_LABEL } from '@/data/mockData'
import type { DashboardFilters, Insurer } from '@/data/types'

type FilterInput = Pick<DashboardFilters, 'peerGroup' | 'highlightedCompany'>

const round1 = (v: number) => Math.round(v * 10) / 10

// ─── Metric definitions for the on-page "View by" toggle ────────────────────
// Same five metrics the Industry-Leaders control offers, but with display-grade
// formatters (1-dp share, grouped ₹ Cr) and axis labels for the bubble chart.

export type OverviewMetricId = 'share' | 'premium' | 'settlement' | 'renewal' | 'retention'

export interface OverviewMetricDef {
  id: OverviewMetricId
  key: MetricKey
  /** Toggle + column label. */
  label: string
  /** Section heading, e.g. "Renewal Overview". */
  title: string
  /**
   * How the left card visualizes this metric. 'bubble' (premium-scaled market
   * map) suits share / premium; 'bars' (ranked horizontal bars) suits the
   * tightly-clustered quality ratios where bubbles would overlap.
   */
  chartKind: 'bubble' | 'bars'
  /** Bubble-chart axis label. */
  axisLabel: string
  unit: '%' | '₹ Cr'
  format: (v: number) => string
}

const pct = (v: number) => (Number.isInteger(v) ? `${v}%` : `${v.toFixed(1)}%`)
const cr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')} Cr`

export const OVERVIEW_METRICS: OverviewMetricDef[] = [
  { id: 'share', key: 'marketShare', label: 'Market share', title: 'Market Share Overview', chartKind: 'bubble', axisLabel: 'Market share (%)', unit: '%', format: (v) => `${v.toFixed(1)}%` },
  { id: 'premium', key: 'premiumCollection', label: 'Premium', title: 'Premium Overview', chartKind: 'bars', axisLabel: 'Premium · GWP (₹ Cr)', unit: '₹ Cr', format: cr },
  { id: 'settlement', key: 'settlementRatio', label: 'Settlement', title: 'Settlement Overview', chartKind: 'bars', axisLabel: 'Claim settlement ratio (%)', unit: '%', format: pct },
  { id: 'renewal', key: 'renewalRate', label: 'Renewal', title: 'Renewal Overview', chartKind: 'bars', axisLabel: 'Renewal rate (%)', unit: '%', format: pct },
  { id: 'retention', key: 'customerRetention', label: 'Retention', title: 'Retention Overview', chartKind: 'bars', axisLabel: 'Customer retention (%)', unit: '%', format: pct },
]

export function metricById(id: OverviewMetricId): OverviewMetricDef {
  return OVERVIEW_METRICS.find((m) => m.id === id) ?? OVERVIEW_METRICS[0]
}

// ─── Shared tone-coded company palette (bubble chart + ranking table) ───────
// Selected company is always navy; the rest follow the requested on-theme map,
// with a cool peer fallback for any company outside it.
export const FOCAL_COLOR = '#27457E'
export const LEADER_COLOR = '#B68B3A' // champagne — market-share leader
export const COMPANY_COLORS: Record<string, string> = {
  'star-health': '#B68B3A', // champagne / gold
  'care-health': '#168E8E', // teal
  'niva-bupa': '#27457E', // navy
  'aditya-birla': '#3D5F9F', // steel blue
  manipalcigna: '#8C97A8', // muted blue-grey
}
const PEER_FALLBACK = ['#168E8E', '#6E7E96', '#9FB1C6', '#B6C0CF', '#7E8AA1']

export function companyColor(id: string, focal: boolean, idx: number): string {
  if (focal) return FOCAL_COLOR
  return COMPANY_COLORS[id] ?? PEER_FALLBACK[idx % PEER_FALLBACK.length]
}

// ─── Row + model shapes ─────────────────────────────────────────────────────

export interface OverviewRow {
  id: string
  name: string
  shortName: string
  ticker: string
  listed: boolean
  /** GWP (₹ Cr). 0 = not available. */
  premium: number
  premiumAvailable: boolean
  /** Display market share (%). */
  share: number
  shareAvailable: boolean
  /** GWP growth YoY (%). */
  growth: number
  /** Value of the currently selected metric. */
  metricValue: number
  metricAvailable: boolean
  focal: boolean
  /** Market-share leader of the pool. */
  isLeader: boolean
  /** Rank by the selected metric (1 = best); 0 = n/a. */
  rank: number
  /** Rank by market share (1 = biggest). */
  shareRank: number
}

export interface Insight {
  id: string
  kind: 'leader' | 'selected' | 'concentration' | 'implication'
  text: string
}

export type ConcentrationBand = 'Low' | 'Moderate' | 'High'

export interface ConcentrationModel {
  /** Herfindahl-Hirschman Index on the 0–1 normalized scale (ranked peers). */
  hhi: number
  /** Same index on the conventional 0–10,000 points scale. */
  hhiPoints: number
  band: ConcentrationBand
  bandLabel: string
  top3Share: number
}

export interface OverviewModel {
  metric: OverviewMetricDef
  groupLabel: string
  /** Rows ranked by the selected metric (n/a rows last). */
  rows: OverviewRow[]
  /** Rows ranked by market share, biggest first. */
  byShare: OverviewRow[]
  leader: OverviewRow | null
  runnerUp: OverviewRow | null
  highlighted: OverviewRow | null
  /** Untracked tail (segment pools only); null when shares already total ~100. */
  others: { share: number } | null
  count: number
  totalPremium: number
  avgShare: number
  /** Leader's lead over #2 (pp). */
  leadGap: number
  concentration: ConcentrationModel
  insights: Insight[]
  /** True when the active group exposes a real share basis to chart. */
  hasShareBasis: boolean
}

// ─── Builder ────────────────────────────────────────────────────────────────

function metricValueOf(i: Insurer, def: OverviewMetricDef, displayShare: number): number {
  return def.key === 'marketShare' ? displayShare : (i[def.key] as number)
}

function bandFor(hhi: number): { band: ConcentrationBand; label: string } {
  if (hhi > 0.25) return { band: 'High', label: 'Highly concentrated' }
  if (hhi >= 0.1) return { band: 'Moderate', label: 'Moderately concentrated' }
  return { band: 'Low', label: 'Fragmented market' }
}

export function getIndustryOverview(filters: FilterInput, metricId: OverviewMetricId): OverviewModel {
  const def = metricById(metricId)
  const list = getFilteredInsurers(filters)
  const highlightedInsurer = getHighlightedInsurer(filters)
  const isAll = filters.peerGroup === 'All'
  const groupLabel = PEER_GROUP_LABEL[filters.peerGroup]

  const totalPremium = list.reduce((s, i) => s + (i.premiumCollection || 0), 0)
  // Display share: premium-weighted across the full universe ('All'), else each
  // insurer's own segment-pool share as reported.
  const shareOf = (i: Insurer): number =>
    isAll ? (totalPremium > 0 ? round1((i.premiumCollection / totalPremium) * 100) : 0) : i.marketShare

  const rowsRaw: OverviewRow[] = list.map((i) => {
    const share = shareOf(i)
    const metricValue = metricValueOf(i, def, share)
    return {
      id: i.id,
      name: i.name,
      shortName: i.shortName,
      ticker: i.ticker,
      listed: i.ticker.trim().length > 0,
      premium: i.premiumCollection,
      premiumAvailable: i.premiumCollection > 0,
      share,
      shareAvailable: share > 0,
      growth: i.growth,
      metricValue,
      metricAvailable: typeof metricValue === 'number' && metricValue > 0,
      focal: i.id === highlightedInsurer.id,
      isLeader: false,
      rank: 0,
      shareRank: 0,
    }
  })

  // Rank by share (biggest first); assign shareRank.
  const byShare = [...rowsRaw].sort((a, b) => b.share - a.share)
  byShare.forEach((r, idx) => (r.shareRank = idx + 1))
  if (byShare[0]) byShare[0].isLeader = true

  // Rank by the selected metric; n/a rows sink to the bottom but keep rank 0.
  const ranked = [...rowsRaw].sort((a, b) => {
    if (a.metricAvailable !== b.metricAvailable) return a.metricAvailable ? -1 : 1
    return b.metricValue - a.metricValue
  })
  let r = 0
  ranked.forEach((row) => {
    if (row.metricAvailable) row.rank = ++r
  })

  const leader = byShare[0] ?? null
  const runnerUp = byShare[1] ?? null
  const highlighted = rowsRaw.find((x) => x.focal) ?? null

  const sumShare = round1(rowsRaw.reduce((s, x) => s + x.share, 0))
  const othersShare = round1(100 - sumShare)
  const others = !isAll && othersShare >= 0.5 ? { share: othersShare } : null

  const count = rowsRaw.length
  const avgShare = count > 0 ? round1(sumShare / count) : 0
  const leadGap = leader && runnerUp ? round1(leader.share - runnerUp.share) : 0
  const top3Share = round1(byShare.slice(0, 3).reduce((s, x) => s + x.share, 0))

  // HHI over the ranked peers (the share we actually have); the untracked
  // "Others" tail is excluded and called out in the caption.
  const hhi = Math.round(rowsRaw.reduce((s, x) => s + Math.pow(x.share / 100, 2), 0) * 1000) / 1000
  const { band, label: bandLabel } = bandFor(hhi)

  const concentration: ConcentrationModel = {
    hhi,
    hhiPoints: Math.round(hhi * 10000),
    band,
    bandLabel,
    top3Share,
  }

  const insights = buildInsights({
    groupLabel,
    leader,
    runnerUp,
    highlighted,
    byShare,
    leadGap,
    top3Share,
    concentration,
  })

  return {
    metric: def,
    groupLabel,
    rows: ranked,
    byShare,
    leader,
    runnerUp,
    highlighted,
    others,
    count,
    totalPremium,
    avgShare,
    leadGap,
    concentration,
    insights,
    hasShareBasis: rowsRaw.some((x) => x.shareAvailable),
  }
}

const signedPct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}%`
const signedPp = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} pp`

function buildInsights(m: {
  groupLabel: string
  leader: OverviewRow | null
  runnerUp: OverviewRow | null
  highlighted: OverviewRow | null
  byShare: OverviewRow[]
  leadGap: number
  top3Share: number
  concentration: ConcentrationModel
}): Insight[] {
  const out: Insight[] = []
  const pool = m.groupLabel.toLowerCase()

  if (m.leader) {
    out.push({
      id: 'leader',
      kind: 'leader',
      text: m.runnerUp
        ? `${m.leader.shortName} leads the ${pool} pool with ${m.leader.share.toFixed(1)}% share — ${m.leadGap.toFixed(1)} pp ahead of ${m.runnerUp.shortName}.`
        : `${m.leader.shortName} leads the ${pool} pool with ${m.leader.share.toFixed(1)}% share.`,
    })
  }

  if (m.highlighted) {
    const h = m.highlighted
    const top3 = m.byShare.slice(0, 3)
    const fastestTop3 = top3.length > 0 && top3.every((x) => h.growth >= x.growth) && h.shareRank <= 3
    const growthClause = `growing GWP ${signedPct(h.growth)} YoY${fastestTop3 ? ' (the fastest of the top 3)' : ''}`
    out.push({
      id: 'selected',
      kind: 'selected',
      text: h.isLeader
        ? `${h.shortName} is the market leader at ${h.share.toFixed(1)}% share, ${growthClause}.`
        : `${h.shortName} ranks #${h.shareRank} with ${h.share.toFixed(1)}% share, ${growthClause}.`,
    })
  }

  out.push({
    id: 'concentration',
    kind: 'concentration',
    text: `The top 3 insurers control ${m.top3Share.toFixed(1)}% of the pool — HHI ${m.concentration.hhi.toFixed(2)}, a ${m.concentration.bandLabel.toLowerCase()}.`,
  })

  if (m.highlighted && !m.highlighted.isLeader && m.leader) {
    const h = m.highlighted
    const above = m.byShare[h.shareRank - 2] // the insurer ranked just above the selected one
    const gapLeader = round1(m.leader.share - h.share)
    if (above) {
      const gapAbove = round1(above.share - h.share)
      out.push({
        id: 'implication',
        kind: 'implication',
        text: `${h.shortName} sits ${gapAbove.toFixed(1)} pp behind ${above.shortName} but ${gapLeader.toFixed(1)} pp behind ${m.leader.shortName} — overtaking #${h.shareRank - 1} is the realistic near-term benchmark.`,
      })
    } else {
      out.push({
        id: 'implication',
        kind: 'implication',
        text: `${h.shortName} trails the leader ${m.leader.shortName} by ${gapLeader.toFixed(1)} pp — closing that gap is the medium-term prize.`,
      })
    }
  } else if (m.highlighted && m.highlighted.isLeader && m.runnerUp) {
    out.push({
      id: 'implication',
      kind: 'implication',
      text: `${m.highlighted.shortName}'s ${m.leadGap.toFixed(1)} pp cushion over ${m.runnerUp.shortName} is the moat to defend as challengers grow faster.`,
    })
  }

  return out
}

const signedPpExport = signedPp
export { signedPpExport as signedPp }
