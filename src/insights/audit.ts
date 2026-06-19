// ---------------------------------------------------------------------------
//  Insights — the HARDER GATE (generation-time correctness, fail-closed).
//
//  The grounding validator (validate.ts) proves every number traces to a signal.
//  It does NOT prove the words match the numbers — the verification report showed
//  a card can ship saying the OPPOSITE of its data (the #3 inverted P/GWP claim).
//  This module closes that gap deterministically:
//
//    §1  formula-direction / sign sanity — the conclusion's DIRECTION must match
//        the computed statistic (a pass/fail flag must agree with its threshold;
//        a "buying faster growth" claim must agree with the growth gap).
//    §2  instance-arithmetic recompute — re-evaluate each computed statistic from
//        its own inputs and assert it matches the displayed value within tolerance.
//    Part 4  uniqueness / anti-parroting — two cards built on the same core
//        calculation are ONE; a depth card survives only if it adds a method the
//        breadth card lacks.
//
//  Pure + deterministic: runs in the dry-run gate and the unit checks, no model.
// ---------------------------------------------------------------------------

import type { Insight, InsightsFile, MethodDescriptor, MethodInput } from './types'

export interface AuditResult { ok: boolean; errors: string[] }

const TOL_ABS = 0.06
const TOL_REL = 0.02
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(TOL_ABS, Math.abs(b) * TOL_REL)

const inputBy = (step: MethodDescriptor, test: (sym: string) => boolean): MethodInput | undefined =>
  step.inputs.find((i) => test(i.symbol))
const numOf = (i?: MethodInput): number | null => (i && typeof i.value === 'number' ? i.value : null)
/** Value as a fraction when the input is a percentage (for ln(1+g) etc.). */
const frac = (i?: MethodInput): number | null => {
  const v = numOf(i)
  return v == null ? null : i!.unit === '%' || i!.unit === 'pp' ? v / 100 : v
}
/** The subject company a step is about — first non-panel input insurer. */
const leadInsurer = (step: MethodDescriptor): string =>
  step.inputs.find((i) => i.insurer && i.insurer !== 'panel')?.insurer ?? 'panel'

// ── §1 + §2 : per-method recompute + direction ────────────────────────────────

/** Re-evaluate a step's statistic from its inputs (null = not recomputable). */
function recompute(step: MethodDescriptor): number | null {
  const by = (re: RegExp) => inputBy(step, (s) => re.test(s))
  switch (step.key) {
    case 'zscore': {
      const xi = numOf(by(/x_i/)), mu = numOf(by(/μ|mu|\\mu/)), sd = numOf(by(/σ|sigma|\\sigma/))
      return xi != null && mu != null && sd ? (xi - mu) / sd : null
    }
    case 'solvency_headroom': {
      const S = numOf(inputBy(step, (s) => s === 'S')), floor = numOf(by(/floor/))
      return S != null && floor != null ? S - floor : null
    }
    case 'solvency_runway': {
      const S = numOf(inputBy(step, (s) => s === 'S')), floor = numOf(by(/floor/)), g = frac(inputBy(step, (s) => s === 'g'))
      return S != null && floor != null && g != null && g > -1 ? Math.log(S / floor) / Math.log(1 + g) : null
    }
    case 'warranted_pb': {
      const roe = numOf(by(/ROE/)), coe = numOf(by(/CoE/))
      return roe != null && coe ? roe / coe : null
    }
    case 'guidance_hitrate': {
      const d = numOf(by(/delivered/)), t = numOf(by(/total/))
      return d != null && t ? (d / t) * 100 : null
    }
    default:
      return null // ols_trend / mix_attrib / pgwp_growth / consensus / uw_identity: the statistic IS an input
  }
}

