import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, Info, Landmark, Minus, ShieldCheck, TrendingDown, TrendingUp, Users, Waves } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ModuleCard } from '@/components/ModuleCard'
import { LockedPanel } from '@/components/LockedPanel'
import { DataEmptyState } from '@/components/DataEmptyState'
import { VerdictStrip } from '@/components/VerdictStrip'
import { useActiveCompany, useFilters } from '@/state/filters'
import { getCompanyMaster, getOwnershipData, getBulkBlockDeals, getNamedHolders, type BulkBlockDeal } from '@/lib/dataLayer'
import {
  getOwnershipTrendView,
  groupInsight,
  institutionalInsight,
  shareholderInsight,
  TREND_GROUPS,
  type OwnershipTrendView,
} from '@/lib/ownershipTrend'
import type { OwnershipHolderGroup } from '@/data/snapshots/_schemas'
import { sourceHref } from '@/lib/sourceHealth'

// ── Bulk / block deal formatting + signal chart ─────────────────────────────
const dealQty = (q: number): string =>
  q >= 1e7 ? `${(q / 1e7).toFixed(2)} Cr` : q >= 1e5 ? `${(q / 1e5).toFixed(1)} L` : q.toLocaleString('en-IN')
const dealDate = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
const dealDateShort = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
// ₹ Cr value of one trade (shares × price) — the unit the timeline plots: buys
// rise above the zero line, sells dip below it, on one shared axis.
const crOf = (q: number, p: number): number => (q * p) / 1e7
const fmtCr = (v: number): string => {
  const a = Math.abs(v)
  return `₹${a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2)} Cr`
}

// Buy = soft green/teal (accumulation); Sell = soft red/coral (distribution) —
// the dashboard's established positive / negative tone pair.
const DEAL_BUY = '#168E8E'
const DEAL_SELL = '#C75D54'
const DEAL_GRID = '#ECEFF5'
const DEAL_AXIS = '#6B7280'
const DEAL_ZERO = '#AEB7C4'

interface DealBar {
  i: string
  xLabel: string // date, printed once per day-group to keep the axis uncluttered
  date: string
  client: string
  side: 'buy' | 'sell'
  quantity: number
  price: number
  cr: number // signed ₹ Cr — buy positive, sell negative — i.e. the bar height
}

// Smallest "nice" round number ≥ v, for a tight, symmetric ₹ Cr axis.
function niceCeil(v: number): number {
  if (!(v > 0)) return 1
  const order = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (m * order >= v - 1e-9) return m * order
  }
  return 10 * order
}

// Diverging bar with only its OUTER edge rounded — buys round at the top, sells
// round at the bottom — so every bar meets the zero line with a clean square.
function DealSignalBar({ x = 0, y = 0, width = 0, height = 0, payload }: { x?: number; y?: number; width?: number; height?: number; payload?: DealBar }) {
  if (!payload || width <= 0 || height === 0) return null
  const top = height < 0 ? y + height : y
  const h = Math.abs(height)
  const buy = payload.side === 'buy'
  const fill = buy ? DEAL_BUY : DEAL_SELL
  const r = Math.max(0, Math.min(3, width / 2, h))
  const d = buy
    ? `M${x},${top + h} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + width - r},${top} Q${x + width},${top} ${x + width},${top + r} L${x + width},${top + h} Z`
    : `M${x},${top} L${x},${top + h - r} Q${x},${top + h} ${x + r},${top + h} L${x + width - r},${top + h} Q${x + width},${top + h} ${x + width},${top + h - r} L${x + width},${top} Z`
  return <path d={d} fill={fill} />
}

// Hover card — the full trade behind a bar: side, party, date, qty × price, ₹ Cr.
function DealTooltip({ active, payload }: { active?: boolean; payload?: { payload: DealBar }[] }) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  const buy = d.side === 'buy'
  return (
    <div className="max-w-[230px] rounded-xl border border-[#E5E8EF] bg-white/96 px-3 py-2 shadow-[0_8px_22px_rgba(23,43,77,0.1)] backdrop-blur">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className={['inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide', buy ? 'bg-teal-soft text-teal' : 'bg-coral-soft text-coral'].join(' ')}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: buy ? DEAL_BUY : DEAL_SELL }} />
          {buy ? 'Buy' : 'Sell'}
        </span>
        <span className="text-[10.5px] font-medium text-ink-secondary">{dealDate(d.date)}</span>
      </div>
      <p className="mb-1 text-[11.5px] font-semibold leading-snug text-navy-deep">{d.client}</p>
      <div className="flex items-center justify-between gap-3 text-[11px] text-ink-secondary">
        <span className="tabular-nums">{dealQty(d.quantity)} sh @ ₹{d.price.toFixed(1)}</span>
        <span className="font-semibold tabular-nums" style={{ color: buy ? DEAL_BUY : DEAL_SELL }}>{fmtCr(d.cr)}</span>
      </div>
    </div>
  )
}

// The two exchange deal segments. Kept strictly separate — never silently mixed.
const DEAL_SEGMENTS: { id: 'bulk' | 'block'; label: string }[] = [
  { id: 'bulk', label: 'Bulk Deals' },
  { id: 'block', label: 'Block Deals' },
]
// Muted segment chips — slate for bulk, soft champagne for block.
const SEG_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  bulk: { label: 'Bulk', bg: '#EEF1F7', fg: '#41557A' },
  block: { label: 'Block', bg: '#F5EEDD', fg: '#8A6A2B' },
}

/** Real exchange-reported bulk/block deals. Bulk and block are split into their
 *  own tabs (never mixed); each tab drives the buy/sell signal chart, the net-flow
 *  footer and a visible audit table of every trade behind it. All of it derives
 *  from `deals`, so newly-pulled trades render automatically. Per-company. */
