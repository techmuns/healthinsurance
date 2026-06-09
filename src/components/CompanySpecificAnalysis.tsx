// Company-Specific Analysis — the SAHI insurer-by-insurer glance that closes
// the Industry → Health → SAHI → Company story. Two balanced, equal-height
// cards:
//   • LEFT  — Market Share Trend (SAHI): a clean line trend of each standalone
//             insurer's share of the SAHI pool over FY22–FY25 (default view),
//             with the packed-bubble market map kept as a secondary toggle.
//   • RIGHT — Peer Metrics table: SAHI / retail share + GDPI premium (FY24)
//             alongside claims & solvency ratios (FY25), Niva Bupa highlighted.
//
// Honesty: FY25 is carried as a visible "not yet reported" gap on the trend
// (the share/premium source lands through FY24); missing peer ratios render a
// soft-grey "n/a" — never a fabricated 0 — and every column states its period.

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Area,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, CircleDot, Info } from 'lucide-react'
import { MarketBubbleChart } from '@/components/MarketBubbleChart'
import { SourceTag } from '@/components/SourceTag'
import { getIndustryOverview } from '@/lib/industryOverview'
import { useFilters } from '@/state/filters'
import { insurers } from '@/data/mockData'
import {
  FOCAL_COMPANY_ID,
  METRICS,
  sortYears,
  TREND_COMPANIES,
  type MetricId,
} from '@/lib/marketTrends'
import sahiPeer from '@/data/snapshots/sahi-peer-comparison.json'

const GRID = '#EEF1F7'
const AXIS = '#6B7280'
const GAP_YEAR = 'FY25'

// ── Data helpers ────────────────────────────────────────────────────────────

/** Latest non-null value of a market-trend metric for one company (FY24 today). */
function latestVal(metricId: MetricId, companyId: string): number | null {
  const pts = METRICS[metricId].points.filter((p) => p.company === companyId)
  const at = new Map(pts.map((p) => [p.year, p.value]))
  for (const y of sortYears(pts.map((p) => p.year)).reverse()) {
    const v = at.get(y)
    if (v != null) return v
  }
  return null
}

interface PeerRatio {
  claims_ratio: number | null
  solvency_ratio: number | null
}
const PEER_BY_CO = new Map<string, PeerRatio>(
  (sahiPeer.data as Array<{ company_id: string; claims_ratio: number | null; solvency_ratio: number | null }>).map(
    (d) => [d.company_id, { claims_ratio: d.claims_ratio, solvency_ratio: d.solvency_ratio }],
  ),
)
const LISTED_BY_CO = new Map(insurers.map((i) => [i.id, i.ticker.trim().length > 0]))

interface PeerRow {
  id: string
  name: string
  color: string
  focal: boolean
  listed: boolean
  isLeader: boolean
  rank: number
  sahiShare: number | null
  retailShare: number | null
  gdpi: number | null
  claims: number | null
  solvency: number | null
}

function buildPeerRows(): PeerRow[] {
  const rows = TREND_COMPANIES.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    focal: c.id === FOCAL_COMPANY_ID,
    listed: LISTED_BY_CO.get(c.id) ?? false,
    isLeader: false,
    rank: 0,
    sahiShare: latestVal('sahi_share', c.id),
    retailShare: latestVal('retail_share', c.id),
    gdpi: latestVal('gdpi', c.id),
    claims: PEER_BY_CO.get(c.id)?.claims_ratio ?? null,
    solvency: PEER_BY_CO.get(c.id)?.solvency_ratio ?? null,
  }))
  rows.sort((a, b) => (b.sahiShare ?? -1) - (a.sahiShare ?? -1))
  rows.forEach((r, i) => {
    r.rank = i + 1
    r.isLeader = i === 0
  })
  return rows
}

const PEER_SOURCE = {
  source_name:
    'SAHI & retail share + overall-health GDPI from Niva Bupa DRHP (Redseer, Exhibits 40–41), FY24. Claims & solvency ratios from per-insurer FY25 public disclosures (sahi-peer-comparison snapshot). Premium metric — not profit.',
  source_url: METRICS.gdpi.source.source_url,
  fetched_at: METRICS.gdpi.source.fetched_at,
}

