// ---------------------------------------------------------------------------
//  Insights engine — shared types.
//
//  Two layers, kept strictly separate (see INSIGHTS_BUILD_BRIEF):
//    1. Deterministic SIGNAL layer (this dir) — pure functions over the real
//       dataset producing typed facts with real numbers. Same data → same
//       signals. This is the source of edge.
//    2. AI INTERPRETATION layer (scripts/generate-insights.mjs) — receives ONLY
//       the computed Signal[] and writes the insight prose + chart spec. It may
//       never introduce a number absent from the signals; a grounding validator
//       enforces this.
// ---------------------------------------------------------------------------

/** Provenance layer enum (matches the dashboard's source model). */
export type ProvenanceLayer =
  | 'statutory'
  | 'annual_report'
  | 'ifrs'
  | 'broker'
  | 'exchange'
  | 'aggregator'
  | 'derived'
  | 'manual'

/** The atomic fact the AI later interprets. */
export interface Signal {
  family: string
  insurer: string // company_id, or 'panel' for cross-sectional
  period: string // e.g. 'FY26' | 'FY25' | 'upto-Mar-2026'
  metric: string // human label
  value: number | null
  unit: string // '%', 'x', '₹ Cr', 'σ', 'pp', 'periods', ...
  comparison?: {
    basis: 'peer_mean' | 'peer_median' | 'own_trend' | 'prior_period' | 'regulatory_floor'
    referenceValue: number
    delta: number // value - reference
    zScore?: number
  }
  layers: ProvenanceLayer[] // provenance layers feeding this signal
  dataGap: boolean
  note?: string // terse mechanical description, NO interpretation
}

export interface CoverageRow {
  insurer: string
  readyPct: number // 0..100
  gapped: number
}

export interface SignalRun {
  asOf: string
  signals: Signal[]
  coverage: CoverageRow[]
}

// ── Insight output contract (what the AI layer emits; the tab reads) ─────────

export type InsightCategory =
  | 'growth'
  | 'quality'
  | 'earnings_quality'
  | 'valuation'
  | 'capital'
  | 'management'
  | 'regulatory'
  | 'market_structure'

export type ChartType =
  | 'timeseries'
  | 'scatter_dislocation'
  | 'ranking_bar'
  | 'decomposition_stacked'
  | 'slope_dumbbell'

export interface ChartSpec {
  type: ChartType
  title: string
  seriesKeys: string[] // dataset keys, NOT inlined values
  insurers: string[]
  period?: string
  annotations?: { kind: 'threshold' | 'trendline' | 'callout'; label: string; value?: number }[]
}

export interface InsightEvidence {
  insurer: string
  metric: string
  value: number | null
  unit: string
  context: string // e.g. '+2.1σ vs peers', 'below P/B-ROE line'
  layers: ProvenanceLayer[]
  period: string
}

export interface Insight {
  id: string
  rank: number // 1 = highest edge
  category: InsightCategory
  headline: string // the full claim (canonical; also the audit/grounding anchor)
  shortHeadline: string // <=7 words — the scannable, bold card title
  summary: string // 2-3 sentences: the surprise/belief-challenge, then the data behind it
  thesis: string
  whatConsensusMisses: string
  evidence: InsightEvidence[]
  conviction: 'high' | 'medium' | 'low'
  horizon: 'near' | 'medium' | 'long'
  falsifier: string
  affectedInsurers: string[]
  chart: ChartSpec
  sourceNote: string
}

export interface InsightsFile {
  meta: {
    generatedAt: string
    dataAsOf: string
    model: string
    signalsComputed: number
    signalHash: string
    coverage: CoverageRow[]
  }
  insights: Insight[]
}
