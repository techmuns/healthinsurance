import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeftRight, ChevronDown, TrendingUp, Trophy } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { compareQuarters, compareYears, getCompareSeries } from '@/data/mockData'
import type { CompareMetricKey } from '@/data/mockData'
import type { Insurer } from '@/data/types'

type Period = 'Quarterly' | 'Yearly'
type Unit = '₹ Cr' | '%' | 'mn' | '₹'

interface MetricDef {
  key: CompareMetricKey
  label: string
  /** Grouping shown beside the label in the selector. */
  group: string
  unit: Unit
  /** Lower is better (cost ratios). */
  invert?: boolean
  format: (v: number) => string
}

const fmtCr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')} Cr`
const fmtRs = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`
const fmtPct0 = (v: number) => `${Math.round(v)}%`
const fmtPct1 = (v: number) => `${v.toFixed(1)}%`
const fmtMn = (v: number) => `${v.toFixed(1)} mn`

// Unique, operational metrics — deliberately distinct from the scorecard /
// heatmap (growth, share Δ, combined ratio, solvency, valuation, ROE).
const METRICS: MetricDef[] = [
  { key: 'gwp', label: 'GWP', group: 'Premium', unit: '₹ Cr', format: fmtCr },
  { key: 'nwp', label: 'NWP', group: 'Premium', unit: '₹ Cr', format: fmtCr },
  { key: 'nep', label: 'NEP', group: 'Premium', unit: '₹ Cr', format: fmtCr },
  { key: 'retailMix', label: 'Retail Mix', group: 'Business mix', unit: '%', format: fmtPct0 },
  { key: 'bancaMix', label: 'Banca Mix', group: 'Business mix', unit: '%', format: fmtPct0 },
  { key: 'agencyMix', label: 'Agency Mix', group: 'Business mix', unit: '%', format: fmtPct0 },
  { key: 'renewalRate', label: 'Renewal Rate', group: 'Franchise', unit: '%', format: fmtPct0 },
  { key: 'settlementRatio', label: 'Claims Settlement', group: 'Franchise', unit: '%', format: fmtPct1 },
  { key: 'commissionRatio', label: 'Commission Ratio', group: 'Cost', unit: '%', invert: true, format: fmtPct1 },
  { key: 'expenseRatio', label: 'Expense Ratio', group: 'Cost', unit: '%', invert: true, format: fmtPct1 },
  { key: 'lossRatio', label: 'Loss Ratio', group: 'Cost', unit: '%', invert: true, format: fmtPct1 },
  { key: 'policyCount', label: 'Policy Count', group: 'Scale', unit: 'mn', format: fmtMn },
  { key: 'averagePremium', label: 'Average Premium', group: 'Scale', unit: '₹', format: fmtRs },
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
const GOOD = '#2F855A'
const BAD = '#C75D54'

interface CompanySeries {
  id: string
  name: string
  color: string
  focal: boolean
  values: (number | null)[]
}

/** Signed change in the metric's "good" direction → tone for delta chips. */
function deltaTone(delta: number, invert?: boolean): string {
  if (Math.abs(delta) < 1e-9) return AXIS_TEXT
  const improving = invert ? delta < 0 : delta > 0
  return improving ? GOOD : BAD
}

function fmtDelta(delta: number, unit: Unit): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  const mag = Math.abs(delta)
  if (unit === '%') return `${sign}${mag.toFixed(1)} pp`
  if (unit === 'mn') return `${sign}${mag.toFixed(1)} mn`
  if (unit === '₹') return `${sign}₹${Math.round(mag).toLocaleString('en-IN')}`
  return `${sign}₹${Math.round(mag).toLocaleString('en-IN')} Cr`
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
  rows,
  periods,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
  focalId: string
  def: MetricDef
  rows: Record<string, number | string | null>[]
  periods: readonly string[]
}) {
  if (!active || !payload?.length || !label) return null
  const idx = periods.indexOf(label)
  const prev = idx > 0 ? rows[idx - 1] : null
  const items = payload
    .map((p) => {
      if (p.value == null) return null
      const id = String(p.dataKey)
      const prevVal = prev?.[id]
      const delta = typeof prevVal === 'number' ? p.value - prevVal : null
      return { id, name: String(p.name ?? id), color: p.color ?? FALLBACK_COLOR, focal: id === focalId, value: p.value, delta }
    })
    .filter((r): r is { id: string; name: string; color: string; focal: boolean; value: number; delta: number | null } => r !== null)
    .sort((a, b) => (def.invert ? a.value - b.value : b.value - a.value))

  return (
    <div className="rounded-lg border border-soft-border bg-card px-3 py-2 shadow-card">
      <p className="mb-1.5 text-[11px] font-semibold text-navy-deep">{label}</p>
      <div className="space-y-1">
        {items.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-5 text-[11.5px]">
            <span className="flex items-center gap-1.5 text-ink-secondary">
              <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />
              <span className={r.focal ? 'font-semibold text-navy-deep' : ''}>{r.name}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="font-semibold text-navy-deep tabular-nums">{def.format(r.value)}</span>
              {r.delta !== null && (
                <span className="tabular-nums font-medium" style={{ color: deltaTone(r.delta, def.invert) }}>
                  {fmtDelta(r.delta, def.unit)}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-ink-secondary">Δ vs previous period</p>
    </div>
  )
}

interface InsightChip {
  kind: 'leader' | 'improver' | 'gap'
  label: string
  company: string
  color: string
  detail: string
}

/** Time-based peer comparison: period on the axis, constant peer set as colored bars. */
export function CompareCompanies({ companies, focalId }: { companies: Insurer[]; focalId: string }) {
  const [period, setPeriod] = useState<Period>('Quarterly')
  const [metricKey, setMetricKey] = useState<CompareMetricKey>('gwp')
  const def = METRICS.find((m) => m.key === metricKey)!

  const periods = period === 'Quarterly' ? compareQuarters : compareYears
  const lastIdx = periods.length - 1
  const spanLabel = period === 'Quarterly' ? 'the last four quarters' : 'FY22–FY25'

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

  const present = useMemo(() => series.filter((s) => s.values.some((v) => v !== null)), [series])
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

  // Leader / improver / gap analysis on the active metric + period.
  const analysis = useMemo(() => {
    const scored = present
      .map((s) => {
        const latest = s.values[lastIdx]
        const first = s.values.find((v) => v !== null) ?? null
        if (latest == null || first == null) return null
        const delta = latest - first
        // Relative gain in the metric's "good" direction — normalises across
        // company sizes so the improver isn't just the largest player.
        const gain = (def.invert ? -delta : delta) / (Math.abs(first) || 1)
        return { id: s.id, name: s.name, color: s.color, focal: s.focal, latest, first, delta, gain }
      })
      .filter((x): x is { id: string; name: string; color: string; focal: boolean; latest: number; first: number; delta: number; gain: number } => x !== null)
    if (!scored.length) return null

    const leader = [...scored].sort((a, b) => (def.invert ? a.latest - b.latest : b.latest - a.latest))[0]
    const byGain = [...scored].sort((a, b) => b.gain - a.gain)
    // Prefer an improver distinct from the leader so the chips say two things.
    const improver = byGain.find((s) => s.id !== leader.id) ?? byGain[0]
    const focal = scored.find((s) => s.focal)

    const chips: InsightChip[] = [
      {
        kind: 'leader',
        label: 'Leader',
        company: leader.name,
        color: leader.color,
        detail: `${def.format(leader.latest)} · ${periods[lastIdx]}`,
      },
      {
        kind: 'improver',
        label: 'Fastest improver',
        company: improver.name,
        color: improver.color,
        detail: `${fmtDelta(improver.delta, def.unit)} over ${period === 'Quarterly' ? '4 quarters' : 'FY22–FY25'}`,
      },
    ]

    // Gap watch — relative to the focal company where present, else top-two.
    let gap: InsightChip
    const peers = scored.filter((s) => !s.focal)
    if (focal && peers.length) {
      const closest = [...peers].sort((a, b) => Math.abs(a.latest - focal.latest) - Math.abs(b.latest - focal.latest))[0]
      const gapNow = Math.abs(closest.latest - focal.latest)
      const gapThen = Math.abs(closest.first - focal.first)
      const narrowing = gapNow < gapThen
      gap = {
        kind: 'gap',
        label: 'Gap watch',
        company: narrowing ? `${closest.name} → ${focal.name}` : `${focal.name} vs ${closest.name}`,
        color: closest.color,
        detail: narrowing
          ? `closing — gap now ${def.format(gapNow)}`
          : `widening — gap now ${def.format(gapNow)}`,
      }
    } else {
      const sorted = [...scored].sort((a, b) => (def.invert ? a.latest - b.latest : b.latest - a.latest))
      const runner = sorted[1] ?? sorted[0]
      gap = {
        kind: 'gap',
        label: 'Gap watch',
        company: `${runner.name} → ${leader.name}`,
        color: runner.color,
        detail: `gap ${def.format(Math.abs(runner.latest - leader.latest))}`,
      }
    }
    chips.push(gap)

    // One-line narrative takeaway.
    const focalImproved = focal ? (def.invert ? focal.delta < -0.05 : focal.delta > 0.05) : false
    const focalSoftened = focal ? (def.invert ? focal.delta > 0.05 : focal.delta < -0.05) : false
    const focalWord = !focal
      ? null
      : focalImproved
        ? 'improved steadily'
        : focalSoftened
          ? 'softened'
          : 'held broadly steady'
    const leaderClause =
      leader.id === focalId ? 'holds the top spot' : `remains the leader on ${def.label.toLowerCase()}`
    const takeaway = focal && focalWord
      ? `${focal.name} ${focalWord} on ${def.label.toLowerCase()} across ${spanLabel}, while ${leader.name} ${leaderClause}.`
      : `${leader.name} ${leaderClause} across ${spanLabel}; ${improver.name} improved fastest.`

    return { chips, takeaway, leaderId: leader.id, leaderColor: leader.color }
  }, [present, def, periods, lastIdx, period, spanLabel, focalId])

  const axisFmt = (v: number) => {
    if (def.unit === '₹ Cr' || def.unit === '₹') return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${v}`
    if (def.unit === '%') return `${Math.round(v)}`
    return `${v}`
  }

  // Leader medallion drawn above the leading company's latest-period bar.
  const renderLeaderBadge = (props: { x?: number; y?: number; width?: number; index?: number }) => {
    const { x = 0, y = 0, width = 0, index } = props
    if (index !== lastIdx || !analysis) return <g />
    const cx = x + width / 2
    const cy = y - 11
    return (
      <g>
        <circle cx={cx} cy={cy} r={7.5} fill={analysis.leaderColor} />
        <text x={cx} y={cy + 0.5} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700} fill="#fff">
          ★
        </text>
      </g>
    )
  }

  return (
    <div className="card-surface p-4 sm:p-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <p className="font-display text-[15px] text-navy-deep">Compare key metrics over time</p>
          <p className="mt-0.5 text-[12px] text-ink-secondary">Same tracked peer set, compared within each period</p>
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

      {/* Insight chips — leader / fastest improver / gap watch */}
      {analysis && (
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {analysis.chips.map((chip) => {
            const Icon = chip.kind === 'leader' ? Trophy : chip.kind === 'improver' ? TrendingUp : ArrowLeftRight
            return (
              <div
                key={chip.kind}
                className="relative overflow-hidden rounded-xl2 border border-soft-border bg-ice/60 px-3.5 py-2.5"
              >
                <span className="absolute left-0 top-0 h-full w-1" style={{ background: chip.color }} />
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">
                  <Icon className="h-3.5 w-3.5" style={{ color: chip.color }} />
                  {chip.label}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-navy-deep">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: chip.color }} />
                  {chip.company}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-secondary">{chip.detail}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Legend — compact, color-matched, marks the current leader */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {present.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5 text-[11.5px]">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
            <span className={s.focal ? 'font-semibold text-navy-deep' : 'text-ink-secondary'}>{s.name}</span>
            {analysis?.leaderId === s.id && (
              <span className="rounded-full bg-navy-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-navy-primary">
                Leads
              </span>
            )}
          </span>
        ))}
      </div>

      {/* Grouped bars — period on the X-axis, one bar per company */}
      <div className="mt-3">
        {present.length > 0 ? (
          <ResponsiveContainer width="100%" height={312}>
            <BarChart data={chartData} margin={{ top: 26, right: 6, left: 0, bottom: 4 }} barCategoryGap="20%" barGap={2}>
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
                content={<ChartTooltip focalId={focalId} def={def} rows={chartData} periods={periods} />}
              />
              {present.map((s) => (
                <Bar
                  key={s.id}
                  dataKey={s.id}
                  name={s.name}
                  fill={s.color}
                  fillOpacity={s.focal ? 1 : 0.9}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={26}
                  isAnimationActive={false}
                  label={analysis?.leaderId === s.id ? renderLeaderBadge : undefined}
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

      {/* Takeaway + basis */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-soft-border pt-3">
        {analysis ? <p className="text-[12px] text-ink-secondary">{analysis.takeaway}</p> : <span />}
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
