import { Lock } from 'lucide-react'

/**
 * Locked / pending placeholder — a clear lock overlay used wherever data isn't
 * wired yet (Management Events, monthly views). Keeps the structure in place
 * (the section still exists) while signalling honestly that it's pending.
 */
export function LockedPanel({
  title,
  message,
  height = 300,
}: {
  title: string
  message: string
  height?: number
}) {
  return (
    <div
      className="card-surface relative flex flex-col items-center justify-center gap-3 overflow-hidden px-6 text-center"
      style={{ minHeight: height }}
    >
      <span
        className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(148,163,184,0.18) 0%, transparent 70%)' }}
      />
      <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-ice ring-1 ring-soft-border">
        <Lock className="h-5 w-5 text-ink-secondary" />
      </span>
      <div className="relative">
        <p className="font-display text-[16px] leading-tight text-navy-deep">{title}</p>
        <p className="mt-1 max-w-md text-[12px] leading-snug text-ink-secondary">{message}</p>
      </div>
      <span className="relative inline-flex items-center gap-1.5 rounded-full bg-ice/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-secondary ring-1 ring-soft-border">
        <Lock className="h-2.5 w-2.5" />
        Locked
      </span>
    </div>
  )
}
