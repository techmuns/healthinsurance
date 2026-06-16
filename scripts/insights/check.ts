// Verify-by-running: unit assertions on the signal families + the numeric-
// grounding / firewall / falsifier validation of the committed insights file.
// Run: npx tsx --tsconfig tsconfig.app.json scripts/insights/check.ts
import { buildPanel } from '@/insights/panel'
import { runAllSignals, dispersionSignals, solvencySignals, growthQualitySignals, signalHash } from '@/insights/signals'
import { validateInsightsFile } from '@/insights/validate'
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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
