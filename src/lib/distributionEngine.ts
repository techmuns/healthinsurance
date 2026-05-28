// ---------------------------------------------------------------------------
//  Distribution Engine — data + per-company helpers.
//
//  Channel mix anchors per company; the Niva Bupa row is calibrated to the
//  PPT deck (Brokers 30.6%, Agents 29.7%, Banca 20.1%, Direct 11.5% for FY25)
//  with FY19 + 9M FY26 reference points. Other insurers carry only the
//  reported FY25 + 9M FY26 snapshots — Distribution Engine surfaces what's
//  available rather than fabricating long history.
//
//  Reach-depth (region / tier / city) data is not in this mock model — the
//  reach-depth panel renders an EmptyState until source-backed numbers are
//  wired through this file.
// ---------------------------------------------------------------------------

import { insurers, PEER_GROUP_LABEL } from '@/data/mockData'
import type { Insurer, PeerGroup } from '@/data/types'
import { getFilteredInsurers } from '@/lib/insurers'

export type DistPeriodKey = 'FY19' | 'FY25' | '9M FY26'

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

// Per-company channel mix (% of GWP). Only Niva Bupa is populated — values
// come straight from the company's RHP / annual report channel-mix tables
// for FY19 / FY25 / 9M FY26. Every other insurer is intentionally absent;
// the UI surfaces an explicit "not yet ingested" state until per-company
// channel-mix tables are extracted from their public disclosures.
export const distributionEngineMix: Record<string, ChannelMixRow[]> = {
  'niva-bupa': [
    { period: 'FY19', Banca: 17.0, Brokers: 23.5, Agents: 36.2, 'Corporate Agents': 4.8, Direct: 14.5, Others: 4.0 },
    { period: 'FY25', Banca: 20.1, Brokers: 30.6, Agents: 29.7, 'Corporate Agents': 5.0, Direct: 11.5, Others: 3.1 },
    { period: '9M FY26', Banca: 21.5, Brokers: 31.0, Agents: 28.2, 'Corporate Agents': 5.0, Direct: 11.0, Others: 3.3 },
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
): string {
  const data = getCompanyDistributionData(company.id)
  if (!data) {
    return `Channel mix is not yet wired for ${company.shortName}.`
  }
  const { latest, earliest } = data
  if (!latest || !earliest || earliest.period === latest.period) {
    const top = data.heroChips[0]
    return `${company.shortName}'s sourcing skews toward ${top.channel.toLowerCase()} (${top.share.toFixed(1)}% of GWP).`
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
