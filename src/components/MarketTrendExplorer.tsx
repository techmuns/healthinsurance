// Health Opportunity — an interactive line-chart comparison workbench.
//
// One premium module that lets the reader compare ANY metric against ANY
// insurer on a single canvas, instead of four disconnected mini charts:
//   • a compact control bar — metric pills, multi-select company chips
//     (doubling as the legend) and a view-mode switch;
//   • one large comparison line chart where each (company × metric) pair is a
//     clean line — Niva Bupa solid & strong, the rest softly dimmed, every line
//     in its company's theme colour, with line style varying subtly per metric;
//   • four compact summary cards (SAHI · Retail · Overall · GDPI) carrying Niva
//     Bupa's FY24 value, its FY22–FY24 move and a tiny sparkline — no full chart.
//
// View modes:
//   • Absolute        — raw values; only metrics that share a unit can sit on
//                        one axis, so a mixed selection auto-switches to Indexed.
//   • Indexed FY22=100 — every line rebased to 100 at the first year, so share
//                        and premium can be compared on one scale.
//   • YoY change      — year-on-year % move; the first year has no prior base.
//
// Honesty: years come from the data (never hardcoded), a null value is omitted
// (never drawn as 0 or indexed off a missing base), GDPI stays labelled a
// premium (not profit), and an indexed view is always flagged as rebased.

import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Check } from 'lucide-react'
import { SourceTag } from './SourceTag'
import {
  COMPANY_BY_ID,
  FOCAL_COMPANY_ID,
  METRICS,
  sortYears,
  TREND_COMPANIES,
  type MetricDef,
  type MetricId,
} from '@/lib/marketTrends'

const FOCAL = COMPANY_BY_ID[FOCAL_COMPANY_ID]

// The four health lenses offered for comparison — from the narrow SAHI segment
// lens out to the rupee premium scale.
const PRIMARY: MetricId[] = ['sahi_share', 'retail_share', 'overall_share', 'gdpi']

// One soft dash signature per metric — used only when MORE than one insurer is
// on the canvas (then colour encodes the company and the dash encodes the
// metric, so companies stay distinguishable).
const DASH_BY_METRIC: Record<MetricId, string> = {
  sahi_share: '',
  retail_share: '5 3',
  overall_share: '2 3',
  gdpi: '7 3 1 3',
  premium_growth: '1 4',
}

// One tone-coded colour per metric (teal · soft blue · gold · soft violet) on
// the dashboard's palette. When a SINGLE insurer is selected, each metric line
// takes its own colour here — and the pills and summary cards echo it — so the
// four lenses read apart at a glance, exactly like the reference.
const METRIC_COLOR: Record<MetricId, string> = {
  sahi_share: '#168E8E', // teal
  retail_share: '#3D6DB5', // soft blue
  overall_share: '#B68B3A', // gold
  gdpi: '#7A6CC4', // soft violet — the premium-scale lens
  premium_growth: '#8C97A8',
}

type ViewMode = 'absolute' | 'indexed' | 'yoy'

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: 'absolute', label: 'Absolute' },
  { id: 'indexed', label: 'Indexed FY22 = 100' },
  { id: 'yoy', label: 'YoY change' },
]

const GRID = '#EEF1F7'
const AXIS = '#6B7280'
const round1 = (n: number) => Math.round(n * 10) / 10

// The story spans FY22–FY25. The SAHI share/premium source currently lands
// only through FY24, so FY25 is carried as an honest, visible gap (the axis
// shows it, the lines stop at FY24, and the tick is marked "not yet reported")
// rather than fabricated. It fills in automatically the moment FY25 ingests.
const GAP_YEAR = 'FY25'

// ── A single (company × metric) line, with its absolute series + index base. ──
interface Combo {
  key: string
  company: { id: string; name: string; color: string }
  metric: MetricDef
  abs: Map<string, number | null>
  base: number | null
}

/** Map a company's values for one metric into a year→value lookup. */
function absLookup(companyId: string, metric: MetricDef): Map<string, number | null> {
  const map = new Map<string, number | null>()
  for (const p of metric.points) if (p.company === companyId) map.set(p.year, p.value)
  return map
}

