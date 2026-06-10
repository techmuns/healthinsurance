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
import { SUSPECT_SOURCE_FILE, validateByTarget } from './validate-insurance-data'

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
  'gic-health-portfolio': 'gic-health-portfolio.json',
  'gic-health-quarterly': 'gic-health-quarterly.json',
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

/**
 * Merge `incoming` values into `existing`. Rules:
 *   1. Never overwrite populated → null (failed extraction can't clobber).
 *   2. If the existing row carries provenance.confidence === 'high' AND the
 *      incoming record's parser_name starts with "ingest-" (i.e. is from an
 *      automated parser, not a hand-curated seed), per-field updates are
 *      blocked: the parser can only FILL EMPTY fields, never overwrite a
 *      field already trusted as high-confidence. Prevents Q3 quarterly
 *      disclosures from clobbering audited FY25-annual press-release values.
 *   3. Existing-null fields can always be filled by any incoming value
 *      that passes the per-fetcher validator.
 */
function mergeValues(
  existing: Row,
  incoming: Record<string, unknown>,
  incomingProvenance?: { parser_name?: string; confidence?: string },
): { row: Row; changed: boolean } {
  let changed = false
  const out: Row = { ...existing }
  const existingProv = (existing.provenance as { confidence?: string; parser_name?: string } | undefined) ?? {}
  const existingPinned = existingProv.confidence === 'high'
  const incomingFromParser = incomingProvenance?.parser_name?.startsWith('ingest-') ?? false
  // A parser may correct its OWN prior high-confidence write — same parser_name,
  // re-parsed from the same source with improved logic (e.g. a fixed extractor
  // replacing an earlier mis-read). It still may NOT clobber a value written by
  // a DIFFERENT parser or a hand-curated seed, which is what the pin guard
  // protects (e.g. quarterly disclosures vs audited FY25-annual values).
  const sameParser =
    !!incomingProvenance?.parser_name && existingProv.parser_name === incomingProvenance.parser_name
  // Pin guard: if existing row is high-confidence and the incoming write
  // comes from a DIFFERENT automated parser, only fill empty fields.
  const fillOnly = existingPinned && incomingFromParser && !sameParser
  for (const [k, v] of Object.entries(incoming)) {
    if (v == null) continue // never overwrite populated with null
    if (fillOnly && existing[k] != null) continue // pin guard
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
  rejected: string[]
}> {
  // Group records by target.
  const byTarget = new Map<SnapshotTarget, SnapshotRecord[]>()
  for (const r of records) {
    if (!byTarget.has(r.target)) byTarget.set(r.target, [])
    byTarget.get(r.target)!.push(r)
  }

  const snapshotsChanged: SnapshotTarget[] = []
  const metricsUpdated: string[] = []
  const rejected: string[] = []

  for (const [target, group] of byTarget) {
    const file = TARGET_FILES[target]
    const snap = await readSnapshot<Snapshot>(file)
    let anyChange = false

    for (const rec of group) {
      const existing = findRow(snap, rec.keys)

      // Validation gate: build the would-be-merged row and reject implausible
      // parser output (NEP>GWP, fraction combined ratios, non-financial source
      // files) instead of writing it. Prior good values are preserved.
      const candidate: Row = { ...(existing ?? rec.keys) }
      for (const [k, v] of Object.entries(rec.values)) if (v != null) candidate[k] = v
      const srcFile = String((rec.provenance as { source_file?: string })?.source_file ?? '')
      const errors = validateByTarget(target, candidate as Record<string, unknown>).filter(
        (i) => i.level === 'error',
      )
      if (errors.length > 0 || (srcFile && SUSPECT_SOURCE_FILE.test(srcFile))) {
        rejected.push(
          `${target} ${Object.values(rec.keys).join('/')}: ${
            errors.map((e) => e.message).join('; ') || `suspect source file ${srcFile}`
          }`,
        )
        continue
      }

      if (existing) {
        const { row, changed } = mergeValues(existing, rec.values, rec.provenance)
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

  return { snapshotsChanged, metricsUpdated, rejected }
}
