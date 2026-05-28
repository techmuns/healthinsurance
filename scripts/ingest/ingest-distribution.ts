// ---------------------------------------------------------------------------
//  Fetcher — Distribution channel mix per insurer.
//
//  Distribution data is buried inside annual report MD&A sections and
//  occasional investor presentations. This fetcher targets the PDF / DOCX
//  artefacts in data/raw/companies/<id>/ that ingest-company-disclosures
//  has already saved, and extracts the channel-mix table.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult } from './types'
import { appendLog, isOfflineMode, nowIso } from './util'

const SOURCE_ID = 'distribution_extract'

export const ingestDistribution: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Distribution channel mix (per-company extract)',
  frequency: 'annual',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    if (isOfflineMode()) {
      await appendLog('ingest-distribution.log', { source: SOURCE_ID, status: 'skipped_offline' })
      return {
        source_id: SOURCE_ID,
        status: 'pending',
        raw_file: null,
        records: [],
        records_fetched: 0,
        fetched_at,
        warnings: ['Offline mode — distribution extractor not run.'],
      }
    }
    // TODO(live-impl): scan data/raw/companies/<id>/*.pdf for the channel-mix
    // table; emit rows for distribution-channel-mix.json with provenance.
    return {
      source_id: SOURCE_ID,
      status: 'pending',
      raw_file: null,
      records: [],
      records_fetched: 0,
      fetched_at,
      warnings: ['Live extractor not yet implemented.'],
    }
  },
}
