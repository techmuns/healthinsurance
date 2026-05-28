// ---------------------------------------------------------------------------
//  Fetcher — Per-company public disclosures (NL forms / annual report PDFs).
//
//  Loops the SAHI peer set first (Phase 1), then optionally widens to
//  General + Life insurers. Each company's investor-relations URL lives in
//  src/data/snapshots/company-master.json.
// ---------------------------------------------------------------------------

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Fetcher, FetchResult } from './types'
import { appendLog, isOfflineMode, nowIso, SNAPSHOTS_ROOT } from './util'

const SOURCE_ID = 'company_disclosures_batch'
const PHASE_1_PEERS = ['niva-bupa', 'star-health', 'care-health', 'aditya-birla', 'manipalcigna']

interface CompanyMaster {
  data: Array<{
    company_id: string
    investor_relations_url: string | null
    financial_disclosure_url: string | null
  }>
}

export const ingestCompanyDisclosures: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Company public disclosures (Phase 1: SAHI peers)',
  frequency: 'quarterly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const masterPath = resolve(SNAPSHOTS_ROOT, 'company-master.json')
    const master: CompanyMaster = JSON.parse(await readFile(masterPath, 'utf8'))
    const targets = master.data.filter((c) => PHASE_1_PEERS.includes(c.company_id))

    if (isOfflineMode()) {
      await appendLog('ingest-company-disclosures.log', {
        source: SOURCE_ID,
        status: 'skipped_offline',
        targets: targets.map((t) => t.company_id),
      })
      return {
        source_id: SOURCE_ID,
        status: 'pending',
        raw_file: null,
        records: [],
        records_fetched: 0,
        fetched_at,
        warnings: [
          'Offline mode — no company disclosure pages were fetched.',
          `Phase 1 targets: ${targets.map((t) => t.company_id).join(', ')}.`,
        ],
      }
    }

    // TODO(live-impl):
    // For each target company:
    //   1. fetch financial_disclosure_url → enumerate latest L-form / NL-form PDFs.
    //   2. download each PDF → writeRaw(`companies/${id}`, `${form}-${period}.pdf`, buffer).
    //   3. parse with pdf-parse / regex → extract GWP, NWP, NEP, PAT, ratios.
    //   4. normalise via normalize-insurance-data.ts.
    //   5. attach provenance with company-specific source_url.
    return {
      source_id: SOURCE_ID,
      status: 'pending',
      raw_file: null,
      records: [],
      records_fetched: 0,
      fetched_at,
      warnings: targets.map((t) => `Live parser not yet implemented for ${t.company_id}.`),
    }
  },
}
