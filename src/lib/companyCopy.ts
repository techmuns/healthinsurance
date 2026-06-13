// ---------------------------------------------------------------------------
// Company-aware copy + derived-metric helpers.
//
// Every section that used to hard-code "Niva Bupa…" sentences now pulls its
// verdict text, KPIs, and investor-read lines from these helpers. They are
// keyed entirely on the `Insurer` snapshot record + `peerGroup`, so any of
// the 9 mock insurers renders a meaningful section.
//
// Helpers are pure: no React, no recharts, no mockData mutations.
// ---------------------------------------------------------------------------

import type { Insurer, PeerGroup, Signal, TimePeriod } from '@/data/types'
import { insurers, PEER_GROUP_LABEL } from '@/data/mockData'
import { getFilteredInsurers, getRankByMetric } from '@/lib/insurers'
import { getLatestAnnualFyLabel } from '@/lib/dataLayer'

export type CopyTone = 'teal' | 'positive' | 'navy' | 'warning' | 'negative'

export interface ReadLine {
  label: string
  value: string
}

export interface SectionCopy {
  /** Eyebrow above the verdict, e.g. "Distribution Verdict". */
  eyebrow: string
  /** Headline verdict, 2-5 words. */
  verdict: string
  tone: CopyTone
  /** Status pill word ("Strong" / "Watch" / etc.). */
  badge: string
  /** One-line plain-English support. */
  summary: string
  /** Closing "Investor Read" lines. */
  readLines: ReadLine[]
}

// ─── Period formatting ─────────────────────────────────────────────────────

/** Returns the latest period label. Annual is derived from the snapshot's real
 *  latest fiscal year (never a hardcoded year, per the honest-period-label rule). */
export function formatPeriodLabel(period: TimePeriod): string {
  switch (period) {
    case 'Annual':
      return getLatestAnnualFyLabel()
    case 'Quarterly':
      return 'Q4 FY25'
    case 'Monthly':
      return 'Apr FY26'
  }
}

/** Returns the trailing-window label ("FY23 → FY26", "Q1–Q4 FY25"…). */
export function formatPeriodWindow(period: TimePeriod): string {
  switch (period) {
    case 'Annual':
      return 'FY23 → FY26'
    case 'Quarterly':
      return 'Q1 → Q4 FY25'
    case 'Monthly':
      return 'last 12 months'
  }
}

// ─── Signal helpers ────────────────────────────────────────────────────────

const SIGNAL_TONE: Record<Signal, CopyTone> = {
  Strong: 'positive',
  Improving: 'teal',
  Watch: 'warning',
  Weak: 'negative',
}

export function toneFromSignal(signal: Signal): CopyTone {
  return SIGNAL_TONE[signal]
}

function bps(pp: number): string {
  return `${pp >= 0 ? '+' : ''}${(pp * 100).toFixed(0)} bps`
}

function pct(v: number, digits = 1): string {
  return `${v.toFixed(digits)}%`
}

// ─── Market Engine ─────────────────────────────────────────────────────────

export interface MarketBridgeChip {
  value: string
  label: string
  tone: 'teal' | 'navy' | 'gold'
}

export interface MarketBridge {
  title: string
  badge: string
  badgeTone: CopyTone
  chips: MarketBridgeChip[]
  miniTitle: string
  trajectory: { label: string; share: number }[]
  closingLine: string
}

/**
 * Returns the per-company bridge between the industry story and the company.
 * Chips that are N/A for a segment (Life has no retailMix) are swapped for
 * peer-rank chips so the block never renders empty cards.
 */
