import { useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TrendingUp, TrendingDown, Sparkles } from 'lucide-react'
import { ModuleCard } from '@/components/ModuleCard'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SignalBadge } from '@/components/SignalBadge'
import { BasisTag } from '@/components/BasisTag'
import { profitabilityBasis } from '@/data/mockData'
import { useActiveCompany } from '@/state/filters'
import { getCompanyProfitabilityCopy } from '@/lib/companyCopy'
import type { Metric, Insurer } from '@/data/types'

// ---------------------------------------------------------------------------
// Mock data (FY25 basis · ₹ Cr where applicable)
// ---------------------------------------------------------------------------

const NET_PROFIT_QUARTERS: Record<string, [number, number, number, number]> = {
  'niva-bupa': [142, 178, 215, 268],
  'star-health': [195, 212, 178, 202],
  'care-health': [120, 132, 118, 96],
  'aditya-birla': [-78, -52, -28, -12],
  manipalcigna: [-22, -15, -8, -5],
  'icici-lombard': [580, 612, 645, 671],
  'bajaj-general': [410, 438, 480, 504],
  'hdfc-life': [415, 432, 455, 500],
  'sbi-life': [560, 588, 615, 650],
}

// Quarterly combined ratio drift around the FY25 anchor — same shape as the
// `compareShapes` ratio approximation used elsewhere.
const COMBINED_RATIO_QUARTERS: Record<string, [number, number, number, number]> = {
  'niva-bupa': [98.4, 97.2, 96.5, 96.1],
  'star-health': [99.5, 100.2, 100.8, 101.1],
  'care-health': [101.2, 102.0, 102.6, 103.0],
  'aditya-birla': [108.5, 109.4, 110.2, 111.0],
  manipalcigna: [102.1, 102.5, 102.9, 103.2],
  'icici-lombard': [103.5, 103.2, 103.0, 102.8],
  'bajaj-general': [103.0, 103.4, 103.7, 104.0],
}

const COST_RATIOS: Record<string, { loss: number; commission: number; expense: number }> = {
  'niva-bupa': { loss: 62.8, commission: 13.4, expense: 20.6 },
  'star-health': { loss: 66.8, commission: 10.2, expense: 22.4 },
  'care-health': { loss: 64.2, commission: 12.1, expense: 21.8 },
  'aditya-birla': { loss: 65.0, commission: 12.2, expense: 24.6 },
  manipalcigna: { loss: 66.4, commission: 11.6, expense: 25.2 },
  'icici-lombard': { loss: 74.2, commission: 4.6, expense: 23.8 },
  'bajaj-general': { loss: 73.8, commission: 4.0, expense: 22.6 },
}

const QUARTER_LABELS = ['Q1 FY25', 'Q2 FY25', 'Q3 FY25', 'Q4 FY25']

function getMarginMetrics(company: Insurer) {
  const series = NET_PROFIT_QUARTERS[company.id]
  if (!series || company.premiumCollection <= 0) return { netMargin: 0, yoyImprovement: 0, latestPat: 0, ttmPat: 0 }
  const ttmPat = series.reduce((s, v) => s + v, 0)
  const netMargin = (ttmPat / company.premiumCollection) * 100
  const priorAvg = (series[0] + series[1] + series[2]) / 3
  const yoyImprovement = priorAvg === 0 ? 0 : ((series[3] - priorAvg) / Math.abs(priorAvg)) * 100
  return {
    netMargin: Math.round(netMargin * 10) / 10,
    yoyImprovement: Math.round(yoyImprovement * 10) / 10,
    latestPat: series[3],
    ttmPat,
  }
}

// ---------------------------------------------------------------------------
// Palette + tone helpers
// ---------------------------------------------------------------------------

const PALETTE = {
  navy: '#27457E',
  navyDeep: '#172B4D',
  teal: '#168E8E',
  emerald: '#2F855A',
  emeraldSoft: '#CFE7D9',
  amber: '#B7791F',
  amberSoft: '#F4DFAE',
  coral: '#B94A48',
  coralSoft: '#EFC8C7',
  champagne: '#B68B3A',
  champagneSoft: '#F4ECDB',
  ice: '#F4F7FC',
  softBlue: '#EEF4FF',
  border: '#E8EBF1',
} as const

type Tone = 'positive' | 'warning' | 'negative' | 'neutral'

const toneDot: Record<Tone, string> = {
  positive: 'bg-signal-positive',
  warning: 'bg-signal-warning',
  negative: 'bg-signal-negative',
  neutral: 'bg-muted-blue',
}
const toneText: Record<Tone, string> = {
  positive: 'text-signal-positive',
  warning: 'text-signal-warning',
  negative: 'text-signal-negative',
  neutral: 'text-ink-secondary',
}

