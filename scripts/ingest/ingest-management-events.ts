// ---------------------------------------------------------------------------
//  Fetcher — Management / governance events.
//
//  Sources: NSE / BSE corporate actions & announcements (listed insurers),
//  company-IR press releases (all insurers).
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult } from './types'
import { appendLog, isOfflineMode, nowIso } from './util'

const SOURCE_ID = 'management_events_feed'

export const ingestManagementEvents: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Management events feed',
  frequency: 'event_based',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    if (isOfflineMode()) {
      await appendLog('ingest-management-events.log', { source: SOURCE_ID, status: 'skipped_offline' })
      return {
        source_id: SOURCE_ID,
        status: 'pending',
        raw_file: null,
        records: [],
        records_fetched: 0,
        fetched_at,
        warnings: ['Offline mode — management-events fetcher not run.'],
      }
    }
    // TODO(live-impl): poll NSE / BSE filings for KMP changes and board
    // changes; poll company IR press releases for appointments / resignations.
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