export function getCompanyMarketBridge(company: Insurer, peerGroup: PeerGroup): MarketBridge {
  const peerList = getFilteredInsurers({ peerGroup, highlightedCompany: company.id })
  const growthRank = getRankByMetric('growth', company, peerList)
  const shareRank = getRankByMetric('marketShare', company, peerList)
  const groupLabel = PEER_GROUP_LABEL[peerGroup]

  const hasRetail = company.retailMix > 0
  const retailShare = hasRetail ? (company.marketShare * company.retailMix) / 100 : 0
  const trajectory = getRetailShareTrajectory(company)

  // Pick the bridge headline based on growth-rank and share-change direction.
  let title = `${company.shortName} is participating in the shift`
  let closingLine = `${company.shortName} is moving with the structural shift in its segment.`
  let badge = 'Tracking'
  let badgeTone: CopyTone = 'navy'

  if (company.marketShareChange > 0.5 && company.growth > 18) {
    title = `${company.shortName} is riding the specialist shift`
    closingLine = `${company.shortName} is not just present in the right market — it is gaining share inside it.`
    badge = 'Gaining share'
    badgeTone = 'teal'
  } else if (company.marketShareChange > 0) {
    title = `${company.shortName} is holding share as the market expands`
    closingLine = `${company.shortName} is keeping pace with its segment and inching share higher.`
    badge = 'Holding share'
    badgeTone = 'navy'
  } else if (company.marketShareChange <= -0.05) {
    title = `${company.shortName} is ceding share to faster peers`
    closingLine = `${company.shortName} is in the right segment but is losing share to faster-growing peers.`
    badge = 'Ceding share'
    badgeTone = 'warning'
  } else if (company.peerGroup === 'General') {
    title = `${company.shortName} owns the scale position`
    closingLine = `${company.shortName} compounds at market pace from a leading scale position.`
    badge = 'Scale leader'
    badgeTone = 'navy'
  } else if (company.peerGroup === 'Life') {
    title = `${company.shortName} compounds the life franchise`
    closingLine = `${company.shortName} is a steady compounder in a slower, scale-driven life pool.`
    badge = 'Compounding'
    badgeTone = 'navy'
  }

  const chips: MarketBridgeChip[] = []
  chips.push({ value: pct(company.growth), label: `${company.shortName} GWP YoY · ${formatPeriodLabel('Annual')}`, tone: 'teal' })

  if (hasRetail) {
    chips.push({ value: pct(retailShare, 2), label: `Estimated retail GWP share`, tone: 'navy' })
    chips.push({ value: bps(company.marketShareChange), label: `Segment share gain (YoY)`, tone: 'gold' })
    chips.push({ value: pct(company.marketShare, 1), label: `Segment market share`, tone: 'navy' })
  } else {
    // Life / General without a retail mix focus → swap to peer-rank chips so
    // the block keeps four equal-weight signals.
    chips.push({
      value: `#${shareRank || '–'}${peerList.length ? ` / ${peerList.length}` : ''}`,
      label: `Share rank within ${groupLabel.toLowerCase()}`,
      tone: 'navy',
    })
    chips.push({ value: bps(company.marketShareChange), label: `Segment share change (YoY)`, tone: 'gold' })
    chips.push({
      value: `#${growthRank || '–'}${peerList.length ? ` / ${peerList.length}` : ''}`,
      label: `Growth rank within ${groupLabel.toLowerCase()}`,
      tone: 'navy',
    })
  }

  const miniTitle = hasRetail ? `${company.shortName} retail market share` : `${company.shortName} segment market share`

  return { title, badge, badgeTone, chips, miniTitle, trajectory, closingLine }
}

/**
 * Builds a 4-point share trajectory from the company snapshot. We don't have
 * a real historical series for every insurer, so we back-cast linearly from
 * the latest share using `marketShareChange`. Clearly an estimate — captions
 * elsewhere call it out as illustrative.
 */
export function getRetailShareTrajectory(company: Insurer): { label: string; share: number }[] {
  const latest = company.retailMix > 0
    ? (company.marketShare * company.retailMix) / 100
    : company.marketShare
  const totalGain = company.marketShareChange * 3 // 3 years × YoY change
  const start = Math.max(0.1, latest - totalGain)
  const labels = ['FY23', 'FY24', 'FY25', 'FY26']
  const step = (latest - start) / 3
  return labels.map((label, i) => ({
    label,
    share: Math.round((start + step * i) * 100) / 100,
  }))
}

/**
 * Hero subtitle on the Market Engine — the part that used to literally say
 * "before we even look at Niva Bupa". Now framed around whichever company is
 * selected.
 */
export function getCompanyMarketEngineHeroSub(company: Insurer): string {
  if (company.id === 'niva-bupa') {
    return `The industry tailwind is strong before we even look at ${company.shortName}.`
  }
  return `The industry tailwind is strong before we narrow in on ${company.shortName}.`
}

