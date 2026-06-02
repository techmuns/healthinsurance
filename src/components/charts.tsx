import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import type { SeriesPoint } from '@/data/types'
import { SourceTag, type SourceLabel, type SourceConfidence, type SourceProvenance } from './SourceTag'
import { useRangeClip } from '@/state/filters'

// Primary deep blue leads (the focus colour); supporting series move to muted
// teal / slate / gold so blue stays meaningful rather than monotonous.
export const SERIES_COLORS = ['#27457E', '#168E8E', '#8C97A8', '#A9BFE0', '#B68B3A', '#6E7787']
const GRID = '#EEF1F7'
const AXIS = '#6B7280'

const axisProps = {
  tick: { fontSize: 11, fill: AXIS },
  tickLine: false,
  axisLine: { stroke: GRID },
}

export interface ChartFrameProps {
  /** Title written as an insight sentence, not a label. */
  headline: string
  caption?: ReactNode
  /** Fixed pixel height, or 'auto' to let content (e.g. a table) size itself. */
  height?: number | 'auto'
  children: ReactNode
  footnote?: ReactNode
  /** Source tag rendered at the bottom-right of the chart. */
  source?: SourceLabel | string
  sourcePeriod?: string
  sourceConfidence?: SourceConfidence
  sourceProvenance?: SourceProvenance
}

/** Standard chart container: insight headline + chart + optional footnote strip. */
export function ChartFrame({
  headline,
  caption,
  height = 240,
  children,
  footnote,
  source,
  sourcePeriod,
  sourceConfidence,
  sourceProvenance,
}: ChartFrameProps) {
  return (
    <div>
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold leading-snug text-navy-deep">{headline}</h3>
        {caption && <p className="mt-0.5 text-xs text-ink-secondary">{caption}</p>}
      </div>
      <div style={height === 'auto' ? { width: '100%' } : { width: '100%', height }}>{children}</div>
      {footnote && <div className="mt-3">{footnote}</div>}
      {source && (
        <div className="mt-2 flex justify-end">
          <SourceTag
            source={source}
            period={sourcePeriod}
            confidence={sourceConfidence}
            provenance={sourceProvenance}
          />
        </div>
      )}
    </div>
  )
}

/** Muted state shown when the active Data Range excludes every point of a
 *  time series — honest "source missing for this window", never zeroed data. */
export function RangeUnavailable({ height = 240 }: { height?: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl2 border border-dashed border-soft-border bg-ice/50 text-center"
      style={{ height }}
    >
      <span className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-blue text-navy-primary/70">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
        </svg>
      </span>
      <p className="text-[12.5px] font-medium text-ink-secondary">Data not available from source</p>
      <p className="mt-0.5 text-[11px] text-ink-secondary/75">No reported points in the selected range</p>
    </div>
  )
}

export function ChartEmpty({ height = 240 }: { height?: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl2 border border-dashed border-soft-border bg-ice/60 text-center"
      style={{ height }}
    >
      <span className="blob-c mb-3 inline-flex h-12 w-12 items-center justify-center bg-soft-blue text-navy-primary">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3v18h18" strokeLinecap="round" />
          <path d="M7 14l3-3 3 3 4-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <p className="text-sm font-medium text-ink-secondary">Data pending</p>
      <p className="mt-0.5 text-xs text-ink-secondary/80">Source not yet wired for this view</p>
    </div>
  )
}

const tooltipStyle = { fontSize: 12 }
const legendStyle = { fontSize: 12, paddingTop: 8 }

export interface TrendChartProps {
  data: SeriesPoint[]
  series: string[]
  height?: number
  unit?: string
}

