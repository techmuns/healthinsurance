// ===========================================================================
//  MOCK DATA  —  illustrative only, NOT real financials.
//  Every figure below is fabricated for layout/design purposes. Where a real
//  deployment would wire a data source, the `source` / `sourceUrl` fields show
//  the shape of the provenance the UI expects. Do not use for any decision.
// ===========================================================================

import type {
  DataStatus,
  Insurer,
  PeerGroup,
  SeriesPoint,
  Signal,
} from './types'
import { getInsurers, getFocalCompanyId, getDataFreshness } from '@/lib/dataLayer'
import { giPremiumAbsoluteSeries, giPremiumMixSeries } from '@/lib/industryStructure'

// --- Universe (single source of truth) -------------------------------------
// Every Executive Overview visual is derived from this array via the helpers in
// `@/lib/insurers`. `marketShare` is share of the insurer's own segment pool;
// `margin` is underwriting margin (100 − combined ratio). Life carriers report
// no combined ratio, so combinedRatio/margin/retailMix are 0 (= N/A) for them.

export const FOCAL_COMPANY = getFocalCompanyId()

export const PEER_GROUP_LABEL: Record<PeerGroup, string> = {
  SAHI: 'Standalone health insurers',
  General: 'General insurers',
  Life: 'Life insurers',
  All: 'Full insurer universe',
}

// The canonical insurer universe is now built from the official-source
// snapshots (company-master + insurer-annual-snapshot) via the data layer.
// Adding a company or a new fiscal year is a snapshot/ingest change — no edit
// here. Growth, margin, signal, takeaway and share-change are derived.
export const insurers: Insurer[] = getInsurers()

/** Back-compat alias — the highlight dropdown reads this. */
export const companies = insurers

// Freshness is derived from the annual snapshot meta (last_updated, coverage,
// dataset quality) so it reflects the real data, not a hardcoded date.
export const DATA_FRESHNESS = getDataFreshness()

// =========================================================================
//  QUARTERLY REVIEW LAYER  (PE quarterly-review logic — mock)
//  Standalone quarterly figures are derived from cumulative IRDAI/YTD
//  disclosures: Quarter = current YTD − previous YTD.
// =========================================================================

export const QUARTER = {
  current: 'Q4 FY25',
  previous: 'Q3 FY25',
  currentYtd: 'FY25 YTD (Mar)',
  previousYtd: '9M FY25 YTD (Dec)',
}

export const QUARTERLY_BASIS_NOTE =
  'Quarterly values are derived from cumulative IRDAI/YTD disclosures where standalone quarterly data is not directly reported.'

export interface BasisInfo {
  /** Premium/earnings basis, e.g. "GWP / NWP / NEP". */
  basis: string
  /** How the period figure is produced, e.g. "Quarterly derived from YTD". */
  method: string
  /** Accounting framework, e.g. "IGAAP" / "IGAAP / IndAS as available". */
  accounting: string
  source: string
  status: DataStatus
}

export const growthBasis: BasisInfo = {
  basis: 'GWP / NWP / NEP',
  method: 'Quarterly derived from YTD',
  accounting: 'IGAAP',
  source: 'IRDAI monthly disclosure',
  status: 'Derived',
}

export const profitabilityBasis: BasisInfo = {
  basis: 'PAT',
  method: 'As reported (1/n where applicable)',
  accounting: 'IGAAP / IndAS as available',
  source: 'Company filing',
  status: 'Reported',
}

/** A single cumulative-to-standalone bridge input for a metric. */
export interface YtdBridgeInput {
  label: string
  unit: string
  /** Current period cumulative/YTD value. null => Data pending. */
  currentYtd: number | null
  previousYtd: number | null
  basis: string
  source: string
  status: DataStatus
}

// =========================================================================
//  EXECUTIVE OVERVIEW
// =========================================================================

// --- Industry at a Glance (first-page visual summary) -------------------
// The donut and Industry-Leaders ranking are derived at render time from
// `insurers` via `@/lib/insurers` so they always reflect the active filters.

export interface ShareSlice {
  name: string
  value: number
  focal?: boolean
  id?: string
  takeaway?: string
}

