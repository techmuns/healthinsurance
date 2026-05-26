import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronDown } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { compareQuarters, compareYears, getCompareSeries } from '@/data/mockData'
import type { CompareMetricKey } from '@/data/mockData'
import type { Insurer } from '@/data/types'

type Period = 'Quarterly' | 'Yearly'

interface MetricDef {
  key: CompareMetricKey
  label: string
  /** Grouping shown beside the label in the selector. */
  group: string
  unit: '₹ Cr' | '%' | 'mn'
  /** Lower is better (cost ratios). */
  invert?: boolean
  format: (v: number) => string
}

const fmtCr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')} Cr`
const fmtPct0 = (v: number) => `${Math.round(v)}%`
const fmtPct1 = (v: number) => `${v.toFixed(1)}%`
const fmtMn = (v: number) => `${v.toFixed(1)} mn`

// Unique, operational metrics — deliberately distinct from the scorecard /
// heatmap (growth, share Δ, combined ratio, solvency, valuation).
const METRICS: MetricDef[] = [
  { key: 'gwp', label: 'GWP', group: 'Premium', unit: '₹ Cr', format: fmtCr },
  { key: 'nwp', label: 'NWP', group: 'Premium', unit: '₹ Cr', format: fmtCr },
  { key: 'nep', label: 'NEP', group: 'Premium', unit: '₹ Cr', format: fmtCr },
  { key: 'retailMix', label: 'Retail Mix', group: 'Business mix', unit: '%', format: fmtPct0 },
  { key: 'bancaMix', label: 'Banca Mix', group: 'Business mix', unit: '%', format: fmtPct0 },
  { key: 'renewalRate', label: 'Renewal Rate', group: 'Franchise', unit: '%', format: fmtPct0 },
  { key: 'settlementRatio', label: 'Claims Settlement', group: 'Franchise', unit: '%', format: fmtPct1 },
  { key: 'expenseRatio', label: 'Expense Ratio', group: 'Cost', unit: '%', invert: true, format: fmtPct1 },
  { key: 'lossRatio', label: 'Loss Ratio', group: 'Cost', unit: '%', invert: true, format: fmtPct1 },
  { key: 'policyCount', label: 'Policy Count', group: 'Scale', unit: 'mn', format: fmtMn },
]

// Premium, consistent per-company palette — distinct but controlled (no neon).
const COMPANY_COLORS: Record<string, string> = {
  'niva-bupa': '#27457E', // deep blue (focal)
  'star-health': '#168E8E', // teal
  'care-health': '#3F9B6B', // muted green
  'aditya-birla': '#C2902F', // amber / gold
  manipalcigna: '#C8635A', // soft coral
  'icici-lombard': '#6E7BD6', // muted lavender
  'bajaj-general': '#64748B', // slate
  'hdfc-life': '#3D5F9F', // muted blue
  'sbi-life': '#9C7430', // deep champagne
}
const FALLBACK_COLOR = '#8A93A6'
const GRID = '#EAEEF6'
const AXIS_TEXT = '#6B7280'

interface CompanySeries {
  id: string
  name: string
  color: string
  focal: boolean
  values: (number | null)[]
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-soft-border bg-ice/70 px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
      {children}
    </span>
  )
}

interface TooltipEntry {
  dataKey?: string | number
  value?: number | null
  color?: string
  name?: string
}

