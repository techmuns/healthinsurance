// ---------------------------------------------------------------------------
//  Shared types for the ingest pipeline.
//
//  Every fetcher implements the Fetcher interface so build-snapshots.ts can
//  run them uniformly, collect logs, write rows into snapshot files, and
//  update data-health.json regardless of which upstream source the fetcher
//  targets.
// ---------------------------------------------------------------------------

export type ParserStatus = 'ready' | 'pending' | 'blocked' | 'manual_fallback'

export type SnapshotTarget =
  | 'insurer-monthly-premium'
  | 'insurer-quarterly-financials'
  | 'insurer-annual-snapshot'
  | 'industry-segment-premium'
  | 'distribution-channel-mix'
  | 'distribution-reach-depth'
  | 'valuation-snapshot'
  | 'ownership-snapshot'
  | 'management-events'

export interface SnapshotRecord {
  /** Which snapshot file this record belongs to. */
  target: SnapshotTarget
  /** Keys used to find the matching row (e.g. {company_id, fiscal_year}). */
  keys: Record<string, string>
  /** Field values for the row. `null` MUST be preserved as "missing" and
   *  MUST NOT overwrite an existing populated value during merge. */
  values: Record<string, number | string | null>
  /** Provenance for every value in this record. */
  provenance: {
    source_name: string
    source_url: string
    source_file?: string | null
    source_period?: string | null
    fetched_at: string
    parsed_at: string
    parser_name: string
    confidence: 'high' | 'medium' | 'low' | 'pending'
  }
}

export interface FetchResult {
  source_id: string
  status: 'success' | 'failed' | 'pending' | 'blocked'
  /** Absolute path to the raw file we stored (PDF / XLSX / HTML / CSV). */
  raw_file: string | null
  /** Normalised records produced from the raw file, ready for snapshot merge. */
  records: SnapshotRecord[]
  records_fetched: number
  error?: string
  warnings?: string[]
  fetched_at: string
}

export interface Fetcher {
  source_id: string
  /** Human-readable label for logs. */
  name: string
  /** One of: monthly / quarterly / annual / daily / event_based. */
  frequency: 'monthly' | 'quarterly' | 'annual' | 'daily' | 'event_based'
  /** Pull raw files + normalise them. */
  run: () => Promise<FetchResult>
}
