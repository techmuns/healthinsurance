// ---------------------------------------------------------------------------
//  Valuation data — REAL, source-backed figures only.
//
//  Every number below is tied to a record in `valuationSources.ts` via a
//  `sourceId`. There is no mock data in this file. Where a credible source does
//  not exist (e.g. private-company equity value) the field is `null` and the UI
//  renders an honest "Source pending" marker — never a fabricated number.
//
//  Focal company: Niva Bupa (NSE: NIVABUPA). All figures cross-checked against
//  the company's audited FY26 results (8 May 2026), NSE/Screener market data and
//  Investing.com analyst consensus. Last checked 2026-06-01.
// ---------------------------------------------------------------------------

import streetSnapshot from '@/data/snapshots/street-analyst-snapshot.json'
import valuationFundamentals from '@/data/snapshots/valuation-fundamentals-snapshot.json'
import type { StreetAnalystSnapshot } from '@/data/snapshots/_schemas'

// Quarterly-refreshed reported financials (GWP / PAT / growth / retail share) for
// the listed health insurers — written by scripts/ingest/valuation-fundamentals-
// agent.ts. The Valuation tab reads the latest fiscal year per company from here
// and derives the multiples live; the curated seeds below are the fallback.
interface FundamentalsRow {
  company_id: string
  fiscal_year: string
  gwp: number | null
  gwp_growth_yoy: number | null
  pat: number | null
  pat_growth_yoy: number | null
  retail_share: number | null
  retail_share_delta_bps: number | null
}
const FUND_ROWS = (valuationFundamentals.data as FundamentalsRow[]) ?? []
const _fyNum = (fy: string) => Number(fy.replace(/^FY/, '')) || 0
/** Latest fiscal-year fundamentals row for a company (newest FY first), or null. */
function latestFundamentals(companyId: string): FundamentalsRow | null {
  return FUND_ROWS.filter((r) => r.company_id === companyId).sort((a, b) => _fyNum(b.fiscal_year) - _fyNum(a.fiscal_year))[0] ?? null
}
function fundamentalsFor(companyId: string, fy: string): FundamentalsRow | null {
  return FUND_ROWS.find((r) => r.company_id === companyId && r.fiscal_year === fy) ?? null
}
const r2 = (v: number) => Math.round(v * 100) / 100
const r1 = (v: number) => Math.round(v * 10) / 10

// Broker rating vocabulary, ordered bullish → bearish. "Add" (accumulate) sits
// on the buy side; "Equal-weight" is a neutral/hold stance; "Reduce" leans sell.
export type Rating = 'Buy' | 'Add' | 'Hold' | 'Equal-weight' | 'Reduce' | 'Sell'
export type Listing = 'Listed' | 'Unlisted'
export type ValConfidence = 'verified' | 'secondary' | 'pending'

/** The valuation page is sourced for the focal listed name only. */
export const FOCAL_VALUATION_ID = 'niva-bupa'

// ── Market snapshot ─────────────────────────────────────────────────────────
export interface MarketSnapshot {
  company: string
  ticker: string
  currentPrice: number // ₹  — sourceId niva-price
  priceAsOf: string
  marketCap: number // ₹ Cr — sourceId niva-mcap
  weekHigh52: number // sourceId niva-52wk
  weekLow52: number
  ipoPrice: number // sourceId niva-ipo
  listPrice: number
  listDate: string
}

const seedMarketSnapshot: MarketSnapshot = {
  company: 'Niva Bupa',
  ticker: 'NSE: NIVABUPA',
  currentPrice: 83.5,
  priceAsOf: '1 Jun 2026',
  marketCap: 15576,
  weekHigh52: 95.21,
  weekLow52: 67.5,
  ipoPrice: 74,
  listPrice: 78.14,
  listDate: '14 Nov 2024',
}

// Parsed view of the daily Moneycontrol snapshot, shared by the overlays below.
const streetData = streetSnapshot as unknown as StreetAnalystSnapshot

