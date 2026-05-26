// ---------------------------------------------------------------------------
// Compare Companies panel logic — builds an illustrative (mock) time series
// from the latest operational metrics. Period is the X-axis; each tracked
// company is a constant, distinctly-coloured series. Metrics here are kept
// unique from the scorecard/heatmap set.
// ---------------------------------------------------------------------------

import { companyMetrics } from '@/data/mockData'
import type { CompanyOpMetrics } from '@/data/mockData'
import type { Insurer } from '@/data/types'

export type OpKey = keyof CompanyOpMetrics
export type ComparePeriod = 'Quarterly' | 'Yearly'

export interface OpMetricDef {
  key: OpKey
  label: string
  unit: string
  kind: 'flow' | 'ratio'
  invert?: boolean
  naWhenZero?: boolean
  /** Ratios only: typical annual change (current − prior). */
  annualDelta?: number
  format: (v: number) => string
}

const cr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')} Cr`
const pct = (v: number) => `${v.toFixed(1)}%`

export const opMetrics: OpMetricDef[] = [
  { key: 'gwp', label: 'GWP', unit: '₹ Cr', kind: 'flow', format: cr },
  { key: 'nwp', label: 'NWP', unit: '₹ Cr', kind: 'flow', format: cr },
  { key: 'nep', label: 'NEP', unit: '₹ Cr', kind: 'flow', format: cr },
  { key: 'retailMix', label: 'Retail Mix', unit: '%', kind: 'ratio', naWhenZero: true, annualDelta: 2.5, format: (v) => `${v.toFixed(0)}%` },
  { key: 'bancaMix', label: 'Banca Mix', unit: '%', kind: 'ratio', naWhenZero: true, annualDelta: 2.0, format: (v) => `${v.toFixed(0)}%` },
  { key: 'renewalRate', label: 'Renewal Rate', unit: '%', kind: 'ratio', annualDelta: 1.0, format: (v) => `${v.toFixed(0)}%` },
  { key: 'settlementRatio', label: 'Claims Settlement Ratio', unit: '%', kind: 'ratio', annualDelta: 0.3, format: pct },
  { key: 'expenseRatio', label: 'Expense Ratio', unit: '%', kind: 'ratio', invert: true, naWhenZero: true, annualDelta: -0.4, format: pct },
  { key: 'lossRatio', label: 'Loss Ratio', unit: '%', kind: 'ratio', invert: true, naWhenZero: true, annualDelta: -0.6, format: pct },
  { key: 'policyCount', label: 'Policy Count', unit: 'mn', kind: 'flow', format: (v) => `${v.toFixed(1)} mn` },
]

// Distinct, premium per-company colours (consistent across the chart + legend).
export const COMPANY_COLORS: Record<string, string> = {
  'niva-bupa': '#26477F', // deep blue
  'star-health': '#2E8B86', // teal
  'care-health': '#5B8C5A', // muted green
  'aditya-birla': '#C2A24E', // amber / gold
  manipalcigna: '#C0584F', // soft coral
  'icici-lombard': '#7C6FB0', // muted purple
  'bajaj-general': '#6E7E96', // slate
  'hdfc-life': '#5A86C4', // soft blue
  'sbi-life': '#9A8C7A', // warm grey
}
const DEFAULT_COLOR = '#8C97A8'

const QUARTERS = ['Q1 FY25', 'Q2 FY25', 'Q3 FY25', 'Q4 FY25']
const YEARS = ['FY22', 'FY23', 'FY24', 'FY25']
const QFRAC = [0.22, 0.24, 0.26, 0.28]

function round(v: number, dp = 0) {
  const f = 10 ** dp
  return Math.round(v * f) / f
}

function seriesFor(insurer: Insurer, def: OpMetricDef, period: ComparePeriod): number[] | null {
  const base = companyMetrics[insurer.id]
  if (!base) return null
  const cur = base[def.key]
  if (def.naWhenZero && cur === 0) return null
  const dp = def.unit === 'mn' ? 1 : 0

  if (def.kind === 'flow') {
    if (period === 'Yearly') {
      const g = Math.max(0.05, insurer.growth / 100)
      const fy25 = cur
      const fy24 = fy25 / (1 + g)
      const fy23 = fy24 / (1 + g * 0.9)
      const fy22 = fy23 / (1 + g * 0.8)
      return [fy22, fy23, fy24, fy25].map((v) => round(v, dp))
    }
    return QFRAC.map((f) => round(cur * f, dp))
  }

  // Ratio: drift back from the current value.
  const d = def.annualDelta ?? 0
  const stepBack = period === 'Yearly' ? d : d / 4
  return [3, 2, 1, 0].map((back) => round(cur - stepBack * back, 1))
}

export interface CompareSeries {
  id: string
  name: string
  color: string
}

export interface CompareResult {
  data: Array<Record<string, number | string>>
  series: CompareSeries[]
  def: OpMetricDef
  missing: string[]
}

export function buildCompare(companies: Insurer[], metricKey: OpKey, period: ComparePeriod): CompareResult {
  const def = opMetrics.find((m) => m.key === metricKey) ?? opMetrics[0]
  const labels = period === 'Yearly' ? YEARS : QUARTERS
  const series: CompareSeries[] = []
  const missing: string[] = []
  const values: Record<string, number[]> = {}

  companies.forEach((c) => {
    const vals = seriesFor(c, def, period)
    if (!vals) {
      missing.push(c.shortName)
      return
    }
    series.push({ id: c.id, name: c.shortName, color: COMPANY_COLORS[c.id] ?? DEFAULT_COLOR })
    values[c.shortName] = vals
  })

  const data = labels.map((label, i) => {
    const row: Record<string, number | string> = { period: label }
    series.forEach((s) => {
      row[s.name] = values[s.name][i]
    })
    return row
  })

  return { data, series, def, missing }
}
