// Health Industry Insights — a chart-first, glanceable 2×2 panel.
//
// Replaces the old metric-by-metric tab explorer with four mini metric cards
// shown together: SAHI Share, Retail Health Share, Overall Health Share and
// GDPI Premium. (Company Premium Growth is intentionally dropped from the
// primary view — it is a year-on-year derivative of the GDPI premium series
// already shown here, so a fifth card would just restate that trend and add
// clutter.)
//
// Each card is a small combo chart over the reported years (FY22–FY24):
//   • company-wise grouped bars (one slim bar per insurer, theme-coloured) for
//     the cross-company comparison, and
//   • a smooth (monotone) line per insurer for that insurer's trend over time.
// Hovering any insurer — a bar, a line, or its legend chip — isolates it across
// ALL FOUR cards at once: the rest softly fade, so a single company's health
// story reads cleanly on every lens. An elegant tooltip gives the exact values.
//
// Honesty: years come from the data (never hardcoded), a null value is omitted
// (never drawn as 0), and a metric with no data renders a plain "not available"
// note rather than fabricated numbers.

import { useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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

// The four primary health lenses, shown together — from the narrow SAHI segment
// lens out to the rupee premium scale.
const PRIMARY: MetricId[] = ['sahi_share', 'retail_share', 'overall_share', 'gdpi']

const GRID = '#EEF1F7'
const AXIS = '#6B7280'

interface ChartModel {
  years: string[]
  data: Record<string, number | string | null>[]
}

/** Flatten a metric's point list into recharts rows: one row per year carrying
 *  every company's value (null where the source has none — never coerced to 0). */
function useChartModel(metric: MetricDef): ChartModel {
  return useMemo(() => {
    const years = sortYears(metric.points.map((p) => p.year))
    const byYear = new Map<string, Map<string, number | null>>()
    for (const p of metric.points) {
      if (!byYear.has(p.year)) byYear.set(p.year, new Map())
      byYear.get(p.year)!.set(p.company, p.value)
    }
    const data = years.map((y) => {
      const row: Record<string, number | string | null> = { year: y }
      for (const c of TREND_COMPANIES) row[c.id] = byYear.get(y)?.get(c.id) ?? null
      return row
    })
    return { years, data }
  }, [metric])
}

/** First→latest move for one company (over the years that actually carry data). */
function seriesStat(metric: MetricDef, companyId: string): { last: number | null; delta: number | null } {
  const pts = metric.points.filter((p) => p.company === companyId)
  const years = sortYears(pts.map((p) => p.year))
  const at = new Map(pts.map((p) => [p.year, p.value]))
  const first = years.map((y) => at.get(y)).find((v) => v != null) ?? null
  const last = [...years].reverse().map((y) => at.get(y)).find((v) => v != null) ?? null
  const delta = first != null && last != null ? last - first : null
  return { last, delta }
}

// ── Elegant, de-duped tooltip — narrows to the hovered insurer when one is set. ──
interface TipProps {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: number | null }>
  label?: string | number
  metric: MetricDef
  hoverId: string | null
}
function MiniTooltip({ active, payload, label, metric, hoverId }: TipProps) {
  if (!active || !payload?.length) return null
  const seen = new Set<string>()
  let rows = payload
    .filter((p) => p.value != null && p.dataKey != null)
    .map((p) => ({ id: String(p.dataKey), value: p.value as number }))
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
  if (hoverId) rows = rows.filter((r) => r.id === hoverId)
  rows.sort((a, b) => b.value - a.value)
  if (!rows.length) return null
  return (
    <div className="rounded-lg border border-soft-border bg-card/95 px-2.5 py-1.5 shadow-card backdrop-blur-sm">
      <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</div>
      <div className="space-y-0.5">
        {rows.map((r) => {
          const c = COMPANY_BY_ID[r.id]
          return (
            <div key={r.id} className="flex items-center justify-between gap-3 text-[10.5px]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: c?.color }} />
                <span className="text-ink-primary">{c?.name ?? r.id}</span>
              </span>
              <span className="font-semibold tabular-nums text-navy-deep">{metric.format(r.value)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MiniMetricCard({
  metric,
  hoverId,
  setHover,
}: {
  metric: MetricDef
  hoverId: string | null
  setHover: (id: string | null) => void
}) {
  const { data } = useChartModel(metric)
  const { last, delta } = seriesStat(metric, FOCAL_COMPANY_ID)
  const basis = metric.unit === '%' ? '% share' : `${metric.unit} · premium`

  return (
    <div className="surface-soft flex flex-col rounded-xl p-3">
      {/* Card header — metric name + the focal insurer's latest value & move. */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-[12.5px] leading-tight text-navy-deep">{metric.chip}</p>
          <p className="text-[9px] uppercase tracking-wide text-ink-secondary">{basis} · FY22–FY24</p>
        </div>
        {last != null && (
          <div className="shrink-0 text-right leading-none">
            <p className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: FOCAL.color }}>
              {FOCAL.name}
            </p>
            <p className="mt-0.5 text-[13px] font-semibold tabular-nums" style={{ color: FOCAL.color }}>
              {metric.format(last)}
            </p>
            {delta != null && (
              <p className={`mt-0.5 text-[9px] font-semibold tabular-nums ${delta >= 0 ? 'text-emerald' : 'text-coral'}`}>
                {metric.formatDelta(delta)}
              </p>
            )}
          </div>
        )}
      </div>

      {metric.available ? (
        <div className="h-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 6, right: 6, left: 6, bottom: 0 }}
              barCategoryGap="22%"
              barGap={1}
              onMouseLeave={() => setHover(null)}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 9.5, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis hide domain={[0, 'auto']} />
              <Tooltip cursor={{ fill: 'rgba(23,43,77,0.045)' }} content={<MiniTooltip metric={metric} hoverId={hoverId} />} />

              {/* transparent thick hit-lines (declared first → bars sit above them
                  so a bar hover wins, while the open line path stays hoverable). */}
              {TREND_COMPANIES.map((c) => (
                <Line
                  key={`h-${c.id}`}
                  type="monotone"
                  dataKey={c.id}
                  stroke="transparent"
                  strokeWidth={12}
                  dot={false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                  tooltipType="none"
                  legendType="none"
                  onMouseEnter={() => setHover(c.id)}
                  onMouseLeave={() => setHover(null)}
                />
              ))}

              {/* company-wise grouped bars — soft magnitude layer (the focal
                  insurer reads a touch stronger so the eye lands there first). */}
              {TREND_COMPANIES.map((c) => {
                const isFocal = c.id === FOCAL_COMPANY_ID
                return (
                  <Bar
                    key={`b-${c.id}`}
                    dataKey={c.id}
                    fill={c.color}
                    fillOpacity={hoverId ? (hoverId === c.id ? 0.92 : 0.06) : isFocal ? 0.5 : 0.28}
                    radius={[2, 2, 0, 0]}
                    maxBarSize={8}
                    isAnimationActive={false}
                    onMouseEnter={() => setHover(c.id)}
                  />
                )
              })}

              {/* smooth per-company trend lines — crisp foreground */}
              {TREND_COMPANIES.map((c) => {
                const isFocal = c.id === FOCAL_COMPANY_ID
                return (
                  <Line
                    key={`l-${c.id}`}
                    type="monotone"
                    dataKey={c.id}
                    stroke={c.color}
                    strokeWidth={hoverId === c.id ? 2.6 : isFocal ? 2.2 : 1.6}
                    strokeOpacity={hoverId ? (hoverId === c.id ? 1 : 0.08) : isFocal ? 1 : 0.78}
                    dot={false}
                    activeDot={hoverId && hoverId !== c.id ? false : { r: 3, fill: c.color, stroke: '#fff', strokeWidth: 1.2 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[140px] items-center justify-center rounded-lg border border-dashed border-soft-border bg-ice/50 text-center text-[10.5px] text-ink-secondary">
          Data not publicly available
        </div>
      )}
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
  const [hoverId, setHover] = useState<string | null>(null)
  const metrics = PRIMARY.map((id) => METRICS[id])

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

      {/* Shared legend — hover an insurer to isolate it across all four cards. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {TREND_COMPANIES.map((c) => {
          const on = hoverId === c.id
          const dim = hoverId != null && !on
          const focal = c.id === FOCAL_COMPANY_ID
          return (
            <button
              key={c.id}
              type="button"
              onMouseEnter={() => setHover(c.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(c.id)}
              onBlur={() => setHover(null)}
              className={[
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] transition-all duration-200',
                on ? 'border-muted-blue bg-white shadow-soft' : 'border-soft-border bg-white/60',
                dim ? 'opacity-45' : 'opacity-100',
              ].join(' ')}
              aria-pressed={on}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
              <span className={focal ? 'font-semibold text-navy-deep' : 'font-medium text-ink-secondary'}>{c.name}</span>
            </button>
          )
        })}
      </div>

      {/* Mini metric cards — 2×2 by default; a single clean row of four on wide
          desktop (the panel is now full-width), keeping the charts well-
          proportioned and all four health lenses visible at a glance. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map((m) => (
          <MiniMetricCard key={m.id} metric={m} hoverId={hoverId} setHover={setHover} />
        ))}
      </div>

      {/* Footer — one-line read + a single shared source (all from the DRHP). */}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-2 pt-4">
        <p className="max-w-sm text-[11px] leading-relaxed text-ink-secondary">
          <span className="font-semibold text-navy-deep">Read it — </span>
          bars compare insurers each year; the line traces each insurer&rsquo;s trend. Hover one to isolate it across all four lenses.
        </p>
        <SourceTag source="Company filing" period="FY22–FY24" frequency="Annual" confidence="high" provenance={PANEL_SOURCE} />
      </div>
    </div>
  )
}
