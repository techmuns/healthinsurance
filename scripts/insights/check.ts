// Verify-by-running: unit assertions on the signal families + the numeric-
// grounding / firewall / falsifier validation of the committed insights file.
// Run: npx tsx --tsconfig tsconfig.app.json scripts/insights/check.ts
import { buildPanel } from '@/insights/panel'
import { runAllSignals, dispersionSignals, solvencySignals, growthQualitySignals, signalHash } from '@/insights/signals'
import { validateInsightsFile, groundedNumbers } from '@/insights/validate'
import { assembleMethodology, methodologyNumbers } from '@/insights/methods'
import { auditMethodMath, auditUniqueness } from '@/insights/audit'
import generated from '@/data/insights.generated.json'
import type { InsightsFile } from '@/insights/types'

let pass = 0
let fail = 0
const ok = (cond: boolean, msg: string) => {
  if (cond) { pass++; console.log('  PASS ' + msg) } else { fail++; console.log('  FAIL ' + msg) }
}

const d = buildPanel()
const run = runAllSignals(d)

console.log('— signal layer —')
ok(run.signals.length > 30, `runAllSignals produced ${run.signals.length} signals`)
ok(run.coverage.length === 5, 'coverage has all 5 SAHIs')
ok(run.coverage.every((c) => c.readyPct >= 0 && c.readyPct <= 100), 'coverage readyPct in [0,100]')

// dispersion: ManipalCigna is the combined-ratio outlier (|z| >= 1.5).
const disp = dispersionSignals(d)
const manipalCR = disp.find((s) => s.insurer === 'manipalcigna' && s.metric === 'Combined ratio')
ok(!!manipalCR && Math.abs(manipalCR!.comparison!.zScore!) >= 1.5, 'ManipalCigna flagged as combined-ratio outlier (|z|>=1.5)')

// solvency: Care's raise-pressure horizon is shorter than Niva's (thinner runway).
const sol = solvencySignals(d)
const careH = sol.find((s) => s.insurer === 'care-health' && s.metric.startsWith('Raise-pressure'))
const nivaH = sol.find((s) => s.insurer === 'niva-bupa' && s.metric.startsWith('Raise-pressure'))
ok(!!careH && !!nivaH && (careH!.value as number) < (nivaH!.value as number), 'Care raise-pressure horizon < Niva (shorter runway)')

// growth-quality: every insurer with history gets a retail-mix slope signal.
const gq = growthQualitySignals(d)
ok(gq.filter((s) => s.metric.startsWith('Retail-mix trend')).length >= 4, 'retail-mix slope computed for the panel')

// determinism: same data → same hash.
ok(signalHash(run.signals) === signalHash(runAllSignals(buildPanel()).signals), 'signal hash is deterministic')

console.log('— insights validation (grounding / firewall / falsifier) —')
const file = generated as unknown as InsightsFile
const v = validateInsightsFile(file, run)
ok(v.ok, 'committed insights pass the grounding + firewall + falsifier checks')
if (!v.ok) v.errors.forEach((e) => console.log('      · ' + e))
ok(file.insights.length >= 6 && file.insights.length <= 10, `insight count ${file.insights.length} in [6,10]`)
ok(file.insights.every((i) => i.evidence.length >= 1 && i.falsifier.length > 8), 'every insight has evidence + a falsifier')