// Live market-quote overlay: current price + 52-week range come from the daily
// Moneycontrol pricefeed when present, else the seed values (never blanked).
// Market cap tracks the live price via the seed's implied shares (≈ constant),
// so the derived multiples move with the price rather than a frozen snapshot.
const _livePrice =
  streetData?.market?.current_price ?? streetData?.consensus?.current_price ?? seedMarketSnapshot.currentPrice
const _impliedShares = seedMarketSnapshot.marketCap / seedMarketSnapshot.currentPrice
export const marketSnapshot: MarketSnapshot = {
  ...seedMarketSnapshot,
  currentPrice: _livePrice,
  marketCap: Math.round(_livePrice * _impliedShares),
  weekHigh52: streetData?.market?.week_high_52 ?? seedMarketSnapshot.weekHigh52,
  weekLow52: streetData?.market?.week_low_52 ?? seedMarketSnapshot.weekLow52,
  priceAsOf: streetData?.market?.price_as_of ?? seedMarketSnapshot.priceAsOf,
}

// ── Reported financials used to build the multiples ─────────────────────────
export interface FocalFinancials {
  gwpFY26: number // ₹ Cr — sourceId niva-fy26-gwp
  gwpGrowthFY26: number // %
  patFY26: number // ₹ Cr — sourceId niva-fy26-pat (IFRS)
  patGrowthFY26: number // %
  netMarginFY26: number // % (PAT / GWP)
  retailShareFY26: number // % — sourceId niva-share
  retailShareDeltaBps: number
  gwpFY25: number // sourceId niva-fy25
  patFY25: number
}

// Overlaid from the quarterly fundamentals snapshot (latest FY per company);
// the curated seed values are the fallback if the snapshot is empty/pending.
const _focalLatest = latestFundamentals(FOCAL_VALUATION_ID)
const _focalPrior = fundamentalsFor(FOCAL_VALUATION_ID, 'FY25')
const _gwp26 = _focalLatest?.gwp ?? 9432.9
const _pat26 = _focalLatest?.pat ?? 366.1
export const focalFinancials: FocalFinancials = {
  gwpFY26: _gwp26,
  gwpGrowthFY26: _focalLatest?.gwp_growth_yoy ?? 27.4,
  patFY26: _pat26,
  patGrowthFY26: _focalLatest?.pat_growth_yoy ?? 80,
  netMarginFY26: (_pat26 / _gwp26) * 100, // ≈ 3.9%
  retailShareFY26: _focalLatest?.retail_share ?? 10.1,
  retailShareDeltaBps: _focalLatest?.retail_share_delta_bps ?? 76,
  gwpFY25: _focalPrior?.gwp ?? 7015,
  patFY25: _focalPrior?.pat ?? 203,
}

// ── Multiples (derived from the sourced components above) ────────────────────
export interface FocalMultiples {
  pGwp: number | null // sourceId niva-pgwp
  pe: number | null // sourceId niva-pe
  pb: number | null // sourceId niva-pb (secondary)
}

// Derived live: P/GWP and P/E = market cap (which tracks the daily price) ÷ the
// latest reported GWP / PAT — so they move with both the price (daily) and the
// financials (quarterly). P/B keeps its seed (it needs net worth, not yet fetched).
export const focalMultiples: FocalMultiples = {
  pGwp: _gwp26 > 0 ? r2(marketSnapshot.marketCap / _gwp26) : null,
  pe: _pat26 > 0 ? r1(marketSnapshot.marketCap / _pat26) : null,
  pb: 3.0,
}

// ── Analyst consensus ────────────────────────────────────────────────────────
export interface AnalystConsensus {
  currentPrice: number | null
  consensusTargetPrice: number | null // sourceId niva-consensus
  highestTargetPrice: number | null
  lowestTargetPrice: number | null
  analystCount: number
  buyCount: number
  holdCount: number
  sellCount: number
  ratingLabel: Rating
  lastUpdated: string
}

