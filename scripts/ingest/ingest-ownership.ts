// ---------------------------------------------------------------------------
//  Fetcher — Quarterly shareholding pattern for listed insurers.
//
//  Targets listed-company shareholding-pattern PDFs published quarterly via
//  NSE / BSE + the company IR page.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult } from './types'
import { appendLog, isOfflineMode, nowIso } from './util'

const SOURCE_ID = 'ownership_quarterly'

export const ingestOwnership: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Quarterly shareholding pattern (listed insurers)',
  frequency: 'quarterly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    if (isOfflineMode()) {
      await appendLog('ingest-ownership.log', { source: SOURCE_ID, status: 'skipped_offline' })
      return {
        source_id: SOURCE_ID,
        status: 'pending',
        raw_file: null,
        records: [],
        records_fetched: 0,
        fetched_at,
        warnings: ['Offline mode — ownership fetcher not run.'],
      }
    }
    // TODO(live-impl): for each listed insurer in company-master.json,
    // fetch the latest shareholding-pattern PDF from NSE corporate filings,
    // parse Promoter / FII / DII / MF / Public buckets, top holders.
    return {
      source_id: SOURCE_ID,
      status: 'pending',
      raw_file: null,
      records: [],
      records_fetched: 0,
      fetched_at,
      warnings: ['Live parser not yet implemented.'],
    }
  },
}
