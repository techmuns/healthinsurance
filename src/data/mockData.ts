// ===========================================================================
//  Shared dashboard model — real, source-backed re-exports.
//
//  Despite the legacy filename, this module no longer carries fabricated
//  financials. The insurer universe, peer rows, GI premium series and data
//  freshness are all DERIVED from the official-source snapshots via the data
//  layer (`@/lib/dataLayer`, `@/lib/industryStructure`). The only hand-entered
//  set that remains is the management Promise Tracker (kept by request), which
//  the UI labels "indicative" and anchors to audited FY25 disclosures until a
//  source-backed events feed is ingested.
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

// The canonical insurer universe is built from the official-source snapshots
// (company-master + insurer-annual-snapshot) via the data layer. Adding a
// company or a new fiscal year is a snapshot/ingest change — no edit here.
// Growth, margin, signal, takeaway and share-change are derived.
export const insurers: Insurer[] = getInsurers()

/** Back-compat alias — the highlight dropdown reads this. */
export const companies = insurers

// Freshness is derived from the annual snapshot meta (last_updated, coverage,
// dataset quality) so it reflects the real data, not a hardcoded date.
export const DATA_FRESHNESS = getDataFreshness()

// =========================================================================
//  QUARTERLY REVIEW LAYER  (quarterly-review basis labels)
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
//  MARKET ENGINE  (industry GI premium — real data only)
//
// Pipeline-fed: derived in @/lib/industryStructure from the GI Council
// segment-report snapshot (industry-segment-premium.json, FY15→latest,
// refreshed by the every-3-days GIC sweep). Absolute values in ₹ '000 Cr;
// mix in % of the printed GI total. A fiscal year the source doesn't split
// stays null (honest gap) — and new years appear here automatically.
// =========================================================================
export const giPremiumAbsolute: SeriesPoint[] = giPremiumAbsoluteSeries

export const giPremiumMix: SeriesPoint[] = giPremiumMixSeries

// =========================================================================
//  COMPETITIVE POSITIONING  (peer rows derived from the canonical model)
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
//  MANAGEMENT COMMENTARY & EVENTS — Promise Tracker
//
//  Kept by request: management's public guidance vs audited FY25 results.
//  The UI labels the "current" column "indicative" (anchored to audited FY25
//  disclosures + management commentary) until a source-backed feed is ingested.
// =========================================================================

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

// Management promises for the focal company. Other companies show an empty
// state — promise tracking is not wired for them in this dataset.
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
