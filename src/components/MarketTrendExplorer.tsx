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
//     Bupa's latest value, its first→latest move and a tiny sparkline.
//
// View modes:
//   • Absolute        — raw values; only metrics that share a unit can sit on
//                        one axis, so a mixed selection auto-switches to Indexed.
//   • Indexed (base year = 100) — every line rebased to 100 at the first data
//                        year, so share and premium compare on one scale.
//   • YoY change      — year-on-year % move; the first year has no prior base.
//
// Honesty: years come from the data (never hardcoded), a null value is omitted
// (never drawn as 0 or indexed off a missing base), GDPI stays labelled a
// premium (not profit), and an indexed view is always flagged as rebased.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Customized,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Check, ChevronDown } from 'lucide-react'
import { SourceTag } from './SourceTag'
import {
  FOCAL_COMPANY_ID,
  METRICS,
  sortYears,
  TREND_COMPANIES,
  TREND_SOURCES,
  yearNum,
  type MetricDef,
  type MetricId,
} from '@/lib/marketTrends'

// The four health lenses offered for comparison — from the narrow SAHI segment
// lens out to the rupee premium scale.
const PRIMARY: MetricId[] = ['sahi_share', 'retail_share', 'overall_share', 'gdpi']

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

const GRID = '#EEF1F7'
const AXIS = '#6B7280'
const round1 = (n: number) => Math.round(n * 10) / 10

