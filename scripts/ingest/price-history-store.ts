// ---------------------------------------------------------------------------
//  price-history-store — the single source of truth for daily stock movement.
//
//  All price/volume/delivery fetchers (Yahoo for close+volume, NSE for the
//  deliverable columns, the workbook seed for the listing→Jul-25 history) write
//  THROUGH this store so they never clobber each other. The store loads the
//  committed snapshot, MERGES new rows in (fill-nulls; an existing real value is
//  never overwritten by a later null), and writes it back sorted + de-duped.
//
//  Honesty rules inherited from the pipeline: a missing field stays `null`
//  (never 0); deliverable quantity is an NSE-only field, so Yahoo rows leave it
//  null until an official NSE delivery file fills it. Provenance is per row.
// ---------------------------------------------------------------------------

import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { SNAPSHOTS_ROOT, fileExists, nowIso, writeSnapshot } from './util'

export const PRICE_SNAPSHOT_FILE = 'price-history-snapshot.json'

export interface PriceProvenance {
  source_name: string
  source_url: string
  source_file?: string | null
  source_period?: string | null
  fetched_at: string
  parsed_at: string
  parser_name: string
  confidence: 'high' | 'medium' | 'low' | 'pending'
}

export interface PriceRow {
  company_id: string
  /** ISO date (YYYY-MM-DD) of the trading session. */
  date: string
  close: number | null
  traded_qty: number | null
  /** NSE-only field; null when the source (e.g. Yahoo) doesn't carry delivery. */
  deliverable_qty: number | null
  provenance: PriceProvenance
}

export interface PriceSnapshot {
  _meta: Record<string, unknown>
  data: PriceRow[]
}

const rowKey = (r: { company_id: string; date: string }) => `${r.company_id}|${r.date}`

/** Load the committed snapshot, or an empty shell if it doesn't exist yet. */
export async function loadPriceHistory(): Promise<PriceSnapshot> {
  const path = resolve(SNAPSHOTS_ROOT, PRICE_SNAPSHOT_FILE)
  if (!(await fileExists(path))) {
    return { _meta: {}, data: [] }
  }
  const snap = JSON.parse(await readFile(path, 'utf8')) as Partial<PriceSnapshot>
  return { _meta: snap._meta ?? {}, data: Array.isArray(snap.data) ? (snap.data as PriceRow[]) : [] }
}

/** Take the field with the most information: keep an existing real value rather
 *  than overwrite it with a null; otherwise the incoming value wins. */
function fillField<T>(existing: T | null | undefined, incoming: T | null | undefined): T | null {
  if (incoming !== null && incoming !== undefined) return incoming
  return existing ?? null
}

/**
 * Merge incoming daily rows into the store. Fill-nulls semantics:
 *  - a date not seen before is added;
 *  - for a date already present, each field keeps the existing real value and
 *    only fills where it was null (so the workbook/NSE deliverable column is
 *    never wiped by a later Yahoo pull that lacks it, and vice-versa).
 * Returns the count of rows added + rows enriched.
 */
export function mergePriceRows(
  snap: PriceSnapshot,
  incoming: PriceRow[],
): { added: number; enriched: number } {
  const byKey = new Map<string, PriceRow>(snap.data.map((r) => [rowKey(r), r]))
  let added = 0
  let enriched = 0
  for (const inc of incoming) {
    const key = rowKey(inc)
    const cur = byKey.get(key)
    if (!cur) {
      byKey.set(key, inc)
      added++
      continue
    }
    const merged: PriceRow = {
      company_id: cur.company_id,
      date: cur.date,
      close: fillField(cur.close, inc.close),
      traded_qty: fillField(cur.traded_qty, inc.traded_qty),
      deliverable_qty: fillField(cur.deliverable_qty, inc.deliverable_qty),
      // Keep the provenance of whichever source supplied the close price; if the
      // existing row had no close and the incoming one does, adopt incoming's.
      provenance: cur.close != null ? cur.provenance : inc.close != null ? inc.provenance : cur.provenance,
    }
    const changed =
      merged.close !== cur.close ||
      merged.traded_qty !== cur.traded_qty ||
      merged.deliverable_qty !== cur.deliverable_qty
    if (changed) enriched++
    byKey.set(key, merged)
  }
  snap.data = [...byKey.values()].sort((a, b) =>
    a.company_id === b.company_id ? a.date.localeCompare(b.date) : a.company_id.localeCompare(b.company_id),
  )
  return { added, enriched }
}

/** Persist the snapshot, refreshing the `_meta` housekeeping fields. */
export async function savePriceHistory(snap: PriceSnapshot, metaPatch: Record<string, unknown> = {}): Promise<void> {
  const companies = [...new Set(snap.data.map((r) => r.company_id))]
  const dates = snap.data.map((r) => r.date).sort()
  snap._meta = {
    ...snap._meta,
    snapshot_id: 'price-history-snapshot',
    schema_version: '1.1.0',
    dataset: snap.data.length ? 'official' : 'pending',
    last_updated: nowIso(),
    row_count: snap.data.length,
    companies,
    coverage: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    ...metaPatch,
  }
  await writeSnapshot(PRICE_SNAPSHOT_FILE, snap)
}
