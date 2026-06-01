// ---------------------------------------------------------------------------
//  Distribution Engine — data + per-company helpers.
//
//  Channel mix per company; the Niva Bupa row holds real FY22–FY25 figures from
//  the company's filings (DRHP for FY22–FY24, FY2024-25 annual report for FY25),
//  fetched via GitHub Actions. Other insurers are absent — Distribution Engine
//  surfaces only what is source-backed rather than fabricating history.
//
//  Reach-depth (region / tier / city) data is not in this mock model — the
//  reach-depth panel renders an EmptyState until source-backed numbers are
//  wired through this file.
// ---------------------------------------------------------------------------

import { insurers, PEER_GROUP_LABEL } from '@/data/mockData'
import type { Insurer, PeerGroup } from '@/data/types'
import { getFilteredInsurers } from '@/lib/insurers'

export type DistPeriodKey = 'FY22' | 'FY23' | 'FY24' | 'FY25'

export const DIST_CHANNELS = [
  'Banca',
  'Brokers',
  'Agents',
  'Corporate Agents',
  'Direct',
  'Others',
] as const
export type DistChannel = (typeof DIST_CHANNELS)[number]

export interface ChannelMixRow {
  period: DistPeriodKey
  Banca: number
  Brokers: number
  Agents: number
  'Corporate Agents': number
  Direct: number
  Others: number
}

// Per-company channel mix (% of GWP by GDPI). Only Niva Bupa is populated —
// values are the real figures from the company's own filings, fetched via
// GitHub Actions (scripts/ingest/fetch-distribution-mix.ts → the committed
// data/raw/distribution/ extract): FY22–FY24 from the DRHP distribution table
// (Corporate Agents split into Banks = Banca, and Others), FY25 from the
// FY2024-25 annual report. Direct is the residual to 100% (the balancing
// channel). Other insurers are intentionally absent; the UI shows an explicit
// "not ingested" state until their tables are extracted the same way.
export const distributionEngineMix: Record<string, ChannelMixRow[]> = {
  'niva-bupa': [
    { period: 'FY22', Banca: 18.6, Brokers: 13.4, Agents: 37.3, 'Corporate Agents': 8.8, Direct: 21.1, Others: 0.8 },
    { period: 'FY23', Banca: 17.6, Brokers: 21.8, Agents: 36.0, 'Corporate Agents': 8.3, Direct: 16.0, Others: 0.3 },
    { period: 'FY24', Banca: 19.6, Brokers: 27.0, Agents: 32.1, 'Corporate Agents': 7.7, Direct: 13.1, Others: 0.5 },
    { period: 'FY25', Banca: 20.1, Brokers: 30.6, Agents: 29.7, 'Corporate Agents': 7.5, Direct: 11.5, Others: 0.6 },
  ],
}

// ─── Public helpers ────────────────────────────────────────────────────────

export interface DistributionHeroChip {
  channel: DistChannel
  share: number
  /** True for the channel that contributes the most for this company. */
  largest?: boolean
}

export interface DistributionData {
  /** Channel mix per period — ordered oldest → latest. */
  mix: ChannelMixRow[]
  /** Latest available period row. */
  latest: ChannelMixRow | null
  /** Earliest available period row (for change-over-time narration). */
  earliest: ChannelMixRow | null
  /** Hero KPI chips — 4 channels, latest period, largest channel flagged. */
  heroChips: DistributionHeroChip[]
}

/** True if the section has at least one period of channel-mix data for `id`. */
export function hasCompanyDistributionData(companyId: string): boolean {
  return !!distributionEngineMix[companyId]?.length
}

/**
 * Returns the channel-mix series + hero chips for a company. Returns `null`
 * when no data is recorded so the UI can render its unavailable state.
 */
export function getCompanyDistributionData(companyId: string): DistributionData | null {
  const rows = distributionEngineMix[companyId]
  if (!rows || rows.length === 0) return null
  const latest = rows[rows.length - 1]
  const earliest = rows[0]
  // Pick four chips: largest channel + the next three by share, ordered by
  // share so the highest sits first.
  const ranked = (DIST_CHANNELS as readonly DistChannel[])
    .map((ch) => ({ ch, val: latest[ch] }))
    .sort((a, b) => b.val - a.val)
  const top4 = ranked.slice(0, 4)
  const heroChips: DistributionHeroChip[] = top4.map((r, i) => ({
    channel: r.ch,
    share: r.val,
    largest: i === 0,
  }))
  return { mix: rows, latest, earliest, heroChips }
}

export interface PeerDependenceRow {
  /** Short name used on the chart axis. */
  label: string
  /** Agent (agency) share, % of GWP, latest period. */
  value: number
  focal?: boolean
}

/**
 * Agent-share comparison across the active peer group. Companies without
 * recorded mix data are dropped, not filled with zeros.
 */
export function getChannelDependencePeerData(
  companyId: string,
  peerGroup: PeerGroup,
): PeerDependenceRow[] {
  const peers = getFilteredInsurers({ peerGroup, highlightedCompany: companyId })
  const out: PeerDependenceRow[] = []
  for (const p of peers) {
    const rows = distributionEngineMix[p.id]
    const last = rows?.[rows.length - 1]
    if (!last) continue
    out.push({ label: p.shortName, value: last.Agents, focal: p.id === companyId })
  }
  return out.sort((a, b) => b.value - a.value)
}

