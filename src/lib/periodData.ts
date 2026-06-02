// ---------------------------------------------------------------------------
//  periodData — the single, data-driven source of truth for "is there data
//  for this company at this period?".
//
//  The dashboard header offers three frequencies (Annual / Quarterly / Monthly).
//  Each one is backed by its own snapshot file. This module answers, for a given
//  company + period, whether real data exists — so every section can show the
//  real chart when it's there and a clean, honest "pending" state when it isn't,
//  instead of silently falling back to annual numbers.
//
//  Coverage today (derived live from the snapshots, never hardcoded):
//    • Annual    — all tracked insurers, FY22–FY25.
//    • Quarterly — only the insurers whose quarterly filings have been ingested
//                  (Niva Bupa, Care Health). Others → "Quarterly data pending".
//    • Monthly   — none yet ingested → "Monthly data pending" everywhere.
//
//  When the ingestion runs add more rows, every consumer lights up automatically
//  with no UI change required — that is the whole point of routing through here.
// ---------------------------------------------------------------------------

import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'
import quarterlySnapshot from '@/data/snapshots/insurer-quarterly-financials.json'
import monthlySnapshot from '@/data/snapshots/insurer-monthly-premium.json'
import type { TimePeriod } from '@/data/types'

interface SnapRow {
  company_id: string
}
interface SnapMeta {
  dataset?: string
  last_updated?: string | null
}
interface SnapFile {
  data: SnapRow[]
  _meta?: SnapMeta
}

const SNAPSHOTS: Record<TimePeriod, SnapFile> = {
  Annual: annualSnapshot as unknown as SnapFile,
  Quarterly: quarterlySnapshot as unknown as SnapFile,
  Monthly: monthlySnapshot as unknown as SnapFile,
}

/** Does the period dataset carry ANY rows at all? `false` ⇒ pending everywhere. */
export function periodHasAnyData(period: TimePeriod): boolean {
  return (SNAPSHOTS[period].data?.length ?? 0) > 0
}

/** Does the period dataset carry at least one row for this company? */
export function companyHasPeriodData(companyId: string, period: TimePeriod): boolean {
  return (SNAPSHOTS[period].data ?? []).some((r) => r.company_id === companyId)
}

/** Last successful ingestion date for the period dataset (null when never run). */
export function periodLastUpdated(period: TimePeriod): string | null {
  return SNAPSHOTS[period]._meta?.last_updated ?? null
}

/** Company ids that have data at this period — useful for "X of Y insurers" copy. */
export function companiesWithPeriodData(period: TimePeriod): string[] {
  return [...new Set((SNAPSHOTS[period].data ?? []).map((r) => r.company_id))]
}

export type PeriodAvailabilityKind = 'available' | 'period-pending' | 'company-pending'

export interface PeriodAvailability {
  period: TimePeriod
  /** True when real data exists for this company + period. */
  available: boolean
  kind: PeriodAvailabilityKind
  /** Headline for the pending card, e.g. "Quarterly data pending". */
  title: string
  /** One-line, company-aware explanation for the pending card. */
  body: string
  /** Last successful ingestion date for this period's dataset. */
  lastUpdated: string | null
}

/**
 * The reusable verdict for a (company, period) pair. Drives both the period
 * gate hook and the shared <PeriodPending /> card so copy stays consistent.
 */
export function resolvePeriodAvailability(
  companyId: string,
  companyName: string,
  period: TimePeriod,
): PeriodAvailability {
  const lastUpdated = periodLastUpdated(period)

  if (companyHasPeriodData(companyId, period)) {
    return { period, available: true, kind: 'available', title: `${period} data`, body: '', lastUpdated }
  }

  // The whole period hasn't been downloaded yet (e.g. Monthly) → pending for all.
  if (!periodHasAnyData(period)) {
    return {
      period,
      available: false,
      kind: 'period-pending',
      title: `${period} data pending`,
      body: `${period} figures haven't been downloaded yet. This section turns on automatically once the ${period.toLowerCase()} data lands — no redesign needed.`,
      lastUpdated,
    }
  }

  // The dataset exists, but not for this specific company yet.
  return {
    period,
    available: false,
    kind: 'company-pending',
    title: `${period} data pending for ${companyName}`,
    body: `${period} filings for ${companyName} aren't in yet — only some insurers have ${period.toLowerCase()} data so far. Pick a covered company or switch to the Annual view.`,
    lastUpdated,
  }
}
