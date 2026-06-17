import { useState } from 'react'
import { Sparkles, ShieldAlert, ArrowLeftRight, ArrowUpRight } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Sector, Tooltip, XAxis, YAxis } from 'recharts'
import { ModuleCard } from '@/components/ModuleCard'
import { LockedPanel } from '@/components/LockedPanel'
import { DataEmptyState } from '@/components/DataEmptyState'
import { VerdictStrip } from '@/components/VerdictStrip'
import { SourceTag } from '@/components/SourceTag'
import { useActiveCompany } from '@/state/filters'
import { getCompanyMaster, getOwnershipData, getBulkBlockDeals, type BulkBlockDeal } from '@/lib/dataLayer'

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

/** Real exchange-reported bulk/block deals as a single event-signal chart:
 *  buys rise above the zero line, sells dip below, one bar per trade. The chart,
 *  the header chips and the net-flow footer all derive from `deals` — the hidden
 *  structured source below — so they re-render automatically as new deals land. */
function BulkBlockTimeline({ deals, sourceName, sourceUrl, lastUpdated }: { deals: BulkBlockDeal[]; sourceName: string; sourceUrl: string; lastUpdated: string | null }) {
  const buyCr = deals.filter((d) => d.side === 'buy').reduce((s, d) => s + crOf(d.quantity, d.price), 0)
  const sellCr = deals.filter((d) => d.side === 'sell').reduce((s, d) => s + crOf(d.quantity, d.price), 0)
  const netCr = buyCr - sellCr
  const netBought = netCr >= 0

  // One bar per trade, oldest → newest (left → right) so it reads like a signal
  // tape. `deals` arrives newest-first from the data layer; reverse for display
  // only — the data logic is untouched. Date label prints once per day-group.
  const chrono = [...deals].reverse()
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
  const m = niceCeil(Math.max(...bars.map((b) => Math.abs(b.cr)), 1))
  const tick = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1))

  const DealTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) => (
    <text x={x ?? 0} y={(y ?? 0) + 12} textAnchor="middle" fontSize={10} fontWeight={600} fill="#26303F">
      {payload?.value ?? ''}
    </text>
  )

  return (
    <div className="card-surface card-tint-slate p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Bulk / Block Deal Timeline</p>
        <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[10px] font-medium text-navy-primary hover:underline" title={sourceName}>
          {sourceName} <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full bg-teal-soft px-2 py-0.5 font-semibold text-teal">Bought {fmtCr(buyCr)}</span>
        <span className="rounded-full bg-coral-soft px-2 py-0.5 font-semibold text-coral">Sold {fmtCr(sellCr)}</span>
        <span className="text-ink-secondary">· {deals.length} large trades on record</span>
      </div>
      <p className="mb-2 text-[10px] leading-snug text-ink-secondary/80">
        Reported only on large trades — buys rise above the line, sells dip below, ₹ Cr per trade{lastUpdated ? `. Checked ${dealDate(lastUpdated)}` : ''}. New deals appear here automatically.
      </p>

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

      {/* Net-flow summary — auto-calculated from the same deals. */}
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

      {/* Hidden structured source — the chart, chips and net-flow all read from
          this exact table, so any newly-pulled deal renders automatically. Kept
          for the record and for screen readers; not shown visually. */}
      <table className="sr-only">
        <caption>Bulk / block deals — {deals.length} large trades on record</caption>
        <thead>
          <tr><th>Date</th><th>Party</th><th>Side</th><th>Quantity (shares)</th><th>Price (₹)</th><th>Value (₹ Cr)</th></tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.i}>
              <td>{dealDate(b.date)}</td>
              <td>{b.client}</td>
              <td>{b.side === 'buy' ? 'Buy' : 'Sell'}</td>
              <td>{b.quantity}</td>
              <td>{b.price}</td>
              <td>{Math.abs(b.cr).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Ownership — shareholding pattern for the LISTED standalone-health insurers
//  (Star Health, Niva Bupa). The section reads the ownership snapshot; when a
//  real quarterly shareholding row is present it renders the holder composition,
//  the promoter/FII/DII/public split and the top holders. Listed-but-not-yet-
//  ingested → an honest "being sourced" state; unlisted → "not disclosed".
//  Missing legs render as a quiet n/a — never coerced to 0.
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

function pct(v: number | null): string {
  return v == null ? 'n/a' : `${v.toFixed(1)}%`
}

export function Ownership() {
  const company = useActiveCompany()
  const listed = getCompanyMaster().find((c) => c.company_id === company.id)?.listed_status === 'listed'
  const { row } = getOwnershipData(company.id) as { row: OwnershipRow | null }

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

  // Listed, but the shareholding row hasn't been ingested yet — honest pending.
  if (!row) {
    return (
      <div className="space-y-6">
        <VerdictStrip
          eyebrow="Ownership Signal"
          verdict="Shareholding being sourced"
          tone="navy"
          badge="Pending"
          summary={`${company.shortName} is listed — its quarterly shareholding pattern is being pulled from the exchange filing. The composition, promoter holding and top holders populate here once it lands.`}
          source="Exchange filing"
          sourceFrequency="Quarterly"
          sourceStatus="pending"
          sourceProvenance={{
            source_name: 'Quarterly shareholding pattern (NSE / BSE corporate filings)',
            source_url: 'https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern',
          }}
        />
        <ModuleCard question="Who owns the company, and are serious investors changing exposure?" title={`${company.shortName} · Ownership`} icon="ownership">
          <DataEmptyState
            kind="pending"
            height={240}
            title="Shareholding pattern being sourced"
            body={`${company.shortName}'s latest quarterly shareholding split (promoter / FII / DII / public) is being pulled from the exchange filing and will render here.`}
          />
        </ModuleCard>
      </div>
    )
  }

  // Real data — the holder-class composition now renders as the interactive
  // donut in the Ownership Dynamics block below (no duplicate stacked bar).
  const promoter = row.promoter_share
  const fii = row.fii_share
  const periodLabel = `${row.quarter} ${row.fiscal_year}`.trim()
  const conf = row.provenance?.confidence ?? 'medium'

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow="Ownership Signal"
        verdict={promoter != null ? `Promoter holding ${pct(promoter)}` : 'Shareholding disclosed'}
        tone="navy"
        badge={periodLabel}
        summary={`${company.shortName} shareholding as filed for ${periodLabel}. ${promoter != null ? `Promoters hold ${pct(promoter)}` : 'Promoter stake n/a'}${fii != null ? `, FIIs ${pct(fii)}` : ''}.`}
        source={row.provenance?.source_name ? 'Exchange filing' : 'Exchange filing'}
        sourceFrequency="Quarterly"
        sourceStatus="available"
        sourceProvenance={{
          source_name: row.provenance?.source_name ?? 'Quarterly shareholding pattern (NSE / BSE)',
          source_url: row.provenance?.source_url,
        }}
      />

      <ModuleCard
        question="Who owns the company, and are serious investors increasing or reducing exposure?"
        title={`${company.shortName} · Shareholding · ${periodLabel}`}
        icon="ownership"
      >
        <div className="space-y-5">
          {/* Top holders */}
          {row.top_holders?.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-secondary">Top holders</p>
              <div className="overflow-hidden rounded-lg border border-soft-border">
                <table className="w-full text-[12px]">
                  <tbody>
                    {row.top_holders.slice(0, 8).map((h, i) => (
                      <tr key={i} className="border-b border-soft-border/60 last:border-0">
                        <td className="px-3 py-1.5 text-ink-primary">{h.name}</td>
                        <td className="px-3 py-1.5 text-right text-ink-secondary">{h.type}</td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-navy-deep">{pct(h.share)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: h.change == null ? '#9AA6B6' : h.change >= 0 ? '#168E8E' : '#C0584F' }}>
                          {h.change == null ? '—' : `${h.change >= 0 ? '+' : '−'}${Math.abs(h.change).toFixed(1)}pp`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <SourceTag
              source="Exchange filing"
              period={periodLabel}
              confidence={conf}
              provenance={{ source_name: row.provenance?.source_name ?? 'Quarterly shareholding pattern (NSE / BSE)', source_url: row.provenance?.source_url }}
            />
          </div>
        </div>
      </ModuleCard>

      <OwnershipDynamics row={row} companyName={company.shortName} periodLabel={periodLabel} />
    </div>
  )
}

// ── Ownership Dynamics & Exit Risk ───────────────────────────────────────────
// An elegant AI analyst layer over the factual shareholding pattern: a read of
// what the ownership mix implies, an exit-overhang flag, a large-holder movement
// snapshot, and a bulk/block-deal mini timeline. Interprets the real holdings we
// have; movement / deal pieces show honest data-ready placeholders until a
// per-holder + bulk/block-deal feed lands. No new data, no calculation pipeline.

type Signal = 'Accumulating' | 'Stable' | 'Reducing' | 'Exit Watch' | 'Unknown'
const SIGNAL_STYLE: Record<Signal, { bg: string; fg: string; dot: string }> = {
  Accumulating: { bg: 'rgba(22,142,142,0.12)', fg: '#0E6F6D', dot: '#168E8E' },
  Stable: { bg: 'rgba(39,69,126,0.10)', fg: '#27457E', dot: '#27457E' },
  Reducing: { bg: 'rgba(192,134,128,0.16)', fg: '#A8443B', dot: '#C08680' },
  'Exit Watch': { bg: 'rgba(182,139,58,0.16)', fg: '#8A6516', dot: '#B68B3A' },
  Unknown: { bg: 'rgba(140,151,168,0.14)', fg: '#5B6573', dot: '#8C97A8' },
}

// Movement → signal. `change` is null on a single filing → Unknown (never faked).
function signalFor(change: number | null): Signal {
  return change == null ? 'Unknown' : change > 0.1 ? 'Accumulating' : change < -0.1 ? 'Reducing' : 'Stable'
}

// ── Ownership composition — interactive donut + clickable holder list ────────
// Chart-first replacement for the holder table. Donut slices are holder-class
// BLOCKS (Promoter / PE / FII / MF / DII / Public) summed from the SAME fetched
// holders; a block with ≥2 disclosed entities drills into them. The donut,
// summary chips, list and detail panel all derive from `row`, so a new filing
// re-renders everything automatically — no hardcoded values, no manual editing.

// Holder-class colour families — promoter = navy anchor, PE = champagne, the
// institutions share a teal/blue family, public = slate. This only buckets the
// EXISTING inferred holder types for colour + drill-down; it never reclassifies.
const FAMILY: Record<string, { label: string; color: string }> = {
  promoter: { label: 'Promoter', color: '#27457E' },
  pe: { label: 'PE / Investor', color: '#B68B3A' },
  fii: { label: 'FII / Foreign', color: '#168E8E' },
  mf: { label: 'Mutual Funds', color: '#7FA3D9' },
  dii: { label: 'Institutions (DII)', color: '#4F7BCF' },
  public: { label: 'Public & Other', color: '#9AA6B6' },
}
const FAMILY_ORDER = ['promoter', 'pe', 'fii', 'mf', 'dii', 'public']

function familyOf(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('promoter')) return 'promoter'
  if (t.includes('pe')) return 'pe'
  if (t.includes('fii') || t.includes('fpi') || t.includes('foreign') || t.includes('sovereign')) return 'fii'
  if (t.includes('mf') || t.includes('mutual')) return 'mf'
  if (t.includes('dii') || t.includes('insurer') || t.includes('institution')) return 'dii'
  return 'public'
}

interface CatMember { name: string; type: string; pct: number; change: number | null }
interface Category { key: string; label: string; color: string; pct: number; members: CatMember[] }

// Group the fetched holders into coloured blocks. When named holders exist they
// become the members of each block (enabling drill-down); otherwise the class
// aggregates stand alone (no per-holder breakdown to drill into).
function buildCategories(row: OwnershipRow): { categories: Category[]; named: boolean } {
  const holders = (row.top_holders ?? []).filter((h): h is { name: string; type: string; share: number; change: number | null } => h.share != null)
  if (holders.length > 0) {
    const map = new Map<string, Category>()
    for (const h of holders) {
      const fk = familyOf(h.type)
      let c = map.get(fk)
      if (!c) { c = { key: fk, label: FAMILY[fk].label, color: FAMILY[fk].color, pct: 0, members: [] }; map.set(fk, c) }
      c.pct += h.share
      c.members.push({ name: h.name, type: h.type, pct: h.share, change: h.change })
    }
    const categories = FAMILY_ORDER.filter((k) => map.has(k)).map((k) => {
      const c = map.get(k)!
      c.members.sort((a, b) => b.pct - a.pct)
      return c
    })
    return { categories, named: true }
  }
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

  // Current ring: blocks at the top level; a block's member entities (shaded
  // from the family colour) once drilled in.
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
      <div className="mb-3 flex items-center gap-1.5">
        <ArrowLeftRight className="h-3.5 w-3.5 text-navy-primary" />
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Ownership Composition</p>
        {inDrill && (
          <button onClick={back} className="ml-1 inline-flex items-center gap-1 rounded-full bg-ice px-2 py-0.5 text-[10px] font-semibold text-navy-primary transition-colors hover:bg-soft-blue">
            ‹ All blocks
          </button>
        )}
      </div>

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
        const sig = signalFor(change)
        const ss = SIGNAL_STYLE[sig]
        const color = detail.cat.color
        const note = isMember
          ? 'Movement not tracked yet — one shareholding filing on record, so no quarter-on-quarter buy/sell trend is shown.'
          : detail.cat.members.length >= 2
            ? `Holder block grouping ${detail.cat.members.length} disclosed entities — open the block to see each holder.`
            : named
              ? 'Single disclosed holder in this block.'
              : 'Holder-class aggregate; the per-named-holder breakdown isn’t tracked yet.'
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
            <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              <div>
                <p className="text-[9px] uppercase tracking-wide text-ink-secondary">Recent movement</p>
                <p className="text-[11.5px] font-medium text-navy-deep">{change != null ? `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}pp` : 'Not yet tracked'}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wide text-ink-secondary">Last known action</p>
                <p className="text-[11.5px] font-medium text-navy-deep">—</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wide text-ink-secondary">Signal</p>
                <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: ss.bg, color: ss.fg }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: ss.dot }} />{sig}
                </span>
              </div>
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-ink-secondary">{note}</p>
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-0.5 text-[10.5px] font-medium text-navy-primary hover:underline">
                Source filing <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
          </div>
        )
      })()}

      {!named && (
        <p className="mt-3 text-[10.5px] text-ink-secondary/80">
          Showing holder-class aggregates. Per-named-holder stakes and quarter-on-quarter movement activate once the detailed shareholding schedule is tracked.
        </p>
      )}

      {/* Hidden structured source — the donut, chips, list and detail all read
          from this table, so a newly-filed holder renders automatically. Kept
          for the record and for screen readers; not shown visually. */}
      <table className="sr-only">
        <caption>Ownership composition — {row.quarter} {row.fiscal_year}</caption>
        <thead>
          <tr><th>Holder / block</th><th>Type</th><th>Holding %</th><th>Recent movement</th></tr>
        </thead>
        <tbody>
          {categories.flatMap((c) =>
            c.members.length > 0
              ? c.members.map((m) => (
                  <tr key={`${c.key}:${m.name}`}>
                    <td>{m.name}</td><td>{m.type}</td><td>{m.pct.toFixed(2)}</td>
                    <td>{m.change != null ? `${m.change.toFixed(1)}pp` : 'Not yet tracked'}</td>
                  </tr>
                ))
              : [
                  <tr key={c.key}>
                    <td>{c.label}</td><td>Holder class</td><td>{c.pct.toFixed(2)}</td><td>Not yet tracked</td>
                  </tr>,
                ],
          )}
        </tbody>
      </table>
    </div>
  )
}

