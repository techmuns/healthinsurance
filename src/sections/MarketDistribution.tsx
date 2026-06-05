import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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

interface PoolLabelProps {
  x?: number | string
  y?: number | string
  value?: number | string | null
  index?: number
}

/** Per-line label renderer: interior value dots + a clear FY-last endpoint
 *  label (share % over a colour-coded pp move). */
function makePoolLabel(color: string, lastIdx: number, pp: number | null, interior: boolean) {
  return function PoolLabel(props: PoolLabelProps): ReactNode {
    const value = typeof props.value === 'number' ? props.value : null
    const x = Number(props.x)
    const y = Number(props.y)
    if (value == null || Number.isNaN(x) || Number.isNaN(y)) return null

    if (props.index === lastIdx) {
      const ppColor = pp == null ? '#6B7280' : pp >= 0 ? color : '#C0584F'
      const ppTxt = pp == null ? 'n/a' : `${pp >= 0 ? '+' : '−'}${Math.abs(pp).toFixed(1)} pp`
      return (
        <g>
          <text x={x + 9} y={y + 1} fontSize={12.5} fontWeight={800} fill={color} textAnchor="start" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(value)}%
          </text>
          <text x={x + 9} y={y + 14} fontSize={10} fontWeight={700} fill={ppColor} textAnchor="start" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {ppTxt}
          </text>
        </g>
      )
    }
    if (!interior) return null
    return (
      <text x={x} y={y - 9} fontSize={10} fontWeight={600} fill={color} textAnchor="middle" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value.toFixed(1)}%
      </text>
    )
  }
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
        <div className="min-h-[280px] flex-1" style={{ width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 14, right: 64, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F7" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: '#EEF1F7' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#6B7280' }}
                tickLine={false}
                axisLine={{ stroke: '#EEF1F7' }}
                width={50}
                domain={[lo, hi]}
                unit="%"
                label={{ value: 'Share of GI Premium (%)', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#9AA3B2', textAnchor: 'middle' }, dy: 70 }}
              />
              <Tooltip cursor={{ stroke: '#C4CCD6', strokeWidth: 1 }} content={<PoolTooltip />} />
              {POOL_SERIES.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.key}
                  stroke={s.color}
                  strokeWidth={s.width}
                  dot={{ r: 3, fill: s.color, stroke: '#fff', strokeWidth: 1.2 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  isAnimationActive={false}
                >
                  <LabelList dataKey={s.key} content={makePoolLabel(s.color, lastIdx, ppOf(s.key), s.interior)} />
                </Line>
              ))}
            </LineChart>
          </ResponsiveContainer>
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
