// ---------------------------------------------------------------------------
//  YoY growth connectors — a shared annotation for year-over-year bar charts.
//
//  Draws a subtle dotted right-angle (H–V–H) step between adjacent columns at
//  a traced value's height (e.g. the top of a hero stacked band), with a small
//  rounded label showing the change. Geometry is read from the chart's axis
//  scales via Recharts' <Customized>, so it stays aligned at any width and
//  adapts to however many columns fall in the Data Range.
//
//  Usage:
//    <Customized component={makeYoYConnectors({ rows, valueAt, label, color })} />
// ---------------------------------------------------------------------------

import type { ReactNode } from 'react'

export interface YoYConnectorOpts<T = Record<string, unknown>> {
  /** Rows in plotted order (already range-clipped). */
  rows: T[]
  /** Row key holding the x-axis category value (default 'label'). */
  xKey?: string
  /** The y-value to trace per row — the band-top the step should follow. */
  valueAt: (row: T) => number | null
  /** Label for a connector, given the two consecutive rows (null = skip). */
  label: (a: T, b: T) => string | null
  /** Accent colour for the small anchor dot. */
  color?: string
  /** Widest bar (px) so the connector ends clear the bar edge. */
  maxBarSize?: number
}

/** Returns a <Customized>-compatible component that renders the connectors. */
export function makeYoYConnectors<T>(opts: YoYConnectorOpts<T>) {
  const { rows, xKey = 'label', valueAt, label, color = '#168E8E', maxBarSize = 42 } = opts
  return function YoYConnectors(p: any): ReactNode {
    if (!rows || rows.length < 2) return null
    const xAxis: any = p?.xAxisMap ? Object.values(p.xAxisMap)[0] : null
    const yAxis: any = p?.yAxisMap ? Object.values(p.yAxisMap)[0] : null
    const sx = xAxis?.scale
    const sy = yAxis?.scale
    if (typeof sx !== 'function' || typeof sy !== 'function') return null
    const bw =
      typeof sx.bandwidth === 'function'
        ? sx.bandwidth()
        : typeof xAxis.bandSize === 'number'
          ? xAxis.bandSize
          : 0
    const barHalf = Math.min(maxBarSize, bw) / 2
    const centerX = (row: T) => {
      const k = (row as Record<string, unknown>)[xKey]
      const s = typeof k === 'string' ? sx(k) : null
      return typeof s === 'number' ? s + bw / 2 : null
    }

    const out: ReactNode[] = []
    for (let i = 0; i < rows.length - 1; i++) {
      const a = valueAt(rows[i])
      const b = valueAt(rows[i + 1])
      const cxa = centerX(rows[i])
      const cxb = centerX(rows[i + 1])
      if (a == null || b == null || cxa == null || cxb == null) continue
      const ya = sy(a)
      const yb = sy(b)
      if (typeof ya !== 'number' || typeof yb !== 'number') continue
      const txt = label(rows[i], rows[i + 1])
      if (!txt) continue

      const xMid = (cxa + cxb) / 2
      const x1 = cxa + barHalf + 3
      const x2 = cxb - barHalf - 3
      const tone = b >= a ? '#0E6F6D' : '#B06A5E'
      const halfW = Math.max(20, txt.length * 2.95 + 4)

      out.push(
        <g key={i}>
          <path
            d={`M ${x1} ${ya} L ${xMid} ${ya} L ${xMid} ${yb} L ${x2} ${yb}`}
            fill="none"
            stroke="#A7BFBE"
            strokeWidth={1}
            strokeDasharray="2 2.5"
            strokeLinecap="round"
          />
          <circle cx={x2} cy={yb} r={1.7} fill={color} />
          <g transform={`translate(${xMid}, ${(ya + yb) / 2})`}>
            <rect x={-halfW} y={-8} width={halfW * 2} height={15} rx={7.5} fill="#FFFFFF" stroke="#DCEAE9" />
            <text x={0} y={2.6} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={tone} style={{ letterSpacing: 0.1 }}>
              {txt}
            </text>
          </g>
        </g>,
      )
    }
    return out.length ? <g>{out}</g> : null
  }
}
