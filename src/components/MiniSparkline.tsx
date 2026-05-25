import { useId } from 'react'

export interface MiniSparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  /** When the metric is "good when lower" (e.g. combined ratio). */
  invert?: boolean
}

/** Lightweight inline sparkline (no chart lib) for KPI cards. */
export function MiniSparkline({
  data,
  width = 96,
  height = 32,
  color = '#3D5F9F',
  invert = false,
}: MiniSparklineProps) {
  const gradId = useId()
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const stepX = width / (data.length - 1)

  const points = data.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / span) * (height - 4) - 2
    return [x, y] as const
  })

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`

  // Direction of last move determines accent (respecting invert semantics).
  const rising = data[data.length - 1] >= data[0]
  const good = invert ? !rising : rising
  const stroke = good ? color : '#B94A48'

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r={2.4} fill={stroke} />
    </svg>
  )
}
