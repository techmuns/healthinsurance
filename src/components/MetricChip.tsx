import type { IndustryMetric } from '@/data/mockData'

const dot: Record<string, string> = {
  Strong: 'bg-emerald',
  Improving: 'bg-teal',
  Watch: 'bg-gold',
  Weak: 'bg-coral',
}

/** Premium supporting-metric card: navy header, stat value, explicit delta basis, micro-note. */
export function MetricChip({ metric }: { metric: IndustryMetric }) {
  return (
    <div className="surface-soft px-3.5 py-3 transition-shadow hover:shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-navy-deep">{metric.label}</span>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[metric.signal] ?? 'bg-muted-blue'}`} />
      </div>

      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-display text-[22px] leading-none text-navy-deep">{metric.value}</span>
        {metric.delta && (
          <span className={`text-[11px] font-semibold ${metric.positive === false ? 'text-coral' : 'text-emerald'}`}>
            {metric.delta}
          </span>
        )}
        {metric.basis && <span className="text-[10px] text-ink-secondary">{metric.basis}</span>}
      </div>

      {metric.note && <p className="mt-1 text-[10.5px] leading-snug text-ink-secondary">{metric.note}</p>}
    </div>
  )
}
