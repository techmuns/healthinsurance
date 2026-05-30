// Re-trigger workflow — verify Phase 2 parser fixes against IRDAI + insurer IR.
// ---------------------------------------------------------------------------
//  ingest-all — entry point for the GitHub Actions workflow.
//
//  Reads the CADENCE env var (monthly | quarterly | annual | all) and runs
//  only the fetchers matching that cadence. Defaults to "all".
// ---------------------------------------------------------------------------

import type { Fetcher } from './types'
import { ingestIrdaiMonthly } from './ingest-irdai-monthly'
import { ingestIrdaiAnnual } from './ingest-irdai-annual'
import { ingestIrdaiQuarterly } from './ingest-irdai-quarterly'
import { ingestCompanyDisclosures } from './ingest-company-disclosures'
import { ingestQuarterlyDisclosures } from './ingest-quarterly-disclosures'
import { ingestDistribution } from './ingest-distribution'
import { ingestOwnership } from './ingest-ownership'
import { ingestManagementEvents } from './ingest-management-events'
import { ingestValuation } from './ingest-valuation'
import { buildSnapshots } from './build-snapshots'
import { appendLog } from './util'

const ALL: Fetcher[] = [
  ingestIrdaiMonthly,
  ingestIrdaiAnnual,
  ingestIrdaiQuarterly,
  ingestCompanyDisclosures,
  ingestQuarterlyDisclosures,
  ingestDistribution,
  ingestOwnership,
  ingestManagementEvents,
  ingestValuation,
]

const CADENCE = (process.env.CADENCE ?? 'all').toLowerCase()

function shouldRun(f: Fetcher): boolean {
  // 'daily' fetchers (e.g. valuation) are cheap and idempotent, so they ride
  // along on the 'monthly' and 'all' cadences to keep them exercised.
  if (CADENCE === 'all') return true
  if (CADENCE === 'monthly') return f.frequency === 'monthly' || f.frequency === 'daily'
  if (CADENCE === 'quarterly') return f.frequency === 'quarterly' || f.frequency === 'monthly'
  if (CADENCE === 'annual') return f.frequency === 'annual'
  return true
}

async function main() {
  const targets = ALL.filter(shouldRun)
  await appendLog('ingest-all.log', { event: 'run_start', cadence: CADENCE, fetchers: targets.map((t) => t.source_id) })
  const results = []
  for (const f of targets) {
    try {
      const r = await f.run()
      results.push(r)
    } catch (err) {
      // One source failing must not break the whole run.
      const msg = err instanceof Error ? err.message : String(err)
      results.push({
        source_id: f.source_id,
        status: 'failed' as const,
        raw_file: null,
        records: [],
        records_fetched: 0,
        fetched_at: new Date().toISOString(),
        error: msg,
      })
      await appendLog('ingest-all.log', { event: 'fetcher_error', source_id: f.source_id, error: msg })
    }
  }
  await buildSnapshots(results)
  await appendLog('ingest-all.log', { event: 'run_complete', results: results.length })
  // eslint-disable-next-line no-console
  console.log(`ingest-all complete · ${results.length} fetchers · cadence=${CADENCE}`)
}

main().catch(async (err) => {
  await appendLog('ingest-all.log', { event: 'fatal', error: err instanceof Error ? err.message : String(err) })
  process.exitCode = 1
})
