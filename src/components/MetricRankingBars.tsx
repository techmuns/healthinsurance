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
      <table className="w-full min-w-[640px] border-collapse text-[11.5px]">
        <thead>
          <tr className="bg-[#F4F7FC] text-[9px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
            <th className="rounded-l-lg px-2.5 py-2 text-center font-semibold">#</th>
            <th className="px-2.5 py-2 text-left font-semibold">Insurer</th>
            <th className="px-2.5 py-2 text-left font-semibold">Type</th>
            {metrics.map((m) => (
              <th key={m.id} className="px-2.5 py-2 text-right font-semibold last:rounded-r-lg">
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
                <td className="px-2.5 py-2.5 text-center align-middle">
                  <span className="font-display text-[13px] font-semibold tabular-nums text-navy-deep">{r.rank}</span>
                </td>
                <td className="px-2.5 py-2.5 align-middle">
                  <div className="flex items-center gap-1.5">
                    <span className={`truncate text-[12.5px] font-semibold ${r.focal ? 'text-navy-deep' : 'text-ink-primary'}`}>{r.shortName}</span>
                    {r.isLeader && (
                      <span className="shrink-0 rounded-full bg-champagne-soft px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-champagne-deep">Leader</span>
                    )}
                    {r.focal && !r.isLeader && (
                      <span className="shrink-0 rounded-full bg-soft-blue px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-navy-primary">Selected</span>
                    )}
                  </div>
                </td>
                <td className="px-2.5 py-2.5 align-middle text-[10.5px] text-ink-secondary">{r.listed ? 'Listed' : 'Unlisted'}</td>
                {metrics.map((m) => {
                  const c = r.cells[m.id]
                  const isBest = bestId.get(m.id) === r.id
                  return (
                    <td key={m.id} className="px-2.5 py-2.5 text-right align-middle tabular-nums">
                      {c?.available ? (
                        <span className={isBest ? 'font-semibold text-teal' : 'font-medium text-navy-deep'}>{m.format(c.value)}</span>
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
