import { Lightbulb } from 'lucide-react'
import { OrganicIconBlob } from './OrganicIconBlob'
import { SignalBadge } from './SignalBadge'

export interface InsightLine {
  label: string
  value: string
}

export interface InsightBoxProps {
  signal?: string
  lines: InsightLine[]
  variant?: 'panel' | 'inline'
  title?: string
}

/**
 * Structured investor insight: Signal / Why / Implication / Next trigger.
 * Used as the short "one investor insight" inside every module.
 */
export function InsightBox({ signal, lines, variant = 'inline', title = 'Investor insight' }: InsightBoxProps) {
  return (
    <div
      className={[
        'relative overflow-hidden rounded-xl p-4',
        variant === 'panel'
          ? 'bg-navy-deep text-white shadow-card'
          : 'border border-soft-border bg-soft-blue/40',
      ].join(' ')}
    >
      {variant === 'panel' && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-champagne/70 to-transparent" />
      )}
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <OrganicIconBlob shape="blob-e" tone={variant === 'panel' ? 'muted' : 'navy'} size="sm">
            <Lightbulb />
          </OrganicIconBlob>
          <span
            className={[
              'text-[11px] font-semibold uppercase tracking-[0.06em]',
              variant === 'panel' ? 'text-white/70' : 'text-ink-secondary',
            ].join(' ')}
          >
            {title}
          </span>
        </div>
        {signal && <SignalBadge label={signal} size="sm" />}
      </div>
      <dl className="space-y-1.5">
        {lines.map((l) => (
          <div key={l.label} className="flex gap-2 text-[12.5px] leading-relaxed">
            <dt
              className={[
                'w-[88px] shrink-0 font-semibold',
                variant === 'panel' ? 'text-white/55' : 'text-navy-primary',
              ].join(' ')}
            >
              {l.label}
            </dt>
            <dd className={variant === 'panel' ? 'text-white/90' : 'text-ink-primary'}>{l.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
