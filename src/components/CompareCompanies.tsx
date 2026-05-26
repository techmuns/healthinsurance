import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeftRight, BarChart3, Check, ChevronDown, LineChart as LineGlyph, ShieldAlert, TrendingUp, Trophy } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { compareQuarters, compareYears, getCompareSeries } from '@/data/mockData'
import type { CompareMetricKey } from '@/data/mockData'
import type { Insurer } from '@/data/types'

type Period = 'Quarterly' | 'Yearly'
type Unit = '₹ Cr' | '%' | 'mn' | '₹'
type Family = 'scale' | 'ratioLow' | 'ratioHigh' | 'mix'

interface MetricDef {
  key: CompareMetricKey
  label: string
  group: string
  unit: Unit
  family: Family
  better: 'higher' | 'lower'
  /** One short, dynamic context line shown under the chart title. */
  context: string
  format: (v: number) => string
}

const isInvert = (d: MetricDef) => d.better === 'lower'
const chartTypeOf = (d: MetricDef): 'bar' | 'line' => (d.family === 'scale' ? 'bar' : 'line')

const fmtCr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')} Cr`
const fmtRs = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`
const fmtPct0 = (v: number) => `${Math.round(v)}%`
const fmtPct1 = (v: number) => `${v.toFixed(1)}%`
const fmtMn = (v: number) => `${v.toFixed(1)} mn`

// Unique, operating metrics — deliberately distinct from the scorecard / heatmap
// (growth, share Δ, combined ratio, solvency, valuation, ROE). Each carries the
// metadata that drives chart type, insight chips, title and tooltip meaning.
const METRICS: MetricDef[] = [
  { key: 'gwp', label: 'GWP', group: 'Premium', unit: '₹ Cr', family: 'scale', better: 'higher', context: 'GWP shows business scale.', format: fmtCr },
  { key: 'nwp', label: 'NWP', group: 'Premium', unit: '₹ Cr', family: 'scale', better: 'higher', context: 'NWP is premium net of reinsurance.', format: fmtCr },
  { key: 'nep', label: 'NEP', group: 'Premium', unit: '₹ Cr', family: 'scale', better: 'higher', context: 'NEP is premium earned in the period.', format: fmtCr },
  { key: 'policyCount', label: 'Policy Count', group: 'Scale', unit: 'mn', family: 'scale', better: 'higher', context: 'Policy count shows the customer base.', format: fmtMn },
  { key: 'averagePremium', label: 'Average Premium', group: 'Scale', unit: '₹', family: 'scale', better: 'higher', context: 'Average premium per policy.', format: fmtRs },
  { key: 'retailMix', label: 'Retail Mix', group: 'Business mix', unit: '%', family: 'mix', better: 'higher', context: 'Retail mix shows business quality.', format: fmtPct0 },
  { key: 'bancaMix', label: 'Banca Mix', group: 'Business mix', unit: '%', family: 'mix', better: 'lower', context: 'Banca mix shows channel dependence.', format: fmtPct0 },
  { key: 'agencyMix', label: 'Agency Mix', group: 'Business mix', unit: '%', family: 'mix', better: 'lower', context: 'Agency mix shows channel reliance.', format: fmtPct0 },
  { key: 'renewalRate', label: 'Renewal Rate', group: 'Franchise', unit: '%', family: 'ratioHigh', better: 'higher', context: 'Renewal rate shows customer stickiness.', format: fmtPct0 },
  { key: 'settlementRatio', label: 'Claims Settlement', group: 'Franchise', unit: '%', family: 'ratioHigh', better: 'higher', context: 'Claims settlement shows reliability.', format: fmtPct1 },
  { key: 'lossRatio', label: 'Loss Ratio', group: 'Cost', unit: '%', family: 'ratioLow', better: 'lower', context: 'Loss ratio: lower is better.', format: fmtPct1 },
  { key: 'expenseRatio', label: 'Expense Ratio', group: 'Cost', unit: '%', family: 'ratioLow', better: 'lower', context: 'Expense ratio: lower is better.', format: fmtPct1 },
  { key: 'commissionRatio', label: 'Commission Ratio', group: 'Cost', unit: '%', family: 'ratioLow', better: 'lower', context: 'Commission ratio: lower is better.', format: fmtPct1 },
]

// Ordered group structure for the custom metric menu.
const METRIC_GROUPS: { group: string; items: MetricDef[] }[] = (() => {
  const order: string[] = []
  const map = new Map<string, MetricDef[]>()
  METRICS.forEach((m) => {
    if (!map.has(m.group)) {
      map.set(m.group, [])
      order.push(m.group)
    }
    map.get(m.group)!.push(m)
  })
  return order.map((group) => ({ group, items: map.get(group)! }))
})()

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
const GRID = '#ECEFF5'
const AXIS_TEXT = '#6B7280'
const GOOD = '#2F855A'
const BAD = '#C75D54'
const BENCH = '#C2C9D6'

function chartTitle(def: MetricDef, period: Period): string {
  if (def.family === 'scale') return `${def.label} by ${period === 'Quarterly' ? 'Quarter' : 'Year'}`
  if (def.family === 'ratioLow') return `${def.label} Trend — Lower is Better`
  if (def.family === 'ratioHigh') return `${def.label} Trend — Higher is Better`
  return def.better === 'lower' ? `${def.label} Trend — Watch Concentration` : `${def.label} Trend — Higher is Better`
}

function meaningOf(def: MetricDef): string {
  if (def.family === 'mix' && def.better === 'lower') return 'Higher = more channel concentration'
  return def.better === 'lower' ? 'Lower is better' : 'Higher is better'
}

/** Tone for a delta in the metric's "good" direction. */
function deltaTone(delta: number, invert: boolean): string {
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

const fmtPp = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(1)} pp`
const fmtBps = (pp: number) => `${Math.round(Math.abs(pp) * 100)} bps`

