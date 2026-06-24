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
import { ingestMoneycontrolStockDeals } from './ingest-moneycontrol-stock-deals'
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
  // Fallback / second source for the Bulk / Block Deal Timeline — fills the block
  // deals Screener Trades omits (e.g. Niva Bupa / NBH). Block-tolerant + add-only.
  ingestMoneycontrolStockDeals,
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
  // Event-based sources (management / governance events) are time-sensitive and
  // run on their own light cadence so they refresh between the bigger crons.
  if (CADENCE === 'event') return f.frequency === 'event_based'
  return true
}

// Time guards: a single slow/hung source must never starve the run past the
// workflow's kill, which would lose EVERY fetcher's work (the job dies before
// snapshots are merged and committed). Each fetcher gets a hard cap, and once
// the overall budget is spent the remaining fetchers are skipped as honest
// failures — they simply retry on the next cron. Tunable via env.
const PER_FETCHER_MS = Number(process.env.INGEST_FETCHER_TIMEOUT_MINUTES ?? 6) * 60_000
const RUN_BUDGET_MS = Number(process.env.INGEST_BUDGET_MINUTES ?? 20) * 60_000

function fetcherTimeout(): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`fetcher timed out after ${PER_FETCHER_MS / 60_000} min (capped so the run always reaches snapshot merge + commit)`)),
      PER_FETCHER_MS).unref?.())
}

async function main() {
  const targets = ALL.filter(shouldRun)
  await appendLog('ingest-all.log', { event: 'run_start', cadence: CADENCE, fetchers: targets.map((t) => t.source_id) })
  const startedAt = Date.now()
  const results = []
  for (const f of targets) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      results.push({
        source_id: f.source_id,
        status: 'failed' as const,
        raw_file: null,
        records: [],
        records_fetched: 0,
        fetched_at: new Date().toISOString(),
        error: `skipped — run budget (${RUN_BUDGET_MS / 60_000} min) exhausted by earlier sources; retries next scheduled run`,
      })
      await appendLog('ingest-all.log', { event: 'fetcher_skipped_budget', source_id: f.source_id })
      continue
    }
    try {
      const r = await Promise.race([f.run(), fetcherTimeout()])
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
    // A raced-out fetcher can leave sockets/timers open; everything durable is
    // already written and logged, so exit deterministically instead of letting
    // a hung handle keep the job alive until the workflow kill.
    process.exit(process.exitCode ?? 0)
  })