export interface IndustryMetric {
  label: string
  value: string
  delta?: string
  /** What the delta is measured against, e.g. "vs last yr". */
  basis?: string
  positive?: boolean
  signal: Signal
  note?: string
}

// =========================================================================
//  SECTION 1 — MARKET LANDSCAPE
// =========================================================================


// --- Market Engine (industry GI premium ─ real data only) ----------------
//
// Pipeline-fed: derived in @/lib/industryStructure from the GI Council
// segment-report snapshot (industry-segment-premium.json, FY15→latest,
// refreshed by the every-3-days GIC sweep). Absolute values in ₹ '000 Cr;
// mix in % of the printed GI total. A fiscal year the source doesn't split
// stays null (honest gap) — and new years appear here automatically.
export const giPremiumAbsolute: SeriesPoint[] = giPremiumAbsoluteSeries

export const giPremiumMix: SeriesPoint[] = giPremiumMixSeries

// Share of health premium pool by carrier type — only FY24 + FY25 wired
// from Business Standard / IRDAI segment-mix references. Historical FY18
// →FY23 series is intentionally absent until ingest-irdai-annual.ts pulls
// the handbook PDF.
export const healthCarrierShare: SeriesPoint[] = [
  { label: 'FY24', SAHI: 30.8, Private: 44.1, PSU: 25.1 },
  { label: 'FY25', SAHI: 32.7, Private: 45.0, PSU: 22.3 },
]


// =========================================================================
//  SECTION 2 — COMPANY GROWTH ENGINE
// =========================================================================


// =========================================================================
//  SECTION 3 — DISTRIBUTION STRENGTH
// =========================================================================


export const productivity: SeriesPoint[] = [
  { label: 'FY21', agents: 41000, perAgent: 2.1 },
  { label: 'FY22', agents: 46000, perAgent: 2.4 },
  { label: 'FY23', agents: 52000, perAgent: 2.6 },
  { label: 'FY24', agents: 57000, perAgent: 3.0 },
  { label: 'FY25', agents: 61000, perAgent: 3.3 },
]


export const distributionRiskBadges: { label: string; tone: 'positive' | 'warning' | 'negative' }[] = [
  { label: 'High banca dependence', tone: 'warning' },
  { label: 'Broker-heavy growth', tone: 'warning' },
  { label: 'Direct channel weak', tone: 'negative' },
  { label: 'Commission ratio rising', tone: 'warning' },
  { label: 'Agent productivity improving', tone: 'positive' },
]

// =========================================================================
//  SECTION 4 — PROFITABILITY & CAPITAL
// =========================================================================


// =========================================================================
//  SECTION 5 — COMPETITIVE POSITIONING
// =========================================================================

export interface PeerRow {
  company: string
  shortName: string
  ticker: string
  peerGroup: Exclude<PeerGroup, 'All'>
  gwpGrowth: number
  marketShareChange: number
  combinedRatio: number
  solvency: number
  roe: number
  valuation: number
  retailMix: number
  signal: Signal
  takeaway: string
  focal?: boolean
}

// Derived from the canonical `insurers` model so peer tables stay in sync.
export const peerRows: PeerRow[] = insurers.map((i) => ({
  company: i.name,
  shortName: i.shortName,
  ticker: i.ticker,
  peerGroup: i.peerGroup,
  gwpGrowth: i.growth,
  marketShareChange: i.marketShareChange,
  combinedRatio: i.combinedRatio,
  solvency: i.solvency,
  roe: i.roe,
  valuation: i.valuation,
  retailMix: i.retailMix,
  signal: i.signal,
  takeaway: i.takeaway,
  focal: i.id === FOCAL_COMPANY,
}))

// =========================================================================
//  SECTION 6 — VALUATION & MARKET VIEW
// =========================================================================



// --- Valuation multiples (illustrative mock — listed insurers only) ----------
// Live market cap / P/B / P/E ingestion is still pending, so these are
// clearly-marked mock benchmarks (peer avg = listed comparables, never the
// unlisted peers coerced to 0). P/GWP for the focal company is the same figure
// carried in insurers[].valuation.
export const valuationMultiples = {
  pGwp: { niva: 3.4, peerAvg: 3.0 },
  pB: { niva: 2.7, peerAvg: 2.2 },
  pE: { niva: 31.6, peerAvg: 26.0 },
}

