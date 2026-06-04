// Market Trend Explorer — a generic, metric-driven module.
//
// Pick a metric (SAHI Share · Retail Health Share · Overall Health Share ·
// GDPI Premium · Company Premium Growth). The whole module re-derives from the
// reusable point list: title, subtitle, basis, left current-position bubbles,
// the multi-line trend chart, the detail table, and the source note.
//
// Interaction — everything is cross-linked:
//   • Hover any year on the chart → the left bubbles snap to that year.
//   • Hover a company anywhere (bubble, line, or table row) → it is highlighted
//     across all three, in that company's single colour.
//   • No hover → defaults to the latest available year.
//
// Honesty — years are read from the data (never hardcoded), missing values show
// "n/a" (never 0), and a metric with no data shows a plain "not available"
// message rather than fabricated numbers.

import { useMemo, useState } from 'react'
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
import { Activity, Info } from 'lucide-react'
import { SourceTag } from './SourceTag'
import {
  COMPANY_BY_ID,
  FOCAL_COMPANY_ID,
  METRIC_ORDER,
  METRICS,
  TREND_COMPANIES,
  sortYears,
  type MetricDef,
  type MetricId,
} from '@/lib/marketTrends'

const NAVY = '#27457E'
const GRID = '#EEF1F7'
const AXIS = '#6B7280'

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// ── Local sparkline — always drawn in the company's own colour (never flips). ──
function Spark({ data, color, width = 58, height = 20 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return <span className="text-[10px] italic text-ink-secondary/40">n/a</span>
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const stepX = width / (data.length - 1)
  const pts = data.map((v, i) => [i * stepX, height - ((v - min) / span) * (height - 4) - 2] as const)
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const end = pts[pts.length - 1]
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={end[0]} cy={end[1]} r={2} fill={color} />
    </svg>
  )
}