// Consensus reflects each covering broker's MOST RECENT note (see analystReports
// below): Motilal Oswal ₹97 (Buy), ICICI Securities ₹90 (Buy), JM Financial ₹84
// (Add), Morgan Stanley ₹88 (Equal-weight). Avg ₹89.8, range ₹84–97; 3 buy-side,
// 1 neutral, 0 sell. Add counts buy-side; Equal-weight counts neutral.
const seedAnalystConsensus: AnalystConsensus = {
  currentPrice: marketSnapshot.currentPrice,
  consensusTargetPrice: 89.8,
  highestTargetPrice: 97,
  lowestTargetPrice: 84,
  analystCount: 4,
  buyCount: 3,
  holdCount: 1,
  sellCount: 0,
  ratingLabel: 'Buy',
  lastUpdated: '10 May 2026',
}

// ── Analyst reports — only sourced rows; never fabricated ────────────────────
export interface AnalystReport {
  brokerage: string
  rating: Rating | null
  targetPrice: number | null
  reportDate: string
  thesis: string
  sourceId: string
  /** Direct source URL for dynamic (Moneycontrol-scraped) rows without a
   *  curated sourceId. When present, the "Open source" button uses it directly. */
  sourceUrl?: string
  confidence: ValConfidence
}

// Dated broker notes on record, newest first. Every row carries a real rating,
// target, date and a citable source (press coverage of the broker note) wired
// through `sourceId` → valuationSources.ts → the row's "Open source" button.
// Upside is computed live against the current price in the UI, never stored.
// Multiple notes from the same broker are kept as a history; the consensus
// above collapses them to each broker's latest view.
const seedAnalystReports: AnalystReport[] = [
  {
    brokerage: 'Motilal Oswal',
    rating: 'Buy',
    targetPrice: 97,
    reportDate: '10 May 2026',
    thesis: '4QFY26 NEP growth strong; operating efficiency offsetting higher claims.',
    sourceId: 'niva-mosl-may26',
    confidence: 'secondary',
  },
  {
    brokerage: 'JM Financial',
    rating: 'Add',
    targetPrice: 84,
    reportDate: 'Nov 2025',
    thesis: 'Claims ratio beat estimates; IFRS profitability on track, though EPS estimates trimmed.',
    sourceId: 'niva-jm-nov25',
    confidence: 'secondary',
  },
  {
    brokerage: 'ICICI Securities',
    rating: 'Buy',
    targetPrice: 90,
    reportDate: '6 Nov 2025',
    thesis: 'GST / input-tax-credit overhang addressed; stays bullish on Niva Bupa.',
    sourceId: 'niva-isec-nov25',
    confidence: 'secondary',
  },
  {
    brokerage: 'Motilal Oswal',
    rating: 'Buy',
    targetPrice: 92,
    reportDate: '3 Nov 2025',
    thesis: '2QFY26 NEP +17% YoY; claims & opex pressure noted, but Buy retained.',
    sourceId: 'niva-mosl-nov25',
    confidence: 'secondary',
  },
  {
    brokerage: 'ICICI Securities',
    rating: 'Buy',
    targetPrice: 92,
    reportDate: '11 Aug 2025',
    thesis: 'Bullish update; target maintained at ₹92.',
    sourceId: 'niva-isec-aug25',
    confidence: 'secondary',
  },
  {
    brokerage: 'Motilal Oswal',
    rating: 'Buy',
    targetPrice: 101,
    reportDate: '7 Aug 2025',
    thesis: 'Most bullish target on record; growth thesis retained despite claims pressure.',
    sourceId: 'niva-mosl-aug25',
    confidence: 'secondary',
  },
  {
    brokerage: 'Motilal Oswal',
    rating: 'Buy',
    targetPrice: 100,
    reportDate: '23 Apr 2025',
    thesis: 'Initiation-style bullish thesis: fast-growing health insurer, retail-health share gains.',
    sourceId: 'niva-mosl-apr25',
    confidence: 'secondary',
  },
  {
    brokerage: 'Morgan Stanley',
    rating: 'Equal-weight',
    targetPrice: 88,
    reportDate: '23 Dec 2024',
    thesis: 'Neutral-positive initiation; expects health-insurance tailwinds, but rating stays Equal-weight.',
    sourceId: 'niva-ms-dec24',
    confidence: 'secondary',
  },
]

