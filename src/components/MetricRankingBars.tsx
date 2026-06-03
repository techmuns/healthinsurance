// Plain, data-first peer metrics TABLE for the Executive Overview. Every
// company is one row; every metric (Market Share · Premium · Settlement ·
// Renewal · Retention) is its own column, so all data is visible at once — no
// toggle, no tabs. Sorted by market share. The focal company row is softly
// navy-tinted, the market leader gold-tinted with a small "Leader" pill, and
// the best value in each metric column carries a subtle teal cue. Numbers are
// right-aligned for easy comparison.

import type { OverviewMetricDef, OverviewMetricId } from '@/lib/industryOverview'

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

const NAVY = '#27457E'
const GOLD = '#B68B3A'

/** Compact, one-line metric value — premium in ₹ Cr abbreviated to k Cr so it
 *  never wraps in the narrow column; ratios use the metric's own formatter. */
function fmtCompact(m: OverviewMetricDef, v: number): string {
  if (m.unit === '₹ Cr') return v >= 1000 ? `₹${(v / 1000).toFixed(1)}k Cr` : `₹${Math.round(v)} Cr`
  return m.format(v)
}

export interface MetricCell {
  value: number
  available: boolean
}
export interface MetricTableRow {
  id: string
  shortName: string
  listed: boolean
  focal: boolean
  isLeader: boolean
  rank: number
  /** Per-company accent (gold leader / navy selected / teal / blue / slate). */
  color: string
  cells: Record<string, MetricCell>
}

export function MetricRankingTable({
  metrics,
  rows,
}: {
  metrics: OverviewMetricDef[]
  rows: MetricTableRow[]
}) {
  if (rows.length === 0) {
    return <div className="flex flex-1 items-center justify-center text-[12px] text-ink-secondary">Data not available</div>
  }

  // Best (highest) available value per metric — for a subtle leader cue.
  const bestId = new Map<OverviewMetricId, string>()
  for (const m of metrics) {
    let bId = ''
    let bVal = -Infinity
    for (const r of rows) {
      const c = r.cells[m.id]
      if (c?.available && c.value > bVal) {
        bVal = c.value
        bId = r.id
      }
    }
    if (bId) bestId.set(m.id, bId)
  }

  return (
    <div className="flex-1 overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-[11px]">
        <thead>
          <tr className="bg-[#F4F7FC] text-[8.5px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
            <th className="rounded-l-lg px-1 py-2 text-center font-semibold">#</th>
            <th className="px-1 py-2 text-left font-semibold">Insurer</th>
            <th className="px-1 py-2 text-left font-semibold">Type</th>
            {metrics.map((m) => (
              <th key={m.id} className="px-1 py-2 text-right font-semibold last:rounded-r-lg last:pr-2.5">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const rowBg = r.focal ? hexA(NAVY, 0.06) : r.isLeader ? hexA(GOLD, 0.045) : undefined
            return (
              <tr
                key={r.id}
                className="border-b border-soft-border/60 transition-colors last:border-0 hover:bg-ice/50"
                style={rowBg ? { background: rowBg } : undefined}
              >
                <td className="px-1 py-2.5 text-center align-middle">
                  <span className="font-display text-[12.5px] font-semibold tabular-nums text-navy-deep">{r.rank}</span>
                </td>
                <td className="px-1 py-2.5 align-middle">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                    <span className={`truncate text-[11.5px] font-semibold ${r.focal ? 'text-navy-deep' : 'text-ink-primary'}`}>{r.shortName}</span>
                    {r.isLeader && (
                      <span className="shrink-0 rounded-full bg-champagne-soft px-1 py-px text-[7.5px] font-bold uppercase tracking-wide text-champagne-deep">Leader</span>
                    )}
                    {r.focal && !r.isLeader && (
                      <span className="shrink-0 rounded-full bg-soft-blue px-1 py-px text-[7.5px] font-bold uppercase tracking-wide text-navy-primary">Selected</span>
                    )}
                  </div>
                </td>
                <td className="px-1 py-2.5 align-middle text-[10px] text-ink-secondary">{r.listed ? 'Listed' : 'Unlisted'}</td>
                {metrics.map((m) => {
                  const c = r.cells[m.id]
                  const isBest = bestId.get(m.id) === r.id
                  return (
                    <td key={m.id} className="whitespace-nowrap px-1 py-2.5 text-right align-middle tabular-nums last:pr-2.5">
                      {c?.available ? (
                        <span className={isBest ? 'font-semibold text-teal' : 'font-medium text-navy-deep'}>{fmtCompact(m, c.value)}</span>
                      ) : (
                        <span className="text-ink-secondary/40">n/a</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
