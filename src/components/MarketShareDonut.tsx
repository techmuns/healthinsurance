import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { ShareSlice } from '@/data/mockData'

// Focal company gets the teal accent pop; peers stay in calm blue shades.
const PEER_SHADES = ['#27457E', '#3D5F9F', '#6E8AC0', '#A9BFE0', '#CBD9F0']
const FOCAL_COLOR = '#168E8E'

export function MarketShareDonut({ data }: { data: ShareSlice[] }) {
  const focal = data.find((d) => d.focal)
  const focalRank = focal ? [...data].sort((a, b) => b.value - a.value).findIndex((d) => d.focal) + 1 : null

  let peerIdx = 0
  const colored = data.map((d) => {
    if (d.focal) return { ...d, color: FOCAL_COLOR }
    const c = PEER_SHADES[peerIdx % PEER_SHADES.length]
    peerIdx += 1
    return { ...d, color: c }
  })

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[150px] w-[150px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={colored}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={72}
              paddingAngle={2}
              stroke="none"
            >
              {colored.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 12 }}
              formatter={(v: number, n: string) => [`${v}%`, n]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl text-navy-deep">{focal?.value}%</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-teal">
            #{focalRank} · {focal?.name}
          </span>
        </div>
      </div>

      <ul className="flex-1 space-y-1.5">
        {colored.map((d) => (
          <li key={d.name} className="flex items-center gap-2 text-[12px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
            <span className={`flex-1 truncate ${d.focal ? 'font-semibold text-navy-deep' : 'text-ink-secondary'}`}>
              {d.name}
            </span>
            <span className={`tabular-nums ${d.focal ? 'font-semibold text-teal' : 'text-ink-primary'}`}>
              {d.value}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
