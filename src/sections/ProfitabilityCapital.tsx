import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
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
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  ShieldCheck,
  Shield,
  Gauge,
  IndianRupee,
  BarChart3,
  Cog,
  ChevronRight,
  ArrowRightLeft,
  type LucideIcon,
} from 'lucide-react'
import { ModuleCard } from '@/components/ModuleCard'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SignalBadge } from '@/components/SignalBadge'
import { BasisTag } from '@/components/BasisTag'
import { SourceTag } from '@/components/SourceTag'
import { profitabilityBasis } from '@/data/mockData'
import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'
import { useActiveCompany, useFilters } from '@/state/filters'
import { labelInRange } from '@/lib/dateRange'
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

type Tone = 'positive' | 'warning' | 'negative' | 'neutral' | 'navy'

const toneText: Record<Tone, string> = {
  positive: 'text-signal-positive',
  warning: 'text-signal-warning',
  negative: 'text-signal-negative',
  neutral: 'text-ink-secondary',
  navy: 'text-navy-primary',
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

// Compact upward area sparkline for the verdict PAT callout.
function HeroPatSparkline({ values, color }: { values: number[]; color: string }) {
  const data = values.map((v, i) => ({ i, v }))
  return (
    <div className="h-[42px] w-[112px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id="heroPatFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.26} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.7} fill="url(#heroPatFill)" isAnimationActive={false} />
        </AreaChart>
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

// ---------------------------------------------------------------------------
// Real annual snapshot series (focal company) — drives the new story layers.
// Only real reported values are used; missing inputs stay null (never 0) and
// surface as compact "pending" states per the dashboard's data-integrity rules.
// ---------------------------------------------------------------------------

interface AnnualPoint {
  fy: string
  gwp: number | null
  nep: number | null
  pat: number | null
  combinedRatio: number | null
  expenseRatio: number | null
  solvency: number | null
}

// Plausibility bounds — several non-focal rows in the snapshot still carry
// placeholder/unit-error values (e.g. gwp 23, combined_ratio 1.15, nep 135982).
// Anything outside a sane range is treated as missing (null) rather than shown,
// so the story layers degrade to honest "pending" states instead of garbage.
function inRange(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null
}

function getAnnualSeries(companyId: string): AnnualPoint[] {
  return (annualSnapshot.data as Array<Record<string, unknown>>)
    .filter((r) => r.company_id === companyId)
    .map((r) => ({
      fy: String(r.fiscal_year),
      gwp: inRange(r.gwp, 100, 100000),
      nep: inRange(r.nep, 100, 100000),
      pat: typeof r.pat === 'number' && Number.isFinite(r.pat) && Math.abs(r.pat) <= 20000 ? r.pat : null,
      combinedRatio: inRange(r.combined_ratio, 40, 250),
      expenseRatio: inRange(r.expense_ratio, 2, 90),
      solvency: inRange(r.solvency_ratio, 0.3, 8),
    }))
    .sort((a, b) => a.fy.localeCompare(b.fy))
}

/**
 * Derived underwriting result (₹ Cr) = NEP × (1 − combined ratio). A transparent,
 * standard proxy for core insurance profit before investment/other income; used
 * because net claims / commission line items aren't separately reported per year.
 * Returns null when either input is missing (never coerced to 0).
 */
function underwritingResult(p: AnnualPoint): number | null {
  if (p.nep == null || p.combinedRatio == null) return null
  return Math.round(p.nep * (1 - p.combinedRatio / 100))
}

const crc = (v: number) => `${v < 0 ? '−' : ''}₹${Math.abs(Math.round(v)).toLocaleString('en-IN')} Cr`

const toneBg: Record<Tone, string> = {
  positive: 'bg-[#F2F8F4]',
  warning: 'bg-[#FDF7E8]',
  negative: 'bg-[#FBF1F1]',
  neutral: 'bg-soft-blue/70',
  navy: 'bg-soft-blue/70',
}

// Compact pending state — never a large blank box. Says exactly what's missing.
function PendingNote({ children }: { children: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed border-soft-border bg-ice/50 px-3 py-2.5 text-[11px] leading-snug text-ink-secondary">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-blue/60" />
      <span>{children}</span>
    </div>
  )
}

// Shared compact section header (champagne eyebrow + display title + subtitle).
function StoryHeader({ eyebrow, title, subtitle, right }: { eyebrow: string; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 h-4 w-1 shrink-0 rounded-full" style={{ background: PALETTE.champagne }} />
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">{eyebrow}</p>
          <h3 className="font-display text-[15px] leading-tight text-navy-deep">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] leading-snug text-ink-secondary">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

// ─── (B) Profitability Engine — premium → profit → capital, one infographic ──
// Replaces the old "Profitability Bridge" KPI strip. Each metric appears exactly
// once; values reuse the same derivations so the story stays honest and dynamic
// across companies. Missing inputs render as "n/a"/"Pending", never coerced to 0.

interface EngineStage {
  n: number
  label: string
  metricLabel: string
  value: string
  missing: boolean
  color: string
  Icon: LucideIcon
  read: string
}

function ProfitabilityEngine({ company, series }: { company: Insurer; series: AnnualPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const hasCR = company.combinedRatio > 0
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const uw = latest ? underwritingResult(latest) : null
  const patMargin = latest && latest.pat != null && latest.gwp ? (latest.pat / latest.gwp) * 100 : null
  const roe = company.roe
  const solvency = company.solvency
  const period = latest?.fy ?? 'FY25'

  // Fixed stage palette tells the green → amber → green story; tones are not
  // re-derived per value (the interpretation copy below carries the nuance).
  const tealSoft = '#D5ECEB'
  const orange = '#C2691C'

  const stages: EngineStage[] = [
    {
      n: 1,
      label: 'Underwriting discipline',
      metricLabel: 'Combined ratio',
      value: hasCR ? `${company.combinedRatio.toFixed(1)}%` : 'n/a',
      missing: !hasCR,
      color: PALETTE.emerald,
      Icon: ShieldCheck,
      read: !hasCR
        ? `${company.shortName} is a life carrier — combined ratio does not apply on this basis.`
        : company.combinedRatio < 100
          ? `Combined ratio of ${company.combinedRatio.toFixed(1)}% sits below 100% — underwriting is profitable before investment income.`
          : `Combined ratio of ${company.combinedRatio.toFixed(1)}% is above 100% — underwriting is loss-making before investment income.`,
    },
    {
      n: 2,
      label: 'Core profitability',
      metricLabel: 'Underwriting profit',
      value: uw == null ? 'Pending' : crc(uw),
      missing: uw == null,
      color: PALETTE.teal,
      Icon: Gauge,
      read:
        uw == null
          ? 'Awaiting reported NEP and combined ratio to size core operating profit.'
          : uw > 0
            ? `That discipline throws off about ${crc(uw)} of core underwriting profit.`
            : `Core underwriting is running a ${crc(uw)} loss.`,
    },
    {
      n: 3,
      label: 'Profit conversion',
      metricLabel: 'PAT margin',
      value: patMargin == null ? 'Pending' : `${patMargin.toFixed(1)}%`,
      missing: patMargin == null,
      color: PALETTE.amber,
      Icon: IndianRupee,
      read:
        patMargin == null
          ? 'Awaiting reported PAT to measure how premium converts to profit.'
          : `About ${patMargin.toFixed(1)}% of premium converts into reported profit after tax and other lines.`,
    },
    {
      n: 4,
      label: 'Shareholder return',
      metricLabel: 'ROE',
      value: roe > 0 ? `${roe.toFixed(1)}%` : 'n/a',
      missing: !(roe > 0),
      color: orange,
      Icon: BarChart3,
      read: roe > 0 ? `That profit earns shareholders a ${roe.toFixed(1)}% return on equity.` : 'Return on equity is pending for this carrier.',
    },
    {
      n: 5,
      label: 'Capital support',
      metricLabel: 'Solvency',
      value: solvency > 0 ? `${solvency.toFixed(2)}x` : 'n/a',
      missing: !(solvency > 0),
      color: PALETTE.emerald,
      Icon: Shield,
      read: solvency > 0 ? `A ${solvency.toFixed(2)}x solvency cushion funds growth well above the 1.5x regulatory floor.` : 'Solvency is pending for this carrier.',
    },
  ]

  const insights: { label: string; text: string; color: string; soft: string; Icon: LucideIcon }[] = [
    {
      label: 'Discipline',
      text: !hasCR
        ? 'Returns and capital carry the read on a life basis.'
        : company.combinedRatio < 100
          ? 'Combined ratio below 100% shows underwriting control.'
          : 'Combined ratio above 100% — underwriting discipline is the watch-item.',
      color: PALETTE.emerald,
      soft: PALETTE.emeraldSoft,
      Icon: ShieldCheck,
    },
    {
      label: 'Conversion',
      text:
        uw == null || patMargin == null
          ? 'Profit conversion firms up once the full P&L lands.'
          : uw > 0 && patMargin > 0
            ? 'Underwriting profit is flowing into reported profitability.'
            : 'Reported profit is leaning on investment income, not underwriting.',
      color: PALETTE.teal,
      soft: tealSoft,
      Icon: ArrowRightLeft,
    },
    {
      label: 'Returns',
      text: roe <= 0 ? 'ROE anchors the shareholder-return story.' : roe < 12 ? 'ROE is improving but still has room to scale.' : 'ROE sits comfortably above the cost of capital.',
      color: PALETTE.amber,
      soft: PALETTE.amberSoft,
      Icon: TrendingUp,
    },
    {
      label: 'Capital cushion',
      text: solvency > 0 ? `${solvency.toFixed(2)}x solvency supports growth and resilience.` : 'A solvency cushion supports growth and resilience.',
      color: PALETTE.emerald,
      soft: PALETTE.emeraldSoft,
      Icon: Shield,
    },
  ]

  return (
    <section className="card-surface p-5">
      {/* Header — gear eyebrow + story subtitle */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: PALETTE.champagneSoft }}>
          <Cog className="h-4 w-4" style={{ color: PALETTE.champagne }} />
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Profitability Engine</p>
          <p className="text-[11.5px] leading-snug text-ink-secondary">From underwriting discipline to shareholder returns</p>
        </div>
      </div>

      {/* Flow — five connected nodes, soft gradient connectors */}
      <div className="mt-7 flex flex-col gap-7 md:flex-row md:items-start md:gap-0">
        {stages.map((s, i) => {
          const isHover = hovered === i
          return (
            <div
              key={s.n}
              className="relative flex min-w-0 flex-col items-center px-1 text-center md:flex-1"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* gradient connector: previous node centre → this node centre */}
              {i > 0 && (
                <span
                  aria-hidden
                  className="absolute left-[-50%] right-1/2 top-[38px] z-0 hidden h-[2px] -translate-y-1/2 md:block"
                  style={{ background: `linear-gradient(90deg, ${stages[i - 1].color} 0%, ${s.color} 100%)`, opacity: 0.55 }}
                />
              )}
              {i > 0 && (
                <span
                  aria-hidden
                  className="absolute left-0 top-[38px] z-10 hidden h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-soft-border bg-white shadow-sm md:flex"
                >
                  <ChevronRight className="h-2.5 w-2.5" style={{ color: s.color }} />
                </span>
              )}

              {/* Node */}
              <div className="relative z-10">
                <span
                  aria-hidden
                  className="absolute -inset-[6px] rounded-full border border-dashed transition-opacity duration-300"
                  style={{ borderColor: s.color, opacity: isHover ? 0.5 : 0.28 }}
                />
                <div
                  className="relative flex h-[76px] w-[76px] items-center justify-center rounded-full border-2 bg-white transition-all duration-300"
                  style={{
                    borderColor: s.color,
                    transform: isHover ? 'translateY(-3px)' : 'translateY(0)',
                    boxShadow: isHover ? `0 12px 26px ${s.color}55` : `0 6px 16px ${s.color}26`,
                    opacity: s.missing ? 0.6 : 1,
                  }}
                >
                  <s.Icon className="h-7 w-7" style={{ color: s.color }} strokeWidth={1.6} />
                </div>
                <span
                  className="absolute -top-2 left-1/2 z-20 flex h-[18px] w-[18px] -translate-x-1/2 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm"
                  style={{ background: s.color }}
                >
                  {s.n}
                </span>
              </div>

              {/* Label + single metric */}
              <p className="mt-3.5 font-display text-[13px] font-semibold leading-tight text-navy-deep">{s.label}</p>
              <span aria-hidden className="my-1.5 h-px w-6" style={{ background: PALETTE.border }} />
              <p className="text-[9.5px] uppercase tracking-wide text-ink-secondary">{s.metricLabel}</p>
              {s.missing ? (
                <p className="font-display text-[14px] italic leading-none text-ink-secondary/80">{s.value}</p>
              ) : (
                <p className="font-display text-[19px] leading-none" style={{ color: s.color }}>
                  {s.value}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Per-stage read on hover — no always-on breadcrumb; reserved height
          keeps the layout calm (no jump). */}
      <div className="mt-5 flex min-h-[26px] items-center justify-center px-4 text-center">
        {hovered != null && (
          <p className="text-[11.5px] leading-snug text-navy-deep/80 transition-opacity duration-300">
            <span className="font-semibold" style={{ color: stages[hovered].color }}>
              {stages[hovered].label}:
            </span>{' '}
            {stages[hovered].read}
          </p>
        )}
      </div>

      {/* Insight strip — four light reads, no repeated KPI cards */}
      <div className="mt-5 rounded-xl border border-soft-border bg-ice/60 p-3.5">
        <div className="grid grid-cols-1 gap-x-5 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {insights.map((it) => (
            <div key={it.label} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: it.soft }}>
                <it.Icon className="h-3.5 w-3.5" style={{ color: it.color }} strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-navy-deep">{it.label}</p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-ink-secondary">{it.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Source */}
      <div className="mt-3 flex justify-end">
        <SourceTag source="Company filing + IRDAI disclosures" period={period} confidence="high" />
      </div>
    </section>
  )
}

// ─── (D) Underwriting Profit Trend — derived core profit, CR overlay ─────────
function UnderwritingProfitTrend({ company, series }: { company: Insurer; series: AnnualPoint[] }) {
  const data = series.map((p) => ({ fy: p.fy, uw: underwritingResult(p), cr: p.combinedRatio }))
  const usable = data.filter((d) => d.uw != null) as { fy: string; uw: number; cr: number | null }[]
  const enough = usable.length >= 2
  const latest = usable[usable.length - 1]
  const turned = enough && usable.some((d) => d.uw < 0) && latest.uw > 0
  const insightLine = !enough
    ? `Underwriting-profit trend pending for ${company.shortName} — needs reported NEP and combined ratio for at least two years.`
    : turned
      ? 'Core underwriting turned profitable as combined ratio moved below 100%.'
      : latest.uw > 0
        ? 'Core underwriting is profitable, with combined ratio holding below 100%.'
        : 'Core underwriting is still in loss as combined ratio sits above 100%.'
  return (
    <section className="card-surface p-4">
      <StoryHeader
        eyebrow="Underwriting Profit Trend"
        title="Core insurance profitability"
        subtitle={insightLine}
        right={
          enough ? (
            <SignalBadge label={latest.uw > 0 ? (turned ? 'Turned positive' : 'In profit') : 'In loss'} tone={latest.uw > 0 ? 'positive' : 'negative'} size="sm" />
          ) : undefined
        }
      />
      <div className="mt-3">
        {enough ? (
          <ResponsiveContainer width="100%" height={208}>
            <ComposedChart data={usable} margin={{ top: 12, right: 6, left: -10, bottom: 0 }} barCategoryGap="34%">
              <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} vertical={false} />
              <XAxis dataKey="fy" tick={{ fontSize: 11, fill: '#6B7280', fontWeight: 600 }} tickLine={false} axisLine={{ stroke: PALETTE.border }} />
              <YAxis yAxisId="uw" tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={false} width={46} tickFormatter={(v: number) => `₹${v}`} />
              <YAxis yAxisId="cr" orientation="right" tick={{ fontSize: 9.5, fill: PALETTE.champagne }} tickLine={false} axisLine={false} width={30} unit="%" domain={['dataMin - 3', 'dataMax + 3']} />
              <Tooltip
                cursor={{ fill: 'rgba(39,69,126,0.03)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null
                  const row = payload[0]?.payload as { uw: number; cr: number | null }
                  return (
                    <div className="rounded-lg border border-soft-border bg-card px-3 py-2 text-[11px] shadow-card">
                      <p className="mb-1 font-semibold text-navy-deep">{label}</p>
                      <p className="flex items-center justify-between gap-4">
                        <span className="text-ink-secondary">Underwriting {row.uw < 0 ? 'loss' : 'profit'}</span>
                        <span className="font-semibold tabular-nums text-navy-deep">{crc(row.uw)}</span>
                      </p>
                      {row.cr != null && (
                        <p className="flex items-center justify-between gap-4">
                          <span className="text-ink-secondary">Combined ratio</span>
                          <span className="font-semibold tabular-nums" style={{ color: PALETTE.champagne }}>{row.cr.toFixed(1)}%</span>
                        </p>
                      )}
                    </div>
                  )
                }}
              />
              <ReferenceLine yAxisId="uw" y={0} stroke={PALETTE.navy} strokeOpacity={0.35} />
              <Bar yAxisId="uw" dataKey="uw" name="Underwriting profit" radius={[3, 3, 0, 0]} maxBarSize={40}>
                {usable.map((d, i) => {
                  const isLast = i === usable.length - 1
                  const fill = d.uw < 0 ? PALETTE.coral : isLast ? PALETTE.emerald : PALETTE.teal
                  return <Cell key={d.fy} fill={fill} stroke={isLast ? PALETTE.navyDeep : 'none'} strokeWidth={isLast ? 1.2 : 0} />
                })}
              </Bar>
              <Line yAxisId="cr" type="monotone" dataKey="cr" name="Combined ratio" stroke={PALETTE.champagne} strokeWidth={1.5} dot={{ r: 2.5, fill: PALETTE.champagne }} activeDot={{ r: 4 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <PendingNote>{`Underwriting profit trend pending for ${company.shortName} — needs reported NEP and combined ratio for at least two years. Combined ratio overlay shown where available.`}</PendingNote>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-secondary">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: PALETTE.emerald }} /> Underwriting profit</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: PALETTE.coral }} /> Underwriting loss</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded-full" style={{ background: PALETTE.champagne }} /> Combined ratio</span>
        </div>
        <SourceTag source={enough ? 'Company filing · derived' : 'Pending'} period={enough ? `${usable[0].fy}–${latest.fy}` : undefined} confidence={enough ? 'high' : 'pending'} />
      </div>
    </section>
  )
}

// ─── (E) Operating Leverage — is premium growing faster than expenses? ───────
function operatingLeverage(company: Insurer, series: AnnualPoint[]) {
  const gwps = series.filter((p) => p.gwp != null)
  const lg = gwps[gwps.length - 1]
  const pg = gwps[gwps.length - 2]
  const gwpGrowth = lg && pg && pg.gwp ? ((lg.gwp! - pg.gwp!) / pg.gwp!) * 100 : company.growth > 0 ? company.growth : null
  const exp = series.filter((p) => p.expenseRatio != null)
  const expFrom = exp.length ? exp[0].expenseRatio : null
  const expTo = exp.length ? exp[exp.length - 1].expenseRatio : null
  const expDelta = expFrom != null && expTo != null && exp.length >= 2 ? expTo - expFrom : null
  const pats = series.filter((p) => p.pat != null)
  const patYoY = pats.length >= 2 && pats[pats.length - 2].pat ? ((pats[pats.length - 1].pat! - pats[pats.length - 2].pat!) / Math.abs(pats[pats.length - 2].pat!)) * 100 : null
  const hiGrowth = gwpGrowth != null && gwpGrowth >= 20
  let verdict: string
  let tone: Tone
  if (gwpGrowth == null || expDelta == null) {
    verdict = 'Pending'
    tone = 'neutral'
  } else if (hiGrowth && expDelta < -0.2) {
    verdict = 'Scale benefit emerging'
    tone = 'positive'
  } else if (hiGrowth && expDelta > 0.2) {
    verdict = 'Growth not yet converting into leverage'
    tone = 'warning'
  } else if (expDelta < -0.2) {
    verdict = 'Costs easing, growth modest'
    tone = 'positive'
  } else {
    verdict = 'No clear operating leverage'
    tone = 'warning'
  }
  return { gwpGrowth, expFrom, expTo, expDelta, patYoY, verdict, tone, expSeries: exp }
}

function OperatingLeverageCard({ company, series }: { company: Insurer; series: AnnualPoint[] }) {
  const ol = operatingLeverage(company, series)
  const hasData = ol.gwpGrowth != null && ol.expDelta != null
  const chips: { label: string; value: string; tone: Tone }[] = []
  if (ol.gwpGrowth != null) chips.push({ label: 'GWP growth', value: `+${ol.gwpGrowth.toFixed(0)}%`, tone: 'positive' })
  if (ol.expFrom != null && ol.expTo != null && ol.expSeries.length >= 2) chips.push({ label: 'Expense ratio', value: `${ol.expFrom.toFixed(1)}% → ${ol.expTo.toFixed(1)}%`, tone: ol.expDelta != null && ol.expDelta < 0 ? 'positive' : 'warning' })
  else if (ol.expTo != null) chips.push({ label: 'Expense ratio', value: `${ol.expTo.toFixed(1)}%`, tone: 'neutral' })
  if (ol.patYoY != null) chips.push({ label: 'PAT', value: `+${ol.patYoY.toFixed(0)}% YoY`, tone: 'positive' })

  const sentence =
    !hasData
      ? `Operating-leverage call pending for ${company.shortName} — needs an expense-ratio history alongside premium growth.`
      : ol.expDelta != null && ol.expDelta < 0
        ? 'Premium is scaling faster than expenses — early evidence of operating leverage.'
        : 'Premium is growing, but expenses have not yet eased into operating leverage.'

  return (
    <section className="card-surface flex h-full flex-col p-4">
      <StoryHeader
        eyebrow="Operating Leverage"
        title="Is premium growing faster than expenses?"
        right={<SignalBadge label={ol.verdict === 'Pending' ? 'Pending' : ol.verdict === 'Scale benefit emerging' || ol.verdict === 'Costs easing, growth modest' ? 'Emerging' : 'Watch'} tone={ol.tone === 'neutral' ? 'navy' : ol.tone} size="sm" />}
      />
      {hasData ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map((c) => (
              <div key={c.label} className={`rounded-md px-2.5 py-1.5 ${toneBg[c.tone]}`}>
                <p className="text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary">{c.label}</p>
                <p className={`font-display text-[14px] leading-tight ${toneText[c.tone]}`}>{c.value}</p>
              </div>
            ))}
          </div>
          {ol.expSeries.length >= 2 && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[9.5px] text-ink-secondary">Expense ratio trend</span>
              <Sparkline values={ol.expSeries.map((p) => p.expenseRatio as number)} tone="positive" width={120} height={26} />
              <span className="text-[9.5px] font-semibold" style={{ color: PALETTE.emerald }}>{ol.expDelta! < 0 ? `↓ ${Math.abs(ol.expDelta!).toFixed(1)}pp` : `↑ ${ol.expDelta!.toFixed(1)}pp`}</span>
            </div>
          )}
          <p className="mt-3 text-[11.5px] leading-relaxed text-navy-deep/85">{sentence}</p>
        </>
      ) : (
        <div className="mt-3">
          <PendingNote>{sentence}</PendingNote>
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {chips.map((c) => (
                <div key={c.label} className={`rounded-md px-2.5 py-1.5 ${toneBg[c.tone]}`}>
                  <p className="text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary">{c.label}</p>
                  <p className={`font-display text-[14px] leading-tight ${toneText[c.tone]}`}>{c.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mt-auto flex justify-end pt-3">
        <SourceTag source={hasData ? 'IRDAI + Company filing' : 'Pending'} period={hasData ? 'FY24→FY25' : undefined} confidence={hasData ? 'high' : 'pending'} />
      </div>
    </section>
  )
}

// ─── (F) ROE Explanation — why ROE is at its current level ───────────────────
function RoeExplanationCard({ company, series }: { company: Insurer; series: AnnualPoint[] }) {
  const roe = company.roe
  const hasRoe = roe > 0
  const pats = series.filter((p) => p.pat != null)
  const patYoY = pats.length >= 2 && pats[pats.length - 2].pat ? ((pats[pats.length - 1].pat! - pats[pats.length - 2].pat!) / Math.abs(pats[pats.length - 2].pat!)) * 100 : null
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const patMargin = latest && latest.pat != null && latest.gwp ? (latest.pat / latest.gwp) * 100 : null
  const gwps = series.filter((p) => p.gwp != null)
  const gwpGrowth = gwps.length >= 2 && gwps[gwps.length - 2].gwp ? ((gwps[gwps.length - 1].gwp! - gwps[gwps.length - 2].gwp!) / gwps[gwps.length - 2].gwp!) * 100 : company.growth > 0 ? company.growth : null
  const exp = series.filter((p) => p.expenseRatio != null)
  const expImproving = exp.length >= 2 ? (exp[exp.length - 1].expenseRatio as number) < (exp[0].expenseRatio as number) : null

  const state: { label: string; tone: Tone } =
    patYoY == null
      ? { label: 'Pending', tone: 'neutral' }
      : patYoY > 8
        ? { label: 'Improving', tone: 'positive' }
        : patYoY < -8
          ? { label: 'Pressure', tone: 'negative' }
          : { label: 'Stable', tone: 'navy' }

  const moderate = hasRoe && roe < 10
  const sentence =
    patYoY == null
      ? `ROE drivers pending for ${company.shortName}.`
      : state.label === 'Improving' && moderate
        ? 'ROE is improving as PAT scales faster than equity, but remains moderate because the post-IPO capital base is still large.'
        : state.label === 'Improving'
          ? `ROE is improving as PAT scales faster than equity (PAT ${patYoY >= 0 ? '+' : ''}${patYoY.toFixed(0)}% YoY).`
          : state.label === 'Pressure'
            ? `ROE is under pressure as PAT contracts ${patYoY.toFixed(0)}% YoY.`
            : 'ROE is broadly stable; PAT and equity are scaling at similar rates.'

  const drivers: { label: string; value: string; tone: Tone }[] = [
    { label: 'PAT margin', value: patMargin != null ? `${patMargin.toFixed(1)}%` : '—', tone: patMargin != null && patMargin > 3 ? 'positive' : 'neutral' },
    { label: 'Premium growth', value: gwpGrowth == null ? '—' : gwpGrowth >= 20 ? 'Strong' : gwpGrowth >= 10 ? 'Steady' : 'Soft', tone: gwpGrowth != null && gwpGrowth >= 20 ? 'positive' : 'neutral' },
    { label: 'Operating leverage', value: expImproving == null ? 'Pending' : expImproving ? 'Improving' : 'Flat', tone: expImproving ? 'positive' : 'neutral' },
    { label: 'Capital base', value: company.solvency > 0 ? `${company.solvency.toFixed(2)}x` : '—', tone: 'neutral' },
  ]

  return (
    <section className="card-surface flex h-full flex-col p-4">
      <StoryHeader
        eyebrow="ROE Explanation"
        title="Why ROE is where it is"
        right={<SignalBadge label={state.label} tone={state.tone === 'neutral' ? 'navy' : state.tone} size="sm" />}
      />
      {/* Compact ROE bridge: PAT margin + growth + operating leverage + capital → ROE */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {drivers.map((d, i) => (
          <div key={d.label} className="contents">
            <div className={`rounded-md px-2 py-1 ${toneBg[d.tone]}`}>
              <p className="text-[8px] font-semibold uppercase tracking-wide text-ink-secondary">{d.label}</p>
              <p className={`text-[12px] font-semibold leading-tight ${toneText[d.tone]}`}>{d.value}</p>
            </div>
            {i < drivers.length - 1 && <span className="text-[12px] font-semibold text-ink-secondary/50">+</span>}
          </div>
        ))}
        <span className="text-[12px] font-semibold text-ink-secondary/50">=</span>
        <div className="rounded-md bg-soft-blue px-2 py-1">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-ink-secondary">ROE</p>
          <p className="text-[12px] font-semibold leading-tight text-navy-deep">{hasRoe ? `${roe.toFixed(1)}%` : '—'}</p>
        </div>
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed text-navy-deep/85">{sentence}</p>
      <div className="mt-auto flex justify-end pt-3">
        <SourceTag source={hasRoe ? 'Company filing · estimated' : 'Pending'} period="FY25" confidence={hasRoe ? 'medium' : 'pending'} />
      </div>
    </section>
  )
}

// ─── (G) Enhanced Investor Read — full profitability story, dynamic ──────────
function buildProfitabilityRead(company: Insurer, series: AnnualPoint[]) {
  const hasCR = company.combinedRatio > 0
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const uw = latest ? underwritingResult(latest) : null
  const pats = series.filter((p) => p.pat != null)
  const patYoY = pats.length >= 2 && pats[pats.length - 2].pat ? ((pats[pats.length - 1].pat! - pats[pats.length - 2].pat!) / Math.abs(pats[pats.length - 2].pat!)) * 100 : null
  const patRising = patYoY != null && patYoY > 8
  const exp = series.filter((p) => p.expenseRatio != null)
  const expImproving = exp.length >= 2 ? (exp[exp.length - 1].expenseRatio as number) < (exp[0].expenseRatio as number) : null
  const solvency = company.solvency
  const solvencyStrong = solvency >= 2
  const solvencyWeak = solvency > 0 && solvency < 1.5
  const crWeak = hasCR && company.combinedRatio > 105

  let quality: string
  let qualityTone: Tone
  if (solvencyWeak) {
    quality = 'Capital comfort is the key risk to profitability-led growth.'
    qualityTone = 'negative'
  } else if (crWeak && expImproving === false) {
    quality = 'Growth is not yet translating into operating leverage.'
    qualityTone = 'warning'
  } else if (uw != null && uw > 0 && patRising && solvencyStrong) {
    quality = expImproving
      ? 'Profitability improvement looks higher quality because premium growth is scaling faster than expenses.'
      : 'Profitability improvement looks higher quality, backed by underwriting profit and a strong capital base.'
    qualityTone = 'positive'
  } else if (patRising) {
    quality = 'Profitability is improving, but the quality of earnings needs verification.'
    qualityTone = 'warning'
  } else {
    quality = 'Profitability signals are mixed — watch the next print.'
    qualityTone = 'navy'
  }

  const rich = uw != null && patYoY != null
  const lead = rich
    ? `${company.shortName}'s profitability is improving through disciplined underwriting, ${uw > 0 ? 'positive underwriting profit' : 'gradual underwriting repair'}${expImproving ? ', and operating leverage' : ''}. Solvency ${solvencyStrong ? 'remains comfortable' : solvency >= 1.5 ? 'is adequate' : 'is tight'}, supporting continued growth.`
    : `${company.shortName}'s profitability read leans on ${hasCR ? `a ${company.combinedRatio.toFixed(1)}% combined ratio and ` : ''}${solvency > 0 ? `${solvency.toFixed(2)}x solvency` : 'reported capital'}; underwriting-profit and PAT trajectory are pending for a full read.`

  const why = rich
    ? `Combined ratio ${hasCR ? (company.combinedRatio < 100 ? 'below 100% ' : 'above 100% ') : ''}is ${uw > 0 ? 'driving underwriting profit' : 'pushing underwriting toward break-even'}.`
    : `Combined ratio${hasCR ? ` of ${company.combinedRatio.toFixed(1)}%` : ' is N/A for this carrier'} and ${solvency.toFixed(2)}x solvency anchor the read until per-year profit data lands.`

  const watch = solvencyWeak
    ? 'Capital trajectory each quarter, and whether profit conversion outpaces capital consumption.'
    : crWeak
      ? 'A clear move below 100 on combined ratio, and the expense-ratio trend.'
      : 'Claims ratio, combined ratio, and whether PAT continues compounding faster than equity.'

  return { quality, qualityTone, lead, why, watch }
}

function EnhancedInvestorRead({ company, series, accent }: { company: Insurer; series: AnnualPoint[]; accent: string }) {
  const read = buildProfitabilityRead(company, series)
  const solvency = company.solvency
  const solvTone: Tone = solvency >= 2 ? 'positive' : solvency >= 1.5 ? 'warning' : 'negative'
  const solvLabel = solvency >= 2 ? 'Comfortable' : solvency >= 1.5 ? 'Adequate' : 'Tight'
  const solvChipCls =
    solvTone === 'positive'
      ? 'bg-[#EAF3EE] ring-[#CDE6D7]'
      : solvTone === 'warning'
        ? 'bg-[#FBF3E2] ring-[#F0E1BE]'
        : 'bg-[#F8ECEC] ring-[#EBCFCE]'
  const lines = [
    { label: 'Why', value: read.why },
    { label: 'What it means', value: read.quality },
    { label: 'Watch next', value: read.watch },
  ]
  return (
    <section className="card-surface relative overflow-hidden p-4" style={{ background: `linear-gradient(135deg, #FFFFFF 0%, ${PALETTE.champagneSoft} 110%)` }}>
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: `linear-gradient(180deg, ${PALETTE.champagne} 0%, ${accent} 100%)` }} />
      <div className="flex flex-wrap items-start justify-between gap-2 pl-2.5">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Investor Read</p>
          <h3 className="mt-0 font-display text-[15px] text-navy-deep">So what?</h3>
        </div>
        {solvency > 0 && (
          <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ${solvChipCls}`} title="vs 1.5x regulatory floor">
            <span className="text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary">Solvency</span>
            <span className="font-display text-[13px] leading-none text-navy-deep">{solvency.toFixed(2)}x</span>
            <span aria-hidden className="text-ink-secondary/40">·</span>
            <span className={`text-[10px] font-semibold ${toneText[solvTone]}`}>{solvLabel}</span>
          </div>
        )}
      </div>
      <p className="mt-2 max-w-4xl pl-2.5 text-[12px] font-medium leading-relaxed text-navy-deep">{read.lead}</p>
      <dl className="mt-2.5 grid grid-cols-1 gap-x-5 gap-y-1.5 pl-2.5 sm:grid-cols-[110px_1fr]">
        {lines.map((line) => (
          <div key={line.label} className="contents">
            <dt className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-champagne-deep">{line.label}</dt>
            <dd className="text-[11.5px] leading-relaxed text-navy-deep/85">{line.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2.5 flex justify-end">
        <SourceTag source="Company filing + IRDAI disclosures" period="FY25" confidence="high" />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

export function ProfitabilityCapital() {
  const [view, setView] = useState<View>('P&L')
  const company = useActiveCompany()
  const { range } = useFilters()
  const copy = getCompanyProfitabilityCopy(company)
  // Clip the annual story to the dashboard-wide Data Range (fiscal-year axis).
  const series = getAnnualSeries(company.id).filter((p) => labelInRange(p.fy, range))

  const hasCR = company.combinedRatio > 0
  const ct = hasCR ? combinedTone(company.combinedRatio) : { label: 'N/A', tone: 'neutral' as Tone }
  const mm = getMarginMetrics(company)
  const patSeries = NET_PROFIT_QUARTERS[company.id]
  const hasTrend = patSeries !== undefined
  const crSeries = COMBINED_RATIO_QUARTERS[company.id]
  const cost = COST_RATIOS[company.id]

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
  return (
    <div className="space-y-5">
      {/* ─── HERO — gradient strip, verdict, single PAT callout ─── */}
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

          {hasTrend && (
            <div className="flex items-center gap-4 sm:border-l sm:border-soft-border/80 sm:pl-5">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-secondary">PAT · Q4 FY25</p>
                <p className="mt-0.5 font-display text-[26px] leading-none text-navy-deep">₹{patSeries[3]} Cr</p>
                <span
                  className={`mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium ${mm.yoyImprovement >= 0 ? 'text-signal-positive' : 'text-signal-negative'}`}
                  title="Approximate YoY improvement — quarterly FY24 PAT is not separately reported, so this figure is illustrative."
                >
                  {mm.yoyImprovement >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  ~{Math.abs(Math.round(mm.yoyImprovement))}% vs Q4 FY24
                </span>
              </div>
              <HeroPatSparkline values={patSeries} color={trendTone === 'negative' ? PALETTE.coral : PALETTE.emerald} />
            </div>
          )}
        </div>
      </section>

      {/* ─── (B) PROFITABILITY ENGINE — premium → profit → capital, one infographic ─── */}
      <ProfitabilityEngine company={company} series={series} />

      {/* ─── (C) MAIN STORY — tabs drive the central chart, right rail keeps mini-visuals ─── */}
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

      {/* ─── (D) UNDERWRITING PROFIT TREND — derived core profit, CR overlay ─── */}
      <UnderwritingProfitTrend company={company} series={series} />

      {/* ─── (E) OPERATING LEVERAGE + (F) ROE EXPLANATION — paired, compact ─── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OperatingLeverageCard company={company} series={series} />
        <RoeExplanationCard company={company} series={series} />
      </div>

      {/* ─── (G) SO WHAT — investor read; capital comfort folded in as a chip ─── */}
      <EnhancedInvestorRead company={company} series={series} accent={heroTone} />
    </div>
  )
}
