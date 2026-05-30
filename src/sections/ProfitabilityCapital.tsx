import { Fragment, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
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
  Sparkles,
  ShieldCheck,
  Shield,
  Gauge,
  IndianRupee,
  BarChart3,
  Cog,
  ChevronRight,
  MousePointerClick,
  Database,
  TrendingUp,
  TrendingDown,
  Minus,
  type LucideIcon,
} from 'lucide-react'
import { SignalBadge } from '@/components/SignalBadge'
import { BasisTag } from '@/components/BasisTag'
import { SourceTag } from '@/components/SourceTag'
import { DataStatusDrawer } from '@/components/DataStatusDrawer'
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

// ---------------------------------------------------------------------------
// Chart building blocks
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Trendline helpers — a least-squares fit over a time series plus a compact
// direction pill, so every time-series chart can carry an elegant trendline and
// a plain-English direction. With < 2 real points we return null, and callers
// show "Trend pending" rather than faking a line.
// ---------------------------------------------------------------------------

interface TrendFit {
  fitted: number[]
  slope: number
}

function fitTrend(values: (number | null | undefined)[]): TrendFit | null {
  const pts = values
    .map((v, i) => [i, v] as const)
    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v)) as [number, number][]
  if (pts.length < 2) return null
  const n = pts.length
  let sx = 0, sy = 0, sxy = 0, sxx = 0
  for (const [x, y] of pts) {
    sx += x
    sy += y
    sxy += x * y
    sxx += x * x
  }
  const denom = n * sxx - sx * sx
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n
  return { fitted: values.map((_, i) => intercept + slope * i), slope }
}

function TrendPill({ label, dir, color }: { label: string; dir: 'up' | 'down' | 'flat'; color: string }) {
  const Icon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus
  const muted = label === 'Trend pending'
  const c = muted ? '#94A3B8' : color
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-white/85 px-2 py-0.5 text-[9px] font-semibold shadow-sm" style={{ borderColor: `${c}55`, color: c }}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  )
}

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

// Combined-ratio trajectory with green strong / amber watch / red weak bands.
// Period-generic: feed it `{ label, cr }` points (annual FY or quarterly). Null
// combined ratios bridge via connectNulls and never read as 0; < 2 real points
// shows "Trend pending" instead of a faked line.
function CombinedRatioBandedTrend({ points }: { points: { label: string; cr: number | null }[] }) {
  const crs = points.map((p) => p.cr)
  const real = crs.filter((v): v is number => v != null)
  const enough = real.length >= 2
  const fit = enough ? fitTrend(crs) : null
  const data = points.map((p, i) => ({ label: p.label, cr: p.cr, trend: fit ? fit.fitted[i] : null }))
  const yMin = (real.length ? Math.min(94, ...real) : 94) - 2
  const yMax = (real.length ? Math.max(108, ...real) : 112) + 2
  // Lower combined ratio is better, so a falling fit = improving discipline.
  const dir = !fit ? 'flat' : fit.slope < -0.15 ? 'down' : fit.slope > 0.15 ? 'up' : 'flat'
  const label = !enough ? 'Trend pending' : dir === 'down' ? 'Improving' : dir === 'up' ? 'Rising' : 'Stable'
  const trendColor = !enough ? '#94A3B8' : dir === 'down' ? PALETTE.emerald : dir === 'up' ? PALETTE.coral : PALETTE.navy
  return (
    <div>
      <div className="mb-1 flex justify-end"><TrendPill label={label} dir={dir} color={trendColor} /></div>
      <ResponsiveContainer width="100%" height={172}>
        <LineChart data={data} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: PALETTE.border }} />
          <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: PALETTE.border }} domain={[yMin, yMax]} width={36} unit="%" />
          <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number, n) => [`${v.toFixed(1)}%`, n === 'trend' ? 'Trend' : 'Combined ratio']} />
          <ReferenceArea y1={yMin} y2={100} fill={PALETTE.emerald} fillOpacity={0.07} />
          <ReferenceArea y1={100} y2={105} fill={PALETTE.amber} fillOpacity={0.08} />
          <ReferenceArea y1={105} y2={yMax} fill={PALETTE.coral} fillOpacity={0.07} />
          <ReferenceLine y={100} stroke={PALETTE.amber} strokeDasharray="4 4" strokeWidth={0.8} label={{ value: '100% break-even', position: 'insideTopRight', fontSize: 8.5, fill: PALETTE.amber }} />
          {fit && <Line type="linear" dataKey="trend" stroke={trendColor} strokeWidth={1.4} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />}
          <Line type="monotone" dataKey="cr" stroke={PALETTE.navyDeep} strokeWidth={1.8} dot={{ r: 3, fill: PALETTE.navyDeep }} activeDot={{ r: 5 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// PAT bars with the latest period highlighted + a smooth trendline. Period-
// generic: feed `{ label, pat }` points (annual FY or quarterly). Null PATs are
// omitted (never 0); < 2 real points shows "Trend pending".
function QuarterlyPatBars({ points, accent = PALETTE.amber, unitLabel = 'PAT' }: { points: { label: string; pat: number | null }[]; accent?: string; unitLabel?: string }) {
  const pats = points.map((p) => p.pat)
  const real = pats.filter((v): v is number => v != null)
  const enough = real.length >= 2
  const fit = enough ? fitTrend(pats) : null
  const data = points.map((p, i) => ({ label: p.label, pat: p.pat, trend: fit ? fit.fitted[i] : null }))
  const positive = real.length ? real[real.length - 1] >= 0 : true
  const lastRealIdx = data.map((d) => d.pat != null).lastIndexOf(true)
  const dir = !fit ? 'flat' : fit.slope > 0.5 ? 'up' : fit.slope < -0.5 ? 'down' : 'flat'
  const label = !enough ? 'Trend pending' : dir === 'up' ? `${unitLabel} scaling` : dir === 'down' ? `${unitLabel} easing` : `${unitLabel} stable`
  const trendColor = !enough ? '#94A3B8' : dir === 'down' ? PALETTE.coral : accent
  return (
    <div>
      <div className="mb-1 flex justify-end"><TrendPill label={label} dir={dir} color={trendColor} /></div>
      <ResponsiveContainer width="100%" height={172}>
        <ComposedChart data={data} margin={{ top: 6, right: 10, left: -10, bottom: 0 }} barCategoryGap="34%">
          <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: PALETTE.border }} />
          <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: PALETTE.border }} width={38} />
          <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number, n) => [`₹${v.toLocaleString('en-IN')} Cr`, n === 'trend' ? 'Trend' : unitLabel]} cursor={{ fill: 'rgba(39,69,126,0.03)' }} />
          <ReferenceLine y={0} stroke={PALETTE.border} />
          <Bar dataKey="pat" radius={[4, 4, 0, 0]} maxBarSize={annualBarWidth(data.length)}>
            {data.map((d, i) => {
              const isLast = i === lastRealIdx
              const v = d.pat ?? 0
              const color = v < 0 ? PALETTE.coral : isLast ? (positive ? PALETTE.emerald : PALETTE.coral) : PALETTE.softBlue
              const strokeC = v < 0 ? PALETTE.coral : isLast ? PALETTE.emerald : PALETTE.navy
              return <Cell key={d.label} fill={color} stroke={strokeC} strokeWidth={isLast ? 1 : 0.4} />
            })}
          </Bar>
          {fit && <Line type="monotone" dataKey="trend" stroke={trendColor} strokeWidth={1.6} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} connectNulls />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// Slim annual bars, slightly wider quarterly — keeps the Bloomberg-style feel.
const annualBarWidth = (n: number) => (n <= 4 ? 42 : 30)

// Compact two-option period toggle (Yearly ⇄ Quarterly) used on the trajectory
// charts so the selected-year header range drives the Yearly view.
type TrendView = 'Yearly' | 'Quarterly'
function TrendViewToggle({ value, onChange, accent }: { value: TrendView; onChange: (v: TrendView) => void; accent: string }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-white/70 p-0.5">
      {(['Yearly', 'Quarterly'] as TrendView[]).map((v) => {
        const on = v === value
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className="rounded-full px-2 py-0.5 text-[9.5px] font-semibold transition-colors"
            style={on ? { background: accent, color: '#fff' } : { color: '#6B7488' }}
          >
            {v}
          </button>
        )
      })}
    </div>
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

// ─── (B) Profitability Story Map — the clickable navigation brain ────────────
// The five-node infographic now *controls* the page: clicking a node reveals
// only that node's charts, status and investor read below. Each metric appears
// exactly once; values reuse the same honest derivations so the story stays
// dynamic across companies. Missing inputs render as "n/a"/"Pending", never 0.

type NodeId = 'underwriting' | 'core' | 'conversion' | 'returns' | 'capital'

interface EngineStage {
  id: NodeId
  n: number
  label: string
  metricLabel: string
  value: string
  missing: boolean
  color: string
  Icon: LucideIcon
  explore: string
}

const ORANGE = '#C2691C' // shareholder return — controlled amber-orange (monitor, not danger)
const GOLD = '#C99A2E' // profit conversion — warm gold (value creation, not warning)
const DEEP_GREEN = '#1E6B4A' // capital support — deepest green (safety, resilience)

