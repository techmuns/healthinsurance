import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronDown } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { insurers, quarterlyReviews } from '@/data/mockData'
import type { Insurer } from '@/data/types'

type Period = 'Quarterly' | 'Yearly'
type MKey =
  | 'gwp'
  | 'nwp'
  | 'growth'
  | 'marketShare'
  | 'retailMix'
  | 'combinedRatio'
  | 'roe'
  | 'solvency'
  | 'valuation'

interface MetricDef {
  key: MKey
  label: string
  /** Lower is better (combined ratio, valuation). */
  invert?: boolean
  /** Genuinely differs between quarter and year (flow metrics). */
  periodVaries?: boolean
  format: (v: number) => string
}

const fmtCr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')} Cr`
const fmtPct = (v: number) => `${v.toFixed(1)}%`

const METRICS: MetricDef[] = [
  { key: 'gwp', label: 'GWP', periodVaries: true, format: fmtCr },
  { key: 'nwp', label: 'NWP', periodVaries: true, format: fmtCr },
  { key: 'growth', label: 'GWP Growth', format: fmtPct },
  { key: 'marketShare', label: 'Market Share', format: (v) => `${v.toFixed(0)}%` },
  { key: 'retailMix', label: 'Retail Mix', format: (v) => `${v.toFixed(0)}%` },
  { key: 'combinedRatio', label: 'Combined Ratio', invert: true, format: fmtPct },
  { key: 'roe', label: 'ROE', format: fmtPct },
  { key: 'solvency', label: 'Solvency', format: (v) => `${v.toFixed(2)}x` },
  { key: 'valuation', label: 'Valuation (P/GWP)', invert: true, format: (v) => `${v.toFixed(1)}x` },
]

const FOCAL = '#26477F'
const PEER = '#7C8AA0'
const GRID = '#EEF1F7'

function bridgeVal(id: string, label: 'GWP' | 'NWP', period: Period): number | null {
  const b = quarterlyReviews[id]?.bridge.find((x) => x.label === label)
  if (!b) return null
  if (period === 'Yearly') return b.currentYtd
  if (b.currentYtd == null || b.previousYtd == null) return null
  return Math.round((b.currentYtd - b.previousYtd) * 10) / 10
}

function metricValue(c: Insurer, key: MKey, period: Period): number | null {
  switch (key) {
    case 'gwp':
      return bridgeVal(c.id, 'GWP', period)
    case 'nwp':
      return bridgeVal(c.id, 'NWP', period)
    case 'growth':
      return c.growth
    case 'marketShare':
      return c.marketShare
    case 'retailMix':
      return c.retailMix === 0 ? null : c.retailMix
    case 'combinedRatio':
      return c.combinedRatio === 0 ? null : c.combinedRatio
    case 'roe':
      return c.roe
    case 'solvency':
      return c.solvency
    case 'valuation':
      return c.valuation
  }
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-soft-border bg-ice/70 px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
      {children}
    </span>
  )
}

/** Interactive comparison workspace: metric × companies × period, as bars. */
export function CompareCompanies({ focalId }: { focalId: string }) {
  const [period, setPeriod] = useState<Period>('Yearly')
  const [metricKey, setMetricKey] = useState<MKey>('gwp')
  const [selected, setSelected] = useState<string[]>(() =>
    Array.from(new Set([focalId, 'star-health', 'care-health'])),
  )
  const def = METRICS.find((m) => m.key === metricKey)!

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id],
    )

  const data = useMemo(
    () =>
      selected
        .map((id) => insurers.find((i) => i.id === id))
        .filter((c): c is Insurer => Boolean(c))
        .map((c) => ({ id: c.id, name: c.shortName, value: metricValue(c, metricKey, period), focal: c.id === focalId }))
        .filter((d): d is { id: string; name: string; value: number; focal: boolean } => d.value !== null)
        .sort((a, b) => (def.invert ? a.value - b.value : b.value - a.value))
        .map((d) => ({ ...d, display: def.format(d.value), color: d.focal ? FOCAL : PEER })),
    [selected, metricKey, period, focalId, def],
  )

  const missing = selected
    .map((id) => insurers.find((i) => i.id === id))
    .filter((c): c is Insurer => c !== undefined && metricValue(c, metricKey, period) === null)

  const best = data[0]
  const periodNote = def.periodVaries
    ? period === 'Quarterly'
      ? 'Standalone quarter (derived from YTD)'
      : 'Full year (FY25)'
    : period === 'Quarterly'
      ? 'Latest quarter'
      : 'Latest year'
  const chartHeight = Math.max(140, data.length * 44)

  return (
    <div className="card-surface p-4 sm:p-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <SegmentedControl<Period> label="Period" options={['Quarterly', 'Yearly'] as Period[]} value={period} onChange={setPeriod} size="sm" />
        <label className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">Metric</span>
          <span className="relative block">
            <select
              value={metricKey}
              onChange={(e) => setMetricKey(e.target.value as MKey)}
              className="appearance-none rounded-lg border border-soft-border bg-ice py-1.5 pl-3 pr-8 text-[13px] font-semibold text-navy-deep outline-none transition-colors hover:border-muted-blue focus:border-navy-primary"
            >
              {METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-secondary" />
          </span>
        </label>
      </div>

      {/* Company multi-select chips */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {insurers.map((c) => {
          const on = selected.includes(c.id)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              aria-pressed={on}
              className={[
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-all duration-200',
                on
                  ? 'border-navy-primary/30 bg-soft-blue/60 text-navy-deep'
                  : 'border-soft-border bg-ice text-ink-secondary hover:text-navy-primary',
              ].join(' ')}
            >
              {c.id === focalId && <span className="h-1.5 w-1.5 rounded-full bg-navy-primary" />}
              {c.shortName}
            </button>
          )
        })}
      </div>

      {/* Comparison bars */}
      <div className="mt-4">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, left: 8, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke={GRID} strokeDasharray="3 3" />
              <XAxis type="number" hide domain={[0, 'dataMax']} />
              <YAxis type="category" dataKey="name" width={104} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#26303F' }} />
              <Tooltip cursor={{ fill: 'rgba(39,69,126,0.04)' }} formatter={(v: number) => def.format(v)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={28} isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.id} fill={d.color} />
                ))}
                <LabelList dataKey="display" position="right" fill="#172B4D" style={{ fontSize: 11, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-4 py-10 text-center text-[12px] text-ink-secondary">
            No reported values for {def.label} in the current selection.
          </div>
        )}
      </div>

      {/* Insight + basis */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-soft-border pt-3">
        {best ? (
          <p className="text-[12px] text-ink-secondary">
            <span className="font-semibold text-navy-primary">{best.name}</span> leads selected peers on {def.label}.
          </p>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill>Basis: Reported</Pill>
          <Pill>Period: {period}</Pill>
          <Pill>{periodNote}</Pill>
          <Pill>Source: IRDAI / company filing</Pill>
        </div>
      </div>

      {missing.length > 0 && (
        <p className="mt-2 text-[11px] text-ink-secondary">
          Not reported for {def.label}: {missing.map((c) => c.shortName).join(', ')}.
        </p>
      )}
    </div>
  )
}