function BulkBlockTimeline({ deals, companyName, sourceName, sourceUrl, lastUpdated }: { deals: BulkBlockDeal[]; companyName: string; sourceName: string; sourceUrl: string; lastUpdated: string | null }) {
  // How many trades sit in each segment — drives the tab counts + the default.
  const counts = useMemo(() => {
    const c: Record<string, number> = { bulk: 0, block: 0 }
    for (const d of deals) c[d.deal_kind] = (c[d.deal_kind] ?? 0) + 1
    return c
  }, [deals])
  // Default to the segment that actually has data, preferring Bulk — never force
  // an empty Bulk tab when only Block deals exist (or vice-versa).
  const [segment, setSegment] = useState<'bulk' | 'block'>(counts.bulk === 0 && counts.block > 0 ? 'block' : 'bulk')

  const segDeals = deals.filter((d) => d.deal_kind === segment)
  const buyCr = segDeals.filter((d) => d.side === 'buy').reduce((s, d) => s + crOf(d.quantity, d.price), 0)
  const sellCr = segDeals.filter((d) => d.side === 'sell').reduce((s, d) => s + crOf(d.quantity, d.price), 0)
  const netCr = buyCr - sellCr
  const netBought = netCr >= 0

  // One bar per trade, oldest → newest (left → right) so it reads like a signal
  // tape. `deals` arrives newest-first from the data layer; reverse for display
  // only — the data logic is untouched. Date label prints once per day-group.
  const chrono = [...segDeals].reverse()
  const bars: DealBar[] = chrono.map((d, idx) => ({
    i: String(idx),
    xLabel: idx > 0 && chrono[idx - 1].date === d.date ? '' : dealDateShort(d.date),
    date: d.date,
    client: d.client,
    side: d.side,
    quantity: d.quantity,
    price: d.price,
    cr: (d.side === 'buy' ? 1 : -1) * crOf(d.quantity, d.price),
  }))
  const dates = [...new Set(segDeals.map((d) => d.date))]
  const oneDate = segDeals.length > 0 && dates.length === 1
  const m = niceCeil(Math.max(...bars.map((b) => Math.abs(b.cr)), 1))
  const tick = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1))

  const DealTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) => (
    <text x={x ?? 0} y={(y ?? 0) + 12} textAnchor="middle" fontSize={10} fontWeight={600} fill="#26303F">
      {payload?.value ?? ''}
    </text>
  )

  return (
    <div className="card-surface card-tint-slate p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Bulk / Block Deal Timeline</p>
          <p className="mt-0.5 truncate text-[11px] text-ink-secondary">{companyName} · exchange-reported large trades</p>
        </div>
        <a href={sourceHref(sourceUrl) ?? sourceUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-navy-primary hover:underline" title={sourceName}>
          NSE / BSE <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>

      {/* Honest scope note — bulk/block deals are transaction disclosures, not the
          quarter-end shareholding pattern that drives the trend above. */}
      <p className="mb-2.5 flex items-start gap-1.5 rounded-lg bg-ice/60 px-2.5 py-1.5 text-[10.5px] leading-snug text-ink-secondary ring-1 ring-soft-border">
        <Info className="mt-px h-3 w-3 shrink-0 text-navy-primary/70" />
        Bulk / block deals are individual transaction disclosures and may not equal the quarter-end shareholding-pattern movement shown in the Ownership Trend above.
      </p>

      {/* Segment tabs — bulk and block, each with its trade count, never mixed. */}
      <div className="mb-2.5 inline-flex rounded-lg border border-soft-border bg-ice/40 p-0.5">
        {DEAL_SEGMENTS.map(({ id, label }) => {
          const on = id === segment
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSegment(id)}
              aria-pressed={on}
              className={['inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11px] font-semibold transition-colors', on ? 'bg-white text-navy-deep shadow-soft' : 'text-ink-secondary hover:text-navy-primary'].join(' ')}
            >
              {label}
              <span className={['rounded-full px-1.5 text-[9px] font-bold tabular-nums', on ? 'bg-ice text-ink-secondary' : 'bg-white/60 text-ink-secondary/80'].join(' ')}>{counts[id]}</span>
            </button>
          )
        })}
      </div>

      {segDeals.length === 0 ? (
        <DataEmptyState
          kind="pending"
          height={92}
          title={`No ${segment} deals on record`}
          body={`No exchange-reported ${segment} deals for ${companyName} in the current dataset.${segment === 'block' && counts.bulk > 0 ? ' Bulk-deal activity is in the Bulk Deals tab.' : ' They appear here automatically once the feed reports one.'}`}
        />
      ) : (
        <>
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full bg-teal-soft px-2 py-0.5 font-semibold text-teal">Bought {fmtCr(buyCr)}</span>
            <span className="rounded-full bg-coral-soft px-2 py-0.5 font-semibold text-coral">Sold {fmtCr(sellCr)}</span>
            <span className="text-ink-secondary">· {segDeals.length} {SEG_BADGE[segment].label.toLowerCase()} trade{segDeals.length === 1 ? '' : 's'} on record</span>
          </div>
          <p className="mb-2 text-[10px] leading-snug text-ink-secondary/80">
            Reported only on large trades — buys rise above the line, sells dip below, ₹ Cr per trade{lastUpdated ? `. Checked ${dealDate(lastUpdated)}` : ''}. New deals appear here automatically.
          </p>

          {/* Honest data-coverage note — only when the segment truly has one date. */}
          {oneDate && (
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-ice/70 px-2.5 py-1 text-[10.5px] text-ink-secondary ring-1 ring-soft-border">
              <Info className="h-3 w-3 shrink-0 text-ink-secondary" />
              Only one deal date available in current dataset ({dealDate(dates[0])}).
            </p>
          )}

          <div className="w-full" style={{ height: 224 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars} margin={{ top: 6, right: 6, left: 2, bottom: 4 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke={DEAL_GRID} strokeDasharray="2 4" />
                <XAxis dataKey="xLabel" tickLine={false} axisLine={false} tick={<DealTick />} height={22} interval={0} />
                <YAxis
                  domain={[-m, m]}
                  ticks={[-m, -m / 2, 0, m / 2, m]}
                  tickFormatter={tick}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: DEAL_AXIS }}
                  width={34}
                />
                <Tooltip cursor={{ fill: 'rgba(39,69,126,0.05)' }} content={<DealTooltip />} />
                <ReferenceLine y={0} stroke={DEAL_ZERO} strokeWidth={1.25} />
                <Bar dataKey="cr" maxBarSize={26} shape={<DealSignalBar />} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Net-flow summary — auto-calculated from the same segment's deals. */}
          <div className="mt-2 grid grid-cols-3 gap-2 border-t border-soft-border pt-2.5">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Total bought</p>
              <p className="text-[13px] font-bold tabular-nums" style={{ color: DEAL_BUY }}>{fmtCr(buyCr)}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Total sold</p>
              <p className="text-[13px] font-bold tabular-nums" style={{ color: DEAL_SELL }}>{fmtCr(sellCr)}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Net flow</p>
              <p className="text-[13px] font-bold tabular-nums" style={{ color: netBought ? DEAL_BUY : DEAL_SELL }}>
                {netBought ? '+' : '−'}{fmtCr(netCr)}
                <span className="ml-1 text-[9px] font-semibold uppercase tracking-wide">{netBought ? 'net bought' : 'net sold'}</span>
              </p>
            </div>
          </div>

          {/* Visible audit table — every trade behind the chart, to verify it. The
              chart, chips and net-flow all read the same rows, so it stays in sync. */}
          <div className="mt-3">
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-secondary">Every {SEG_BADGE[segment].label.toLowerCase()} deal on record · audit view</p>
            <div className="overflow-hidden rounded-xl border border-soft-border">
              <div className="max-h-[300px] overflow-y-auto scroll-thin">
                <table className="w-full border-collapse text-[11px]">
                  <thead className="sticky top-0 bg-ice/95 backdrop-blur">
                    <tr className="text-[8.5px] uppercase tracking-[0.05em] text-ink-secondary">
                      <th className="px-2.5 py-1.5 text-left font-bold">Date</th>
                      <th className="px-2 py-1.5 text-left font-bold">Segment</th>
                      <th className="px-2 py-1.5 text-left font-bold">Buyer</th>
                      <th className="px-2 py-1.5 text-left font-bold">Seller</th>
                      <th className="px-2 py-1.5 text-right font-bold">Quantity</th>
                      <th className="px-2 py-1.5 text-right font-bold">Price</th>
                      <th className="px-2 py-1.5 text-right font-bold">Value</th>
                      <th className="px-2.5 py-1.5 text-left font-bold">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segDeals.map((d, i) => {
                      const buy = d.side === 'buy'
                      const badge = SEG_BADGE[d.deal_kind] ?? SEG_BADGE.bulk
                      const cp = <span className="text-ink-secondary/50" title="Counterparty not disclosed in exchange data">—</span>
                      return (
                        <tr key={i} className="border-t border-soft-border/70 align-top">
                          <td className="whitespace-nowrap px-2.5 py-1.5 font-medium text-navy-deep">{dealDate(d.date)}</td>
                          <td className="px-2 py-1.5"><span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: badge.bg, color: badge.fg }}>{badge.label}</span></td>
                          <td className="px-2 py-1.5">{buy ? <span className="font-medium text-teal">{d.client}</span> : cp}</td>
                          <td className="px-2 py-1.5">{buy ? cp : <span className="font-medium text-coral">{d.client}</span>}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-ink-primary" title={`${d.quantity.toLocaleString('en-IN')} shares`}>{dealQty(d.quantity)}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-ink-primary">₹{d.price.toFixed(2)}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums text-navy-deep">{fmtCr(crOf(d.quantity, d.price))}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-ink-secondary">NSE / BSE</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-1 text-[9.5px] leading-snug text-ink-secondary/80">
              Buyer/seller as disclosed by the exchange — the counterparty isn’t reported per trade. Value = quantity × price. Per-trade source links aren’t in the feed; verify via the {sourceName} link above.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Ownership — Governance → Ownership Trend module for the LISTED standalone-
//  health insurers (Niva Bupa, Star Health). The hero is a split, interactive
//  card: a line chart of how Promoter / FII / DII / Public holding has moved over
//  time (left), and a donut showing the ownership *position* for the period the
//  user clicks (right). Below: an insight strip, the investor-movement table and
//  the bulk/block-deal timeline. Annual ↔ Quarterly follows the page-level
//  toggle; both chart and donut read the same Screener data. Missing legs render
//  as a quiet n/a — never 0; investor-level rows are shown only from a real
//  source, never invented.
// ---------------------------------------------------------------------------

interface Holder { name: string; type: string; share: number | null; change: number | null }
interface OwnershipRow {
  company_id: string
  quarter: string
  fiscal_year: string
  promoter_share: number | null
  fii_share: number | null
  dii_share: number | null
  mf_share: number | null
  public_share: number | null
  pledge_share: number | null
  top_holders: Holder[]
  provenance?: { source_name?: string; source_url?: string; confidence?: 'high' | 'medium' | 'low' | 'pending' }
}

// ── Ownership Trend — premium muted palette (PART 5) ─────────────────────────
// Promoter = navy (control); FII = muted blue (foreign); DII = teal (domestic
// institutions); Public = slate (float). Loud green/red is reserved for the
// movement badges only.
const TREND_COLOR: Record<OwnershipHolderGroup, string> = {
  Promoters: '#27457E',
  FIIs: '#5C7AB8',
  DIIs: '#168E8E',
  Public: '#8C97A8',
  'No. of Shareholders': '#B68B3A',
  Other: '#B6C0CF',
}
const CATEGORY_LABEL: Record<string, string> = {
  Promoters: 'Promoter',
  FIIs: 'Foreign / FII',
  DIIs: 'Domestic / DII',
  Public: 'Public float',
}
const UP = '#2F855A'
const DOWN = '#C0584F'
const FLAT = '#8C97A8'

const fmtPct = (v: number | null, d = 2): string => (v == null ? 'n/a' : `${v.toFixed(d)}%`)
const fmtPp = (v: number | null): string => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)} pp`)
const fmtCount = (v: number | null): string => (v == null ? 'n/a' : v.toLocaleString('en-IN'))

/** Signed pp / count badge with a directional arrow. Movement colour only. */
function ChangeBadge({ value, kind = 'pp' }: { value: number | null; kind?: 'pp' | 'count' }) {
  if (value == null) return <span className="text-[11px] text-ink-secondary/50">—</span>
  const eps = kind === 'pp' ? 0.005 : 0.5
  const flat = Math.abs(value) < eps
  const color = flat ? FLAT : value > 0 ? UP : DOWN
  const Icon = flat ? Minus : value > 0 ? TrendingUp : TrendingDown
  const text =
    kind === 'pp'
      ? fmtPp(value)
      : `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('en-IN')}`
  return (
    <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums" style={{ color }}>
      <Icon className="h-3 w-3" />
      {text}
    </span>
  )
}

// Tiny inline sparkline of a group's % across the visible periods.
function Spark({ points, color }: { points: (number | null)[]; color: string }) {
  const w = 70
  const h = 20
  const known = points.filter((v): v is number => v != null)
  if (known.length < 2) return <span className="text-[10px] text-ink-secondary/40">—</span>
  const min = Math.min(...known)
  const max = Math.max(...known)
  const range = max - min || 1
  const n = points.length
  const xy = points.map((v, i) => (v == null ? null : { x: (i / (n - 1)) * w, y: h - ((v - min) / range) * (h - 4) - 2 }))
  const drawn = xy.filter((p): p is { x: number; y: number } => p != null)
  const d = drawn.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const end = drawn[drawn.length - 1]
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      {end && <circle cx={end.x} cy={end.y} r={2} fill={color} />}
    </svg>
  )
}

interface TrendDatum {
  label: string
  raw: string
  Promoters: number | null
  FIIs: number | null
  DIIs: number | null
  Public: number | null
}

// Hero tooltip — for the hovered period, every group's holding + its change vs
// the previous period, plus the source. (recharts injects active/payload/label.)
function TrendTooltip({ active, label, view }: { active?: boolean; label?: string; view?: OwnershipTrendView }) {
  if (!active || !view || !label) return null
  const idx = view.periods.findIndex((p) => p.fiscal === label)
  if (idx < 0) return null
  const raw = view.periods[idx]?.raw
  return (
    <div className="min-w-[220px] rounded-xl border border-[#E5E8EF] bg-white/97 px-3 py-2 shadow-[0_8px_22px_rgba(23,43,77,0.12)] backdrop-blur">
      <p className="mb-1.5 text-[11.5px] font-bold text-navy-deep">
        {label}
        <span className="ml-1 font-medium text-ink-secondary">· {raw}</span>
      </p>
      <div className="space-y-1">
        {TREND_GROUPS.map((g) => {
          const cur = view.seriesByGroup[g][idx]
          const prev = idx > 0 ? view.seriesByGroup[g][idx - 1] : null
          const ch = cur != null && prev != null ? Math.round((cur - prev) * 100) / 100 : null
          return (
            <div key={g} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: TREND_COLOR[g] }} />
                <span className="text-ink-secondary">{CATEGORY_LABEL[g] ?? g}</span>
              </span>
              <span className="inline-flex items-center gap-2 tabular-nums">
                <span className="font-semibold text-navy-deep">{fmtPct(cur)}</span>
                {ch != null && <ChangeBadge value={ch} />}
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-1.5 border-t border-soft-border pt-1 text-[9.5px] font-medium text-ink-secondary/80">Click to lock this period · Source: Screener</p>
    </div>
  )
}

// One-line, data-derived "so what" under the hero — investor narrative.
function buildTakeaway(view: OwnershipTrendView, modeWord: string): string {
  const prom = groupInsight(view, 'Promoters')
  const inst = institutionalInsight(view)
  const pub = groupInsight(view, 'Public')
  const top = view.latestMovement[0]
  if (prom.latest == null) return 'Ownership trend is being sourced from Screener.'
  const promPart =
    prom.changePp == null || Math.abs(prom.changePp) < 0.05
      ? `Promoter control holds steady near ${fmtPct(prom.latest, 1)}`
      : `Promoter holding ${prom.changePp < 0 ? 'eased' : 'rose'} to ${fmtPct(prom.latest, 1)}`
  const instPart =
    inst.latest != null
      ? `, institutions (FII+DII) at ${fmtPct(inst.latest, 1)}${inst.changePp != null ? ` (${fmtPp(inst.changePp)})` : ''}`
      : ''
  const pubPart = pub.latest != null ? `, public float ${pub.changePp != null && pub.changePp < 0 ? 'thinner' : 'wider'} at ${fmtPct(pub.latest, 1)}` : ''
  const moverPart =
    top && top.change_pp != null && Math.abs(top.change_pp) >= 0.05
      ? ` Biggest ${modeWord} move: ${CATEGORY_LABEL[top.holder_group] ?? top.holder_group} ${top.trend_direction === 'increase' ? 'up' : top.trend_direction === 'decrease' ? 'down' : 'flat'} ${fmtPp(top.change_pp)}.`
      : ''
  return `${promPart}${instPart}${pubPart}.${moverPart}`
}

// ── Smooth value tween (ease-out cubic) — drives the donut morph + legend ─────
// Interpolates from the currently-displayed values to the new target over
// ~600ms so the donut segments and legend numbers glide rather than jump.
function useTween(target: number[], duration = 620): number[] {
  const [vals, setVals] = useState<number[]>(target)
  const valsRef = useRef<number[]>(target)
  valsRef.current = vals
  const raf = useRef(0)
  const key = target.join(',')
  useEffect(() => {
    const from = valsRef.current.slice()
    const to = target
    let start = 0
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)
    cancelAnimationFrame(raf.current)
    const step = (ts: number) => {
      if (!start) start = ts
      const p = Math.min(1, (ts - start) / duration)
      const e = ease(p)
      setVals(to.map((v, i) => (from[i] ?? v) + (v - (from[i] ?? v)) * e))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [key, duration])
  return vals
}

/** Annulus-sector path (clockwise from `a0` to `a1`, radians). */
function donutSlicePath(cx: number, cy: number, rO: number, rI: number, a0: number, a1: number): string {
  const pt = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M${pt(rO, a0)} A${rO},${rO} 0 ${large} 1 ${pt(rO, a1)} L${pt(rI, a1)} A${rI},${rI} 0 ${large} 0 ${pt(rI, a0)} Z`
}

