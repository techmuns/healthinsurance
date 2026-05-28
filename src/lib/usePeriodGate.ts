// ---------------------------------------------------------------------------
// Period gate — small hook that tells a chart whether the currently selected
// period (Monthly / Quarterly / Annual) is supported by its data. Mock data is
// annual-only, so non-Annual selections produce an `ok = false` result with a
// reason — sections render an EmptyState instead of silently falling back to
// annual numbers.
// ---------------------------------------------------------------------------

import { useFilters } from '@/state/filters'
import type { TimePeriod } from '@/data/types'

export interface PeriodGateResult {
  ok: boolean
  period: TimePeriod
  /** Human-readable reason when ok=false, e.g. "Mock dataset is annual-only". */
  reason?: string
}

/**
 * Gates a chart on the currently selected period.
 *
 * @param supported Periods the calling chart can render. Defaults to
 *                  `['Annual']` because every mock dataset in this
 *                  dashboard is annual-only.
 */
export function usePeriodGate(supported: TimePeriod[] = ['Annual']): PeriodGateResult {
  const { period } = useFilters()
  if (supported.includes(period)) return { ok: true, period }
  return {
    ok: false,
    period,
    reason:
      period === 'Monthly'
        ? 'Mock dataset is annual-only — monthly series are not wired yet.'
        : period === 'Quarterly'
          ? 'Mock dataset is annual-only — quarterly series are not wired for this chart.'
          : 'Data unavailable for this period.',
  }
}