export function TrendLineChart({ data, series, height = 240, unit }: TrendChartProps) {
  const { data: clipped } = useRangeClip(data)
  if (clipped.length === 0) return <RangeUnavailable height={height} />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={clipped} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={44} unit={unit} />
        <Tooltip contentStyle={tooltipStyle} />
        {series.length > 1 && <Legend wrapperStyle={legendStyle} iconType="plainline" />}
        {series.map((s, i) => (
          <Line
            key={s}
            type="monotone"
            dataKey={s}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2.4}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export function StackedBarChart({ data, series, height = 240, unit }: TrendChartProps) {
  const { data: clipped } = useRangeClip(data)
  if (clipped.length === 0) return <RangeUnavailable height={height} />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={clipped} margin={{ top: 8, right: 16, left: -8, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={44} unit={unit} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(39,69,126,0.04)' }} />
        <Legend wrapperStyle={legendStyle} iconType="circle" />
        {series.map((s, i) => (
          <Bar
            key={s}
            dataKey={s}
            stackId="a"
            fill={SERIES_COLORS[i % SERIES_COLORS.length]}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
            maxBarSize={64}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function GroupedBarChart({ data, series, height = 240, unit }: TrendChartProps) {
  const { data: clipped } = useRangeClip(data)
  if (clipped.length === 0) return <RangeUnavailable height={height} />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={clipped} margin={{ top: 8, right: 16, left: -8, bottom: 0 }} barGap={4} barCategoryGap="24%">
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={44} unit={unit} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(39,69,126,0.04)' }} />
        <Legend wrapperStyle={legendStyle} iconType="circle" />
        {series.map((s, i) => (
          <Bar key={s} dataKey={s} fill={SERIES_COLORS[i % SERIES_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export interface HBarPoint {
  label: string
  value: number
  focal?: boolean
}

/** Y-axis category tick that flags the leader row with a small gold dot. */
function LeaderCategoryTick(props: {
  x?: number
  y?: number
  payload?: { value?: string }
  leaderLabel?: string
}) {
  const { x = 0, y = 0, payload, leaderLabel } = props
  const value = payload?.value ?? ''
  const isLeader = value === leaderLabel
  const dotX = -(value.length * 6 + 10)
  return (
    <g transform={`translate(${x},${y})`}>
      {isLeader && <circle cx={dotX} cy={0} r={2.6} fill="#B68B3A" />}
      <text x={0} y={0} dy={4} textAnchor="end" fontSize={11} fill={AXIS}>
        {value}
      </text>
    </g>
  )
}

export function HorizontalBarChart({
  data,
  height = 240,
  unit,
  diverging = false,
  leaderLabel,
}: {
  data: HBarPoint[]
  height?: number
  unit?: string
  /** Color negatives differently (for change charts). */
  diverging?: boolean
  /** Label of the leader row — flagged with a gold "best" dot. */
  leaderLabel?: string
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis type="number" {...axisProps} unit={unit} />
        <YAxis
          type="category"
          dataKey="label"
          {...axisProps}
          width={120}
          tick={leaderLabel ? <LeaderCategoryTick leaderLabel={leaderLabel} /> : axisProps.tick}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(39,69,126,0.04)' }} />
        <Bar dataKey="value" radius={[0, 5, 5, 0]} maxBarSize={26}>
          {data.map((d, i) => {
            let fill = SERIES_COLORS[1]
            if (diverging) fill = d.value >= 0 ? '#2F855A' : '#C0584F'
            if (d.focal) fill = '#27457E'
            return <Cell key={i} fill={fill} />
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Solvency-style trend with a comfort band drawn behind the line. */
export function BandedLineChart({
  data,
  height = 240,
  bandLow,
  bandHigh,
  lineKey,
  floorKey,
}: {
  data: SeriesPoint[]
  height?: number
  bandLow: number
  bandHigh: number
  lineKey: string
  floorKey?: string
}) {
  const { data: clipped } = useRangeClip(data)
  if (clipped.length === 0) return <RangeUnavailable height={height} />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={clipped} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={44} domain={[0, 'auto']} />
        <Tooltip contentStyle={tooltipStyle} />
        <ReferenceArea y1={bandLow} y2={bandHigh} fill="#2F855A" fillOpacity={0.07} />
        {floorKey && (
          <Line type="monotone" dataKey={floorKey} stroke="#B7791F" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
        )}
        <Line type="monotone" dataKey={lineKey} stroke="#27457E" strokeWidth={2.6} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        <Legend wrapperStyle={legendStyle} iconType="plainline" />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Dual-axis: bars for a count, line for a productivity ratio. */
export function DualAxisChart({
  data,
  barKey,
  lineKey,
  barLabel,
  lineLabel,
  height = 240,
}: {
  data: SeriesPoint[]
  barKey: string
  lineKey: string
  barLabel: string
  lineLabel: string
  height?: number
}) {
  const { data: clipped } = useRangeClip(data)
  if (clipped.length === 0) return <RangeUnavailable height={height} />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={clipped} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis yAxisId="left" {...axisProps} width={52} />
        <YAxis yAxisId="right" orientation="right" {...axisProps} width={44} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(39,69,126,0.04)' }} />
        <Legend wrapperStyle={legendStyle} iconType="circle" />
        <Bar yAxisId="left" dataKey={barKey} name={barLabel} fill="#A9BFE0" radius={[4, 4, 0, 0]} maxBarSize={42} />
        <Line yAxisId="right" type="monotone" dataKey={lineKey} name={lineLabel} stroke="#27457E" strokeWidth={2.6} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/** Growth (x) vs valuation (y) scatter, highlighting the focal company. */
export function ScatterPlot({
  data,
  height = 260,
}: {
  data: { name: string; growth: number; valuation: number; focal?: boolean }[]
  height?: number
}) {
  const focal = data.filter((d) => d.focal)
  const others = data.filter((d) => !d.focal)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 12, right: 20, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis type="number" dataKey="growth" name="GWP growth" unit="%" {...axisProps} />
        <YAxis type="number" dataKey="valuation" name="P/GWP" unit="x" {...axisProps} width={44} />
        <ZAxis range={[140, 220]} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
        <Scatter data={others} fill="#A9BFE0" />
        <Scatter data={focal} fill="#27457E" shape="star" />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

/** Compact area chart for price/volume style mini panels. */
export function AreaMiniChart({ data, dataKey, height = 140 }: { data: SeriesPoint[]; dataKey: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#27457E" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#27457E" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={40} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey={dataKey} stroke="#27457E" strokeWidth={2.2} fill="url(#areaFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
