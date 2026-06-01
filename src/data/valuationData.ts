// ---------------------------------------------------------------------------
//  Valuation decision-dashboard data.
//
//  IMPORTANT: live analyst consensus, market price / market-cap and unlisted
//  valuations are NOT ingested yet. Everything in this file is ILLUSTRATIVE
//  MOCK, surfaced only so the decision dashboard reads as complete — every
//  consuming card tags it "Mock" and the verdict stays "Pending". Real metrics
//  (growth, margin, market share, P/GWP) are read from insurers[] in the UI.
// ---------------------------------------------------------------------------

export type Rating = 'Buy' | 'Hold' | 'Sell'
export type Confidence = 'High' | 'Medium' | 'Low'
export type Listing = 'Listed' | 'Unlisted'

export interface AnalystConsensus {
  currentPrice: number | null
  consensusTargetPrice: number | null
  highestTargetPrice: number | null
  lowestTargetPrice: number | null
  analystCount: number
  buyCount: number
  holdCount: number
  sellCount: number
  impliedUpsideDownside: number | null // % (consensus vs current)
  lastUpdated: string
  source: string
}

// Mock — broadly in line with sell-side framing for a fast-growing SAHI name.
export const analystConsensus: AnalystConsensus = {
  currentPrice: 540,
  consensusTargetPrice: 586,
  highestTargetPrice: 640,
  lowestTargetPrice: 510,
  analystCount: 8,
  buyCount: 6,
  holdCount: 2,
  sellCount: 0,
  impliedUpsideDownside: 8.5,
  lastUpdated: '2026-05-20',
  source: 'Mock consensus',
}

export interface AnalystReport {
  brokerage: string
  rating: Rating
  targetPrice: number | null
  impliedUpsideDownside: number | null
  reportDate: string
  source: string
  sourceType: string
  notes: string
}

// Mock — concise view summaries only (no report excerpts).
export const analystReports: AnalystReport[] = [
  { brokerage: 'JP Morgan', rating: 'Buy', targetPrice: 640, impliedUpsideDownside: 18.5, reportDate: '2026-05-14', source: 'Mock', sourceType: 'Sell-side note', notes: 'Best-in-class growth; re-rating on scale' },
  { brokerage: 'Motilal Oswal', rating: 'Buy', targetPrice: 620, impliedUpsideDownside: 14.8, reportDate: '2026-05-12', source: 'Mock', sourceType: 'Initiation', notes: 'Retail-health mix + margin lever' },
  { brokerage: 'Nuvama', rating: 'Buy', targetPrice: 610, impliedUpsideDownside: 13.0, reportDate: '2026-05-09', source: 'Mock', sourceType: 'Update', notes: 'Persistency and renewal quality improving' },
  { brokerage: 'ICICI Securities', rating: 'Buy', targetPrice: 600, impliedUpsideDownside: 11.1, reportDate: '2026-04-30', source: 'Mock', sourceType: 'Update', notes: 'Share gains vs PSU pool' },
  { brokerage: 'Jefferies', rating: 'Hold', targetPrice: 560, impliedUpsideDownside: 3.7, reportDate: '2026-05-06', source: 'Mock', sourceType: 'Update', notes: 'Growth priced in; await margin proof' },
  { brokerage: 'Kotak Institutional', rating: 'Hold', targetPrice: 555, impliedUpsideDownside: 2.8, reportDate: '2026-04-22', source: 'Mock', sourceType: 'Update', notes: 'Valuation rich vs near-term EV' },
]

export interface AnalystThesis {
  bull: string[]
  bear: string[]
  risks: string[]
  catalysts: string[]
  lastUpdated: string
  source: string
}

// Mock — recurring Street arguments, summarised (not excerpts).
export const analystThesis: AnalystThesis = {
  bull: ['Faster growth than peers', 'Improving profitability', 'Rising market share', 'Health-insurance penetration tailwind'],
  bear: ['Valuation already prices in growth', 'Margin volatility risk', 'Rising competitive intensity', 'Regulatory risk'],
  risks: ['Claims inflation', 'Commission / distribution cost', 'Regulatory change', 'Slower policy growth'],
  catalysts: ['Strong quarterly GWP growth', 'Margin improvement', 'Market-share gain', 'Better persistency / renewals'],
  lastUpdated: '2026-05',
  source: 'Mock — recurring Street themes',
}

export interface MarketStreetIntrinsic {
  currentMarketPrice: number | null
  marketCap: number | null // ₹ Cr
  consensusTargetPrice: number | null
  intrinsicBearValue: number | null
  intrinsicBaseValue: number | null
  intrinsicBullValue: number | null
  methodology: string
  source: string
}

// Mock — intrinsic = multiple-based + internal estimate (per-share, ₹).
export const marketStreetIntrinsic: MarketStreetIntrinsic = {
  currentMarketPrice: 540,
  marketCap: 25184, // ≈ P/GWP 3.4x × FY25 GWP 7,407 Cr (mock, internally consistent)
  consensusTargetPrice: 586,
  intrinsicBearValue: 470,
  intrinsicBaseValue: 560,
  intrinsicBullValue: 700,
  methodology: 'Multiple-based + internal estimate',
  source: 'Mock',
}

export interface PeerValuationRow {
  companyId: string
  companyName: string
  listingStatus: Listing
  marketCap: number | null // ₹ Cr (listed = market, unlisted = estimated equity value)
  pgwp: number | null
  pb: number | null
  pe: number | null
  valuationBasis: string
  confidence: Confidence
  source: string
}

// Mock valuation overlay keyed by company id. Real growth / margin / market
// share come from insurers[] in the UI; only the valuation fields are mock,
// and unlisted rows are explicitly "Estimated".
export const peerValuationOverlay: Record<string, PeerValuationRow> = {
  'niva-bupa': { companyId: 'niva-bupa', companyName: 'Niva Bupa', listingStatus: 'Listed', marketCap: 25184, pgwp: 3.4, pb: 2.7, pe: 31.6, valuationBasis: 'Market multiple', confidence: 'Medium', source: 'Mock' },
  'star-health': { companyId: 'star-health', companyName: 'Star Health', listingStatus: 'Listed', marketCap: 32600, pgwp: 3.6, pb: 3.0, pe: 38.0, valuationBasis: 'Market multiple', confidence: 'Medium', source: 'Mock' },
  'care-health': { companyId: 'care-health', companyName: 'Care Health', listingStatus: 'Unlisted', marketCap: 19500, pgwp: 3.0, pb: null, pe: null, valuationBasis: 'Comparable listed multiples', confidence: 'Low', source: 'Mock estimate' },
  'aditya-birla': { companyId: 'aditya-birla', companyName: 'Aditya Birla Health', listingStatus: 'Unlisted', marketCap: 13800, pgwp: 3.3, pb: null, pe: null, valuationBasis: 'Recent funding round', confidence: 'Low', source: 'Mock estimate' },
  manipalcigna: { companyId: 'manipalcigna', companyName: 'ManipalCigna', listingStatus: 'Unlisted', marketCap: 6200, pgwp: 2.4, pb: null, pe: null, valuationBasis: 'Industry estimate', confidence: 'Low', source: 'Mock estimate' },
}

export const UNLISTED_METHODOLOGY =
  'Unlisted valuations are estimates from comparable listed multiples, funding rounds, transaction benchmarks or industry estimates — not live market prices.'
