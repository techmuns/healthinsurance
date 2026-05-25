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

// Primary deep blue leads (the focus colour); supporting series move to muted
// teal / slate / gold so blue stays meaningful rather than monotonous.
export const SERIES_COLORS = ['#27457E', '#2E8B86', '#8C97A8', '#A9BFE0', '#C29A4B', '#6E7787']
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
}

/** Standard chart container: insight headline + chart + optional footnote strip. */
export function ChartFrame({ headline, caption, height = 240, children, footnote }: ChartFrameProps) {
  return (
    <div>
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold leading-snug text-navy-deep">{headline}</h3>
        {caption && <p className="mt-0.5 text-xs text-ink-secondary">{caption}</p>}
      </div>
      <div style={height === 'auto' ? { width: '100%' } : { width: '100%', height }}>{children}</div>
      {footnote && <div className="mt-3">{footnote}</div>}
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
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
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
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }} barCategoryGap="28%">
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
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }} barGap={4} barCategoryGap="24%">
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

export function HorizontalBarChart({
  data,
  height = 240,
  unit,
  diverging = false,
}: {
  data: HBarPoint[]
  height?: number
  unit?: string
  /** Color negatives differently (for change charts). */
  diverging?: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis type="number" {...axisProps} unit={unit} />
        <YAxis type="category" dataKey="label" {...axisProps} width={120} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(39,69,126,0.04)' }} />
        <Bar dataKey="value" radius={[0, 5, 5, 0]} maxBarSize={26}>
          {data.map((d, i) => {
            let fill = SERIES_COLORS[1]
            if (diverging) fill = d.value >= 0 ? '#2F855A' : '#B94A48'
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
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
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
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
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
