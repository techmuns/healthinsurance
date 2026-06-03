import { Clock, EyeOff, FileQuestion } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DataStatusPill, type DataStatus } from './DataStatusPill'

// ---------------------------------------------------------------------------
//  DataEmptyState — a polished, intentional empty state for unavailable data.
//  Three honest kinds, each softly tinted to its status colour so the panel
//  reads as a deliberate, designed state — never a broken/blank chart.
//    • pending        → "Data pending" (source mapped, ingestion not complete)
//    • not-disclosed  → "Not publicly disclosed" (not available at this frequency)
//    • source-missing → "Source missing" (no reliable public source mapped yet)
// ---------------------------------------------------------------------------

/** The three unavailable kinds (everything except "available"). */
export type EmptyKind = Exclude<DataStatus, 'available'>

interface KindCopy {
  title: string
  body: string
  status: Exclude<DataStatus, 'available'>
  tint: string
  ring: string
  iconWrap: string
  Icon: LucideIcon
}

const COPY: Record<Exclude<DataStatus, 'available'>, KindCopy> = {
  pending: {
    title: 'Data pending',
    body: 'Source has been mapped, but the data has not been ingested yet.',
    status: 'pending',
    tint: 'bg-gold-soft/45',
    ring: 'border-[#EFE2C3]',
    iconWrap: 'bg-gold-soft text-gold',
    Icon: Clock,
  },
  'not-disclosed': {
    title: 'Not publicly disclosed',
    body: 'This metric is not available publicly at the selected frequency.',
    status: 'not-disclosed',
    tint: 'bg-soft-blue/60',
    ring: 'border-[#D8E2F6]',
    iconWrap: 'bg-soft-blue text-muted-blue',
    Icon: EyeOff,
  },
  'source-missing': {
    title: 'Source missing',
    body: 'No reliable public source has been mapped for this metric yet.',
    status: 'source-missing',
    tint: 'bg-ice/70',
    ring: 'border-soft-border',
    iconWrap: 'bg-ice text-ink-secondary',
    Icon: FileQuestion,
  },
}

export function DataEmptyState({
  kind,
  title,
  body,
  height = 240,
  showPill = true,
  className = '',
}: {
  kind: Exclude<DataStatus, 'available'>
  title?: string
  body?: string
  height?: number
  showPill?: boolean
  className?: string
}) {
  const c = COPY[kind]
  const Icon = c.Icon
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl2 border border-dashed ${c.ring} ${c.tint} px-6 text-center transition-colors duration-300 ${className}`}
      style={{ height }}
      role="note"
    >
      <span className={`blob-c mb-3 inline-flex h-11 w-11 items-center justify-center ${c.iconWrap}`}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-[13px] font-semibold text-navy-deep">{title ?? c.title}</p>
      <p className="mt-1 max-w-sm text-[11.5px] leading-relaxed text-ink-secondary">{body ?? c.body}</p>
      {showPill && (
        <span className="mt-2.5">
          <DataStatusPill status={c.status} />
        </span>
      )}
    </div>
  )
}