interface CompanySeries {
  id: string
  name: string
  color: string
  focal: boolean
  values: (number | null)[]
}

interface Scored {
  id: string
  name: string
  color: string
  focal: boolean
  latest: number
  first: number
  delta: number
  range: number
}

type ChipIcon = 'trophy' | 'trend' | 'gap' | 'risk'
interface Chip {
  kind: string
  label: string
  company: string
  color: string
  detail: string
  icon: ChipIcon
}
interface Insights {
  chips: Chip[]
  takeaway: string
  leaderId: string
  leaderColor: string
  labelIds: Set<string>
}

/** Metric-family-aware leader / improver / risk analysis + label targets. */
function buildInsights(def: MetricDef, scored: Scored[], periods: readonly string[], period: Period): Insights {
  const inv = isInvert(def)
  const last = periods.length - 1
  const spanShort = period === 'Quarterly' ? '4 quarters' : 'FY22–FY25'
  const byDir = [...scored].sort((a, b) => (inv ? a.latest - b.latest : b.latest - a.latest)) // best first
  const best = byDir[0]
  const worst = byDir[byDir.length - 1]
  const relGain = (s: Scored) => (inv ? -s.delta : s.delta) / (Math.abs(s.first) || 1)
  const byGain = [...scored].sort((a, b) => relGain(b) - relGain(a))
  const focal = scored.find((s) => s.focal)
  const fmt = def.format
  const labelIds = new Set<string>()
  if (focal) labelIds.add(focal.id)

  let chips: Chip[]
  let takeaway: string

  if (def.family === 'scale') {
    const leader = best
    const improver = byGain.find((s) => s.id !== leader.id) ?? byGain[0]
    labelIds.add(leader.id)
    labelIds.add(worst.id)
    let gapCompany: string
    let gapDetail: string
    let gapColor: string
    if (focal && focal.id !== leader.id) {
      const gapNow = Math.abs(leader.latest - focal.latest)
      const gapThen = Math.abs(leader.first - focal.first)
      const narrowing = gapNow < gapThen
      gapCompany = `${focal.name} → ${leader.name}`
      gapDetail = `${narrowing ? 'closing' : 'widening'} — gap ${fmt(gapNow)}`
      gapColor = focal.color
    } else {
      const runner = byDir[1] ?? byDir[0]
      gapCompany = `${leader.name} ahead`
      gapDetail = `leads ${runner.name} by ${fmt(Math.abs(leader.latest - runner.latest))}`
      gapColor = leader.color
    }
    chips = [
      { kind: 'leader', label: 'Leader', company: leader.name, color: leader.color, detail: `${fmt(leader.latest)} · ${periods[last]}`, icon: 'trophy' },
      { kind: 'improver', label: 'Fastest Improver', company: improver.name, color: improver.color, detail: `${fmtDelta(improver.delta, def.unit)} over ${spanShort}`, icon: 'trend' },
      { kind: 'gap', label: 'Gap vs Leader', company: gapCompany, color: gapColor, detail: gapDetail, icon: 'gap' },
    ]
    const closing = focal && focal.id !== leader.id && Math.abs(leader.latest - focal.latest) < Math.abs(leader.first - focal.first)
    takeaway = `${leader.name} leads on ${def.label.toLowerCase()}; ${improver.name} improved fastest across ${spanShort}${closing ? `, with ${focal!.name} closing the gap` : ''}.`
  } else if (def.family === 'ratioLow') {
    const improvement = byGain[0]
    const drop = improvement.first - improvement.latest
    labelIds.add(best.id)
    labelIds.add(worst.id)
    chips = [
      { kind: 'leader', label: 'Best Operator', company: best.name, color: best.color, detail: `${fmt(best.latest)} · ${periods[last]}`, icon: 'trophy' },
      { kind: 'improver', label: 'Biggest Improvement', company: improvement.name, color: improvement.color, detail: drop >= 0 ? `down ${fmtBps(drop)}` : `up ${fmtBps(drop)}`, icon: 'trend' },
      { kind: 'risk', label: 'Risk Watch', company: worst.name, color: worst.color, detail: `still highest at ${fmt(worst.latest)}`, icon: 'risk' },
    ]
    takeaway = `${best.name} runs the lowest ${def.label.toLowerCase()} (${fmt(best.latest)}); ${worst.name} remains the highest.`
  } else if (def.family === 'ratioHigh') {
    const mostImproved = byGain[0]
    const rise = mostImproved.latest - mostImproved.first
    const consistency = [...scored].sort((a, b) => a.range - b.range)[0]
    labelIds.add(best.id)
    labelIds.add(worst.id)
    chips = [
      { kind: 'leader', label: 'Leader', company: best.name, color: best.color, detail: `${fmt(best.latest)} · ${periods[last]}`, icon: 'trophy' },
      { kind: 'improver', label: 'Most Improved', company: mostImproved.name, color: mostImproved.color, detail: rise >= 0 ? `up ${fmtBps(rise)}` : `down ${fmtBps(rise)}`, icon: 'trend' },
      { kind: 'consistency', label: 'Consistency', company: consistency.name, color: consistency.color, detail: `steady ~${fmt(consistency.latest)}`, icon: 'gap' },
    ]
    takeaway = `${best.name} leads on ${def.label.toLowerCase()} (${fmt(best.latest)}); ${mostImproved.name} improved most across ${spanShort}.`
  } else {
    // mix
    const highest = [...scored].sort((a, b) => b.latest - a.latest)[0]
    const shift = [...scored].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]
    const badMove = (s: Scored) => (inv ? s.delta : -s.delta)
    const risk = [...scored].sort((a, b) => badMove(b) - badMove(a))[0]
    const riskBad = badMove(risk)
    const riskActive = riskBad > 0.05
    labelIds.add(highest.id)
    labelIds.add(riskActive ? risk.id : highest.id)
    chips = [
      { kind: 'leader', label: 'Highest Exposure', company: highest.name, color: highest.color, detail: `${fmt(highest.latest)} share`, icon: 'trophy' },
      { kind: 'improver', label: 'Fastest Shift', company: shift.name, color: shift.color, detail: `${fmtPp(shift.delta)} over ${spanShort}`, icon: 'trend' },
      { kind: 'risk', label: 'Concentration Risk', company: riskActive ? risk.name : highest.name, color: riskActive ? risk.color : highest.color, detail: riskActive ? `${inv ? 'rising' : 'slipping'} ${fmtPp(risk.delta)}` : 'broadly stable', icon: 'risk' },
    ]
    takeaway = `${highest.name} carries the highest ${def.label.toLowerCase()} (${fmt(highest.latest)}), while ${shift.name} shifted most across ${spanShort}.`
  }

  return { chips, takeaway, leaderId: best.id, leaderColor: best.color, labelIds }
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
    .filter((p) => !String(p.dataKey).startsWith('__'))
    .map((p) => {
      if (p.value == null) return null
      const id = String(p.dataKey)
      const prevVal = prev?.[id]
      const delta = typeof prevVal === 'number' ? p.value - prevVal : null
      return { id, name: String(p.name ?? id), color: p.color ?? FALLBACK_COLOR, focal: id === focalId, value: p.value, delta }
    })
    .filter((r): r is { id: string; name: string; color: string; focal: boolean; value: number; delta: number | null } => r !== null)
    .sort((a, b) => (isInvert(def) ? a.value - b.value : b.value - a.value))

  return (
    <div className="min-w-[180px] rounded-lg border border-soft-border bg-card px-3 py-2 shadow-card">
      <p className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-semibold text-navy-deep">
        <span>{label}</span>
        <span className="font-medium text-ink-secondary">{def.label}</span>
      </p>
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
                <span className="tabular-nums font-medium" style={{ color: deltaTone(r.delta, isInvert(def)) }}>
                  {fmtDelta(r.delta, def.unit)}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 border-t border-soft-border pt-1.5 text-[10px] font-medium text-ink-secondary">{meaningOf(def)} · Δ vs previous period</p>
    </div>
  )
}

