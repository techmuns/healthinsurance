import { Lock } from 'lucide-react'

/**
 * Locked / source-pending placeholder — a premium lock treatment used wherever
 * data isn't wired yet. Keeps the section's structure in place while signalling
 * honestly that it's locked until the source lands.
 *
 *  • Default: a standalone card.
 *  • `embedded`: a soft inset panel (no outer card) for placing INSIDE an
 *    existing card such as a ModuleCard.
 */
export function LockedPanel({
  title,
  message,
  height = 300,
  embedded = false,
  pill = 'Locked · source pending',
}: {
  title: string
  message: string
  height?: number
  embedded?: boolean
  pill?: string
}) {
  const inner = (
    <>
      {/* soft tonal glows — navy depth + a faint gold highlight */}
      <span
        className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(39,69,126,0.12) 0%, transparent 70%)' }}
      />
      <span
        className="pointer-events-none absolute -bottom-16 -left-14 h-40 w-40 rounded-full opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(182,139,58,0.1) 0%, transparent 70%)' }}
      />

      {/* premium lock pebble — navy gradient with a small gold accent + glow */}
      <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2C4A86] to-[#1B3260] text-white shadow-[0_10px_26px_rgba(23,43,77,0.28)] ring-1 ring-white/15">
        <span className="absolute inset-0 -z-10 rounded-2xl opacity-60 blur-md" style={{ background: 'radial-gradient(circle, rgba(39,69,126,0.45) 0%, transparent 70%)' }} />
        <Lock className="h-5 w-5" strokeWidth={2.2} />
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-gradient-to-br from-champagne to-champagne-deep ring-2 ring-white" />
      </span>

      <div className="relative">
        <p className="font-display text-[16px] leading-tight text-navy-deep">{title}</p>
        <p className="mt-1 max-w-md text-[12px] leading-snug text-ink-secondary">{message}</p>
      </div>

      <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-navy-deep shadow-soft ring-1 ring-[rgba(39,69,126,0.14)]">
        <Lock className="h-2.5 w-2.5 text-champagne-deep" />
        {pill}
      </span>
    </>
  )

  if (embedded) {
    return (
      <div
        className="relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-dashed border-[rgba(39,69,126,0.16)] bg-gradient-to-br from-[#FBFCFE] to-[#F3F6FB] px-6 text-center"
        style={{ minHeight: height }}
      >
        {inner}
      </div>
    )
  }

  return (
    <div
      className="card-surface relative flex flex-col items-center justify-center gap-3 overflow-hidden px-6 text-center"
      style={{ minHeight: height }}
    >
      {inner}
    </div>
  )
}

/**
 * Locked, non-interactive stand-in for an in-card control row (e.g. a View
 * toggle) when the whole module is locked — the options read as disabled and a
 * small lock makes the state unmistakable.
 */
export function LockedControl({ label, options }: { label?: string; options: string[] }) {
  return (
    <div className="flex items-center gap-2" aria-disabled title="Locked — data source pending">
      {label && <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary/70">{label}</span>}
      <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-ice/60 p-0.5">
        {options.map((o) => (
          <span key={o} className="cursor-not-allowed select-none rounded-full px-3 py-1 text-[12px] font-medium text-ink-secondary/40">
            {o}
          </span>
        ))}
      </div>
      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-navy-deep ring-1 ring-[rgba(39,69,126,0.14)] shadow-soft">
        <Lock className="h-2.5 w-2.5 text-champagne-deep" />
        Locked
      </span>
    </div>
  )
}
