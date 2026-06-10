// ---------------------------------------------------------------------------
//  run-gic-segment-annual — run ONLY the GI Council full-FY segment fetcher
//  and merge its records (npm run ingest:gic-segment-annual). The full
//  `npm run ingest` still includes it; this runner exists so refreshing the
//  segment data after dropping a new March / final XLSX doesn't replay every
//  other source.
// ---------------------------------------------------------------------------

import { ingestGicouncilSegmentAnnual } from './ingest-gicouncil-segment-annual'
import { buildSnapshots } from './build-snapshots'

async function main() {
  const result = await ingestGicouncilSegmentAnnual.run()
  const { snapshotsChanged, metricsUpdated } = await buildSnapshots([result])
  console.log(JSON.stringify({
    status: result.status,
    records: result.records_fetched,
    snapshots_changed: snapshotsChanged,
    metrics_updated: metricsUpdated.length,
    warnings: result.warnings ?? [],
  }, null, 2))
  if (result.status === 'failed') process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