/** Closing strip on the Market Engine section. */
export function getCompanyTakeawayLine(company: Insurer): string {
  if (company.marketShareChange > 0.5 && company.growth > 18) {
    return `Health is the fastest structural pool in GI, SAHIs are gaining share, and ${company.shortName} is compounding faster than the market.`
  }
  if (company.marketShareChange > 0) {
    return `Health is the fastest structural pool in GI and ${company.shortName} is keeping pace with the shift toward specialists.`
  }
  if (company.marketShareChange <= -0.05) {
    return `The market is shifting toward specialists; ${company.shortName} needs to defend share to stay in the structural read.`
  }
  if (company.peerGroup === 'General') {
    return `Health is the fastest structural pool in GI; ${company.shortName} participates through its diversified general book.`
  }
  if (company.peerGroup === 'Life') {
    return `General-insurance health is the structural pool; ${company.shortName}'s life franchise compounds on a separate trajectory.`
  }
  return `Health is the fastest structural pool in GI and ${company.shortName} is participating in the shift.`
}

// ─── Distribution ──────────────────────────────────────────────────────────

export function getCompanyDistributionCopy(company: Insurer): SectionCopy {
  const retail = company.retailMix
  const isHealth = company.peerGroup === 'SAHI'
  const isHighRetail = retail >= 60

  let verdict: string
  let tone: CopyTone
  let badge: string
  let summary: string
  let readLines: ReadLine[]

  if (isHighRetail) {
    verdict = 'Retail-led, scalable'
    tone = 'teal'
    badge = 'Strong'
    summary = `${company.shortName} runs a retail-skewed book (${retail}% retail mix), with productivity rising as the channel base expands.`
    readLines = [
      { label: 'Why', value: `${retail}% retail mix supports persistency and pricing power.` },
      { label: 'Implication', value: `Distribution is a structural advantage, not a fragile dependency.` },
      { label: 'Watch', value: `Banca share of fresh premium and EOM-norm impact.` },
      { label: 'Read', value: `Continued retail growth would deepen the channel moat.` },
    ]
  } else if (retail >= 35) {
    verdict = 'Scalable, but banca-concentrated'
    tone = 'warning'
    badge = 'Watch'
    summary = `${company.shortName} is growing the agent base, but banca takes a meaningful share of fresh premium — the channel-concentration watch-item.`
    readLines = [
      { label: 'Why', value: `Productivity is improving; banca tilt is the open watch.` },
      { label: 'Implication', value: `Scalable engine — channel mix needs monitoring.` },
      { label: 'Watch', value: `Banca share of fresh premium.` },
      { label: 'Read', value: `De-risking via agency/digital would re-rate the channel story.` },
    ]
  } else if (isHealth) {
    verdict = 'Channel build-out in progress'
    tone = 'warning'
    badge = 'Watch'
    summary = `${company.shortName} has lower retail penetration than scale SAHIs; channel breadth is the gating item for growth quality.`
    readLines = [
      { label: 'Why', value: `Retail mix below the SAHI median.` },
      { label: 'Implication', value: `Persistency and pricing power are still being built.` },
      { label: 'Watch', value: `Net agent additions and renewal mix next quarter.` },
      { label: 'Read', value: `Improving retail mix would meaningfully de-risk distribution.` },
    ]
  } else {
    // General / Life — group-led
    verdict = 'Group-led, scale-driven'
    tone = 'navy'
    badge = 'Stable'
    summary = `${company.shortName} runs a wholesale-tilted book typical of its segment; channel scale and broker breadth are the moat.`
    readLines = [
      { label: 'Why', value: `Group / motor / banca channels carry the volume.` },
      { label: 'Implication', value: `Distribution is scale-anchored, not retail-anchored.` },
      { label: 'Watch', value: `Group renewal pricing and broker concentration.` },
      { label: 'Read', value: `Mix shift toward retail health would lift the channel quality score.` },
    ]
  }

  return { eyebrow: 'Distribution Verdict', verdict, tone, badge, summary, readLines }
}

// ─── Profitability & Capital ───────────────────────────────────────────────