/** Direction / sign sanity for a step's pass-flag and conclusion wording. */
function directionErrors(id: string, step: MethodDescriptor): string[] {
  const e: string[] = []
  const stat = step.statistic.value
  const th = step.threshold
  const by = (re: RegExp) => inputBy(step, (s) => re.test(s))

  // pass-flag must agree with the threshold test for the keys whose logic is fixed.
  if (th) {
    if (step.key === 'zscore' && th.passed !== Math.abs(stat) >= th.value)
      e.push(`${id}/${step.key}: passed=${th.passed} disagrees with |z|=${stat.toFixed(2)} vs ${th.value}`)
    if (step.key === 'solvency_headroom') {
      const S = numOf(inputBy(step, (s) => s === 'S'))
      if (S != null && th.passed !== S >= th.value) e.push(`${id}/${step.key}: passed=${th.passed} disagrees with S=${S} vs floor ${th.value}`)
    }
    if (step.key === 'warranted_pb') {
      const pbm = numOf(inputBy(step, (s) => s === 'P/B'))
      if (pbm != null && th.passed !== pbm <= stat) e.push(`${id}/${step.key}: passed=${th.passed} (cheap⇔market≤warranted) disagrees with market ${pbm} vs warranted ${stat}`)
    }
  }

  // pgwp_growth — the #3 inversion class: the growth-adjusted conclusion must
  // match the actual multiples + growth rates in the instance formula.
  if (step.key === 'pgwp_growth') {
    const m = step.instanceTeX.match(/([\d.]+)\\text\{x\}\s*\\,@\\,\s*([\d.]+)\\%[\s\S]*?([\d.]+)\\text\{x\}\s*\\,@\\,\s*([\d.]+)\\%/)
    const rob = step.robustness ?? ''
    if (m) {
      const m1 = +m[1], g1 = +m[2], m2 = +m[3], g2 = +m[4]
      const peg1 = m1 / g1, peg2 = m2 / g2 // multiple per point of growth (lower = cheaper)
      if (/buying faster growth/i.test(rob) && !(g1 > g2)) e.push(`${id}/pgwp: claims "buying faster growth" but focal growth ${g1}% ≤ peer ${g2}%`)
      if (/(not faster growth|without faster growth)/i.test(rob) && g1 > g2) e.push(`${id}/pgwp: claims "not faster growth" but focal grows faster (${g1}% > ${g2}%)`)
      if (/cheaper(?:[^.]*per point of growth)?/i.test(rob) && /per point of growth/i.test(rob) && !(peg1 < peg2)) e.push(`${id}/pgwp: claims "cheaper per point of growth" but PEG ${peg1.toFixed(3)} ≥ ${peg2.toFixed(3)}`)
      if (/richer[^.]*per point of growth/i.test(rob) && !(peg1 > peg2)) e.push(`${id}/pgwp: claims "richer per point of growth" but PEG ${peg1.toFixed(3)} ≤ ${peg2.toFixed(3)}`)
    }
  }
  void by
  return e
}

/** §1 + §2 — recompute every computed statistic and check every direction claim. */
export function auditMethodMath(file: InsightsFile): AuditResult {
  const errors: string[] = []
  for (const ins of file.insights) {
    const id = ins.id || '(no id)'
    for (const step of ins.methodology?.steps ?? []) {
      const rc = recompute(step)
      if (rc != null && !close(rc, step.statistic.value))
        errors.push(`${id}/${step.key}: instance recomputes to ${rc.toFixed(3)} but statistic shows ${step.statistic.value}`)
      errors.push(...directionErrors(id, step))
    }
  }
  return { ok: errors.length === 0, errors }
}

// ── Part 4 : uniqueness / anti-parroting ──────────────────────────────────────

/** Signature of a single calculation: method × subject company × result symbol. */
const calcSig = (step: MethodDescriptor): string => `${step.key}::${leadInsurer(step)}::${step.statistic.symbol}`
const stepKeys = (ins: Insight): Set<string> => new Set((ins.methodology?.steps ?? []).map((s) => s.key))

/**
 * A card whose HEADLINE calculation (its load-bearing first step) also appears as
 * a step inside another card is "contained" in that card. It survives only if it
 * adds a method the other lacks (genuine breadth-then-depth) — otherwise the two
 * are one insight and the weaker must be dropped/merged.
 */
export function auditUniqueness(file: InsightsFile): AuditResult {
  const errors: string[] = []
  const list = file.insights
  for (const a of list) {
    const aHead = a.methodology?.steps?.[0]
    if (!aHead) continue
    const aSig = calcSig(aHead)
    for (const b of list) {
      if (b.id === a.id) continue
      const inB = (b.methodology?.steps ?? []).some((s) => calcSig(s) === aSig)
      if (!inB) continue
      // a's headline calc is a sub-calc of b. Does a add a method b lacks?
      const bKeys = stepKeys(b)
      const aExtra = [...stepKeys(a)].filter((k) => !bKeys.has(k))
      if (aExtra.length === 0)
        errors.push(`uniqueness: "${a.id}" is built on the same core calc (${aSig}) as a step in "${b.id}" and adds no new method — duplicate, merge or drop the weaker`)
    }
  }
  return { ok: errors.length === 0, errors }
}

/** Convenience: run both audit stages and merge the results. */
export function auditInsights(file: InsightsFile): AuditResult {
  const a = auditMethodMath(file)
  const b = auditUniqueness(file)
  return { ok: a.ok && b.ok, errors: [...a.errors, ...b.errors] }
}