// ── Custom tooltip — sorted, colour-coded, highlights the hovered company. ──
interface TooltipShape {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: number | null; color?: string }>
  label?: string | number
  metric: MetricDef
  hoverId: string | null
}
function ChartTooltip({ active, payload, label, metric, hoverId }: TooltipShape) {
  if (!active || !payload?.length) return null
  const seen = new Set<string>()
  const rows = payload
    .filter((p) => p.value != null)
    .map((p) => ({ id: String(p.dataKey), value: p.value as number }))
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))) // dedupe visible vs hit-line
    .sort((a, b) => b.value - a.value)
  if (!rows.length) return null
  return (
    <div className="rounded-lg border border-soft-border bg-card/95 px-2.5 py-2 shadow-card backdrop-blur-sm">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</div>
      <div className="space-y-0.5">
        {rows.map((r) => {
          const c = COMPANY_BY_ID[r.id]
          const hl = hoverId === r.id
          return (
            <div key={r.id} className="flex items-center justify-between gap-4 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: c?.color }} />
                <span className={hl ? 'font-semibold text-navy-deep' : 'text-ink-primary'}>{c?.name ?? r.id}</span>
              </span>
              <span className={`tabular-nums ${hl ? 'font-semibold text-navy-deep' : 'text-navy-deep'}`}>
                {metric.format(r.value)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function MarketTrendExplorer() {
  const [metricId, setMetricId] = useState<MetricId>('sahi_share')
  const [hoverYear, setHoverYear] = useState<string | null>(null)
  const [hoverCompany, setHoverCompany] = useState<string | null>(null)

  const metric = METRICS[metricId]

  // Everything below is derived purely from the reusable point list.
  const { years, valAt } = useMemo(() => {
    const ys = sortYears(metric.points.map((p) => p.year))
    const map = new Map<string, Map<string, number | null>>()
    for (const p of metric.points) {
      if (!map.has(p.company)) map.set(p.company, new Map())
      map.get(p.company)!.set(p.year, p.value)
    }
    const at = (id: string, year: string): number | null => map.get(id)?.get(year) ?? null
    return { years: ys, valAt: at }
  }, [metric])

  const firstYear = years[0]
  const lastYear = years[years.length - 1]
  // Default to the latest year that actually has data.
  const latestAvailableYear =
    [...years].reverse().find((y) => TREND_COMPANIES.some((c) => valAt(c.id, y) != null)) ?? lastYear
  const activeYear = hoverYear && years.includes(hoverYear) ? hoverYear : latestAvailableYear

  // First & last years that actually carry data — drives the Δ column header so
  // it stays honest when an early year is n/a (e.g. growth's FY22).
  const dataYears = years.filter((y) => TREND_COMPANIES.some((c) => valAt(c.id, y) != null))
  const firstDataYear = dataYears[0] ?? firstYear
  const lastDataYear = dataYears[dataYears.length - 1] ?? lastYear

  // first→latest delta per company (first & last years that actually have data).
  const deltaOf = (id: string): number | null => {
    const firstV = years.map((y) => valAt(id, y)).find((v) => v != null)
    const lastV = [...years].reverse().map((y) => valAt(id, y)).find((v) => v != null)
    return firstV != null && lastV != null ? lastV - firstV : null
  }

  // Rank order by the active year's value (nulls sink).
  const ranked = [...TREND_COMPANIES].sort(
    (a, b) => (valAt(b.id, activeYear) ?? -Infinity) - (valAt(a.id, activeYear) ?? -Infinity),
  )
  const bubbleMax = Math.max(1, ...ranked.map((c) => valAt(c.id, activeYear) ?? 0))
  const dia = (v: number | null) => (v == null ? 0 : 16 + (v / bubbleMax) * (48 - 16))

  const chartData = years.map((y) => {
    const row: Record<string, number | string | null> = { year: y }
    for (const c of TREND_COMPANIES) row[c.id] = valAt(c.id, y)
    return row
  })

  const rowTint = (id: string): string | undefined => {
    if (id === FOCAL_COMPANY_ID) return hexA(NAVY, hoverCompany === id ? 0.1 : 0.06)
    if (hoverCompany === id) return hexA(COMPANY_BY_ID[id].color, 0.09)
    return undefined
  }

  return (
    <div className="card-surface flex min-w-0 flex-col p-4 sm:p-5">
      {/* ── Metric tabs ─────────────────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {METRIC_ORDER.map((id) => {
          const active = id === metricId
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMetricId(id)
                setHoverYear(null)
                setHoverCompany(null)
              }}
              className={[
                'rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-all duration-200',
                active
                  ? 'border-navy-primary bg-navy-primary text-white shadow-soft'
                  : 'border-soft-border bg-white/70 text-ink-secondary hover:border-muted-blue hover:text-navy-primary',
              ].join(' ')}
              aria-pressed={active}
            >
              {METRICS[id].chip}
            </button>
          )
        })}
      </div>

      {/* ── Dynamic title + subtitle + basis ────────────────────────────── */}
      <div className="mb-3">
        <div className="flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-navy-primary" />
          <h3 className="font-display text-[15px] text-navy-deep">{metric.title}</h3>
          <span
            className="cursor-default text-ink-secondary/60"
            title="Hover any year on the chart to set the left bubbles to that year. Hover a company anywhere — bubble, line, or table row — to highlight it everywhere in its colour."
          >
            <Info className="h-3.5 w-3.5" />
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-ink-secondary">{metric.subtitle}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-md border border-soft-border bg-ice/70 px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
            {metric.basisLabel}
          </span>
          <span className="inline-flex items-center rounded-md border border-soft-border bg-ice/70 px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
            premium metric · not profit
          </span>
          {firstYear && (
            <span className="text-[10px] text-ink-secondary">
              {firstYear}–{lastYear}
            </span>
          )}
        </div>
      </div>

      {!metric.available ? (
        // ── No data for this metric — honest message, never fake values. ──
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-soft-border bg-ice/50 text-center">
          <span className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-blue text-navy-primary/70">
            <Info className="h-4 w-4" />
          </span>
          <p className="text-[13px] font-medium text-ink-secondary">Data not publicly available for this selected metric</p>
        </div>
      ) : (
        <>
          {/* ── Left bubbles + right trend chart, equal height, side by side ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-stretch">
            {/* LEFT — current market position (bubbles) for the active year. */}
            <div className="surface-soft flex h-[336px] flex-col rounded-xl p-3.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Current Position</span>
                <span className="rounded-full bg-soft-blue px-2 py-0.5 text-[10px] font-semibold text-navy-primary">
                  {activeYear} · {hoverYear ? 'hovered' : 'latest'}
                </span>
              </div>
              <div className="flex flex-1 flex-col justify-center gap-0.5">
                {ranked.map((c, idx) => {
                  const v = valAt(c.id, activeYear)
                  const focal = c.id === FOCAL_COMPANY_ID
                  const d = dia(v)
                  return (
                    <div
                      key={c.id}
                      onMouseEnter={() => setHoverCompany(c.id)}
                      onMouseLeave={() => setHoverCompany(null)}
                      className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors"
                      style={{ background: rowTint(c.id) }}
                    >
                      <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center">
                        {v != null ? (
                          <span
                            className="rounded-full transition-all duration-200"
                            style={{
                              width: d,
                              height: d,
                              background: hexA(c.color, 0.16),
                              border: `1.5px solid ${c.color}`,
                              boxShadow: hoverCompany === c.id ? `0 0 0 3px ${hexA(c.color, 0.16)}` : 'none',
                            }}
                          />
                        ) : (
                          <span className="text-[10px] italic text-ink-secondary/45">n/a</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                          <span className={`truncate text-[12px] font-semibold ${focal ? 'text-navy-deep' : 'text-ink-primary'}`}>
                            {c.name}
                          </span>
                          {focal && (
                            <span className="shrink-0 rounded-full bg-soft-blue px-1 py-px text-[7.5px] font-bold uppercase tracking-wide text-navy-primary">
                              Niva Bupa
                            </span>
                          )}
                        </div>
                        <div className="text-[9.5px] text-ink-secondary">Rank {idx + 1}</div>
                      </div>
                      <div className="shrink-0 text-right font-display text-[15px] tabular-nums text-navy-deep">
                        {v != null ? metric.format(v) : '—'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* RIGHT — multi-line trend chart. */}
            <div className="surface-soft flex h-[336px] flex-col rounded-xl p-3 pr-2">
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">
                  Trend · {firstYear}–{lastYear}
                </span>
                <span className="text-[10px] text-ink-secondary">{metric.unit}</span>
              </div>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 8, right: 14, left: -6, bottom: 0 }}
                    onMouseMove={(state) => {
                      const yr = (state as { activeLabel?: string | number } | null)?.activeLabel
                      if (typeof yr === 'string') setHoverYear(yr)
                    }}
                    onMouseLeave={() => {
                      setHoverYear(null)
                      setHoverCompany(null)
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis
                      dataKey="year"
                      tick={{ fontSize: 11, fill: AXIS }}
                      tickLine={false}
                      axisLine={{ stroke: GRID }}
                      padding={{ left: 14, right: 14 }}
                    />
                    <YAxis
                      width={metric.unit === '%' ? 34 : 46}
                      tick={{ fontSize: 10.5, fill: AXIS }}
                      tickLine={false}
                      axisLine={{ stroke: GRID }}
                      domain={[0, 'auto']}
                      tickFormatter={(v) => (metric.unit === '%' ? `${v}` : `₹${v}`)}
                    />
                    <Tooltip cursor={false} content={<ChartTooltip metric={metric} hoverId={hoverCompany} />} />
                    <ReferenceLine x={activeYear} stroke={NAVY} strokeDasharray="4 3" strokeOpacity={0.32} />

                    {/* Visible lines */}
                    {TREND_COMPANIES.map((c) => (
                      <Line
                        key={`v-${c.id}`}
                        type="monotone"
                        dataKey={c.id}
                        name={c.name}
                        stroke={c.color}
                        strokeWidth={hoverCompany === c.id ? 2.6 : hoverCompany ? 1.3 : 1.8}
                        strokeOpacity={hoverCompany && hoverCompany !== c.id ? 0.3 : 1}
                        dot={false}
                        activeDot={{ r: 3.5, fill: c.color, stroke: '#fff', strokeWidth: 1.2 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    ))}
                    {/* Transparent thick hit-lines — generous hover targets per company. */}
                    {TREND_COMPANIES.map((c) => (
                      <Line
                        key={`h-${c.id}`}
                        type="monotone"
                        dataKey={c.id}
                        stroke="transparent"
                        strokeWidth={18}
                        dot={false}
                        activeDot={false}
                        connectNulls
                        isAnimationActive={false}
                        tooltipType="none"
                        legendType="none"
                        onMouseEnter={() => setHoverCompany(c.id)}
                        onMouseLeave={() => setHoverCompany(null)}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ── Detail table (below the pair, full width) ──────────────────── */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[11px]">
              <thead>
                <tr className="bg-[#F4F7FC] text-[8.5px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
                  <th className="rounded-l-lg px-1 py-2 text-center font-semibold">#</th>
                  <th className="px-1 py-2 text-left font-semibold">Insurer</th>
                  {years.map((y) => (
                    <th key={y} className="px-1 py-2 text-right font-semibold">
                      {y}
                    </th>
                  ))}
                  <th className="px-1 py-2 text-right font-semibold">
                    Δ {firstDataYear}→{lastDataYear}
                  </th>
                  <th className="rounded-r-lg px-2 py-2 text-right font-semibold">Trend</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((c, idx) => {
                  const focal = c.id === FOCAL_COMPANY_ID
                  const series = years.map((y) => valAt(c.id, y))
                  const delta = deltaOf(c.id)
                  return (
                    <tr
                      key={c.id}
                      onMouseEnter={() => setHoverCompany(c.id)}
                      onMouseLeave={() => setHoverCompany(null)}
                      className="border-b border-soft-border/60 transition-colors last:border-0"
                      style={{ background: rowTint(c.id) }}
                    >
                      <td className="px-1 py-2.5 text-center align-middle">
                        <span className="font-display text-[12.5px] font-semibold tabular-nums text-navy-deep">{idx + 1}</span>
                      </td>
                      <td className="px-1 py-2.5 align-middle">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                          <span className={`truncate text-[11.5px] font-semibold ${focal ? 'text-navy-deep' : 'text-ink-primary'}`}>
                            {c.name}
                          </span>
                          {focal && (
                            <span className="shrink-0 rounded-full bg-soft-blue px-1 py-px text-[7.5px] font-bold uppercase tracking-wide text-navy-primary">
                              Niva Bupa
                            </span>
                          )}
                        </div>
                      </td>
                      {series.map((v, i) => (
                        <td key={i} className="whitespace-nowrap px-1 py-2.5 text-right align-middle tabular-nums">
                          {v != null ? (
                            <span className="font-medium text-navy-deep">{metric.format(v)}</span>
                          ) : (
                            <span className="italic text-ink-secondary/40">n/a</span>
                          )}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-1 py-2.5 text-right align-middle tabular-nums">
                        {delta != null ? (
                          <span
                            className={`font-semibold ${delta > 0.05 ? 'text-emerald' : delta < -0.05 ? 'text-coral' : 'text-ink-secondary'}`}
                          >
                            {metric.formatDelta(delta)}
                          </span>
                        ) : (
                          <span className="italic text-ink-secondary/40">n/a</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 align-middle">
                        <div className="flex justify-end">
                          <Spark data={series.filter((v): v is number => v != null)} color={c.color} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── "So what" + dynamic source note ─────────────────────────────── */}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-2 pt-1">
        <p className="max-w-xl text-[11.5px] leading-relaxed text-ink-secondary">
          <span className="font-semibold text-navy-deep">So what — </span>
          {metric.note}
        </p>
        <SourceTag
          source="Company filing"
          period={firstYear ? `${firstYear}–${lastYear}` : undefined}
          frequency="Annual"
          confidence="high"
          provenance={metric.source}
        />
      </div>
    </div>
  )
}
