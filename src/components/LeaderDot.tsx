// Gold "leader / best in column" marker, used consistently across charts,
// ranking bars, scorecards and tables.

export function LeaderDot({ className = '', title = 'Best in column' }: { className?: string; title?: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-champagne ${className}`}
    />
  )
}

/** Tiny "● = best in column" legend chip. */
export function BestInColumnLegend({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] text-ink-secondary ${className}`}>
      <LeaderDot /> = best in column
    </span>
  )
}