export function getCompanyProfitabilityCopy(company: Insurer): SectionCopy {
  const cr = company.combinedRatio
  const hasCR = cr > 0
  const margin = company.margin
  const solvency = company.solvency

  let verdict: string
  let tone: CopyTone
  let badge: string
  let summary: string
  let readLines: ReadLine[]

  if (!hasCR) {
    // Life carrier — no combined ratio in IGAAP. Pivot to VNB-style framing.
    verdict = 'Steady profitability, life book'
    tone = 'navy'
    badge = 'Stable'
    summary = `${company.shortName} reports a life P&L: combined ratio is N/A; ROE of ${pct(company.roe)} anchors the read with solvency at ${solvency.toFixed(2)}x.`
    readLines = [
      { label: 'Why', value: `Returns are stable on a life-VNB framework.` },
      { label: 'Implication', value: `Profitability is scale-led, not underwriting-led.` },
      { label: 'Watch', value: `Margin mix shift between par and non-par.` },
      { label: 'Read', value: `Watch VNB margin and persistency over combined ratio.` },
    ]
  } else if (cr < 98 && margin > 1.5) {
    verdict = 'Underwriting profitable'
    tone = 'positive'
    badge = 'Strong'
    summary = `Combined ratio of ${pct(cr)} is below 100 with ROE of ${pct(company.roe)} and solvency of ${solvency.toFixed(2)}x — underwriting is converting to capital returns.`
    readLines = [
      { label: 'Why', value: `Combined ratio below 100 with healthy ROE.` },
      { label: 'Implication', value: `Growth is converting into quality returns.` },
      { label: 'Watch', value: `Loss-ratio trend in the next quarter.` },
      { label: 'Read', value: `Profitability inflection supports a quality re-rating.` },
    ]
  } else if (cr < 100) {
    verdict = 'Just underwriting profitable'
    tone = 'warning'
    badge = 'Watch'
    summary = `Combined ratio of ${pct(cr)} sits just under 100 — thin underwriting margin; ROE of ${pct(company.roe)} carries the return.`
    readLines = [
      { label: 'Why', value: `Combined ratio close to break-even.` },
      { label: 'Implication', value: `Margin headroom is limited.` },
      { label: 'Watch', value: `Loss-ratio drift and expense discipline.` },
      { label: 'Read', value: `A leg down in combined ratio would re-rate the stock.` },
    ]
  } else {
    verdict = 'Underwriting in the red'
    tone = 'negative'
    badge = 'Weak'
    summary = `Combined ratio of ${pct(cr)} is above 100 — underwriting loss; ROE of ${pct(company.roe)} is investment-led.`
    readLines = [
      { label: 'Why', value: `Combined ratio above 100 — underwriting loss.` },
      { label: 'Implication', value: `Profitability hinges on investment book.` },
      { label: 'Watch', value: `Path to a sub-100 combined ratio.` },
      { label: 'Read', value: `Re-rating waits on underwriting discipline.` },
    ]
  }

  return { eyebrow: 'Profitability Verdict', verdict, tone, badge, summary, readLines }
}

// ─── Valuation ─────────────────────────────────────────────────────────────

