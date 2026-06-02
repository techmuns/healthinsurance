import { CalendarClock } from 'lucide-react'
import type { TimePeriod } from '@/data/types'
import { resolvePeriodAvailability, type PeriodAvailability } from '@/lib/periodData'

export interface PeriodPendingProps {
  /** Pre-resolved availability (preferred — comes from useCompanyPeriodData). */
  availability?: PeriodAvailability
  /** Or resolve inline from a period + company name. */
  period?: TimePeriod
  companyName?: string
  /** Override the resolved headline (e.g. for charts that are annual-only by design). */
  title?: string
  /** Override the resolved explanation. */
  body?: string
  /** Extra one-line context appended under the body. */
  note?: string
  /** Fixed pixel height — defaults to 280 so it slots into existing chart frames. */
  height?: number
}

/**
 * Shared "this frequency isn't downloaded yet" card. The single, on-brand
 * empty state every section uses when the selected period has no real data for
 * the active company — so the dashboard never passes annual numbers off as
 * quarterly/monthly. Carries an honest status chip + last-updated date, and is
 * intentionally calm (decision-grade, not a loud error).
 */
export function PeriodPending({ availability, period, companyName, title, body, note, height = 280 }: PeriodPendingProps) {
  const a: PeriodAvailability =
    availability ?? resolvePeriodAvailability('', companyName ?? 'this company', period ?? 'Quarterly')

  // Status-chip wording matches the requested vocabulary exactly.
  const chip = `${a.period} data pending`
  const headline = title ?? a.title
  const explanation = body ?? a.body

  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-6 text-center"
      style={{ height }}
    >
      <span className="blob-c mb-3 inline-flex h-12 w-12 items-center justify-center bg-soft-blue text-navy-primary">
        <CalendarClock className="h-5 w-5" />
      </span>

      <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#E7DCC4] bg-[#FBF6EA] px-2.5 py-1 text-[10.5px] font-semibold text-[#8C6B1A]">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {chip}
      </span>

      <p className="text-[13px] font-semibold text-navy-deep">{headline}</p>
      <p className="mt-1 max-w-md text-[11.5px] leading-relaxed text-ink-secondary">{explanation}</p>
      {note && <p className="mt-1 max-w-md text-[11px] leading-relaxed text-ink-secondary/85">{note}</p>}

      <p className="mt-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-ink-secondary/80">
        {a.lastUpdated ? `Source last updated · ${a.lastUpdated}` : 'Not yet downloaded from source'}
      </p>
    </div>
  )
}