function buildEngineStages(company: Insurer, series: AnnualPoint[]): EngineStage[] {
  const hasCR = company.combinedRatio > 0
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const uw = latest ? underwritingResult(latest) : null
  const patMargin = latest && latest.pat != null && latest.gwp ? (latest.pat / latest.gwp) * 100 : null
  const roe = company.roe
  const solvency = company.solvency

  return [
    {
      id: 'underwriting',
      n: 1,
      label: 'Underwriting discipline',
      metricLabel: 'Combined ratio',
      value: hasCR ? `${company.combinedRatio.toFixed(1)}%` : 'n/a',
      missing: !hasCR,
      color: PALETTE.emerald,
      Icon: ShieldCheck,
      explore: 'See whether claims and costs stay within every ₹100 of premium.',
    },
    {
      id: 'core',
      n: 2,
      label: 'Core profitability',
      metricLabel: 'Underwriting profit',
      value: uw == null ? 'Pending' : crc(uw),
      missing: uw == null,
      color: PALETTE.teal,
      Icon: Gauge,
      explore: 'Trace how that discipline turns into real underwriting profit.',
    },
    {
      id: 'conversion',
      n: 3,
      label: 'Profit conversion',
      metricLabel: 'PAT margin',
      value: patMargin == null ? 'Pending' : `${patMargin.toFixed(1)}%`,
      missing: patMargin == null,
      color: GOLD,
      Icon: IndianRupee,
      explore: 'Premium is now being tested for how much converts into PAT and margin.',
    },
    {
      id: 'returns',
      n: 4,
      label: 'Shareholder return',
      metricLabel: 'ROE',
      value: roe > 0 ? `${roe.toFixed(1)}%` : 'n/a',
      missing: !(roe > 0),
      color: ORANGE,
      Icon: BarChart3,
      explore: 'Follow profit through to the return shareholders actually earn.',
    },
    {
      id: 'capital',
      n: 5,
      label: 'Capital support',
      metricLabel: 'Solvency',
      value: solvency > 0 ? `${solvency.toFixed(2)}x` : 'n/a',
      missing: !(solvency > 0),
      color: DEEP_GREEN,
      Icon: Shield,
      explore: 'See the capital buffer backing all of this growth.',
    },
  ]
}