/**
 * AI-read text under the main chart. Talks about the *change* between the
 * earliest and latest periods we have for the selected company, framed by
 * peer-group context.
 */
export function getDistributionAIRead(
  company: Insurer,
  peerGroup: PeerGroup,
  window?: ChannelMixRow[],
): string {
  const data = getCompanyDistributionData(company.id)
  if (!data) {
    return `Channel mix is not yet wired for ${company.shortName}.`
  }
  // Honour the caller's in-range window (the header Data Range) when given, so
  // the read describes only the years actually on the chart.
  const rows = window ?? data.mix
  const earliest = rows[0]
  const latest = rows[rows.length - 1]
  if (!earliest || !latest) return ''
  if (earliest.period === latest.period) {
    const segs: [string, number][] = [
      ['banca', latest.Banca], ['brokers', latest.Brokers], ['agents', latest.Agents],
      ['corporate agents', latest['Corporate Agents']], ['direct', latest.Direct],
    ]
    const top = segs.sort((a, b) => b[1] - a[1])[0]
    const bal = isBalanced(latest)
    const tone = bal ? ` Channel mix is more balanced than the ${PEER_GROUP_LABEL[peerGroup].toLowerCase()} median.` : ''
    return `In ${latest.period}, ${company.shortName}'s largest channel is ${top[0]} at ${top[1].toFixed(1)}% of GWP.${tone}`
  }

  const dBanca = latest.Banca - earliest.Banca
  const dBrokers = latest.Brokers - earliest.Brokers
  const dAgents = latest.Agents - earliest.Agents
  const dDirect = latest.Direct - earliest.Direct

  const moves: string[] = []
  if (Math.abs(dBrokers) >= 1) moves.push(`broker share ${dBrokers >= 0 ? 'rising' : 'falling'} ${Math.abs(dBrokers).toFixed(0)}pp`)
  if (Math.abs(dBanca) >= 1) moves.push(`banca ${dBanca >= 0 ? 'gaining' : 'easing'} ${Math.abs(dBanca).toFixed(0)}pp`)
  if (Math.abs(dAgents) >= 1) moves.push(`agency ${dAgents >= 0 ? 'gaining' : 'compressing'} ${Math.abs(dAgents).toFixed(0)}pp`)
  if (Math.abs(dDirect) >= 1) moves.push(`direct ${dDirect >= 0 ? 'rising' : 'easing'} ${Math.abs(dDirect).toFixed(0)}pp`)

  const movesText = moves.slice(0, 2).join(' and ')
  const balance = isBalanced(latest)
  const peerTone = balance
    ? ` Channel mix is more balanced than the ${PEER_GROUP_LABEL[peerGroup].toLowerCase()} median.`
    : ''

  if (!movesText) {
    return `${company.shortName}'s channel mix has been broadly stable between ${earliest.period} and ${latest.period}.${peerTone}`
  }
  return `Between ${earliest.period} and ${latest.period} at ${company.shortName}, ${movesText} — making the channel engine ${balance ? 'more balanced' : 'more concentrated'}.${peerTone}`
}

export function getDistributionTakeaway(
  company: Insurer,
  peerGroup: PeerGroup,
): { tone: 'teal' | 'navy' | 'warning'; text: string } {
  const data = getCompanyDistributionData(company.id)
  if (!data) {
    return {
      tone: 'navy',
      text: `Distribution read: data not wired for ${company.shortName}.`,
    }
  }
  const balance = isBalanced(data.latest!)
  const top = data.heroChips[0]
  const dependence = top.share
  const peerLabel = PEER_GROUP_LABEL[peerGroup].toLowerCase()

  if (balance && dependence < 38) {
    return {
      tone: 'teal',
      text: `Distribution read: Balanced. ${company.shortName}'s sourcing engine spreads risk across channels, with ${top.channel.toLowerCase()} the largest contributor at ${dependence.toFixed(1)}%.`,
    }
  }
  if (dependence >= 50) {
    return {
      tone: 'warning',
      text: `Distribution read: Concentrated. ${company.shortName} sources ${dependence.toFixed(0)}% of premium from ${top.channel.toLowerCase()} — single-channel risk vs ${peerLabel} peers.`,
    }
  }
  return {
    tone: 'navy',
    text: `Distribution read: ${top.channel} is the largest channel at ${dependence.toFixed(1)}%; channel mix sits in the middle of the ${peerLabel} pool.`,
  }
}

/**
 * Reach-depth (region / tier / city) data is not yet in the mock model. The
 * helper returns `null` so the UI renders a polished unavailable state
 * instead of fabricating geography numbers.
 */
export interface ReachDepthData {
  region?: { label: string; value: number }[]
  tier?: { label: string; value: number }[]
  avgPremium?: { label: string; value: number }[]
}
export function getReachDepthData(_companyId: string): ReachDepthData | null {
  return null
}

// ─── Internal ──────────────────────────────────────────────────────────────

/** "Balanced" = no single channel above 35% AND top-2 sum below 60%. */
function isBalanced(row: ChannelMixRow): boolean {
  const values = (DIST_CHANNELS as readonly DistChannel[])
    .map((ch) => row[ch])
    .sort((a, b) => b - a)
  const top = values[0]
  const top2 = values[0] + values[1]
  return top < 35 && top2 < 60
}

export { insurers as _insurers }
