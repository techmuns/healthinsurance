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

// ── Methodology ("show the working") — the flip-side of every insight card ────
//
//  A METHOD descriptor is the recognized formula behind a signal family, rendered
//  with the ACTUAL inputs that produced this insight. It is assembled
//  deterministically from the signal payload at generation time (see
//  src/insights/methods.ts) — never authored by the model. Every number it
//  carries must trace back to a value present in the signals.

/** One traceable input that plugs into a method's formula. */
export interface MethodInput {
  symbol: string // matches the formula, e.g. 'x_i', 'μ', 'σ', 'ROE'
  label: string // plain-English label
  value: number | null // null surfaces an honest data gap, never a fake 0
  unit: string
  insurer?: string // company_id when the input is insurer-specific
  period: string
  layer: ProvenanceLayer // provenance for THIS input
}

/** The four fixed analytical lenses every card's back is organised under. */
export type Lens = 'fundamental' | 'technical' | 'sentiment' | 'macro'

/** A recognized method instantiated with this insight's numbers. */
export interface MethodDescriptor {
  key: string // stable id, maps to the registry in methods.ts
  lens: Lens // which fixed lens this method belongs under (deterministic)
  name: string // recognized method name shown to the user
  refTag: string // short reference tag (e.g. 'Empirical-rule outlier')
  gloss: string // one plain-English line — what the method does
  formulaTeX: string // KaTeX, the general form
  instanceTeX: string // KaTeX, the form with THIS insight's numbers substituted
  inputs: MethodInput[] // the actual values used, each traceable
  statistic: { symbol: string; value: number; unit: string } // the computed result
  threshold?: { rule: string; value: number; passed: boolean } // the trigger test
  robustness?: string // why it isn't noise (n, persistence, corroboration)
}

/** One lens slot in the fixed back template — always present, honest when empty. */
export interface LensBlock {
  status: 'populated' | 'not_applicable' | 'no_signal' | 'data_gap'
  reason?: string // e.g. 'Unlisted — no market price/volume.' / a verbatim gap note
  stepKeys: string[] // which methodology.steps belong to this lens
}

/** Persisted onto each insight — the deterministic "why you should believe this". */
export interface Methodology {
  steps: MethodDescriptor[] // ordered by load-bearing-ness, most important first
  lenses: Record<Lens, LensBlock> // the fixed four-lens frame (deterministic)
  payloadHash: string // hash of the contributing signal payload these steps came from
  computedAt: string // ISO
  isQuantitative: boolean // false for news/event items (honest detection-rule view)
}

/** Forward "next steps" — model-authored under rails, never deterministic. */
export interface Application {
  framing: string // 1 line: what kind of read this is for a PM
  uses: { angle: string; detail: string }[] // 2–4 grounded implications / use-cases
}
export interface WatchItem {
  trigger: string // metric / event to monitor
  condition: string // threshold or what to look for (anchored to a current value)
  cadence?: string // next print / date / frequency
  direction: 'confirms' | 'invalidates' | 'either'
}
export interface Watch {
  items: WatchItem[] // 2–4 items; the falsifier becomes one `invalidates` item
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
  // ── Variant-perception fields (goldmine brief) — model-authored, optional for
  //    backward-compat; the generation layer populates them and the flip-side
  //    template surfaces them. tier is the honest edge grade.
  tier?: 'goldmine' | 'supporting' | 'context'
  consensusView?: string // what the Street believes (+ the evidence it is consensus)
  variantBasis?: string // why that's wrong/incomplete — the edge
  impliedExpectations?: string // the reverse-the-multiple read (valuation insights)
  steelman?: string // the strongest surviving rebuttal + how it was handled
  evidence: InsightEvidence[]
  conviction: 'high' | 'medium' | 'low'
  horizon: 'near' | 'medium' | 'long'
  falsifier: string
  affectedInsurers: string[]
  chart: ChartSpec
  sourceNote: string
  /** The deterministic "show the working" panel — assembled from signals, not the
   *  model (methods.ts). Optional only for backward-compat; every generated and
   *  backfilled insight carries it. */
  methodology?: Methodology
  /** Forward "next steps" — model-authored on rails (grounded). */
  application?: Application
  watch?: Watch
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
