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
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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

// One soft dash signature per metric (colour stays the company's, so within a
// single company several metrics read apart without a second colour scale).
const DASH_BY_METRIC: Record<MetricId, string> = {
  sahi_share: '',
  retail_share: '5 3',
  overall_share: '2 3',
  gdpi: '7 3 1 3',
  premium_growth: '1 4',
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
}
function ComparisonTooltip({ active, payload, label, combos, mode }: TipProps) {
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
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cb.company.color }} />
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
  const unit = metric.unit === '%' ? '% share' : metric.unit

  return (
    <div className="surface-soft flex h-full flex-col justify-between rounded-xl p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-[12px] leading-tight text-navy-deep">{metric.chip}</p>
          <p className="text-[8.5px] uppercase tracking-wide text-ink-secondary">{unit} · FY22–FY24</p>
        </div>
        <Sparkline values={values} color={FOCAL.color} />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <p className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: FOCAL.color }}>
            {FOCAL.name} · FY24
          </p>
          <p className="mt-0.5 text-[15px] font-semibold tabular-nums" style={{ color: FOCAL.color }}>
            {last != null ? metric.format(last) : 'n/a'}
          </p>
        </div>
        {delta != null && (
          <p className={`text-[10px] font-semibold tabular-nums ${delta >= 0 ? 'text-emerald' : 'text-coral'}`}>
            {metric.formatDelta(delta)}
          </p>
        )}
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

  // Build the chart rows: one per year carrying every combo's value in the
  // active view (null stays null — never coerced, never indexed off a gap).
  const data = useMemo(() => {
    return years.map((y, i) => {
      const row: Record<string, number | string | null> = { year: y }
      for (const cb of combos) {
        const v = cb.abs.get(y) ?? null
        let out: number | null = null
        if (v != null) {
          if (mode === 'absolute') out = v
          else if (mode === 'indexed') out = cb.base ? round1((v / cb.base) * 100) : null
          else if (mode === 'yoy' && i > 0) {
            const prev = cb.abs.get(years[i - 1]) ?? null
            out = prev != null && prev !== 0 ? round1(((v - prev) / prev) * 100) : null
          }
        }
        row[cb.key] = out
      }
      return row
    })
  }, [combos, years, mode])

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
          Five standalone health insurers · four lenses · FY22–FY24 ·{' '}
          <span className="text-ink-secondary/80">premium basis (not profit)</span>
        </p>
      </header>

      {/* ── Control bar — metrics, companies (legend = selector), view mode. ── */}
      <div className="mb-3 space-y-2.5 rounded-xl border border-soft-border bg-ice/40 p-3">
        {/* Metric pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Metric</span>
          {PRIMARY.map((id) => {
            const m = METRICS[id]
            const on = metricSet.has(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleMetric(id)}
                aria-pressed={on}
                className={[
                  'rounded-full border px-2.5 py-0.5 text-[10.5px] font-medium transition-all duration-200',
                  on
                    ? 'border-muted-blue bg-white text-navy-deep shadow-soft'
                    : 'border-soft-border bg-white/40 text-ink-secondary hover:bg-white/70',
                ].join(' ')}
              >
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
                    on ? 'text-navy-deep' : 'text-ink-secondary line-through decoration-1',
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
            <span className="text-[9.5px] italic text-ink-secondary">Indexed to FY22 = 100 for cross-metric comparison.</span>
          )}
        </div>
      </div>

      {/* ── Large comparison line chart ── */}
      <div className="h-[244px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 10, left: 4, bottom: 0 }} onMouseLeave={() => setHoverCombo(null)}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis
              width={34}
              tick={{ fontSize: 9, fill: AXIS }}
              tickLine={false}
              axisLine={false}
              tickFormatter={yTick}
              domain={mode === 'yoy' ? ['auto', 'auto'] : ['auto', 'auto']}
            />
            <Tooltip
              cursor={{ stroke: '#C9D2E0', strokeWidth: 1, strokeDasharray: '3 3' }}
              content={<ComparisonTooltip combos={combos} mode={mode} />}
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
                colour = company, dash = metric. */}
            {combos.map((cb) => {
              const focal = cb.company.id === FOCAL_COMPANY_ID
              const active = isActive(cb)
              const opacity = anyHover ? (active ? 1 : 0.1) : focal ? 1 : 0.5
              const width = anyHover && active ? 2.6 : focal ? 2.2 : 1.5
              return (
                <Line
                  key={`l-${cb.key}`}
                  type="monotone"
                  dataKey={cb.key}
                  stroke={cb.company.color}
                  strokeWidth={width}
                  strokeOpacity={opacity}
                  strokeDasharray={DASH_BY_METRIC[cb.metric.id] || undefined}
                  dot={false}
                  activeDot={anyHover && !active ? false : { r: 3, fill: cb.company.color, stroke: '#fff', strokeWidth: 1.2 }}
                  connectNulls={false}
                  isAnimationActive={false}
                  onMouseEnter={() => setHoverCombo(cb.key)}
                />
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

      {/* Footer — one-line read + a single shared source (all from the DRHP). */}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-2 pt-4">
        <p className="max-w-md text-[11px] leading-relaxed text-ink-secondary">
          <span className="font-semibold text-navy-deep">Read it — </span>
          pick insurers and metrics, then choose a view. Indexed rebases every line to FY22 = 100 so share and premium move on one scale; hover a line to isolate it.
        </p>
        <SourceTag source="Company filing" period="FY22–FY24" frequency="Annual" confidence="high" provenance={PANEL_SOURCE} />
      </div>
    </div>
  )
}
