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
    <div className="group card-surface flex flex-col gap-2.5 p-4 transition-shadow duration-300 hover:shadow-lift">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <OrganicIconBlob shape={blob} tone={tone} size="sm" interactive>
            <Icon name={icon} />
          </OrganicIconBlob>
          <p className="text-[12px] font-medium leading-tight text-ink-secondary">{label}</p>
        </div>
        {signal && <SignalBadge label={signal} size="sm" />}
      </div>

      <div className="flex items-end justify-between gap-2">
        <span className={`font-display text-[30px] leading-none ${pending ? 'text-ink-secondary' : 'text-navy-deep'}`}>
          {formatValue(metric)}
        </span>
        {spark && !pending && <MiniSparkline data={spark} width={84} height={28} invert={invert} />}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-soft-border pt-2">
        {change !== undefined && !pending ? (
          <span
            className={[
              'inline-flex items-center gap-0.5 text-[12px] font-semibold',
              positiveChange ? 'text-signal-positive' : 'text-signal-negative',
            ].join(' ')}
          >
            <ChangeArrow className="h-3.5 w-3.5" />
            {formatChange(change, metric.unit === 'pp' ? 'pp' : metric.unit)}
            <span className="ml-0.5 font-normal text-ink-secondary">{metric.changeLabel}</span>
          </span>
        ) : (
          <span />
        )}
        {metric.rank && metric.rankOf && (
          <span className="text-[11px] text-ink-secondary">
            Rank <span className="font-semibold text-navy-primary">#{metric.rank}</span>/{metric.rankOf}
          </span>
        )}
      </div>
    </div>
  )
}
