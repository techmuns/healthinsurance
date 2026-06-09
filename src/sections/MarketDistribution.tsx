import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { giPremiumMix } from '@/data/mockData'
import { useActiveCompany, useFilters, useRangeClip } from '@/state/filters'
import { usePeriodGate } from '@/lib/usePeriodGate'
import { fyLabelsInRange } from '@/lib/dateRange'
import { getCompanyDistributionData, type DistChannel } from '@/lib/distributionEngine'
import { EmptyState } from '@/components/EmptyState'
import { SourceTag } from '@/components/SourceTag'

/**
 * Market & Distribution — the Channel Mix surface: the active company's GWP by
 * channel as a smooth 100% stacked-area mix over time. It reads the global
 * header's Data Range + Company, and every figure is derived from real,
 * source-backed series — never hardcoded.
 *
 * (The GI "Pool Shift" trend card now lives on the Executive Overview page; it
 * is still defined and exported from this file and imported there.)
 */
export function MarketDistribution() {
  return (
    <div className="grid grid-cols-1 gap-6">
      <ChannelMixCard />
    </div>
  )
}

// ─── shared helpers ──────────────────────────────────────────────────────────

function numOrNull(v: number | string | null | undefined): number | null {
  return typeof v === 'number' ? v : null
}

/** Tracks a flex child's pixel width so an SVG can lay out in real pixels. */
function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Catmull-Rom → cubic-bézier through the points (cursor already at pts[0]). */
function curveThrough(pts: { x: number; y: number }[]): string {
  let d = ''
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += `C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} `
  }
  return d
}

/** Subtle one-line insight rail shared by both cards. `tone="premium"` gives a
 *  soft warm-gold tint for the Channel Mix card. */
function InsightLine({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'premium' }) {
  const cls =
    tone === 'premium'
      ? 'border-[#EAD49A] bg-[#FFF8EA] text-[#8A6A1E]'
      : 'border-[rgba(23,43,77,0.06)] bg-[#FAFBFD] text-ink-secondary'
  return (
    <p className={`mt-3 rounded-lg border px-3 py-2 text-[11.5px] leading-snug ${cls}`}>
      {children}
    </p>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  LEFT CARD — Pool Shift (multi-line trend)
// ═══════════════════════════════════════════════════════════════════════════

const POOL_SOURCE = {
  source: 'Derived from IRDAI' as const,
  confidence: 'medium' as const,
  provenance: {
    source_name:
      'IRDAI flash figures (re-aggregated by CareRatings Non-Life Insurance Update, March 2025). Direct IRDAI handbook parse pending.',
    source_url:
      'https://www.careratings.com/uploads/newsfiles/1745386639_Non-Life%20Insurance%20Update%20for%20March%202025.pdf',
    fetched_at: '2026-05-28',
  },
}

type PoolKey = 'Health' | 'Motor' | 'Others'

// Colour psychology: Health = teal (growth/positive, most prominent), Motor =
// deep navy (stable core), Others = muted slate (neutral / ceding share).
const POOL_SERIES: { key: PoolKey; color: string; width: number; interior: boolean }[] = [
  { key: 'Others', color: '#9AA6B4', width: 1.8, interior: false },
  { key: 'Motor', color: '#27457E', width: 2.2, interior: false },
  { key: 'Health', color: '#168E8E', width: 3, interior: true },
]

// Soft area + line mini-sparkline of a segment's share across the shown years.
function PoolSpark({ values, color }: { values: (number | null)[]; color: string }) {
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null)
  if (pts.length < 2) return null
  const w = 78
  const h = 30
  const xs = values.length - 1 || 1
  const min = Math.min(...pts.map((p) => p.v))
  const max = Math.max(...pts.map((p) => p.v))
  const span = max - min || 1
  const xy = (p: { v: number; i: number }) => ({ x: (p.i / xs) * w, y: h - 3 - ((p.v - min) / span) * (h - 8) })
  const line = pts.map((p, k) => `${k ? 'L' : 'M'}${xy(p).x.toFixed(1)} ${xy(p).y.toFixed(1)}`).join(' ')
  const last = xy(pts[pts.length - 1])
  const area = `${line} L ${last.x.toFixed(1)} ${h} L ${xy(pts[0]).x.toFixed(1)} ${h} Z`
  const id = `psk-${color.replace('#', '')}`
  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={2.1} fill={color} />
    </svg>
  )
}

