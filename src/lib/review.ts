// ---------------------------------------------------------------------------
// Quarterly-review / PE logic. Derives signals, peer ranks, the YTD→quarter
// bridge and the multi-metric scorecard from the canonical `insurers` model.
// All qualitative copy lives in `quarterlyReviews` (mock, clearly marked).
// ---------------------------------------------------------------------------

import { insurers, quarterlyReviews, QUARTER } from '@/data/mockData'
import type { QuarterlyReview, YtdBridgeInput } from '@/data/mockData'
import type { Insurer } from '@/data/types'
import type { MetricKey } from './insurers'

export type ReviewSignal = 'Strong' | 'Improving' | 'Stable' | 'Watch' | 'Weak'
export type CellTone = 'strong' | 'stable' | 'watch' | 'weak' | 'na'

export interface MetricConfig {
  key: MetricKey
  label: string
  short: string
  invert?: boolean
  /** Treat a 0 value as "not reported" (e.g. life combined ratio / retail mix). */
  naWhenZero?: boolean
  format: (v: number) => string
}

/** The seven PE/investor metrics used by the scorecard and rank snapshot. */
export const scorecardMetrics: MetricConfig[] = [
  { key: 'growth', label: 'GWP Growth', short: 'GWP Growth', format: (v) => `${v.toFixed(1)}%` },
  { key: 'retailMix', label: 'Retail Mix', short: 'Retail Mix', naWhenZero: true, format: (v) => `${v.toFixed(0)}%` },
  { key: 'marketShareChange', label: 'Share Gain', short: 'Share Gain', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} pp` },
  { key: 'combinedRatio', label: 'Combined Ratio', short: 'Combined', invert: true, naWhenZero: true, format: (v) => `${v.toFixed(1)}%` },
  { key: 'roe', label: 'ROE', short: 'ROE', format: (v) => `${v.toFixed(1)}%` },
  { key: 'solvency', label: 'Solvency', short: 'Solvency', format: (v) => `${v.toFixed(2)}x` },
  { key: 'valuation', label: 'Valuation (P/GWP)', short: 'Valuation', invert: true, naWhenZero: true, format: (v) => `${v.toFixed(1)}x` },
]

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Rank (1 = best) of a company for a metric within a list; null if N/A. */
export function rankWithin(cfg: MetricConfig, c: Insurer, list: Insurer[]): { rank: number; of: number } | null {
  if (cfg.naWhenZero && c[cfg.key] === 0) return null
  const valid = list.filter((i) => !(cfg.naWhenZero && i[cfg.key] === 0))
  const sorted = [...valid].sort((a, b) => (cfg.invert ? a[cfg.key] - b[cfg.key] : b[cfg.key] - a[cfg.key]))
  const idx = sorted.findIndex((i) => i.id === c.id)
  return idx === -1 ? null : { rank: idx + 1, of: sorted.length }
}

export function toneFromRank(rank: number, of: number): CellTone {
  if (rank === 1) return 'strong'
  const q = rank / of
  if (q <= 0.5) return 'stable'
  if (q <= 0.8) return 'watch'
  return 'weak'
}

/** Soft, institutional cell tones (shared with the heatmap palette). */
export const TONE_STYLE: Record<CellTone, { bg: string; color: string }> = {
  strong: { bg: '#E6F1EB', color: '#2F855A' },
  stable: { bg: '#EAF1FF', color: '#27457E' },
  watch: { bg: '#FBF3E2', color: '#B7791F' },
  weak: { bg: '#F8ECEC', color: '#B94A48' },
  na: { bg: '#F4F7FC', color: '#9AA3AF' },
}

// --- Signals ---------------------------------------------------------------

export function growthSignal(c: Insurer, list: Insurer[]): ReviewSignal {
  const r = rankWithin(scorecardMetrics[0], c, list)
  if (!r) return 'Stable'
  if (r.rank === 1) return 'Strong'
  if (r.rank <= Math.ceil(r.of / 2)) return 'Improving'
  if (r.rank < r.of) return 'Stable'
  return 'Watch'
}

export function profitabilitySignal(c: Insurer): ReviewSignal {
  if (c.combinedRatio > 0) {
    if (c.combinedRatio < 97) return 'Strong'
    if (c.combinedRatio < 100) return 'Improving'
    if (c.combinedRatio < 102) return 'Watch'
    return 'Weak'
  }
  // Life carriers report no combined ratio — fall back to ROE.
  if (c.roe >= 15) return 'Strong'
  if (c.roe >= 12) return 'Improving'
  if (c.roe >= 10) return 'Stable'
  return 'Watch'
}

export function valuationSignal(c: Insurer, list: Insurer[]): ReviewSignal {
  if (c.valuation === 0) return 'Stable' // unlisted — no market valuation
  const med = median(list.map((i) => i.valuation).filter((v) => v > 0)) || c.valuation
  const r = c.valuation / med
  if (r < 0.9) return 'Improving' // cheaper than peers
  if (r <= 1.05) return 'Stable' // fair
  if (r <= 1.2) return 'Watch' // premium
  return 'Weak' // expensive
}

const SIGNAL_SCORE: Record<ReviewSignal, number> = { Strong: 2, Improving: 1, Stable: 0, Watch: -1, Weak: -2 }

export interface CompanySignals {
  overall: ReviewSignal
  growth: ReviewSignal
  profitability: ReviewSignal
  valuation: ReviewSignal
  peerRankSummary: string
}

export function getCompanySignals(c: Insurer, list: Insurer[]): CompanySignals {
  const growth = growthSignal(c, list)
  const profitability = profitabilitySignal(c)
  const valuation = valuationSignal(c, list)
  const sum = SIGNAL_SCORE[growth] + SIGNAL_SCORE[profitability] + SIGNAL_SCORE[valuation]
  const overall: ReviewSignal = sum >= 3 ? 'Improving' : sum >= 1 ? 'Stable' : sum >= -1 ? 'Watch' : 'Weak'

  const parts = ['growth', 'marketShareChange', 'combinedRatio'].map((k) => {
    const cfg = scorecardMetrics.find((m) => m.key === (k as MetricKey))!
    const r = rankWithin(cfg, c, list)
    return r ? `#${r.rank}/${r.of} ${cfg.short.toLowerCase()}` : `${cfg.short.toLowerCase()} n/a`
  })
  return { overall, growth, profitability, valuation, peerRankSummary: parts.join(' · ') }
}

