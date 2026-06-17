// ---------------------------------------------------------------------------
//  Insights — the guardrail / trust layer (build brief §8).
//
//  Enforces, in code, that the AI synthesis never drifts from the deterministic
//  signals: every numeric claim must trace to the signal payload; statutory
//  claims may not rest only on market/opinion layers; every insight carries a
//  falsifier. Used by the generate script (reject + retry) and by a test.
// ---------------------------------------------------------------------------

import type { InsightsFile, SignalRun, ProvenanceLayer } from './types'
import { methodologyNumbers } from './methods'

export interface ValidationResult {
  ok: boolean
  errors: string[]
}

const TOL_ABS = 0.06
const TOL_REL = 0.012
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(TOL_ABS, Math.abs(b) * TOL_REL)

/** Structural constants that legitimately appear in prose without being a datum:
 *  the underwriting break-even, the solvency floor (x and %), the CoE assumption,
 *  and small integers (ranks, counts, n, x/y). Fiscal-year tokens are stripped
 *  before extraction so "FY25"/"FY29" never read as orphan figures. */
const ALLOW = new Set<number>([100, 1.5, 150, 12, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
const STATUTORY_LAYERS = new Set<ProvenanceLayer>(['statutory', 'annual_report', 'ifrs'])
const STATUTORY_CATEGORIES = new Set(['earnings_quality', 'quality', 'capital', 'growth'])

function numbersIn(text: string): number[] {
  return [...text.replace(/FY\d{2}/g, '').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter((n) => Number.isFinite(n))
}

/** Every number the signals legitimately assert (values + comparison fields + note figures). */
export function groundedNumbers(run: SignalRun): number[] {
  const out: number[] = []
  for (const s of run.signals) {
    if (s.value != null) out.push(s.value)
    if (s.comparison) {
      out.push(s.comparison.referenceValue, s.comparison.delta)
      if (s.comparison.zScore != null) out.push(s.comparison.zScore)
    }
    if (s.note) out.push(...numbersIn(s.note))
  }
  return out
}

export function validateInsightsFile(file: InsightsFile, run: SignalRun): ValidationResult {
  const errors: string[] = []
  const grounded = groundedNumbers(run)
  // Prose often cites a magnitude ("down 2.9pp") of a signed signal (slope −2.89),
  // so a number is grounded if it (or its absolute value) matches a signal value.
  const isGrounded = (n: number) => ALLOW.has(n) || grounded.some((g) => close(n, g) || close(Math.abs(n), Math.abs(g)))

  if (!Array.isArray(file.insights) || file.insights.length < 1) errors.push('no insights in file')

  for (const ins of file.insights) {
    const id = ins.id || '(no id)'
    // 3. Falsifier required.
    if (!ins.falsifier || ins.falsifier.trim().length < 8) errors.push(`${id}: missing/empty falsifier`)
    // 2. Source firewall: a statutory-natured insight may not rest ONLY on market/opinion layers.
    if (STATUTORY_CATEGORIES.has(ins.category)) {
      const hasStatutory = ins.evidence.some((e) => e.layers.some((l) => STATUTORY_LAYERS.has(l)))
      if (!hasStatutory) errors.push(`${id}: ${ins.category} insight rests only on market/opinion layers (firewall)`)
    }
    // 1. Numeric grounding — evidence values (strict) + prose numbers.
    for (const e of ins.evidence) {
      if (e.value != null && !isGrounded(e.value)) errors.push(`${id}: evidence ${e.value} (${e.insurer}/${e.metric}) not grounded in signals`)
    }
    for (const text of [ins.headline, ins.shortHeadline, ins.summary, ins.thesis, ins.whatConsensusMisses]) {
      for (const n of numbersIn(text)) if (!isGrounded(n)) errors.push(`${id}: orphan number ${n} in prose ("${text.slice(0, 40)}…")`)
    }
    // chart series must reference keys, not inlined values (sanity).
    if (!ins.chart || !Array.isArray(ins.chart.seriesKeys) || ins.chart.seriesKeys.length === 0) errors.push(`${id}: chart has no seriesKeys`)

    // 4. Methodology guardrails (brief §8) — when present, the back must be
    //    100% deterministic-grounded and honest about quantitative vs not.
    const m = ins.methodology
    if (m) {
      // 4a. Quantitative honesty: isQuantitative ⇔ at least one method step.
      if (m.isQuantitative !== m.steps.length > 0) errors.push(`${id}: methodology.isQuantitative (${m.isQuantitative}) disagrees with ${m.steps.length} steps`)
      // 4b. Reproducibility stamp present on every quantitative card.
      if (m.isQuantitative && (!m.payloadHash || !/^sig_/.test(m.payloadHash))) errors.push(`${id}: quantitative methodology missing a payloadHash`)
      // 4c. Extended numeric-grounding — every number on the back traces to a
      //     signal value (± tol, percent/fraction-tolerant) or a structural const.
      for (const n of methodologyNumbers(m)) {
        const ok = ALLOW.has(n) || ALLOW.has(Math.abs(n)) || grounded.some((g) => close(n, g) || close(Math.abs(n), Math.abs(g)) || close(n * 100, g) || close(n / 100, g))
        if (!ok) errors.push(`${id}: methodology number ${n} not grounded in signals`)
      }
    }
  }
  return { ok: errors.length === 0, errors }
}