// Key-metric card for one segment — latest share, the pp move over the span, a
// direction tag (Gaining / Holding / Ceding) and a sparkline.
function PoolMetricCard({
  name,
  color,
  latest,
  delta,
  values,
  spanLabel,
}: {
  name: string
  color: string
  latest: number | null
  delta: number | null
  values: (number | null)[]
  spanLabel: string
}) {
  const tone = delta == null ? 'flat' : delta >= 2 ? 'up' : delta <= -2 ? 'down' : 'flat'
  const Icon = tone === 'up' ? ArrowUpRight : tone === 'down' ? ArrowDownRight : ArrowRight
  const tag = tone === 'up' ? 'Gaining' : tone === 'down' ? 'Ceding' : 'Holding'
  const tagCls =
    tone === 'up'
      ? 'bg-teal-soft text-teal ring-[#BFE3E1]'
      : tone === 'down'
        ? 'bg-[#FBEDEA] text-[#C0584F] ring-[#F0D2CC]'
        : 'bg-soft-blue text-navy-primary ring-[#D6E2FA]'
  const deltaCls = tone === 'down' ? 'text-[#C0584F]' : tone === 'up' ? 'text-teal' : 'text-navy-primary'

  return (
    <div
      className="surface-soft relative flex flex-col justify-between overflow-hidden rounded-xl p-3 lg:flex-1"
      style={{ background: `linear-gradient(135deg, ${color}0F 0%, transparent 62%)` }}
    >
      <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: color }} />
      <div className="flex items-center justify-between gap-2 pl-1.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <p className="font-display text-[12.5px] leading-none text-navy-deep">{name}</p>
        </div>
        <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold ring-1 ${tagCls}`}>
          <Icon className="h-2.5 w-2.5" strokeWidth={2.6} />
          {tag}
        </span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2 pl-1.5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[19px] font-semibold leading-none tabular-nums text-navy-deep">
              {latest != null ? `${latest.toFixed(1)}%` : 'n/a'}
            </span>
            {delta != null && (
              <span className={`text-[11px] font-semibold tabular-nums ${deltaCls}`}>
                {`${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)} pp`}
              </span>
            )}
          </div>
          <p className="mt-1 text-[8px] uppercase tracking-wide text-ink-secondary/80">{spanLabel}</p>
        </div>
        <PoolSpark values={values} color={color} />
      </div>
    </div>
  )
}

function PoolTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => typeof p.value === 'number')
  if (!rows.length) return null
  return (
    <div className="rounded-xl border border-[#E5E8EF] bg-white/96 px-3 py-2 shadow-[0_8px_22px_rgba(23,43,77,0.1)] backdrop-blur">
      <p className="mb-1 text-[11px] font-semibold text-navy-deep">{label}</p>
      <div className="space-y-0.5">
        {rows.map((p) => (
          <div key={p.name} className="flex items-center gap-2 text-[11.5px]">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="text-ink-secondary">{p.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-navy-deep">{p.value.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PoolShiftCard() {
  const gate = usePeriodGate()
  const { data: rows } = useRangeClip(giPremiumMix)
  const lastIdx = rows.length - 1
  const first = rows[0]
  const last = rows[lastIdx]
  const span = rows.length ? `${rows[0].label} → ${rows[lastIdx].label}` : '—'

  const ppOf = (k: PoolKey): number | null => {
    const a = numOrNull(first?.[k])
    const b = numOrNull(last?.[k])
    return a == null || b == null ? null : Math.round((b - a) * 10) / 10
  }

  // Y domain from the values actually in range, so the trend fills the card.
  const vals = rows.flatMap((r) => POOL_SERIES.map((s) => numOrNull(r[s.key])).filter((v): v is number => v != null))
  const lo = vals.length ? Math.floor(Math.min(...vals) - 4) : 0
  const hi = vals.length ? Math.ceil(Math.max(...vals) + 5) : 100

  const healthPp = ppOf('Health')
  // Largest ceder of share over the span — for an honest one-line insight.
  const cederName = (['Motor', 'Others'] as PoolKey[])
    .map((k) => ({ k, pp: ppOf(k) ?? 0 }))
    .sort((a, b) => a.pp - b.pp)[0]?.k

  // Clean markers — hollow mid-points, a stronger filled dot on the latest year.
  const makeDot = (color: string) => (p: { cx?: number; cy?: number; index?: number; value?: number | null }) => {
    const cx = Number(p.cx)
    const cy = Number(p.cy)
    if (p.value == null || Number.isNaN(cx) || Number.isNaN(cy)) return <g key={p.index} />
    const isLast = p.index === lastIdx
    return (
      <circle
        key={p.index}
        cx={cx}
        cy={cy}
        r={isLast ? 4.6 : 2.8}
        fill={isLast ? color : '#fff'}
        stroke={color}
        strokeWidth={1.6}
      />
    )
  }

  return (
    <section className="card-surface flex h-full flex-col p-5 sm:p-6">
      <header className="mb-4 border-b border-[#EEF1F7] pb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">Pool Shift</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <h2 className="font-display text-[20px] leading-tight text-navy-deep">
            Where is the GI premium pool shifting?
          </h2>
          <span className="inline-flex items-center rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-semibold text-teal ring-1 ring-[#BFE3E1]">
            Health gaining share
          </span>
        </div>
        <p className="mt-1 text-[12px] text-ink-secondary">Health · Motor · Others · {span}</p>
      </header>

      {!gate.ok ? (
        <EmptyState
          title="Data unavailable for this period"
          body={gate.reason ?? 'Switch the period toggle to Annual to see the GI pool shift.'}
          height={264}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Data not available from source"
          body="No reported years fall inside the selected Data Range. Widen the range in the top bar."
          height={264}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-stretch">
          {/* Enhanced trend — soft teal area under the rising Health line. */}
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 14, right: 16, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="poolHealthArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#168E8E" stopOpacity={0.16} />
                    <stop offset="95%" stopColor="#168E8E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F7" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: '#EEF1F7' }} />
                <YAxis
                  tick={{ fontSize: 10.5, fill: '#9AA3B2' }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  domain={[lo, hi]}
                  unit="%"
                />
                <Tooltip cursor={{ stroke: '#C4CCD6', strokeWidth: 1 }} content={<PoolTooltip />} />
                <Line type="monotone" dataKey="Others" name="Others" stroke="#9AA6B4" strokeWidth={1.8} dot={makeDot('#9AA6B4')} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="Motor" name="Motor" stroke="#27457E" strokeWidth={2.2} dot={makeDot('#27457E')} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="Health" name="Health" stroke="#168E8E" strokeWidth={3} fill="url(#poolHealthArea)" dot={makeDot('#168E8E')} activeDot={{ r: 5.5 }} connectNulls={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Key-metric cards — Health gaining, Motor holding, Others ceding. */}
          <div className="grid grid-cols-3 gap-2.5 lg:flex lg:flex-col">
            {(['Health', 'Motor', 'Others'] as PoolKey[]).map((k) => {
              const meta = POOL_SERIES.find((s) => s.key === k)!
              return (
                <PoolMetricCard
                  key={k}
                  name={k}
                  color={meta.color}
                  latest={numOrNull(last?.[k])}
                  delta={ppOf(k)}
                  values={rows.map((r) => numOrNull(r[k]))}
                  spanLabel={span}
                />
              )
            })}
          </div>
        </div>
      )}

      {rows.length > 0 && healthPp != null && (
        <InsightLine>
          Health premium share increased by <strong className="font-semibold text-teal">{healthPp.toFixed(1)} pp</strong>, mainly at the cost of {cederName}.
        </InsightLine>
      )}

      <div className="mt-3 flex justify-end">
        <SourceTag source={POOL_SOURCE.source} confidence={POOL_SOURCE.confidence} provenance={POOL_SOURCE.provenance} period={span} />
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  RIGHT CARD — Channel Mix (100% stacked area)
// ═══════════════════════════════════════════════════════════════════════════

const DIST_SOURCE = {
  source: 'Company filing' as const,
  confidence: 'medium' as const,
  provenance: {
    source_name: 'Niva Bupa channel mix from FY25 RHP / annual report; peer values from public disclosures',
    source_url: 'https://transactions.nivabupa.com/pages/doc/pub-dis/annual-reports/Annual-Report-FY-2024-25.pdf',
    fetched_at: '2026-05-28',
  },
}

// Stack order bottom → top. Refined, theme-aligned palette: navy agency base ·
// teal broker/health growth · powder-blue banca · muted gold corporate agents ·
// slate direct · mist others. Soft but clear — used at gentle per-band opacity
// so the stack reads as layered premium tints, never harsh or muddy.
const CH_ORDER: DistChannel[] = ['Agents', 'Brokers', 'Banca', 'Corporate Agents', 'Direct', 'Others']
const CH_SOLID: Record<DistChannel, string> = {
  Agents: '#244C86',
  Brokers: '#2AA39A',
  Banca: '#6F93DC',
  'Corporate Agents': '#D6A84A',
  Direct: '#9EAABD',
  Others: '#E6EBF2',
}
const CH_OPACITY: Record<DistChannel, number> = {
  Agents: 0.86,
  Brokers: 0.82,
  Banca: 0.78,
  'Corporate Agents': 0.78,
  Direct: 0.7,
  Others: 0.65,
}
// White labels on the dark navy/teal bands; deep-navy labels on the lighter
// powder-blue / gold / slate / mist bands. Readable, never harsh.
const CH_DARKBAND: Record<DistChannel, boolean> = {
  Agents: true,
  Brokers: true,
  Banca: false,
  'Corporate Agents': false,
  Direct: false,
  Others: false,
}

type MixRow = { period: string } & Partial<Record<DistChannel, number>>

function StackedArea({ rows, hovered }: { rows: MixRow[]; hovered: DistChannel | null }) {
  const [ref, w] = useElementWidth()
  const H = 300
  const padL = 8
  const padR = 74
  const padT = 12
  const padB = 26
  const plotW = Math.max(0, w - padL - padR)
  const plotH = H - padT - padB
  const n = rows.length
  const xOf = (i: number) => (n <= 1 ? padL + plotW / 2 : padL + (plotW * i) / (n - 1))
  const yOf = (pct: number) => padT + plotH * (1 - pct / 100)

  // Channels actually carrying data in range, in stack order.
  const channels = CH_ORDER.filter((ch) => rows.some((r) => typeof r[ch] === 'number'))

  // Per-point normalised cumulative top/bottom (as a % of the column total).
  const topPct: Record<string, number[]> = {}
  const botPct: Record<string, number[]> = {}
  channels.forEach((ch) => {
    topPct[ch] = []
    botPct[ch] = []
  })
  rows.forEach((r, i) => {
    const total = channels.reduce((s, ch) => s + (numOrNull(r[ch]) ?? 0), 0) || 1
    let acc = 0
    channels.forEach((ch) => {
      const v = ((numOrNull(r[ch]) ?? 0) / total) * 100
      botPct[ch][i] = acc
      acc += v
      topPct[ch][i] = acc
    })
  })

  const bandPath = (ch: DistChannel) => {
    const tp = rows.map((_, i) => ({ x: xOf(i), y: yOf(topPct[ch][i]) }))
    const bp = rows.map((_, i) => ({ x: xOf(i), y: yOf(botPct[ch][i]) }))
    return `M ${tp[0].x.toFixed(1)} ${tp[0].y.toFixed(1)} ${curveThrough(tp)}L ${bp[n - 1].x.toFixed(1)} ${bp[n - 1].y.toFixed(1)} ${curveThrough(bp.slice().reverse())}Z`
  }

  const last = rows[n - 1]
  const totLast = channels.reduce((s, ch) => s + (numOrNull(last?.[ch]) ?? 0), 0) || 1

  return (
    <div ref={ref} className="w-full" style={{ height: H }}>
      {w > 0 && n >= 2 && (
        <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className="overflow-visible">
          {/* very soft plot-area tint behind the translucent bands */}
          <rect x={padL} y={padT} width={plotW} height={plotH} rx={6} fill="#FAFBFD" />

          {/* x-axis year labels */}
          {rows.map((r, i) => (
            <text key={`x-${r.period}`} x={xOf(i)} y={H - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill="#6B7280">
              {r.period}
            </text>
          ))}

          {/* stacked bands */}
          {channels.map((ch) => {
            const dim = hovered != null && hovered !== ch
            return (
              <path
                key={ch}
                d={bandPath(ch)}
                fill={CH_SOLID[ch]}
                fillOpacity={dim ? 0.28 : CH_OPACITY[ch]}
                stroke="#FFFFFF"
                strokeOpacity={0.55}
                strokeWidth={1}
                style={{ transition: 'fill-opacity 0.25s ease' }}
              >
                <title>{`${ch} · ${last ? (((numOrNull(last[ch]) ?? 0) / totLast) * 100).toFixed(1) : '—'}%`}</title>
              </path>
            )
          })}

          {/* in-band % labels at interior years where the band is tall enough */}
          {channels.map((ch) =>
            rows.slice(0, n - 1).map((r, i) => {
              const th = yOf(botPct[ch][i]) - yOf(topPct[ch][i])
              if (th < 20) return null
              const cy = (yOf(topPct[ch][i]) + yOf(botPct[ch][i])) / 2 + 3.5
              const total = channels.reduce((s, c) => s + (numOrNull(r[c]) ?? 0), 0) || 1
              const pct = ((numOrNull(r[ch]) ?? 0) / total) * 100
              return (
                <text
                  key={`il-${ch}-${i}`}
                  x={i === 0 ? xOf(i) + 2 : xOf(i)}
                  y={cy}
                  textAnchor={i === 0 ? 'start' : 'middle'}
                  fontSize={10.5}
                  fontWeight={600}
                  fill={CH_DARKBAND[ch] ? '#FFFFFF' : '#24416E'}
                  opacity={hovered != null && hovered !== ch ? 0.3 : 1}
                  style={{ fontVariantNumeric: 'tabular-nums', transition: 'opacity 0.25s ease' }}
                >
                  {pct.toFixed(0)}%
                </text>
              )
            }),
          )}

          {/* FY-last endpoint labels on the right edge */}
          {channels.map((ch) => {
            const pct = ((numOrNull(last?.[ch]) ?? 0) / totLast) * 100
            if (pct < 1.5) return null
            const cy = (yOf(botPct[ch][n - 1]) + yOf(topPct[ch][n - 1])) / 2
            const dim = hovered != null && hovered !== ch
            return (
              <g key={`end-${ch}`} opacity={dim ? 0.35 : 1} style={{ transition: 'opacity 0.25s ease' }}>
                <circle cx={xOf(n - 1) + 12} cy={cy} r={3} fill={CH_SOLID[ch]} />
                <text x={xOf(n - 1) + 20} y={cy - 2} fontSize={10.5} fontWeight={700} fill="#26303F" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {pct.toFixed(1)}%
                </text>
                <text x={xOf(n - 1) + 20} y={cy + 9} fontSize={8.5} fontWeight={600} fill="#8C97A8">
                  {ch}
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

function ChannelMixCard() {
  const company = useActiveCompany()
  const { range } = useFilters()
  const gate = usePeriodGate()
  const [hovered, setHovered] = useState<DistChannel | null>(null)

  const data = getCompanyDistributionData(company.id)
  const yearsInRange = fyLabelsInRange(range)
  const byPeriod = new Map((data?.mix ?? []).filter((r) => /^FY\d{2}$/.test(r.period)).map((r) => [r.period as string, r] as const))
  const rows: MixRow[] = data ? yearsInRange.filter((fy) => byPeriod.has(fy)).map((fy) => byPeriod.get(fy)!) : []
  const span = rows.length ? (rows.length === 1 ? rows[0].period : `${rows[0].period} → ${rows[rows.length - 1].period}`) : 'selected range'

  // Channels present, ordered for the legend by stack order.
  const channels = CH_ORDER.filter((ch) => rows.some((r) => typeof r[ch] === 'number'))

  // Honest, data-driven chip + insight: the channel that gained the most share
  // over the span is THE growth lever (Brokers for Niva Bupa, not Banca).
  const first = rows[0]
  const last = rows[rows.length - 1]
  const lever = channels
    .map((ch) => ({ ch, gain: (numOrNull(last?.[ch]) ?? 0) - (numOrNull(first?.[ch]) ?? 0), latest: numOrNull(last?.[ch]) ?? 0 }))
    .sort((a, b) => b.gain - a.gain)[0]

  return (
    <section className="card-surface flex h-full flex-col p-5 sm:p-6">
      <header className="mb-4 border-b border-[#EEF1F7] pb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">Channel Mix</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <h2 className="font-display text-[20px] leading-tight text-navy-deep">{company.shortName} channel mix over time</h2>
          {lever && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#EAF7F5', color: '#227C76', boxShadow: 'inset 0 0 0 1px #B8DEDA' }}>
              {lever.ch}: growth lever
            </span>
          )}
        </div>
        <p className="mt-1 text-[12px] text-ink-secondary">Share of GWP by channel · {span}</p>
      </header>

      {!gate.ok ? (
        <EmptyState
          title="Distribution data unavailable for this period"
          body={gate.reason ?? 'Channel mix is captured annually — switch the period toggle to Annual.'}
          height={300}
        />
      ) : !data ? (
        <EmptyState
          title={`Channel mix not wired for ${company.shortName}`}
          body="Add source-backed channel-mix data for this insurer to activate the chart."
          height={300}
        />
      ) : rows.length < 2 ? (
        <EmptyState
          title="Data not available from source"
          body={`At least two channel-mix years are needed for ${company.shortName} inside the selected Data Range — widen it in the top bar (mix is reported FY22–FY25).`}
          height={300}
        />
      ) : (
        <>
          {/* legend — small clean pills above the chart */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {channels.map((ch) => (
              <span
                key={ch}
                onMouseEnter={() => setHovered(ch)}
                onMouseLeave={() => setHovered(null)}
                className="inline-flex cursor-default items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium text-ink-secondary transition-all"
                style={{
                  background: `${CH_SOLID[ch]}${hovered === ch ? '22' : '12'}`,
                  borderColor: `${CH_SOLID[ch]}${hovered === ch ? '55' : '2E'}`,
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: CH_SOLID[ch] }} />
                {ch}
              </span>
            ))}
          </div>

          <StackedArea rows={rows} hovered={hovered} />
        </>
      )}

      {rows.length >= 2 && lever && (
        <InsightLine tone="premium">
          <strong className="font-semibold text-navy-deep">{lever.ch}</strong> share rose to{' '}
          <strong className="font-semibold" style={{ color: '#B7831F' }}>{lever.latest.toFixed(1)}%</strong> in {last?.period}, the key driver of channel growth.
        </InsightLine>
      )}

      <div className="mt-3 flex justify-end">
        <SourceTag source={DIST_SOURCE.source} confidence={DIST_SOURCE.confidence} provenance={DIST_SOURCE.provenance} period={last?.period ?? span} />
      </div>
    </section>
  )
}
