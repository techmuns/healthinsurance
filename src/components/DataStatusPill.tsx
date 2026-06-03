import { Check, Clock, EyeOff, FileQuestion } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ---------------------------------------------------------------------------
//  DataStatusPill — the single, consistent way to label a metric's data state
//  across the dashboard. Four honest states, colour-psychology coded:
//    • Available           → very light green  (positive / real data present)
//    • Data Pending        → muted amber/gold  (caution / source mapped, not ingested)
//    • Not Publicly Disclosed → soft blue      (neutral — a disclosure-cadence fact)
//    • Source Missing      → neutral grey      (a gap — no source mapped yet)
//  None uses red: none of these is a risk/deterioration signal (soft red is
//  reserved for that elsewhere).
// ---------------------------------------------------------------------------

export type DataStatus = 'available' | 'pending' | 'not-disclosed' | 'source-missing'

export const DATA_STATUS_LABEL: Record<DataStatus, string> = {
  available: 'Available',
  pending: 'Data Pending',
  'not-disclosed': 'Not Publicly Disclosed',
  'source-missing': 'Source Missing',
}

/** One-line explanation, reused by the empty states + tooltips. */
export const DATA_STATUS_NOTE: Record<DataStatus, string> = {
  available: 'Real, source-backed data is present.',
  pending: 'Source has been mapped, but the data has not been ingested yet.',
  'not-disclosed': 'This metric is not available publicly at the selected frequency.',
  'source-missing': 'No reliable public source has been mapped for this metric yet.',
}

const STYLE: Record<DataStatus, { cls: string; Icon: LucideIcon }> = {
  available: { cls: 'bg-emerald-soft text-emerald ring-1 ring-[#CFE3DA]', Icon: Check },
  pending: { cls: 'bg-gold-soft text-gold ring-1 ring-[#F0E1BE]', Icon: Clock },
  'not-disclosed': { cls: 'bg-soft-blue text-muted-blue ring-1 ring-[#D6E0F5]', Icon: EyeOff },
  'source-missing': { cls: 'bg-ice text-ink-secondary ring-1 ring-soft-border', Icon: FileQuestion },
}

export function DataStatusPill({
  status,
  label,
  size = 'sm',
  className = '',
}: {
  status: DataStatus
  /** Override the default label (e.g. a frequency-specific phrasing). */
  label?: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const s = STYLE[status]
  const Icon = s.Icon
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full font-semibold leading-none',
        size === 'sm' ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-[11px]',
        s.cls,
        className,
      ].join(' ')}
      title={DATA_STATUS_NOTE[status]}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {label ?? DATA_STATUS_LABEL[status]}
    </span>
  )
}
