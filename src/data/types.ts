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

export interface Company {
  id: string
  name: string
  ticker: string
  peerGroup: Exclude<PeerGroup, 'All'>
}
