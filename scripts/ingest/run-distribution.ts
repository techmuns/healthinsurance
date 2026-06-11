// ---------------------------------------------------------------------------
//  run-distribution — run ONLY the channel-mix fetcher and merge its records
//  (npm run ingest:distribution). Offline-first: it scans the disclosure PDFs
//  already staged under data/raw/companies/<id>/, so it needs no network and
//  can be run standalone after new disclosures land. The big ingest
//  (`npm run ingest`, quarterly cadence) includes it too.
// ---------------------------------------------------------------------------

import { ingestDistribution } from './ingest-distribution'
import { buildSnapshots } from './build-snapshots'

async function main() {
  const result = await ingestDistribution.run()
  const { snapshotsChanged, metricsUpdated } = await buildSnapshots([result])
  console.log(JSON.stringify({
    status: result.status,
    records: result.records_fetched,
    warnings: result.warnings ?? [],
    snapshots_changed: snapshotsChanged,
    metrics_updated: metricsUpdated.length,
  }, null, 2))
  if (result.status === 'failed') process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
