import { useMemo, useState } from 'react'
import { Info, TrendingDown, TrendingUp } from 'lucide-react'
import { getShareholdingTrend, type HolderSeries } from '@/lib/shareholdingTrend'

// ---------------------------------------------------------------------------
//  Shareholding-pattern trend — how each holder's stake has moved across the
//  filed quarters. Source is the quarterly shareholding pattern (not bulk deals);
//  a sharp move is annotated, never force-matched to a deal. Soft colours:
//  increase = muted green, decrease = muted red, flat = grey.
// ---------------------------------------------------------------------------

const GREEN = '#2F855A'
const RED = '#C0584F'
const GREY = '#94A3B8'

const pctStr = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`)
const ppStr = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} pp`)
const crShares = (v: number | null) => (v == null ? '—' : `${(v / 1e7).toFixed(2)} Cr`)
const crDelta = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${(Math.abs(v) / 1e7).toFixed(2)} Cr`)
const toneOf = (v: number | null) => (v == null || Math.abs(v) < 0.05 ? GREY : v > 0 ? GREEN : RED)

// Tiny inline sparkline of a holder's % across the periods on screen.
function Spark({ points }: { points: (number | null)[] }) {
  const w = 66
  const h = 18
  const known = points.filter((v): v is number => v != null)
  if (known.length < 2) return <span className="text-[10px] text-ink-secondary/40">—</span>
  const min = Math.min(...known)
  const max = Math.max(...known)
  const range = max - min || 1
  const n = points.length
  const xy = points.map((v, i) => (v == null ? null : { x: (i / (n - 1)) * w, y: h - ((v - min) / range) * (h - 4) - 2 }))
  const drawn = xy.filter((p): p is { x: number; y: number } => p != null)
  const d = drawn.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const up = known[known.length - 1] - known[0]
  const stroke = Math.abs(up) < 0.05 ? GREY : up > 0 ? GREEN : RED
  const end = drawn[drawn.length - 1]
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {end && <circle cx={end.x} cy={end.y} r={2} fill={stroke} />}
    </svg>
  )
}

const WINDOWS = [
  { id: 'latest', label: 'Latest quarter', n: 1 },
  { id: 'last4', label: 'Last 4 quarters', n: 4 },
  { id: 'all', label: 'Since listing', n: undefined },
] as const
type WindowId = (typeof WINDOWS)[number]['id']

export function ShareholdingTrend({ companyId }: { companyId: string }) {
  const [win, setWin] = useState<WindowId>('all')
  const n = WINDOWS.find((w) => w.id === win)?.n
  const trend = useMemo(() => getShareholdingTrend(companyId, n), [companyId, n])
  const single = trend.totalPeriods <= 1
  const anySharp = trend.holders.some((h) => h.sharp)

  if (!trend.holders.length) return null

  return (
    <div className="rounded-xl2 border border-soft-border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="leading-tight">
          <h3 className="font-display text-[14.5px] text-navy-deep">How each holder’s stake has moved</h3>
          <p className="mt-0.5 text-[11px] text-ink-secondary">
            Quarterly shareholding pattern (as filed) · {trend.periods.length} {trend.periods.length === 1 ? 'quarter' : 'quarters'} shown
          </p>
        </div>
        <label className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-secondary">
          <span className="font-semibold uppercase tracking-wide">Period</span>
          <select
            value={win}
            onChange={(e) => setWin(e.target.value as WindowId)}
            className="rounded-full border border-soft-border bg-white px-2.5 py-1 text-[11px] font-medium text-navy-deep shadow-soft transition-colors hover:border-navy-primary/30 focus:outline-none focus:ring-1 focus:ring-muted-blue"
          >
            {WINDOWS.map((w) => (
              <option key={w.id} value={w.id}>{w.label}</option>
            ))}
          </select>
        </label>
      </div>

      {single && (
        <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-soft-border bg-ice/50 px-3 py-2 text-[10.5px] leading-snug text-ink-secondary">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-navy-primary/70" />
          <span>Only one quarter is filed on record so far ({trend.periods[0]?.label}). The period-on-period change and trend line fill in automatically as each new quarterly shareholding pattern is added — no value is invented in the meantime.</span>
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-separate text-left text-[11.5px]" style={{ borderSpacing: 0 }}>
          <thead>
            <tr className="text-[9.5px] uppercase tracking-wide text-ink-secondary">
              <th className="border-b border-soft-border py-2 pr-2 font-semibold">Holder</th>
              <th className="border-b border-soft-border py-2 pr-2 text-right font-semibold">Latest %</th>
              <th className="border-b border-soft-border py-2 pr-2 text-right font-semibold">Prev %</th>
              <th className="border-b border-soft-border py-2 pr-2 text-right font-semibold">Δ pp</th>
              <th className="border-b border-soft-border py-2 pr-2 text-right font-semibold">Latest shares</th>
              <th className="border-b border-soft-border py-2 pr-2 text-right font-semibold">Δ shares</th>
              <th className="border-b border-soft-border py-2 pl-1 text-center font-semibold">Trend</th>
            </tr>
          </thead>
          <tbody>
            {trend.holders.map((h) => (
              <HolderRow key={h.name} h={h} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-soft-border pt-2 text-[10px] text-ink-secondary">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: GREEN }} />Increase</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: RED }} />Decrease</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: GREY }} />No change</span>
        {anySharp && (
          <span className="inline-flex items-center gap-1"><span className="text-gold">◆</span>Large move — possible deal activity</span>
        )}
        <span className="ml-auto">Source · quarterly shareholding pattern (NSE / BSE) · not bulk deals</span>
      </div>
    </div>
  )
}

function HolderRow({ h }: { h: HolderSeries }) {
  const latest = h.latest
  const prev = h.previous
  return (
    <tr className="align-middle transition-colors hover:bg-[#F6F9FD]">
      <td className="border-b border-[#F1F3F8] py-2 pr-2 font-semibold text-navy-deep">
        {h.name}
        {h.sharp && (
          <span className="ml-1 align-middle text-[9px] text-gold" title="Large %-point move this period — possible bulk/block-deal activity (see Bulk & Block Deals).">◆</span>
        )}
      </td>
      <td className="border-b border-[#F1F3F8] py-2 pr-2 text-right tabular-nums font-semibold text-navy-deep">{pctStr(latest?.pct ?? null)}</td>
      <td className="border-b border-[#F1F3F8] py-2 pr-2 text-right tabular-nums text-ink-secondary">{pctStr(prev?.pct ?? null)}</td>
      <td className="border-b border-[#F1F3F8] py-2 pr-2 text-right tabular-nums font-semibold" style={{ color: toneOf(h.deltaPct) }}>
        {h.deltaPct != null ? (
          <span className="inline-flex items-center justify-end gap-0.5">
            {Math.abs(h.deltaPct) >= 0.05 && (h.deltaPct > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />)}
            {ppStr(h.deltaPct)}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="border-b border-[#F1F3F8] py-2 pr-2 text-right tabular-nums text-navy-deep" title={latest?.shares != null ? `${latest.shares.toLocaleString('en-IN')} shares` : ''}>{crShares(latest?.shares ?? null)}</td>
      <td
        className="border-b border-[#F1F3F8] py-2 pr-2 text-right tabular-nums font-medium"
        style={{ color: toneOf(h.deltaShares) }}
        title={prev?.shares != null ? `Previous: ${crShares(prev.shares)} (${prev.shares.toLocaleString('en-IN')})` : ''}
      >
        {crDelta(h.deltaShares)}
      </td>
      <td className="border-b border-[#F1F3F8] py-2 pl-1 text-center">
        <div className="flex justify-center">
          <Spark points={h.points.map((p) => p.pct)} />
        </div>
      </td>
    </tr>
  )
}
