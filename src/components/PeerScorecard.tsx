import { LeaderDot } from './LeaderDot'
import { getScorecardMatrix, TONE_STYLE } from '@/lib/review'
import type { Insurer } from '@/data/types'

/**
 * Multi-metric peer scorecard: every tracked insurer scored across the seven
 * PE/investor metrics. Each cell shows value, rank, a signal colour, a gold
 * leader dot for the best, and a tooltip. The focal company is highlighted.
 */
export function PeerScorecard({ list, focalId }: { list: Insurer[]; focalId: string }) {
  const { columns, rows } = getScorecardMatrix(list, focalId)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">
              Company
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                className="px-2 py-2 text-center text-[10.5px] font-semibold uppercase tracking-wide text-ink-secondary"
              >
                {c.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td
                className={[
                  'sticky left-0 z-10 whitespace-nowrap px-3 py-2 text-left text-[12px] font-medium',
                  r.focal ? 'focal-mark rounded-lg text-navy-primary' : 'bg-card text-ink-primary',
                ].join(' ')}
              >
                <span className="flex items-center gap-2">
                  {r.focal && <span className="blob-d inline-block h-2 w-2 bg-navy-primary" />}
                  {r.name}
                </span>
              </td>
              {r.cells.map((cell, ci) => {
                const style = TONE_STYLE[cell.tone]
                return (
                  <td
                    key={ci}
                    title={cell.tooltip}
                    className="relative rounded-lg px-2 py-1.5 text-center align-middle"
                    style={{ backgroundColor: style.bg, color: style.color }}
                  >
                    {cell.isLeader && <LeaderDot className="absolute right-1 top-1" />}
                    <span className="block text-[12px] font-semibold tabular-nums">{cell.display}</span>
                    <span className="block text-[9.5px] font-medium opacity-70">
                      {cell.rank ? `#${cell.rank}/${cell.of}` : '—'}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