const CHIP_ICONS: Record<ChipIcon, typeof Trophy> = { trophy: Trophy, trend: TrendingUp, gap: ArrowLeftRight, risk: ShieldAlert }

/** Premium, metric-aware peer comparison: bars for scale, lines for ratio/mix. */
export function CompareCompanies({ companies, focalId }: { companies: Insurer[]; focalId: string }) {
  const [period, setPeriod] = useState<Period>('Quarterly')
  const [metricKey, setMetricKey] = useState<CompareMetricKey>('gwp')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const periods = period === 'Quarterly' ? compareQuarters : compareYears
  const lastIdx = periods.length - 1

  // Which metrics have data for the current peer group.
  const available = useMemo(() => {
    const set = new Set<CompareMetricKey>()
    METRICS.forEach((m) => {
      if (companies.some((c) => getCompareSeries(c.id, m.key, 'Yearly').some((v) => v !== null))) set.add(m.key)
    })
    return set
  }, [companies])

  useEffect(() => {
    if (!available.has(metricKey)) setMetricKey('gwp')
  }, [available, metricKey])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const def = METRICS.find((m) => m.key === metricKey) ?? METRICS[0]
  const type = chartTypeOf(def)

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
        const vals: number[] = []
        present.forEach((s) => {
          row[s.id] = s.values[i]
          if (s.values[i] != null) vals.push(s.values[i] as number)
        })
        row.__avg = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
        return row
      }),
    [periods, present],
  )

  const analysis = useMemo<Insights | null>(() => {
    const scored: Scored[] = present
      .map((s) => {
        const nums = s.values.filter((v): v is number => v !== null)
        const latest = s.values[lastIdx]
        const first = s.values.find((v) => v !== null) ?? null
        if (latest == null || first == null || !nums.length) return null
        return { id: s.id, name: s.name, color: s.color, focal: s.focal, latest, first, delta: latest - first, range: Math.max(...nums) - Math.min(...nums) }
      })
      .filter((x): x is Scored => x !== null)
    if (!scored.length) return null
    return buildInsights(def, scored, periods, period)
  }, [present, def, periods, lastIdx, period])

  const axisFmt = (v: number) => {
    if (def.unit === '₹ Cr' || def.unit === '₹') return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${v}`
    if (def.unit === '%') return `${Math.round(v)}`
    return `${v}`
  }

  // Leader medallion above the leading company's latest-period bar.
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

  // Compact value labels on the focal company's bars only (keeps bars readable).
  const renderFocalValue = (props: { x?: number; y?: number; width?: number; value?: number; index?: number }) => {
    const { x = 0, y = 0, width = 0, value } = props
    if (value == null) return <g />
    return (
      <text x={x + width / 2} y={y - 5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#172B4D">
        {axisFmt(value)}
      </text>
    )
  }

  const makeEndLabel = (s: CompanySeries) => (props: { x?: number; y?: number; value?: number; index?: number }) => {
    const { x = 0, y = 0, value, index } = props
    if (index !== lastIdx || value == null) return <g />
    return (
      <text x={x + 6} y={y} dy={3.5} fontSize={10} fontWeight={s.focal ? 700 : 600} fill={s.color}>
        {def.format(value)}
      </text>
    )
  }

  const renderAvgLabel = (props: { x?: number; y?: number; value?: number; index?: number }) => {
    const { x = 0, y = 0, value, index } = props
    if (index !== lastIdx || value == null) return <g />
    return (
      <text x={x + 6} y={y} dy={3.5} fontSize={9} fontWeight={600} fill="#9AA3AF">
        avg
      </text>
    )
  }

  return (
    <div className="card-surface p-4 sm:p-5">
      {/* Header — dynamic title + context, controls on the right */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div>
          <p className="font-display text-[16px] leading-tight text-navy-deep">{chartTitle(def, period)}</p>
          <p className="mt-0.5 text-[12px] text-ink-secondary">{def.context}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SegmentedControl<Period>
            label="Period"
            options={['Quarterly', 'Yearly'] as Period[]}
            value={period}
            onChange={setPeriod}
            size="sm"
          />
          {/* Custom premium metric selector */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-lg border border-soft-border bg-ice px-3 py-1.5 text-[13px] outline-none transition-colors hover:border-muted-blue focus:border-navy-primary"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">Metric</span>
              <span className="font-semibold text-navy-deep">{def.label}</span>
              <ChevronDown className={['h-3.5 w-3.5 text-ink-secondary transition-transform', menuOpen ? 'rotate-180' : ''].join(' ')} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-1.5 max-h-[340px] w-64 overflow-auto rounded-xl2 border border-soft-border bg-card p-1.5 shadow-card">
                {METRIC_GROUPS.map((g) => (
                  <div key={g.group}>
                    <p className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{g.group}</p>
                    {g.items.map((m) => {
                      const avail = available.has(m.key)
                      const selected = m.key === metricKey
                      const Glyph = chartTypeOf(m) === 'bar' ? BarChart3 : LineGlyph
                      return (
                        <button
                          key={m.key}
                          type="button"
                          disabled={!avail}
                          onClick={() => {
                            setMetricKey(m.key)
                            setMenuOpen(false)
                          }}
                          className={[
                            'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors',
                            !avail
                              ? 'cursor-not-allowed text-ink-secondary/45'
                              : selected
                                ? 'bg-soft-blue text-navy-deep'
                                : 'text-ink-primary hover:bg-ice',
                          ].join(' ')}
                        >
                          <Glyph className="h-3.5 w-3.5 shrink-0 text-muted-blue" />
                          <span className="flex-1 font-medium">{m.label}</span>
                          <span className="text-[10px] text-ink-secondary">{avail ? m.unit : 'data pending'}</span>
                          {selected && <Check className="h-3.5 w-3.5 text-navy-primary" />}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Insight chips — metric-family specific */}
      {analysis && (
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {analysis.chips.map((chip) => {
            const Icon = CHIP_ICONS[chip.icon]
            return (
              <div key={chip.kind} className="relative overflow-hidden rounded-xl2 border border-soft-border bg-ice/60 px-3.5 py-2.5">
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

      {/* Legend — compact, color-matched, marks the current leader/best */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {present.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5 text-[11.5px]">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
            <span className={s.focal ? 'font-semibold text-navy-deep' : 'text-ink-secondary'}>{s.name}</span>
            {analysis?.leaderId === s.id && (
              <span className="rounded-full bg-navy-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-navy-primary">
                {def.better === 'lower' ? 'Best' : 'Leads'}
              </span>
            )}
          </span>
        ))}
        {type === 'line' && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-secondary">
            <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: BENCH }} />
            Peer avg
          </span>
        )}
      </div>

      {/* Chart — metric-aware: grouped bars for scale, lines for ratio/mix */}
      <div className="mt-3">
        {present.length === 0 ? (
          <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-4 py-10 text-center text-[12px] text-ink-secondary">
            {def.label} is not reported for the companies in this peer group.
          </div>
        ) : type === 'bar' ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 24, right: 8, left: 0, bottom: 4 }} barCategoryGap="26%" barGap={2}>
              <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
              <XAxis dataKey="period" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 12, fill: '#26303F', fontWeight: 600 }} dy={4} />
              <YAxis tickFormatter={axisFmt} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} width={42} tickCount={5} />
              <Tooltip cursor={{ fill: 'rgba(39,69,126,0.05)' }} content={<ChartTooltip focalId={focalId} def={def} rows={chartData} periods={periods} />} />
              {present.map((s) => (
                <Bar
                  key={s.id}
                  dataKey={s.id}
                  name={s.name}
                  fill={s.color}
                  fillOpacity={s.focal ? 1 : 0.9}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={20}
                  isAnimationActive={false}
                  label={analysis?.leaderId === s.id ? renderLeaderBadge : s.focal ? renderFocalValue : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 16, right: 52, left: 0, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
              <XAxis dataKey="period" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 12, fill: '#26303F', fontWeight: 600 }} dy={4} />
              <YAxis
                tickFormatter={axisFmt}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: AXIS_TEXT }}
                width={42}
                allowDecimals={false}
                domain={[(min: number) => Math.floor(min - 2), (max: number) => Math.ceil(max + 2)]}
              />
              <Tooltip cursor={{ stroke: '#C9D2E0', strokeWidth: 1 }} content={<ChartTooltip focalId={focalId} def={def} rows={chartData} periods={periods} />} />
              <Line dataKey="__avg" name="Peer avg" stroke={BENCH} strokeWidth={1.4} strokeDasharray="4 3" dot={false} isAnimationActive={false} label={renderAvgLabel} />
              {present.map((s) => (
                <Line
                  key={s.id}
                  dataKey={s.id}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={s.focal ? 2.6 : 1.6}
                  strokeOpacity={s.focal ? 1 : 0.75}
                  dot={s.focal ? { r: 3, fill: s.color, strokeWidth: 0 } : false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                  label={analysis?.labelIds.has(s.id) ? makeEndLabel(s) : undefined}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Takeaway + basis */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-soft-border pt-3">
        {analysis ? <p className="text-[12px] text-ink-secondary">{analysis.takeaway}</p> : <span />}
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill>Basis: {def.unit === '₹ Cr' ? 'Reported / Derived' : 'Reported'}</Pill>
          <Pill>Period: {period}</Pill>
          <Pill>Constant peer set</Pill>
          <Pill>{meaningOf(def)}</Pill>
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
