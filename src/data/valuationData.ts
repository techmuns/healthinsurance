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

export type Rating = 'Buy' | 'Hold' | 'Sell'
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

export const marketSnapshot: MarketSnapshot = {
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

const _gwp26 = 9432.9
const _pat26 = 366.1
export const focalFinancials: FocalFinancials = {
  gwpFY26: _gwp26,
  gwpGrowthFY26: 27.4,
  patFY26: _pat26,
  patGrowthFY26: 80,
  netMarginFY26: (_pat26 / _gwp26) * 100, // ≈ 3.9%
  retailShareFY26: 10.1,
  retailShareDeltaBps: 76,
  gwpFY25: 7015,
  patFY25: 203,
}

// ── Multiples (derived from the sourced components above) ────────────────────
export interface FocalMultiples {
  pGwp: number | null // sourceId niva-pgwp
  pe: number | null // sourceId niva-pe
  pb: number | null // sourceId niva-pb (secondary)
}

export const focalMultiples: FocalMultiples = {
  pGwp: 1.65,
  pe: 42.6,
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

export const analystConsensus: AnalystConsensus = {
  currentPrice: marketSnapshot.currentPrice,
  consensusTargetPrice: 87.6,
  highestTargetPrice: 100,
  lowestTargetPrice: 76,
  analystCount: 8,
  buyCount: 8,
  holdCount: 0,
  sellCount: 0,
  ratingLabel: 'Buy',
  lastUpdated: 'May 2026',
}

// ── Analyst reports — only sourced rows; never fabricated ────────────────────
export interface AnalystReport {
  brokerage: string
  rating: Rating | null
  targetPrice: number | null
  reportDate: string
  thesis: string
  sourceId: string
  confidence: ValConfidence
}

// Per-broker analyst rows. Only Motilal Oswal has an individually citable note
// (via Business Standard) — it carries a real rating, target, date and source.
// The other brokers below are documented coverers of the name, but we cannot
// open a citable note for each, so their rating / target / date / thesis stay
// null and the row is shown as "Source pending" — NEVER invented. The 8-analyst
// Street consensus is carried separately in `analystConsensus`.
const PENDING_THESIS = 'Covers the stock; individual note not citable here yet.'
export const analystReports: AnalystReport[] = [
  {
    brokerage: 'Motilal Oswal',
    rating: 'Buy',
    targetPrice: 100,
    reportDate: '23 Apr 2025',
    thesis: 'Best-in-class retail-health growth; scale-led margin lever.',
    sourceId: 'niva-mosl',
    confidence: 'secondary',
  },
  { brokerage: 'Nuvama', rating: null, targetPrice: null, reportDate: '—', thesis: PENDING_THESIS, sourceId: '', confidence: 'pending' },
  { brokerage: 'Kotak Institutional Equities', rating: null, targetPrice: null, reportDate: '—', thesis: PENDING_THESIS, sourceId: '', confidence: 'pending' },
  { brokerage: 'ICICI Securities', rating: null, targetPrice: null, reportDate: '—', thesis: PENDING_THESIS, sourceId: '', confidence: 'pending' },
  { brokerage: 'Jefferies', rating: null, targetPrice: null, reportDate: '—', thesis: PENDING_THESIS, sourceId: '', confidence: 'pending' },
]

/** Analysts in the consensus whose individual note isn't itemised above. */
export const coveragePendingCount = Math.max(0, analystConsensus.analystCount - analystReports.length)

// ── Analyst thesis — grounded in the FY26 filing + the cited broker note ─────
export interface AnalystThesis {
  bull: string[]
  bear: string[]
  risks: string[]
  catalysts: string[]
}

export const analystThesis: AnalystThesis = {
  // Each bull/bear point references a reported, sourced figure.
  bull: [
    'Fastest-growing listed SAHI: GWP +27% in FY26',
    'PAT +80% YoY to ₹366 Cr (FY26, IFRS)',
    'Retail-health share up to 10.1% (+76 bps)',
    'Combined service ratio 101.4% — improving (+160 bps)',
  ],
  bear: [
    'Trades at a premium to Star on P/GWP (1.65x vs 1.49x)',
    'Profit base still small — margin must keep scaling',
    'P/E ≈ 43x prices in years of compounding',
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

export const peerValuation: PeerValuationRow[] = [
  {
    companyId: 'niva-bupa',
    companyName: 'Niva Bupa',
    listingStatus: 'Listed',
    marketCap: 15576,
    gwp: 9432.9,
    pGwp: 1.65,
    pe: 42.6,
    growth: 27.4,
    confidence: 'secondary',
    sourceId: 'niva-pgwp',
  },
  {
    companyId: 'star-health',
    companyName: 'Star Health',
    listingStatus: 'Listed',
    marketCap: 30356,
    gwp: 20369,
    pGwp: 1.49,
    pe: 33.3, // mkt cap ₹30,356 Cr ÷ FY26 PAT ₹911 Cr — same basis as Niva's P/E for a like-for-like compare
    growth: 16,
    confidence: 'secondary',
    sourceId: 'star-pgwp',
  },
  { companyId: 'care-health', companyName: 'Care Health', listingStatus: 'Unlisted', marketCap: null, gwp: null, pGwp: null, pe: null, growth: null, confidence: 'pending', sourceId: 'unlisted-pending' },
  { companyId: 'aditya-birla', companyName: 'Aditya Birla Health', listingStatus: 'Unlisted', marketCap: null, gwp: null, pGwp: null, pe: null, growth: null, confidence: 'pending', sourceId: 'unlisted-pending' },
  { companyId: 'manipalcigna', companyName: 'ManipalCigna', listingStatus: 'Unlisted', marketCap: null, gwp: null, pGwp: null, pe: null, growth: null, confidence: 'pending', sourceId: 'unlisted-pending' },
]

export const UNLISTED_METHODOLOGY =
  'Care Health, Aditya Birla Health and ManipalCigna are unlisted — there is no live market price. We do not publish an equity value until a credible source (a funding round, a transaction benchmark or a filing) is on record. Marked "Source pending" rather than estimated.'
