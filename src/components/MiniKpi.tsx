import { SignalBadge } from './SignalBadge'
import { formatChange, formatValue, statusTone } from '@/lib/format'
import type { Metric } from '@/data/types'

export interface MiniKpiProps {
  label: string
  metric: Metric
  invert?: boolean
}

// Signal-tinted styling: positive → pale mint + teal accent, negative → pale
// coral, neutral → clean white. Colour carries meaning, kept very subtle.
const tone = {
  positive: { card: 'border-[#D6EADF] bg-[#F5FAF7]', accent: 'bg-teal', change: 'text-signal-positive' },
  negative: { card: 'border-[#EDD6D5] bg-[#FCF6F5]', accent: 'bg-coral', change: 'text-signal-negative' },
  neutral: { card: 'border-soft-border bg-card', accent: '', change: 'text-ink-secondary' },
}

/** Compact KPI tile used inside module headers — key number large, muted sublabel. */
export function MiniKpi({ label, metric, invert = false }: MiniKpiProps) {
  const pending = metric.value === null
  const change = metric.change
  const dir = change === undefined || change === 0 ? 'neutral' : (invert ? change < 0 : change > 0) ? 'positive' : 'negative'
  const t = tone[pending ? 'neutral' : dir]

  return (
    <div className={`relative overflow-hidden rounded-xl border px-4 py-3 ${t.card}`}>
      {t.accent && <span className={`absolute inset-y-0 left-0 w-[3px] ${t.accent}`} />}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</p>
        {pending && <SignalBadge label="Pending" tone={statusTone.Pending} size="sm" />}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className={`font-display text-[22px] leading-none ${pending ? 'text-ink-secondary' : 'text-navy-deep'}`}>
          {formatValue(metric)}
        </span>
        {change !== undefined && !pending && (
          <span className={`text-[11px] font-semibold ${t.change}`}>
            {formatChange(change, metric.unit === 'pp' ? 'pp' : metric.unit)}
          </span>
        )}
      </div>
    </div>
  )
}

