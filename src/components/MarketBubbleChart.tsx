// Market-share bubble map for the Industry Overview. X = premium scale (GWP),
// Y = the selected metric (market share by default), bubble size = pool weight
// (market share). The market leader carries a champagne crown; the selected
// company gets a navy glow + ring so it is findable at a glance.

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { companyColor, FOCAL_COLOR, LEADER_COLOR, type OverviewModel } from '@/lib/industryOverview'

const FOCAL = FOCAL_COLOR
const LEADER_RING = LEADER_COLOR // champagne ring marks the market leader (no crown)

interface Point {
  x: number
  y: number
  r: number
  color: string
  shortName: string
  premium: number
  share: number
  metricLabel: string
  focal: boolean
  isLeader: boolean
  labelSide: 'left' | 'right'
}

const fmtK = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)

interface TooltipPayload {
  payload: Point
}

function ChartTooltip({ active, payload, metricLabel, metricIsShare }: { active?: boolean; payload?: TooltipPayload[]; metricLabel: string; metricIsShare: boolean }) {
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
      {!metricIsShare && (
        <div className="tabular-nums text-ink-secondary">
          {metricLabel} <span className="font-semibold text-ink-primary">{p.metricLabel}</span>
        </div>
      )}
    </div>
  )
}

export function MarketBubbleChart({ model, height = 320 }: { model: OverviewModel; height?: number }) {
  const metric = model.metric
  // Premium and Market-share both render the canonical share map on the Y-axis
  // (premium-vs-premium would be a degenerate diagonal); ratio metrics plot the
  // ratio against premium scale — the more revealing "scale vs quality" view.
  const metricIsShare = metric.id === 'share' || metric.id === 'premium'

  const plotted = model.byShare.filter((r) => r.premiumAvailable && (metricIsShare ? r.shareAvailable : r.metricAvailable))
  const maxShare = Math.max(...plotted.map((r) => r.share), 1)
  const maxPremium = Math.max(...plotted.map((r) => r.premium), 1)

  const points: Point[] = plotted.map((r, idx) => {
    const y = metricIsShare ? r.share : r.metricValue
    return {
      x: r.premium,
      y,
      r: 9 + 17 * Math.sqrt(Math.max(r.share, 0) / maxShare),
      color: companyColor(r.id, r.focal, idx),
      shortName: r.shortName,
      premium: r.premium,
      share: r.share,
      metricLabel: metric.format(r.metricValue),
      focal: r.focal,
      isLeader: r.isLeader,
      // The two biggest insurers (rightmost on the premium axis) label to the
      // left — keeps the leader's label off the edge and separates the often
      // adjacent #2/#3 bubbles so labels never collide.
      labelSide: idx < 2 ? 'left' : 'right',
    }
  })

  const xMax = Math.ceil((maxPremium * 1.18) / 1000) * 1000
  const ys = points.map((p) => p.y)
  const yHi = Math.max(...ys, 1)
  const yLo = Math.min(...ys, 0)
  const yDomain: [number, number] = metricIsShare
    ? [0, Math.ceil((yHi * 1.18) / 5) * 5]
    : [Math.max(0, Math.floor(yLo - Math.max(2, (yHi - yLo) * 0.45))), Math.min(100, Math.ceil(yHi + Math.max(2, (yHi - yLo) * 0.45)))]

  const yAxisLabel = metricIsShare ? 'Market share (%)' : metric.axisLabel

  // Custom bubble: glow (focal) → disc → crown (leader) → name + value label.
  const renderBubble = (props: { cx?: number; cy?: number; payload?: Point }) => {
    const { cx, cy, payload } = props
    if (cx == null || cy == null || !payload) return <g />
    const p = payload
    const labelX = p.labelSide === 'right' ? cx + p.r + 7 : cx - p.r - 7
    const anchor = p.labelSide === 'right' ? 'start' : 'end'
    const stroke = p.focal ? FOCAL : p.isLeader ? LEADER_RING : '#FFFFFF'
    const strokeWidth = p.focal ? 2.6 : p.isLeader ? 2.4 : 1.2
    return (
      <g>
        {p.focal && <circle cx={cx} cy={cy} r={p.r + 7} fill="rgba(39,69,126,0.12)" />}
        {!p.focal && p.isLeader && <circle cx={cx} cy={cy} r={p.r + 6} fill="rgba(182,139,58,0.12)" />}
        <circle cx={cx} cy={cy} r={p.r} fill={p.color} fillOpacity={0.88} stroke={stroke} strokeWidth={strokeWidth} />
        <text x={labelX} y={cy - 2} textAnchor={anchor} fontSize={11.5} fontWeight={600} fill="#172B4D">
          {p.shortName}
        </text>
        <text x={labelX} y={cy + 11} textAnchor={anchor} fontSize={10.5} fill="#6B7280">
          {p.share.toFixed(1)}%{!metricIsShare ? ` · ${p.metricLabel}` : ''}
        </text>
      </g>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 22, right: 30, bottom: 26, left: 10 }}>
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
          domain={yDomain}
          unit="%"
          tick={{ fontSize: 11, fill: '#6B7280' }}
          tickLine={false}
          axisLine={{ stroke: '#EEF1F7' }}
          width={48}
          label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', offset: 14, fontSize: 10.5, fill: '#6B7280', style: { textAnchor: 'middle' } }}
        />
        <Tooltip
          cursor={{ strokeDasharray: '3 3', stroke: '#C7D2E5' }}
          content={<ChartTooltip metricLabel={metric.label} metricIsShare={metricIsShare} />}
        />
        <Scatter data={points} shape={renderBubble} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}
