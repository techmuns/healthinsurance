// ---------------------------------------------------------------------------
//  Distribution Engine — data + per-company helpers.
//
//  Channel mix per company is read live from the source-backed channel-mix
//  snapshot (`distribution-channel-mix.json`), built by the IRDAI NL-36/NL-40
//  business-acquisition pipeline (DRHP + annual-report + public-disclosure
//  forms, fetched via GitHub Actions). Each company surfaces exactly the fiscal
//  years the source reports — Niva Bupa FY22→FY25, Care Health FY13→FY26 —
//  and new years appear automatically as the snapshot refreshes. Insurers the
//  source does not yet split show an explicit "not wired" state rather than
//  fabricated history.
//
//  Reach-depth (region / tier / city) data is not in the snapshot yet — the
//  reach-depth panel renders an EmptyState until source-backed numbers are
//  wired through this file.
// ---------------------------------------------------------------------------

import { insurers, PEER_GROUP_LABEL } from '@/data/mockData'
import channelMixSnapshot from '@/data/snapshots/distribution-channel-mix.json'
import type { Insurer, PeerGroup } from '@/data/types'
import { getFilteredInsurers } from '@/lib/insurers'

/** A fiscal-year label present in the channel-mix snapshot, e.g. "FY25". */
export type DistPeriodKey = string

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

// Per-company channel mix (% of GWP), read live from the source-backed
// `distribution-channel-mix.json` snapshot. We take the full-fiscal-year
// ("annual") rows so the trend reads on a clean FY axis; the snapshot's
// cumulative (9M/H1/Q) rows are left to other views. Each company carries
// exactly the years the official forms report — no fabricated history.
interface ChannelMixSnapshotRow {
  company_id: string
  period: string
  fiscal_year: string
  period_type: string
  banca_share: number | null
  broker_share: number | null
  agent_share: number | null
  corporate_agent_share: number | null
  direct_share: number | null
  online_share: number | null
  others_share: number | null
}

function fyNum(period: string): number {
  const m = /FY(\d{2,4})/.exec(period)
  return m ? Number(m[1]) : 0
}

function buildChannelMix(): Record<string, ChannelMixRow[]> {
  const out: Record<string, ChannelMixRow[]> = {}
  const rows = (channelMixSnapshot.data as ChannelMixSnapshotRow[]).filter(
    (r) => r.period_type === 'annual',
  )
  for (const r of rows) {
    // Require the core share fields — never coerce a missing split to a fake 0.
    if (r.banca_share == null || r.broker_share == null || r.agent_share == null) continue
    ;(out[r.company_id] ??= []).push({
      period: r.fiscal_year,
      Banca: r.banca_share,
      Brokers: r.broker_share,
      Agents: r.agent_share,
      'Corporate Agents': r.corporate_agent_share ?? 0,
      Direct: r.direct_share ?? 0,
      Others: (r.others_share ?? 0) + (r.online_share ?? 0),
    })
  }
  for (const id of Object.keys(out)) out[id].sort((a, b) => fyNum(a.period) - fyNum(b.period))
  return out
}

export const distributionEngineMix: Record<string, ChannelMixRow[]> = buildChannelMix()

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
