import type { DataStatus, Metric } from '@/data/types'

/** Format a metric's value for display, handling pending/null gracefully. */
export function formatValue(metric: Metric): string {
  if (metric.value === null) return 'Data pending'
  const { value, unit } = metric
  const abs = Math.abs(value)

  let num: string
  if (unit === '₹ Cr' || unit === '') {
    num = abs >= 1000 ? value.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : `${value}`
  } else {
    num = Number.isInteger(value) ? `${value}` : value.toFixed(value < 10 ? 2 : 1)
  }

  if (!unit) return num
  if (unit === 'x') return `${num}x`
  if (unit === '%') return `${num}%`
  if (unit === 'pp') return `${num} pp`
  return `${unit} ${num}`.trim()
}

/** Format a signed change with a sign prefix. */
export function formatChange(value: number, unit?: string): string {
  const sign = value > 0 ? '+' : ''
  const u = unit === '%' ? '%' : unit === 'pp' ? ' pp' : unit === 'x' ? 'x' : ''
  return `${sign}${value}${u}`
}

export const statusTone: Record<DataStatus, 'positive' | 'navy' | 'warning' | 'neutral'> = {
  Reported: 'positive',
  Derived: 'navy',
  Estimated: 'warning',
  Pending: 'neutral',
}
