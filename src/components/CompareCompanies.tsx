import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronDown } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { buildCompare, opMetrics, type ComparePeriod, type OpKey } from '@/lib/compare'
import type { Insurer } from '@/data/types'

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-soft-border bg-ice/70 px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
      {children}
    </span>
  )
}

/**
 * Time-based company comparison: period on the X-axis, the (constant) peer
 * group as distinctly-coloured grouped bars. Metrics are unique to this panel.
 */
export function CompareCompanies({ companies }: { companies: Insurer[] }) {
  const [period, setPeriod] = useState<ComparePeriod>('Yearly')
  const [metricKey, setMetricKey] = useState<OpKey>('gwp')

  const { data, series, def, missing } = buildCompare(companies, metricKey, period)

  const tickFmt = (v: number) => {
    if (def.unit === '₹ Cr') return v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`
    if (def.unit === 'mn') return `${v}`
    return `${v}`
  }

  // One-line takeaway: latest-period leader + biggest mover over the series.
  let insight: string | null = null
  if (series.length && data.length) {
    const latest = data[data.length - 1] as Record<string, number>
    const first = data[0] as Record<string, number>
    let leader = series[0]
    series.forEach((s) => {
      const v = latest[s.name]
      const lv = latest[leader.name]
      if (def.invert ? v < lv : v > lv) leader = s
    })
    let mover = series[0]
    let best = -Infinity
    series.forEach((s) => {
      const imp = def.invert ? first[s.name] - latest[s.name] : latest[s.name] - first[s.name]
      if (imp > best) {
        best = imp
        mover = s
      }
    })
    insight =
      mover.id === leader.id
        ? `${leader.name} leads on ${def.label} and improved most over the ${period.toLowerCase()} series.`
        : `${leader.name} leads on ${def.label}; ${mover.name} improved most over the ${period.toLowerCase()} series.`
  }

  const periodNote = def.kind === 'flow' ? (period === 'Quarterly' ? 'Standalone quarter' : 'Full year') : 'Period-end'

  return (
    <div className="card-surface p-4 sm:p-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <SegmentedControl<ComparePeriod> label="Period" options={['Quarterly', 'Yearly'] as ComparePeriod[]} value={period} onChange={setPeriod} size="sm" />
        <label className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">Metric</span>
          <span className="relative block">
            <select
              value={metricKey}
              onChange={(e) => setMetricKey(e.target.value as OpKey)}
              className="appearance-none rounded-lg border border-soft-border bg-ice py-1.5 pl-3 pr-8 text-[13px] font-semibold text-navy-deep outline-none transition-colors hover:border-muted-blue focus:border-navy-primary"
            >
              {opMetrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-secondary" />
          </span>
        </label>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-secondary">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: s.color }} />
            {s.name}
          </span>
        ))}
      </div>

      {/* Grouped bars — period on X-axis */}
      <div className="mt-3">
        {series.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 8, right: 12, left: -4, bottom: 0 }} barCategoryGap="22%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F7" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: '#EEF1F7' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={false} width={44} tickFormatter={tickFmt} />
              <Tooltip cursor={{ fill: 'rgba(39,69,126,0.04)' }} formatter={(v: number) => def.format(v)} contentStyle={{ fontSize: 12 }} />
              {series.map((s) => (
                <Bar key={s.id} dataKey={s.name} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-4 py-10 text-center text-[12px] text-ink-secondary">
            {def.label} is not reported for the companies in this peer group.
          </div>
        )}
      </div>

      {/* Insight + basis */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-soft-border pt-3">
        {insight ? <p className="text-[12px] text-ink-secondary">{insight}</p> : <span />}
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill>Period: {period}</Pill>
          <Pill>{periodNote}</Pill>
          <Pill>Illustrative trend (mock)</Pill>
          <Pill>Source: IRDAI / company filing</Pill>
        </div>
      </div>

      {missing.length > 0 && (
        <p className="mt-2 text-[11px] text-ink-secondary">
          Not reported for {def.label}: {missing.join(', ')}.
        </p>
      )}
    </div>
  )
}
