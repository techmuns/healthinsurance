import type { IndustryMetric } from '@/data/mockData'

// Status dot + delta tones tuned for legibility on the dark navy surface.
const dot: Record<string, string> = {
  Strong: 'bg-[#86CBA3]',
  Improving: 'bg-[#7FD0D0]',
  Watch: 'bg-[#E7BE74]',
  Weak: 'bg-[#E59B98]',
}

/**
 * Premium navy-gradient mini-card — same visual family as the Investor Read
 * panel (deep blue surface, soft blob overlay, layered depth), scaled down.
 */
export function MetricChip({ metric }: { metric: IndustryMetric }) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-navy-deep via-navy-primary to-[#244382] px-3.5 py-3 text-white shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift">
      <span className="pointer-events-none absolute -right-7 -top-7 h-16 w-16 blob-a bg-white/[0.06]" />
      <span className="pointer-events-none absolute -bottom-8 -left-6 h-16 w-16 blob-c bg-white/[0.04]" />

      <div className="relative flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{metric.label}</span>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[metric.signal] ?? 'bg-white/60'}`} />
      </div>

      <div className="relative mt-1.5 flex items-baseline gap-1.5">
        <span className="font-display text-[22px] leading-none text-white">{metric.value}</span>
        {metric.delta && (
          <span className={`text-[11px] font-semibold ${metric.positive === false ? 'text-[#E59B98]' : 'text-[#86CBA3]'}`}>
            {metric.delta}
          </span>
        )}
        {metric.basis && <span className="text-[10px] text-white/45">{metric.basis}</span>}
      </div>

      {metric.note && <p className="relative mt-1 text-[10.5px] leading-snug text-white/65">{metric.note}</p>}
    </div>
  )
}