export function getCompanyValuationCopy(company: Insurer, peerGroup: PeerGroup): SectionCopy {
  // Unlisted carriers carry no P/GWP (the model uses 0 = N/A). Never compute a
  // "% vs median" against a zero — that would fabricate a "deep discount"/NaN
  // read for a company that simply has no market valuation.
  if (company.valuation <= 0) {
    return {
      eyebrow: 'Valuation Verdict',
      verdict: 'Not market-listed',
      tone: 'navy',
      badge: 'NA',
      summary: `${company.shortName} is not separately listed, so there is no P/GWP multiple to compare against peers.`,
      readLines: [
        { label: 'Why', value: `No public market price for ${company.shortName}.` },
        { label: 'Implication', value: `Read valuation off transactions or the listed peers as a proxy.` },
        { label: 'Watch', value: `Any listing event or primary capital raise.` },
        { label: 'Read', value: `Operating quality vs listed peers is the cleaner lens here.` },
      ],
    }
  }
  const peerList = getFilteredInsurers({ peerGroup, highlightedCompany: company.id })
  const peerVals = peerList.filter((i) => i.valuation > 0).map((i) => i.valuation).sort((a, b) => a - b)
  const n = peerVals.length
  const median =
    n === 0
      ? company.valuation
      : n % 2
        ? peerVals[(n - 1) / 2]
        : (peerVals[n / 2 - 1] + peerVals[n / 2]) / 2
  const premium = ((company.valuation - median) / median) * 100

  let verdict: string
  let tone: CopyTone
  let badge: string
  let summary: string
  let readLines: ReadLine[]

  if (premium > 15) {
    verdict = 'Premium — earned on quality'
    tone = 'navy'
    badge = 'Fair'
    summary = `${company.shortName} trades at ${company.valuation.toFixed(1)}x P/GWP — ~${premium.toFixed(0)}% above the ${PEER_GROUP_LABEL[peerGroup].toLowerCase()} median (${median.toFixed(1)}x). The premium is backed by growth quality and share gains.`
    readLines = [
      { label: 'Why', value: `Premium multiple is backed by growth quality and share gains.` },
      { label: 'Implication', value: `Acceptable entry, but limited margin of safety.` },
      { label: 'Watch', value: `Any slip in combined ratio or growth.` },
      { label: 'Read', value: `Own for quality; add on valuation resets.` },
    ]
  } else if (premium > -10) {
    verdict = 'Around peer median'
    tone = 'teal'
    badge = 'Fair'
    summary = `${company.shortName} trades at ${company.valuation.toFixed(1)}x P/GWP — broadly in line with the ${PEER_GROUP_LABEL[peerGroup].toLowerCase()} median of ${median.toFixed(1)}x.`
    readLines = [
      { label: 'Why', value: `Valuation roughly matches peer median.` },
      { label: 'Implication', value: `Re-rating depends on relative growth-quality trajectory.` },
      { label: 'Watch', value: `Earnings revisions vs peers.` },
      { label: 'Read', value: `Watch growth-quality leadership for the next leg.` },
    ]
  } else {
    verdict = 'Discount to peers'
    tone = 'teal'
    badge = 'Cheap'
    summary = `${company.shortName} trades at ${company.valuation.toFixed(1)}x P/GWP — ~${Math.abs(premium).toFixed(0)}% below the ${PEER_GROUP_LABEL[peerGroup].toLowerCase()} median (${median.toFixed(1)}x).`
    readLines = [
      { label: 'Why', value: `Below-median multiple despite participation in the sector pool.` },
      { label: 'Implication', value: `Risk-reward improves if growth quality holds.` },
      { label: 'Watch', value: `Catalysts that close the discount.` },
      { label: 'Read', value: `Value setup if execution stays clean.` },
    ]
  }

  return { eyebrow: 'Valuation Verdict', verdict, tone, badge, summary, readLines }
}

// ─── Ownership ─────────────────────────────────────────────────────────────

export function getCompanyOwnershipCopy(company: Insurer): SectionCopy {
  // We have no per-company ownership snapshot in mock; copy is anchored on
  // the company name and the implied investor backdrop for that segment.
  const isHealth = company.peerGroup === 'SAHI'
  const verdict = isHealth ? 'Quality institutions accumulating' : 'Stable institutional register'
  const summary = isHealth
    ? `${company.shortName}'s register is rotating toward long-only FIIs; no large exit overhang remains in the shareholder base.`
    : `${company.shortName}'s register skews toward long-duration domestic and foreign institutions, with stable promoter alignment.`
  return {
    eyebrow: 'Ownership Signal',
    verdict,
    tone: 'positive',
    badge: 'Improving',
    summary,
    readLines: [
      { label: 'Why', value: `Quality institutions hold the bulk of float around ${company.shortName}.` },
      { label: 'Implication', value: `Supportive ownership backdrop, no obvious exit overhang.` },
      { label: 'Watch', value: `Any block deal from a single large holder.` },
      { label: 'Read', value: `Register skew supports a quality re-rating window.` },
    ],
  }
}

// ─── Management Events ─────────────────────────────────────────────────────