// ── Trend (Market Share within the SAHI pool) ───────────────────────────────

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: number | null }>
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  const rows = payload
    .filter((p) => p.value != null && p.dataKey != null)
    .map((p) => ({ c: TREND_COMPANIES.find((t) => t.id === String(p.dataKey)), v: p.value as number }))
    .filter((r) => r.c)
    .sort((a, b) => b.v - a.v)
  if (!rows.length) return null
  return (
    <div className="rounded-lg border border-soft-border bg-card/95 px-2.5 py-1.5 shadow-card backdrop-blur-sm">
      <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-ink-secondary">{String(label)} · SAHI share</div>
      <div className="space-y-0.5">
        {rows.map(({ c, v }) => (
          <div key={c!.id} className="flex items-center justify-between gap-4 text-[10.5px]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: c!.color }} />
              <span className="text-ink-primary">{c!.name}</span>
            </span>
            <span className="font-semibold tabular-nums text-navy-deep">{v.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MarketShareTrend() {
  const trendYears = useMemo(() => sortYears(METRICS.sahi_share.points.map((p) => p.year)), [])
  const showGap = trendYears.length > 0 && !trendYears.includes(GAP_YEAR)
  const axisYears = showGap ? [...trendYears, GAP_YEAR] : trendYears

  const data = useMemo(
    () =>
      axisYears.map((y) => {
        const row: Record<string, number | string | null> = { year: y }
        for (const c of TREND_COMPANIES) row[c.id] = latestValAt(c.id, y)
        return row
      }),
    [axisYears],
  )

  const lastIdxByCo = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of TREND_COMPANIES) {
      let idx = -1
      data.forEach((row, i) => {
        if (row[c.id] != null) idx = i
      })
      m[c.id] = idx
    }
    return m
  }, [data])

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

  const focalColor = TREND_COMPANIES.find((c) => c.id === FOCAL_COMPANY_ID)?.color ?? '#27457E'

  return (
    <div className="h-[330px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 58, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id="msTrendFocal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={focalColor} stopOpacity={0.18} />
              <stop offset="95%" stopColor={focalColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="year" tick={renderXTick} tickLine={false} axisLine={{ stroke: GRID }} height={30} interval={0} />
          <YAxis
            width={34}
            tick={{ fontSize: 9, fill: AXIS }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}%`}
            domain={[0, 'auto']}
          />
          <Tooltip cursor={{ stroke: '#C9D2E0', strokeWidth: 1, strokeDasharray: '3 3' }} content={<TrendTooltip />} />
          <ReferenceLine y={0} stroke={GRID} />
          {/* Soft shadow area beneath the focal insurer's line. */}
          <Area type="monotone" dataKey={FOCAL_COMPANY_ID} stroke="none" fill="url(#msTrendFocal)" connectNulls={false} isAnimationActive={false} legendType="none" tooltipType="none" />
          {TREND_COMPANIES.map((c) => {
            const focal = c.id === FOCAL_COMPANY_ID
            const lastIdx = lastIdxByCo[c.id]
            return (
              <Line
                key={c.id}
                type="monotone"
                dataKey={c.id}
                name={c.name}
                stroke={c.color}
                strokeWidth={focal ? 2.6 : 1.6}
                strokeOpacity={focal ? 1 : 0.6}
                dot={(p: { cx?: number; cy?: number; index?: number; value?: number | null }) => {
                  const cx = Number(p.cx)
                  const cy = Number(p.cy)
                  if (p.value == null || Number.isNaN(cx) || Number.isNaN(cy)) return <g key={`d-${c.id}-${p.index}`} />
                  const isLast = p.index === lastIdx
                  return (
                    <circle
                      key={`d-${c.id}-${p.index}`}
                      cx={cx}
                      cy={cy}
                      r={isLast ? 4.4 : 3.2}
                      fill={isLast ? c.color : '#fff'}
                      stroke={c.color}
                      strokeWidth={1.5}
                      opacity={focal ? 1 : 0.7}
                    />
                  )
                }}
                activeDot={{ r: 5.5, fill: c.color, stroke: '#fff', strokeWidth: 1.4 }}
                connectNulls={false}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey={c.id}
                  content={(p: { x?: number | string; y?: number | string; index?: number; value?: number | string | null }) => {
                    if (p.index !== lastIdx || p.value == null) return null
                    const x = Number(p.x)
                    const y = Number(p.y)
                    if (Number.isNaN(x) || Number.isNaN(y)) return null
                    return (
                      <text
                        x={x + 8}
                        y={y + 3.5}
                        fontSize={10}
                        fontWeight={focal ? 700 : 600}
                        fill={c.color}
                        textAnchor="start"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {Number(p.value).toFixed(1)}%
                      </text>
                    )
                  }}
                />
              </Line>
            )
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/** SAHI-pool share for one company at a given year (null where the source has none). */
function latestValAt(companyId: string, year: string): number | null {
  const p = METRICS.sahi_share.points.find((q) => q.company === companyId && q.year === year)
  return p ? p.value : null
}

// ── Peer Metrics table ──────────────────────────────────────────────────────

function Badge({ label, tone }: { label: string; tone: 'gold' | 'navy' | 'slate' }) {
  const c =
    tone === 'gold'
      ? 'bg-champagne-soft text-champagne-deep ring-[#EAD9B6]'
      : tone === 'navy'
        ? 'bg-soft-blue text-navy-primary ring-[#D6E2FA]'
        : 'bg-ice text-ink-secondary ring-soft-border'
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wide ring-1 ${c}`}>
      {label}
    </span>
  )
}

/** Numeric cell — soft-grey "n/a" when the source has no value (never a fake 0). */
function Cell({ text, available, strong }: { text: string; available: boolean; strong?: boolean }) {
  return (
    <td className="py-2 pl-2 text-right tabular-nums">
      <span className={available ? (strong ? 'font-semibold text-navy-deep' : 'text-ink-primary') : 'text-ink-secondary/45'}>
        {available ? text : 'n/a'}
      </span>
    </td>
  )
}

function ColHead({ label, period }: { label: string; period: string }) {
  return (
    <th className="py-2 pl-2 text-right align-bottom font-semibold text-navy-deep/80">
      <span className="block leading-tight">{label}</span>
      <span className="block text-[8.5px] font-medium uppercase tracking-wide text-ink-secondary/70">{period}</span>
    </th>
  )
}

function PeerMetricsTable() {
  const rows = useMemo(buildPeerRows, [])
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-soft-border bg-ice/60 text-left text-[9.5px] uppercase tracking-wide text-ink-secondary">
            <th className="rounded-l-lg py-2 pl-2.5 font-semibold">#</th>
            <th className="py-2 pl-2 font-semibold text-navy-deep/80">Insurer</th>
            <th className="py-2 pl-2 font-semibold text-navy-deep/80">Type</th>
            <ColHead label="SAHI Share" period="FY24" />
            <ColHead label="Retail Share" period="FY24" />
            <ColHead label="GDPI Premium" period="FY24" />
            <ColHead label="Claims Ratio" period="FY25" />
            <th className="rounded-r-lg py-2 pl-2 pr-2.5 text-right align-bottom font-semibold text-navy-deep/80">
              <span className="block leading-tight">Solvency</span>
              <span className="block text-[8.5px] font-medium uppercase tracking-wide text-ink-secondary/70">FY25</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={[
                'border-b border-[#F1F3F8] transition-colors',
                r.focal ? 'bg-soft-blue/40' : 'hover:bg-ice/40',
              ].join(' ')}
            >
              <td className="py-2 pl-2.5 text-ink-secondary tabular-nums">{r.rank}</td>
              <td className="py-2 pl-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className={r.focal ? 'font-semibold text-navy-deep' : 'font-medium text-ink-primary'}>{r.name}</span>
                  {r.isLeader && <Badge label="Leader" tone="gold" />}
                  {r.focal && <Badge label="Selected" tone="navy" />}
                </div>
              </td>
              <td className="py-2 pl-2">
                <Badge label={r.listed ? 'Listed' : 'Unlisted'} tone="slate" />
              </td>
              <Cell text={r.sahiShare != null ? `${r.sahiShare.toFixed(1)}%` : ''} available={r.sahiShare != null} strong={r.focal} />
              <Cell text={r.retailShare != null ? `${r.retailShare.toFixed(1)}%` : ''} available={r.retailShare != null} />
              <Cell text={r.gdpi != null ? METRICS.gdpi.format(r.gdpi) : ''} available={r.gdpi != null} />
              <Cell text={r.claims != null ? `${r.claims.toFixed(1)}%` : ''} available={r.claims != null} />
              <td className="py-2 pl-2 pr-2.5 text-right tabular-nums">
                <span className={r.solvency != null ? 'text-ink-primary' : 'text-ink-secondary/45'}>
                  {r.solvency != null ? `${r.solvency.toFixed(2)}x` : 'n/a'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 px-1 text-[9.5px] leading-relaxed text-ink-secondary">
        Share &amp; premium on an FY24 basis (DRHP · Redseer); claims &amp; solvency FY25 (latest disclosed). Blank cells show
        <span className="text-ink-secondary/60"> n/a</span> where a source value isn&rsquo;t yet available — never inferred.
      </p>
    </div>
  )
}

// ── Section ─────────────────────────────────────────────────────────────────

type LeftView = 'trend' | 'bubble'

export function CompanySpecificAnalysis() {
  const filters = useFilters()
  const [leftView, setLeftView] = useState<LeftView>('trend')
  const model = useMemo(() => getIndustryOverview(filters, 'premium'), [filters])

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="h-3 w-[3px] rounded-full bg-champagne" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Company-Specific Analysis</span>
        <span className="text-[11px] text-ink-secondary">FY25 · Standalone health insurers</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-stretch">
        {/* LEFT — Market Share Trend (default) with a secondary Bubble map. */}
        <div className="card-surface flex min-h-[440px] min-w-0 flex-col p-4 sm:p-5">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {leftView === 'trend' ? <Activity className="h-4 w-4 text-navy-primary" /> : <CircleDot className="h-4 w-4 text-navy-primary" />}
              <p className="font-display text-[14px] text-navy-deep">
                {leftView === 'trend' ? 'Market Share Trend (SAHI)' : 'Market Share Map'}
              </p>
              <span
                className="cursor-default text-ink-secondary/60"
                title={
                  leftView === 'trend'
                    ? 'Each line is an insurer’s share of the SAHI retail-health pool, FY22–FY24 (FY25 awaited). Niva Bupa is emphasised; Star Health leads.'
                    : 'Circle size = market share. Navy ring = selected · gold ring = leader. Hover a circle for share & premium.'
                }
              >
                <Info className="h-3.5 w-3.5" />
              </span>
              {leftView === 'trend' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-champagne-soft px-1.5 py-0.5 text-[9px] font-semibold text-champagne-deep ring-1 ring-[#EAD9B6]">
                  Star Health · leader
                </span>
              )}
            </div>
            {/* Trend / Bubble toggle — Trend is the default. */}
            <div className="inline-flex overflow-hidden rounded-full border border-soft-border bg-ice/60 p-0.5">
              {(['trend', 'bubble'] as LeftView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setLeftView(v)}
                  aria-pressed={leftView === v}
                  className={[
                    'rounded-full px-2.5 py-0.5 text-[10.5px] font-medium capitalize transition-all duration-200',
                    leftView === v ? 'bg-white text-navy-deep shadow-soft' : 'text-ink-secondary hover:text-navy-primary',
                  ].join(' ')}
                >
                  {v === 'trend' ? 'Trend' : 'Bubble'}
                </button>
              ))}
            </div>
          </div>

          {leftView === 'trend' ? <MarketShareTrend /> : <MarketBubbleChart model={model} height={330} />}

          <div className="mt-auto flex justify-end pt-2">
            <SourceTag source="IRDAI + Company filing" period="FY25" confidence="high" provenance={PEER_SOURCE} />
          </div>
        </div>

        {/* RIGHT — Peer Metrics table. */}
        <div className="card-surface flex min-h-[440px] min-w-0 flex-col p-4 sm:p-5">
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            <Activity className="h-4 w-4 text-navy-primary" />
            <p className="font-display text-[14px] text-navy-deep">Peer Metrics · Standalone health insurers</p>
            <span
              className="cursor-default text-ink-secondary/60"
              title="Sorted by SAHI-pool share. Navy = selected (Niva Bupa) · gold = leader. n/a where a source value isn’t yet available."
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          </div>

          <PeerMetricsTable />

          <div className="mt-auto flex justify-end pt-2">
            <SourceTag source="IRDAI + Company filing" period="FY24–FY25" confidence="high" provenance={PEER_SOURCE} />
          </div>
        </div>
      </div>
    </section>
  )
}