/** First→latest move for one company on a metric (over years that carry data). */
function seriesStat(metric: MetricDef, companyId: string): { last: number | null; delta: number | null } {
  const map = absLookup(companyId, metric)
  const years = sortYears(map.keys())
  const first = years.map((y) => map.get(y)).find((v) => v != null) ?? null
  const last = [...years].reverse().map((y) => map.get(y)).find((v) => v != null) ?? null
  const delta = first != null && last != null ? last - first : null
  return { last, delta }
}

// ── Tooltip — company · metric · year · value (+ indexed value when rebased). ──
interface TipProps {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: number | null }>
  label?: string | number
  combos: Combo[]
  mode: ViewMode
  colorByKey: Record<string, string>
}
function ComparisonTooltip({ active, payload, label, combos, mode, colorByKey }: TipProps) {
  if (!active || !payload?.length) return null
  const byKey = new Map(combos.map((c) => [c.key, c]))
  const year = String(label)
  const rows = payload
    .filter((p) => p.value != null && p.dataKey != null && byKey.has(String(p.dataKey)))
    .map((p) => {
      const cb = byKey.get(String(p.dataKey))!
      return { cb, plotted: p.value as number, abs: cb.abs.get(year) ?? null }
    })
    .sort((a, b) => b.plotted - a.plotted)
  if (!rows.length) return null
  return (
    <div className="rounded-lg border border-soft-border bg-card/95 px-2.5 py-1.5 shadow-card backdrop-blur-sm">
      <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-ink-secondary">{year}</div>
      <div className="space-y-1">
        {rows.map(({ cb, plotted, abs }) => (
          <div key={cb.key} className="flex items-center justify-between gap-4 text-[10.5px]">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorByKey[cb.key] ?? cb.company.color }} />
              <span className="truncate text-ink-primary">
                <span className="font-semibold">{cb.company.name}</span>
                <span className="text-ink-secondary"> · {cb.metric.chip}</span>
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-navy-deep">
              {mode === 'yoy'
                ? `${plotted >= 0 ? '+' : ''}${plotted.toFixed(1)}%`
                : abs != null
                  ? cb.metric.format(abs)
                  : '—'}
              {mode === 'indexed' && (
                <span className="ml-1 font-medium text-ink-secondary">· {plotted.toFixed(0)} idx</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tiny inline sparkline (Niva Bupa's trend) for the summary cards. ──
function Sparkline({ values, color }: { values: (number | null)[]; color: string }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null)
  if (pts.length < 2) return null
  const w = 56
  const h = 20
  const xs = values.length - 1 || 1
  const min = Math.min(...pts.map((p) => p.v))
  const max = Math.max(...pts.map((p) => p.v))
  const span = max - min || 1
  const xy = (p: { v: number; i: number }) => ({
    x: (p.i / xs) * w,
    y: h - ((p.v - min) / span) * h,
  })
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${xy(p).x.toFixed(1)} ${xy(p).y.toFixed(1)}`).join(' ')
  const end = xy(pts[pts.length - 1])
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      <circle cx={end.x} cy={end.y} r={1.9} fill={color} />
    </svg>
  )
}

function SummaryCard({ metric }: { metric: MetricDef }) {
  const { last, delta } = seriesStat(metric, FOCAL_COMPANY_ID)
  const years = sortYears(metric.points.map((p) => p.year))
  const map = absLookup(FOCAL_COMPANY_ID, metric)
  const values = years.map((y) => map.get(y) ?? null)
  const unit = metric.unit === '%' ? '% share' : `${metric.unit} · premium`
  const color = METRIC_COLOR[metric.id]
  // Honest latest period: the most recent year that actually carries a value
  // (FY24 today; becomes FY25 the moment that data lands).
  const latestYear = [...years].reverse().find((y) => map.get(y) != null) ?? years[years.length - 1] ?? '—'
  const firstYear = years.find((y) => map.get(y) != null) ?? years[0] ?? '—'

  return (
    <div
      className="surface-soft relative flex h-full flex-col justify-between overflow-hidden rounded-xl p-3"
      style={{ background: `linear-gradient(135deg, ${color}0A 0%, transparent 60%)` }}
    >
      <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: color }} />
      <div className="pl-1.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
          <p className="truncate font-display text-[12px] leading-tight text-navy-deep">{metric.chip}</p>
        </div>
        <p className="mt-0.5 text-[8.5px] uppercase tracking-wide text-ink-secondary">{unit}</p>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2 pl-1.5">
        <div className="min-w-0">
          <p className="text-[16px] font-semibold leading-none tabular-nums" style={{ color }}>
            {last != null ? metric.format(last) : 'n/a'}
          </p>
          {delta != null && (
            <p className={`mt-1 text-[10px] font-semibold tabular-nums ${delta >= 0 ? 'text-emerald' : 'text-coral'}`}>
              {metric.formatDelta(delta)}
            </p>
          )}
          <p className="mt-0.5 text-[8px] uppercase tracking-wide text-ink-secondary/80">
            {FOCAL.name} · {firstYear} → {latestYear}
          </p>
        </div>
        <Sparkline values={values} color={color} />
      </div>
    </div>
  )
}

const PANEL_SOURCE = {
  source_name:
    'Niva Bupa DRHP (Jul 2024) · Redseer Report, Exhibits 40–41 (overall- & retail-health GDPI and market share). Premium metric — not profit.',
  source_url: METRICS.gdpi.source.source_url,
  fetched_at: METRICS.gdpi.source.fetched_at,
}

export function MarketTrendExplorer() {
  const [companySet, setCompanySet] = useState<Set<string>>(() => new Set([FOCAL_COMPANY_ID]))
  const [metricSet, setMetricSet] = useState<Set<MetricId>>(() => new Set(PRIMARY))
  const [mode, setMode] = useState<ViewMode>('indexed')
  // Hover isolation: a specific line (combo key) or a whole company (legend chip).
  const [hoverCombo, setHoverCombo] = useState<string | null>(null)
  const [hoverCompany, setHoverCompany] = useState<string | null>(null)

  // Ordered, de-duped selections (stable colours/dashes regardless of click order).
  const selCompanies = TREND_COMPANIES.filter((c) => companySet.has(c.id))
  const selMetrics = PRIMARY.filter((m) => metricSet.has(m)).map((id) => METRICS[id])

  // Absolute can only stack metrics that share a unit — a mixed selection (e.g.
  // a % share alongside ₹ Bn GDPI) auto-switches to Indexed so the lines stay
  // honestly comparable on one axis.
  const units = new Set(selMetrics.map((m) => m.unit))
  const mixedUnits = units.size > 1
  useEffect(() => {
    if (mode === 'absolute' && mixedUnits) setMode('indexed')
  }, [mode, mixedUnits])

  const years = useMemo(
    () => sortYears(selMetrics.flatMap((m) => m.points.map((p) => p.year))),
    [selMetrics],
  )

  // Axis years = the real data years, plus FY25 as a trailing gap if the source
  // hasn't reached it yet (so the chart reads FY22–FY25 honestly).
  const showGap = years.length > 0 && !years.includes(GAP_YEAR)
  const axisYears = useMemo(() => (showGap ? [...years, GAP_YEAR] : years), [years, showGap])

  const combos: Combo[] = useMemo(() => {
    const out: Combo[] = []
    for (const c of selCompanies) {
      for (const m of selMetrics) {
        const abs = absLookup(c.id, m)
        const base = years.map((y) => abs.get(y)).find((v) => v != null) ?? null
        out.push({ key: `${c.id}__${m.id}`, company: c, metric: m, abs, base })
      }
    }
    return out
    // selCompanies/selMetrics are derived fresh each render; gate on the sets.
  }, [companySet, metricSet, years])

  // Build the chart rows: one per axis year carrying every combo's value in the
  // active view (null stays null — never coerced, never indexed off a gap; the
  // FY25 gap row is all-null so every line simply stops at FY24).
  const data = useMemo(() => {
    return axisYears.map((y, i) => {
      const row: Record<string, number | string | null> = { year: y }
      for (const cb of combos) {
        const v = cb.abs.get(y) ?? null
        let out: number | null = null
        if (v != null) {
          if (mode === 'absolute') out = v
          else if (mode === 'indexed') out = cb.base ? round1((v / cb.base) * 100) : null
          else if (mode === 'yoy' && i > 0) {
            const prev = cb.abs.get(axisYears[i - 1]) ?? null
            out = prev != null && prev !== 0 ? round1(((v - prev) / prev) * 100) : null
          }
        }
        row[cb.key] = out
      }
      return row
    })
  }, [combos, axisYears, mode])

  // Index of each line's last real point, so we can give it a stronger marker
  // and a value label at the right end.
  const lastIdxByKey = useMemo(() => {
    const m: Record<string, number> = {}
    for (const cb of combos) {
      let idx = -1
      data.forEach((row, i) => {
        if (row[cb.key] != null) idx = i
      })
      m[cb.key] = idx
    }
    return m
  }, [combos, data])

  // With one insurer on the canvas, colour encodes the METRIC (teal/blue/gold/
  // violet, lines drawn solid) — the reference look. With several insurers,
  // colour encodes the COMPANY and a subtle dash encodes the metric.
  const singleCompany = selCompanies.length === 1
  const colorByKey = useMemo(() => {
    const m: Record<string, string> = {}
    for (const cb of combos) m[cb.key] = singleCompany ? METRIC_COLOR[cb.metric.id] : cb.company.color
    return m
  }, [combos, singleCompany])

  const anyHover = hoverCombo != null || hoverCompany != null
  const isActive = (cb: Combo) =>
    hoverCombo ? cb.key === hoverCombo : hoverCompany ? cb.company.id === hoverCompany : true

  // Toggle helpers — never let the canvas go fully blank (keep ≥1 each).
  const toggleCompany = (id: string) =>
    setCompanySet((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size > 1) next.delete(id)
      } else next.add(id)
      return next
    })
  const toggleMetric = (id: MetricId) =>
    setMetricSet((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size > 1) next.delete(id)
      } else next.add(id)
      return next
    })

  const absUnit = selMetrics[0]?.unit ?? '%'
  const yTick = (v: number) =>
    mode === 'indexed' ? `${v}` : mode === 'yoy' ? `${v}%` : absUnit === '%' ? `${v}%` : `₹${v}`

  // X tick — FY25 (the gap year) reads soft-grey with a quiet "not yet reported"
  // sub-label so the missing year is honest, never blank or fabricated.
  const renderXTick = (props: { x?: number; y?: number; payload?: { value?: string } }) => {
    const x = Number(props.x)
    const y = Number(props.y)
    const val = props.payload?.value ?? ''
    const isGap = val === GAP_YEAR && showGap
    return (
      <g>
        <text x={x} y={y + 11} textAnchor="middle" fontSize={10} fill={isGap ? '#B6BECB' : AXIS}>
          {val}
        </text>
        {isGap && (
          <text x={x} y={y + 21} textAnchor="middle" fontSize={7.5} fontStyle="italic" fill="#C0C7D2">
            not yet reported
          </text>
        )}
      </g>
    )
  }

  return (
    <div className="card-surface flex h-full min-w-0 flex-col p-5 sm:p-6">
      {/* Header — mirrors the GI Pool Shift card so the pair reads as one block. */}
      <header className="mb-4 border-b border-[#EEF1F7] pb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">Health Opportunity</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <h2 className="font-display text-[20px] leading-tight text-navy-deep">Where is health share &amp; premium growing?</h2>
          <span className="inline-flex items-center rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-semibold text-teal ring-1 ring-[#BFE3E1]">
            SAHIs gaining share
          </span>
        </div>
        <p className="mt-1 text-[12px] text-ink-secondary">
          Five standalone health insurers · four lenses · FY22–FY25 ·{' '}
          <span className="text-ink-secondary/80">premium basis, not profit</span>
        </p>
      </header>

      {/* ── Control bar — metrics, companies (legend = selector), view mode. ── */}
      <div className="mb-3 space-y-2.5 rounded-xl border border-soft-border bg-ice/40 p-3">
        {/* Metric pills — checkbox-style, each in its own lens colour. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Metric</span>
          {PRIMARY.map((id) => {
            const m = METRICS[id]
            const on = metricSet.has(id)
            const color = METRIC_COLOR[id]
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleMetric(id)}
                aria-pressed={on}
                style={on ? { background: `${color}14`, borderColor: `${color}59`, color } : undefined}
                className={[
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10.5px] font-medium transition-all duration-200',
                  on
                    ? 'shadow-soft'
                    : 'border-soft-border bg-white/40 text-ink-secondary hover:bg-white/70',
                ].join(' ')}
              >
                {on ? (
                  <Check className="h-3 w-3" strokeWidth={3} />
                ) : (
                  <span className="h-2 w-2 rounded-full" style={{ background: color, opacity: 0.4 }} />
                )}
                {m.chip}
              </button>
            )
          })}
        </div>

        {/* Company chips — the legend, now a multi-select. Click toggles; hover
            isolates that insurer across the chart. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Insurer</span>
          {TREND_COMPANIES.map((c) => {
            const on = companySet.has(c.id)
            const hot = hoverCompany === c.id
            const dim = hoverCompany != null && !hot
            const focal = c.id === FOCAL_COMPANY_ID
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCompany(c.id)}
                onMouseEnter={() => setHoverCompany(c.id)}
                onMouseLeave={() => setHoverCompany(null)}
                onFocus={() => setHoverCompany(c.id)}
                onBlur={() => setHoverCompany(null)}
                aria-pressed={on}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] transition-all duration-200',
                  on ? 'border-muted-blue bg-white shadow-soft' : 'border-soft-border bg-white/40',
                  dim ? 'opacity-45' : 'opacity-100',
                ].join(' ')}
              >
                <span
                  className="h-2 w-2 rounded-full transition-all"
                  style={{ background: c.color, opacity: on ? 1 : 0.3 }}
                />
                <span
                  className={[
                    focal ? 'font-semibold' : 'font-medium',
                    on ? 'text-navy-deep' : 'text-ink-secondary/70',
                  ].join(' ')}
                >
                  {c.name}
                </span>
              </button>
            )
          })}
        </div>

        {/* View mode */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">View</span>
          <div className="inline-flex overflow-hidden rounded-full border border-soft-border bg-white/60">
            {VIEW_MODES.map((vm) => {
              const on = mode === vm.id
              const disabled = vm.id === 'absolute' && mixedUnits
              return (
                <button
                  key={vm.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setMode(vm.id)}
                  title={disabled ? 'Select metrics that share a unit to compare absolute values' : undefined}
                  className={[
                    'px-2.5 py-0.5 text-[10.5px] font-medium transition-all duration-200',
                    on ? 'bg-navy-deep text-white' : 'text-ink-secondary hover:bg-white',
                    disabled ? 'cursor-not-allowed opacity-40' : '',
                  ].join(' ')}
                >
                  {vm.label}
                </button>
              )
            })}
          </div>
          {mode === 'indexed' && (
            <span className="text-[9.5px] italic text-ink-secondary">
              Indexed to FY22 = 100 so share and premium growth can be compared on one scale.
            </span>
          )}
        </div>
      </div>

      {/* ── Large comparison line chart ── */}
      <div className="h-[256px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 54, left: 4, bottom: 8 }} onMouseLeave={() => setHoverCombo(null)}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="year" tick={renderXTick} tickLine={false} axisLine={{ stroke: GRID }} height={30} interval={0} />
            <YAxis
              width={34}
              tick={{ fontSize: 9, fill: AXIS }}
              tickLine={false}
              axisLine={false}
              tickFormatter={yTick}
              domain={['auto', 'auto']}
            />
            <Tooltip
              cursor={{ stroke: '#C9D2E0', strokeWidth: 1, strokeDasharray: '3 3' }}
              content={<ComparisonTooltip combos={combos} mode={mode} colorByKey={colorByKey} />}
            />
            {mode === 'indexed' && <ReferenceLine y={100} stroke="#C9D2E0" strokeDasharray="4 4" />}
            {mode === 'yoy' && <ReferenceLine y={0} stroke="#C9D2E0" strokeDasharray="4 4" />}

            {/* Transparent thick hit-lines so a thin line is easy to hover/isolate. */}
            {combos.map((cb) => (
              <Line
                key={`hit-${cb.key}`}
                type="monotone"
                dataKey={cb.key}
                stroke="transparent"
                strokeWidth={14}
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
                tooltipType="none"
                legendType="none"
                onMouseEnter={() => setHoverCombo(cb.key)}
                onMouseLeave={() => setHoverCombo(null)}
              />
            ))}

            {/* Visible lines — Niva Bupa solid & strong, others softly dimmed;
                colour = company, dash = metric. Clearly-visible dots, a stronger
                marker on the latest point, and a value label at the right end. */}
            {combos.map((cb) => {
              const focal = cb.company.id === FOCAL_COMPANY_ID
              const active = isActive(cb)
              const opacity = anyHover ? (active ? 1 : 0.1) : singleCompany ? 1 : focal ? 1 : 0.5
              const width = anyHover && active ? 2.8 : singleCompany ? 2.2 : focal ? 2.2 : 1.5
              const lastIdx = lastIdxByKey[cb.key]
              const dimmed = anyHover && !active
              const color = colorByKey[cb.key]
              const dash = singleCompany ? undefined : DASH_BY_METRIC[cb.metric.id] || undefined
              return (
                <Line
                  key={`l-${cb.key}`}
                  type="monotone"
                  dataKey={cb.key}
                  stroke={color}
                  strokeWidth={width}
                  strokeOpacity={opacity}
                  strokeDasharray={dash}
                  dot={(p: { cx?: number; cy?: number; index?: number; value?: number | null }) => {
                    const cx = Number(p.cx)
                    const cy = Number(p.cy)
                    if (p.value == null || Number.isNaN(cx) || Number.isNaN(cy)) return <g key={`d-${cb.key}-${p.index}`} />
                    const isLast = p.index === lastIdx
                    return (
                      <circle
                        key={`d-${cb.key}-${p.index}`}
                        cx={cx}
                        cy={cy}
                        r={isLast ? 4.6 : 3.4}
                        fill={isLast ? color : '#fff'}
                        stroke={color}
                        strokeWidth={1.6}
                        opacity={opacity}
                      />
                    )
                  }}
                  activeDot={dimmed ? false : { r: 5.5, fill: color, stroke: '#fff', strokeWidth: 1.4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                  onMouseEnter={() => setHoverCombo(cb.key)}
                >
                  {!dimmed && (
                    <LabelList
                      dataKey={cb.key}
                      content={(p: { x?: number | string; y?: number | string; index?: number; value?: number | string | null }) => {
                        if (p.index !== lastIdx || p.value == null) return null
                        const x = Number(p.x)
                        const y = Number(p.y)
                        if (Number.isNaN(x) || Number.isNaN(y)) return null
                        const v = Number(p.value)
                        const txt =
                          mode === 'yoy'
                            ? `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`
                            : mode === 'indexed'
                              ? `${Math.round(v)}`
                              : cb.metric.format(v)
                        return (
                          <text
                            x={x + 8}
                            y={y + 3.5}
                            fontSize={10}
                            fontWeight={singleCompany || focal ? 700 : 600}
                            fill={color}
                            textAnchor="start"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {txt}
                          </text>
                        )
                      }}
                    />
                  )}
                </Line>
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Four compact summary cards — Niva Bupa at a glance, no full chart. ── */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PRIMARY.map((id) => (
          <SummaryCard key={id} metric={METRICS[id]} />
        ))}
      </div>

      {/* ── Understanding the lenses — a soft teal/blue help box, two columns
          that separate the share lenses from the premium lens. ── */}
      <div className="mt-3 rounded-xl border border-[#CFE7E4] bg-gradient-to-br from-[#F2FAF8] to-[#F4F8FD] p-3.5">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-teal" />
          <p className="font-display text-[12.5px] text-navy-deep">Understanding the lenses</p>
        </div>
        <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          <div>
            <p className="text-[11px] leading-relaxed text-ink-secondary">
              <span className="font-semibold text-navy-deep">Share metrics</span> (SAHI Share, Retail Health Share, Overall Health Share) show an insurer&rsquo;s proportion of health premium in the relevant base.
            </p>
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-teal-soft px-1.5 py-0.5 text-[9px] font-semibold text-teal ring-1 ring-[#BFE3E1]">
              Higher is better
            </span>
          </div>
          <div>
            <p className="text-[11px] leading-relaxed text-ink-secondary">
              <span className="font-semibold text-navy-deep">Premium metric</span> (GDPI Premium) shows total health premium written — premium scale and growth, not profit.
            </p>
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1" style={{ background: '#7A6CC41A', color: '#5A4EA0', borderColor: '#CFC8EC' }}>
              Higher is better
            </span>
          </div>
        </div>
        <p className="mt-2 text-[10px] italic text-ink-secondary/80">
          Higher is generally better, but mix and profitability still need separate analysis.
        </p>
      </div>

      {/* Footer — one-line read + a single shared source (all from the DRHP). */}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-2 pt-1">
        <p className="max-w-lg text-[11px] leading-relaxed text-ink-secondary">
          <span className="font-semibold text-navy-deep">Read it — </span>
          pick insurers and metrics, then choose a view. Indexed mode rebases every line to FY22 = 100, so share and premium growth can be compared on one scale.
        </p>
        <SourceTag source="Company filing" period="FY22–FY25" frequency="Annual" confidence="high" provenance={PANEL_SOURCE} />
      </div>
    </div>
  )
}