// --- Peer rank snapshot ----------------------------------------------------

export interface RankSnapshotRow {
  label: string
  display: string
  rank: number | null
  of: number
  tone: CellTone
}

export function getPeerRankSnapshot(c: Insurer, list: Insurer[]): RankSnapshotRow[] {
  return scorecardMetrics.map((cfg) => {
    const r = rankWithin(cfg, c, list)
    return {
      label: cfg.label,
      display: c[cfg.key] === 0 && cfg.naWhenZero ? '—' : cfg.format(c[cfg.key]),
      rank: r?.rank ?? null,
      of: r?.of ?? list.length,
      tone: r ? toneFromRank(r.rank, r.of) : 'na',
    }
  })
}

// --- Multi-metric scorecard ------------------------------------------------

export interface ScorecardCell {
  display: string
  rank: number | null
  of: number
  tone: CellTone
  isLeader: boolean
  tooltip: string
}

export interface ScorecardRow {
  id: string
  name: string
  focal: boolean
  cells: ScorecardCell[]
}

export function getScorecardMatrix(list: Insurer[], focalId: string): { columns: MetricConfig[]; rows: ScorecardRow[] } {
  const rows: ScorecardRow[] = list.map((c) => ({
    id: c.id,
    name: c.shortName,
    focal: c.id === focalId,
    cells: scorecardMetrics.map((cfg) => {
      const na = cfg.naWhenZero && c[cfg.key] === 0
      const r = na ? null : rankWithin(cfg, c, list)
      const display = na ? '—' : cfg.format(c[cfg.key])
      return {
        display,
        rank: r?.rank ?? null,
        of: r?.of ?? list.length,
        tone: r ? toneFromRank(r.rank, r.of) : 'na',
        isLeader: r?.rank === 1,
        tooltip: na
          ? `${cfg.label}: not reported`
          : `${cfg.label}: ${display}${r ? ` · Rank #${r.rank}/${r.of}` : ''}`,
      }
    }),
  }))
  return { columns: scorecardMetrics, rows }
}

/** Dynamic one-line summary of where the focal company stands. */
export function getScorecardSummary(focal: Insurer, list: Insurer[]): string {
  const strengths: string[] = []
  const watches: string[] = []
  scorecardMetrics.forEach((cfg) => {
    const r = rankWithin(cfg, focal, list)
    if (!r) return
    if (r.rank <= 2) strengths.push(cfg.short.toLowerCase())
    else if (r.rank / r.of > 0.7) watches.push(cfg.short.toLowerCase())
  })
  const s = strengths.length ? strengths.slice(0, 3).join(' and ') : 'few metrics'
  const w = watches.length ? watches.slice(0, 2).join(' and ') : null
  return w
    ? `${focal.shortName} ranks strong on ${s}, but ${w} need monitoring.`
    : `${focal.shortName} ranks strong on ${s}, with no major weak spots in this peer set.`
}

// --- YTD → quarter bridge --------------------------------------------------

export interface BridgeRow extends YtdBridgeInput {
  /** Derived standalone quarter = currentYtd − previousYtd. */
  quarter: number | null
  formula: string
}

export function getBridgeRows(companyId: string): BridgeRow[] {
  const review = quarterlyReviews[companyId]
  if (!review) return []
  return review.bridge.map((b) => ({
    ...b,
    quarter: b.currentYtd != null && b.previousYtd != null ? Math.round((b.currentYtd - b.previousYtd) * 10) / 10 : null,
    formula: `${QUARTER.currentYtd} − ${QUARTER.previousYtd}`,
  }))
}

export function getQuarterlyReview(companyId: string): QuarterlyReview | undefined {
  return quarterlyReviews[companyId]
}

export { insurers }
