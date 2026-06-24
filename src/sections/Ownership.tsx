import { useMemo, useState, type ReactNode } from 'react'
import { ArrowLeftRight, ArrowUpRight, Info, Landmark, Minus, ShieldCheck, TrendingDown, TrendingUp, Users, Waves } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Sector, Tooltip, XAxis, YAxis } from 'recharts'
import { ModuleCard } from '@/components/ModuleCard'
import { LockedPanel } from '@/components/LockedPanel'
import { DataEmptyState } from '@/components/DataEmptyState'
import { VerdictStrip } from '@/components/VerdictStrip'
import { SourceTag } from '@/components/SourceTag'
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
import { classifySource, sourceHref, isLinkable } from '@/lib/sourceHealth'

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
//  health insurers (Niva Bupa, Star Health). The page leads with the ownership
//  *trend* (how Promoter / FII / DII / Public holding has moved over time, from
//  Screener's shareholding pattern), then an insight strip, the investor-movement
//  table, the latest-period composition donut and the bulk/block-deal timeline.
//  Annual ↔ Quarterly follows the page-level toggle; the FY/QTR range narrows the
//  periods. Missing legs render as a quiet n/a — never coerced to 0; investor-
//  level rows are shown only from a real source, never invented.
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
  FIIs: 'Foreign (FII)',
  DIIs: 'Domestic (DII)',
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
      <p className="mt-1.5 border-t border-soft-border pt-1 text-[9.5px] font-medium text-ink-secondary/80">Source: Screener · Shareholding Pattern</p>
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

// Secondary metric strip — shareholder count over the same periods (kept OFF the
// holding-% axis). Mini bars + latest value + change vs previous period.
function ShareholderStrip({ view }: { view: OwnershipTrendView }) {
  const counts = view.shareholderCounts
  const sh = shareholderInsight(view)
  const known = counts.filter((v): v is number => v != null)
  const max = known.length ? Math.max(...known) : 1
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-soft-border bg-ice/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-champagne-deep" />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-secondary">No. of Shareholders</span>
      </div>
      <div className="flex items-end gap-[3px]" aria-hidden>
        {counts.map((c, i) => {
          const last = i === counts.length - 1
          const hgt = c == null ? 3 : 6 + (c / max) * 22
          return <span key={i} className="w-2 rounded-[2px]" style={{ height: hgt, background: last ? '#B68B3A' : '#C9D2E0' }} title={view.periods[i] ? `${view.periods[i].fiscal}: ${fmtCount(c)}` : undefined} />
        })}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[18px] leading-none text-navy-deep tabular-nums">{fmtCount(sh.latest)}</span>
        <span className="text-[11px]"><ChangeBadge value={sh.change} kind="count" /></span>
        <span className="text-[10px] text-ink-secondary">vs prev {view.periodType === 'yearly' ? 'year' : 'quarter'}</span>
      </div>
    </div>
  )
}

