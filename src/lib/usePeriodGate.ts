// ---------------------------------------------------------------------------
// Period gate — small hooks that tell a section whether the currently selected
// period (Monthly / Quarterly / Annual) can be rendered.
//
// Two flavours, both reading the global header state:
//
//   • usePeriodGate(supported)   — STATIC capability gate. Use when a chart is
//     built on a series that only exists at one frequency (e.g. the GI pool
//     shift and channel-mix charts are annual-only by construction). Defaults
//     to ['Annual'].
//
//   • useCompanyPeriodData()     — DATA-DRIVEN gate. Use when a section can in
//     principle render any frequency and the only question is whether the
//     snapshot actually carries rows for the active company + period. Lights up
//     automatically as new quarterly/monthly data is ingested.
// ---------------------------------------------------------------------------

import { useFilters, useActiveCompany } from '@/state/filters'
import type { TimePeriod } from '@/data/types'
import { resolvePeriodAvailability, type PeriodAvailability } from '@/lib/periodData'

export interface PeriodGateResult {
  ok: boolean
  period: TimePeriod
  /** Human-readable reason when ok=false, e.g. "Quarterly data pending". */
  reason?: string
}

/**
 * Static capability gate for charts that only exist at certain frequencies.
 *
 * @param supported Periods the calling chart can render. Defaults to
 *                  `['Annual']` because the industry-structure series in this
 *                  dashboard (pool shift, channel mix) are annual-only.
 */
export function usePeriodGate(supported: TimePeriod[] = ['Annual']): PeriodGateResult {
  const { period } = useFilters()
  if (supported.includes(period)) return { ok: true, period }
  return {
    ok: false,
    period,
    reason:
      period === 'Monthly'
        ? 'Monthly data pending — this chart is reported annually.'
        : period === 'Quarterly'
          ? 'Quarterly data pending — this chart is reported annually.'
          : 'Data unavailable for this period.',
  }
}

/**
 * Data-driven gate: resolves whether the active company has real data at the
 * selected period, reading the snapshots through `resolvePeriodAvailability`.
 * Returns the full availability verdict so callers can render <PeriodPending />.
 */
export function useCompanyPeriodData(): PeriodAvailability {
  const { period } = useFilters()
  const company = useActiveCompany()
  return resolvePeriodAvailability(company.id, company.shortName, period)
}
