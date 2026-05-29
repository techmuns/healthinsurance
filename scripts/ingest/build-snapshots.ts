// ---------------------------------------------------------------------------
//  build-snapshots — write fetcher records into snapshot files + update
//  data-health.json and data-provenance.json.
//
//  Contract:
//    - Never overwrite a populated metric with `null` from a failed fetch.
//      (Enforced inside snapshot-merge.mergeRecords.)
//    - Log every issue to data/logs/build-snapshots.log.
//    - Update data-health.json with per-source status + warnings.
//    - Update data-provenance.json with one entry per metric/company/period.
// ---------------------------------------------------------------------------

import type { FetchResult, SnapshotRecord } from './types'
import { mergeRecords } from './snapshot-merge'
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

interface ProvenanceFile {
  _meta: { snapshot_id: string; description: string; schema_version: string; last_updated: string }
  entries: Record<string, {
    source_name: string
    source_url: string
    source_file?: string | null
    source_period?: string | null
    fetched_at: string | null
    confidence: 'high' | 'medium' | 'low' | 'pending'
  }>
}

export async function buildSnapshots(results: FetchResult[]) {
  const allRecords: SnapshotRecord[] = []
  for (const r of results) allRecords.push(...r.records)

  // 1. Merge records into snapshot files (null-overwrite guard + validation gate).
  const { snapshotsChanged, metricsUpdated, rejected } = await mergeRecords(allRecords)

  // 2. Update data-provenance.json.
  const provenance = await readSnapshot<ProvenanceFile>('data-provenance.json')
  for (const rec of allRecords) {
    const period = rec.keys.fiscal_year ?? rec.keys.period ?? rec.keys.quarter ?? rec.keys.month ?? 'unknown'
    const company = rec.keys.company_id ?? 'INDUSTRY'
    for (const [field, v] of Object.entries(rec.values)) {
      if (v == null) continue
      const key = `${field}::${company}::${period}`
      provenance.entries[key] = {
        source_name: rec.provenance.source_name,
        source_url: rec.provenance.source_url,
        source_file: rec.provenance.source_file ?? null,
        source_period: rec.provenance.source_period ?? period,
        fetched_at: rec.provenance.fetched_at,
        confidence: rec.provenance.confidence,
      }
    }
  }
  provenance._meta.last_updated = nowIso().split('T')[0]
  await writeSnapshot('data-provenance.json', provenance)

  // 3. Update data-health.json.
  const health = await readSnapshot<HealthFile>('data-health.json')
  health.sources_checked = results.length
  health.sources_success = 0
  health.sources_failed = 0
  health.parser_warnings = []

  for (const r of results) {
    let existing = health.per_source.find((p) => p.source_id === r.source_id)
    if (!existing) {
      existing = {
        source_id: r.source_id,
        status: 'pending',
        last_attempt_at: null,
        last_success_at: null,
        records_fetched: null,
      }
      health.per_source.push(existing)
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
    await appendLog('build-snapshots.log', {
      source_id: r.source_id,
      status: r.status,
      records_fetched: r.records_fetched,
    })
  }

  if (rejected.length > 0) {
    health.parser_warnings.push(...rejected.map((r) => `[validation-rejected] ${r}`))
  }

  if (metricsUpdated.length > 0) {
    // de-duplicate, then unique into existing
    const set = new Set([...health.metrics_updated, ...metricsUpdated])
    health.metrics_updated = Array.from(set)
  }
  if (snapshotsChanged.length > 0) {
    health.last_successful_run = nowIso()
  }
  if (health.sources_failed > 0) {
    health.last_failed_run = nowIso()
  }

  await writeSnapshot('data-health.json', health)

  return { snapshotsChanged, metricsUpdated }
}
