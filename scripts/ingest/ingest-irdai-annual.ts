// ---------------------------------------------------------------------------
//  Fetcher — IRDAI Handbook (annual) + IRDAI Annual Report.
//
//  These two artefacts together carry industry-level segment premium,
//  market-share tables, and the annual public-disclosure cross-checks for
//  every registered insurer.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult } from './types'
import { appendLog, isOfflineMode, nowIso } from './util'

const SOURCE_ID = 'irdai_handbook'
const HANDBOOK_URL = 'https://irdai.gov.in/handbook-of-indian-insurance-statistics'
const ANNUAL_REPORT_URL = 'https://irdai.gov.in/annual-reports'

export const ingestIrdaiAnnual: Fetcher = {
  source_id: SOURCE_ID,
  name: 'IRDAI Handbook + Annual Report',
  frequency: 'annual',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    if (isOfflineMode()) {
      await appendLog('ingest-irdai-annual.log', { source: SOURCE_ID, status: 'skipped_offline' })
      return {
        source_id: SOURCE_ID,
        status: 'pending',
        raw_file: null,
        records: [],
        records_fetched: 0,
        fetched_at,
        warnings: ['Offline mode — IRDAI handbook not fetched.'],
      }
    }
    // TODO(live-impl):
    // 1. fetch HANDBOOK_URL → resolve latest PDF/XLSX link.
    // 2. download → writeRaw('irdai/annual', `handbook-FYxx.pdf`, buffer).
    // 3. parse Tables 1A (segment premium), 1B (insurer-wise GWP), 2.x
    //    (combined ratio / solvency) via pdf-parse + table extractor.
    // 4. fetch ANNUAL_REPORT_URL → save PDF, parse Chapter 3 (Non-Life).
    // 5. normalise + return rows for industry-segment-premium.json,
    //    insurer-annual-snapshot.json, sahi-peer-comparison.json.
    return {
      source_id: SOURCE_ID,
      status: 'pending',
      raw_file: null,
      records: [],
      records_fetched: 0,
      fetched_at,
      warnings: [
        `Live parser not yet implemented. Handbook: ${HANDBOOK_URL}`,
        `Annual report: ${ANNUAL_REPORT_URL}`,
      ],
    }
  },
}
