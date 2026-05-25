import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { ShareSlice } from '@/data/mockData'

// Focal company gets the teal accent pop; peers stay in calm blue shades.
const PEER_SHADES = ['#27457E', '#3D5F9F', '#6E8AC0', '#A9BFE0', '#CBD9F0']
const FOCAL_COLOR = '#168E8E'

export function MarketShareDonut({ data, highlight }: { data: ShareSlice[]; highlight?: string }) {
  // Highlight follows the selected company when it is part of the pool;
  // the chart always shows ALL companies (never filtered down).
  const withFocal = data.map((d) => ({
    ...d,
    focal: highlight ? d.name !== 'Others' && highlight.includes(d.name) : d.focal,
  }))

  const ranked = [...withFocal].sort((a, b) => b.value - a.value)
  const focal = withFocal.find((d) => d.focal)
  const leader = ranked.find((d) => d.name !== 'Others')
  const center = focal ?? leader
  const centerRank = center ? ranked.findIndex((d) => d.name === center.name) + 1 : null

  let peerIdx = 0
  const colored = withFocal.map((d) => {
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
            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number, n: string) => [`${v}%`, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl text-navy-deep">{center?.value}%</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${focal ? 'text-teal' : 'text-muted-blue'}`}>
            #{centerRank} · {center?.name}
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
