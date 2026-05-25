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

// Signal-led accent used for the card's top strip and corner wash.
const accent: Record<Signal, { bar: string; wash: string; spark: string }> = {
  Strong: { bar: 'bg-emerald', wash: 'rgba(47,133,90,0.07)', spark: '#2F855A' },
  Improving: { bar: 'bg-teal', wash: 'rgba(22,142,142,0.07)', spark: '#168E8E' },
  Watch: { bar: 'bg-gold', wash: 'rgba(183,121,31,0.07)', spark: '#3D5F9F' },
  Weak: { bar: 'bg-coral', wash: 'rgba(199,93,84,0.07)', spark: '#C75D54' },
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
  const a = signal ? accent[signal] : null

  return (
    <div className="group card-surface relative flex flex-col gap-2.5 overflow-hidden p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift">
      {/* signal accent strip */}
      {a && <span className={`absolute inset-x-0 top-0 h-[3px] ${a.bar}`} />}
      {/* soft corner wash */}
      {a && (
        <span
          className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 blob-a"
          style={{ background: a.wash }}
        />
      )}
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <OrganicIconBlob shape={blob} tone={tone} size="sm" interactive>
            <Icon name={icon} />
          </OrganicIconBlob>
          <p className="text-[12px] font-medium leading-tight text-ink-secondary">{label}</p>
        </div>
        {signal && <SignalBadge label={signal} size="sm" />}
      </div>

      <div className="relative flex items-end justify-between gap-2">
        <span className={`font-display text-[30px] leading-none ${pending ? 'text-ink-secondary' : 'text-navy-deep'}`}>
          {formatValue(metric)}
        </span>
        {spark && !pending && <MiniSparkline data={spark} width={84} height={28} color={a?.spark} invert={invert} />}
      </div>

      <div className="relative flex items-center justify-between gap-2 border-t border-soft-border pt-2">
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