export const valuationMultipleTrend: SeriesPoint[] = [
  { label: 'FY21', 'P/GWP': 1.9, 'P/B': 1.3, 'P/E': 18.6 },
  { label: 'FY22', 'P/GWP': 2.2, 'P/B': 1.5, 'P/E': 21.4 },
  { label: 'FY23', 'P/GWP': 2.6, 'P/B': 1.9, 'P/E': 24.7 },
  { label: 'FY24', 'P/GWP': 3.0, 'P/B': 2.3, 'P/E': 28.4 },
  { label: 'FY25', 'P/GWP': 3.4, 'P/B': 2.7, 'P/E': 31.6 },
]

// =========================================================================
//  SECTION 7 — OWNERSHIP
// =========================================================================



// =========================================================================
//  SECTION 8 — MANAGEMENT COMMENTARY & EVENTS
// =========================================================================

export interface CommentaryItem {
  topic: 'Growth' | 'Margin' | 'Distribution' | 'Regulation' | 'Capital'
  quote: string
  speaker: string
  date: string
}

export const commentary: CommentaryItem[] = [
  { topic: 'Growth', quote: 'We expect retail health to compound in the low-20s with rising contribution from tier-2 markets.', speaker: 'MD & CEO', date: '2026-05-12' },
  { topic: 'Margin', quote: 'Combined ratio improvement is structural; we see room below 96% as the book seasons.', speaker: 'CFO', date: '2026-05-12' },
  { topic: 'Distribution', quote: 'Agency remains core; banca growth is additive but we are watching concentration.', speaker: 'Chief Distribution Officer', date: '2026-05-12' },
  { topic: 'Regulation', quote: 'Revised EOM norms are manageable within our current cost trajectory.', speaker: 'CFO', date: '2026-05-12' },
  { topic: 'Capital', quote: 'No equity raise is planned; solvency funds the FY26 growth plan internally.', speaker: 'CFO', date: '2026-05-12' },
]

export type PromiseCategory =
  | 'Growth'
  | 'Profitability'
  | 'Distribution'
  | 'Capital'
  | 'Valuation'
  | 'Regulation'

export type PromiseStatus = 'Delivered' | 'On Track' | 'Delayed' | 'Missed' | 'Not Measurable'

export interface PromiseItem {
  /** Insurer id the promise belongs to. */
  company: string
  category: PromiseCategory
  promise: string
  /** When it was promised. */
  date: string
  metric: string
  /** Guidance / target. */
  target: string
  /** Current result, or "Data pending". */
  current: string
  status: PromiseStatus
  source: string
}

// Management promises for the focal company (mock). Other companies show an
// empty state — promise tracking is not wired for them in this dataset.
export const promiseTracker: PromiseItem[] = [
  { company: 'niva-bupa', category: 'Growth', promise: 'Grow GWP in the low-20s', date: 'Q2 FY25 call', metric: 'GWP growth', target: '~20% YoY', current: '23.4%', status: 'Delivered', source: 'Earnings call' },
  { company: 'niva-bupa', category: 'Profitability', promise: 'Hold combined ratio below 98%', date: 'Q2 FY25 call', metric: 'Combined ratio', target: '<98%', current: '96.8%', status: 'Delivered', source: 'Investor presentation' },
  { company: 'niva-bupa', category: 'Profitability', promise: 'Expand ROE toward high-teens', date: 'FY24 annual report', metric: 'ROE', target: '~17%', current: '17.2%', status: 'Delivered', source: 'Annual report' },
  { company: 'niva-bupa', category: 'Growth', promise: 'Lift retail mix above 60%', date: 'FY24 annual report', metric: 'Retail mix', target: '60%+ by FY25', current: '64%', status: 'Delivered', source: 'Annual report' },
  { company: 'niva-bupa', category: 'Distribution', promise: 'Hold banca concentration near 25%', date: 'Q3 FY25 call', metric: 'Banca share', target: '~25%', current: '31%', status: 'Missed', source: 'Earnings call' },
  { company: 'niva-bupa', category: 'Distribution', promise: 'Scale the digital channel', date: 'FY24 annual report', metric: 'Digital mix', target: '8% by FY25', current: '5%', status: 'Delayed', source: 'Annual report' },
  { company: 'niva-bupa', category: 'Capital', promise: 'Fund FY26 growth without an equity raise', date: 'Q4 FY25 call', metric: 'Solvency', target: 'No raise; >1.8x', current: '2.18x', status: 'On Track', source: 'Earnings call' },
  { company: 'niva-bupa', category: 'Regulation', promise: 'Stay within revised EOM limits', date: 'Q4 FY25 call', metric: 'EOM', target: 'Within glide path', current: '28.4%', status: 'On Track', source: 'Earnings call' },
  { company: 'niva-bupa', category: 'Valuation', promise: 'Sustain premium re-rating via delivery', date: 'Q4 FY25 call', metric: 'P/GWP', target: 'Earn the premium', current: '3.4x (13% > peer median)', status: 'Not Measurable', source: 'Management commentary' },
]

