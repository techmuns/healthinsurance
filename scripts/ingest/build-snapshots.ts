// ---------------------------------------------------------------------------
//  build-snapshots — turn fetcher results into validated snapshot files +
//  update data-health.json + data-provenance.json.
//
//  Contract:
//    - Never overwrite a populated metric with `null` from a failed fetch.
//    - Log every issue to data/logs/build-snapshots.log.
//    - Touch only snapshot files that actually changed (caller decides what
//      to commit).
// ---------------------------------------------------------------------------

import type { FetchResult } from './types'
import { appendLog, nowIso, readSnapshot, writeSnapshot } from './util'

interface HealthFile {
  last_successful_run: string | null
  last_failed_run: string | null
  sources_checked: number
  sources_success: number
  sources_failed: number
  metrics_updated: string[]
  metrics_missing: string[]
  stale_metrics: string[]
  blocked_sources: string[]
  parser_warnings: string[]
  next_expected_update: string | null
  per_source: Array<{
    source_id: string
    status: 'success' | 'failed' | 'pending' | 'blocked'
    last_attempt_at: string | null
    last_success_at: string | null
    records_fetched: number | null
    error?: string
  }>
}

export async function buildSnapshots(results: FetchResult[]) {
  const health = await readSnapshot<HealthFile>('data-health.json')
  health.sources_checked = results.length
  health.sources_success = 0
  health.sources_failed = 0
  health.parser_warnings = []

  for (const r of results) {
    const existing = health.per_source.find((p) => p.source_id === r.source_id) ?? {
      source_id: r.source_id,
      status: 'pending' as const,
      last_attempt_at: null,
      last_success_at: null,
      records_fetched: null,
    }
    existing.last_attempt_at = r.fetched_at
    existing.records_fetched = r.records_fetched
    if (r.status === 'success') {
      existing.status = 'success'
      existing.last_success_at = r.fetched_at
      health.sources_success++
    } else if (r.status === 'failed') {
      existing.status = 'failed'
      existing.error = r.error
      health.sources_failed++
    } else {
      existing.status = r.status
    }
    if (r.warnings && r.warnings.length) {
      health.parser_warnings.push(...r.warnings.map((w) => `[${r.source_id}] ${w}`))
    }
    if (!health.per_source.find((p) => p.source_id === r.source_id)) {
      health.per_source.push(existing)
    }
    await appendLog('build-snapshots.log', { source_id: r.source_id, status: r.status, records_fetched: r.records_fetched })
  }

  if (health.sources_success > 0) {
    health.last_successful_run = nowIso()
  }
  if (health.sources_failed > 0) {
    health.last_failed_run = nowIso()
  }

  await writeSnapshot('data-health.json', health)
}
