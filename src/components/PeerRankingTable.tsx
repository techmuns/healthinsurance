import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { SignalBadge } from './SignalBadge'
import { LeaderDot, BestInColumnLegend } from './LeaderDot'
import type { PeerRow } from '@/data/mockData'

type SortKey = 'gwpGrowth' | 'marketShareChange' | 'combinedRatio' | 'solvency' | 'roe' | 'valuation' | 'retailMix'

const columns: { key: SortKey; label: string; fmt: (v: number) => string; invert?: boolean }[] = [
  { key: 'gwpGrowth', label: 'GWP Growth', fmt: (v) => `${v.toFixed(1)}%` },
  { key: 'marketShareChange', label: 'Share Δ', fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} pp` },
  { key: 'combinedRatio', label: 'Combined', fmt: (v) => (v === 0 ? '—' : `${v.toFixed(1)}%`), invert: true },
  { key: 'solvency', label: 'Solvency', fmt: (v) => `${v.toFixed(2)}x` },
  { key: 'roe', label: 'ROE', fmt: (v) => `${v.toFixed(1)}%` },
  { key: 'valuation', label: 'P/GWP', fmt: (v) => `${v.toFixed(1)}x`, invert: true },
]

export function PeerRankingTable({ rows }: { rows: PeerRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('gwpGrowth')
  const [asc, setAsc] = useState(false)

  const sorted = [...rows].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey]
    return asc ? diff : -diff
  })

  // Best (ticker) per column, respecting lower-is-better and skipping N/A (0).
  const bestByColumn = new Map<SortKey, string>()
  columns.forEach((c) => {
    let bestTicker = ''
    let bestVal = c.invert ? Infinity : -Infinity
    rows.forEach((r) => {
      const v = r[c.key]
      if (v === 0 && (c.key === 'combinedRatio')) return
      if (c.invert ? v < bestVal : v > bestVal) {
        bestVal = v
        bestTicker = r.ticker
      }
    })
    bestByColumn.set(c.key, bestTicker)
  })

  const toggle = (key: SortKey) => {
    if (key === sortKey) setAsc((v) => !v)
    else {
      setSortKey(key)
      setAsc(false)
    }
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <BestInColumnLegend />
      </div>
      <div className="overflow-x-auto rounded-xl2 border border-soft-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-ice text-[11px] uppercase tracking-wide text-ink-secondary">
            <tr>
              <th className="px-4 py-3 font-semibold">Company</th>
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-3 font-semibold">
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    className="inline-flex items-center gap-1 transition-colors hover:text-navy-primary"
                  >
                    {c.label}
                    {sortKey === c.key ? (
                      asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ChevronsUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                </th>
              ))}
              <th className="px-4 py-3 font-semibold">Signal</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.ticker}
                title={r.takeaway}
                className={[
                  'border-t border-soft-border transition-colors',
                  r.focal ? 'focal-mark' : 'hover:bg-ice/60',
                ].join(' ')}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {r.focal && <span className="blob-d inline-block h-2.5 w-2.5 bg-navy-primary" />}
                    <div>
                      <div className={`font-semibold ${r.focal ? 'text-navy-primary' : 'text-ink-primary'}`}>
                        {r.company}
                      </div>
                      <div className="text-[11px] text-ink-secondary">
                        {r.ticker} · {r.peerGroup}
                      </div>
                    </div>
                  </div>
                </td>
                {columns.map((c) => {
                  const isBest = bestByColumn.get(c.key) === r.ticker
                  return (
                    <td key={c.key} className="px-3 py-3 tabular-nums text-ink-primary">
                      <span className={`inline-flex items-center gap-1.5 ${isBest ? 'font-semibold text-navy-deep' : ''}`}>
                        {c.fmt(r[c.key])}
                        {isBest && <LeaderDot />}
                      </span>
                    </td>
                  )
                })}
                <td className="px-4 py-3">
                  <SignalBadge label={r.signal} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