export interface EventItem {
  id: string
  date: string
  title: string
  tag: string
  type: 'Sector' | 'Company' | 'Regulation' | 'Competition'
  impact: 'Positive' | 'Negative' | 'Neutral' | 'Watch'
  relevance: string
  importance: number
  source: string
  sourceUrl?: string
  detail: string
}

export const events: EventItem[] = [
  {
    id: 'ev1',
    date: '2026-05-12',
    title: 'Niva Bupa posts Q4 with combined ratio at multi-year low',
    tag: 'Niva Bupa Health',
    type: 'Company',
    impact: 'Positive',
    relevance: 'Confirms structural margin thesis; supports premium valuation.',
    importance: 95,
    source: 'Q4 FY25 results (mock)',
    detail: 'Combined ratio of 96.8% beat consensus of ~98%. Retail health mix and renewal strength were the key drivers; management guided to further improvement.',
  },
  {
    id: 'ev2',
    date: '2026-05-05',
    title: 'Regulator revises Expense of Management norms',
    tag: 'IRDAI',
    type: 'Regulation',
    impact: 'Watch',
    relevance: 'Cost ceilings could pressure aggressive-acquisition peers more than Niva Bupa.',
    importance: 88,
    source: 'Regulatory circular (mock)',
    detail: 'Revised EOM framework tightens allowable expense ratios on a glide path. Insurers with elevated commission ratios face the most adjustment; Niva Bupa sits within limits.',
  },
  {
    id: 'ev3',
    date: '2026-04-22',
    title: 'Large bank renews banca tie-up with Star Health',
    tag: 'Star Health',
    type: 'Competition',
    impact: 'Negative',
    relevance: 'Tightens banca shelf-space; watch impact on Niva Bupa fresh premium.',
    importance: 74,
    source: 'Exchange filing (mock)',
    detail: 'Multi-year exclusive renewal locks a major bank channel to a peer, a modest headwind to Niva Bupa’s banca-led fresh premium growth.',
  },
  {
    id: 'ev4',
    date: '2026-04-10',
    title: 'Industry health GWP grows 19% in FY25',
    tag: 'Sector',
    type: 'Sector',
    impact: 'Positive',
    relevance: 'Confirms the structural growth backdrop for SAHI players.',
    importance: 70,
    source: 'IRDAI handbook (mock)',
    detail: 'Health remained the fastest-growing segment, with SAHI insurers outpacing the broader industry on retail momentum.',
  },
  {
    id: 'ev5',
    date: '2026-03-28',
    title: 'FII ownership in Niva Bupa rises to multi-quarter high',
    tag: 'Niva Bupa Health',
    type: 'Company',
    impact: 'Positive',
    relevance: 'Quality institutions accumulating; supportive of the stock.',
    importance: 62,
    source: 'Shareholding disclosure (mock)',
    detail: 'FII holding rose ~5pp over FY25 while PE holders trimmed, a net positive rotation toward long-only institutions.',
  },
]
