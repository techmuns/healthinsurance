import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { LeaderDot } from './LeaderDot'
import type { ShareSlice } from '@/data/mockData'

// Highlighted company is the strongest colour (navy). Peers use a pleasant,
// institutional palette — distinct and legible, never dead grey.
const FOCAL_COLOR = '#26477F'
const PEER_PALETTE = [
  '#3F8E8E', // soft teal
  '#6E7E96', // slate
  '#C2A24E', // muted gold
  '#9FB1C6', // light blue-grey
  '#B3A795', // warm grey
]
const OTHERS_COLOR = '#D4D9E0'

export function MarketShareDonut({ data }: { data: ShareSlice[] }) {
  const [active, setActive] = useState<number | null>(null)

  const ranked = [...data].sort((a, b) => b.value - a.value)
  const leaderName = ranked.find((d) => d.name !== 'Others')?.name

  let peerIdx = 0
  const colored = data.map((d) => {
    let color: string
    if (d.focal) color = FOCAL_COLOR
    else if (d.name === 'Others') color = OTHERS_COLOR
    else {
      color = PEER_PALETTE[peerIdx % PEER_PALETTE.length]
      peerIdx += 1
    }
    return { ...d, color, isLeader: d.name === leaderName }
  })

  const focal = colored.find((d) => d.focal)
  const leader = colored.find((d) => d.name !== 'Others')
  const base = focal ?? leader
  // Center reflects the hovered slice, else the highlighted/leader company.
  const centerSlice = active !== null ? colored[active] : base
  const centerRank = centerSlice
    ? ranked.findIndex((d) => d.name === centerSlice.name) + 1
    : null
  const centerIsFocal = centerSlice?.focal ?? false

  // Hover interpretation: hovered slice, else highlighted, else leader.
  const interp =
    (active !== null ? colored[active]?.takeaway : undefined) ?? focal?.takeaway ?? leader?.takeaway

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="relative h-[150px] w-[150px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={colored}
                dataKey="value"
                nameKey="name"
                innerRadius={62}
                outerRadius={73}
                paddingAngle={1.5}
                stroke="none"
                onMouseEnter={(_, idx) => setActive(idx)}
                onMouseLeave={() => setActive(null)}
              >
                {colored.map((d, i) => {
                  const dim = active !== null && active !== i
                  return (
                    <Cell
                      key={d.name}
                      fill={d.color}
                      fillOpacity={dim ? 0.42 : 1}
                      stroke={d.focal ? FOCAL_COLOR : 'none'}
                      strokeWidth={d.focal ? 2 : 0}
                      style={{ cursor: 'pointer', transition: 'opacity 0.2s ease' }}
                    />
                  )
                })}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Center label carries value, rank and name; updates on hover/filter. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <span className="font-display text-2xl leading-none text-navy-deep">{centerSlice?.value}%</span>
            <span
              className={`mt-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                centerIsFocal ? 'text-navy-primary' : 'text-ink-secondary'
              }`}
            >
              #{centerRank}
            </span>
            <span className="mt-0.5 line-clamp-1 text-[10.5px] font-medium text-ink-secondary">
              {centerSlice?.name}
            </span>
          </div>
        </div>

        <ul className="flex-1 space-y-1">
          {colored.map((d, i) => {
            const dim = active !== null && active !== i
            return (
              <li
                key={d.name}
                className={[
                  'flex items-center gap-2 rounded-md px-1.5 py-0.5 text-[12px] transition-opacity duration-200',
                  dim ? 'opacity-50' : '',
                  d.focal ? 'focal-mark' : '',
                ].join(' ')}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                <span className={`flex-1 truncate ${d.focal ? 'font-semibold text-navy-deep' : 'text-ink-secondary'}`}>
                  {d.name}
                </span>
                {d.isLeader && <LeaderDot title="Market-share leader" />}
                <span className={`tabular-nums ${d.focal ? 'font-semibold text-navy-primary' : 'text-ink-primary'}`}>
                  {d.value}%
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Hover interpretation — one short investor line, no popup. */}
      {interp && (
        <p className="mt-3 border-t border-soft-border pt-2.5 text-[11.5px] leading-snug text-ink-secondary">
          <span className="font-semibold text-navy-primary">{centerSlice?.name}:</span> {interp}
        </p>
      )}
    </div>
  )
}