export function getCompanyManagementCopy(company: Insurer): SectionCopy {
  return {
    eyebrow: 'Governance Signal',
    verdict: 'Credible team, watch-items tracked',
    tone: 'navy',
    badge: 'On Track',
    summary: `${company.shortName}'s management has broadly delivered on quantified guidance; remaining items are tracked in the promise tracker.`,
    readLines: [
      { label: 'Why', value: `Measurable promises have broadly been delivered at ${company.shortName}.` },
      { label: 'Implication', value: `Credible management where targets are quantified.` },
      { label: 'Watch', value: `Open promises tracked on this page.` },
      { label: 'Read', value: `No governance red flags; execution credibility intact.` },
    ],
  }
}

// ─── Company Growth (Premium Engine) ───────────────────────────────────────

export function getCompanyGrowthCopy(company: Insurer): SectionCopy {
  const growth = company.growth
  const retail = company.retailMix
  const hasRetail = retail > 0
  const hasCR = company.combinedRatio > 0

  let verdict: string
  let tone: CopyTone
  let badge: string
  let summary: string
  let readLines: ReadLine[]

  if (hasRetail) {
    if (growth >= 20 && retail >= 55) {
      verdict = 'Growing — and the growth is high quality'
      tone = 'teal'
      badge = 'Strong'
      summary = `${company.shortName}'s premium expansion (${pct(growth)}) is led by retail mix (${retail}%) and renewals — not low-margin group business — so the growth is more durable.`
      readLines = [
        { label: 'Why', value: `Retail mix, renewals and share gains drive premium at ${company.shortName}.` },
        { label: 'Implication', value: `Growth quality is high if retention and earned-premium conversion stay strong.` },
        { label: 'Watch', value: `Fresh-premium concentration by channel and claims pressure.` },
        { label: 'Read', value: `Durable compounding if retail mix and renewal strength continue.` },
      ]
    } else if (growth >= 15) {
      verdict = 'Growing — quality mix to watch'
      tone = 'navy'
      badge = 'Improving'
      summary = `${company.shortName} is growing premium at ${pct(growth)}, but ${retail < 55 ? `retail mix sits at ${retail}%` : 'mix quality is mid-tier'} — growth durability depends on improving renewal share.`
      readLines = [
        { label: 'Why', value: `Solid GWP growth at ${pct(growth)} with ${retail}% retail mix.` },
        { label: 'Implication', value: `Quality of growth is the differentiator; mix needs to keep improving.` },
        { label: 'Watch', value: `Retail-mix trend and renewal premium share.` },
        { label: 'Read', value: `Re-rating likely if the mix shifts toward retail.` },
      ]
    } else {
      verdict = 'Slower compounder'
      tone = 'warning'
      badge = 'Watch'
      summary = `${company.shortName}'s premium growth is ${pct(growth)} — below the sector tailwind; mix and renewal quality carry the long-term read.`
      readLines = [
        { label: 'Why', value: `Premium growth is trailing the segment pool.` },
        { label: 'Implication', value: `Capital allocation needs to support faster fresh-business acquisition.` },
        { label: 'Watch', value: `Net new policies and channel productivity.` },
        { label: 'Read', value: `Watch for a growth inflection before re-rating.` },
      ]
    }
  } else {
    // Life carrier — combined ratio is N/A; quality comes from VNB-style mix.
    verdict = 'Steady life compounder'
    tone = 'navy'
    badge = 'Stable'
    summary = `${company.shortName} grows the life book at ${pct(growth)}; persistency and product mix carry the quality read on a life P&L.`
    readLines = [
      { label: 'Why', value: `Life premium grows ${pct(growth)} on a scale-led book.` },
      { label: 'Implication', value: `Growth quality is VNB-led, not underwriting-led.` },
      { label: 'Watch', value: `13M / 61M persistency and par/non-par mix shift.` },
      { label: 'Read', value: `Steady compounding if persistency holds and mix tilts to non-par.` },
    ]
  }

  // Silence unused but kept for future expansion of growth copy.
  void hasCR

  return { eyebrow: 'Growth Verdict', verdict, tone, badge, summary, readLines }
}

// ─── Convenience ──────────────────────────────────────────────────────────

export function getCompanyById(id: string): Insurer {
  return insurers.find((i) => i.id === id) ?? insurers[0]
}
