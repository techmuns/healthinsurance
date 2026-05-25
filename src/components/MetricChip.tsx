import type { IndustryMetric } from '@/data/mockData'

const dot: Record<string, string> = {
  Strong: 'bg-emerald',
  Improving: 'bg-teal',
  Watch: 'bg-gold',
  Weak: 'bg-coral',
}

/** Compact supporting-metric tile (label, value, delta, status dot). */
export function MetricChip({ metric }: { metric: IndustryMetric }) {
  return (
    <div className="surface-soft px-3 py-2 hover:shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-medium uppercase tracking-wide text-ink-secondary">
          {metric.label}
        </span>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[metric.signal] ?? 'bg-muted-blue'}`} />
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-display text-[18px] leading-none text-navy-deep">{metric.value}</span>
        {metric.delta && (
          <span
            className={`text-[11px] font-semibold ${
              metric.positive === false ? 'text-coral' : 'text-emerald'
            }`}
          >
            {metric.delta}
          </span>
        )}
      </div>
    </div>
  )
}
