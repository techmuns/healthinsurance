import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { OrganicIconBlob } from './OrganicIconBlob'
import { SignalBadge } from './SignalBadge'
import { MiniSparkline } from './MiniSparkline'
import { Icon, type IconKey } from './icons'
import { formatChange, formatValue } from '@/lib/format'
import type { Metric, Signal } from '@/data/types'

export interface KpiCardProps {
  label: string
  metric: Metric
  signal?: Signal
  spark?: number[]
  icon: IconKey
  blob?: 'blob-a' | 'blob-b' | 'blob-c' | 'blob-d' | 'blob-e'
  tone?: 'navy' | 'soft' | 'muted'
  /** Lower-is-better metric (combined ratio, valuation). */
  invert?: boolean
}

export function KpiCard({
  label,
  metric,
  signal,
  spark,
  icon,
  blob = 'blob-a',
  tone = 'soft',
  invert = false,
}: KpiCardProps) {
  const pending = metric.value === null
  const change = metric.change
  const positiveChange = change !== undefined && (invert ? change < 0 : change > 0)
  const ChangeArrow = change !== undefined && change < 0 ? ArrowDownRight : ArrowUpRight

  return (
    <div className="group card-surface flex flex-col gap-4 p-5 transition-shadow duration-300 hover:shadow-lift">
      <div className="flex items-start justify-between">
        <OrganicIconBlob shape={blob} tone={tone} size="md" interactive>
          <Icon name={icon} />
        </OrganicIconBlob>
        {signal && <SignalBadge label={signal} size="sm" />}
      </div>

      <div>
        <p className="text-[13px] font-medium leading-snug text-ink-secondary">{label}</p>
        <div className="mt-1 flex items-end gap-2">
          <span className={`font-display text-[28px] leading-none ${pending ? 'text-ink-secondary' : 'text-navy-deep'}`}>
            {formatValue(metric)}
          </span>
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          {change !== undefined && !pending && (
            <span
              className={[
                'inline-flex items-center gap-1 text-xs font-semibold',
                positiveChange ? 'text-signal-positive' : 'text-signal-negative',
              ].join(' ')}
            >
              <ChangeArrow className="h-3.5 w-3.5" />
              {formatChange(change, metric.unit === 'pp' ? 'pp' : metric.unit)}
              <span className="font-normal text-ink-secondary">{metric.changeLabel}</span>
            </span>
          )}
          {metric.rank && metric.rankOf && (
            <span className="text-[11px] text-ink-secondary">
              Peer rank <span className="font-semibold text-navy-primary">#{metric.rank}</span> of {metric.rankOf}
            </span>
          )}
        </div>
        {spark && !pending && (
          <MiniSparkline data={spark} invert={invert} />
        )}
      </div>
    </div>
  )
}
