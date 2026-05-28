import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { LeaderDot } from './LeaderDot'
import type { ShareSlice } from '@/data/mockData'

// Highlighted company is the strongest colour (navy). The market-share leader
// (when not the focal company) gets a muted champagne tone for prestige.
// Other peers fall into a quiet cool-slate palette so the focal/leader rings
// dominate the eye.
const FOCAL_COLOR = '#26477F'
const LEADER_COLOR = '#B68B3A' // champagne — prestige for the category leader
const PEER_PALETTE = [
  '#168E8E', // rich teal
  '#6E7E96', // slate
  '#9FB1C6', // light blue-grey
  '#B6C0CF', // cool mist
  '#7E8AA1', // dark slate
]
const OTHERS_COLOR = '#D4D9E0'

export function MarketShareDonut({
  data,
  onSelect,
}: {
  data: ShareSlice[]
  /** Called with the insurer id when a slice/legend row is clicked. */
  onSelect?: (id: string) => void
}) {
  const [hover, setHover] = useState<number | null>(null)

  const ranked = [...data].sort((a, b) => b.value - a.value)
  const leaderName = ranked.find((d) => d.name !== 'Others')?.name

  let peerIdx = 0
  const colored = data.map((d) => {
    let color: string
    if (d.focal) color = FOCAL_COLOR
    else if (d.name === 'Others') color = OTHERS_COLOR
    else if (d.name === leaderName) color = LEADER_COLOR
    else {
      color = PEER_PALETTE[peerIdx % PEER_PALETTE.length]
      peerIdx += 1
    }
    return { ...d, color, isLeader: d.name === leaderName }
  })

  const focal = colored.find((d) => d.focal)
  const leader = colored.find((d) => d.name !== 'Others')
  // Center previews the hovered slice; falls back to the selected company.
  const centerSlice = hover !== null ? colored[hover] : focal ?? leader
  const centerRank = centerSlice ? ranked.findIndex((d) => d.name === centerSlice.name) + 1 : null
  const centerIsFocal = centerSlice?.focal ?? false

  const select = (id?: string) => {
    if (id) onSelect?.(id)
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[160px] w-[160px] shrink-0">
        {/* Soft focal glow behind the ring */}
        <span
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: centerIsFocal
              ? 'radial-gradient(circle at 50% 50%, rgba(49,90,169,0.18) 0%, transparent 65%)'
              : 'radial-gradient(circle at 50% 50%, rgba(182,139,58,0.14) 0%, transparent 65%)',
          }}
        />
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={colored}
              dataKey="value"
              nameKey="name"
              innerRadius={64}
              outerRadius={76}
              paddingAngle={1.5}
              stroke="none"
              isAnimationActive={false}
              onMouseEnter={(_, idx) => setHover(idx)}
              onMouseLeave={() => setHover(null)}
              onClick={(_, idx) => select(colored[idx]?.id)}
            >
              {colored.map((d, i) => {
                const dim = hover !== null && hover !== i
                const isFocal = d.focal
                const isLeaderNotFocal = d.isLeader && !d.focal
                return (
                  <Cell
                    key={d.name}
                    fill={d.color}
                    fillOpacity={dim ? 0.7 : 1}
                    stroke={isFocal ? FOCAL_COLOR : isLeaderNotFocal ? LEADER_COLOR : 'none'}
                    strokeWidth={isFocal ? 2.5 : isLeaderNotFocal ? 1.5 : 0}
                    style={{ cursor: d.id ? 'pointer' : 'default', transition: 'opacity 0.18s ease' }}
                  />
                )
              })}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Center label updates on hover and reflects the selected company at rest. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="font-display text-[28px] leading-none text-navy-deep transition-colors duration-200">
            {centerSlice?.value}%
          </span>
          <span
            className={`mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide transition-colors duration-200 ${
              centerIsFocal
                ? 'bg-soft-blue text-navy-primary'
                : centerSlice?.isLeader
                  ? 'bg-champagne-soft text-champagne-deep'
                  : 'bg-ice text-ink-secondary'
            }`}
          >
            #{centerRank}
          </span>
          <span className="mt-1 line-clamp-1 text-[10.5px] font-medium text-navy-deep">
            {centerSlice?.name}
          </span>
        </div>
      </div>

      <ul className="flex-1 space-y-1">
        {colored.map((d, i) => {
          const dim = hover !== null && hover !== i
          const clickable = Boolean(d.id)
          return (
            <li
              key={d.name}
              title={`${d.name} · ${d.value}%`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => select(d.id)}
              className={[
                'flex items-center gap-2 rounded-md px-1.5 py-0.5 text-[12px] transition-all duration-200',
                clickable ? 'cursor-pointer' : '',
                d.focal ? 'focal-mark' : clickable && !dim ? 'hover:bg-ice/70' : '',
                dim ? 'opacity-70' : '',
              ].join(' ')}
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
  )
}
