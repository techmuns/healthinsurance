// Live ingest re-trigger (2026-06-02): pull real IRDAI + company-IR data and
// refresh the snapshots from CI, which has the network egress this workspace
// lacks. Fills quarterly/monthly wherever the official source allows; any rows
// the source genuinely blocks stay an honest "pending" — never fabricated.
// ---------------------------------------------------------------------------
//  ingest-all — entry point for the GitHub Actions workflow.
//
//  Reads the CADENCE env var (monthly | quarterly | annual | all) and runs
//  only the fetchers matching that cadence. Defaults to "all".
// ---------------------------------------------------------------------------

import type { Fetcher } from './types'
import { ingestIrdaiMonthly } from './ingest-irdai-monthly'
import { ingestIrdaiNonLifeFlashFigures } from './ingest-irdai-nonlife-flash'
import { ingestGicouncilFlash } from './ingest-gicouncil-flash'
import { ingestGicouncilSegment } from './ingest-gicouncil-segment'
import { ingestGicouncilSegmentAnnual } from './ingest-gicouncil-segment-annual'
import { ingestIrdaiAnnual } from './ingest-irdai-annual'
import { ingestIrdaiQuarterly } from './ingest-irdai-quarterly'
import { ingestCompanyDisclosures } from './ingest-company-disclosures'
import { ingestCompanyAnnualHistory } from './ingest-company-annual-history'
import { ingestQuarterlyDisclosures } from './ingest-quarterly-disclosures'
import { ingestDistribution } from './ingest-distribution'
import { ingestOwnership } from './ingest-ownership'
import { ingestManagementEvents } from './ingest-management-events'
import { ingestValuation } from './ingest-valuation'
import { ingestMoneycontrolAnalyst } from './ingest-moneycontrol-analyst'
import { fetchInvesting } from './fetch-investing'
import { fetchMunsMarketData } from './fetch-muns-market-data'
import { fetchNseDelivery } from './fetch-nse-delivery'
import { fetchYahooPrice } from './fetch-yahoo-price'
import { fetchScreener } from './fetch-screener'
import { fetchTrendlyne } from './fetch-trendlyne'
import { buildSnapshots } from './build-snapshots'
import { appendLog } from './util'
import { closeBrowser } from './browser'

const ALL: Fetcher[] = [
  ingestIrdaiMonthly,
  ingestIrdaiNonLifeFlashFigures,
  ingestGicouncilFlash,
  ingestGicouncilSegment,
  ingestGicouncilSegmentAnnual,
  ingestIrdaiAnnual,
  ingestIrdaiQuarterly,
  ingestCompanyDisclosures,
  ingestCompanyAnnualHistory,
  ingestQuarterlyDisclosures,
  ingestDistribution,
  ingestOwnership,
  ingestManagementEvents,
  ingestValuation,
  ingestMoneycontrolAnalyst,
  // Excel-template sources. Daily price/volume runs newest-source-wins through
  // price-history-store, so a blocked source can never wipe the seeded history:
  //   1. fetch-muns-market-data — PRIMARY (muns' own India-capable API),
  //   2. fetch-yahoo-price — backup (public Yahoo chart API),
  //   3. fetch-investing — official NSE deliverable-quantity column via staged CSV.
  // fetch-screener / fetch-trendlyne are login-free BACKUP adapters, tagged
  // low-confidence, for cells with no official equivalent.
  fetchMunsMarketData,
  fetchYahooPrice,
  fetchInvesting,
  // Runs after the price fetchers so the deliverable column is filled onto rows
  // that already carry price/volume (NSE archives MTO file, reachable from CI).
  fetchNseDelivery,
  fetchScreener,
  fetchTrendlyne,
]

const CADENCE = (process.env.CADENCE ?? 'all').toLowerCase()

function shouldRun(f: Fetcher): boolean {
  // 'daily' fetchers (valuation quote + Moneycontrol analyst coverage) are cheap
  // and idempotent. They run on their own 'daily' cadence (the daily cron), and
  // also ride along on 'monthly' and 'all' so they stay exercised.
  if (CADENCE === 'all') return true
  if (CADENCE === 'daily') return f.frequency === 'daily'
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

main()
  .catch(async (err) => {
    await appendLog('ingest-all.log', { event: 'fatal', error: err instanceof Error ? err.message : String(err) })
    process.exitCode = 1
  })
  .finally(async () => {
    // Release the headless browser (if the WAF fallback launched one) so the
    // process can exit instead of hanging on an open Chromium.
    await closeBrowser()
  })
