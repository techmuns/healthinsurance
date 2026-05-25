import { SignalBadge } from './SignalBadge'
import { formatChange, formatValue, statusTone } from '@/lib/format'
import type { Metric } from '@/data/types'

export interface MiniKpiProps {
  label: string
  metric: Metric
  invert?: boolean
}

/** Compact KPI tile used inside module headers (no icon, dense). */
export function MiniKpi({ label, metric, invert = false }: MiniKpiProps) {
  const pending = metric.value === null
  const change = metric.change
  const positive = change !== undefined && (invert ? change < 0 : change > 0)

  return (
    <div className="rounded-xl border border-soft-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-secondary">{label}</p>
        {pending && <SignalBadge label="Pending" tone={statusTone.Pending} size="sm" />}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className={`font-display text-xl ${pending ? 'text-ink-secondary' : 'text-navy-deep'}`}>
          {formatValue(metric)}
        </span>
        {change !== undefined && !pending && (
          <span className={`text-xs font-semibold ${positive ? 'text-signal-positive' : 'text-signal-negative'}`}>
            {formatChange(change, metric.unit === 'pp' ? 'pp' : metric.unit)}
          </span>
        )}
      </div>
    </div>
  )
}
