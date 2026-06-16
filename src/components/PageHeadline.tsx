import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
//  PageHeadline — the dashboard's premium "headline system". One slim narrative
//  band at the top of each page/tab so the reader instantly knows what they are
//  looking at: a small tone-coded icon badge, a gold eyebrow, a deep-navy display
//  title, a short sharp subtitle, a soft ivory → blue-grey gradient, a thin gold
//  accent seam and a faint tone glow. Compact by design (Bloomberg-style), never
//  a tall empty hero. An optional `right` slot carries a live status/context chip.
// ---------------------------------------------------------------------------

export type HeadlineTone = 'navy' | 'gold' | 'teal'

const TONES: Record<HeadlineTone, { eyebrow: string; badge: string; glow: string }> = {
  navy: { eyebrow: 'text-navy-primary', badge: 'bg-soft-blue text-navy-primary ring-[#D6E2FA]', glow: 'rgba(39,69,126,0.16)' },
  gold: { eyebrow: 'text-champagne-deep', badge: 'bg-champagne-soft text-champagne-deep ring-[#E7D29B]', glow: 'rgba(182,139,58,0.20)' },
  teal: { eyebrow: 'text-teal', badge: 'bg-teal-soft text-teal ring-[#BFE3E1]', glow: 'rgba(22,142,142,0.16)' },
}

export interface PageHeadlineProps {
  eyebrow?: string
  title: string
  subtitle?: string
  Icon?: LucideIcon
  tone?: HeadlineTone
  /** Live status / context chip rendered on the right. */
  right?: ReactNode
}

export function PageHeadline({ eyebrow, title, subtitle, Icon, tone = 'navy', right }: PageHeadlineProps) {
  const t = TONES[tone]
  return (
    <header className="relative mb-5 overflow-hidden rounded-2xl border border-soft-border bg-gradient-to-br from-[#F8F7F2] via-card to-[#EBF0F8] px-4 py-3.5 shadow-card sm:px-5 sm:py-4">
      {/* faint tone glow behind the badge + a thin gold accent seam at the top edge */}
      <span aria-hidden className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full opacity-70 blur-3xl" style={{ background: t.glow }} />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#B68B3A]/45 to-transparent" />
      <div className="relative flex flex-wrap items-center gap-3.5">
        {Icon && (
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${t.badge} shadow-[0_4px_14px_rgba(23,43,77,0.12)]`}>
            <Icon className="h-5 w-5" strokeWidth={2.1} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {eyebrow && <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${t.eyebrow}`}>{eyebrow}</p>}
          <h1 className="font-display text-[21px] font-semibold leading-tight text-navy-deep">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-ink-secondary">{subtitle}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  )
}