// ── PART 5 — Hero: Ownership Trend line chart ────────────────────────────────
function OwnershipTrendHero({ view, scrapedAt }: { view: OwnershipTrendView; scrapedAt: string | null }) {
  const modeWord = view.periodType === 'yearly' ? 'annual' : 'quarterly'
  const data: TrendDatum[] = view.periods.map((p, i) => ({
    label: p.fiscal,
    raw: p.raw,
    Promoters: view.seriesByGroup.Promoters[i],
    FIIs: view.seriesByGroup.FIIs[i],
    DIIs: view.seriesByGroup.DIIs[i],
    Public: view.seriesByGroup.Public[i],
  }))
  const takeaway = buildTakeaway(view, modeWord)

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

      {/* Legend chips — colour key + latest holding, doubles as a quick read. */}
      <div className="mb-1.5 mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1">
        {TREND_GROUPS.map((g) => {
          const v = view.seriesByGroup[g]
          const latest = v.length ? v[v.length - 1] : null
          return (
            <span key={g} className="inline-flex items-center gap-1.5 text-[11px]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: TREND_COLOR[g] }} />
              <span className="font-medium text-ink-primary">{CATEGORY_LABEL[g] ?? g}</span>
              <span className="font-semibold tabular-nums text-navy-deep">{fmtPct(latest, 1)}</span>
            </span>
          )
        })}
      </div>

      <div className="w-full" style={{ height: 312 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 18, left: -6, bottom: 2 }}>
            <CartesianGrid vertical={false} stroke="#EAEEF6" strokeDasharray="2 4" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#E2E7F0' }} tick={{ fontSize: 11, fill: '#5B6573', fontWeight: 600 }} padding={{ left: 12, right: 12 }} />
            <YAxis domain={[0, 60]} ticks={[0, 15, 30, 45, 60]} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#6B7280' }} width={34} unit="%" />
            <Tooltip content={<TrendTooltip view={view} />} cursor={{ stroke: '#C9D2E0', strokeDasharray: '3 3' }} />
            {TREND_GROUPS.map((g) => (
              <Line
                key={g}
                type="monotone"
                dataKey={g}
                stroke={TREND_COLOR[g]}
                strokeWidth={g === 'Promoters' ? 2.6 : 2}
                dot={{ r: 2.4, fill: TREND_COLOR[g], strokeWidth: 0 }}
                activeDot={{ r: 4.5 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Shareholder count — secondary metric, off the holding-% axis. */}
      <ShareholderStrip view={view} />

      {/* "So what" — data-derived investor narrative. */}
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

      <div className="mt-3 flex justify-end">
        <SourceTag
          source="Screener"
          period={view.latest?.fiscal}
          confidence="high"
          provenance={{
            source_name: 'Screener — Niva Bupa (NIVABUPA) · Investors / Shareholding Pattern',
            source_url: view.meta.source_url,
            fetched_at: scrapedAt,
          }}
        />
      </div>
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
      {/* 1 — Hero: Ownership Trend */}
      {view.available ? (
        <OwnershipTrendHero view={view} scrapedAt={view.meta.scraped_at} />
      ) : (
        <div className="card-surface card-tint-navy p-4">
          <h3 className="font-display text-[18px] text-navy-deep">Ownership Trend</h3>
          <p className="mt-0.5 mb-3 text-[12px] text-ink-secondary">Promoter, FII, DII and Public holding movement from Screener shareholding pattern</p>
          <DataEmptyState kind="pending" height={220} title="Ownership trend being sourced" body={`${company.shortName}'s multi-period shareholding pattern is being pulled from Screener. The latest-period composition is shown below.`} />
        </div>
      )}

      {/* 2 — Insight strip */}
      {view.available && <InsightStrip view={view} />}

      {/* 3 — Investor Movement table */}
      {view.available && <InvestorMovementTable view={view} companyId={company.id} latestExchangePeriod={periodLabel} />}

      {/* 4 — Ownership Composition (latest period), moved below the trend */}
      {row && <HolderComposition row={row} />}

      {/* 5 — Bulk / Block Deal timeline (kept separate from shareholding pattern) */}
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

      {/* 6 — Source / audit footer (PART 10) */}
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

// ── Ownership composition — interactive donut + clickable holder list ────────
// Built from the OFFICIAL filed holder-category totals (promoter / FII / DII /
// MF / public) — the latest-period composition. Individual holders are listed in
// the Investor Movement table above and are NOT repeated here. The donut, chips,
// list and detail all derive from `row`, so a new filing re-renders them.

// Holder-class colour key — promoter = navy anchor; institutions share a
// teal/blue family; public = slate.
const FAMILY: Record<string, { label: string; color: string }> = {
  promoter: { label: 'Promoter', color: '#27457E' },
  fii: { label: 'FII / Foreign', color: '#168E8E' },
  dii: { label: 'Institutions (DII)', color: '#4F7BCF' },
  mf: { label: 'Mutual Funds', color: '#7FA3D9' },
  public: { label: 'Public & Other', color: '#9AA6B6' },
}

interface CatMember { name: string; type: string; pct: number; change: number | null }
interface Category { key: string; label: string; color: string; pct: number; members: CatMember[] }

// Donut categories = the filed holder-category totals. `members` stays empty —
// class-level totals carry no named sub-entities, so there's no drill-down and
// no duplication of the named holders.
function buildCategories(row: OwnershipRow): { categories: Category[]; named: boolean } {
  const classes: { key: string; share: number | null }[] = [
    { key: 'promoter', share: row.promoter_share },
    { key: 'fii', share: row.fii_share },
    { key: 'dii', share: row.dii_share },
    { key: 'mf', share: row.mf_share },
    { key: 'public', share: row.public_share },
  ]
  const categories = classes
    .filter((c) => c.share != null && c.share > 0)
    .map((c) => ({ key: c.key, label: FAMILY[c.key].label, color: FAMILY[c.key].color, pct: c.share as number, members: [] as CatMember[] }))
  return { categories, named: false }
}

const RAD = Math.PI / 180
interface ActiveSectorProps {
  cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number
  startAngle: number; endAngle: number; fill: string; fillOpacity?: number
}
// The selected / hovered slice — nudged outward and grown a touch for a clean
// "lift" that reads as expanded, without losing the ring's shape.
function ActiveSlice({ cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, fillOpacity }: ActiveSectorProps) {
  const dx = Math.cos(-RAD * midAngle) * 5
  const dy = Math.sin(-RAD * midAngle) * 5
  return (
    <Sector cx={cx + dx} cy={cy + dy} innerRadius={innerRadius} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} fillOpacity={fillOpacity ?? 1} cornerRadius={3} />
  )
}

interface DonutSlice { key: string; label: string; color: string; opacity: number; pct: number; member: CatMember | null }

function HolderComposition({ row }: { row: OwnershipRow }) {
  const [drill, setDrill] = useState<string | null>(null)
  const [sel, setSel] = useState<{ kind: 'category' | 'member'; key: string } | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const { categories, named } = buildCategories(row)
  const sumOf = (keys: string[]) => categories.filter((c) => keys.includes(c.key)).reduce((s, c) => s + c.pct, 0)
  const promoterPct = sumOf(['promoter'])
  const instPct = sumOf(['pe', 'fii', 'mf', 'dii'])
  const publicPct = sumOf(['public'])

  const drillCat = drill ? categories.find((c) => c.key === drill) ?? null : null
  const inDrill = drillCat != null && drillCat.members.length >= 2

  const slices: DonutSlice[] = inDrill
    ? drillCat!.members.map((m, i) => ({
        key: `${drillCat!.key}:${m.name}`,
        label: m.name,
        color: drillCat!.color,
        opacity: 1 - Math.min(0.5, (i * 0.5) / Math.max(1, drillCat!.members.length - 1)),
        pct: m.pct,
        member: m,
      }))
    : categories.map((c) => ({ key: c.key, label: c.label, color: c.color, opacity: 1, pct: c.pct, member: c.members.length === 1 ? c.members[0] : null }))

  const selIndex = !sel
    ? -1
    : inDrill || sel.kind === 'member'
      ? slices.findIndex((s) => s.member?.name === sel.key)
      : slices.findIndex((s) => s.key === sel.key)
  const activeIndex: number | undefined = hover != null ? hover : selIndex >= 0 ? selIndex : undefined
  const defaultIdx = slices.reduce((mi, s, i, arr) => (s.pct > arr[mi].pct ? i : mi), 0)
  const centerSlice = hover != null ? slices[hover] : selIndex >= 0 ? slices[selIndex] : slices[defaultIdx]

  const clickCategory = (c: Category) => {
    if (c.members.length >= 2) { setDrill(c.key); setSel({ kind: 'category', key: c.key }) }
    else if (c.members.length === 1) setSel({ kind: 'member', key: c.members[0].name })
    else setSel({ kind: 'category', key: c.key })
  }
  const clickSlice = (i: number) => {
    const s = slices[i]
    if (!s) return
    if (inDrill) { if (s.member) setSel({ kind: 'member', key: s.member.name }) }
    else { const c = categories.find((x) => x.key === s.key); if (c) clickCategory(c) }
  }
  const back = () => { setSel(drillCat ? { kind: 'category', key: drillCat.key } : null); setDrill(null); setHover(null) }

  const detail = (() => {
    if (!sel) return null
    if (sel.kind === 'member') {
      for (const c of categories) { const m = c.members.find((x) => x.name === sel.key); if (m) return { kind: 'member' as const, m, cat: c } }
      return null
    }
    const c = categories.find((x) => x.key === sel.key)
    return c ? { kind: 'category' as const, cat: c } : null
  })()

  const sourceUrl = row.provenance?.source_url || null

  return (
    <div className="card-surface card-tint-navy p-4">
      <div className="mb-1 flex items-center gap-1.5">
        <ArrowLeftRight className="h-3.5 w-3.5 text-navy-primary" />
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Ownership Composition</p>
        {inDrill && (
          <button onClick={back} className="ml-1 inline-flex items-center gap-1 rounded-full bg-ice px-2 py-0.5 text-[10px] font-semibold text-navy-primary transition-colors hover:bg-soft-blue">
            ‹ All blocks
          </button>
        )}
      </div>
      <p className="mb-3 text-[10.5px] text-ink-secondary">Latest-period composition ({row.quarter} {row.fiscal_year}). Trend shown above.</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,250px)_1fr]">
        {/* SECTION A — donut + auto-derived summary chips */}
        <div className="flex flex-col items-center">
          <div className="relative h-[184px] w-[184px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="pct"
                  nameKey="label"
                  innerRadius="78%"
                  outerRadius="98%"
                  paddingAngle={1.4}
                  stroke="none"
                  isAnimationActive={false}
                  activeIndex={activeIndex}
                  activeShape={(p: unknown) => <ActiveSlice {...(p as ActiveSectorProps)} />}
                  onMouseEnter={(_, i) => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(_, i) => clickSlice(i)}
                >
                  {slices.map((s, i) => (
                    <Cell key={s.key} fill={s.color} fillOpacity={(hover != null && hover !== i ? 0.5 : 1) * s.opacity} style={{ cursor: 'pointer', transition: 'opacity .18s ease' }} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-9 text-center">
              <span className="font-display text-[26px] leading-none text-navy-deep">{centerSlice ? `${centerSlice.pct.toFixed(1)}%` : '—'}</span>
              <span className="mt-1 line-clamp-2 text-[10.5px] font-medium leading-tight text-ink-secondary">{centerSlice?.label ?? 'Ownership'}</span>
            </div>
          </div>
          <div className="mt-3 grid w-full grid-cols-3 gap-1.5">
            {[
              { label: 'Promoter', v: promoterPct, c: FAMILY.promoter.color },
              { label: 'Institutional', v: instPct, c: FAMILY.dii.color },
              { label: 'Public / Other', v: publicPct, c: FAMILY.public.color },
            ].map((chip) => (
              <div key={chip.label} className="rounded-lg border border-soft-border bg-ice/50 px-2 py-1 text-center">
                <p className="text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary">{chip.label}</p>
                <p className="text-[12.5px] font-bold tabular-nums" style={{ color: chip.c }}>{chip.v > 0 ? `${chip.v.toFixed(1)}%` : 'n/a'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION B — compact clickable holder list (synced to the donut level) */}
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-secondary">{inDrill ? `${drillCat!.label} · ${drillCat!.members.length} holders` : `${categories.length} holder blocks`}</p>
            <p className="text-[9.5px] text-ink-secondary/70">Holding %</p>
          </div>
          <ul className="space-y-0.5">
            {inDrill
              ? drillCat!.members.map((m) => {
                  const active = sel?.kind === 'member' && sel.key === m.name
                  return (
                    <li key={m.name}>
                      <button
                        onClick={() => setSel({ kind: 'member', key: m.name })}
                        onMouseEnter={() => setHover(slices.findIndex((s) => s.member?.name === m.name))}
                        onMouseLeave={() => setHover(null)}
                        className={['flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors', active ? 'bg-soft-blue ring-1 ring-navy-primary/20' : 'hover:bg-ice/70'].join(' ')}
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: drillCat!.color }} />
                        <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-navy-deep">{m.name}</span>
                        <span className="hidden shrink-0 text-[10px] text-ink-secondary sm:inline">{m.type}</span>
                        <span className="w-12 shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-navy-deep">{m.pct.toFixed(1)}%</span>
                      </button>
                    </li>
                  )
                })
              : categories.map((c) => {
                  const active = sel?.kind === 'category' && sel.key === c.key
                  const drillable = c.members.length >= 2
                  return (
                    <li key={c.key}>
                      <button
                        onClick={() => clickCategory(c)}
                        onMouseEnter={() => setHover(slices.findIndex((s) => s.key === c.key))}
                        onMouseLeave={() => setHover(null)}
                        className={['flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors', active ? 'bg-soft-blue ring-1 ring-navy-primary/20' : 'hover:bg-ice/70'].join(' ')}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: c.color }} />
                        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-navy-deep">{c.label}</span>
                        {drillable && <span className="shrink-0 rounded-full bg-ice px-1.5 py-0.5 text-[9px] font-semibold text-ink-secondary">{c.members.length} ›</span>}
                        <span className="w-12 shrink-0 text-right text-[12px] font-bold tabular-nums text-navy-deep">{c.pct.toFixed(1)}%</span>
                      </button>
                    </li>
                  )
                })}
          </ul>
        </div>
      </div>

      {/* Detail panel — the selected block or entity. */}
      {detail && (() => {
        const isMember = detail.kind === 'member'
        const name = isMember ? detail.m.name : detail.cat.label
        const type = isMember ? detail.m.type : detail.cat.members.length > 0 ? 'Holder block' : 'Holder class'
        const pctV = isMember ? detail.m.pct : detail.cat.pct
        const change = isMember ? detail.m.change : null
        const color = detail.cat.color
        const note = 'Filed holder-category total — individual holders are listed in the Investor Movement table above. Quarter-on-quarter movement is shown there from the Screener ownership trend.'
        return (
          <div className="mt-3 rounded-xl border border-soft-border bg-gradient-to-br from-ice/70 to-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: color }} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-navy-deep">{name}</p>
                  <p className="text-[10.5px] text-ink-secondary">{type}</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[16px] font-bold tabular-nums text-navy-deep">{pctV.toFixed(1)}%</p>
                <p className="text-[9px] uppercase tracking-wide text-ink-secondary">holding</p>
              </div>
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-ink-secondary">{change != null ? `Recent movement ${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}pp. ` : ''}{note}</p>
            {isLinkable(sourceUrl) && (
              <a href={sourceHref(sourceUrl)!} target="_blank" rel="noreferrer" title={classifySource(sourceUrl).hint} className="mt-1.5 inline-flex items-center gap-0.5 text-[10.5px] font-medium text-navy-primary hover:underline">
                Source filing <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
          </div>
        )
      })()}

      {!named && (
        <p className="mt-3 text-[10.5px] text-ink-secondary/80">
          Filed shareholding-category totals (NSE / BSE) — the latest-period composition. Individual holders are listed in the Investor Movement table above.
        </p>
      )}
    </div>
  )
}
