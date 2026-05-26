// ---------------------------------------------------------------------------
// Core domain types for the Insurance Investor Dashboard.
// All values flowing through the UI are described by `Metric` so the design
// system can always render source, status and freshness alongside a number.
// ---------------------------------------------------------------------------

export type DataStatus = 'Reported' | 'Derived' | 'Estimated' | 'Pending'

export type Signal = 'Strong' | 'Improving' | 'Watch' | 'Weak'

export type CapitalSignal = 'Safe' | 'Watch' | 'Weak'

export type ValuationSignal = 'Cheap' | 'Fair' | 'Expensive'

export type Trend = 'up' | 'down' | 'flat'

/** A single measured quantity with full provenance. */
export interface Metric {
  /** Numeric value. `null` => render as "Data pending". */
  value: number | null
  /** Display unit, e.g. "%", "x", "₹ Cr". */
  unit?: string
  /** Period the value describes, e.g. "Q4 FY25". */
  period: string
  /** Human source label. */
  source: string
  sourceUrl?: string
  status: DataStatus
  lastUpdated: string
  /** Optional change vs prior period (already computed, in `unit`). */
  change?: number
  changeLabel?: string
  /** Peer rank (1 = best) when relevant. */
  rank?: number
  rankOf?: number
}

export interface SeriesPoint {
  label: string
  [key: string]: number | string | null
}

export type PeerGroup = 'SAHI' | 'General' | 'Life' | 'All'
export type TimePeriod = 'Monthly' | 'Quarterly' | 'Annual'
export type Scope = 'industry-overview' | 'company-view'
export type Dataset = 'mock' | 'live'

export interface Company {
  id: string
  name: string
  ticker: string
  peerGroup: Exclude<PeerGroup, 'All'>
}

/**
 * Canonical insurer record. Every Executive Overview chart/card reads from this
 * shape via the helpers in `@/lib/insurers` — no metric is hardcoded into the UI.
 */
export interface Insurer {
  id: string
  name: string
  /** Compact label for charts/legends, e.g. "Niva Bupa". */
  shortName: string
  ticker: string
  peerGroup: Exclude<PeerGroup, 'All'>
  /** Share of the insurer's own segment pool (%). */
  marketShare: number
  /** Gross written premium (₹ Cr). */
  premiumCollection: number
  settlementRatio: number
  renewalRate: number
  customerRetention: number
  /** GWP growth, YoY (%). */
  growth: number
  /** Underwriting margin = 100 − combined ratio (%); higher is better. 0 = N/A. */
  margin: number
  /** Combined ratio (%); lower is better. 0 = N/A (life). */
  combinedRatio: number
  solvency: number
  roe: number
  /** P/GWP multiple (x). */
  valuation: number
  /** Market-share change, YoY (pp). */
  marketShareChange: number
  retailMix: number
  signal: Signal
  /** Short investor-style one-liner shown on hover. */
  takeaway: string
}

/** Single global filter state shared across the dashboard. */
export interface DashboardFilters {
  scope: Scope
  /** Highlighted insurer id. */
  highlightedCompany: string
  peerGroup: PeerGroup
  period: TimePeriod
  dataset: Dataset
  updatedAsOf: string
}
