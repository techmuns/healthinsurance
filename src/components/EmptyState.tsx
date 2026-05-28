import { CalendarOff } from 'lucide-react'

export interface EmptyStateProps {
  title?: string
  body?: string
  /** Fixed pixel height — defaults to 240 so it slots into existing chart frames. */
  height?: number
}

/**
 * Calm "data unavailable" card. Used when a section's chart data does not
 * exist for the currently selected period (or other filter combinations).
 * Visually softer than `ChartEmpty` because it's a real signal to the user
 * that their selection isn't supported, not a "wiring pending" placeholder.
 */
export function EmptyState({
  title = 'Data unavailable for this period',
  body = 'Switch the period toggle to Annual to see this chart.',
  height = 240,
}: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-6 text-center"
      style={{ height }}
    >
      <span className="blob-c mb-3 inline-flex h-11 w-11 items-center justify-center bg-soft-blue text-navy-primary">
        <CalendarOff className="h-5 w-5" />
      </span>
      <p className="text-[13px] font-semibold text-navy-deep">{title}</p>
      <p className="mt-1 max-w-sm text-[11.5px] leading-relaxed text-ink-secondary">{body}</p>
    </div>
  )
}
