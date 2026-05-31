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
  TrendingUp,
  TrendingDown,
  Minus,
  Layers,
  type LucideIcon,
} from 'lucide-react'
import { SignalBadge } from '@/components/SignalBadge'
import { SourceTag } from '@/components/SourceTag'
import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'
import { useActiveCompany, useFilters } from '@/state/filters'
import { labelInRange } from '@/lib/dateRange'
import { lookupProvenance, getInsurers } from '@/lib/dataLayer'
import { getCompanyProfitabilityCopy } from '@/lib/companyCopy'
import type { Insurer, TimePeriod } from '@/data/types'
import { AccountingBasisToggle, BasisPill, BasisExplainer } from '@/components/AccountingBasisControls'
import { AccountingDetailDrawer } from '@/components/AccountingDetailDrawer'
import { ProfitQualityCheck } from '@/components/ProfitQualityCheck'
import { getEarningsBridge } from '@/data/earningsBridge'
import {
  getBasisProfit,
  getBasisPatGrowth,
  latestAnnualWithPat,
  hasBasisData,
  periodLabel,
  Q4_PERIODS,
  BASIS_LABEL,
  BASIS_SOURCE_LABEL,
  BASIS_TRACKED_COMPANIES,
  type AccountingBasis,
  type BasisPeriod,
} from '@/data/accountingBasis'

// ---------------------------------------------------------------------------
// Source provenance — resolve a real, clickable filing URL for a metric so each
// SourceTag links to the exact document the number came from. Annual combined
// ratio / solvency / PAT / expense are real (snapshot + provenance); quarterly
// splits and the cost breakdown are illustrative and carry no fake link.
// ---------------------------------------------------------------------------

interface ResolvedSource {
  source: string
  confidence: 'high' | 'medium' | 'low' | 'pending'
  provenance?: { source_name?: string; source_url?: string; fetched_at?: string | null }
  illustrative?: boolean
}

function realSource(metric: string, companyId: string): ResolvedSource | null {
  const p = lookupProvenance(`company.${metric}`, companyId, 'Annual')
  if (!p?.source_url) return null
  return {
    source: 'Company filing',
    confidence: p.confidence,
    provenance: { source_name: p.source_name, source_url: p.source_url, fetched_at: p.fetched_at },
  }
}

// A quiet "illustrative" tag for mock-derived visuals — no fake source link.
const ILLUSTRATIVE: ResolvedSource = { source: 'Illustrative', confidence: 'pending', illustrative: true }

// ---------------------------------------------------------------------------
// Mock data (FY25 basis · ₹ Cr where applicable)
// ---------------------------------------------------------------------------