console.log('— methodology ("show the working") —')
// Every insight carries a persisted methodology block.
ok(file.insights.every((i) => !!i.methodology), 'every insight has a persisted methodology block')
// Determinism: re-assembling from the live signals reproduces the persisted hash.
ok(file.insights.every((i) => assembleMethodology(i, run).payloadHash === i.methodology!.payloadHash), 'methodology hash is deterministic (re-assembly reproduces it)')
// Extended numeric grounding (brief §8.2): every back number traces to a signal.
const grounded = groundedNumbers(run)
const ALLOW = new Set([100, 1.5, 150, 12, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
const tol = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.06, Math.abs(b) * 0.012)
const isGrounded = (n: number) => ALLOW.has(Math.abs(n)) || grounded.some((g) => tol(n, g) || tol(Math.abs(n), Math.abs(g)) || tol(n * 100, g) || tol(n / 100, g))
const ungrounded = file.insights.flatMap((i) => methodologyNumbers(i.methodology!).filter((n) => !isGrounded(n)).map((n) => `${i.id}:${n}`))
ok(ungrounded.length === 0, `every methodology number is grounded in signals${ungrounded.length ? ' — ' + ungrounded.join(', ') : ''}`)
// Quantitative honesty + reproducibility stamp (brief §8.1, §8.3, §8.5).
ok(file.insights.every((i) => i.methodology!.isQuantitative === i.methodology!.steps.length > 0), 'isQuantitative agrees with step count for every insight')
ok(file.insights.every((i) => !i.methodology!.isQuantitative || /^sig_/.test(i.methodology!.payloadHash)), 'every quantitative card carries a reproducibility hash')
// The P/B-on-ROE card rests on warranted-multiple math + the underwriting-loss flag + thin coverage.
const pb = file.insights.find((i) => i.id === 'niva-pb-roe-dislocation')!
const pbWarranted = pb.methodology!.steps.find((s) => s.key === 'warranted_pb')
ok(!!pbWarranted && /loss-making/i.test(pbWarranted.robustness ?? '') && /analyst/i.test(pbWarranted.robustness ?? ''), 'P/B card rests on warranted-multiple math + underwriting-loss + thin coverage')
// Multi-signal insights expose more than one contributing method.
ok(file.insights.filter((i) => i.methodology!.steps.length >= 2).length >= 5, 'multi-method cards show each contributing method')

console.log('— fixed template: four lenses + forward blocks —')
const LENSES = ['fundamental', 'technical', 'sentiment', 'macro'] as const
ok(file.insights.every((i) => i.methodology!.lenses && LENSES.every((l) => !!i.methodology!.lenses[l])), 'every card renders all four lens blocks')
ok(file.insights.every((i) => i.methodology!.steps.every((s) => LENSES.includes(s.lens))), 'every method step carries a valid lens')
ok(JSON.stringify(assembleMethodology(file.insights[0], run).lenses) === JSON.stringify(file.insights[0].methodology!.lenses), 'lens grouping is deterministic (re-assembly reproduces it)')
const care = file.insights.find((i) => i.id === 'care-solvency-runway')!
ok(care.methodology!.lenses.technical.status === 'not_applicable', 'unlisted name (Care) → Technical is not_applicable')
ok(file.insights.every((i) => !!i.application && i.application.uses.length >= 1), 'every card has a How-to-use-this block')
ok(file.insights.every((i) => !!i.watch && i.watch.items.length >= 1), 'every card has a What-to-watch block')
ok(file.insights.every((i) => i.watch!.items.some((w) => w.direction === 'invalidates')), 'every watch list includes the falsifier (an invalidates item)')

console.log('— harder gate: arithmetic recompute + formula-direction + uniqueness —')
// §2 instance-arithmetic recompute + §1 formula-direction must pass on every card.
const math = auditMethodMath(file)
ok(math.ok, 'instance-arithmetic recompute + direction sanity pass on all live cards')
if (!math.ok) math.errors.forEach((e) => console.log('      · ' + e))
// Part 4 uniqueness — no pure-duplicate cards (breadth-then-depth is allowed).
const uniq = auditUniqueness(file)
ok(uniq.ok, 'uniqueness: no pure-duplicate cards (breadth-then-depth allowed)')
if (!uniq.ok) uniq.errors.forEach((e) => console.log('      · ' + e))

// Adversarial: deliberately inverted cards MUST be rejected (the gate fails closed).
const clone = (): InsightsFile => JSON.parse(JSON.stringify(file))
const stepOf = (f: InsightsFile, id: string, key: string) => f.insights.find((i) => i.id === id)!.methodology!.steps.find((s) => s.key === key)!
const f1 = clone(); stepOf(f1, 'manipal-cr-outlier', 'zscore').threshold!.passed = false
ok(!auditMethodMath(f1).ok, 'rejects inverted card — z-score pass-flag flipped against |z| ≥ 1.5')
const f2 = clone(); stepOf(f2, 'niva-pb-roe-dislocation', 'pgwp_growth').robustness = "Niva carries a higher 1.65x vs Star's 1.49x — a higher multiple, not faster growth."
ok(!auditMethodMath(f2).ok, 'rejects inverted card — "not faster growth" vs 20% > 10% (the #3 inversion)')
const f3 = clone(); stepOf(f3, 'manipal-cr-outlier', 'zscore').statistic.value = 3.5
ok(!auditMethodMath(f3).ok, 'rejects inverted card — z-score statistic ≠ recompute from inputs')
const f4 = clone()
const dup = JSON.parse(JSON.stringify(f4.insights.find((i) => i.id === 'manipal-cr-outlier')!)) as InsightsFile['insights'][number]
dup.id = 'dup-manipal'
dup.methodology!.steps = dup.methodology!.steps.filter((s) => s.key === 'zscore') // same core calc, no added method
f4.insights.push(dup)
ok(!auditUniqueness(f4).ok, 'uniqueness flags a pure-duplicate (same core calc, no new method)')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