// The running fiscal year (Indian FY: Apr→Mar). The fiscal year after the
// latest reported one is carried as an honest, visible trailing gap on the
// axis ("not yet reported") for as long as the clock has entered it — it fills
// in automatically the moment the next March edition ingests, and the gap tick
// then advances to the following year by itself. Nothing here is hardcoded.
const CLOCK_FY = (() => {
  // Indian fiscal year (Apr 1 – Mar 31), evaluated in IST (UTC+5:30) so the
  // year rolls at midnight India time — not 05:30 IST (midnight UTC), which
  // otherwise mislabels the trailing "not yet reported" gap for ~5.5h on Apr 1.
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return (ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() + 1 : ist.getUTCFullYear()) - 2000
})()

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
  // Each line is drawn twice (a visible line + a transparent hover hit-line that
  // shares its dataKey), so de-dupe by key to avoid listing a series twice.
  const seen = new Set<string>()
  const rows = payload
    .filter((p) => p.value != null && p.dataKey != null && byKey.has(String(p.dataKey)))
    .filter((p) => {
      const k = String(p.dataKey)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
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

// A compact, clickable lens card. Clicking it focuses that single metric across
// ALL insurers (handled by the parent), so "click SAHI Share → every insurer's
// SAHI share". `active` ties the card to the current metric selection.
function SummaryCard({ metric, active, onClick }: { metric: MetricDef; active: boolean; onClick: () => void }) {
  const { last, delta } = seriesStat(metric, FOCAL_COMPANY_ID)
  const years = sortYears(metric.points.map((p) => p.year))
  const map = absLookup(FOCAL_COMPANY_ID, metric)
  const values = years.map((y) => map.get(y) ?? null)
  const color = METRIC_COLOR[metric.id]
  const latestYear = [...years].reverse().find((y) => map.get(y) != null) ?? years[years.length - 1] ?? '—'
  // The delta is the first→latest move; label it with its real span so "+3.4 pp"
  // is never ambiguous about which years it covers (honest period label).
  const firstYear = years.find((y) => map.get(y) != null) ?? '—'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="surface-soft group relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-xl p-2.5 text-left transition-all duration-normal ease-premium hover:-translate-y-px lg:flex-1"
      style={{
        background: `linear-gradient(135deg, ${color}${active ? '16' : '0A'} 0%, transparent 65%)`,
        boxShadow: active ? `0 0 0 1.5px ${color}66, 0 6px 16px rgba(23,43,77,0.06)` : undefined,
      }}
    >
      <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: color, opacity: active ? 1 : 0.5 }} />
      <div className="min-w-0 pl-1.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
          <p className="truncate font-display text-[12px] leading-tight text-navy-deep">{metric.chip}</p>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[16px] font-semibold leading-none tabular-nums" style={{ color }}>
            {last != null ? metric.format(last) : 'n/a'}
          </span>
          <span className="text-[8px] uppercase tracking-wide text-ink-secondary/70">{latestYear}</span>
        </div>
        {delta != null && (
          <p className={`mt-1 text-[10px] font-semibold tabular-nums ${delta >= 0 ? 'text-emerald' : 'text-coral'}`}>
            {metric.formatDelta(delta)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Sparkline values={values} color={color} />
        {delta != null && firstYear !== '—' && firstYear !== latestYear && (
          <span className="whitespace-nowrap text-[8px] font-medium tabular-nums text-ink-secondary/70">
            {firstYear} <span className="text-ink-secondary/45">→</span> {latestYear}
          </span>
        )}
      </div>
    </button>
  )
}

// Compact insurer multi-select dropdown — replaces the chip row so the control
// bar stays tidy. Each row toggles a company; hovering a row isolates it on the
// chart (same as the old chips). Closes on outside click.
function InsurerDropdown({
  selected,
  onToggle,
  onHover,
}: {
  selected: Set<string>
  onToggle: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !(ref.current as Node).contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const count = selected.size
  const label =
    count === TREND_COMPANIES.length
      ? 'All insurers'
      : count === 1
        ? TREND_COMPANIES.find((c) => selected.has(c.id))?.name ?? '1 insurer'
        : `${count} insurers`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-white px-2.5 py-0.5 text-[10.5px] font-medium text-navy-deep shadow-soft transition-colors hover:bg-ice/60"
      >
        <span className="flex -space-x-1">
          {TREND_COMPANIES.filter((c) => selected.has(c.id))
            .slice(0, 5)
            .map((c) => (
              <span key={c.id} className="h-2.5 w-2.5 rounded-full ring-1 ring-white" style={{ background: c.color }} />
            ))}
        </span>
        {label}
        <ChevronDown className={`h-3 w-3 text-ink-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-48 rounded-xl border border-soft-border bg-white p-1 shadow-card">
          {TREND_COMPANIES.map((c) => {
            const on = selected.has(c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onToggle(c.id)}
                onMouseEnter={() => onHover(c.id)}
                onMouseLeave={() => onHover(null)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-ice/70"
              >
                <span
                  className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border"
                  style={{ borderColor: on ? c.color : '#CBD2DC', background: on ? c.color : 'transparent' }}
                >
                  {on && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                </span>
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                <span className={on ? 'font-medium text-navy-deep' : 'text-ink-secondary'}>{c.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const PANEL_SOURCE = {
  source_name: [
    `Niva Bupa DRHP (Jul 2024) · Redseer Report, Exhibits 40–41 (overall- & retail-health GDPI and market share), ${TREND_SOURCES.drhp.span}.`,
    TREND_SOURCES.gic.span
      ? ` ${TREND_SOURCES.gic.span} computed from the GI Council Segment-wise Report (health portfolio) on the same GDPI bases — the FY24 five-SAHI retail base matches the DRHP to the rupee.`
      : '',
    ' Premium metric — not profit.',
  ].join(''),
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

  // Axis years = the real data years, plus the next fiscal year as a trailing
  // "not yet reported" gap once the clock has entered it — so the axis always
  // honestly shows where the story has reached, and advances by itself.
  const lastDataYear = years[years.length - 1]
  const gapYear = lastDataYear ? `FY${yearNum(lastDataYear) + 1}` : null
  const showGap = gapYear != null && yearNum(gapYear) <= CLOCK_FY
  const axisYears = useMemo(() => (showGap && gapYear ? [...years, gapYear] : years), [years, showGap, gapYear])
  // The label of the indexing base (first data year) + the visible story span.
  const baseYear = years[0] ?? '—'
  const spanLabel = `${baseYear}–${axisYears[axisYears.length - 1] ?? '—'}`

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
  // trailing gap-year row is all-null so every line simply stops at the last
  // reported year).
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
  // violet) — the reference look. With several insurers, colour encodes the
  // COMPANY. Lines are always solid; hover isolation keeps a busy chart readable.
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
  // Click a lens card → focus that one metric across EVERY insurer (so e.g.
  // "SAHI Share" instantly shows all five insurers' SAHI-pool share).
  const focusLens = (id: MetricId) => {
    setMetricSet(new Set([id]))
    setCompanySet(new Set(TREND_COMPANIES.map((c) => c.id)))
  }

  const absUnit = selMetrics[0]?.unit ?? '%'
  const yTick = (v: number) =>
    mode === 'indexed' ? `${v}` : mode === 'yoy' ? `${v}%` : absUnit === '%' ? `${v}%` : `₹${v}`

  // Single end-label layer — knows every label's pixel position, so it can nudge
  // them apart vertically when several lines finish at similar values (e.g. the
  // YoY view), keeping each value readable without overlapping or connectors.
  type ScaleFn = ((v: number | string) => number) & { bandwidth?: () => number }
  interface CustomLayerProps {
    yAxisMap?: Record<string, { scale: ScaleFn }>
    xAxisMap?: Record<string, { scale: ScaleFn }>
    offset?: { top: number; height: number }
  }
  const renderEndLabels = (p: CustomLayerProps) => {
    const yEntry = p.yAxisMap && Object.values(p.yAxisMap)[0]
    const xEntry = p.xAxisMap && Object.values(p.xAxisMap)[0]
    if (!yEntry || !xEntry) return <g />
    const yScale = yEntry.scale
    const xScale = xEntry.scale
    const bw = xScale.bandwidth ? xScale.bandwidth() : 0

    const items = combos
      .map((cb) => {
        const idx = lastIdxByKey[cb.key]
        if (idx < 0) return null
        if (anyHover && !isActive(cb)) return null
        const v = data[idx]?.[cb.key]
        if (v == null || typeof v !== 'number') return null
        const txt =
          mode === 'yoy'
            ? `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`
            : mode === 'indexed'
              ? `${Math.round(v)}`
              : cb.metric.format(v)
        return {
          key: cb.key,
          x: xScale(axisYears[idx]) + bw / 2,
          y: yScale(v),
          txt,
          color: colorByKey[cb.key],
          bold: singleCompany || cb.company.id === FOCAL_COMPANY_ID,
        }
      })
      .filter((it): it is NonNullable<typeof it> => it != null)
      .sort((a, b) => a.y - b.y)

    // Push labels down so adjacent ones keep a minimum gap, then shift the whole
    // group up if it overflows the plot, so it stays vertically centred.
    const gap = 13
    for (let i = 1; i < items.length; i++) {
      if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap
    }
    if (p.offset && items.length) {
      const bottom = p.offset.top + p.offset.height
      const overflow = items[items.length - 1].y - bottom
      if (overflow > 0) for (const it of items) it.y = Math.max(p.offset.top + 4, it.y - overflow)
    }

    return (
      <g>
        {items.map((it) => (
          <text
            key={it.key}
            x={it.x + 9}
            y={it.y + 3.5}
            fontSize={10}
            fontWeight={it.bold ? 700 : 600}
            fill={it.color}
            textAnchor="start"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {it.txt}
          </text>
        ))}
      </g>
    )
  }

  // X tick — the trailing gap year reads soft-grey with a quiet "not yet
  // reported" sub-label so the missing year is honest, never blank or fabricated.
  const renderXTick = (props: { x?: number; y?: number; payload?: { value?: string } }) => {
    const x = Number(props.x)
    const y = Number(props.y)
    const val = props.payload?.value ?? ''
    const isGap = val === gapYear && showGap
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
          Five standalone health insurers · four lenses · {spanLabel} ·{' '}
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
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10.5px] font-medium transition-all duration-normal ease-premium',
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

        {/* Insurer multi-select (dropdown) + View mode on one tidy row. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="mr-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Insurer</span>
            <InsurerDropdown selected={companySet} onToggle={toggleCompany} onHover={setHoverCompany} />
          </div>
          <span className="mr-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">View</span>
          <div className="inline-flex overflow-hidden rounded-full border border-soft-border bg-white/60">
            {(
              [
                { id: 'absolute', label: 'Absolute' },
                { id: 'indexed', label: `Indexed ${baseYear} = 100` },
                { id: 'yoy', label: 'YoY change' },
              ] as { id: ViewMode; label: string }[]
            ).map((vm) => {
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
                    'px-2.5 py-0.5 text-[10.5px] font-medium transition-all duration-normal ease-premium',
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
              Indexed to {baseYear} = 100 so share and premium growth can be compared on one scale.
            </span>
          )}
        </div>
      </div>

      {/* ── Chart (left) + clickable lens cards (right) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-stretch">
        <div className="h-[300px] w-full">
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
              return (
                <Line
                  key={`l-${cb.key}`}
                  type="monotone"
                  dataKey={cb.key}
                  stroke={color}
                  strokeWidth={width}
                  strokeOpacity={opacity}
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
                />
              )
            })}

            {/* Right-end value labels — rendered as one layer so they can be
                spread vertically and never overlap (no connector lines). */}
            <Customized component={renderEndLabels} />
          </LineChart>
        </ResponsiveContainer>
      </div>

        {/* Lens cards — click one to focus that metric across every insurer. */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:flex lg:flex-col">
          {PRIMARY.map((id) => (
            <SummaryCard key={id} metric={METRICS[id]} active={metricSet.has(id)} onClick={() => focusLens(id)} />
          ))}
        </div>
      </div>

      {/* Footer — the two joined sources (DRHP through FY24, GI Council after). */}
      <div className="mt-3 flex justify-end pt-1">
        <SourceTag source="Company filing + GI Council" period={spanLabel} frequency="Annual" confidence="high" provenance={PANEL_SOURCE} />
      </div>
    </div>
  )
}