function combinedTone(v: number): { label: string; tone: Tone } {
  if (v < 100) return { label: 'Strong', tone: 'positive' }
  if (v <= 105) return { label: 'Watch', tone: 'warning' }
  return { label: 'Weak', tone: 'negative' }
}

type View = 'P&L' | 'Margin' | 'Cost' | 'Returns' | 'Capital'

// ---------------------------------------------------------------------------
// Chart building blocks
// ---------------------------------------------------------------------------

function Sparkline({ values, tone = 'navy', height = 22, width = 88 }: { values: number[]; tone?: 'positive' | 'navy' | 'negative'; height?: number; width?: number }) {
  const stroke = tone === 'positive' ? PALETTE.emerald : tone === 'negative' ? PALETTE.coral : PALETTE.navy
  const data = values.map((v, i) => ({ i, v }))
  return (
    <div style={{ height, width }} className="shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={1.3} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Horizontal stacked "₹100 of GWP" composition — the headline P&L visual.
function PremiumFunnel({ loss, commission, expense, hasCR }: { loss: number; commission: number; expense: number; hasCR: boolean }) {
  if (!hasCR) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-soft-border bg-ice/60 px-6 py-8 text-center text-[12px] text-ink-secondary">
        Life carrier — premium funnel does not apply on a P&C basis.
      </div>
    )
  }
  const total = loss + commission + expense
  const profit = Math.max(0, 100 - total)
  const lossOverhang = Math.max(0, total - 100)
  const segments = [
    { label: 'Claims', value: loss, color: PALETTE.coral, soft: PALETTE.coralSoft },
    { label: 'Commission', value: commission, color: PALETTE.amber, soft: PALETTE.amberSoft },
    { label: 'Opex', value: expense, color: PALETTE.navy, soft: PALETTE.softBlue },
    ...(profit > 0
      ? [{ label: 'Underwriting profit', value: profit, color: PALETTE.emerald, soft: PALETTE.emeraldSoft }]
      : [{ label: 'Underwriting loss', value: lossOverhang, color: PALETTE.coral, soft: PALETTE.coralSoft }]),
  ]
  const denom = Math.max(100, total)
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[10.5px] uppercase tracking-wide text-ink-secondary">
          For every <span className="font-display text-navy-deep">₹100</span> of GWP
        </p>
        <p className="text-[10.5px] text-ink-secondary">{profit > 0 ? `₹${profit.toFixed(1)} stays as underwriting profit` : `₹${lossOverhang.toFixed(1)} of underwriting loss`}</p>
      </div>
      <div className="mt-1.5 flex h-5 w-full overflow-hidden rounded-sm ring-1 ring-soft-border">
        {segments.map((s) => {
          const w = (s.value / denom) * 100
          return (
            <div
              key={s.label}
              title={`${s.label} · ₹${s.value.toFixed(1)}`}
              className="flex h-full items-center justify-center text-[9.5px] font-semibold text-white/95 transition-opacity duration-200 hover:opacity-80"
              style={{ width: `${w}%`, background: s.color }}
            >
              {w > 9 && `₹${s.value.toFixed(0)}`}
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[10px]">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-ink-secondary">
            <span className="h-1.5 w-1.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-navy-deep">{s.label}</span> ₹{s.value.toFixed(1)}
          </span>
        ))}
      </div>
    </div>
  )
}

// Combined ratio quarterly line with green strong / amber watch / red weak bands.
function CombinedRatioBandedTrend({ series }: { series: number[] }) {
  const data = QUARTER_LABELS.map((label, i) => ({ label, cr: series[i] }))
  const yMin = Math.min(94, ...series) - 1
  const yMax = Math.max(112, ...series) + 1
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: PALETTE.border }} />
        <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: PALETTE.border }} domain={[yMin, yMax]} width={36} unit="%" />
        <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [`${v.toFixed(1)}%`, 'Combined ratio']} />
        <ReferenceArea y1={yMin} y2={100} fill={PALETTE.emerald} fillOpacity={0.07} />
        <ReferenceArea y1={100} y2={105} fill={PALETTE.amber} fillOpacity={0.08} />
        <ReferenceArea y1={105} y2={yMax} fill={PALETTE.coral} fillOpacity={0.07} />
        <ReferenceLine y={100} stroke={PALETTE.amber} strokeDasharray="4 4" strokeWidth={0.8} />
        <Line type="monotone" dataKey="cr" stroke={PALETTE.navyDeep} strokeWidth={1.8} dot={{ r: 3, fill: PALETTE.navyDeep }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// Donut of where each rupee of premium goes; center label shows combined ratio.
function CostDonut({ cost, combinedRatio }: { cost: { loss: number; commission: number; expense: number }; combinedRatio: number }) {
  const data = [
    { label: 'Claims', value: cost.loss, color: PALETTE.coral },
    { label: 'Commission', value: cost.commission, color: PALETTE.amber },
    { label: 'Opex', value: cost.expense, color: PALETTE.navy },
  ]
  return (
    <div className="relative h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius="80%"
            outerRadius="94%"
            startAngle={90}
            endAngle={-270}
            stroke="#fff"
            strokeWidth={1}
            paddingAngle={1}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number, _n, p) => [`${v.toFixed(1)}%`, p.payload.label]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[9.5px] uppercase tracking-wide text-ink-secondary">Combined Ratio</span>
        <span className="font-display text-[24px] leading-none text-navy-deep">{combinedRatio.toFixed(1)}%</span>
        <span className={`mt-0.5 text-[10px] ${combinedRatio < 100 ? toneText.positive : combinedRatio <= 105 ? toneText.warning : toneText.negative}`}>
          {combinedRatio < 100 ? 'Underwriting profit' : combinedRatio <= 105 ? 'Watch zone' : 'Loss-making'}
        </span>
      </div>
    </div>
  )
}

