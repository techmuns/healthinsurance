// ---------------------------------------------------------------------------
//  snapshot-merge — write fetcher records into snapshot files safely.
//
//  Rules enforced here, per the data-pipeline policy:
//    • Never overwrite a populated metric with `null` from a failed parse.
//    • Always update the provenance on changed values.
//    • Mark the snapshot _meta.dataset = 'official' on any successful merge
//      (or 'mixed' if some rows remain pending).
//    • Update _meta.last_updated + last_successful_run timestamps.
// ---------------------------------------------------------------------------

import type { SnapshotRecord, SnapshotTarget } from './types'
import { nowIso, readSnapshot, writeSnapshot } from './util'

type Row = Record<string, unknown> & { provenance?: unknown }
type Snapshot = {
  _meta: {
    snapshot_id: string
    description: string
    schema_version: string
    dataset: 'official' | 'mixed' | 'mock' | 'pending'
    last_updated: string | null
    last_successful_run: string | null
    upstream_sources: string[]
    parser_status: string
    notes?: string
  }
  data: Row[]
}

const TARGET_FILES: Record<SnapshotTarget, string> = {
  'insurer-monthly-premium': 'insurer-monthly-premium.json',
  'insurer-quarterly-financials': 'insurer-quarterly-financials.json',
  'insurer-annual-snapshot': 'insurer-annual-snapshot.json',
  'industry-segment-premium': 'industry-segment-premium.json',
  'distribution-channel-mix': 'distribution-channel-mix.json',
  'distribution-reach-depth': 'distribution-reach-depth.json',
  'valuation-snapshot': 'valuation-snapshot.json',
  'ownership-snapshot': 'ownership-snapshot.json',
  'management-events': 'management-events.json',
}

/** Match a row in the snapshot by every key field. */
function findRow(snap: Snapshot, keys: Record<string, string>): Row | null {
  for (const row of snap.data) {
    if (Object.entries(keys).every(([k, v]) => row[k] === v)) return row
  }
  return null
}

/** Merge `incoming` values into `existing`, never overwriting populated → null. */
function mergeValues(existing: Row, incoming: Record<string, unknown>): { row: Row; changed: boolean } {
  let changed = false
  const out: Row = { ...existing }
  for (const [k, v] of Object.entries(incoming)) {
    if (v == null) continue // never overwrite populated with null
    if (existing[k] !== v) {
      out[k] = v
      changed = true
    }
  }
  return { row: out, changed }
}

/**
 * Merges a batch of records into their target snapshots. Returns the list of
 * snapshots that actually changed and the list of metric paths updated, for
 * the data-health report.
 */
export async function mergeRecords(records: SnapshotRecord[]): Promise<{
  snapshotsChanged: SnapshotTarget[]
  metricsUpdated: string[]
}> {
  // Group records by target.
  const byTarget = new Map<SnapshotTarget, SnapshotRecord[]>()
  for (const r of records) {
    if (!byTarget.has(r.target)) byTarget.set(r.target, [])
    byTarget.get(r.target)!.push(r)
  }

  const snapshotsChanged: SnapshotTarget[] = []
  const metricsUpdated: string[] = []

  for (const [target, group] of byTarget) {
    const file = TARGET_FILES[target]
    const snap = await readSnapshot<Snapshot>(file)
    let anyChange = false

    for (const rec of group) {
      const existing = findRow(snap, rec.keys)
      if (existing) {
        const { row, changed } = mergeValues(existing, rec.values)
        if (changed) {
          // Replace and refresh provenance.
          const idx = snap.data.indexOf(existing)
          snap.data[idx] = { ...row, provenance: rec.provenance }
          for (const [field, v] of Object.entries(rec.values)) {
            if (v != null) metricsUpdated.push(`${field}::${Object.values(rec.keys).join('::')}`)
          }
          anyChange = true
        }
      } else {
        // New row.
        snap.data.push({ ...rec.keys, ...rec.values, provenance: rec.provenance })
        for (const [field, v] of Object.entries(rec.values)) {
          if (v != null) metricsUpdated.push(`${field}::${Object.values(rec.keys).join('::')}`)
        }
        anyChange = true
      }
    }

    if (anyChange) {
      const hasNullValues = snap.data.some((r) =>
        Object.entries(r).some(([k, v]) => k !== 'provenance' && v === null),
      )
      snap._meta.dataset = hasNullValues ? 'mixed' : 'official'
      snap._meta.last_updated = nowIso().split('T')[0]
      snap._meta.last_successful_run = nowIso()
      await writeSnapshot(file, snap)
      snapshotsChanged.push(target)
    }
  }

  return { snapshotsChanged, metricsUpdated }
}
