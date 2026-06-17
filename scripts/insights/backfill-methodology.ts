// ---------------------------------------------------------------------------
//  Backfill the deterministic `methodology` block onto the committed insights.
//
//  Same computation the generate script runs (assembleMethodology over the live
//  signal payload) — no model, no network, no secret. Idempotent: re-running on
//  unchanged data produces an identical file. Use after a data refresh if you
//  want to re-stamp the committed sample without a full AI regeneration.
//
//  Run: npm run insights:methodology
// ---------------------------------------------------------------------------
import { writeFileSync, readFileSync } from 'node:fs'
import { buildPanel } from '@/insights/panel'
import { runAllSignals } from '@/insights/signals'
import { assembleMethodology } from '@/insights/methods'
import { validateInsightsFile } from '@/insights/validate'
import type { InsightsFile } from '@/insights/types'

const OUT = 'src/data/insights.generated.json'

const run = runAllSignals(buildPanel())
const file = JSON.parse(readFileSync(OUT, 'utf8')) as InsightsFile
// Keep `methodology.computedAt` stable to the file's generation time so re-runs
// don't churn the diff when nothing material changed.
const computedAt = file.meta.generatedAt

file.insights = file.insights.map((ins) => ({ ...ins, methodology: assembleMethodology(ins, run, computedAt) }))

const v = validateInsightsFile(file, run)
if (!v.ok) {
  console.error('methodology backfill FAILED validation — writing nothing:')
  v.errors.forEach((e) => console.error('  · ' + e))
  process.exit(1)
}

writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n')
const total = file.insights.reduce((n, i) => n + (i.methodology?.steps.length ?? 0), 0)
console.log(`backfilled methodology into ${file.insights.length} insights (${total} method steps) → ${OUT}`)
for (const ins of file.insights) {
  const m = ins.methodology!
  console.log(`  • ${ins.id}: ${m.isQuantitative ? m.steps.map((s) => s.key).join(' + ') : 'non-quantitative'} · ${m.payloadHash}`)
}