// Quarterly PAT bars with the latest quarter highlighted.
function QuarterlyPatBars({ series }: { series: number[] }) {
  const data = QUARTER_LABELS.map((label, i) => ({ label, pat: series[i] }))
  const positive = series[series.length - 1] >= 0
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 6, right: 10, left: -10, bottom: 0 }} barCategoryGap="36%">
        <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: PALETTE.border }} />
        <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: PALETTE.border }} width={38} />
        <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [`₹${v.toLocaleString('en-IN')} Cr`, 'PAT']} cursor={{ fill: 'rgba(39,69,126,0.03)' }} />
        <ReferenceLine y={0} stroke={PALETTE.border} />
        <Bar dataKey="pat" radius={[4, 4, 0, 0]} maxBarSize={32}>
          {data.map((d, i) => {
            const isLast = i === data.length - 1
            const color = d.pat < 0 ? PALETTE.coral : isLast ? (positive ? PALETTE.emerald : PALETTE.coral) : PALETTE.softBlue
            const strokeC = d.pat < 0 ? PALETTE.coral : isLast ? PALETTE.emerald : PALETTE.navy
            return <Cell key={d.label} fill={color} stroke={strokeC} strokeWidth={isLast ? 1 : 0.4} />
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// 180° gauge — single colored arc whose width represents the current value's
// position inside [min..max], over a faint full-arc track.
function SemiGauge({ value, min, max, zones, unit = 'x', size = 180 }: {
  value: number
  min: number
  max: number
  zones: { from: number; to: number; color: string }[]
  unit?: string
  size?: number
}) {
  const clamped = Math.max(min, Math.min(max, value))
  const pct = (clamped - min) / (max - min)
  const angle = 180 * pct
  const arcData = [
    { name: 'fill', value: angle },
    { name: 'rest', value: 180 - angle },
  ]
  return (
    <div className="relative w-full" style={{ height: size * 0.58 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          {/* zone backdrop — thin tinted arc */}
          <Pie
            data={zones.map((z) => ({ name: z.color, value: ((z.to - z.from) / (max - min)) * 180 }))}
            dataKey="value"
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius="84%"
            outerRadius="93%"
            stroke="#fff"
            strokeWidth={0.5}
            isAnimationActive={false}
          >
            {zones.map((z, i) => (
              <Cell key={i} fill={z.color} fillOpacity={0.18} />
            ))}
          </Pie>
          {/* value arc — even thinner solid marker on top */}
          <Pie
            data={arcData}
            dataKey="value"
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius="94%"
            outerRadius="100%"
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill={zones.find((z) => clamped >= z.from && clamped <= z.to)?.color ?? PALETTE.navy} />
            <Cell fill="transparent" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="font-display text-[22px] leading-none text-navy-deep">
          {value.toFixed(unit === 'x' ? 2 : 1)}
          {unit}
        </span>
      </div>
    </div>
  )
}

// Underwriting Pulse — strip with green/amber/red zones and a position marker.
function CombinedRatioStrip({ value }: { value: number }) {
  const min = 92
  const max = 112
  const pct = ((Math.max(min, Math.min(max, value)) - min) / (max - min)) * 100
  return (
    <div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full">
        <div className="absolute inset-y-0 left-0" style={{ width: `${((100 - min) / (max - min)) * 100}%`, background: PALETTE.emerald, opacity: 0.28 }} />
        <div className="absolute inset-y-0" style={{ left: `${((100 - min) / (max - min)) * 100}%`, width: `${((105 - 100) / (max - min)) * 100}%`, background: PALETTE.amber, opacity: 0.28 }} />
        <div className="absolute inset-y-0" style={{ left: `${((105 - min) / (max - min)) * 100}%`, right: 0, background: PALETTE.coral, opacity: 0.28 }} />
        <div className="absolute -top-0.5 bottom-[-2px]" style={{ left: `calc(${pct}% - 1px)`, width: 2, background: PALETTE.navyDeep, boxShadow: '0 0 0 1.5px white' }} />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-ink-secondary">
        <span>92</span>
        <span>100</span>
        <span>105</span>
        <span>112</span>
      </div>
    </div>
  )
}

// Mini area chart for the right-rail Profit Velocity card.
function MiniPatArea({ values }: { values: number[] }) {
  const data = values.map((v, i) => ({ i, v }))
  const positive = values[values.length - 1] >= values[0]
  const color = positive ? PALETTE.emerald : PALETTE.coral
  return (
    <div className="h-[42px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id="miniPatFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.4} fill="url(#miniPatFill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// Mini radial gauge for the right-rail Capital Buffer card.
function MiniSolvencyDial({ value }: { value: number }) {
  const min = 1
  const max = 3.5
  const clamped = Math.max(min, Math.min(max, value))
  const pct = (clamped - min) / (max - min)
  const angle = 180 * pct
  const color = value >= 1.8 ? PALETTE.emerald : value >= 1.5 ? PALETTE.amber : PALETTE.coral
  return (
    <div className="relative h-[44px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={[{ v: 1 }]} cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius="86%" outerRadius="100%" dataKey="v" stroke="none" isAnimationActive={false}>
            <Cell fill={PALETTE.border} fillOpacity={0.45} />
          </Pie>
          <Pie
            data={[{ v: angle }, { v: 180 - angle }]}
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius="86%"
            outerRadius="100%"
            dataKey="v"
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill={color} />
            <Cell fill="transparent" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// One step in the inline Profit Bridge.
function BridgeStep({ label, value, caption, tone, isLast }: { label: string; value: string; caption: string; tone: Tone; isLast?: boolean }) {
  const bg = tone === 'positive' ? 'bg-[#F2F8F4]' : tone === 'warning' ? 'bg-[#FDF7E8]' : tone === 'negative' ? 'bg-[#FBF1F1]' : 'bg-soft-blue/70'
  return (
    <div className={`relative flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-2.5 py-2 ${bg}`}>
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-secondary">{label}</p>
      <p className="font-display text-[17px] leading-tight text-navy-deep">{value}</p>
      <div className="flex items-center gap-1.5">
        <span className={`h-1 w-1 shrink-0 rounded-full ${toneDot[tone]}`} />
        <span className={`text-[10px] leading-tight ${toneText[tone]}`}>{caption}</span>
      </div>
      {!isLast && (
        <span aria-hidden className="absolute -right-1.5 top-1/2 hidden h-2 w-2 -translate-y-1/2 rotate-45 border-r border-t border-white bg-inherit sm:block" />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

export function ProfitabilityCapital() {
  const [view, setView] = useState<View>('P&L')
  const company = useActiveCompany()
  const copy = getCompanyProfitabilityCopy(company)

  const hasCR = company.combinedRatio > 0
  const ct = hasCR ? combinedTone(company.combinedRatio) : { label: 'N/A', tone: 'neutral' as Tone }
  const mm = getMarginMetrics(company)
  const patSeries = NET_PROFIT_QUARTERS[company.id]
  const hasTrend = patSeries !== undefined
  const crSeries = COMBINED_RATIO_QUARTERS[company.id]
  const cost = COST_RATIOS[company.id]

  const growthTone: Tone = company.growth >= 20 ? 'positive' : company.growth >= 10 ? 'neutral' : 'warning'
  const netMarginTone: Tone = mm.netMargin > 5 ? 'positive' : mm.netMargin > 0 ? 'warning' : mm.netMargin === 0 ? 'neutral' : 'negative'
  const roeTone: Tone = company.roe >= 12 ? 'positive' : company.roe >= 5 ? 'warning' : 'negative'
  const solvencyTone: Tone = company.solvency >= 1.8 ? 'positive' : company.solvency >= 1.5 ? 'warning' : 'negative'

  const trendTone: 'positive' | 'navy' | 'negative' = !hasTrend
    ? 'navy'
    : patSeries[3] < 0
      ? 'negative'
      : patSeries[3] >= patSeries[0]
        ? 'positive'
        : 'navy'

  // Honest period stamps — snapshot is FY25 audited; PAT series is Q1–Q4 FY25.
  const m = (value: number | null, opts: Partial<Metric> = {}): Metric => ({
    value,
    period: 'FY25',
    source: 'Company filings (mock)',
    status: value === null ? 'Pending' : 'Reported',
    lastUpdated: '2025-05-23',
    ...opts,
  })
  const companyKpis: { label: string; metric: Metric; invert?: boolean }[] = [
    { label: 'GWP growth', metric: m(company.growth, { unit: '%' }) },
    { label: 'Combined ratio', metric: m(hasCR ? company.combinedRatio : null, { unit: '%' }), invert: true },
    { label: 'Net margin', metric: m(hasTrend ? mm.netMargin : null, { unit: '%', period: 'TTM' }) },
    { label: 'ROE', metric: m(company.roe, { unit: '%' }) },
    { label: 'Solvency', metric: m(company.solvency, { unit: 'x' }) },
  ]

  const verdictHeadline = !hasCR
    ? 'Returns and capital are the story'
    : ct.tone === 'positive'
      ? 'Premium growth is converting into profit'
      : ct.tone === 'warning'
        ? 'Growth ahead of underwriting discipline'
        : 'Growth not yet converting into profit'

  const verdictSummary = !hasCR
    ? `Life carrier — ROE ${company.roe.toFixed(1)}% and ${company.solvency.toFixed(2)}x solvency anchor the read.`
    : ct.tone === 'positive'
      ? `Combined ratio ${company.combinedRatio.toFixed(1)}%, ROE ${company.roe.toFixed(1)}% and ${company.solvency.toFixed(2)}x solvency — underwriting discipline is translating into capital returns.`
      : ct.tone === 'warning'
        ? `Combined ratio ${company.combinedRatio.toFixed(1)}% sits in the watch band; ROE ${company.roe.toFixed(1)}% holds while solvency stays at ${company.solvency.toFixed(2)}x.`
        : `Combined ratio ${company.combinedRatio.toFixed(1)}% is loss-making; profitability hinges on the ${company.solvency.toFixed(2)}x capital cushion.`

  const heroTone = ct.tone === 'positive' ? PALETTE.emerald : ct.tone === 'warning' ? PALETTE.amber : ct.tone === 'negative' ? PALETTE.coral : PALETTE.navy
  const heroChips = [
    { label: 'Combined Ratio · FY25', value: hasCR ? `${company.combinedRatio.toFixed(1)}%` : 'N/A', tone: ct.tone },
    { label: 'ROE · FY25', value: `${company.roe.toFixed(1)}%`, tone: roeTone },
    { label: 'Solvency · FY25', value: `${company.solvency.toFixed(2)}x`, tone: solvencyTone },
  ]

  return (
    <div className="space-y-4">
      {/* ─── HERO — gradient strip, verdict, chips, PAT mini-trend ─── */}
      <section className="card-surface relative overflow-hidden p-4">
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: `linear-gradient(180deg, ${heroTone} 0%, ${PALETTE.champagne} 100%)` }} />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-1/3 opacity-60"
          style={{
            background: `radial-gradient(circle at 80% 30%, ${PALETTE.champagneSoft} 0%, transparent 60%), radial-gradient(circle at 60% 80%, ${PALETTE.softBlue} 0%, transparent 60%)`,
          }}
        />
        <div className="relative flex flex-wrap items-center gap-x-5 gap-y-3 pl-2">
          <div className="min-w-[240px] flex-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-2.5 w-2.5 text-champagne" />
              <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Profitability Verdict</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[19px] leading-tight text-navy-deep">{verdictHeadline}</h2>
              <SignalBadge label={copy.badge} tone={copy.tone === 'positive' ? 'positive' : copy.tone === 'warning' ? 'warning' : copy.tone === 'negative' ? 'negative' : copy.tone === 'teal' ? 'teal' : 'navy'} size="sm" />
            </div>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-ink-secondary">{verdictSummary}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {heroChips.map((c) => (
              <div
                key={c.label}
                className="rounded-md border border-soft-border bg-white/80 px-2.5 py-1 backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5"
              >
                <p className="text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary">{c.label}</p>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="font-display text-[15px] leading-none text-navy-deep">{c.value}</span>
                  <span className={`h-1 w-1 rounded-full ${toneDot[c.tone]}`} />
                </div>
              </div>
            ))}
          </div>

          {hasTrend && (
            <div className="flex items-center gap-2.5 rounded-md border border-soft-border bg-white/80 px-2.5 py-1.5">
              <div>
                <p className="text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary">PAT · Q4 FY25</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display text-[15px] leading-none text-navy-deep">₹{patSeries[3]} Cr</span>
                  {mm.yoyImprovement >= 0 ? (
                    <span className="flex items-center gap-0.5 text-[9.5px] text-signal-positive">
                      <TrendingUp className="h-2.5 w-2.5" />
                      {mm.yoyImprovement.toFixed(0)}%
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[9.5px] text-signal-negative">
                      <TrendingDown className="h-2.5 w-2.5" />
                      {mm.yoyImprovement.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <Sparkline values={patSeries} tone={trendTone} />
            </div>
          )}
        </div>
        <div className="relative mt-2 flex justify-end pl-2">
          <span className="text-[9.5px] text-ink-secondary">Source · Company filing + IRDAI disclosures · FY25</span>
        </div>
      </section>

      {/* ─── MAIN STORY — tabs drive the central chart, right rail keeps mini-visuals ─── */}
      <ModuleCard
        question="Is premium growth converting into profit, underwriting discipline and strong capital returns?"
        title={`${company.shortName} · Profitability Story`}
        icon="capital"
        controls={
          <SegmentedControl<View>
            label="View lens"
            options={['P&L', 'Margin', 'Cost', 'Returns', 'Capital'] as View[]}
            value={view}
            onChange={setView}
            size="sm"
          />
        }
        insight={
          <div className="flex flex-col gap-2.5">
            {/* Underwriting Pulse */}
            <div
              className="relative overflow-hidden rounded-lg border border-[#D9EBE0] px-3 py-2.5"
              style={{ background: `linear-gradient(135deg, #F4F9F6 0%, #EAF4F1 100%)` }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-emerald-700/80">Underwriting Pulse</p>
                <SignalBadge label={ct.label} tone={ct.tone === 'neutral' ? 'navy' : ct.tone} size="sm" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-[19px] leading-none text-navy-deep">{hasCR ? `${company.combinedRatio.toFixed(1)}%` : 'N/A'}</span>
                <span className="text-[9.5px] text-ink-secondary">Combined ratio · FY25</span>
              </div>
              {hasCR && (
                <div className="mt-2">
                  <CombinedRatioStrip value={company.combinedRatio} />
                </div>
              )}
            </div>

            {/* Profit Velocity */}
            <div
              className="relative overflow-hidden rounded-lg border border-soft-border px-3 py-2.5"
              style={{ background: `linear-gradient(135deg, ${PALETTE.softBlue} 0%, #FFFFFF 100%)` }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-navy-primary">Profit Velocity</p>
                <SignalBadge
                  label={netMarginTone === 'positive' ? 'Healthy' : netMarginTone === 'warning' ? 'Thin' : netMarginTone === 'neutral' ? 'Pending' : 'Loss'}
                  tone={netMarginTone === 'neutral' ? 'navy' : netMarginTone}
                  size="sm"
                />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-[19px] leading-none text-navy-deep">{hasTrend ? `${mm.netMargin.toFixed(1)}%` : '—'}</span>
                <span className="text-[9.5px] text-ink-secondary">net margin · TTM</span>
              </div>
              {hasTrend && (
                <>
                  <div className="mt-1.5"><MiniPatArea values={patSeries} /></div>
                  <p className={`mt-0.5 text-[9.5px] ${mm.yoyImprovement >= 0 ? toneText.positive : toneText.negative}`}>
                    PAT {mm.yoyImprovement >= 0 ? '+' : ''}
                    {mm.yoyImprovement.toFixed(1)}% vs prior 3Q avg
                  </p>
                </>
              )}
            </div>

            {/* Capital Buffer */}
            <div
              className="relative overflow-hidden rounded-lg border border-[#EFE2C2] px-3 py-2.5"
              style={{ background: `linear-gradient(135deg, ${PALETTE.champagneSoft} 0%, #FFFBF1 100%)` }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-champagne-deep">Capital Buffer</p>
                <SignalBadge
                  label={solvencyTone === 'positive' ? 'Comfortable' : solvencyTone === 'warning' ? 'Adequate' : 'Tight'}
                  tone={solvencyTone}
                  size="sm"
                />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-[19px] leading-none text-navy-deep">{company.solvency.toFixed(2)}x</span>
                <span className="text-[9.5px] text-ink-secondary">vs 1.5x floor</span>
              </div>
              <div className="mt-1"><MiniSolvencyDial value={company.solvency} /></div>
            </div>
          </div>
        }
        dataStatus={companyKpis.map((k) => ({ label: k.label, metric: k.metric }))}
        dataBasis={profitabilityBasis}
      >
        {/* ───── Morphing chart per tab ───── */}
        {view === 'P&L' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-soft-border bg-white p-4">
              <div className="mb-2.5 flex items-baseline justify-between">
                <div>
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Premium Funnel</p>
                  <h3 className="mt-0 font-display text-[14px] text-navy-deep">Where every rupee of premium goes</h3>
                </div>
                <span className="text-[9.5px] text-ink-secondary">FY25</span>
              </div>
              {cost ? <PremiumFunnel loss={cost.loss} commission={cost.commission} expense={cost.expense} hasCR={hasCR} /> : <PremiumFunnel loss={0} commission={0} expense={0} hasCR={false} />}
            </div>
            <div className="rounded-xl border border-soft-border bg-white p-4">
              <div className="mb-2.5 flex items-baseline justify-between">
                <div>
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Profit Bridge</p>
                  <h3 className="mt-0 font-display text-[14px] text-navy-deep">From growth to capital strength</h3>
                </div>
                <span className="text-[9.5px] text-ink-secondary">FY25 · TTM</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <BridgeStep label="GWP Growth" value={`${company.growth.toFixed(0)}%`} caption="Growth engine" tone={growthTone} />
                <BridgeStep
                  label="Combined Ratio"
                  value={hasCR ? `${company.combinedRatio.toFixed(1)}%` : 'N/A'}
                  caption={hasCR ? (ct.tone === 'positive' ? 'Underwriting profit' : ct.tone === 'warning' ? 'Watch zone' : 'Loss-making') : 'Life carrier'}
                  tone={hasCR ? ct.tone : 'neutral'}
                />
                <BridgeStep
                  label="Net Margin"
                  value={hasTrend ? `${mm.netMargin.toFixed(1)}%` : '—'}
                  caption={hasTrend ? (mm.netMargin > 5 ? 'Profit conversion' : mm.netMargin > 0 ? 'Thin conversion' : 'No conversion') : 'Pending'}
                  tone={hasTrend ? netMarginTone : 'neutral'}
                />
                <BridgeStep label="ROE" value={`${company.roe.toFixed(1)}%`} caption={roeTone === 'positive' ? 'Strong return' : roeTone === 'warning' ? 'Early signal' : 'Sub-cost'} tone={roeTone} />
                <BridgeStep label="Solvency" value={`${company.solvency.toFixed(2)}x`} caption="Capital cushion" tone={solvencyTone} isLast />
              </div>
            </div>
          </div>
        )}

        {view === 'Margin' && (
          <div className="rounded-xl border border-soft-border bg-white p-4">
            <div className="mb-2.5 flex items-baseline justify-between">
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Margin Lens</p>
                <h3 className="mt-0 font-display text-[14px] text-navy-deep">Combined ratio trajectory · Q1–Q4 FY25</h3>
              </div>
              <SignalBadge label={ct.label} tone={ct.tone === 'neutral' ? 'navy' : ct.tone} size="sm" />
            </div>
            {hasCR && crSeries ? (
              <>
                <CombinedRatioBandedTrend series={crSeries} />
                <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-[10.5px]">
                  <div className="rounded bg-[#EAF3EE] px-2 py-1">
                    <span className="font-semibold text-signal-positive">&lt;100</span>
                    <span className="ml-1 text-ink-secondary">strong</span>
                  </div>
                  <div className="rounded bg-[#FBF3E2] px-2 py-1">
                    <span className="font-semibold text-signal-warning">100–105</span>
                    <span className="ml-1 text-ink-secondary">watch</span>
                  </div>
                  <div className="rounded bg-[#F8ECEC] px-2 py-1">
                    <span className="font-semibold text-signal-negative">&gt;105</span>
                    <span className="ml-1 text-ink-secondary">weak</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[12px] text-ink-secondary">{company.shortName} is a life carrier — combined ratio does not apply.</p>
            )}
          </div>
        )}

        {view === 'Cost' && (
          <div className="rounded-xl border border-soft-border bg-white p-4">
            <div className="mb-2.5 flex items-baseline justify-between">
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Cost Lens</p>
                <h3 className="mt-0 font-display text-[14px] text-navy-deep">Anatomy of every ₹100 of premium</h3>
              </div>
              <span className="text-[9.5px] text-ink-secondary">FY25 mock</span>
            </div>
            {cost ? (
              <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[1fr_1fr]">
                <CostDonut cost={cost} combinedRatio={company.combinedRatio} />
                <div className="space-y-2.5">
                  {[
                    { label: 'Claims (loss ratio)', value: cost.loss, color: PALETTE.coral, note: cost.loss > 70 ? 'Above sector ~70%' : 'Below sector ~70%' },
                    { label: 'Commission', value: cost.commission, color: PALETTE.amber, note: cost.commission > 13 ? 'High retail mix' : 'Within band' },
                    { label: 'Opex (expense ratio)', value: cost.expense, color: PALETTE.navy, note: cost.expense > 24 ? 'Investing for scale' : 'Lean opex' },
                  ].map((r) => (
                    <div key={r.label}>
                      <div className="flex items-baseline justify-between">
                        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-navy-deep">
                          <span className="h-1.5 w-1.5 rounded-sm" style={{ background: r.color }} />
                          {r.label}
                        </span>
                        <span className="font-display text-[13px] text-navy-deep">{r.value.toFixed(1)}%</span>
                      </div>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-ice">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.value)}%`, background: r.color }} />
                      </div>
                      <p className="mt-0.5 text-[10px] text-ink-secondary">{r.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[11.5px] text-ink-secondary">{company.shortName} is a life carrier — claims / commission / opex split is not reported on this P&C basis.</p>
            )}
          </div>
        )}

        {view === 'Returns' && (
          <div className="rounded-xl border border-soft-border bg-white p-4">
            <div className="mb-2.5 flex items-baseline justify-between">
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Returns Lens</p>
                <h3 className="mt-0 font-display text-[14px] text-navy-deep">Quarterly PAT trajectory · Q1–Q4 FY25</h3>
              </div>
              <span className="text-[9.5px] text-ink-secondary">ROE · {company.roe.toFixed(1)}%</span>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr]">
              {hasTrend ? (
                <QuarterlyPatBars series={patSeries} />
              ) : (
                <div className="flex h-[180px] items-center justify-center rounded-md border border-dashed border-soft-border bg-ice/60 text-[11.5px] text-ink-secondary">
                  Quarterly PAT pending for {company.shortName}
                </div>
              )}
              <div
                className="relative overflow-hidden rounded-lg p-3.5"
                style={{ background: `linear-gradient(135deg, ${PALETTE.softBlue} 0%, ${PALETTE.champagneSoft} 100%)` }}
              >
                <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-navy-primary">ROE · FY25</p>
                <p className="mt-0.5 font-display text-[26px] leading-none text-navy-deep">{company.roe.toFixed(1)}%</p>
                <p className={`mt-0.5 text-[10.5px] ${toneText[roeTone]}`}>
                  {roeTone === 'positive' ? 'Above sector benchmark' : roeTone === 'warning' ? 'Early return signal' : 'Sub-cost-of-capital'}
                </p>
                <SemiGauge
                  value={company.roe}
                  min={0}
                  max={22}
                  unit="%"
                  zones={[
                    { from: 0, to: 5, color: PALETTE.coral },
                    { from: 5, to: 12, color: PALETTE.amber },
                    { from: 12, to: 22, color: PALETTE.emerald },
                  ]}
                  size={150}
                />
              </div>
            </div>
          </div>
        )}

        {view === 'Capital' && (
          <div className="rounded-xl border border-soft-border bg-white p-4">
            <div className="mb-2.5 flex items-baseline justify-between">
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Capital Lens</p>
                <h3 className="mt-0 font-display text-[14px] text-navy-deep">Solvency vs regulatory comfort zone</h3>
              </div>
              <SignalBadge
                label={solvencyTone === 'positive' ? 'Comfortable' : solvencyTone === 'warning' ? 'Adequate' : 'Tight'}
                tone={solvencyTone}
                size="sm"
              />
            </div>
            <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-[1fr_1fr]">
              <SemiGauge
                value={company.solvency}
                min={1}
                max={3.5}
                unit="x"
                zones={[
                  { from: 1, to: 1.5, color: PALETTE.coral },
                  { from: 1.5, to: 2, color: PALETTE.amber },
                  { from: 2, to: 3.5, color: PALETTE.emerald },
                ]}
              />
              <div className="space-y-1.5 text-[11.5px]">
                <div className="flex items-center justify-between rounded bg-[#F8ECEC] px-2.5 py-1.5">
                  <span className="text-navy-deep">Regulatory floor</span>
                  <span className="font-semibold text-signal-negative">1.50x</span>
                </div>
                <div className="flex items-center justify-between rounded bg-[#FBF3E2] px-2.5 py-1.5">
                  <span className="text-navy-deep">Sector median</span>
                  <span className="font-semibold text-signal-warning">~2.10x</span>
                </div>
                <div className="flex items-center justify-between rounded bg-[#EAF3EE] px-2.5 py-1.5">
                  <span className="text-navy-deep">{company.shortName}</span>
                  <span className="font-semibold text-signal-positive">{company.solvency.toFixed(2)}x</span>
                </div>
                <p className="pt-0.5 text-[10px] text-ink-secondary">
                  {company.solvency >= 2 ? `Cushion of ${(company.solvency - 1.5).toFixed(2)}x above the regulatory floor.` : company.solvency >= 1.5 ? 'Above floor but below sector median.' : 'Capital cushion thin — watch quarterly trajectory.'}
                </p>
              </div>
            </div>
          </div>
        )}

        <BasisTag info={profitabilityBasis} className="mt-3" />
      </ModuleCard>

      {/* ─── SO WHAT — tinted, sharp investor read ─── */}
      <section
        className="card-surface relative overflow-hidden p-4"
        style={{ background: `linear-gradient(135deg, #FFFFFF 0%, ${PALETTE.champagneSoft} 110%)` }}
      >
        <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: `linear-gradient(180deg, ${PALETTE.champagne} 0%, ${heroTone} 100%)` }} />
        <div className="flex flex-wrap items-baseline justify-between gap-2 pl-2.5">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Investor Read</p>
            <h3 className="mt-0 font-display text-[15px] text-navy-deep">So what?</h3>
          </div>
          <span className="text-[9.5px] text-ink-secondary">FY25 · {company.shortName}</span>
        </div>
        <dl className="mt-2 grid grid-cols-1 gap-x-5 gap-y-1.5 pl-2.5 sm:grid-cols-[100px_1fr]">
          {copy.readLines.map((line, i) => (
            <div key={line.label} className="contents">
              <dt className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-champagne-deep">{line.label}</dt>
              <dd className={`text-[11.5px] leading-relaxed ${i === 1 ? 'font-medium text-navy-deep' : 'text-navy-deep/85'}`}>{line.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