function aiOwnershipRead(row: OwnershipRow): string[] {
  const pts: string[] = []
  const p = row.promoter_share
  const fii = row.fii_share
  const dii = row.dii_share
  const mf = row.mf_share
  if (p != null) {
    const level = p >= 50 ? 'a controlling stake' : p >= 26 ? 'a significant stake' : 'a minority stake'
    pts.push(`Promoter holds ${p.toFixed(1)}% — ${level}; ${p >= 50 ? 'board control rests with the promoter, lowering governance-change and takeover risk' : 'no single controlling block'}.`)
  }
  const inst = [fii, dii, mf].filter((x): x is number => x != null).reduce((a, b) => a + b, 0)
  if (inst > 0) {
    const parts = [fii != null ? `FII ${fii.toFixed(1)}%` : '', dii != null ? `DII ${dii.toFixed(1)}%` : '', mf != null ? `MF ${mf.toFixed(1)}%` : ''].filter(Boolean).join(', ')
    pts.push(`Institutions hold ~${inst.toFixed(0)}% (${parts}) — ${inst >= 30 ? 'a deep institutional base signalling broad market participation' : 'a modest institutional base'}.`)
  }
  if (mf != null && mf >= 8) pts.push(`Mutual funds hold ${mf.toFixed(1)}% — domestic-fund support tends to be a stickier, stabilising holder class.`)
  pts.push('Quarter-on-quarter accumulation/reduction is not yet tracked (one filing on record) — the buy/sell trend and any institutional exit surface with the next shareholding filing.')
  return pts.slice(0, 4)
}

