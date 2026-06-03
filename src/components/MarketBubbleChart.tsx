// Full-width market-share bubble map (Market Share tab only). X = premium scale
// (GWP), Y = market share %, bubble size = market share. The market leader gets
// a champagne ring, the selected company a navy glow + ring. Labels are kept to
// just company name + share %, placed above each bubble (the selected company's
// label drops below so it never collides with its neighbour on the diagonal).

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { companyColor, FOCAL_COLOR, LEADER_COLOR, type OverviewModel } from '@/lib/industryOverview'

const FOCAL = FOCAL_COLOR
const LEADER_RING = LEADER_COLOR

interface Point {
  x: number
  y: number
  r: number
  color: string
  shortName: string
  premium: number
  share: number
  focal: boolean
  isLeader: boolean
}

const fmtK = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload
  return (
    <div className="rounded-xl border border-soft-border bg-white/95 px-3 py-2 text-[11.5px] shadow-card backdrop-blur">
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-navy-deep">
        <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
        {p.shortName}
        {p.isLeader && <span className="text-[9px] font-bold uppercase tracking-wide text-champagne-deep">· leader</span>}
        {p.focal && <span className="text-[9px] font-bold uppercase tracking-wide text-navy-primary">· selected</span>}
      </div>
      <div className="tabular-nums text-ink-secondary">
        Market share <span className="font-semibold text-ink-primary">{p.share.toFixed(1)}%</span>
      </div>
      <div className="tabular-nums text-ink-secondary">
        Premium (GWP) <span className="font-semibold text-ink-primary">₹{Math.round(p.premium).toLocaleString('en-IN')} Cr</span>
      </div>
    </div>
  )
}

export function MarketBubbleChart({ model, height = 360 }: { model: OverviewModel; height?: number }) {
  const plotted = model.byShare.filter((r) => r.premiumAvailable && r.shareAvailable)
  const maxShare = Math.max(...plotted.map((r) => r.share), 1)
  const maxPremium = Math.max(...plotted.map((r) => r.premium), 1)

  const points: Point[] = plotted.map((r, idx) => ({
    x: r.premium,
    y: r.share,
    r: 10 + 16 * Math.sqrt(Math.max(r.share, 0) / maxShare),
    color: companyColor(r.id, r.focal, idx),
    shortName: r.shortName,
    premium: r.premium,
    share: r.share,
    focal: r.focal,
    isLeader: r.isLeader,
  }))

  // Tight right padding (the data spreads across the full card width); generous
  // headroom above so the top bubble's label is never clipped.
  const xMax = Math.ceil((maxPremium * 1.1) / 1000) * 1000
  const yMax = Math.ceil((maxShare * 1.28) / 5) * 5

  const renderBubble = (props: { cx?: number; cy?: number; payload?: Point }) => {
    const { cx, cy, payload: p } = props
    if (cx == null || cy == null || !p) return <g />
    const stroke = p.focal ? FOCAL : p.isLeader ? LEADER_RING : '#FFFFFF'
    const strokeWidth = p.focal ? 2.6 : p.isLeader ? 2.4 : 1.2
    const shareColor = p.focal ? FOCAL : p.isLeader ? '#9C7430' : '#3D5F9F'
    // Selected company labels below its bubble; everyone else above — this
    // splits the otherwise-adjacent labels on the ascending diagonal.
    const below = p.focal
    const nameY = below ? cy + p.r + 13 : cy - p.r - 14
    const shareY = below ? cy + p.r + 25 : cy - p.r - 2
    return (
      <g>
        {p.focal && <circle cx={cx} cy={cy} r={p.r + 7} fill="rgba(39,69,126,0.12)" />}
        {!p.focal && p.isLeader && <circle cx={cx} cy={cy} r={p.r + 6} fill="rgba(182,139,58,0.12)" />}
        <circle cx={cx} cy={cy} r={p.r} fill={p.color} fillOpacity={0.9} stroke={stroke} strokeWidth={strokeWidth} />
        <text x={cx} y={nameY} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#172B4D">
          {p.shortName}
        </text>
        <text x={cx} y={shareY} textAnchor="middle" fontSize={12} fontWeight={700} fill={shareColor}>
          {p.share.toFixed(1)}%
        </text>
      </g>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 34, right: 30, bottom: 28, left: 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F7" />
        <XAxis
          type="number"
          dataKey="x"
          domain={[0, xMax]}
          tickFormatter={fmtK}
          tick={{ fontSize: 11, fill: '#6B7280' }}
          tickLine={false}
          axisLine={{ stroke: '#EEF1F7' }}
          label={{ value: 'Premium · GWP (₹ Cr)', position: 'insideBottom', offset: -14, fontSize: 10.5, fill: '#6B7280' }}
        />
        <YAxis
          type="number"
          dataKey="y"
          domain={[0, yMax]}
          unit="%"
          tick={{ fontSize: 11, fill: '#6B7280' }}
          tickLine={false}
          axisLine={{ stroke: '#EEF1F7' }}
          width={46}
          label={{ value: 'Market share (%)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10.5, fill: '#6B7280', style: { textAnchor: 'middle' } }}
        />
        <Tooltip cursor={{ strokeDasharray: '3 3', stroke: '#C7D2E5' }} content={<ChartTooltip />} />
        <Scatter data={points} shape={renderBubble} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}