function ChartTooltip({
  active,
  payload,
  label,
  focalId,
  def,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
  focalId: string
  def: MetricDef
}) {
  if (!active || !payload?.length || !label) return null
  const rows = payload
    .map((p) =>
      p.value == null
        ? null
        : { name: String(p.name ?? p.dataKey), color: p.color ?? FALLBACK_COLOR, focal: p.dataKey === focalId, value: p.value },
    )
    .filter((r): r is { name: string; color: string; focal: boolean; value: number } => r !== null)
    .sort((a, b) => (def.invert ? a.value - b.value : b.value - a.value))

  return (
    <div className="rounded-lg border border-soft-border bg-card px-3 py-2 shadow-card">
      <p className="mb-1.5 text-[11px] font-semibold text-navy-deep">{label}</p>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-4 text-[11.5px]">
            <span className="flex items-center gap-1.5 text-ink-secondary">
              <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />
              <span className={r.focal ? 'font-semibold text-navy-deep' : ''}>{r.name}</span>
            </span>
            <span className="font-semibold text-navy-deep tabular-nums">{def.format(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Time-based company comparison: period on the axis, constant peer set as colored bars. */
export function CompareCompanies({ companies, focalId }: { companies: Insurer[]; focalId: string }) {
  const [period, setPeriod] = useState<Period>('Quarterly')
  const [metricKey, setMetricKey] = useState<CompareMetricKey>('gwp')
  const def = METRICS.find((m) => m.key === metricKey)!

  const periods = period === 'Quarterly' ? compareQuarters : compareYears

  const series: CompanySeries[] = useMemo(
    () =>
      companies.map((c) => ({
        id: c.id,
        name: c.shortName,
        color: COMPANY_COLORS[c.id] ?? FALLBACK_COLOR,
        focal: c.id === focalId,
        values: getCompareSeries(c.id, metricKey, period),
      })),
    [companies, focalId, metricKey, period],
  )

  const present = series.filter((s) => s.values.some((v) => v !== null))
  const missing = series.filter((s) => s.values.every((v) => v === null))

  const chartData = useMemo(
    () =>
      periods.map((p, i) => {
        const row: Record<string, number | string | null> = { period: p }
        present.forEach((s) => {
          row[s.id] = s.values[i]
        })
        return row
      }),
    [periods, present],
  )

  // Dynamic insight: leader in the latest period + strongest mover across it.
  const insight = useMemo(() => {
    const last = periods.length - 1
    const scored = present
      .map((s) => {
        const latest = s.values[last]
        const first = s.values.find((v) => v !== null) ?? null
        if (latest == null || first == null) return null
        return { name: s.name, latest, delta: latest - first }
      })
      .filter((x): x is { name: string; latest: number; delta: number } => x !== null)
    if (!scored.length) return null
    const leader = [...scored].sort((a, b) => (def.invert ? a.latest - b.latest : b.latest - a.latest))[0]
    // For cost ratios, "improvement" means the largest decrease.
    const mover = [...scored].sort((a, b) => (def.invert ? a.delta - b.delta : b.delta - a.delta))[0]
    const dir = def.invert ? 'lowest' : 'highest'
    if (mover.name === leader.name) {
      return `${leader.name} holds the ${dir} ${def.label.toLowerCase()} and the strongest trend across the period.`
    }
    return `${leader.name} holds the ${dir} ${def.label.toLowerCase()} in ${periods[last]}; ${mover.name} shows the strongest improvement across the period.`
  }, [present, periods, def])

  const axisFmt = (v: number) => {
    if (def.unit === '₹ Cr') return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${v}`
    if (def.unit === '%') return `${Math.round(v)}`
    return `${v}`
  }

  return (
    <div className="card-surface p-4 sm:p-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <p className="font-display text-[15px] text-navy-deep">Compare key metrics over time</p>
          <p className="mt-0.5 text-[12px] text-ink-secondary">
            Same tracked peer set, compared within each period
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SegmentedControl<Period>
            label="Period"
            options={['Quarterly', 'Yearly'] as Period[]}
            value={period}
            onChange={setPeriod}
            size="sm"
          />
          <label className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">Metric</span>
            <span className="relative block">
              <select
                value={metricKey}
                onChange={(e) => setMetricKey(e.target.value as CompareMetricKey)}
                className="appearance-none rounded-lg border border-soft-border bg-ice py-1.5 pl-3 pr-8 text-[13px] font-semibold text-navy-deep outline-none transition-colors hover:border-muted-blue focus:border-navy-primary"
              >
                {METRICS.map((mtr) => (
                  <option key={mtr.key} value={mtr.key}>
                    {mtr.label} · {mtr.group}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-secondary" />
            </span>
          </label>
        </div>
      </div>

      {/* Legend — compact, color-matched */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {present.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5 text-[11.5px]">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
            <span className={s.focal ? 'font-semibold text-navy-deep' : 'text-ink-secondary'}>{s.name}</span>
          </span>
        ))}
      </div>

      {/* Grouped bars — period on the X-axis, one bar per company */}
      <div className="mt-3">
        {present.length > 0 ? (
          <ResponsiveContainer width="100%" height={304}>
            <BarChart data={chartData} margin={{ top: 8, right: 6, left: 0, bottom: 4 }} barCategoryGap="22%" barGap={2}>
              <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
              <XAxis
                dataKey="period"
                tickLine={false}
                axisLine={{ stroke: GRID }}
                tick={{ fontSize: 12, fill: '#26303F', fontWeight: 600 }}
                dy={4}
              />
              <YAxis
                tickFormatter={axisFmt}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: AXIS_TEXT }}
                width={42}
              />
              <Tooltip
                cursor={{ fill: 'rgba(39,69,126,0.05)' }}
                content={<ChartTooltip focalId={focalId} def={def} />}
              />
              {present.map((s) => (
                <Bar
                  key={s.id}
                  dataKey={s.id}
                  name={s.name}
                  fill={s.color}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={26}
                  isAnimationActive={false}
                />
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
        {insight ? (
          <p className="text-[12px] text-ink-secondary">{insight}</p>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill>Basis: {def.unit === '₹ Cr' ? 'Reported / Derived' : 'Reported'}</Pill>
          <Pill>Period: {period}</Pill>
          <Pill>Constant peer set</Pill>
          <Pill>Source: IRDAI / company filing</Pill>
        </div>
      </div>

      {missing.length > 0 && (
        <p className="mt-2 text-[11px] text-ink-secondary">
          Not reported for {def.label}: {missing.map((s) => s.name).join(', ')}.
        </p>
      )}
    </div>
  )
}