// Real annual PAT (₹ Cr) for the company, drawn from the audited annual
// snapshot — only reported years, never a fabricated quarterly series. Returns
// the values in fiscal order; an empty array means PAT is unreported (the UI
// then shows an honest "pending" state rather than a mock number).
function realPatValues(series: AnnualPoint[]): number[] {
  return series.map((p) => p.pat).filter((v): v is number => v != null)
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

// Real IRDAI public-disclosure (statutory) combined ratio for the focal company,
// extracted and cross-validated from Niva Bupa's quarterly NL-form filings
// (see scripts/ingest/disclosure-extract.ts). The statutory basis is stricter
// than the company-reported headline (FY25: 101.2% vs 96.8%); standalone
// quarters swing seasonally and run above the full-year figure. Peers stay on
// the company-reported seed basis so the peer scorecard remains like-for-like.
interface StatutoryCR {
  statutory: number // full-year statutory combined ratio (latest complete FY)
  statutoryFY: string
  reported: number // company-reported combined ratio, same period
  reportedFY: string
  annual: { fy: string; cr: number }[]
  quarters: { label: string; cr: number }[]
  sourceUrl: string
}

const STATUTORY_CR: Record<string, StatutoryCR> = {
  'niva-bupa': {
    statutory: 101.2,
    statutoryFY: 'FY25',
    reported: 96.8,
    reportedFY: 'FY25',
    annual: [
      { fy: 'FY22', cr: 107 },
      { fy: 'FY23', cr: 97 },
      { fy: 'FY24', cr: 99 },
      { fy: 'FY25', cr: 101.2 },
      { fy: 'FY26', cr: 103.4 },
    ],
    quarters: [
      { label: 'Q1 FY25', cr: 106 },
      { label: 'Q2 FY25', cr: 101.3 },
      { label: 'Q3 FY25', cr: 108.29 },
      { label: 'Q4 FY25', cr: 92.78 },
      { label: 'Q1 FY26', cr: 116.97 },
      { label: 'Q2 FY26', cr: 111.72 },
      { label: 'Q3 FY26', cr: 108.19 },
      { label: 'Q4 FY26', cr: 86.12 },
    ],
    sourceUrl: 'https://transactions.nivabupa.com/pages/investor-relations.aspx',
  },
}

// Real FY25 cost split for the focal company, decomposed from Niva Bupa's IRDAI
// public disclosure (Mar-2025, full-year/YTD column of the NL-form analytical
// ratios):
//   • loss (claims)  = Net Incurred Claims to Net Earned Premium = 61.22%
//   • commission     = Net Commission Ratio                      = 19.83%
//   • expense (opex) = Combined Ratio − claims − commission      = 20.17%
// The three sum to the real statutory combined ratio (101.22%), so the ₹100
// engine reconciles with the combined-ratio headline shown above it. Opex is the
// exact arithmetic residual of the published combined ratio (no separate opex
// ratio is published in this form). Peers are omitted — no verified cost split
// has been sourced for them yet — so their cards render an honest "Data pending"
// rather than a fabricated number.
const COST_RATIOS: Record<string, { loss: number; commission: number; expense: number }> = {
  'niva-bupa': { loss: 61.22, commission: 19.83, expense: 20.17 },
}

const QUARTER_LABELS = ['Q1 FY25', 'Q2 FY25', 'Q3 FY25', 'Q4 FY25']

// Net margin from REAL audited data only: latest fiscal year that reports both
// PAT and GWP → PAT / GWP. Returns null (honest "pending") when unreported —
// never a fabricated quarterly sum. Same-year basis so it stays consistent with
// the selected Data Range.
function getMarginMetrics(series: AnnualPoint[]): { netMargin: number | null; latestPat: number | null; latestFy: string | null } {
  const withBoth = series.filter((p) => p.pat != null && p.gwp != null && p.gwp > 0)
  const latest = withBoth[withBoth.length - 1]
  if (!latest) return { netMargin: null, latestPat: null, latestFy: null }
  return {
    netMargin: Math.round((latest.pat! / latest.gwp!) * 1000) / 10,
    latestPat: latest.pat!,
    latestFy: latest.fy,
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

// Audited core underwriting result (₹ Cr) by fiscal year, from the earnings
// bridge (real Revenue-Account figures). This is the authoritative core-profit
// number — the SAME one the Profit Quality Check and the GWP→PAT waterfall use —
// so the page never shows underwriting as a profit in one place and a loss in
// another. Empty for companies without an audited bridge.
function bridgeUwByFy(companyId: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const y of getEarningsBridge(companyId)) out[y.fy] = y.igaap.underwritingResult
  return out
}

// Core underwriting result for a company-year: prefer the audited bridge figure
// where it exists, else fall back to the transparent NEP × (1 − combined ratio)
// proxy. null (honest "pending") when neither input is available.
function underwritingFor(companyId: string, p: AnnualPoint, bridge?: Record<string, number>): number | null {
  const b = bridge ?? bridgeUwByFy(companyId)
  return p.fy in b ? b[p.fy] : underwritingResult(p)
}

// ─── Peer benchmark — selected company vs peer-group median ───────────────────
// Uses the same snapshot-built insurer universe as the focal company, so the
// comparison is like-for-like (company-reported basis). Median is taken across
// the peer group EXCLUDING the focal company; null when fewer than 2 peers
// report the metric — never a fabricated benchmark.
function peerMedian(company: Insurer, pick: (i: Insurer) => number | null | undefined): number | null {
  const vals = getInsurers()
    .filter((i) => i.id !== company.id && i.peerGroup === company.peerGroup)
    .map(pick)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b)
  if (vals.length < 2) return null
  const mid = Math.floor(vals.length / 2)
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
}

// Compact "vs peer median" chip — a thin reference tag, never a chart. Tinted
// green when the focal company is better than the median, coral when worse.
// `higherIsBetter` flips the logic (ROE / solvency: higher better; combined
// ratio: lower better).
function PeerMedianTag({ value, median, fmt, higherIsBetter, label = 'Peer median' }: { value: number | null; median: number | null; fmt: (v: number) => string; higherIsBetter: boolean; label?: string }) {
  if (median == null || value == null) return null
  const better = higherIsBetter ? value >= median : value <= median
  const c = better ? PALETTE.emerald : PALETTE.coral
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8.5px] font-semibold leading-none" style={{ borderColor: `${c}44`, background: `${c}12`, color: c }}>
      <span className="h-1 w-1 rounded-full" style={{ background: c }} />
      {label} {fmt(median)} · {better ? 'ahead' : 'behind'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Accounting-basis lens — two real bases: IGAAP / Statutory (the default) and
// IFRS. IGAAP / Statutory IS the dashboard's existing statutory data path, so
// every company keeps working and `isIfrs` is false. IFRS is an overlay sourced
// from the insurers' IFRS accounts (annual report / investor presentation):
// PAT, PAT margin, PAT growth and the combined / claims / expense ratios switch
// to the IFRS dataset, with NA where a period is unreported. ROE on IFRS is NA —
// there is no IFRS equity to compute it cleanly, and it is never derived from
// statutory net worth. The granular cost-split and trajectory engines stay on
// the statutory disclosure basis (the only basis with that granularity) — never
// silently mixed; a banner makes that explicit when IFRS is selected.
// ---------------------------------------------------------------------------
interface BasisCtx {
  basis: AccountingBasis
  /** true only for IFRS — the overlay. IGAAP / Statutory uses the base path. */
  isIfrs: boolean
  tracked: boolean
  period: BasisPeriod | null
  pLabel: string
  /** Source label for the selected basis (Company filing / Annual report). */
  sourceLabel: string
  pat: number | null
  patMargin: number | null
  patGrowth: number | null
  combinedRatio: number | null
  claimsRatio: number | null
  expenseRatio: number | null
  roe: number | null
}

function buildBasisCtx(company: Insurer, basis: AccountingBasis): BasisCtx {
  const tracked = hasBasisData(company.id)
  const sourceLabel = BASIS_SOURCE_LABEL[basis]
  if (basis === 'igaap') {
    // IGAAP / Statutory = the existing statutory data path; components use their
    // own reported-statutory values. No overlay or period anchor needed.
    return { basis, isIfrs: false, tracked, period: null, pLabel: 'FY25', sourceLabel, pat: null, patMargin: null, patGrowth: null, combinedRatio: null, claimsRatio: null, expenseRatio: null, roe: null }
  }
  // Anchor IFRS to FY25 — the page's reported year — so switching basis never
  // silently jumps the period to FY26. Fall back to the latest reported IFRS
  // year only if FY25 IFRS PAT is unavailable (never a hardcoded FY26 default).
  const period: BasisPeriod = getBasisProfit(company.id, 'ifrs', 'FY25')?.pat != null
    ? 'FY25'
    : latestAnnualWithPat(company.id, 'ifrs') ?? 'FY25'
  const bp = getBasisProfit(company.id, 'ifrs', period)
  return {
    basis,
    isIfrs: true,
    tracked,
    period,
    pLabel: periodLabel(period),
    sourceLabel,
    pat: bp?.pat ?? null,
    patMargin: bp?.patMarginGwp ?? null,
    patGrowth: getBasisPatGrowth(company.id, 'ifrs', period),
    combinedRatio: bp?.combinedRatio ?? null,
    claimsRatio: bp?.claimsRatio ?? null,
    expenseRatio: bp?.expenseRatio ?? null,
    roe: null, // IFRS ROE not available (no IFRS equity reported) — never derived
  }
}

// Explicit basis context inside the detail panel, shown only when IFRS is
// selected — so the investor knows the headline numbers are on the IFRS lens
// and that the granular engines below remain on the statutory disclosure basis.
function BasisBanner({ ctx, company }: { ctx: BasisCtx; company: Insurer }) {
  if (!ctx.isIfrs) return null
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-soft-border bg-ice/60 px-3.5 py-2">
      <BasisPill basis={ctx.basis} />
      {ctx.tracked ? (
        <p className="text-[10.5px] leading-snug text-ink-secondary">
          On <span className="font-semibold text-navy-deep">{BASIS_LABEL[ctx.basis]}</span> basis ({ctx.pLabel}). Engines below stay statutory — never mixed.
        </p>
      ) : (
        <p className="text-[10.5px] leading-snug text-ink-secondary">
          {company.shortName}: no IFRS data (<span className="italic">NA</span>). Tracked for <span className="font-semibold text-navy-deep">{BASIS_TRACKED_COMPANIES.join(', ')}</span>.
        </p>
      )}
    </div>
  )
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

// ─── (B) Profitability Story Map — the clickable navigation brain ────────────
// The five-node infographic now *controls* the page: clicking a node reveals
// only that node's charts, status and investor read below. Each metric appears
// exactly once; values reuse the same honest derivations so the story stays
// dynamic across companies. Missing inputs render as "n/a"/"Pending", never 0.

type NodeId = 'underwriting' | 'core' | 'conversion' | 'returns' | 'capital'

type StatusTone = 'positive' | 'teal' | 'warning' | 'negative' | 'navy'
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
  /** One small checkpoint status — Strong / Improving / Watch / Weak. */
  badge: { label: string; tone: StatusTone }
}

const ORANGE = '#C2691C' // shareholder return — controlled amber-orange (monitor, not danger)
const GOLD = '#C99A2E' // profit conversion — warm gold (value creation, not warning)
const DEEP_GREEN = '#1E6B4A' // capital support — deepest green (safety, resilience)

// Tone → ink colour for the compact checkpoint status pills on the Story Map.
const STATUS_TINT: Record<StatusTone, string> = {
  positive: PALETTE.emerald,
  teal: PALETTE.teal,
  warning: PALETTE.amber,
  negative: PALETTE.coral,
  navy: PALETTE.navy,
}

// Single source of truth for a checkpoint's status — Strong / Improving / Watch
// / Weak (or n/a / NA / Pending). Shared by the Story Map node badges AND the
// detail LensHeader, so the map and the drill-down can never disagree. Combined
// ratio leads the focal company's statutory figure (same as the headline KPI).
function nodeStatus(id: NodeId, company: Insurer, series: AnnualPoint[], ctx: BasisCtx): { label: string; tone: StatusTone } {
  const naBadge: { label: string; tone: StatusTone } = { label: ctx.isIfrs ? 'NA' : 'n/a', tone: 'navy' }
  if (id === 'underwriting') {
    const cr = ctx.isIfrs ? ctx.combinedRatio : STATUTORY_CR[company.id]?.statutory ?? (company.combinedRatio > 0 ? company.combinedRatio : null)
    if (cr == null) return naBadge
    return cr < 100 ? { label: 'Strong', tone: 'positive' } : cr <= 105 ? { label: 'Watch', tone: 'warning' } : { label: 'Weak', tone: 'negative' }
  }
  if (id === 'core') {
    if (ctx.isIfrs) return { label: 'NA', tone: 'navy' }
    const latest = series[series.length - 1] as AnnualPoint | undefined
    const uw = latest ? underwritingFor(company.id, latest) : null
    return uw == null ? { label: 'Pending', tone: 'navy' } : uw > 0 ? { label: 'Strong', tone: 'positive' } : { label: 'Weak', tone: 'negative' }
  }
  if (id === 'conversion') {
    const pm = ctx.isIfrs ? ctx.patMargin : getMarginMetrics(series).netMargin
    if (pm == null) return naBadge
    const pats = series.filter((p) => p.pat != null)
    const patYoY = pats.length >= 2 && pats[pats.length - 2].pat ? ((pats[pats.length - 1].pat! - pats[pats.length - 2].pat!) / Math.abs(pats[pats.length - 2].pat!)) * 100 : null
    return pm > 5 ? { label: 'Strong', tone: 'positive' } : pm > 0 ? (patYoY != null && patYoY > 0 ? { label: 'Improving', tone: 'teal' } : { label: 'Watch', tone: 'warning' }) : { label: 'Weak', tone: 'negative' }
  }
  if (id === 'returns') {
    const roe = ctx.isIfrs ? ctx.roe : company.roe > 0 ? company.roe : null
    if (roe == null) return naBadge
    return roe >= 12 ? { label: 'Strong', tone: 'positive' } : roe >= 5 ? { label: 'Improving', tone: 'teal' } : roe > 0 ? { label: 'Watch', tone: 'warning' } : { label: 'Weak', tone: 'negative' }
  }
  const s = company.solvency
  return s <= 0 ? { label: 'n/a', tone: 'navy' } : s >= 2 ? { label: 'Strong', tone: 'positive' } : s >= 1.5 ? { label: 'Watch', tone: 'warning' } : { label: 'Weak', tone: 'negative' }
}

function buildEngineStages(company: Insurer, series: AnnualPoint[], ctx: BasisCtx): EngineStage[] {
  const hasCR = company.combinedRatio > 0
  const latest = series[series.length - 1] as AnnualPoint | undefined
  // Core underwriting uses the audited bridge figure where available (focal), so
  // this node agrees with the Profit Quality Check + waterfall — never a profit
  // in one place and a loss in another.
  const uw = latest ? underwritingFor(company.id, latest) : null
  const patMargin = latest && latest.pat != null && latest.gwp ? (latest.pat / latest.gwp) * 100 : null
  const solvency = company.solvency
  // Combined ratio leads the focal company's real IRDAI statutory figure (the
  // SAME number as the header KPI + Discipline Engine), so the map never shows a
  // different combined ratio from the detail below. IFRS switches to its dataset.
  const statCR = STATUTORY_CR[company.id]?.statutory ?? null
  const crVal = ctx.isIfrs ? ctx.combinedRatio : statCR ?? (hasCR ? company.combinedRatio : null)
  const pmVal = ctx.isIfrs ? ctx.patMargin : patMargin
  const roeVal = ctx.isIfrs ? ctx.roe : company.roe > 0 ? company.roe : null
  const naWord = ctx.isIfrs ? 'NA' : 'n/a'

  return [
    {
      id: 'underwriting',
      n: 1,
      label: 'Underwriting discipline',
      metricLabel: 'Combined ratio',
      value: crVal == null ? naWord : `${crVal.toFixed(1)}%`,
      missing: crVal == null,
      color: PALETTE.emerald,
      Icon: ShieldCheck,
      explore: 'Are costs below ₹100 of premium?',
      badge: nodeStatus('underwriting', company, series, ctx),
    },
    {
      id: 'core',
      n: 2,
      label: 'Core profitability',
      metricLabel: 'Underwriting result',
      value: ctx.isIfrs ? 'NA' : uw == null ? 'Pending' : crc(uw),
      missing: ctx.isIfrs || uw == null,
      color: PALETTE.teal,
      Icon: Gauge,
      explore: 'Does insurance itself make money?',
      badge: nodeStatus('core', company, series, ctx),
    },
    {
      id: 'conversion',
      n: 3,
      label: 'Profit conversion',
      metricLabel: 'PAT margin',
      value: pmVal == null ? (ctx.isIfrs ? naWord : 'Pending') : `${pmVal.toFixed(1)}%`,
      missing: pmVal == null,
      color: GOLD,
      Icon: IndianRupee,
      explore: 'How much premium becomes profit?',
      badge: nodeStatus('conversion', company, series, ctx),
    },
    {
      id: 'returns',
      n: 4,
      label: 'Shareholder return',
      metricLabel: 'ROE',
      value: roeVal == null ? naWord : `${roeVal.toFixed(1)}%`,
      missing: roeVal == null,
      color: ORANGE,
      Icon: BarChart3,
      explore: 'Profit into shareholder return.',
      badge: nodeStatus('returns', company, series, ctx),
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
      explore: 'Capital backing the growth.',
      badge: nodeStatus('capital', company, series, ctx),
    },
  ]
}

// Quarterly / monthly story-map stages. Only combined ratio and PAT margin have
// a quarterly source (the standalone Q4 basis cell); underwriting result, ROE and
// solvency have no quarterly data, and Monthly has none → honest "Pending".
function buildQuarterlyStages(company: Insurer, ctx: BasisCtx, quarter: BasisPeriod | null): EngineStage[] {
  const bp = quarter ? getBasisProfit(company.id, ctx.basis, quarter) : null
  const cr = bp?.combinedRatio ?? null
  const pm = bp?.patMarginGwp ?? null
  const pending: { label: string; tone: StatusTone } = { label: 'Pending', tone: 'navy' }
  const crBadge: { label: string; tone: StatusTone } =
    cr == null ? pending : cr < 100 ? { label: 'Strong', tone: 'positive' } : cr <= 105 ? { label: 'Watch', tone: 'warning' } : { label: 'Weak', tone: 'negative' }
  const pmBadge: { label: string; tone: StatusTone } =
    pm == null ? pending : pm > 5 ? { label: 'Strong', tone: 'positive' } : pm > 0 ? { label: 'Watch', tone: 'warning' } : { label: 'Weak', tone: 'negative' }
  return [
    { id: 'underwriting', n: 1, label: 'Underwriting discipline', metricLabel: 'Combined ratio', value: cr == null ? 'Pending' : `${cr.toFixed(1)}%`, missing: cr == null, color: PALETTE.emerald, Icon: ShieldCheck, explore: 'Are costs below ₹100 of premium?', badge: crBadge },
    { id: 'core', n: 2, label: 'Core profitability', metricLabel: 'Underwriting result', value: 'Pending', missing: true, color: PALETTE.teal, Icon: Gauge, explore: 'Does insurance itself make money?', badge: pending },
    { id: 'conversion', n: 3, label: 'Profit conversion', metricLabel: 'PAT margin', value: pm == null ? 'Pending' : `${pm.toFixed(1)}%`, missing: pm == null, color: GOLD, Icon: IndianRupee, explore: 'How much premium becomes profit?', badge: pmBadge },
    { id: 'returns', n: 4, label: 'Shareholder return', metricLabel: 'ROE', value: 'Pending', missing: true, color: ORANGE, Icon: BarChart3, explore: 'Profit into shareholder return.', badge: pending },
    { id: 'capital', n: 5, label: 'Capital support', metricLabel: 'Solvency', value: 'Pending', missing: true, color: DEEP_GREEN, Icon: Shield, explore: 'Capital backing the growth.', badge: pending },
  ]
}

function ProfitabilityEngine({ company, series, selectedId, onSelect, ctx, period, quarter }: { company: Insurer; series: AnnualPoint[]; selectedId: NodeId; onSelect: (id: NodeId) => void; ctx: BasisCtx; period: TimePeriod; quarter: BasisPeriod | null }) {
  const stages = period === 'Annual' ? buildEngineStages(company, series, ctx) : buildQuarterlyStages(company, ctx, quarter)
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
            <p className="mt-0.5 max-w-md text-[11.5px] leading-snug text-ink-secondary">Track how premium becomes profit.</p>
            <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-ice/70 px-2.5 py-0.5 text-[9.5px] font-medium text-ink-secondary">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: PALETTE.champagne }} />
              5 stages · click to explore
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <BasisPill basis={ctx.basis} />
          <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold text-navy-primary" style={{ borderColor: '#D6E2FA', background: PALETTE.softBlue }}>
            <MousePointerClick className="h-3.5 w-3.5" style={{ color: PALETTE.champagne }} />
            Pick a stage
          </span>
        </div>
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

              {/* Checkpoint status — one small badge: Strong / Improving / Watch / Weak */}
              <span
                className="mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.06em]"
                style={{ color: STATUS_TINT[s.badge.tone], background: `${STATUS_TINT[s.badge.tone]}14` }}
              >
                <span className="h-1 w-1 rounded-full bg-current opacity-80" />
                {s.badge.label}
              </span>

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

      {/* Source — links to the real filing for the headline combined ratio */}
      <div className="mt-4 flex justify-end">
        {(() => {
          const s = realSource('combined_ratio', company.id) ?? realSource('solvency_ratio', company.id)
          return s ? (
            <SourceTag source={s.source} period={series[series.length - 1]?.fy ?? 'FY25'} confidence={s.confidence} provenance={s.provenance} />
          ) : (
            <SourceTag source="Company filing" period={series[series.length - 1]?.fy ?? 'FY25'} confidence="high" />
          )
        })()}
      </div>
    </section>
  )
}

