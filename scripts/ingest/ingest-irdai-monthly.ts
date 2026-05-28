// ---------------------------------------------------------------------------
//  Fetcher — IRDAI monthly business figures.
//
//  Pulls the monthly non-life business figures release (XLSX), saves the raw
//  workbook under data/raw/irdai/monthly/, and parses it into normalised
//  monthly rows.
//
//  Live network is OPT-IN: set INGEST_OFFLINE=0 before running. Offline mode
//  is the default so accidental `npm run ingest` calls never hammer IRDAI.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult } from './types'
import { appendLog, isOfflineMode, nowIso } from './util'

const SOURCE_ID = 'irdai_monthly_business'
const SOURCE_URL = 'https://irdai.gov.in/monthly-business-figures-non-life-insurers'

export const ingestIrdaiMonthly: Fetcher = {
  source_id: SOURCE_ID,
  name: 'IRDAI Monthly Business Figures',
  frequency: 'monthly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    if (isOfflineMode()) {
      await appendLog('ingest-irdai-monthly.log', { source: SOURCE_ID, status: 'skipped_offline' })
      return {
        source_id: SOURCE_ID,
        status: 'pending',
        raw_file: null,
        records: [],
        records_fetched: 0,
        fetched_at,
        warnings: [
          'INGEST_OFFLINE is set — set INGEST_OFFLINE=0 in CI to pull live data.',
        ],
      }
    }

    // TODO(live-impl):
    // 1. fetch(SOURCE_URL), discover the latest XLSX link from the page.
    // 2. download the XLSX → writeRaw('irdai/monthly', `${YYYY-MM}.xlsx`, buffer).
    // 3. parse with `xlsx` (or `exceljs`) — extract per-insurer monthly GDPI.
    // 4. normalise via scripts/ingest/normalize-insurance-data.ts.
    // 5. return FetchResult with records.
    return {
      source_id: SOURCE_ID,
      status: 'pending',
      raw_file: null,
      records: [],
      records_fetched: 0,
      fetched_at,
      warnings: [`Live parser not yet implemented. See ${SOURCE_URL}.`],
    }
  },
}