function OwnershipDynamics({ row, companyName, periodLabel }: { row: OwnershipRow; companyName: string; periodLabel: string }) {
  const read = aiOwnershipRead(row)
  const holders = (row.top_holders ?? []).filter((h) => h.share != null)
  const hasNamed = holders.length > 0

  // Real exchange-reported bulk/block deals for the timeline below.
  const bulk = getBulkBlockDeals(row.company_id)

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="h-4 w-[3px] rounded-full bg-gradient-to-b from-champagne to-champagne-deep" />
        <h3 className="font-display text-[15px] text-navy-deep">Ownership Dynamics &amp; Exit Risk</h3>
        <span className="rounded-full bg-ice px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-ink-secondary">{periodLabel}</span>
      </div>

      {/* AI Ownership Read + Exit Overhang */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[62fr_38fr]">
        <div className="rounded-2xl border border-[#EAD9B6]/70 bg-gradient-to-br from-white to-[#FBF6EA] p-4 shadow-soft">
          <div className="mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-champagne-deep" />
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-champagne-deep">AI Ownership Read</p>
          </div>
          <ul className="space-y-1.5">
            {read.map((pt, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-snug text-ink-primary">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-champagne-deep" />
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        </div>

        <ExitOverhang hasNamed={hasNamed} promoter={row.promoter_share} />
      </div>

      {/* Ownership composition — interactive donut + clickable holder list */}
      <HolderComposition row={row} />

      {/* Bulk / Block Deal timeline — real exchange-reported large trades */}
      {bulk.deals.length > 0 ? (
        <BulkBlockTimeline deals={bulk.deals} sourceName={bulk.sourceName} sourceUrl={bulk.sourceUrl} lastUpdated={bulk.lastUpdated} />
      ) : (
        <div className="card-surface card-tint-slate p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Bulk / Block Deal Timeline</p>
          <DataEmptyState
            kind="pending"
            height={92}
            title="No bulk / block deals on record"
            body={`Large buys, sells, PE/strategic exits and institutional accumulation for ${companyName} appear here once the exchange's bulk/block-deal feed reports one.`}
          />
        </div>
      )}
    </section>
  )
}

function ExitOverhang({ hasNamed, promoter }: { hasNamed: boolean; promoter: number | null }) {
  // With only class-level holdings (no per-holder block / deal data), we cannot
  // honestly flag a specific exit overhang — say so plainly rather than overstate.
  const level = hasNamed ? 'Low' : 'Insufficient data'
  const reason = hasNamed
    ? `Controlling promoter at ${promoter != null ? promoter.toFixed(0) + '%' : 'a stable level'} and a broad institutional base; no single dominant non-promoter block flagged as reducing.`
    : 'Per-holder stakes and bulk/block-deal activity aren’t tracked yet, so a specific large-holder exit overhang can’t be assessed. Promoter and institutional totals look stable.'
  const tone = level === 'Insufficient data' ? SIGNAL_STYLE.Unknown : SIGNAL_STYLE.Stable
  return (
    <div className="card-surface card-tint-rose p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <ShieldAlert className="h-3.5 w-3.5 text-coral" />
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Exit Overhang</p>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: tone.bg, color: tone.fg }}>
        <span className="h-2 w-2 rounded-full" style={{ background: tone.dot }} />{level}
      </span>
      <p className="mt-2 text-[11.5px] leading-snug text-ink-secondary">{reason}</p>
    </div>
  )
}
