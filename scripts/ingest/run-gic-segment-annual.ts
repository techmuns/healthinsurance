// ---------------------------------------------------------------------------
//  run-gic-segment-annual — run ONLY the GI Council segment fetchers (the
//  full-FY/quarterly cut + the monthly flow cut) and merge their records
//  (npm run ingest:gic-segment-annual). The dedicated gic-segment-monthly
//  workflow runs this so the GIC chain can never be starved by an unrelated
//  slow source in the big ingest; `npm run ingest` still includes both too.
// ---------------------------------------------------------------------------

import { ingestGicouncilSegmentAnnual } from './ingest-gicouncil-segment-annual'
import { ingestGicouncilSegment } from './ingest-gicouncil-segment'
import { buildSnapshots } from './build-snapshots'
import { closeBrowser } from './browser'

async function main() {
  // Annual first: in live mode it discovers the listing and stages any new
  // workbooks (including monthly editions), which the monthly fetcher then
  // parses in the same run.
  const annual = await ingestGicouncilSegmentAnnual.run()
  const monthly = await ingestGicouncilSegment.run()
  const { snapshotsChanged, metricsUpdated } = await buildSnapshots([annual, monthly])
  console.log(JSON.stringify({
    annual: { status: annual.status, records: annual.records_fetched, warnings: annual.warnings ?? [] },
    monthly: { status: monthly.status, records: monthly.records_fetched },
    snapshots_changed: snapshotsChanged,
    metrics_updated: metricsUpdated.length,
  }, null, 2))
  if (annual.status === 'failed' || monthly.status === 'failed') process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeBrowser()
    process.exit(process.exitCode ?? 0)
  })