// ── Live overlay ─────────────────────────────────────────────────────────────
// Street View reads its analyst coverage from the daily Moneycontrol snapshot
// (src/data/snapshots/street-analyst-snapshot.json), refreshed by the daily
// GitHub Action. The curated rows above are the SEED + fallback: if the snapshot
// is empty/pending (e.g. a first run before any successful fetch), the page
// shows the curated, source-backed coverage instead of going blank. A missing
// value is never coerced to a number — it stays null and renders as pending.

function deriveRatingLabel(buy: number | null, hold: number | null, sell: number | null): Rating | null {
  if (buy == null && hold == null && sell == null) return null
  const b = buy ?? 0
  const h = hold ?? 0
  const s = sell ?? 0
  if (b >= h && b >= s) return 'Buy'
  if (s > b && s > h) return 'Sell'
  return 'Hold'
}

function buildCoverage(): { consensus: AnalystConsensus; reports: AnalystReport[] } {
  const snap = streetData
  const hasReal =
    snap?._meta?.dataset !== 'pending' && Array.isArray(snap?.reports) && snap.reports.length > 0
  if (!hasReal) return { consensus: seedAnalystConsensus, reports: seedAnalystReports }

  const reports: AnalystReport[] = snap.reports.map((r) => ({
    brokerage: r.brokerage,
    rating: r.rating,
    targetPrice: r.target_price,
    reportDate: r.report_date,
    thesis: r.thesis ?? '',
    sourceId: r.source_id ?? '',
    sourceUrl: r.source_url ?? undefined,
    confidence: r.confidence,
  }))

  const c = snap.consensus
  const consensus: AnalystConsensus = {
    currentPrice: c.current_price ?? seedAnalystConsensus.currentPrice,
    consensusTargetPrice: c.consensus_target_price,
    highestTargetPrice: c.highest_target_price,
    lowestTargetPrice: c.lowest_target_price,
    analystCount: c.analyst_count ?? seedAnalystConsensus.analystCount,
    buyCount: c.buy_count ?? seedAnalystConsensus.buyCount,
    holdCount: c.hold_count ?? seedAnalystConsensus.holdCount,
    sellCount: c.sell_count ?? seedAnalystConsensus.sellCount,
    ratingLabel: deriveRatingLabel(c.buy_count, c.hold_count, c.sell_count) ?? seedAnalystConsensus.ratingLabel,
    lastUpdated: c.last_updated ?? seedAnalystConsensus.lastUpdated,
  }
  return { consensus, reports }
}

const _coverage = buildCoverage()

/** Consensus shown on Street View — daily Moneycontrol snapshot, seed fallback. */
export const analystConsensus: AnalystConsensus = _coverage.consensus
/** Per-broker notes shown on Street View — daily Moneycontrol snapshot, seed fallback. */
export const analystReports: AnalystReport[] = _coverage.reports

/** Distinct brokers behind the itemised notes (history collapses by broker). */
export const itemisedBrokerCount = new Set(analystReports.map((r) => r.brokerage)).size

/** Analysts in the consensus whose individual note isn't itemised above. */
export const coveragePendingCount = Math.max(0, analystConsensus.analystCount - itemisedBrokerCount)

// ── Analyst thesis — grounded in the FY26 filing + the cited broker note ─────
export interface AnalystThesis {
  bull: string[]
  bear: string[]
  risks: string[]
  catalysts: string[]
}

// Star's P/GWP on the same basis as the peer table, for the thesis comparison.
const _starPGwp = (() => {
  const s = latestFundamentals('star-health')
  const g = s?.gwp ?? 20369
  return g > 0 ? r2(30356 / g) : 1.49
})()