function ProfitabilityEngine({ company, series, selectedId, onSelect }: { company: Insurer; series: AnnualPoint[]; selectedId: NodeId; onSelect: (id: NodeId) => void }) {
  const stages = buildEngineStages(company, series)
  const active = stages.find((s) => s.id === selectedId) ?? stages[0]
  const selectedIndex = stages.findIndex((s) => s.id === selectedId)

  return (
    <section className="card-surface p-5">
      {/* Header — Story Map title, plain-English direction, interactive cue */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: PALETTE.champagneSoft }}>
            <Cog className="h-4 w-4" style={{ color: PALETTE.champagne }} />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-champagne">Profitability Story Map</p>
            <p className="mt-0.5 max-w-md text-[11.5px] leading-snug text-ink-secondary">Click a stage to explore how premium flows into profit, ROE and capital strength.</p>
            <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-ice/70 px-2.5 py-0.5 text-[9.5px] font-medium text-ink-secondary">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: PALETTE.champagne }} />
              Interactive analysis · 5 stages · Click to drill down
            </span>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold text-navy-primary" style={{ borderColor: '#D6E2FA', background: PALETTE.softBlue }}>
          <MousePointerClick className="h-3.5 w-3.5" style={{ color: PALETTE.champagne }} />
          Choose a stage below
        </span>
      </div>

      {/* Flow — five clickable nodes; connectors brighten up to the active stage */}
      <div className="mt-7 flex flex-col gap-7 md:flex-row md:items-start md:gap-0">
        {stages.map((s, i) => {
          const selected = s.id === selectedId
          const connectorActive = i <= selectedIndex
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              aria-pressed={selected}
              aria-label={`View ${s.label} — ${s.metricLabel} ${s.value}`}
              className="group relative flex min-w-0 cursor-pointer flex-col items-center rounded-2xl px-1 py-1 text-center outline-none transition-transform focus-visible:ring-2 focus-visible:ring-navy-primary/35 md:flex-1"
            >
              {/* gradient connector: previous → this; brighter/thicker up to the selected stage */}
              {i > 0 && (
                <span
                  aria-hidden
                  className="absolute left-[-50%] right-1/2 top-[39px] z-0 hidden -translate-y-1/2 md:block"
                  style={{ height: connectorActive ? 3 : 2, background: `linear-gradient(90deg, ${stages[i - 1].color} 0%, ${s.color} 100%)`, opacity: connectorActive ? 0.9 : 0.3 }}
                />
              )}
              {i > 0 && (
                <span
                  aria-hidden
                  className="absolute left-0 top-[39px] z-10 hidden h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-white shadow-sm md:flex"
                  style={{ borderColor: connectorActive ? s.color : PALETTE.border }}
                >
                  <ChevronRight className="h-2.5 w-2.5" style={{ color: s.color, opacity: connectorActive ? 1 : 0.5 }} />
                </span>
              )}

              {/* Node */}
              <div className="relative z-10">
                {/* soft halo — always-on for the selected node, fades in on hover otherwise */}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl transition-opacity duration-300 ${selected ? 'h-[118px] w-[118px] opacity-100' : 'h-[94px] w-[94px] opacity-0 group-hover:opacity-90'}`}
                  style={{ background: selected ? `${s.color}4d` : `${s.color}2b` }}
                />
                <span
                  aria-hidden
                  className="absolute -inset-[6px] rounded-full border transition-all duration-300"
                  style={{ borderColor: s.color, borderStyle: selected ? 'solid' : 'dashed', opacity: selected ? 0.92 : 0.2, transform: selected ? 'scale(1.06)' : 'scale(1)' }}
                />
                <div
                  className="relative flex h-[76px] w-[76px] items-center justify-center rounded-full border-2 bg-white transition-all duration-300 group-hover:-translate-y-[3px]"
                  style={{
                    borderColor: s.color,
                    transform: selected ? 'translateY(-3px) scale(1.05)' : 'translateY(0)',
                    boxShadow: selected ? `0 18px 34px ${s.color}73` : `0 6px 16px ${s.color}1f`,
                    opacity: s.missing && !selected ? 0.6 : 1,
                  }}
                >
                  <s.Icon className="h-7 w-7" style={{ color: s.color }} strokeWidth={selected ? 2 : 1.6} />
                </div>
                <span
                  className="absolute -top-2 left-1/2 z-20 flex h-[18px] w-[18px] -translate-x-1/2 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm"
                  style={{ background: s.color }}
                >
                  {s.n}
                </span>
              </div>

              {/* Label + single metric */}
              <p className="mt-3.5 font-display text-[13px] leading-tight transition-colors" style={{ color: selected ? PALETTE.navyDeep : '#41506B', fontWeight: selected ? 700 : 600 }}>
                {s.label}
              </p>
              <span aria-hidden className="my-1.5 h-px w-6" style={{ background: selected ? s.color : PALETTE.border }} />
              <p className="text-[9.5px] uppercase tracking-wide text-ink-secondary">{s.metricLabel}</p>
              {s.missing ? (
                <p className="font-display text-[14px] italic leading-none text-ink-secondary/80">{s.value}</p>
              ) : (
                <p className="font-display text-[19px] leading-none" style={{ color: s.color }}>
                  {s.value}
                </p>
              )}

              {/* Clickable affordance — "Viewing" when active, a quiet "Explore" cue otherwise */}
              {selected ? (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.08em] text-white shadow-sm" style={{ background: s.color }}>
                  <span className="h-1 w-1 rounded-full bg-white/90" />
                  Viewing
                </span>
              ) : (
                <span className="mt-2 inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-white px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.08em] text-ink-secondary/80 transition-colors group-hover:border-muted-blue group-hover:text-navy-primary">
                  Explore
                  <ChevronRight className="h-2.5 w-2.5" />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Active-stage status bar — a control surface (navy + gold), updates on click only */}
      <div className="mt-6 flex justify-center">
        <div
          className="flex w-full max-w-2xl flex-col items-center gap-0.5 rounded-xl border px-5 py-2.5 text-center"
          style={{ borderColor: `${active.color}33`, background: `linear-gradient(135deg, ${active.color}12 0%, ${active.color}05 100%)` }}
        >
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: active.color }} />
            <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne">Viewing</span>
            <span aria-hidden className="text-ink-secondary/40">·</span>
            <span className="font-display text-[13px] leading-none text-navy-deep">{active.label}</span>
          </div>
          <p className="text-[11px] leading-snug text-ink-secondary">{active.explore}</p>
        </div>
      </div>

      {/* Source */}
      <div className="mt-4 flex justify-end">
        <SourceTag source="Company filing + IRDAI disclosures" period={series[series.length - 1]?.fy ?? 'FY25'} confidence="high" />
      </div>
    </section>
  )
}

// ─── (D) Underwriting Profit Trend — derived core profit, CR overlay ─────────
function UnderwritingProfitTrend({ company, series, tintBg }: { company: Insurer; series: AnnualPoint[]; tintBg?: string }) {
  const data = series.map((p) => ({ fy: p.fy, uw: underwritingResult(p), cr: p.combinedRatio }))
  const usable = data.filter((d) => d.uw != null) as { fy: string; uw: number; cr: number | null }[]
  const enough = usable.length >= 2
  const latest = usable[usable.length - 1]
  const turned = enough && usable.some((d) => d.uw < 0) && latest.uw > 0
  const fit = fitTrend(usable.map((d) => d.uw))
  const trendData = enough ? usable.map((d, i) => ({ ...d, trend: fit ? fit.fitted[i] : null })) : usable
  const trendDir = !fit ? 'flat' : fit.slope > 0.5 ? 'up' : fit.slope < -0.5 ? 'down' : 'flat'
  const trendLabel = !enough ? 'Trend pending' : turned ? 'Turning positive' : trendDir === 'up' ? 'Improving' : trendDir === 'down' ? 'Softening' : 'Stable'
  const trendColor = !enough ? '#94A3B8' : trendDir === 'down' && !turned ? PALETTE.coral : PALETTE.teal
  const insightLine = !enough
    ? `Underwriting-profit trend pending for ${company.shortName} — needs reported NEP and combined ratio for at least two years.`
    : turned
      ? 'Core underwriting turned profitable as combined ratio moved below 100%.'
      : latest.uw > 0
        ? 'Core underwriting is profitable, with combined ratio holding below 100%.'
        : 'Core underwriting is still in loss as combined ratio sits above 100%.'
  return (
    <section className="card-surface p-4" style={tintBg ? { background: tintBg } : undefined}>
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
      {enough && (
        <div className="mt-2 flex justify-end">
          <TrendPill label={trendLabel} dir={trendDir} color={trendColor} />
        </div>
      )}
      <div className="mt-2">
        {enough ? (
          <ResponsiveContainer width="100%" height={208}>
            <ComposedChart data={trendData} margin={{ top: 12, right: 6, left: -10, bottom: 0 }} barCategoryGap="34%">
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
              {fit && <Line yAxisId="uw" type="linear" dataKey="trend" name="UW trend" stroke={trendColor} strokeWidth={1.4} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />}
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

// ─── Profit-conversion infographic — the ₹100 Premium-to-Profit Engine ───────
// Input (₹100 GWP) → a splitting stream into proportional absorption bands
// (claims biggest, then opex, commission) → a small retained underwriting-profit
// band → the PAT-margin output badge. Magnitude is shown by band height + stream
// thickness. Real values only; a life carrier / missing PAT shows "Data pending".
function ConversionBridge({ company, series }: { company: Insurer; series: AnnualPoint[] }) {
  const cost = COST_RATIOS[company.id]
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const patMargin = latest && latest.pat != null && latest.gwp ? (latest.pat / latest.gwp) * 100 : null

  const header = (
    <>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Conversion Engine</p>
          <h3 className="mt-0 font-display text-[14.5px] leading-tight text-navy-deep">Premium-to-Profit Conversion Engine</h3>
        </div>
        <span className="shrink-0 text-[9.5px] text-ink-secondary">FY25</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-ink-secondary">For every ₹100 of GWP, see what gets absorbed before profit is created.</p>
    </>
  )

  if (!cost) {
    return (
      <div className="rounded-xl border p-4" style={{ background: '#FCF7EA', borderColor: '#ECE1C8' }}>
        {header}
        <div className="mt-3">
          <PendingNote>{`${company.shortName} reports on a life basis — the ₹100 premium-to-profit engine needs a P&C claims / commission / opex split. Data pending.`}</PendingNote>
        </div>
      </div>
    )
  }

  const absorbed = cost.loss + cost.commission + cost.expense
  const uwProfit = Math.round((100 - absorbed) * 10) / 10
  const uwPos = uwProfit >= 0

  const bands = [
    { key: 'claims', label: 'Claims', sub: 'Largest absorption', amount: cost.loss, display: `₹${cost.loss.toFixed(1)}`, color: PALETTE.coral, bg: '#FBEFEF', border: '#EFD4D3' },
    { key: 'opex', label: 'Opex', sub: 'Operating cost', amount: cost.expense, display: `₹${cost.expense.toFixed(1)}`, color: PALETTE.navy, bg: '#EEF3FB', border: '#D6E2FA' },
    { key: 'comm', label: 'Commission', sub: 'Distribution cost', amount: cost.commission, display: `₹${cost.commission.toFixed(1)}`, color: PALETTE.amber, bg: '#FBF3E2', border: '#EFE1BE' },
    {
      key: 'uw',
      label: uwPos ? 'Underwriting profit' : 'Underwriting loss',
      sub: uwPos ? 'Spread retained' : 'Spread negative',
      amount: Math.max(Math.abs(uwProfit), 1.5),
      display: `${uwPos ? '' : '−'}₹${Math.abs(uwProfit).toFixed(1)}`,
      color: uwPos ? PALETTE.teal : PALETTE.coral,
      bg: uwPos ? '#E7F4F3' : '#FBEFEF',
      border: uwPos ? '#C9E5E3' : '#EFD4D3',
    },
  ]

  const BASE = 22
  const SPAN = 150
  const GAP = 8
  const heights = bands.map((b) => BASE + (b.amount / 100) * SPAN)
  const totalH = Math.round(heights.reduce((s, h) => s + h, 0) + GAP * (bands.length - 1))
  const centers: number[] = []
  let acc = 0
  heights.forEach((h) => {
    centers.push(acc + h / 2)
    acc += h + GAP
  })

  return (
    <div className="rounded-xl border p-4" style={{ background: '#FCF7EA', borderColor: '#ECE1C8' }}>
      {header}
      <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.16em] text-champagne">₹100 premium journey</p>

      <div className="mt-1.5 flex items-stretch gap-0" style={{ height: totalH }}>
        {/* Input — the premium that enters the engine */}
        <div className="flex w-[86px] shrink-0 flex-col items-center justify-center rounded-xl px-2 text-center" style={{ background: `linear-gradient(160deg, ${PALETTE.navyDeep} 0%, ${PALETTE.navy} 100%)` }}>
          <span className="text-[8px] font-bold uppercase tracking-[0.12em]" style={{ color: '#E9D49A' }}>Premium in</span>
          <span className="mt-1 font-display text-[24px] leading-none text-white">₹100</span>
          <span className="mt-1 text-[8.5px] leading-snug text-white/70">GWP received</span>
        </div>

        {/* Splitting stream — thickness proportional to amount absorbed */}
        <svg className="shrink-0" width={34} height={totalH} viewBox={`0 0 34 ${totalH}`} aria-hidden>
          {bands.map((b, i) => (
            <path
              key={b.key}
              d={`M0 ${totalH / 2} C 22 ${totalH / 2}, 12 ${centers[i]}, 34 ${centers[i]}`}
              fill="none"
              stroke={b.color}
              strokeOpacity={0.42}
              strokeWidth={Math.max(2.5, (b.amount / 100) * 40)}
              strokeLinecap="round"
            />
          ))}
        </svg>

        {/* Absorption + retained-profit bands */}
        <div className="flex min-w-0 flex-1 flex-col" style={{ gap: GAP }}>
          {bands.map((b, i) => (
            <div
              key={b.key}
              className="relative flex items-center justify-between overflow-hidden rounded-lg border pl-3.5 pr-3"
              style={{ height: heights[i], background: b.bg, borderColor: b.border }}
            >
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: b.color }} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: b.color }} />
                  <span className="truncate text-[9px] font-bold uppercase tracking-[0.1em] text-navy-deep">{b.label}</span>
                </div>
                {heights[i] > 46 && <span className="mt-0.5 block pl-3 text-[9.5px] text-ink-secondary">{b.sub}</span>}
              </div>
              <span className="shrink-0 font-display leading-none" style={{ color: b.color, fontSize: heights[i] > 90 ? 21 : heights[i] > 42 ? 16 : 14 }}>
                {b.display}
              </span>
            </div>
          ))}
        </div>

        {/* Flow to output */}
        <div className="flex shrink-0 items-center px-1">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border bg-white text-[11px] font-bold leading-none shadow-sm" style={{ borderColor: '#E9D49A', color: GOLD }}>
            →
          </span>
        </div>

        {/* Output — the final reported-profit conversion */}
        <div
          className="flex w-[112px] shrink-0 flex-col items-center justify-center rounded-xl border px-2 text-center"
          style={{ background: 'linear-gradient(160deg, #FBF1D8 0%, #FFFAEC 100%)', borderColor: '#E9D49A', boxShadow: `0 14px 28px ${GOLD}40` }}
        >
          <span className="text-[8px] font-bold uppercase tracking-[0.12em]" style={{ color: '#9A7B1E' }}>PAT margin</span>
          <span className="mt-1 font-display text-[26px] leading-none" style={{ color: GOLD }}>{patMargin == null ? 'n/a' : `${patMargin.toFixed(1)}%`}</span>
          <span className="mt-1 text-[8.5px] leading-snug text-ink-secondary">Reported profit conversion</span>
        </div>
      </div>
    </div>
  )
}

// Compact proof rail beside the engine: net margin, expense-ratio trend and PAT
// growth — the cleaner replacement for the old Profit-Velocity + Operating-
// Leverage cards (reuses the operatingLeverage helper + sparklines).
function ConversionQuality({ company, series }: { company: Insurer; series: AnnualPoint[] }) {
  const mm = getMarginMetrics(company)
  const patSeries = NET_PROFIT_QUARTERS[company.id]
  const hasTrend = patSeries !== undefined
  const ol = operatingLeverage(company, series)
  const netTone: ChipTone = mm.netMargin > 5 ? 'teal' : mm.netMargin > 0 ? 'warning' : mm.netMargin === 0 ? 'navy' : 'negative'
  const hasExp = ol.expFrom != null && ol.expTo != null && ol.expSeries.length >= 2
  const expImproving = ol.expDelta != null && ol.expDelta < 0
  const patUp = ol.patYoY != null && ol.patYoY > 0
  const patStrong = ol.patYoY != null && ol.patYoY >= 50
  const marginFit = hasTrend ? fitTrend(patSeries) : null
  const marginUp = marginFit == null ? false : marginFit.slope >= 0
  const conclusion = patUp || (hasTrend && mm.netMargin > 0) ? 'Premium growth is starting to translate into profit.' : 'Conversion is still building — watch the spread and expense ratio.'

  return (
    <div className="flex h-full flex-col rounded-xl border p-4" style={{ background: '#FCF7EA', borderColor: '#ECE1C8' }}>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} />
        <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne">Conversion Quality</p>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Net margin · TTM</span>
            <SignalBadge label={hasTrend ? (mm.netMargin > 5 ? 'Healthy' : mm.netMargin > 0 ? 'Thin' : 'Loss') : 'Pending'} tone={hasTrend ? netTone : 'navy'} size="sm" />
          </div>
          <div className="mt-1 flex items-end justify-between gap-2">
            <span className="font-display text-[22px] leading-none text-navy-deep">{hasTrend ? `${mm.netMargin.toFixed(1)}%` : 'Data pending'}</span>
            {hasTrend && (
              <div className="flex flex-col items-end gap-0.5">
                <TrendPill label={marginFit == null ? 'Trend pending' : marginUp ? 'Expanding' : 'Easing'} dir={marginFit == null ? 'flat' : marginUp ? 'up' : 'down'} color={marginUp ? GOLD : PALETTE.coral} />
                <div className="h-[24px] w-[88px] shrink-0">
                  <MiniPatArea values={patSeries} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-[#ECE1C8] pt-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Expense ratio</span>
            <SignalBadge label={hasExp ? (expImproving ? 'Improving' : 'Flat') : 'Pending'} tone={hasExp && expImproving ? 'teal' : 'navy'} size="sm" />
          </div>
          <div className="mt-1 flex items-end justify-between gap-2">
            <span className="font-display text-[16px] leading-none text-navy-deep">{hasExp ? `${ol.expFrom!.toFixed(1)}% → ${ol.expTo!.toFixed(1)}%` : 'Data pending'}</span>
            {ol.expSeries.length >= 2 && <Sparkline values={ol.expSeries.map((p) => p.expenseRatio as number)} tone="positive" width={70} height={24} />}
          </div>
        </div>

        <div className="border-t border-[#ECE1C8] pt-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">PAT growth · YoY</span>
            <SignalBadge label={ol.patYoY == null ? 'Pending' : patStrong ? 'Strong' : patUp ? 'Rising' : 'Falling'} tone={ol.patYoY == null ? 'navy' : patUp ? 'positive' : 'negative'} size="sm" />
          </div>
          <span className="mt-1 block font-display text-[22px] leading-none text-navy-deep">{ol.patYoY == null ? 'Data pending' : `${ol.patYoY >= 0 ? '+' : ''}${ol.patYoY.toFixed(0)}%`}</span>
        </div>
      </div>

      <p className="mt-auto pt-4 text-[10.5px] font-medium leading-snug text-navy-deep/80">{conclusion}</p>
    </div>
  )
}

// ─── (G) Status cards — small, node-scoped signals (only the relevant one) ───
function CapitalBufferCard({ company }: { company: Insurer }) {
  const tone: Tone = company.solvency >= 1.8 ? 'positive' : company.solvency >= 1.5 ? 'warning' : 'negative'
  return (
    <div className="relative overflow-hidden rounded-lg border border-[#CDE7D8] px-3 py-2.5" style={{ background: 'linear-gradient(135deg, #E9F5EE 0%, #F5FBF8 100%)' }}>
      <div className="flex items-center justify-between">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-emerald-700/90">Capital Buffer</p>
        <SignalBadge label={tone === 'positive' ? 'Comfortable' : tone === 'warning' ? 'Adequate' : 'Tight'} tone={tone} size="sm" />
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-[19px] leading-none text-navy-deep">{company.solvency.toFixed(2)}x</span>
        <span className="text-[9.5px] text-ink-secondary">vs 1.5x floor</span>
      </div>
      <div className="mt-1">
        <MiniSolvencyDial value={company.solvency} />
      </div>
    </div>
  )
}

function RoeGaugeCard({ company }: { company: Insurer }) {
  const roeTone: Tone = company.roe >= 12 ? 'positive' : company.roe >= 5 ? 'warning' : 'negative'
  return (
    <div className="relative overflow-hidden rounded-lg p-3.5" style={{ background: 'linear-gradient(135deg, #FBF1E5 0%, #FFF9F2 100%)' }}>
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
  )
}

// ─── Per-node Investor Read — So what? / Why / What it means / Watch next ─────
interface NodeRead {
  soWhat: string
  why: string
  meaning: string
  watch: string
}

function buildNodeReads(company: Insurer, series: AnnualPoint[]): Record<NodeId, NodeRead> {
  const hasCR = company.combinedRatio > 0
  const cost = COST_RATIOS[company.id]
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const uw = latest ? underwritingResult(latest) : null
  const roe = company.roe
  const solvency = company.solvency
  const costAbsorb = cost ? cost.loss + cost.commission + cost.expense : null

  return {
    underwriting: {
      soWhat: !hasCR
        ? `${company.shortName} is a life carrier — combined ratio does not apply; returns and capital carry the read.`
        : company.combinedRatio < 100
          ? 'Underwriting discipline has improved because total insurance cost is below premium received.'
          : 'Underwriting discipline is the watch-item — total insurance cost is above premium received.',
      why: costAbsorb != null
        ? 'Claims, commission and opex are staying inside the ₹100 premium base.'
        : 'Claims and cost split is not reported on this basis.',
      meaning: !hasCR
        ? 'Profitability is read through returns and capital instead of combined ratio.'
        : company.combinedRatio < 100
          ? 'The company is no longer relying only on investment income to show profit.'
          : 'Reported profit is leaning on investment income, not underwriting.',
      watch: 'Claims ratio, expense ratio and whether combined ratio stays below 100%.',
    },
    core: {
      soWhat: uw == null
        ? 'Core underwriting profit is pending reported NEP and combined ratio.'
        : uw > 0
          ? 'Core underwriting has turned profitable as combined ratio moved below 100%.'
          : 'Core underwriting is still in loss; reported profit leans on investment income.',
      why: uw == null ? 'Needs reported NEP and combined ratio to size core operating profit.' : `Underwriting result ≈ NEP × (1 − combined ratio) = ${crc(uw)}.`,
      meaning: 'This is profit from insurance itself, before any investment income.',
      watch: 'Whether underwriting profit compounds as premium scales.',
    },
    conversion: {
      soWhat: uw != null && uw > 0
        ? 'Premium growth is converting into reported profit, but the conversion is still thin.'
        : 'Premium is not yet converting into underwriting profit; reported profit leans on investment income.',
      why: 'Claims, commission and opex still absorb most of the premium base.',
      meaning: 'Improving expense leverage can expand profit conversion if claims stay controlled.',
      watch: 'PAT margin, claims ratio, expense ratio and underwriting profit.',
    },
    returns: {
      soWhat: roe <= 0 ? 'Return on equity is pending for this carrier.' : 'ROE is improving, but it is not yet a mature high-return profile.',
      why: 'PAT growth and margin improvement are helping, while the large capital base still dilutes returns.',
      meaning: 'Future ROE expansion depends on profit compounding faster than equity growth.',
      watch: 'PAT growth, ROE trend, solvency and capital deployment.',
    },
    capital: {
      soWhat: solvency > 0
        ? `${solvency.toFixed(2)}x solvency gives growth support and resilience versus the 1.5x regulatory floor.`
        : 'Solvency is pending for this carrier.',
      why: solvency > 0 ? `A cushion of ${(solvency - 1.5).toFixed(2)}x above the 1.5x regulatory floor.` : 'Awaiting reported solvency ratio.',
      meaning: 'Strong capital funds growth without near-term capital-raise risk.',
      watch: 'Quarterly solvency trajectory as growth consumes capital.',
    },
  }
}

function NodeInvestorRead({ read, accent, src }: { read: NodeRead; accent: string; src: { source: string; period?: string; confidence: 'high' | 'medium' | 'pending' } }) {
  const lines = [
    { label: 'Why', value: read.why },
    { label: 'What it means', value: read.meaning },
    { label: 'Watch next', value: read.watch },
  ]
  return (
    <section className="card-surface relative overflow-hidden p-4" style={{ background: `linear-gradient(135deg, #FFFFFF 0%, ${PALETTE.champagneSoft} 125%)` }}>
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: `linear-gradient(180deg, ${PALETTE.champagne} 0%, ${accent} 100%)` }} />
      <div className="pl-2.5">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Investor Read</p>
        <h3 className="mt-0 font-display text-[15px] leading-tight text-navy-deep">So what?</h3>
        <p className="mt-1.5 max-w-3xl text-[12px] font-medium leading-relaxed text-navy-deep">{read.soWhat}</p>
        <dl className="mt-2.5 grid grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-[120px_1fr]">
          {lines.map((line) => (
            <div key={line.label} className="contents">
              <dt className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-champagne-deep">{line.label}</dt>
              <dd className="text-[11.5px] leading-relaxed text-navy-deep/85">{line.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-soft-border/70 pt-2.5">
          <BasisTag info={profitabilityBasis} />
          <SourceTag source={src.source} period={src.period} confidence={src.confidence} />
        </div>
      </div>
    </section>
  )
}

// ─── Detail panel — one focused, stage-coloured drill-down per selected node ──
// Every stage renders the same shell: an Active-lens header, a tight analysis
// grid whose cards inherit the stage tint, then a single Investor Read with the
// source/basis strip. No cross-stage cards; missing data shows "Data pending".

type ChipTone = 'positive' | 'warning' | 'negative' | 'navy' | 'teal'

interface LensMeta {
  label: string
  line: string
  accent: string
  cardBg: string
  cardBorder: string
  headFrom: string
  headTo: string
  headBorder: string
  source: string
  period?: string
  confidence: 'high' | 'medium' | 'pending'
}

const LENS: Record<NodeId, LensMeta> = {
  underwriting: {
    label: 'Underwriting discipline',
    line: 'Does the carrier keep claims and costs inside every ₹100 of premium?',
    accent: PALETTE.emerald,
    cardBg: '#F4FAF6',
    cardBorder: '#DCEDE3',
    headFrom: '#EAF5EE',
    headTo: '#F6FBF8',
    headBorder: '#D2E8DC',
    source: 'IRDAI disclosures · derived',
    period: 'Q1–Q4 FY25',
    confidence: 'high',
  },
  core: {
    label: 'Core profitability',
    line: 'Is underwriting itself turning a profit, before investment income?',
    accent: PALETTE.teal,
    cardBg: '#F0F8F7',
    cardBorder: '#D2E8E6',
    headFrom: '#E5F4F3',
    headTo: '#F4FBFA',
    headBorder: '#C9E5E3',
    source: 'Company filing · derived',
    period: 'FY series',
    confidence: 'high',
  },
  conversion: {
    label: 'Profit conversion',
    line: 'How much of premium growth reaches reported profit?',
    accent: GOLD,
    cardBg: '#FCF7EA',
    cardBorder: '#ECE1C8',
    headFrom: '#FAF2E1',
    headTo: '#FFFDF8',
    headBorder: '#EADFC2',
    source: 'Company filing + IRDAI disclosures',
    period: 'FY25',
    confidence: 'high',
  },
  returns: {
    label: 'Shareholder return',
    line: 'What return does that profit earn for shareholders?',
    accent: ORANGE,
    cardBg: '#FCF4EC',
    cardBorder: '#EFDDCB',
    headFrom: '#FBEFE4',
    headTo: '#FFF9F3',
    headBorder: '#EFD9C4',
    source: 'Company filing',
    period: 'Q1–Q4 FY25',
    confidence: 'high',
  },
  capital: {
    label: 'Capital support',
    line: 'Is there enough capital cushion to fund growth safely?',
    accent: DEEP_GREEN,
    cardBg: '#EFF7F2',
    cardBorder: '#CFE7DA',
    headFrom: '#E7F4ED',
    headTo: '#F5FBF8',
    headBorder: '#CCE5D8',
    source: 'IRDAI disclosures',
    period: 'FY25',
    confidence: 'high',
  },
}

function lensStatus(id: NodeId, company: Insurer, series: AnnualPoint[]): { label: string; tone: ChipTone } {
  if (id === 'underwriting') {
    if (!(company.combinedRatio > 0)) return { label: 'N/A', tone: 'navy' }
    return company.combinedRatio < 100 ? { label: 'Strong', tone: 'positive' } : company.combinedRatio <= 105 ? { label: 'Watch', tone: 'warning' } : { label: 'Weak', tone: 'negative' }
  }
  if (id === 'core') {
    const latest = series[series.length - 1] as AnnualPoint | undefined
    const uw = latest ? underwritingResult(latest) : null
    return uw == null ? { label: 'Pending', tone: 'navy' } : uw > 0 ? { label: 'In profit', tone: 'teal' } : { label: 'In loss', tone: 'negative' }
  }
  if (id === 'conversion') {
    if (NET_PROFIT_QUARTERS[company.id] === undefined) return { label: 'Pending', tone: 'navy' }
    const mm = getMarginMetrics(company)
    return mm.netMargin > 5 ? { label: 'Healthy', tone: 'teal' } : mm.netMargin > 0 ? { label: 'Thin', tone: 'warning' } : { label: 'Loss', tone: 'negative' }
  }
  if (id === 'returns') {
    return company.roe <= 0 ? { label: 'Pending', tone: 'navy' } : company.roe >= 12 ? { label: 'Strong', tone: 'positive' } : company.roe >= 5 ? { label: 'Improving', tone: 'warning' } : { label: 'Sub-CoC', tone: 'negative' }
  }
  return company.solvency <= 0 ? { label: 'Pending', tone: 'navy' } : company.solvency >= 2 ? { label: 'Comfortable', tone: 'positive' } : company.solvency >= 1.5 ? { label: 'Adequate', tone: 'warning' } : { label: 'Tight', tone: 'negative' }
}

function LensHeader({ meta, status }: { meta: LensMeta; status: { label: string; tone: ChipTone } }) {
  return (
    <div className="relative overflow-hidden rounded-xl border px-4 py-3" style={{ borderColor: meta.headBorder, background: `linear-gradient(135deg, ${meta.headFrom} 0%, ${meta.headTo} 100%)` }}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: meta.accent }} />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pl-2.5">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-champagne">Active lens</p>
          <h3 className="font-display text-[15px] leading-tight text-navy-deep">{meta.label}</h3>
          <p className="mt-0.5 max-w-xl text-[11px] leading-snug text-ink-secondary">{meta.line}</p>
        </div>
        <SignalBadge label={status.label} tone={status.tone} size="sm" />
      </div>
    </div>
  )
}

// Underwriting "Combined Ratio Discipline Engine" — a ₹100 premium container
// fills with claims + commission + opex; if the cost stack stays under the 100%
// break-even line, the gap is the underwriting surplus. The headline combined
// ratio is the authoritative snapshot value (company.combinedRatio), never the
// re-summed components, so the page reads one consistent number.
function CombinedRatioWaterfall({ company, series }: { company: Insurer; series: AnnualPoint[] }) {
  const cost = COST_RATIOS[company.id]
  const hasCR = company.combinedRatio > 0
  const crSeries = COMBINED_RATIO_QUARTERS[company.id]
  const [view, setView] = useState<TrendView>('Yearly')
  // Yearly trajectory follows the header's Data Range (annual snapshot, real
  // combined ratios; missing years bridge as null). Quarterly is the FY25 view.
  const yearPoints = series.map((p) => ({ label: p.fy, cr: p.combinedRatio }))
  const quarterPoints = crSeries ? QUARTER_LABELS.map((label, i) => ({ label, cr: crSeries[i] })) : []
  const trajPoints = view === 'Yearly' ? yearPoints : quarterPoints
  const yearsWithCR = yearPoints.filter((p) => p.cr != null).length
  // Authoritative combined ratio (snapshot) anchors the whole section.
  const cr = hasCR ? company.combinedRatio : null
  const surplus = cr != null ? Math.round((100 - cr) * 10) / 10 : null
  const below = surplus != null && surplus > 0
  const crColor = cr == null ? PALETTE.navy : cr < 100 ? PALETTE.emerald : cr <= 105 ? PALETTE.amber : PALETTE.coral

  // Cost components (real ratios). The chamber widths are proportional to the
  // real ratios; the combined-ratio output uses the authoritative snapshot value.
  const chambers = cost
    ? [
        { key: 'claims', label: 'Claims', sub: 'Largest cost absorber', raw: cost.loss, color: PALETTE.coral, bg: '#FBEFEF', border: '#EFD4D3' },
        { key: 'comm', label: 'Commission', sub: 'Distribution cost', raw: cost.commission, color: PALETTE.amber, bg: '#FBF3E2', border: '#EFE1BE' },
        { key: 'opex', label: 'Opex', sub: 'Operating cost', raw: cost.expense, color: PALETTE.navy, bg: '#EEF3FB', border: '#D6E2FA' },
      ]
    : []
  const maxRaw = chambers.length ? Math.max(...chambers.map((c) => c.raw)) : 1

  return (
    <div className="rounded-xl border p-4" style={{ background: '#F4FAF6', borderColor: '#DCEDE3' }}>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Discipline Engine</p>
          <h3 className="mt-0 font-display text-[14.5px] leading-tight text-navy-deep">Combined Ratio Discipline Engine</h3>
        </div>
        <span className="shrink-0 text-[9.5px] text-ink-secondary">FY25</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-ink-secondary">For every ₹100 of premium, costs are absorbed — what stays below 100% is underwriting surplus.</p>

      {cost && cr != null ? (
        <>
          {/* Engine flow: ₹100 base → cost chambers → combined-ratio output → surplus */}
          <div className="mt-4 flex items-stretch gap-2.5">
            {/* Premium base — the input */}
            <div className="flex w-[78px] shrink-0 flex-col items-center justify-center rounded-xl px-2 py-3 text-center text-white" style={{ background: `linear-gradient(160deg, ${PALETTE.navyDeep} 0%, ${PALETTE.navy} 100%)` }}>
              <span className="text-[7.5px] font-bold uppercase tracking-[0.1em]" style={{ color: '#E9D49A' }}>Premium base</span>
              <span className="mt-1 font-display text-[22px] leading-none">₹100</span>
              <span className="mt-1 text-[7.5px] leading-tight text-white/70">received</span>
            </div>

            {/* Cost chambers — width ∝ amount absorbed, claims clearly largest */}
            <div className="flex min-w-0 flex-1 items-stretch gap-1.5">
              {chambers.map((c, i) => (
                <Fragment key={c.key}>
                  {i > 0 && <span className="flex shrink-0 items-center text-[12px] font-bold text-ink-secondary/40">−</span>}
                  <div
                    className="flex min-w-0 flex-col justify-between rounded-xl border px-2.5 py-2"
                    style={{ background: c.bg, borderColor: c.border, flexGrow: c.raw, flexBasis: 0, minWidth: 64 }}
                    title={`${c.label} ${c.raw.toFixed(1)}% of premium`}
                  >
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                      <span className="truncate text-[8px] font-bold uppercase tracking-[0.05em] text-navy-deep">{c.label}</span>
                    </div>
                    <span className="mt-1.5 font-display text-[18px] leading-none" style={{ color: c.color }}>₹{c.raw.toFixed(1)}</span>
                    {/* absorption meter — visual weight of this cost */}
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/70">
                      <div className="h-full rounded-full" style={{ width: `${(c.raw / maxRaw) * 100}%`, background: c.color }} />
                    </div>
                    <span className="mt-1 truncate text-[7.5px] text-ink-secondary">{c.sub}</span>
                  </div>
                </Fragment>
              ))}
            </div>

            {/* Combined ratio — the central output card, against the break-even */}
            <div className="flex shrink-0 items-center text-[12px] font-bold" style={{ color: crColor }}>=</div>
            <div className="relative flex w-[92px] shrink-0 flex-col items-center justify-center rounded-xl border-2 bg-white px-2 py-2.5 text-center" style={{ borderColor: crColor, boxShadow: `0 10px 22px ${crColor}33` }}>
              <span className="text-[7.5px] font-bold uppercase tracking-[0.08em] text-ink-secondary">Combined ratio</span>
              <span className="mt-1 font-display text-[24px] leading-none" style={{ color: crColor }}>{cr.toFixed(1)}%</span>
              <span className="mt-1 inline-flex items-center gap-0.5 text-[7.5px] font-semibold" style={{ color: PALETTE.amber }}>
                <span className="inline-block h-0 w-3 border-t border-dashed" style={{ borderColor: PALETTE.amber }} /> vs 100%
              </span>
            </div>

            {/* Surplus — the positive outcome */}
            <div className="flex shrink-0 items-center text-[14px] font-bold" style={{ color: below ? PALETTE.emerald : PALETTE.coral }}>→</div>
            <div className="flex w-[88px] shrink-0 flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center" style={{ background: below ? `linear-gradient(160deg, #E3F3EA 0%, #F3FBF7 100%)` : '#FBEFEF', borderColor: below ? '#BFE0CE' : '#EFD4D3', boxShadow: below ? `0 12px 24px ${PALETTE.emerald}33` : undefined }}>
              <span className="text-[7.5px] font-bold uppercase tracking-[0.08em]" style={{ color: below ? '#1C5C3F' : '#9A3B39' }}>{below ? 'Surplus' : 'Deficit'}</span>
              <span className="mt-1 font-display text-[22px] leading-none" style={{ color: below ? PALETTE.emerald : PALETTE.coral }}>{below ? '+' : ''}{(surplus as number).toFixed(1)}%</span>
              <span className="mt-1 text-[7.5px] leading-tight text-ink-secondary">below 100%</span>
            </div>
          </div>

          {/* One-line read of the flow */}
          <p className="mt-3 flex items-center gap-1.5 text-[10.5px] leading-snug text-navy-deep/85">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" style={{ color: PALETTE.emerald }} />
            {below ? `Claims, commission and opex absorb ₹${cr.toFixed(1)} of every ₹100 — the remaining ₹${(surplus as number).toFixed(1)} is underwriting surplus, before any investment income.` : `Costs absorb more than the ₹100 premium received — underwriting is loss-making before investment income.`}
          </p>

          {hasCR && (
            <div className="mt-4 border-t border-[#DCEDE3] pt-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink-secondary">
                  {view === 'Yearly' ? 'Combined ratio trajectory · by year' : 'Combined ratio trajectory · Q1–Q4 FY25'}
                </p>
                <TrendViewToggle value={view} onChange={setView} accent={PALETTE.emerald} />
              </div>
              {view === 'Yearly' && yearsWithCR < 2 ? (
                <PendingNote>Pick a wider year range in the header to see the combined-ratio trend — only one reported year is in range.</PendingNote>
              ) : (
                <CombinedRatioBandedTrend points={trajPoints} />
              )}
            </div>
          )}
        </>
      ) : (
        <div className="mt-3">
          <PendingNote>{`${company.shortName} reports on a life basis — the combined-ratio build-up needs a P&C claims / commission / opex split. Data pending.`}</PendingNote>
        </div>
      )}
    </div>
  )
}

// Underwriting proof rail — three compact proof blocks (claims ratio, expense
// ratio, combined-ratio trend) with a self-funding conclusion. Balanced height,
// no large empty gaps.
function DisciplineQuality({ company }: { company: Insurer }) {
  const cost = COST_RATIOS[company.id]
  const cr = COMBINED_RATIO_QUARTERS[company.id]
  const q1 = cr ? cr[0] : null
  const q4 = cr ? cr[cr.length - 1] : null
  const improving = q1 != null && q4 != null && q4 < q1
  const blocks: { label: string; value: string; note: string; chip: { label: string; tone: ChipTone }; spark?: number[] }[] = [
    {
      label: 'Claims ratio',
      value: cost ? `${cost.loss.toFixed(1)}%` : 'Data pending',
      note: 'Largest cost absorber',
      chip: cost ? (cost.loss > 70 ? { label: 'Above ~70%', tone: 'warning' } : { label: 'Below ~70%', tone: 'positive' }) : { label: 'Pending', tone: 'navy' },
    },
    {
      label: 'Expense ratio',
      value: cost ? `${(cost.commission + cost.expense).toFixed(1)}%` : 'Data pending',
      note: 'Commission + opex',
      chip: { label: 'Cost base', tone: 'navy' },
    },
    {
      label: 'Combined ratio trend',
      value: q1 != null && q4 != null ? `${q1.toFixed(1)}% → ${q4.toFixed(1)}%` : 'Data pending',
      note: 'Q1 → Q4 FY25',
      chip: q1 != null && q4 != null ? (improving ? { label: 'Improving', tone: 'teal' } : { label: 'Flat', tone: 'navy' }) : { label: 'Pending', tone: 'navy' },
      spark: cr ?? undefined,
    },
  ]
  return (
    <div className="flex h-full flex-col rounded-xl border p-4" style={{ background: '#F4FAF6', borderColor: '#DCEDE3' }}>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: PALETTE.emerald }} />
        <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne">Discipline Quality</p>
      </div>
      <div className="mt-3 flex flex-1 flex-col gap-2.5">
        {blocks.map((b) => (
          <div key={b.label} className="rounded-lg border border-[#DCEDE3] bg-white/70 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">{b.label}</span>
              <SignalBadge label={b.chip.label} tone={b.chip.tone} size="sm" />
            </div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <span className="font-display text-[18px] leading-none text-navy-deep">{b.value}</span>
              {b.spark && b.spark.length >= 2 && <Sparkline values={b.spark} tone="positive" width={64} height={22} />}
            </div>
            <span className="mt-0.5 block text-[9px] text-ink-secondary">{b.note}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-start gap-1.5 rounded-lg px-3 py-2" style={{ background: `${PALETTE.emerald}12` }}>
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: PALETTE.emerald }} />
        <p className="text-[10.5px] font-medium leading-snug text-navy-deep/85">Costs stayed inside ₹100 of premium — the book is self-funding.</p>
      </div>
    </div>
  )
}

// Shareholder-return "PAT-to-ROE Return Bridge" — the drivers that build ROE
// flow left→right into the ROE output; the large capital base is the drag.
// Shareholder-return "PAT-to-ROE Return Engine" — a rising PAT pool feeds three
// lifting boosters (PAT growth, margin, operating leverage); the large capital
// base is a visible drag/weight; the result lands in the ROE output. Lift/drag
// is shown by block offset (boosters sit high, the drag sits low) so the story
// reads instantly: profit is improving, ROE still early because capital is large.
function ReturnBridge({ company, series }: { company: Insurer; series: AnnualPoint[] }) {
  const mm = getMarginMetrics(company)
  const ol = operatingLeverage(company, series)
  const patSeries = NET_PROFIT_QUARTERS[company.id]
  const hasTrend = patSeries !== undefined
  const roe = company.roe
  const roeModerate = roe > 0 && roe < 10

  const boosters = [
    { key: 'patg', kicker: 'Booster', label: 'PAT growth', value: ol.patYoY == null ? 'n/a' : `${ol.patYoY >= 0 ? '+' : ''}${ol.patYoY.toFixed(0)}%`, sub: 'Profit pool expanding', color: PALETTE.emerald, bg: '#EAF5EE', border: '#CFE7DA' },
    { key: 'margin', kicker: 'Booster', label: 'Net margin', value: hasTrend ? `${mm.netMargin.toFixed(1)}%` : 'n/a', sub: 'Conversion improving', color: GOLD, bg: '#FBF1D8', border: '#E9D49A' },
    { key: 'lev', kicker: 'Booster', label: 'Op. leverage', value: ol.expDelta == null ? 'n/a' : ol.expDelta < 0 ? `↓${Math.abs(ol.expDelta).toFixed(1)}pp` : `↑${ol.expDelta.toFixed(1)}pp`, sub: 'Expenses easing', color: PALETTE.teal, bg: '#E7F4F3', border: '#C9E5E3' },
  ]

  return (
    <div className="rounded-xl border p-4" style={{ background: '#FCF4EC', borderColor: '#EFDDCB' }}>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Return Engine</p>
          <h3 className="mt-0 font-display text-[14.5px] leading-tight text-navy-deep">PAT-to-ROE Return Engine</h3>
        </div>
        <span className="shrink-0 text-[9.5px] text-ink-secondary">FY25</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-ink-secondary">Rising profit and its boosters lift the return; the large capital base drags it back before ROE.</p>

      <div className="mt-4 flex items-stretch gap-2">
        {/* Rising PAT pool — the source */}
        <div className="flex w-[96px] shrink-0 flex-col justify-between rounded-xl px-3 py-3 text-white" style={{ background: `linear-gradient(160deg, ${PALETTE.emerald} 0%, #1F6B49 100%)` }}>
          <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/85">PAT pool</span>
          <div className="mt-2">
            {hasTrend ? <Sparkline values={patSeries} tone="positive" width={70} height={22} /> : null}
            <span className="mt-1 block font-display text-[15px] leading-none text-white">{hasTrend ? `₹${patSeries[patSeries.length - 1]} Cr` : 'n/a'}</span>
            <span className="text-[8px] text-white/75">Q4 · rising</span>
          </div>
        </div>

        {/* Boosters lift; capital base drags — central engine */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-1 items-stretch gap-1.5">
            {boosters.map((b, i) => (
              <div key={b.key} className="flex flex-1 flex-col">
                <div className="mb-0.5 flex items-center justify-center"><TrendingUp className="h-3 w-3" style={{ color: b.color }} /></div>
                <div className="flex flex-1 flex-col justify-between rounded-xl border px-2.5 py-2" style={{ background: b.bg, borderColor: b.border, marginTop: i === 1 ? 0 : 6 }}>
                  <span className="truncate text-[8px] font-bold uppercase tracking-[0.05em] text-ink-secondary">{b.label}</span>
                  <span className="mt-1.5 font-display text-[16px] leading-none" style={{ color: b.color }}>{b.value}</span>
                  <span className="mt-1 block text-[8px] leading-tight text-ink-secondary">{b.sub}</span>
                </div>
              </div>
            ))}
          </div>
          {/* Capital base — the drag/weight, sitting low and full-width */}
          <div className="mt-2 flex items-center justify-between rounded-xl border px-3 py-2" style={{ background: '#F1F3F7', borderColor: '#DBE0E8' }}>
            <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.05em] text-ink-secondary">
              <TrendingDown className="h-3 w-3" style={{ color: '#8A93A6' }} />
              Capital base drag
            </span>
            <span className="font-display text-[13px] leading-none text-[#6B7488]">Large · post-IPO</span>
          </div>
        </div>

        {/* Arrow + ROE output destination */}
        <div className="flex shrink-0 items-center"><ChevronRight className="h-5 w-5" style={{ color: ORANGE }} /></div>
        <div className="flex w-[110px] shrink-0 flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center" style={{ background: 'linear-gradient(160deg, #FBEFE4 0%, #FFF7F0 100%)', borderColor: '#EFD9C4', boxShadow: `0 14px 28px ${ORANGE}3a` }}>
          <span className="text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: '#9A5A1E' }}>ROE output</span>
          <span className="mt-1 font-display text-[26px] leading-none" style={{ color: ORANGE }}>{roe > 0 ? `${roe.toFixed(1)}%` : 'n/a'}</span>
          <span className="mt-1 text-[8.5px] leading-snug text-ink-secondary">Early return signal</span>
        </div>
      </div>

      <p className="mt-3.5 text-[11px] leading-relaxed text-navy-deep/85">{roeModerate ? 'ROE is improving as PAT scales, but stays moderate because the post-IPO capital base is still large.' : roe > 0 ? 'ROE is scaling with profitability as PAT compounds against the equity base.' : 'ROE drivers are pending for this carrier.'}</p>
    </div>
  )
}

// Capital "Solvency Cushion Bridge" — floor + cushion = solvency, over a comfort
// reservoir that fills toward the carrier's solvency.
function SolvencyCushionBridge({ company }: { company: Insurer }) {
  const s = company.solvency
  const floor = 1.5
  const cushion = s > 0 ? Math.round((s - floor) * 100) / 100 : null
  const MINS = 1
  const MAXS = 3.6
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - MINS) / (MAXS - MINS)) * 100))
  return (
    <div className="rounded-xl border p-4" style={{ background: '#EFF7F2', borderColor: '#CFE7DA' }}>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Cushion Bridge</p>
          <h3 className="mt-0 font-display text-[14.5px] leading-tight text-navy-deep">Solvency Cushion Bridge</h3>
        </div>
        <span className="shrink-0 text-[9.5px] text-ink-secondary">FY25</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-ink-secondary">How far capital sits above the 1.5x regulatory floor.</p>

      {s > 0 && cushion != null ? (
        <>
          <div className="mt-3.5 flex items-stretch gap-2">
            <div className="flex flex-1 flex-col justify-center rounded-xl border px-3 py-2.5" style={{ background: '#FBEFEF', borderColor: '#EFD4D3' }}>
              <span className="text-[8px] font-bold uppercase tracking-[0.06em] text-ink-secondary">Regulatory floor</span>
              <span className="mt-1.5 font-display text-[18px] leading-none" style={{ color: PALETTE.coral }}>1.50x</span>
            </div>
            <div className="flex shrink-0 items-center px-0.5"><span className="flex h-5 w-5 items-center justify-center rounded-full border bg-white text-[11px] font-bold shadow-sm" style={{ borderColor: '#CFE7DA', color: DEEP_GREEN }}>+</span></div>
            <div className="flex flex-1 flex-col justify-center rounded-xl border px-3 py-2.5" style={{ background: '#E9F5EE', borderColor: '#CDE7D8' }}>
              <span className="text-[8px] font-bold uppercase tracking-[0.06em] text-ink-secondary">Cushion above floor</span>
              <span className="mt-1.5 font-display text-[18px] leading-none" style={{ color: DEEP_GREEN }}>+{cushion.toFixed(2)}x</span>
            </div>
            <div className="flex shrink-0 items-center px-0.5"><span className="flex h-5 w-5 items-center justify-center rounded-full border bg-white text-[11px] font-bold shadow-sm" style={{ borderColor: '#CFE7DA', color: DEEP_GREEN }}>=</span></div>
            <div className="flex w-[100px] shrink-0 flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center" style={{ background: 'linear-gradient(160deg, #E3F3EA 0%, #F3FBF7 100%)', borderColor: '#BFE0CE', boxShadow: `0 12px 26px ${DEEP_GREEN}33` }}>
              <span className="text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: '#1C5C3F' }}>Solvency</span>
              <span className="mt-1 font-display text-[24px] leading-none" style={{ color: DEEP_GREEN }}>{s.toFixed(2)}x</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="relative h-3 w-full overflow-hidden rounded-full ring-1 ring-soft-border/60">
              <div className="absolute inset-y-0 left-0" style={{ width: `${pct(1.5)}%`, background: PALETTE.coral, opacity: 0.26 }} />
              <div className="absolute inset-y-0" style={{ left: `${pct(1.5)}%`, width: `${pct(2) - pct(1.5)}%`, background: PALETTE.amber, opacity: 0.26 }} />
              <div className="absolute inset-y-0" style={{ left: `${pct(2)}%`, right: 0, background: PALETTE.emerald, opacity: 0.26 }} />
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct(s)}%`, background: DEEP_GREEN, opacity: 0.5 }} />
              <div className="absolute inset-y-[-2px] w-[3px] -translate-x-1/2 rounded-full" style={{ left: `${pct(1.5)}%`, background: PALETTE.coral, boxShadow: '0 0 0 2px #fff' }} />
              <div className="absolute inset-y-[-2px] w-[3px] -translate-x-1/2 rounded-full" style={{ left: `${pct(s)}%`, background: DEEP_GREEN, boxShadow: '0 0 0 2px #fff' }} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[9px] text-ink-secondary">
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-sm" style={{ background: PALETTE.coral }} />Floor 1.5x</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-sm" style={{ background: PALETTE.amber }} />Sector ~2.1x</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-sm" style={{ background: DEEP_GREEN }} />Comfort zone</span>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-3">
          <PendingNote>{`Solvency is pending for ${company.shortName}.`}</PendingNote>
        </div>
      )}
    </div>
  )
}

// Reusable closing insight strip — one soft, stage-tinted takeaway line.
function InsightStrip({ line, accent }: { line: string; accent: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border px-4 py-2.5" style={{ background: `${accent}10`, borderColor: `${accent}3a` }}>
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
      <p className="text-[11.5px] leading-relaxed text-navy-deep/90">{line}</p>
    </div>
  )
}

// Core-profitability proof rail — the derived underwriting result headline.
function CoreResultCard({ company, series }: { company: Insurer; series: AnnualPoint[] }) {
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const uw = latest ? underwritingResult(latest) : null
  const hasCR = company.combinedRatio > 0
  return (
    <div className="flex h-full flex-col rounded-xl border p-4" style={{ background: '#F0F8F7', borderColor: '#D2E8E6' }}>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: PALETTE.teal }} />
        <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne">Core Result</p>
      </div>
      <div className="mt-3">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Underwriting result · FY</p>
        <p className="mt-0.5 font-display text-[24px] leading-none" style={{ color: uw == null ? '#94A3B8' : uw >= 0 ? PALETTE.teal : PALETTE.coral }}>{uw == null ? 'Data pending' : crc(uw)}</p>
        <p className="mt-1 text-[9.5px] text-ink-secondary">≈ NEP × (1 − combined ratio)</p>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[#D2E8E6] pt-2.5">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Combined ratio</span>
        <span className="font-display text-[15px] text-navy-deep">{hasCR ? `${company.combinedRatio.toFixed(1)}%` : 'n/a'}</span>
      </div>
      <p className="mt-auto pt-3 text-[10px] leading-snug text-ink-secondary">Profit from insurance itself, before any investment income.</p>
    </div>
  )
}

// One-line proof takeaway per lens (real values; honest pending states).
function lensInsight(id: NodeId, company: Insurer, series: AnnualPoint[]): string {
  const hasCR = company.combinedRatio > 0
  const cost = COST_RATIOS[company.id]
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const uw = latest ? underwritingResult(latest) : null
  const uwSpread = cost ? Math.round((100 - (cost.loss + cost.commission + cost.expense)) * 10) / 10 : null
  const ol = operatingLeverage(company, series)
  switch (id) {
    case 'underwriting':
      return !hasCR
        ? `${company.shortName} reports on a life basis — discipline is read through returns and capital, not combined ratio.`
        : company.combinedRatio < 100
          ? 'Combined ratio below 100% means the core insurance book is producing underwriting surplus before investment income.'
          : 'Combined ratio sits above 100% — underwriting is loss-making, so reported profit leans on investment income.'
    case 'core':
      return uw == null
        ? 'Core underwriting profit is pending reported NEP and combined ratio.'
        : uw > 0
          ? `Core underwriting has turned positive (${crc(uw)}) as the combined ratio moved below 100%.`
          : `Core underwriting is still running a ${crc(uw)} deficit; reported profit leans on investment income.`
    case 'conversion':
      return uwSpread == null
        ? `${company.shortName} reports on a life basis — the ₹100 conversion read is pending.`
        : uwSpread > 0
          ? ol.expDelta != null && ol.expDelta < 0
            ? 'Most of the ₹100 premium is still absorbed by claims and expenses, but the spread has turned positive — early proof of operating leverage.'
            : 'Most of the ₹100 premium is still absorbed by claims and expenses, but the remaining spread has turned positive.'
          : 'Most of the ₹100 premium is absorbed by claims and expenses — the underwriting spread is not yet positive.'
    case 'returns':
      return company.roe <= 0
        ? 'Return on equity is pending for this carrier.'
        : company.roe < 10
          ? 'ROE is improving as PAT scales, but the return profile is still early because the capital base remains large.'
          : 'ROE sits at a healthy level as PAT scales against the equity base.'
    case 'capital':
      return company.solvency > 0
        ? `${company.solvency.toFixed(2)}x solvency gives the company a strong capital cushion to support growth and absorb volatility.`
        : 'Solvency is pending for this carrier.'
  }
  return ''
}

// Returns proof — PAT trajectory with a Yearly (header-range-driven, real
// annual PAT) ⇄ Quarterly (FY25) toggle. Yearly follows the selected years.
function PatPoolCard({ company, series, cardStyle }: { company: Insurer; series: AnnualPoint[]; cardStyle: { background: string; borderColor: string } }) {
  const [view, setView] = useState<TrendView>('Yearly')
  const patSeries = NET_PROFIT_QUARTERS[company.id]
  const yearPoints = series.map((p) => ({ label: p.fy, pat: p.pat }))
  const quarterPoints = patSeries ? QUARTER_LABELS.map((label, i) => ({ label, pat: patSeries[i] })) : []
  const yearsWithPat = yearPoints.filter((p) => p.pat != null).length
  const points = view === 'Yearly' ? yearPoints : quarterPoints
  const hasQuarterly = patSeries !== undefined
  const canShow = view === 'Yearly' ? yearsWithPat >= 1 : hasQuarterly
  return (
    <div className="rounded-xl border p-4" style={cardStyle}>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Proof · PAT Pool</p>
          <h3 className="mt-0 font-display text-[14px] text-navy-deep">{view === 'Yearly' ? 'PAT trajectory · by year' : 'PAT trajectory · Q1–Q4 FY25'}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9.5px] text-ink-secondary">ROE · {company.roe.toFixed(1)}%</span>
          <TrendViewToggle value={view} onChange={setView} accent={ORANGE} />
        </div>
      </div>
      {canShow ? (
        view === 'Yearly' && yearsWithPat < 2 ? (
          <PendingNote>Widen the year range in the header to see the PAT trend — only one reported year is in range.</PendingNote>
        ) : (
          <QuarterlyPatBars points={points} accent={ORANGE} />
        )
      ) : (
        <div className="flex h-[160px] items-center justify-center rounded-md border border-dashed border-soft-border bg-white/60 text-[11.5px] text-ink-secondary">
          Data pending — PAT not reported for {company.shortName}
        </div>
      )}
    </div>
  )
}

function ProfitabilityDetail({ id, company, series }: { id: NodeId; company: Insurer; series: AnnualPoint[] }) {
  const reads = buildNodeReads(company, series)
  const meta = LENS[id]
  const status = lensStatus(id, company, series)
  const cardStyle = { background: meta.cardBg, borderColor: meta.cardBorder }

  let body: ReactNode = null

  switch (id) {
    case 'underwriting':
      body = (
        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <CombinedRatioWaterfall company={company} series={series} />
          <DisciplineQuality company={company} />
        </div>
      )
      break
    case 'core':
      body = (
        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <UnderwritingProfitTrend company={company} series={series} tintBg={meta.cardBg} />
          <CoreResultCard company={company} series={series} />
        </div>
      )
      break
    case 'conversion':
      body = (
        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <ConversionBridge company={company} series={series} />
          <ConversionQuality company={company} series={series} />
        </div>
      )
      break
    case 'returns':
      body = (
        <div className="space-y-4">
          <ReturnBridge company={company} series={series} />
          <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
            <PatPoolCard company={company} series={series} cardStyle={cardStyle} />
            <RoeGaugeCard company={company} />
          </div>
        </div>
      )
      break
    case 'capital':
      body = (
        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <SolvencyCushionBridge company={company} />
          <CapitalBufferCard company={company} />
        </div>
      )
      break
    default:
      body = null
  }

  return (
    <div key={id} className="animate-fade-in space-y-4">
      <LensHeader meta={meta} status={status} />
      {body}
      <InsightStrip line={lensInsight(id, company, series)} accent={meta.accent} />
      <NodeInvestorRead read={reads[id]} accent={meta.accent} src={{ source: meta.source, period: meta.period, confidence: meta.confidence }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main section — Profitability Story Map (clickable engine drives the page)
// ---------------------------------------------------------------------------

const STORY_QUESTION = 'Is premium growth converting into profit, underwriting discipline and strong capital returns?'

export function ProfitabilityCapital() {
  const [selectedNode, setSelectedNode] = useState<NodeId>('underwriting')
  const [statusOpen, setStatusOpen] = useState(false)
  const company = useActiveCompany()
  const { range } = useFilters()
  const copy = getCompanyProfitabilityCopy(company)
  // Clip the annual story to the dashboard-wide Data Range (fiscal-year axis).
  const series = getAnnualSeries(company.id).filter((p) => labelInRange(p.fy, range))

  const hasCR = company.combinedRatio > 0
  const ct = hasCR ? combinedTone(company.combinedRatio) : { label: 'N/A', tone: 'neutral' as Tone }
  const mm = getMarginMetrics(company)
  const hasTrend = NET_PROFIT_QUARTERS[company.id] !== undefined

  // Honest period stamps — snapshot is FY25 audited; PAT series is Q1–Q4 FY25.
  const m = (value: number | null, opts: Partial<Metric> = {}): Metric => ({
    value,
    period: 'FY25',
    source: 'Company filings (mock)',
    status: value === null ? 'Pending' : 'Reported',
    lastUpdated: '2025-05-23',
    ...opts,
  })
  const companyKpis: { label: string; metric: Metric }[] = [
    { label: 'GWP growth', metric: m(company.growth, { unit: '%' }) },
    { label: 'Combined ratio', metric: m(hasCR ? company.combinedRatio : null, { unit: '%' }) },
    { label: 'Net margin', metric: m(hasTrend ? mm.netMargin : null, { unit: '%', period: 'TTM' }) },
    { label: 'ROE', metric: m(company.roe, { unit: '%' }) },
    { label: 'Solvency', metric: m(company.solvency, { unit: 'x' }) },
  ]

  const verdictSummary = !hasCR
    ? `Life carrier — ROE ${company.roe.toFixed(1)}% and ${company.solvency.toFixed(2)}x solvency anchor the read.`
    : ct.tone === 'positive'
      ? `Combined ratio ${company.combinedRatio.toFixed(1)}%, ROE ${company.roe.toFixed(1)}% and ${company.solvency.toFixed(2)}x solvency — discipline is translating into capital returns.`
      : ct.tone === 'warning'
        ? `Combined ratio ${company.combinedRatio.toFixed(1)}% sits in the watch band; ROE ${company.roe.toFixed(1)}% holds while solvency stays at ${company.solvency.toFixed(2)}x.`
        : `Combined ratio ${company.combinedRatio.toFixed(1)}% is loss-making; profitability hinges on the ${company.solvency.toFixed(2)}x capital cushion.`

  const heroTone = ct.tone === 'positive' ? PALETTE.emerald : ct.tone === 'warning' ? PALETTE.amber : ct.tone === 'negative' ? PALETTE.coral : PALETTE.navy

  return (
    <div className="space-y-5">
      {/* ─── PAGE HEADER — title · question · verdict · data status ─── */}
      <section className="card-surface relative overflow-hidden p-4">
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: `linear-gradient(180deg, ${heroTone} 0%, ${PALETTE.champagne} 100%)` }} />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-1/3 opacity-60"
          style={{ background: `radial-gradient(circle at 80% 30%, ${PALETTE.champagneSoft} 0%, transparent 60%), radial-gradient(circle at 60% 80%, ${PALETTE.softBlue} 0%, transparent 60%)` }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-x-5 gap-y-3 pl-2">
          <div className="min-w-[260px] flex-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-2.5 w-2.5 text-champagne" />
              <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Profitability · FY25</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[20px] leading-tight text-navy-deep">{company.shortName} · Profitability Story</h2>
              <SignalBadge label={copy.badge} tone={copy.tone === 'positive' ? 'positive' : copy.tone === 'warning' ? 'warning' : copy.tone === 'negative' ? 'negative' : copy.tone === 'teal' ? 'teal' : 'navy'} size="sm" />
            </div>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-ink-secondary">{STORY_QUESTION}</p>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-ink-secondary/85">{verdictSummary}</p>
          </div>
          <button
            type="button"
            onClick={() => setStatusOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-soft-border bg-card px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:border-muted-blue hover:text-navy-primary"
          >
            <Database className="h-3.5 w-3.5" />
            Data status
          </button>
        </div>
      </section>

      {/* ─── PROFITABILITY STORY MAP — clickable engine controls the page ─── */}
      <ProfitabilityEngine company={company} series={series} selectedId={selectedNode} onSelect={setSelectedNode} />

      {/* ─── ACTIVE DETAIL — one node's charts + status + investor read ─── */}
      <ProfitabilityDetail id={selectedNode} company={company} series={series} />

      <DataStatusDrawer
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        moduleName={`${company.shortName} · Profitability Story`}
        entries={companyKpis.map((k) => ({ label: k.label, metric: k.metric }))}
        basis={profitabilityBasis}
      />
    </div>
  )
}