// ─── (D) Underwriting Result Trend — audited core profit/loss over time ──────
// Bridge companies (focal) show the AUDITED underwriting result (Revenue A/c) —
// the same loss the Profit Quality Check + waterfall show — with no combined-
// ratio overlay (the ratio lives in the Discipline lens). Other companies use
// the transparent NEP × (1 − combined) proxy with a combined-ratio overlay.
function UnderwritingProfitTrend({ company, series, tintBg }: { company: Insurer; series: AnnualPoint[]; tintBg?: string }) {
  const inRangeFys = new Set(series.map((p) => p.fy))
  const bridgeYears = getEarningsBridge(company.id).filter((y) => inRangeFys.has(y.fy))
  const useBridge = bridgeYears.length >= 2
  const hasCROverlay = !useBridge
  const data = useBridge
    ? [...bridgeYears].reverse().map((y) => ({ fy: y.fy, uw: y.igaap.underwritingResult, cr: null as number | null }))
    : series.map((p) => ({ fy: p.fy, uw: underwritingResult(p), cr: p.combinedRatio }))
  const usable = data.filter((d) => d.uw != null) as { fy: string; uw: number; cr: number | null }[]
  const enough = usable.length >= 2
  const latest = usable[usable.length - 1]
  const turned = enough && usable.some((d) => d.uw < 0) && latest.uw > 0
  // First year underwriting crosses from loss into profit — the turnaround point.
  let crossIdx = -1
  for (let i = 1; i < usable.length; i++) {
    if (usable[i - 1].uw < 0 && usable[i].uw >= 0) {
      crossIdx = i
      break
    }
  }
  // Strongest profit year gets the boldest green (usually the latest).
  const maxUw = enough ? Math.max(...usable.map((d) => d.uw)) : 0
  const widening = enough && latest.uw < 0 && usable[usable.length - 2].uw != null && latest.uw < usable[usable.length - 2].uw
  const subtitle = !enough
    ? `Trend pending for ${company.shortName}.`
    : latest.uw >= 0
      ? turned ? 'Underwriting moved from loss to profit.' : 'Underwriting stays in profit.'
      : 'Core underwriting is still a loss — investment income is covering it.'
  // The required investor read: does the loss decide future PAT quality?
  const readLine = !enough
    ? ''
    : latest.uw >= 0
      ? 'Core underwriting now earns money before investment income — higher-quality profit.'
      : `Underwriting loss is ${widening ? 'widening' : 'narrowing'} — turning it positive is the key driver of future PAT quality.`
  return (
    <section className="card-surface p-4" style={tintBg ? { background: tintBg } : undefined}>
      <StoryHeader
        eyebrow="Core Profitability"
        title="Underwriting Result Trend"
        subtitle={subtitle}
        right={
          enough ? (
            <SignalBadge label={latest.uw > 0 ? (turned ? 'Turned positive' : 'In profit') : 'In loss'} tone={latest.uw > 0 ? 'positive' : 'negative'} size="sm" />
          ) : undefined
        }
      />
      <div className="mt-3">
        {enough ? (
          <ResponsiveContainer width="100%" height={208}>
            <ComposedChart data={usable} margin={{ top: 18, right: 6, left: -10, bottom: 0 }} barCategoryGap="34%">
              <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} vertical={false} />
              <XAxis dataKey="fy" tick={{ fontSize: 11, fill: '#6B7280', fontWeight: 600 }} tickLine={false} axisLine={{ stroke: PALETTE.border }} />
              <YAxis yAxisId="uw" tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={false} width={46} tickFormatter={(v: number) => `₹${v}`} />
              {hasCROverlay && <YAxis yAxisId="cr" orientation="right" tick={{ fontSize: 9.5, fill: PALETTE.champagne }} tickLine={false} axisLine={false} width={30} unit="%" domain={['dataMin - 3', 'dataMax + 3']} />}
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
              {/* Zero baseline — the key reference: above it is underwriting profit. */}
              <ReferenceLine
                yAxisId="uw"
                y={0}
                stroke={PALETTE.navy}
                strokeOpacity={0.55}
                strokeWidth={1.2}
                label={{ value: 'Above ₹0 = underwriting profit', position: 'insideTopLeft', fontSize: 8.5, fill: PALETTE.navy, opacity: 0.75 }}
              />
              {/* Turnaround marker — points at the first year that crosses into profit. */}
              {crossIdx >= 0 && (
                <ReferenceLine
                  yAxisId="uw"
                  x={usable[crossIdx].fy}
                  stroke="transparent"
                  label={{ value: '↳ Turned positive', position: 'top', fontSize: 9, fill: PALETTE.emerald, fontWeight: 700 }}
                />
              )}
              {/* Combined ratio — secondary, subtle overlay (proxy view only; the
                  audited bridge view shows the result in ₹ Cr without the ratio). */}
              {hasCROverlay && <Line yAxisId="cr" type="monotone" dataKey="cr" name="Combined ratio" stroke={PALETTE.champagne} strokeWidth={1.2} strokeOpacity={0.6} dot={{ r: 2, fill: PALETTE.champagne }} activeDot={{ r: 3.5 }} connectNulls />}
              <Bar yAxisId="uw" dataKey="uw" name="Underwriting result" radius={[3, 3, 0, 0]} maxBarSize={40}>
                {usable.map((d) => {
                  const strongest = d.uw > 0 && d.uw === maxUw
                  const fill = d.uw < 0 ? PALETTE.coral : strongest ? PALETTE.emerald : PALETTE.teal
                  return <Cell key={d.fy} fill={fill} stroke={strongest ? PALETTE.navyDeep : 'none'} strokeWidth={strongest ? 1.4 : 0} />
                })}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <PendingNote>{`Trend pending for ${company.shortName} — needs 2+ years of NEP and combined ratio.`}</PendingNote>
        )}
      </div>
      {readLine && (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[10.5px] font-medium leading-snug text-navy-deep/85" style={{ background: `${latest.uw >= 0 ? PALETTE.emerald : PALETTE.coral}10` }}>
          <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: latest.uw >= 0 ? PALETTE.emerald : PALETTE.coral }} />
          {readLine}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-secondary">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: PALETTE.emerald }} /> Underwriting profit</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: PALETTE.coral }} /> Underwriting loss</span>
          {hasCROverlay && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded-full" style={{ background: PALETTE.champagne }} /> Combined ratio</span>}
        </div>
        {(() => {
          if (!enough) return <SourceTag source="Pending" confidence="pending" />
          const period = `${usable[0].fy}–${latest.fy}`
          if (useBridge) return <SourceTag source="Annual report · Revenue A/c" period={period} confidence="high" />
          const s = realSource('combined_ratio', company.id)
          return s ? (
            <SourceTag source="Company filing · derived" period={period} confidence={s.confidence} provenance={s.provenance} />
          ) : (
            <SourceTag source="Company filing · derived" period={period} confidence="high" />
          )
        })()}
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
function ConversionBridge({ company, series, ctx }: { company: Insurer; series: AnnualPoint[]; ctx: BasisCtx }) {
  const cost = COST_RATIOS[company.id]
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const reportedMargin = latest && latest.pat != null && latest.gwp ? (latest.pat / latest.gwp) * 100 : null
  // The PAT-margin output switches with the selected accounting basis; the ₹100
  // cost split below stays on the statutory disclosure basis (made explicit by
  // the panel banner), so the two bases are never blended inside one number.
  const patMargin = ctx.isIfrs ? ctx.patMargin : reportedMargin
  const periodTag = ctx.isIfrs ? ctx.pLabel : 'FY25'
  const outputCaption = ctx.isIfrs ? `${BASIS_LABEL[ctx.basis]} profit conversion` : 'Reported profit conversion'

  const header = (
    <>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Conversion Engine</p>
          <h3 className="mt-0 font-display text-[14.5px] leading-tight text-navy-deep">Premium-to-Profit Conversion Engine</h3>
        </div>
        <span className="shrink-0 text-[9.5px] text-ink-secondary">{periodTag}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-ink-secondary">₹100 premium → profit.</p>
    </>
  )

  if (!cost) {
    return (
      <div className="rounded-xl border p-4" style={{ background: '#FCF7EA', borderColor: '#ECE1C8' }}>
        {header}
        <div className="mt-3">
          <PendingNote>{`${company.shortName} is a life carrier — needs a claims / commission / opex split. Pending.`}</PendingNote>
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
          <span className="mt-1 font-display text-[26px] leading-none" style={{ color: GOLD }}>{patMargin == null ? (ctx.isIfrs ? 'NA' : 'n/a') : `${patMargin.toFixed(1)}%`}</span>
          <span className="mt-1 text-[8.5px] leading-snug text-ink-secondary">{outputCaption}</span>
          <span className="mt-1.5"><BasisPill basis={ctx.basis} /></span>
        </div>
      </div>
    </div>
  )
}

// Compact proof rail beside the engine: net margin, expense-ratio trend and PAT
// growth — the cleaner replacement for the old Profit-Velocity + Operating-
// Leverage cards (reuses the operatingLeverage helper + sparklines).
function ConversionQuality({ company, series, ctx }: { company: Insurer; series: AnnualPoint[]; ctx: BasisCtx }) {
  const mm = getMarginMetrics(series)
  const patSeries = realPatValues(series)
  const ol = operatingLeverage(company, series)
  // Basis-aware headline scalars (single period on IGAAP/IFRS). The reported PAT
  // sparkline/trend is suppressed on a non-reported basis so a reported trend is
  // never shown beside a basis number.
  const netMargin = ctx.isIfrs ? ctx.patMargin : mm.netMargin
  const netFy = ctx.isIfrs ? ctx.pLabel : mm.latestFy
  const hasMargin = netMargin != null
  const patYoY = ctx.isIfrs ? ctx.patGrowth : ol.patYoY
  const expSingle = ctx.isIfrs ? ctx.expenseRatio : null
  const hasPatTrend = !ctx.isIfrs && patSeries.length >= 2
  const netTone: ChipTone = netMargin == null ? 'navy' : netMargin > 5 ? 'teal' : netMargin > 0 ? 'warning' : netMargin === 0 ? 'navy' : 'negative'
  const hasExp = ol.expFrom != null && ol.expTo != null && ol.expSeries.length >= 2
  const expImproving = ol.expDelta != null && ol.expDelta < 0
  const patUp = patYoY != null && patYoY > 0
  const patStrong = patYoY != null && patYoY >= 50
  const marginFit = hasPatTrend ? fitTrend(patSeries) : null
  const marginUp = marginFit == null ? false : marginFit.slope >= 0
  // Operating-leverage read: is premium outgrowing costs? (Reported basis only —
  // the GWP-growth / expense-ratio trend needs the multi-year reported series.)
  const conclusion = !ctx.isIfrs && ol.gwpGrowth != null && ol.expDelta != null
    ? ol.expDelta < -0.2
      ? `Premium up ${ol.gwpGrowth.toFixed(0)}% with costs easing — operating leverage is building.`
      : ol.gwpGrowth >= 15
        ? `Premium up ${ol.gwpGrowth.toFixed(0)}%, but costs aren't easing yet — margins capped until they do.`
        : 'Conversion still building — watch costs.'
    : patUp || (netMargin != null && netMargin > 0)
      ? 'Premium is turning into profit.'
      : 'Conversion still building — watch costs.'

  return (
    <div className="flex h-full flex-col rounded-xl border p-4" style={{ background: '#FCF7EA', borderColor: '#ECE1C8' }}>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} />
        <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne">Conversion Quality</p>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Net margin{netFy ? ` · ${netFy}` : ''}</span>
              <BasisPill basis={ctx.basis} />
            </span>
            <SignalBadge label={hasMargin ? (netMargin! > 5 ? 'Healthy' : netMargin! > 0 ? 'Thin' : 'Loss') : 'Pending'} tone={hasMargin ? netTone : 'navy'} size="sm" />
          </div>
          <div className="mt-1 flex items-end justify-between gap-2">
            <span className="font-display text-[22px] leading-none text-navy-deep">{hasMargin ? `${netMargin!.toFixed(1)}%` : ctx.isIfrs ? 'NA' : 'Data pending'}</span>
            {hasPatTrend && (
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
            <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Expense ratio{ctx.isIfrs ? ` · ${ctx.pLabel}` : ''}</span>
            {ctx.isIfrs ? (
              <SignalBadge label={expSingle == null ? 'NA' : BASIS_LABEL[ctx.basis]} tone="navy" size="sm" />
            ) : (
              <SignalBadge label={hasExp ? (expImproving ? 'Improving' : 'Flat') : 'Pending'} tone={hasExp && expImproving ? 'teal' : 'navy'} size="sm" />
            )}
          </div>
          <div className="mt-1 flex items-end justify-between gap-2">
            <span className="font-display text-[16px] leading-none text-navy-deep">{ctx.isIfrs ? (expSingle == null ? 'NA' : `${expSingle.toFixed(1)}%`) : hasExp ? `${ol.expFrom!.toFixed(1)}% → ${ol.expTo!.toFixed(1)}%` : 'Data pending'}</span>
            {!ctx.isIfrs && ol.expSeries.length >= 2 && <Sparkline values={ol.expSeries.map((p) => p.expenseRatio as number)} tone="positive" width={70} height={24} />}
          </div>
        </div>

        <div className="border-t border-[#ECE1C8] pt-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">PAT growth · YoY</span>
            <SignalBadge label={patYoY == null ? 'Pending' : patStrong ? 'Strong' : patUp ? 'Rising' : 'Falling'} tone={patYoY == null ? 'navy' : patUp ? 'positive' : 'negative'} size="sm" />
          </div>
          <span className="mt-1 block font-display text-[22px] leading-none text-navy-deep">{patYoY == null ? (ctx.isIfrs ? 'NA' : 'Data pending') : `${patYoY >= 0 ? '+' : ''}${patYoY.toFixed(0)}%`}</span>
        </div>
      </div>

      <div className="mt-auto pt-4">
        <p className="text-[10.5px] font-medium leading-snug text-navy-deep/80">{conclusion}</p>
        <p className="mt-1 text-[9px] leading-snug text-ink-secondary/80">Premium growth must stay ahead of expense growth for margins to expand.</p>
      </div>
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

function RoeGaugeCard({ company, ctx }: { company: Insurer; ctx: BasisCtx }) {
  const roeVal = ctx.isIfrs ? ctx.roe : company.roe > 0 ? company.roe : null
  const roeTone: Tone = roeVal == null ? 'neutral' : roeVal >= 12 ? 'positive' : roeVal >= 5 ? 'warning' : 'negative'
  // Peer benchmark only on the reported basis (the peer universe is reported).
  const roeMedian = ctx.isIfrs ? null : peerMedian(company, (i) => i.roe)
  return (
    <div className="relative overflow-hidden rounded-lg p-3.5" style={{ background: 'linear-gradient(135deg, #FBF1E5 0%, #FFF9F2 100%)' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-navy-primary">ROE · {ctx.isIfrs ? ctx.pLabel : 'FY25'}</p>
        <BasisPill basis={ctx.basis} />
      </div>
      <p className="mt-0.5 font-display text-[26px] leading-none text-navy-deep">{roeVal == null ? 'NA' : `${roeVal.toFixed(1)}%`}</p>
      <p className={`mt-0.5 text-[10.5px] ${toneText[roeTone]}`}>
        {roeVal == null ? (ctx.isIfrs ? 'Not available on this basis' : 'Return pending') : roeTone === 'positive' ? 'Above sector benchmark' : roeTone === 'warning' ? 'Early return signal' : 'Sub-cost-of-capital'}
      </p>
      {!ctx.isIfrs && roeMedian != null && (
        <span className="mt-1 inline-flex"><PeerMedianTag value={roeVal} median={roeMedian} fmt={(v) => `${v.toFixed(1)}%`} higherIsBetter /></span>
      )}
      {ctx.isIfrs && <p className="text-[8.5px] leading-snug text-ink-secondary">ROE not reported on IFRS (no IFRS equity) — shown as NA, not derived.</p>}
      <SemiGauge
        value={roeVal ?? 0}
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
  const uw = latest ? underwritingFor(company.id, latest) : null
  const roe = company.roe
  const solvency = company.solvency
  const costAbsorb = cost ? cost.loss + cost.commission + cost.expense : null
  // Lead the focal company's statutory combined ratio (same number shown on the
  // map + Discipline Engine), so the read agrees with the headline.
  const crLead = STATUTORY_CR[company.id]?.statutory ?? (hasCR ? company.combinedRatio : null)

  return {
    underwriting: {
      soWhat: crLead == null
        ? `${company.shortName} is a life carrier — read returns and capital.`
        : crLead < 100
          ? 'Costs sit below ₹100 of premium — disciplined underwriting.'
          : 'Costs sit just above ₹100 of premium — discipline is the key monitorable.',
      why: costAbsorb == null
        ? 'Cost split not reported on this basis.'
        : `Claims, commission and opex take ₹${costAbsorb.toFixed(0)} of every ₹100${costAbsorb > 100 ? ' — just over break-even.' : '.'}`,
      meaning: crLead == null
        ? 'Read via returns and capital.'
        : crLead < 100
          ? 'Underwriting can stand on its own, before investment income.'
          : 'Profit still leans on investment income.',
      watch: 'Claims ratio, expense ratio, combined ratio vs 100%.',
    },
    core: {
      soWhat: uw == null
        ? 'Underwriting result pending NEP and combined ratio.'
        : uw > 0
          ? 'Insurance itself makes money — high-quality profit.'
          : 'Core underwriting is still a loss; PAT leans on investment income.',
      why: uw == null ? 'Needs NEP and combined ratio.' : `Premium earned − claims − commission − operating cost = ${crc(uw)}.`,
      meaning: 'The profit from insurance alone, before investments.',
      watch: 'Is the underwriting loss narrowing toward break-even?',
    },
    conversion: {
      soWhat: uw != null && uw > 0
        ? 'Premium converting to profit, but thin.'
        : 'Premium not yet converting; profit leans on investments.',
      why: 'Claims, commission and opex absorb most premium.',
      meaning: 'Better expense leverage can lift conversion.',
      watch: 'PAT margin, claims, expense, underwriting profit.',
    },
    returns: {
      soWhat: roe <= 0 ? 'ROE pending.' : 'ROE improving, not yet mature.',
      why: 'PAT and margin help; large capital dilutes ROE.',
      meaning: 'ROE rises if profit outgrows equity.',
      watch: 'PAT growth, ROE, solvency, capital use.',
    },
    capital: {
      soWhat: solvency > 0
        ? `${solvency.toFixed(2)}x solvency — strong cushion vs the 1.5x floor.`
        : 'Solvency pending.',
      why: solvency > 0 ? `${(solvency - 1.5).toFixed(2)}x above the 1.5x floor.` : 'Awaiting solvency ratio.',
      meaning: 'Strong capital funds growth, low raise risk.',
      watch: 'Solvency trend as growth uses capital.',
    },
  }
}

function NodeInvestorRead({ read, accent, src, period, ctx }: { read: NodeRead; accent: string; src: ResolvedSource; period?: string; ctx: BasisCtx }) {
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
        {ctx.isIfrs && (
          <p className="mt-1.5 max-w-3xl text-[11px] leading-relaxed text-ink-secondary">
            Figures shown on the <span className="font-semibold text-navy-deep">IFRS</span> basis ({ctx.pLabel}). PAT can read very differently on IGAAP / Statutory vs IFRS — see the “PAT by Accounting Basis” card in the Profit conversion stage.
          </p>
        )}
        <dl className="mt-2.5 grid grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-[120px_1fr]">
          {lines.map((line) => (
            <div key={line.label} className="contents">
              <dt className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-champagne-deep">{line.label}</dt>
              <dd className="text-[11.5px] leading-relaxed text-navy-deep/85">{line.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-soft-border/70 pt-2.5">
          <span className="inline-flex items-center gap-1.5">
            <BasisPill basis={ctx.basis} />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{ctx.isIfrs && ctx.pat == null ? 'Not available' : 'Official'}</span>
          </span>
          {ctx.isIfrs ? (
            <SourceTag source={ctx.sourceLabel} period={ctx.pLabel} confidence="high" />
          ) : (
            <SourceTag source={src.source} period={period} confidence={src.confidence} provenance={src.provenance} />
          )}
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
    line: 'Are costs below premium?',
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
    line: 'Underwriting profit before investments?',
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
    line: 'How much premium becomes profit?',
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
    line: 'Return earned for shareholders.',
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
    line: 'Enough capital to fund growth?',
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

// The active-lens header badge reuses the SAME checkpoint status as the Story
// Map (nodeStatus), so the map and the drill-down never show a different status
// for the same stage.
function lensStatus(id: NodeId, company: Insurer, series: AnnualPoint[], ctx: BasisCtx): { label: string; tone: ChipTone } {
  return nodeStatus(id, company, series, ctx)
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
  // Focal company: lead with the IRDAI statutory combined ratio (verified from
  // quarterly filings), keeping the company-reported number alongside. Peers
  // stay on the company-reported seed value.
  const stat = STATUTORY_CR[company.id]
  const hasCR = stat != null || company.combinedRatio > 0
  const crSeries = COMBINED_RATIO_QUARTERS[company.id]
  const [view, setView] = useState<TrendView>('Yearly')
  // Yearly trajectory: statutory annual series for the focal company, else the
  // header-range snapshot series. Quarterly: real statutory standalone quarters
  // for the focal company, else the (mock) quarterly drift.
  const yearPoints = stat
    ? stat.annual.map((p) => ({ label: p.fy, cr: p.cr as number | null }))
    : series.map((p) => ({ label: p.fy, cr: p.combinedRatio }))
  const quarterPoints = stat
    ? stat.quarters.map((q) => ({ label: q.label, cr: q.cr as number | null }))
    : crSeries
      ? QUARTER_LABELS.map((label, i) => ({ label, cr: crSeries[i] }))
      : []
  const trajPoints = view === 'Yearly' ? yearPoints : quarterPoints
  const yearsWithCR = yearPoints.filter((p) => p.cr != null).length
  // Authoritative combined ratio anchors the whole section (statutory for focal).
  const cr = stat ? stat.statutory : hasCR ? company.combinedRatio : null
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
      <p className="mt-1 text-[11px] leading-snug text-ink-secondary">₹100 premium vs claims and costs.</p>

      {cost && cr != null ? (
        <>
          {/* Engine flow: ₹100 base → cost chambers → combined-ratio output → surplus.
              Scrolls horizontally on narrow screens so labels never truncate. */}
          <div className="mt-4 -mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex items-stretch gap-1.5">
              {/* Premium base — the input */}
              <div className="flex w-[84px] shrink-0 flex-col items-center justify-center rounded-xl px-2 py-3 text-center text-white" style={{ background: `linear-gradient(160deg, ${PALETTE.navyDeep} 0%, ${PALETTE.navy} 100%)` }}>
                <span className="text-[8px] font-bold uppercase leading-tight tracking-[0.08em]" style={{ color: '#E9D49A' }}>Premium base</span>
                <span className="mt-1 font-display text-[22px] leading-none">₹100</span>
                <span className="mt-1 text-[8px] leading-tight text-white/70">received</span>
              </div>

              {/* Cost chambers — width ∝ amount absorbed; the meter shows relative weight */}
              <div className="flex min-w-0 flex-1 items-stretch gap-1.5">
                {chambers.map((c, i) => (
                  <Fragment key={c.key}>
                    {i > 0 && <span className="flex w-2.5 shrink-0 items-center justify-center text-[12px] font-bold text-ink-secondary/40">−</span>}
                    <div
                      className="flex flex-col justify-between rounded-xl border px-2.5 py-2"
                      style={{ background: c.bg, borderColor: c.border, flexGrow: c.raw, flexBasis: 0, minWidth: 92 }}
                    >
                      <div className="flex items-start gap-1">
                        <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                        <span className="text-[8.5px] font-bold uppercase leading-tight tracking-[0.04em] text-navy-deep">{c.label}</span>
                      </div>
                      <span className="mt-1.5 font-display text-[18px] leading-none" style={{ color: c.color }}>₹{c.raw.toFixed(1)}</span>
                      {/* absorption meter — visual weight of this cost */}
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/70">
                        <div className="h-full rounded-full" style={{ width: `${(c.raw / maxRaw) * 100}%`, background: c.color }} />
                      </div>
                      <span className="mt-1 text-[8px] leading-tight text-ink-secondary">{c.sub}</span>
                    </div>
                  </Fragment>
                ))}
              </div>

              {/* Combined ratio — the central output card, against the break-even */}
              <span className="flex w-2.5 shrink-0 items-center justify-center text-[12px] font-bold" style={{ color: crColor }}>=</span>
              <div className="relative flex w-[100px] shrink-0 flex-col items-center justify-center rounded-xl border-2 bg-white px-2 py-2.5 text-center" style={{ borderColor: crColor, boxShadow: `0 10px 22px ${crColor}33` }}>
                <span className="text-[8px] font-bold uppercase leading-tight tracking-[0.06em] text-ink-secondary">Combined ratio</span>
                <span className="mt-1 font-display text-[24px] leading-none" style={{ color: crColor }}>{cr.toFixed(1)}%</span>
                <span className="mt-1 inline-flex items-center gap-0.5 text-[8px] font-semibold" style={{ color: PALETTE.amber }}>
                  <span className="inline-block h-0 w-3 border-t border-dashed" style={{ borderColor: PALETTE.amber }} /> vs 100%
                </span>
              </div>

              {/* Surplus — the positive outcome */}
              <span className="flex w-2.5 shrink-0 items-center justify-center text-[14px] font-bold" style={{ color: below ? PALETTE.emerald : PALETTE.coral }}>→</span>
              <div className="flex w-[96px] shrink-0 flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center" style={{ background: below ? `linear-gradient(160deg, #E3F3EA 0%, #F3FBF7 100%)` : '#FBEFEF', borderColor: below ? '#BFE0CE' : '#EFD4D3', boxShadow: below ? `0 12px 24px ${PALETTE.emerald}33` : undefined }}>
                <span className="text-[8px] font-bold uppercase leading-tight tracking-[0.06em]" style={{ color: below ? '#1C5C3F' : '#9A3B39' }}>{below ? 'Surplus' : 'Deficit'}</span>
                <span className="mt-1 font-display text-[22px] leading-none" style={{ color: below ? PALETTE.emerald : PALETTE.coral }}>{below ? '+' : ''}{(surplus as number).toFixed(1)}%</span>
                <span className="mt-1 text-[8px] leading-tight text-ink-secondary">below 100%</span>
              </div>
            </div>
          </div>

          {/* One-line read of the flow */}
          <p className="mt-3 flex items-center gap-1.5 text-[10.5px] leading-snug text-navy-deep/85">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" style={{ color: PALETTE.emerald }} />
            {below ? `Claims and costs take ₹${cr.toFixed(1)} of ₹100 — ₹${(surplus as number).toFixed(1)} is surplus.` : `Costs exceed ₹100 — underwriting is loss-making.`}
          </p>

          {stat && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[9.5px] leading-snug text-ink-secondary">
                <span className="font-semibold text-navy-deep">IRDAI statutory</span> basis: claims + commission + opex = {stat.statutory.toFixed(1)}% combined. Company-reported: {stat.reported.toFixed(1)}% ({stat.reportedFY}).
              </p>
              <PeerMedianTag value={company.combinedRatio} median={peerMedian(company, (i) => i.combinedRatio)} fmt={(v) => `${v.toFixed(1)}%`} higherIsBetter={false} label="Peer median (reported)" />
            </div>
          )}

          {hasCR && (
            <div className="mt-4 border-t border-[#DCEDE3] pt-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink-secondary">
                  {view === 'Yearly' ? 'Combined ratio trajectory · by year' : stat ? 'Combined ratio · by quarter · statutory' : 'Combined ratio trajectory · Q1–Q4 FY25'}
                </p>
                <TrendViewToggle value={view} onChange={setView} accent={PALETTE.emerald} />
              </div>
              {view === 'Yearly' && yearsWithCR < 2 ? (
                <PendingNote>Widen the year range to see the trend.</PendingNote>
              ) : (
                <CombinedRatioBandedTrend points={trajPoints} />
              )}
              {stat && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[9px] leading-snug text-ink-secondary">{view === 'Yearly' ? 'Full-year statutory combined ratio, per IRDAI.' : 'Standalone-quarter statutory combined ratio.'}</p>
                  <SourceTag source="IRDAI public disclosures" period={`${stat.statutoryFY}–FY26`} confidence="high" provenance={{ source_name: 'Niva Bupa quarterly public disclosures (IRDAI NL-form)', source_url: stat.sourceUrl }} />
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="mt-3">
          <PendingNote>{`${company.shortName} is a life carrier — needs a claims / commission / opex split. Pending.`}</PendingNote>
        </div>
      )}
    </div>
  )
}

// Underwriting proof rail — three compact proof blocks (claims ratio, expense
// ratio, combined-ratio trend) with a self-funding conclusion. Balanced height,
// no large empty gaps.
function DisciplineQuality({ company, ctx }: { company: Insurer; ctx: BasisCtx }) {
  const cost = COST_RATIOS[company.id]
  // On IGAAP/IFRS, claims & expense come straight from the basis dataset (single
  // period); on Reported they use the statutory cost split. The combined-ratio
  // trend block below stays on the statutory quarterly basis (labelled).
  const claimsVal = ctx.isIfrs ? ctx.claimsRatio : cost ? cost.loss : null
  const expenseVal = ctx.isIfrs ? ctx.expenseRatio : cost ? cost.commission + cost.expense : null
  // Real statutory standalone quarters for the focal company, else mock drift.
  const stat = STATUTORY_CR[company.id]
  const qvals = stat ? stat.quarters.map((q) => q.cr) : (COMBINED_RATIO_QUARTERS[company.id] ?? null)
  const q1 = qvals ? qvals[0] : null
  const q4 = qvals ? qvals[qvals.length - 1] : null
  const improving = q1 != null && q4 != null && q4 < q1
  const trendNote = stat ? `${stat.quarters[0].label} → ${stat.quarters[stat.quarters.length - 1].label} · statutory` : 'Q1 → Q4 FY25'
  const blocks: { label: string; value: string; note: string; chip: { label: string; tone: ChipTone }; spark?: number[] }[] = [
    {
      label: 'Claims ratio',
      value: claimsVal != null ? `${claimsVal.toFixed(1)}%` : ctx.isIfrs ? 'NA' : 'Data pending',
      note: ctx.isIfrs ? `${BASIS_LABEL[ctx.basis]} · ${ctx.pLabel}` : 'Largest cost absorber',
      chip: claimsVal != null ? (claimsVal > 70 ? { label: 'Above ~70%', tone: 'warning' } : { label: 'Below ~70%', tone: 'positive' }) : { label: ctx.isIfrs ? 'NA' : 'Pending', tone: 'navy' },
    },
    {
      label: 'Expense ratio',
      value: expenseVal != null ? `${expenseVal.toFixed(1)}%` : ctx.isIfrs ? 'NA' : 'Data pending',
      note: ctx.isIfrs ? `${BASIS_LABEL[ctx.basis]} · ${ctx.pLabel}` : 'Commission + opex',
      chip: { label: ctx.isIfrs ? BASIS_LABEL[ctx.basis] : 'Cost base', tone: 'navy' },
    },
    {
      label: 'Combined ratio trend',
      value: q1 != null && q4 != null ? `${q1.toFixed(1)}% → ${q4.toFixed(1)}%` : 'Data pending',
      note: trendNote,
      chip: q1 != null && q4 != null ? (improving ? { label: 'Improving', tone: 'teal' } : { label: 'Flat', tone: 'navy' }) : { label: 'Pending', tone: 'navy' },
      spark: qvals ?? undefined,
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
        <p className="text-[10.5px] font-medium leading-snug text-navy-deep/85">Costs inside ₹100 — the book self-funds.</p>
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
  const mm = getMarginMetrics(series)
  const ol = operatingLeverage(company, series)
  const patSeries = realPatValues(series)
  const hasPatTrend = patSeries.length >= 2
  const hasPat = patSeries.length >= 1
  const roe = company.roe
  const roeModerate = roe > 0 && roe < 10

  const boosters = [
    { key: 'patg', kicker: 'Booster', label: 'PAT growth', value: ol.patYoY == null ? 'n/a' : `${ol.patYoY >= 0 ? '+' : ''}${ol.patYoY.toFixed(0)}%`, sub: 'Profit pool expanding', color: PALETTE.emerald, bg: '#EAF5EE', border: '#CFE7DA' },
    { key: 'margin', kicker: 'Booster', label: 'Net margin', value: mm.netMargin != null ? `${mm.netMargin.toFixed(1)}%` : 'n/a', sub: 'Conversion improving', color: GOLD, bg: '#FBF1D8', border: '#E9D49A' },
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
      <p className="mt-1 text-[11px] leading-snug text-ink-secondary">Profit lifts ROE; the capital base drags it.</p>

      <div className="mt-4 flex items-stretch gap-2">
        {/* Rising PAT pool — the source */}
        <div className="flex w-[96px] shrink-0 flex-col justify-between rounded-xl px-3 py-3 text-white" style={{ background: `linear-gradient(160deg, ${PALETTE.emerald} 0%, #1F6B49 100%)` }}>
          <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/85">PAT pool</span>
          <div className="mt-2">
            {hasPatTrend ? <Sparkline values={patSeries} tone="positive" width={70} height={22} /> : null}
            <span className="mt-1 block font-display text-[15px] leading-none text-white">{hasPat ? `₹${patSeries[patSeries.length - 1]} Cr` : 'n/a'}</span>
            <span className="text-[8px] text-white/75">{mm.latestFy ? `${mm.latestFy} · reported` : 'pending'}</span>
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

      <p className="mt-3.5 text-[11px] leading-relaxed text-navy-deep/85">
        {roeModerate
          ? 'ROE improves when PAT margin rises without needing much extra capital. It stays moderate today because the post-IPO capital base is still large.'
          : roe > 0
            ? 'ROE improves when PAT margin rises without needing much extra capital — profit is now compounding against equity.'
            : 'ROE drivers are pending for this carrier.'}
        {company.solvency >= 2 ? ' Strong solvency supports growth without near-term capital pressure.' : ''}
      </p>
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
  const solvMedian = peerMedian(company, (i) => i.solvency)
  return (
    <div className="rounded-xl border p-4" style={{ background: '#EFF7F2', borderColor: '#CFE7DA' }}>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Cushion Bridge</p>
          <h3 className="mt-0 font-display text-[14.5px] leading-tight text-navy-deep">Solvency Cushion Bridge</h3>
        </div>
        <span className="shrink-0 text-[9.5px] text-ink-secondary">FY25</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-[11px] leading-snug text-ink-secondary">Capital above the 1.5x floor.</p>
        {s > 0 && <PeerMedianTag value={s} median={solvMedian} fmt={(v) => `${v.toFixed(2)}x`} higherIsBetter />}
      </div>

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
          <PendingNote>{`Solvency pending for ${company.shortName}.`}</PendingNote>
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
  const uw = latest ? underwritingFor(company.id, latest) : null
  const audited = latest != null && latest.fy in bridgeUwByFy(company.id)
  // Lead the combined ratio with the focal company's statutory figure (>100% when
  // underwriting loses money), so this card never shows a sub-100% ratio next to
  // an underwriting loss.
  const stat = STATUTORY_CR[company.id]
  const crVal = stat ? stat.statutory : company.combinedRatio > 0 ? company.combinedRatio : null
  return (
    <div className="flex h-full flex-col rounded-xl border p-4" style={{ background: '#F0F8F7', borderColor: '#D2E8E6' }}>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: PALETTE.teal }} />
        <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne">Core Result</p>
      </div>
      <div className="mt-3">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Underwriting {uw != null && uw < 0 ? 'loss' : 'result'} · FY</p>
        <p className="mt-0.5 font-display text-[24px] leading-none" style={{ color: uw == null ? '#94A3B8' : uw >= 0 ? PALETTE.teal : PALETTE.coral }}>{uw == null ? 'Data pending' : crc(uw)}</p>
        <p className="mt-1 text-[9.5px] text-ink-secondary">{audited ? 'Premium earned − claims − costs (audited)' : 'Premium earned − claims − costs'}</p>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[#D2E8E6] pt-2.5">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Combined ratio{stat ? ' · statutory' : ''}</span>
        <span className="font-display text-[15px] text-navy-deep">{crVal != null ? `${crVal.toFixed(1)}%` : 'n/a'}</span>
      </div>
      <p className="mt-auto pt-3 text-[10px] leading-snug text-ink-secondary">{uw != null && uw < 0 ? 'Insurance result before investment income — still negative.' : 'Insurance result, before investment income.'}</p>
    </div>
  )
}

// One-line proof takeaway per lens (real values; honest pending states).
function lensInsight(id: NodeId, company: Insurer, series: AnnualPoint[]): string {
  const hasCR = company.combinedRatio > 0
  const cost = COST_RATIOS[company.id]
  const latest = series[series.length - 1] as AnnualPoint | undefined
  const uw = latest ? underwritingFor(company.id, latest) : null
  const uwSpread = cost ? Math.round((100 - (cost.loss + cost.commission + cost.expense)) * 10) / 10 : null
  const ol = operatingLeverage(company, series)
  switch (id) {
    case 'underwriting': {
      const cr = STATUTORY_CR[company.id]?.statutory ?? (hasCR ? company.combinedRatio : null)
      return cr == null
        ? `${company.shortName} is a life carrier — read returns and capital.`
        : cr < 100
          ? 'Combined below 100% — underwriting earns a surplus before investments.'
          : 'Combined above 100% — underwriting still loss-making; PAT leans on investment income.'
    }
    case 'core':
      return uw == null
        ? 'Underwriting result pending NEP and combined ratio.'
        : uw > 0
          ? 'Insurance itself is now profitable — bars above zero.'
          : `Core underwriting is still a loss (${crc(Math.abs(uw))}); investment income is covering it.`
    case 'conversion':
      return uwSpread == null
        ? `${company.shortName} is a life carrier — ₹100 conversion read pending.`
        : uwSpread > 0
          ? ol.expDelta != null && ol.expDelta < 0
            ? 'Claims and costs absorb most of the ₹100, but the spread is positive — early operating leverage.'
            : 'Claims and costs absorb most of the ₹100, but the spread is positive.'
          : 'Claims and costs absorb the ₹100 — spread not yet positive.'
    case 'returns':
      return company.roe <= 0
        ? 'ROE pending.'
        : company.roe < 10
          ? 'ROE improving as PAT scales — still early, large capital base.'
          : 'Healthy ROE as PAT scales against equity.'
    case 'capital':
      return company.solvency > 0
        ? `${company.solvency.toFixed(2)}x solvency — strong cushion for growth and volatility.`
        : 'Solvency pending.'
  }
  return ''
}

// Returns proof — PAT trajectory with a Yearly (header-range-driven, real
// annual PAT) ⇄ Quarterly (FY25) toggle. Yearly follows the selected years.
function PatPoolCard({ company, series, cardStyle }: { company: Insurer; series: AnnualPoint[]; cardStyle: { background: string; borderColor: string } }) {
  // Real annual PAT only (audited filings). No standalone-quarter PAT is sourced
  // (earnings calls report it cumulatively / on a mixed IGAAP-IFRS basis), so we
  // show the honest annual trajectory rather than a fabricated quarterly series.
  const yearPoints = series.map((p) => ({ label: p.fy, pat: p.pat }))
  const yearsWithPat = yearPoints.filter((p) => p.pat != null).length
  const latestPatFy = series.find((p) => p.pat != null)?.fy ?? 'FY25'
  return (
    <div className="rounded-xl border p-4" style={cardStyle}>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Proof · PAT Pool</p>
          <h3 className="mt-0 font-display text-[14px] text-navy-deep">PAT trajectory · by year</h3>
        </div>
        <span className="text-[9.5px] text-ink-secondary">ROE · {company.roe.toFixed(1)}%</span>
      </div>
      {yearsWithPat >= 2 ? (
        <QuarterlyPatBars points={yearPoints} accent={ORANGE} />
      ) : yearsWithPat === 1 ? (
        <PendingNote>Widen the year range to see the PAT trend.</PendingNote>
      ) : (
        <div className="flex h-[160px] items-center justify-center rounded-md border border-dashed border-soft-border bg-white/60 text-[11.5px] text-ink-secondary">
          Data pending — PAT not reported for {company.shortName}
        </div>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-[10px] leading-snug text-ink-secondary">
        <Sparkles className="h-3 w-3 shrink-0" style={{ color: ORANGE }} />
        Real annual PAT; range follows the header.
      </p>
      <SourceTag source="Company filing" period={latestPatFy} confidence="high" provenance={undefined} />
    </div>
  )
}

// Resolve the real filing source for each lens's primary metric. Underwriting,
// core, conversion and returns rest on real annual figures (combined ratio /
// PAT); capital on solvency. If a real source can't be resolved we fall back to
// a quiet, link-free label rather than inventing one.
const LENS_METRIC: Record<NodeId, string> = {
  underwriting: 'combined_ratio',
  core: 'combined_ratio',
  conversion: 'pat',
  returns: 'pat',
  capital: 'solvency_ratio',
}

function lensSource(id: NodeId, companyId: string): ResolvedSource {
  // Real filing link where the lens rests on a real metric; otherwise a quiet,
  // link-free "illustrative" tag rather than implying a source we don't have.
  return realSource(LENS_METRIC[id], companyId) ?? ILLUSTRATIVE
}

function ProfitabilityDetail({ id, company, series, ctx, period, onOpenAcctDetail }: { id: NodeId; company: Insurer; series: AnnualPoint[]; ctx: BasisCtx; period: TimePeriod; onOpenAcctDetail: () => void }) {
  const reads = buildNodeReads(company, series)
  const meta = LENS[id]
  const status: { label: string; tone: ChipTone } = period === 'Annual' ? lensStatus(id, company, series, ctx) : { label: 'Pending', tone: 'navy' }
  const cardStyle = { background: meta.cardBg, borderColor: meta.cardBorder }

  // Quarterly / monthly: trends, the audited bridge and the investor read are
  // annual-only here. Show an honest Pending note rather than annual numbers under
  // a non-annual period; the Q4 snapshot (where it exists) is in the map above.
  if (period !== 'Annual') {
    return (
      <div key={id} className="animate-fade-in space-y-4">
        <LensHeader meta={meta} status={status} />
        <PendingNote>{`${period === 'Quarterly' ? 'Quarterly' : 'Monthly'} detail for ${meta.label} is pending — the Q4 snapshot above is shown where reported; full trends, the audited bridge and the investor read are on the annual basis. Switch Period to Annual for the complete view.`}</PendingNote>
      </div>
    )
  }

  let body: ReactNode = null

  switch (id) {
    case 'underwriting':
      body = (
        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <CombinedRatioWaterfall company={company} series={series} />
          <DisciplineQuality company={company} ctx={ctx} />
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
        <div className="space-y-4">
          {/* Compact basis chip — the full IGAAP vs IFRS comparison lives in the
              Accounting & Methodology drawer, not on the main page. */}
          <div className="flex">
            <button
              type="button"
              onClick={onOpenAcctDetail}
              className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-card px-3 py-1.5 text-[11px] font-medium text-ink-secondary transition-colors hover:border-muted-blue hover:text-navy-primary"
            >
              <Layers className="h-3.5 w-3.5" />
              Basis: {BASIS_LABEL[ctx.basis]} · Accounting bridge in Details
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
            <ConversionBridge company={company} series={series} ctx={ctx} />
            <ConversionQuality company={company} series={series} ctx={ctx} />
          </div>
        </div>
      )
      break
    case 'returns':
      body = (
        <div className="space-y-4">
          <ReturnBridge company={company} series={series} />
          <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
            <PatPoolCard company={company} series={series} cardStyle={cardStyle} />
            <RoeGaugeCard company={company} ctx={ctx} />
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
      <BasisBanner ctx={ctx} company={company} />
      {body}
      <InsightStrip line={lensInsight(id, company, series)} accent={meta.accent} />
      {/* Profit Quality bridge sits directly above the Investor Read, so the read
          closes the PAT-margin story. Only the conversion (PAT margin) stage shows it. */}
      {id === 'conversion' && <ProfitQualityCheck companyId={company.id} companyShort={company.shortName} />}
      <NodeInvestorRead read={reads[id]} accent={meta.accent} src={lensSource(id, company.id)} period={ctx.isIfrs ? ctx.pLabel : meta.period} ctx={ctx} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main section — Profitability Story Map (clickable engine drives the page)
// ---------------------------------------------------------------------------

const STORY_QUESTION = 'Is premium turning into profit and returns?'

export function ProfitabilityCapital() {
  const [selectedNode, setSelectedNode] = useState<NodeId>('underwriting')
  const [acctOpen, setAcctOpen] = useState(false)
  const [basis, setBasis] = useState<AccountingBasis>('igaap')
  const company = useActiveCompany()
  const { range, period } = useFilters()
  const copy = getCompanyProfitabilityCopy(company)
  // Clip the annual story to the dashboard-wide Data Range (fiscal-year axis).
  const series = getAnnualSeries(company.id).filter((p) => labelInRange(p.fy, range))

  // Period lens for the story map. Quarterly profitability exists only as standalone
  // Q4 cells (combined ratio + PAT margin); the latest in-range FY picks the quarter.
  // Monthly has no profitability data, so the quarterly snapshot reads "Pending".
  const latestFy = series[series.length - 1]?.fy ?? null
  const quarter: BasisPeriod | null =
    period === 'Quarterly' && latestFy && Q4_PERIODS.includes(`Q4${latestFy}` as BasisPeriod)
      ? (`Q4${latestFy}` as BasisPeriod)
      : null
  const periodTag = period === 'Quarterly' ? (quarter ? periodLabel(quarter) : 'Quarterly') : period === 'Monthly' ? 'Monthly' : 'FY25'

  const hasCR = company.combinedRatio > 0
  // Lead the focal company's statutory combined ratio (same as the headline KPI),
  // so the hero accent + the fallback verdict reflect the honest, cautious number
  // rather than the lower company-reported one.
  const headlineCR = STATUTORY_CR[company.id]?.statutory ?? (hasCR ? company.combinedRatio : null)
  const ct = headlineCR != null ? combinedTone(headlineCR) : { label: 'N/A', tone: 'neutral' as Tone }
  // Accounting-basis lens (IGAAP / Statutory · IFRS) — drives the headline scalars.
  const basisCtx = buildBasisCtx(company, basis)

  // Top verdict — for companies with an audited earnings bridge, lead with the
  // page's central question: is PAT underwriting-led or investment-income-led?
  // (The supporting numbers live in the Profit Quality Check card below.)
  const latestBridge = getEarningsBridge(company.id)[0] ?? null
  const investmentLed = latestBridge != null && latestBridge.igaap.underwritingResult < 0 && latestBridge.igaap.pat > 0
  const reportedVerdict = latestBridge != null
    ? investmentLed
      ? 'Profitable, but PAT is still investment-income-led — turning underwriting profitable is the next key trigger.'
      : 'Core underwriting is profitable — PAT is high-quality, not just investment income.'
    : !hasCR
      ? `Life carrier — ROE ${company.roe.toFixed(1)}%, ${company.solvency.toFixed(2)}x solvency.`
      : ct.tone === 'positive'
        ? `Combined ${company.combinedRatio.toFixed(1)}% · ROE ${company.roe.toFixed(1)}% · ${company.solvency.toFixed(2)}x solvency — discipline becoming returns.`
        : ct.tone === 'warning'
          ? `Combined ${company.combinedRatio.toFixed(1)}% in watch band · ROE ${company.roe.toFixed(1)}% · ${company.solvency.toFixed(2)}x solvency.`
          : `Combined ${company.combinedRatio.toFixed(1)}% loss-making · profit hinges on ${company.solvency.toFixed(2)}x cushion.`
  const basisVerdict = basisCtx.tracked
    ? `${BASIS_LABEL[basis]} (${basisCtx.pLabel}): PAT ${basisCtx.pat == null ? 'NA' : crc(basisCtx.pat)}${basisCtx.patGrowth == null ? '' : ` (${basisCtx.patGrowth >= 0 ? '+' : ''}${basisCtx.patGrowth.toFixed(0)}% YoY)`} · combined ${basisCtx.combinedRatio == null ? 'NA' : `${basisCtx.combinedRatio.toFixed(1)}%`} · PAT margin ${basisCtx.patMargin == null ? 'NA' : `${basisCtx.patMargin.toFixed(1)}%`}. Check basis before comparing.`
    : `${company.shortName}: no IFRS data. Tracked for ${BASIS_TRACKED_COMPANIES.join(', ')}.`
  const verdictSummary = basisCtx.isIfrs ? basisVerdict : reportedVerdict

  const basisHeroCR = basisCtx.isIfrs ? basisCtx.combinedRatio : hasCR ? company.combinedRatio : null
  const heroTone = basisCtx.isIfrs
    ? basisHeroCR == null
      ? PALETTE.navy
      : basisHeroCR < 100
        ? PALETTE.emerald
        : basisHeroCR <= 105
          ? PALETTE.amber
          : PALETTE.coral
    : ct.tone === 'positive'
      ? PALETTE.emerald
      : ct.tone === 'warning'
        ? PALETTE.amber
        : ct.tone === 'negative'
          ? PALETTE.coral
          : PALETTE.navy

  return (
    <div className="space-y-5">
      {/* ─── PAGE HEADER — title · question · verdict ─── */}
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
              <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-champagne">Profitability · {periodTag}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[20px] leading-tight text-navy-deep">{company.shortName} · Profitability Story</h2>
              <SignalBadge label={copy.badge} tone={copy.tone === 'positive' ? 'positive' : copy.tone === 'warning' ? 'warning' : copy.tone === 'negative' ? 'negative' : copy.tone === 'teal' ? 'teal' : 'navy'} size="sm" />
              <BasisPill basis={basis} />
            </div>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-ink-secondary">{STORY_QUESTION}</p>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-ink-secondary/85">{period === 'Annual' ? verdictSummary : `${periodTag} view — the story map below shows what is reported for this period; the full-year read is on the Annual toggle.`}</p>
            <BasisExplainer basis={basis} className="mt-1.5 max-w-2xl" />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <AccountingBasisToggle value={basis} onChange={setBasis} />
          </div>
        </div>
      </section>

      {/* ─── PROFITABILITY STORY MAP — clickable engine controls the page ─── */}
      <ProfitabilityEngine company={company} series={series} selectedId={selectedNode} onSelect={setSelectedNode} ctx={basisCtx} period={period} quarter={quarter} />

      {/* ─── ACTIVE DETAIL — one node's charts + status + investor read ─── */}
      <ProfitabilityDetail id={selectedNode} company={company} series={series} ctx={basisCtx} period={period} onOpenAcctDetail={() => setAcctOpen(true)} />

      <AccountingDetailDrawer open={acctOpen} onClose={() => setAcctOpen(false)} companyId={company.id} companyShort={company.shortName} />
    </div>
  )
}