export const analystThesis: AnalystThesis = {
  // Each bull/bear point references a reported, sourced figure — the numbers are
  // templated from the live financials/multiples so the prose never drifts from
  // the tiles when the quarterly fetch refreshes them.
  bull: [
    `Fastest-growing listed SAHI: GWP +${Math.round(focalFinancials.gwpGrowthFY26)}% in FY26`,
    `PAT +${Math.round(focalFinancials.patGrowthFY26)}% YoY to ₹${Math.round(focalFinancials.patFY26)} Cr (FY26, IFRS)`,
    `Retail-health share up to ${focalFinancials.retailShareFY26}% (+${focalFinancials.retailShareDeltaBps} bps)`,
    'Combined service ratio 101.4% — improving (+160 bps)',
  ],
  bear: [
    `Trades at a ${(focalMultiples.pGwp ?? 0) >= _starPGwp ? 'premium' : 'discount'} to Star on P/GWP (${focalMultiples.pGwp?.toFixed(2)}x vs ${_starPGwp.toFixed(2)}x)`,
    'Profit base still small — margin must keep scaling',
    `P/E ≈ ${Math.round(focalMultiples.pe ?? 0)}x prices in years of compounding`,
    'Rising competitive & regulatory intensity in health',
  ],
  risks: ['Claims / medical inflation', 'Commission & distribution cost', 'Regulatory change (EOM, pricing)', 'Slower retail policy growth'],
  catalysts: ['Sustained 20%+ GWP growth', 'Further combined-ratio improvement', 'Retail share gains vs PSU pool', 'Persistency / renewal quality'],
}

// ── Peer valuation ────────────────────────────────────────────────────────────
export interface PeerValuationRow {
  companyId: string
  companyName: string
  listingStatus: Listing
  marketCap: number | null // ₹ Cr (listed = market; unlisted = null → pending)
  gwp: number | null // ₹ Cr, FY26
  pGwp: number | null
  pe: number | null
  growth: number | null // GWP YoY %
  confidence: ValConfidence
  sourceId: string
}

// Listed peer rows are built from the same quarterly fundamentals snapshot, with
// multiples derived (market cap ÷ reported GWP / PAT). Niva's market cap tracks
// the live price; peers use their seed market cap. Seed figures are the fallback.
function listedPeerRow(
  companyId: string,
  companyName: string,
  seedMcap: number,
  seedGwp: number,
  seedGrowth: number,
  seedPGwp: number,
  seedPe: number,
  sourceId: string,
): PeerValuationRow {
  const f = latestFundamentals(companyId)
  const mcap = companyId === FOCAL_VALUATION_ID ? marketSnapshot.marketCap : seedMcap
  const gwp = f?.gwp ?? seedGwp
  const pat = f?.pat ?? null
  return {
    companyId,
    companyName,
    listingStatus: 'Listed',
    marketCap: mcap,
    gwp,
    pGwp: gwp > 0 ? r2(mcap / gwp) : seedPGwp,
    pe: pat != null && pat > 0 ? r1(mcap / pat) : seedPe,
    growth: f?.gwp_growth_yoy ?? seedGrowth,
    confidence: 'secondary',
    sourceId,
  }
}

export const peerValuation: PeerValuationRow[] = [
  listedPeerRow('niva-bupa', 'Niva Bupa', 15576, 9432.9, 27.4, 1.65, 42.6, 'niva-pgwp'),
  listedPeerRow('star-health', 'Star Health', 30356, 20369, 16, 1.49, 33.3, 'star-pgwp'),
  { companyId: 'care-health', companyName: 'Care Health', listingStatus: 'Unlisted', marketCap: null, gwp: null, pGwp: null, pe: null, growth: null, confidence: 'pending', sourceId: 'unlisted-pending' },
  { companyId: 'aditya-birla', companyName: 'Aditya Birla Health', listingStatus: 'Unlisted', marketCap: null, gwp: null, pGwp: null, pe: null, growth: null, confidence: 'pending', sourceId: 'unlisted-pending' },
  { companyId: 'manipalcigna', companyName: 'ManipalCigna', listingStatus: 'Unlisted', marketCap: null, gwp: null, pGwp: null, pe: null, growth: null, confidence: 'pending', sourceId: 'unlisted-pending' },
]

export const UNLISTED_METHODOLOGY =
  'Care Health, Aditya Birla Health and ManipalCigna are unlisted — there is no live market price. We do not publish an equity value until a credible source (a funding round, a transaction benchmark or a filing) is on record. Marked "Source pending" rather than estimated.'
