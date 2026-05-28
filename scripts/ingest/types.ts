// ---------------------------------------------------------------------------
//  Shared types for the ingest pipeline.
//
//  Every fetcher implements the Fetcher interface so build-snapshots.ts can
//  run them uniformly, collect logs, and update data-health.json regardless
//  of which upstream source the fetcher targets.
// ---------------------------------------------------------------------------

export type ParserStatus = 'ready' | 'pending' | 'blocked' | 'manual_fallback'

export interface FetchResult {
  source_id: string
  status: 'success' | 'failed' | 'pending' | 'blocked'
  /** Absolute path to the raw file we stored (PDF / XLSX / HTML / CSV). */
  raw_file: string | null
  /** Normalised records produced from the raw file. */
  records: Record<string, unknown>[]
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