// ── PART (interactive donut) — Ownership Position for the selected period ─────
function OwnershipPositionDonut({ view, selectedIdx, onLatest }: { view: OwnershipTrendView; selectedIdx: number; onLatest: () => void }) {
  const groups = TREND_GROUPS
  const target = useMemo(() => groups.map((g) => view.seriesByGroup[g][selectedIdx] ?? 0), [view, selectedIdx, groups])
  const vals = useTween(target, 620)
  const sel = view.periods[selectedIdx]
  const isLatest = selectedIdx === view.periods.length - 1
  const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1

  const C = 88, RO = 80, RI = 58, GAP = 0.05
  let acc = -Math.PI / 2
  const arcs = groups.map((g, i) => {
    const span = (Math.max(0, vals[i]) / total) * 2 * Math.PI
    const a0 = acc + GAP / 2
    const a1 = acc + span - GAP / 2
    acc += span
    return { g, color: TREND_COLOR[g], path: donutSlicePath(C, C, RO, RI, a0, Math.max(a0, a1)) }
  })

  return (
    <div className="flex h-full flex-col rounded-xl border border-soft-border bg-white/70 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-secondary">Ownership Position</p>
          <p className="mt-0.5 text-[10.5px] text-ink-secondary">Selected-period ownership mix</p>
        </div>
        <button
          type="button"
          onClick={onLatest}
          disabled={isLatest}
          className={['shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors', isLatest ? 'cursor-default bg-ice text-ink-secondary/50' : 'bg-soft-blue text-navy-primary hover:bg-[#E2ECFF]'].join(' ')}
        >
          Latest
        </button>
      </div>

      <div className="mt-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-navy-primary/8 px-2 py-0.5 text-[10px] font-semibold text-navy-primary ring-1 ring-navy-primary/15">
          <span className="h-1.5 w-1.5 rounded-full bg-champagne" />
          Selected: {sel?.fiscal ?? '—'}
        </span>
      </div>

      <div className="relative mx-auto mt-2 h-[176px] w-[176px]">
        <svg viewBox="0 0 176 176" className="h-full w-full">
          {arcs.map((a) => (
            <path key={a.g} d={a.path} fill={a.color} stroke="#FFFFFF" strokeWidth={0.75} />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-display text-[27px] leading-none text-navy-deep tabular-nums">{vals[0].toFixed(1)}%</span>
          <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">Promoter</span>
          <span className="mt-0.5 text-[10.5px] font-medium text-navy-deep">{sel?.fiscal ?? ''}</span>
        </div>
      </div>

      <ul className="mt-2.5 space-y-1">
        {groups.map((g, i) => (
          <li key={g} className="flex items-center gap-2 text-[11px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TREND_COLOR[g] }} />
            <span className="flex-1 truncate text-ink-secondary">{CATEGORY_LABEL[g]}</span>
            <span className="w-14 shrink-0 text-right font-semibold tabular-nums text-navy-deep">{vals[i].toFixed(1)}%</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[9.5px] leading-snug text-ink-secondary/70">Same source as the trend · Screener shareholding pattern.</p>
    </div>
  )
}

// Secondary metric strip — shareholder count over the same periods (kept OFF the
// holding-% axis). Mini bars (selected highlighted) + the selected period's count
// and its change vs the prior period.
function ShareholderStrip({ view, selectedIdx }: { view: OwnershipTrendView; selectedIdx: number }) {
  const counts = view.shareholderCounts
  const latest = counts[selectedIdx] ?? null
  const prev = selectedIdx > 0 ? counts[selectedIdx - 1] ?? null : null
  const change = latest != null && prev != null ? latest - prev : null
  const known = counts.filter((v): v is number => v != null)
  const max = known.length ? Math.max(...known) : 1
  const sel = view.periods[selectedIdx]
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-soft-border bg-ice/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-champagne-deep" />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-secondary">No. of Shareholders</span>
      </div>
      <div className="flex items-end gap-[3px]" aria-hidden>
        {counts.map((c, i) => {
          const on = i === selectedIdx
          const hgt = c == null ? 3 : 6 + (c / max) * 22
          return <span key={i} className="w-2 rounded-[2px] transition-colors" style={{ height: hgt, background: on ? '#B68B3A' : '#C9D2E0' }} title={view.periods[i] ? `${view.periods[i].fiscal}: ${fmtCount(c)}` : undefined} />
        })}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[18px] leading-none text-navy-deep tabular-nums">{fmtCount(latest)}</span>
        <span className="text-[11px]"><ChangeBadge value={change} kind="count" /></span>
        <span className="text-[10px] text-ink-secondary">in {sel?.fiscal ?? '—'}</span>
      </div>
    </div>
  )
}

// Compact source pill + click popover that opens DOWNWARD from the pill — so it
// never floats over the chart/donut interaction area.
function HeroSource({ sourceUrl, scrapedAt, lastUpdated }: { sourceUrl: string; scrapedAt: string | null; lastUpdated: string | null }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-soft-border/70 pt-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-white/70 px-2.5 py-1 text-[10px] font-medium text-ink-secondary shadow-[0_1px_2px_rgba(23,43,77,0.04)] transition-colors hover:border-muted-blue hover:text-navy-deep"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-teal" />
        <span className="font-semibold uppercase tracking-[0.08em]">Source</span>
        <span aria-hidden className="text-ink-secondary/50">·</span>
        Screener · Shareholding Pattern
        <Info className="h-3 w-3 text-ink-secondary/55 transition-colors group-hover:text-muted-blue" />
      </button>
      <span className="text-[10px] text-ink-secondary">Updated {lastUpdated ?? '—'}</span>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-72 rounded-xl border border-soft-border bg-card p-3 text-left shadow-card">
          <p className="text-[11px] font-semibold leading-snug text-navy-deep">Screener — Niva Bupa (NIVABUPA) · Investors / Shareholding Pattern</p>
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-1.5 block break-all text-[10px] leading-snug text-muted-blue hover:underline">
            {sourceUrl}
          </a>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-ink-secondary">
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-teal" />Verified · high confidence</span>
            {scrapedAt && (<><span aria-hidden>·</span><span>Fetched {scrapedAt.slice(0, 10)}</span></>)}
          </p>
          <p className="mt-2 border-t border-soft-border pt-2 text-[9.5px] italic leading-snug text-ink-secondary/80">
            Classifications might have changed from Sep 2022 onwards (new XBRL format added more detail).
          </p>
        </div>
      )}
    </div>
  )
}

// ── PART 5 — Hero: split Ownership Trend (line) + Ownership Position (donut) ───
function OwnershipTrendHero({ view }: { view: OwnershipTrendView }) {
  const lastIdx = view.periods.length - 1
  const [selectedIdx, setSelectedIdx] = useState(lastIdx)
  // Reset the selection to the latest period whenever the period set changes
  // (Annual ↔ Quarterly, or a range change).
  useEffect(() => {
    setSelectedIdx(view.periods.length - 1)
  }, [view.periodType, view.periods.length])

  const modeWord = view.periodType === 'yearly' ? 'annual' : 'quarterly'
  const data: TrendDatum[] = view.periods.map((p, i) => ({
    label: p.fiscal,
    raw: p.raw,
    Promoters: view.seriesByGroup.Promoters[i],
    FIIs: view.seriesByGroup.FIIs[i],
    DIIs: view.seriesByGroup.DIIs[i],
    Public: view.seriesByGroup.Public[i],
  }))
  const selFiscal = view.periods[selectedIdx]?.fiscal
  const takeaway = buildTakeaway(view, modeWord)
  const lastUpdated = view.meta.last_updated ?? view.meta.scraped_at ?? null

  return (
    <div className="card-surface card-tint-navy p-4 sm:p-5">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-[19px] leading-tight text-navy-deep">Ownership Trend</h3>
          <p className="mt-0.5 text-[12px] text-ink-secondary">Promoter, FII, DII and Public holding movement from Screener shareholding pattern</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-soft-blue px-2.5 py-1 text-[10.5px] font-semibold text-navy-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-navy-primary" />
          {view.periodType === 'yearly' ? 'Annual (FY)' : 'Quarterly'} view
        </span>
      </div>

      {/* Split hero: trend (left) + period-snapshot donut (right). Stacks on mobile. */}
      <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-[7fr_3fr]">
        {/* LEFT — line chart + legend key + shareholder strip + takeaway */}
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1">
            {TREND_GROUPS.map((g) => (
              <span key={g} className="inline-flex items-center gap-1.5 text-[11px]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: TREND_COLOR[g] }} />
                <span className="font-medium text-ink-primary">{CATEGORY_LABEL[g] ?? g}</span>
              </span>
            ))}
            <span className="ml-auto text-[10px] italic text-ink-secondary/70">Click any point to view that period →</span>
          </div>

          <div className="w-full" style={{ height: 312 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 18, right: 18, left: -6, bottom: 2 }}
                onClick={(state) => {
                  if (state && typeof state.activeTooltipIndex === 'number') setSelectedIdx(state.activeTooltipIndex)
                }}
                style={{ cursor: 'pointer' }}
              >
                <CartesianGrid vertical={false} stroke="#EAEEF6" strokeDasharray="2 4" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#E2E7F0' }} tick={{ fontSize: 11, fill: '#5B6573', fontWeight: 600 }} padding={{ left: 12, right: 12 }} />
                <YAxis domain={[0, 60]} ticks={[0, 15, 30, 45, 60]} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#6B7280' }} width={34} unit="%" />
                <Tooltip content={<TrendTooltip view={view} />} cursor={{ stroke: '#C9D2E0', strokeDasharray: '3 3' }} />
                {selFiscal && (
                  <ReferenceLine
                    x={selFiscal}
                    stroke="#9AA6B6"
                    strokeDasharray="4 4"
                    strokeOpacity={0.85}
                    label={{ value: selFiscal, position: 'top', fill: '#5B6573', fontSize: 10, fontWeight: 700 }}
                  />
                )}
                {TREND_GROUPS.map((g) => (
                  <Line
                    key={g}
                    type="monotone"
                    dataKey={g}
                    stroke={TREND_COLOR[g]}
                    strokeWidth={g === 'Promoters' ? 2.6 : 2}
                    dot={(p) => {
                      const sel = p.index === selectedIdx
                      return (
                        <circle
                          key={`${g}-${p.index}`}
                          cx={p.cx}
                          cy={p.cy}
                          r={sel ? 4.6 : 2.2}
                          fill={TREND_COLOR[g]}
                          stroke={sel ? '#FFFFFF' : 'none'}
                          strokeWidth={sel ? 1.6 : 0}
                        />
                      )
                    }}
                    activeDot={{ r: 4.5 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <ShareholderStrip view={view} selectedIdx={selectedIdx} />

          <p className="mt-3 flex items-start gap-2 text-[12px] leading-snug text-ink-primary">
            <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-deep" />
            <span>{takeaway}</span>
          </p>

          {view.showingFullHistory && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-ice/70 px-2.5 py-1 text-[10px] text-ink-secondary ring-1 ring-soft-border">
              <Info className="h-3 w-3 shrink-0" />
              Showing full available history — the selected range covers fewer than two comparable periods.
            </p>
          )}
        </div>

        {/* RIGHT — Ownership Position donut for the selected period */}
        <OwnershipPositionDonut view={view} selectedIdx={selectedIdx} onLatest={() => setSelectedIdx(view.periods.length - 1)} />
      </div>

      {/* Compact source pill (popover opens downward, off the chart) */}
      <HeroSource sourceUrl={view.meta.source_url} scrapedAt={view.meta.scraped_at} lastUpdated={lastUpdated} />
    </div>
  )
}

// ── PART 6 — Insight strip ───────────────────────────────────────────────────
function InsightCard({ icon, label, value, change, changeKind = 'pp', tint, sub }: { icon: ReactNode; label: string; value: string; change: number | null; changeKind?: 'pp' | 'count'; tint: string; sub: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-soft-border bg-card px-3.5 py-3">
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tint }} />
      <div className="flex items-center gap-1.5">
        <span style={{ color: tint }}>{icon}</span>
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-secondary">{label}</p>
      </div>
      <p className="mt-1.5 font-display text-[22px] leading-none text-navy-deep tabular-nums">{value}</p>
      <div className="mt-1.5 flex items-center justify-between gap-1 text-[11px]">
        <ChangeBadge value={change} kind={changeKind} />
        <span className="truncate text-[10px] text-ink-secondary">{sub}</span>
      </div>
    </div>
  )
}

function InsightStrip({ view }: { view: OwnershipTrendView }) {
  const prom = groupInsight(view, 'Promoters')
  const inst = institutionalInsight(view)
  const pub = groupInsight(view, 'Public')
  const sh = shareholderInsight(view)
  const vsWord = view.periodType === 'yearly' ? 'vs prev FY' : 'vs prev qtr'
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <InsightCard icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Promoter Control" value={fmtPct(prom.latest, 2)} change={prom.changePp} tint={TREND_COLOR.Promoters} sub={vsWord} />
      <InsightCard icon={<Landmark className="h-3.5 w-3.5" />} label="Institutional Build-up" value={fmtPct(inst.latest, 2)} change={inst.changePp} tint={TREND_COLOR.DIIs} sub={`FII + DII · ${vsWord}`} />
      <InsightCard icon={<Waves className="h-3.5 w-3.5" />} label="Public Float" value={fmtPct(pub.latest, 2)} change={pub.changePp} tint={TREND_COLOR.Public} sub={vsWord} />
      <InsightCard icon={<Users className="h-3.5 w-3.5" />} label="Shareholder Count" value={fmtCount(sh.latest)} change={sh.change} changeKind="count" tint="#B68B3A" sub={vsWord} />
    </div>
  )
}

// ── PART 7 — Investor Movement table ─────────────────────────────────────────
function DirectionBadge({ dir }: { dir: string }) {
  const map: Record<string, { label: string; color: string; Icon: typeof TrendingUp }> = {
    increase: { label: 'Increasing', color: UP, Icon: TrendingUp },
    decrease: { label: 'Reducing', color: DOWN, Icon: TrendingDown },
    no_change: { label: 'Stable', color: FLAT, Icon: Minus },
    new_holder: { label: 'New', color: '#5C7AB8', Icon: TrendingUp },
    exited: { label: 'Exited', color: DOWN, Icon: TrendingDown },
    insufficient_history: { label: '—', color: FLAT, Icon: Minus },
  }
  const s = map[dir] ?? map.insufficient_history
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${s.color}1A`, color: s.color }}>
      <s.Icon className="h-3 w-3" />
      {s.label}
    </span>
  )
}

function InvestorMovementTable({ view, companyId, latestExchangePeriod }: { view: OwnershipTrendView; companyId: string; latestExchangePeriod: string }) {
  const named = useMemo(() => getNamedHolders(companyId), [companyId])
  const investorAvailable = named.length > 0
  const [mode, setMode] = useState<'group' | 'investor'>('group')
  const view2 = mode === 'investor' && !investorAvailable ? 'group' : mode

  const groupRows = view.latestMovement // already sorted by |change| desc
  const groupNoPrev = view.latest != null && view.previous == null

  return (
    <div className="card-surface p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Investor Movement</p>
          <p className="mt-0.5 text-[11px] text-ink-secondary">
            {view2 === 'group'
              ? `Who is adding and who is trimming — ${view.previous?.fiscal ?? '—'} → ${view.latest?.fiscal ?? '—'}, sorted by biggest move`
              : `Named holders — latest exchange filing (${latestExchangePeriod})`}
          </p>
        </div>
        {/* Group / Investor view toggle */}
        <div className="inline-flex rounded-lg border border-soft-border bg-ice/40 p-0.5">
          {([
            { id: 'group', label: 'Group View' },
            { id: 'investor', label: 'Investor View' },
          ] as const).map((m) => {
            const on = view2 === m.id
            const disabled = m.id === 'investor' && !investorAvailable
            return (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                onClick={() => setMode(m.id)}
                aria-pressed={on}
                title={disabled ? 'Investor-level rows were not exposed by Screener during scrape' : undefined}
                className={['rounded-[7px] px-2.5 py-1 text-[11px] font-semibold transition-colors', on ? 'bg-white text-navy-deep shadow-soft' : disabled ? 'cursor-not-allowed text-ink-secondary/40' : 'text-ink-secondary hover:text-navy-primary'].join(' ')}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* One clean message at the top when the comparison period is missing —
          never a wall of repeated dashes. */}
      {view2 === 'group' && groupNoPrev && (
        <p className="mb-2.5 flex items-start gap-1.5 rounded-lg bg-ice/60 px-2.5 py-1.5 text-[11px] leading-snug text-ink-secondary ring-1 ring-soft-border">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-navy-primary/70" />
          Trend will activate after another comparable period is available.
        </p>
      )}
      {view2 === 'investor' && (
        <p className="mb-2.5 flex items-start gap-1.5 rounded-lg bg-ice/60 px-2.5 py-1.5 text-[11px] leading-snug text-ink-secondary ring-1 ring-soft-border">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-navy-primary/70" />
          Named holders are from the latest exchange shareholding filing ({latestExchangePeriod}). Screener’s public page lists only the four group totals (individual names are login-only), so investor-level movement is a single-period snapshot — the trend activates after another comparable filing is available.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-separate text-left text-[11.5px]" style={{ borderSpacing: 0 }}>
          <thead>
            <tr className="text-[9px] uppercase tracking-wide text-ink-secondary">
              <th className="border-b border-soft-border py-2 pr-2 font-semibold">{view2 === 'group' ? 'Holder / Group' : 'Holder'}</th>
              <th className="border-b border-soft-border py-2 pr-2 font-semibold">Category</th>
              <th className="border-b border-soft-border py-2 pr-2 text-right font-semibold">Latest %</th>
              <th className="border-b border-soft-border py-2 pr-2 text-right font-semibold">Previous %</th>
              <th className="border-b border-soft-border py-2 pr-2 text-right font-semibold">Change pp</th>
              <th className="border-b border-soft-border py-2 pr-2 text-center font-semibold">Direction</th>
              <th className="border-b border-soft-border py-2 pr-2 text-center font-semibold">Trend</th>
              <th className="border-b border-soft-border py-2 pl-1 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {view2 === 'group'
              ? groupRows.map((r) => (
                  <tr key={r.holder_group} className="align-middle transition-colors hover:bg-[#F6F9FD]">
                    <td className="border-b border-[#F1F3F8] py-2 pr-2 font-semibold text-navy-deep">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: TREND_COLOR[r.holder_group] }} />
                        {r.holder_group}
                      </span>
                    </td>
                    <td className="border-b border-[#F1F3F8] py-2 pr-2 text-ink-secondary">{CATEGORY_LABEL[r.holder_group] ?? r.holder_group}</td>
                    <td className="border-b border-[#F1F3F8] py-2 pr-2 text-right font-semibold tabular-nums text-navy-deep">{fmtPct(r.current_holding_pct)}</td>
                    <td className="border-b border-[#F1F3F8] py-2 pr-2 text-right tabular-nums text-ink-secondary">{fmtPct(r.previous_holding_pct)}</td>
                    <td className="border-b border-[#F1F3F8] py-2 pr-2 text-right"><ChangeBadge value={r.change_pp} /></td>
                    <td className="border-b border-[#F1F3F8] py-2 pr-2 text-center"><DirectionBadge dir={r.trend_direction} /></td>
                    <td className="border-b border-[#F1F3F8] py-2 pr-2">
                      <div className="flex justify-center"><Spark points={view.seriesByGroup[r.holder_group]} color={TREND_COLOR[r.holder_group]} /></div>
                    </td>
                    <td className="border-b border-[#F1F3F8] py-2 pl-1 text-[10px] text-ink-secondary">Screener</td>
                  </tr>
                ))
              : named.map((h, i) => (
                  <tr key={`${h.name}-${i}`} className="align-middle transition-colors hover:bg-[#F6F9FD]">
                    <td className="border-b border-[#F1F3F8] py-2 pr-2 font-semibold text-navy-deep">{h.name}</td>
                    <td className="border-b border-[#F1F3F8] py-2 pr-2 text-ink-secondary">{h.type}</td>
                    <td className="border-b border-[#F1F3F8] py-2 pr-2 text-right font-semibold tabular-nums text-navy-deep">{fmtPct(h.share)}</td>
                    <td className="border-b border-[#F1F3F8] py-2 pr-2 text-right text-ink-secondary/40">·</td>
                    <td className="border-b border-[#F1F3F8] py-2 pr-2 text-right text-ink-secondary/40">·</td>
                    <td className="border-b border-[#F1F3F8] py-2 pr-2 text-center text-ink-secondary/40">·</td>
                    <td className="border-b border-[#F1F3F8] py-2 pr-2 text-center text-ink-secondary/40">·</td>
                    <td className="border-b border-[#F1F3F8] py-2 pl-1 text-[10px] text-ink-secondary">Exchange filing</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Ownership() {
  const company = useActiveCompany()
  const { period, range } = useFilters()
  const listed = getCompanyMaster().find((c) => c.company_id === company.id)?.listed_status === 'listed'
  const { row } = getOwnershipData(company.id) as { row: OwnershipRow | null }
  const view = useMemo(() => getOwnershipTrendView(company.id, period, range), [company.id, period, range])

  // Unlisted insurers do not publish a shareholding pattern.
  if (!listed) {
    return (
      <div className="space-y-6">
        <VerdictStrip
          eyebrow="Ownership Signal"
          verdict="Not publicly disclosed"
          tone="navy"
          badge="Unlisted"
          summary={`${company.shortName} is unlisted — quarterly shareholding patterns are filed only by listed insurers (Star Health, Niva Bupa).`}
          source="Not applicable"
          sourceFrequency="Quarterly"
          sourceStatus="pending"
          sourceProvenance={{ source_name: 'Shareholding pattern is not disclosed for unlisted insurers' }}
        />
        <ModuleCard question="Who owns the company?" title={`${company.shortName} · Ownership`} icon="ownership">
          <LockedPanel
            embedded
            height={260}
            title="Not publicly disclosed"
            message={`${company.shortName} is unlisted — the quarterly shareholding pattern is not publicly disclosed.`}
            pill="Not disclosed"
          />
        </ModuleCard>
      </div>
    )
  }

  // Listed, but nothing ingested yet — honest pending.
  if (!row && !view.available) {
    return (
      <div className="space-y-6">
        <VerdictStrip
          eyebrow="Ownership Signal"
          verdict="Shareholding being sourced"
          tone="navy"
          badge="Pending"
          summary={`${company.shortName} is listed — its shareholding pattern is being pulled from Screener / the exchange filing. The ownership trend, composition and holders populate here once it lands.`}
          source="Screener"
          sourceFrequency="Quarterly"
          sourceStatus="pending"
          sourceProvenance={{
            source_name: 'Shareholding pattern (Screener · Investors / Shareholding Pattern)',
            source_url: 'https://www.screener.in',
          }}
        />
        <ModuleCard question="Who owns the company, and are serious investors changing exposure?" title={`${company.shortName} · Ownership`} icon="ownership">
          <DataEmptyState kind="pending" height={240} title="Shareholding pattern being sourced" body={`${company.shortName}'s ownership trend is being pulled from Screener and will render here.`} />
        </ModuleCard>
      </div>
    )
  }

  const periodLabel = row ? `${row.quarter} ${row.fiscal_year}`.trim() : view.latest?.fiscal ?? ''
  const bulk = getBulkBlockDeals(company.id)
  const lastUpdated = view.meta.last_updated ?? view.meta.scraped_at ?? null

  return (
    <div className="space-y-5">
      {/* 1 — Hero: split Ownership Trend (line) + Ownership Position (donut) */}
      {view.available ? (
        <OwnershipTrendHero view={view} />
      ) : (
        <div className="card-surface card-tint-navy p-4">
          <h3 className="font-display text-[18px] text-navy-deep">Ownership Trend</h3>
          <p className="mt-0.5 mb-3 text-[12px] text-ink-secondary">Promoter, FII, DII and Public holding movement from Screener shareholding pattern</p>
          <DataEmptyState kind="pending" height={220} title="Ownership trend being sourced" body={`${company.shortName}'s multi-period shareholding pattern is being pulled from Screener.`} />
        </div>
      )}

      {/* 2 — Insight strip */}
      {view.available && <InsightStrip view={view} />}

      {/* 3 — Investor Movement table */}
      {view.available && <InvestorMovementTable view={view} companyId={company.id} latestExchangePeriod={periodLabel} />}

      {/* 4 — Bulk / Block Deal timeline (kept separate from shareholding pattern) */}
      {bulk.deals.length > 0 ? (
        <BulkBlockTimeline deals={bulk.deals} companyName={company.shortName} sourceName={bulk.sourceName} sourceUrl={bulk.sourceUrl} lastUpdated={bulk.lastUpdated} />
      ) : (
        <div className="card-surface card-tint-slate p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Bulk / Block Deal Timeline</p>
          <p className="mb-2.5 flex items-start gap-1.5 rounded-lg bg-ice/60 px-2.5 py-1.5 text-[10.5px] leading-snug text-ink-secondary ring-1 ring-soft-border">
            <Info className="mt-px h-3 w-3 shrink-0 text-navy-primary/70" />
            Bulk / block deals are individual transaction disclosures and may not equal quarter-end shareholding-pattern movement.
          </p>
          <DataEmptyState kind="pending" height={92} title="No bulk / block deals on record" body={`Large buys, sells, PE/strategic exits and institutional accumulation for ${company.shortName} appear here once the exchange's bulk/block-deal feed reports one.`} />
        </div>
      )}

      {/* 5 — Source / audit footer (PART 10) */}
      <div className="rounded-xl border border-soft-border bg-ice/40 px-4 py-3 text-[10.5px] leading-relaxed text-ink-secondary">
        <p>
          <span className="font-semibold text-ink-primary">Source:</span> Screener → Investors / Shareholding Pattern · based on company filings · classifications may change due to XBRL format updates (Screener notes classifications might have changed from Sep 2022 onwards as the new XBRL format added more detail).
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Last updated from Screener: <span className="font-semibold text-ink-primary">{lastUpdated ?? '—'}</span></span>
          <span aria-hidden>·</span>
          <span>Named-holder breakdown: latest exchange filing ({periodLabel})</span>
          <span aria-hidden>·</span>
          <span>Bulk/block deals: NSE / BSE</span>
        </p>
      </div>
    </div>
  )
}
