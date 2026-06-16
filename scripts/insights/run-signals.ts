import { buildPanel } from '@/insights/panel'
import { runAllSignals, signalHash } from '@/insights/signals'
const run = runAllSignals(buildPanel())
console.log(JSON.stringify({ asOf: run.asOf, count: run.signals.length, hash: signalHash(run.signals), coverage: run.coverage, signals: run.signals }, null, 2))
