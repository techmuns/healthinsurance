// ---------------------------------------------------------------------------
//  analystTypes — shared, dependency-free shapes for the in-grid AI analysis.
//
//  Imported by the browser (drag-selection → readout → drawer) AND by the
//  server-side Cloudflare function (functions/api/insight.ts). Keep it free of
//  runtime imports so it bundles cleanly on both sides.
//
//  The single source of truth for selectable data is the Data Audit table
//  (src/lib/extractedDataAudit.ts → AuditCell). A SelectionItem is the minimal,
//  serialisable projection of an AuditCell — it carries the audit lineage
//  (source, status, gap reason) so the AI can never be handed an ungrounded value.
// ---------------------------------------------------------------------------

export interface SelectionItem {
  company: string
  companyLabel: string
  metric: string
  metricLabel: string
  unit: string
  period: string
  value: number | null
  /** AuditStatus key (fetched / missing / blocked / …). */
  status: string
  statusLabel: string
  /** Value present and trustworthy enough to analyse. */
  ready: boolean
  sourceName: string | null
  sourceUrl: string | null
  confidence: string | null
  /** True statutory/filing source vs market/opinion (broker/exchange/aggregator). */
  sourceClass: 'statutory' | 'market' | 'other'
  /** When the cell is a gap, the honest reason; null when ready. */
  gapReason: string | null
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
}

export interface CoverageStat {
  total: number
  ready: number
  gaps: number
  byStatus: Record<string, number>
  gapList: { companyLabel: string; metricLabel: string; period: string; reason: string }[]
}

export interface SourceQuality {
  byConfidence: Record<string, number>
  /** Ready cells resting only on market/aggregator layers (not statutory). */
  marketOnly: number
  /** Honest source-firewall flags (a statutory metric resting on market data, …). */
  firewallWarnings: string[]
}

/** A plain-language formula for a metric in the selection (combined ratio, etc.). */
export interface FormulaNote {
  title: string
  body: string
}

export interface Tier1Readout {
  scope: {
    companies: { id: string; label: string }[]
    metrics: { key: string; label: string }[]
    periods: string[]
    multiPeriod: boolean
    singlePeriod: boolean
    trendAvailable: boolean
  }
  coverage: CoverageStat
  metricStats: MetricStat[]
  trends: TrendStat[]
  sourceQuality: SourceQuality
  formula: FormulaNote | null
  /** Every true number this readout asserts — the grounding set for the AI gate. */
  groundedValues: number[]
  /** Stable hash of (selection + values) for caching. */
  signature: string
}

export interface AnalystRequest {
  scopeLabel: string
  selection: SelectionItem[]
  readout: Tier1Readout
  datasetVersion: string
}

export type Conviction = 'High' | 'Medium' | 'Low'

/** The compact, practical analyst readout (the simplified spec). Short and useful
 *  — NOT a formal report. Every number inside must trace to readout.groundedValues. */
export interface AnalystResult {
  /** 4-6 sharp bullet points: the quick read. */
  quickRead: string[]
  /** Optional plain-language formula / calculation explanation. */
  formula?: FormulaNote | null
  /** Optional one-line peer comparison, when the selection supports it. */
  peerNote?: string | null
  /** Ready/gap quality + how it affects conviction. */
  sourceQuality: string
  conviction: Conviction
  /** A clear, plain-language conclusion. */
  conclusion: string
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
