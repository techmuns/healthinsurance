// ---------------------------------------------------------------------------
//  analystTypes — shared, dependency-free shapes for the AI Senior-Analyst layer.
//
//  Imported by the browser (selection + readout + drawer) AND by the server-side
//  Cloudflare function (functions/api/insight.ts). Keep it free of any runtime
//  imports so it bundles cleanly on both sides.
//
//  The single source of truth for selectable data is the Data Audit grid
//  (src/lib/auditGrid.ts → GridCell). A SelectionItem is the minimal, serialisable
//  projection of a GridCell that the analyst is allowed to reason over — it carries
//  the full audit lineage (source, layer, status, confidence, gap reason) so the
//  AI can never be handed an ungrounded or mislabelled figure.
// ---------------------------------------------------------------------------

/** Minimal, serialisable projection of one audited cell. */
export interface SelectionItem {
  company: string
  companyLabel: string
  metric: string
  metricLabel: string
  category: string
  unit: string
  period: string
  value: number | null
  /** GridStatus key (filled / missing_in_source / needs_review / …). */
  status: string
  statusLabel: string
  /** Value present and trustworthy enough to analyse (filled / basis_mismatch). */
  ready: boolean
  sourceName: string | null
  sourceLayer: string | null
  sourceUrl: string | null
  confidence: string | null
  /** True statutory/filing source vs market/opinion (broker/exchange/aggregator). */
  sourceClass: 'statutory' | 'market' | 'other'
  /** When the cell is a gap, the honest reason; null when ready. */
  gapReason: string | null
  /** Competing values kept on record (a flagged conflict), if any. */
  conflicts: { value: number | null; source: string | null }[]
}

export interface RankEntry {
  company: string
  companyLabel: string
  value: number
  rank: number
  of: number
  z: number
  isOutlier: boolean
}

/** Cross-sectional (peer) statistics for one metric within one period. */
export interface MetricStat {
  metric: string
  metricLabel: string
  unit: string
  period: string
  count: number
  mean: number
  median: number
  stdev: number
  min: { company: string; companyLabel: string; value: number }
  max: { company: string; companyLabel: string; value: number }
  spread: number
  ranks: RankEntry[]
  /** Directional leadership only — NOT a quality verdict. null when unknown. */
  higherIsBetter: boolean | null
}

/** Within-company change across periods — only where genuine multi-period exists. */
export interface TrendStat {
  company: string
  companyLabel: string
  metric: string
  metricLabel: string
  unit: string
  points: { period: string; value: number }[]
  from: number
  to: number
  absChange: number
  pctChange: number | null
  slopePerYear: number | null
}

export interface CoverageStat {
  total: number
  ready: number
  gaps: number
  byStatus: Record<string, number>
  gapList: { company: string; companyLabel: string; metric: string; metricLabel: string; period: string; reason: string }[]
}

export interface SourceQuality {
  byLayer: Record<string, number>
  byConfidence: Record<string, number>
  /** Ready cells resting only on market/aggregator layers (not statutory). */
  marketOnly: number
  /** Ready cells with competing values kept on record. */
  conflicts: number
  /** Honest source-firewall flags (a statutory metric resting on market data, …). */
  firewallWarnings: string[]
}

export interface Tier1Readout {
  scope: {
    companies: { id: string; label: string }[]
    metrics: { key: string; label: string; category: string }[]
    periods: string[]
    multiPeriod: boolean
    /** A single fiscal cross-section — trend analysis is NOT available. */
    singlePeriod: boolean
    trendAvailable: boolean
  }
  coverage: CoverageStat
  metricStats: MetricStat[]
  trends: TrendStat[]
  sourceQuality: SourceQuality
  /** Every true number this readout asserts — the grounding set for the AI gate. */
  groundedValues: number[]
  /** Stable hash of (selection + signals + dataset version) for caching. */
  signature: string
}

export interface AnalystRequest {
  scopeLabel: string
  selection: SelectionItem[]
  readout: Tier1Readout
  datasetVersion: string
}

export type Conviction = 'High' | 'Medium' | 'Low'

/** The structured Senior-Analyst readout (build brief §5). Prose fields only —
 *  every number inside them must trace to readout.groundedValues. */
export interface AnalystResult {
  headline: string
  analystTake: string
  whatMostPeopleMiss: string
  evidence: { label: string; detail: string }[]
  peerOrTrendContext: string
  riskCaveatFalsifier: string
  conviction: Conviction
  convictionRationale: string
  whatToWatchNext: string[]
  sourceQualityNote: string
  // server-attached meta
  model?: string
  generatedAt?: string
}

export interface AnalystApiOk {
  ok: true
  result: AnalystResult
  signature: string
  cached?: boolean
}
export interface AnalystApiErr {
  ok: false
  error: string
  detail?: string
}
export type AnalystApiResponse = AnalystApiOk | AnalystApiErr
