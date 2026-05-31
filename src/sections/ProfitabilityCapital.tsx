import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Bar, CartesianGrid, Cell, ComposedChart, LineChart, Line, Pie, PieChart,
  ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  ShieldCheck, Shield, Gauge, IndianRupee, BarChart3, Cog, Database, Info,
  type LucideIcon,
} from 'lucide-react'
import { SignalBadge } from '@/components/SignalBadge'
import { SourceTag } from '@/components/SourceTag'
import { DataStatusDrawer } from '@/components/DataStatusDrawer'
import { AccountingBasisToggle, BasisPill } from '@/components/AccountingBasisControls'
import { PatBasisCompareCard } from '@/components/PatBasisCompareCard'
import { AccountingDetailDrawer } from '@/components/AccountingDetailDrawer'
import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'
import { useActiveCompany, useFilters } from '@/state/filters'
import { labelInRange } from '@/lib/dateRange'
import { getCompanyProfitabilityCopy } from '@/lib/companyCopy'
import {
  resolveProfitView, hasBasisData, BASIS_LABEL,
  type AccountingBasis, type ProfitView, type FallbackInput,
} from '@/data/accountingBasis'
import type { Metric } from '@/data/types'
import type { BasisInfo } from '@/data/mockData'

// ---------------------------------------------------------------------------
// Profitability page — driven by ONE resolved state (company · basis · period ·
// FY range) via `resolveProfitView`. Every section reads the same `view`, so
// numbers can never diverge. Where a metric is not available for the selected
// basis/period, the component is OMITTED entirely (no "NA" placeholders) — the
// page shows only real, filing-sourced components and stays clutter-free.
// ---------------------------------------------------------------------------

const PALETTE = {
  navy: '#27457E', navyDeep: '#172B4D', teal: '#168E8E', emerald: '#2F855A',
  amber: '#B7791F', coral: '#B94A48', champagne: '#B68B3A', champagneSoft: '#F4ECDB',
  softBlue: '#EEF4FF', border: '#E8EBF1',
} as const
const ORANGE = '#C2691C'
const GOLD = '#C99A2E'
const DEEP_GREEN = '#1E6B4A'

const crc = (v: number) => `${v < 0 ? '−' : ''}₹${Math.abs(Math.round(v)).toLocaleString('en-IN')} Cr`
const pct = (v: number) => `${v.toFixed(1)}%`

// ── Statutory annual snapshot — fallback for non-SAHI insurers ───────────────
interface AnnualPoint { fy: string; gwp: number | null; nep: number | null; pat: number | null; combinedRatio: number | null; expenseRatio: number | null }
function inB(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null
}
function getAnnualSeries(companyId: string): AnnualPoint[] {
  return (annualSnapshot.data as Array<Record<string, unknown>>)
    .filter((r) => r.company_id === companyId)
    .map((r) => ({
      fy: String(r.fiscal_year),
      gwp: inB(r.gwp, 100, 100000),
      nep: inB(r.nep, 100, 100000),
      pat: typeof r.pat === 'number' && Number.isFinite(r.pat) && Math.abs(r.pat) <= 20000 ? r.pat : null,
      combinedRatio: inB(r.combined_ratio, 40, 250),
      expenseRatio: inB(r.expense_ratio, 2, 90),
    }))
    .sort((a, b) => a.fy.localeCompare(b.fy))
}

// ── Tiny shared UI ───────────────────────────────────────────────────────────
function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <Info className="h-3 w-3 cursor-help text-champagne" />
      <span className="pointer-events-none invisible absolute left-1/2 top-full z-30 mt-1.5 w-56 -translate-x-1/2 rounded-lg border border-soft-border bg-card px-3 py-2 text-[10.5px] leading-snug text-ink-secondary opacity-0 shadow-card transition-opacity group-hover:visible group-hover:opacity-100">
        {text}
      </span>
    </span>
  )
}
const BASIS_TIP = 'IGAAP and IFRS are separate accounting bases. Do not compare profitability without checking basis.'

function ShortSource({ view }: { view: ProfitView }) {
  return <SourceTag source={view.sourceLabel} period={view.pointLabel ?? undefined} confidence="high" />
}

type ChipTone = 'navy' | 'positive' | 'warning' | 'negative' | 'teal'
const toneColor: Record<ChipTone, string> = { navy: PALETTE.navyDeep, positive: PALETTE.emerald, warning: PALETTE.amber, negative: PALETTE.coral, teal: PALETTE.teal }
function Chip({ label, value, tone = 'navy' }: { label: string; value: string; tone?: ChipTone }) {
  return (
    <div className="rounded-lg border border-soft-border bg-white/70 px-3 py-2">
      <span className="block text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</span>
      <span className="mt-0.5 block font-display text-[17px] leading-none" style={{ color: toneColor[tone] }}>{value}</span>
    </div>
  )
}

// ── Charts (period-generic; nulls are skipped, never zeroed) ──────────────────
interface TrendFit { fitted: number[]; slope: number }
function fitTrend(values: (number | null)[]): TrendFit | null {
  const pts = values.map((v, i) => [i, v] as const).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)) as [number, number][]
  if (pts.length < 2) return null
  const n = pts.length
  let sx = 0, sy = 0, sxy = 0, sxx = 0
  for (const [x, y] of pts) { sx += x; sy += y; sxy += x * y; sxx += x * x }
  const denom = n * sxx - sx * sx
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n
  return { fitted: values.map((_, i) => intercept + slope * i), slope }
}

function CombinedTrend({ points }: { points: { label: string; cr: number | null }[] }) {
  const real = points.map((p) => p.cr).filter((v): v is number => v != null)
  if (real.length < 2) return null
  const fit = fitTrend(points.map((p) => p.cr))
  const data = points.map((p, i) => ({ label: p.label, cr: p.cr, trend: fit ? fit.fitted[i] : null }))
  const yMin = Math.min(94, ...real) - 2
  const yMax = Math.max(108, ...real) + 2
  return (
    <ResponsiveContainer width="100%" height={170}>
      <LineChart data={data} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: PALETTE.border }} />
        <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: PALETTE.border }} domain={[yMin, yMax]} width={34} unit="%" />
        <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number, n) => [`${v.toFixed(1)}%`, n === 'trend' ? 'Trend' : 'Combined']} />
        <ReferenceArea y1={yMin} y2={100} fill={PALETTE.emerald} fillOpacity={0.07} />
        <ReferenceArea y1={100} y2={yMax} fill={PALETTE.coral} fillOpacity={0.06} />
        <ReferenceLine y={100} stroke={PALETTE.amber} strokeDasharray="4 4" strokeWidth={0.8} />
        {fit && <Line type="linear" dataKey="trend" stroke={PALETTE.champagne} strokeWidth={1.3} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
        <Line type="monotone" dataKey="cr" stroke={PALETTE.navyDeep} strokeWidth={1.8} dot={{ r: 3, fill: PALETTE.navyDeep }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  )
}

// Render-helper (not a component) so it composes with `?? null` cleanly.
function bars({ points, accent, unit }: { points: { label: string; v: number | null }[]; accent: string; unit: 'cr' | 'pct' }): ReactNode | null {
  const real = points.map((p) => p.v).filter((v): v is number => v != null)
  if (real.length < 2) return null
  const lastIdx = points.map((d) => d.v != null).lastIndexOf(true)
  return (
    <ResponsiveContainer width="100%" height={170}>
      <ComposedChart data={points} margin={{ top: 6, right: 10, left: -8, bottom: 0 }} barCategoryGap="34%">
        <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: PALETTE.border }} />
        <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={{ fontSize: 11 }} cursor={{ fill: 'rgba(39,69,126,0.03)' }} formatter={(v: number) => [unit === 'cr' ? crc(v) : pct(v), unit === 'cr' ? 'Value' : 'Margin']} />
        <ReferenceLine y={0} stroke={PALETTE.border} />
        <Bar dataKey="v" radius={[4, 4, 0, 0]} maxBarSize={points.length <= 4 ? 42 : 30}>
          {points.map((d, i) => {
            const val = d.v ?? 0
            const fill = val < 0 ? PALETTE.coral : i === lastIdx ? accent : PALETTE.softBlue
            return <Cell key={d.label} fill={fill} stroke={val < 0 ? PALETTE.coral : i === lastIdx ? accent : PALETTE.navy} strokeWidth={i === lastIdx ? 1 : 0.4} />
          })}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function SemiGauge({ value, max, unit, zones }: { value: number; max: number; unit: string; zones: { from: number; to: number; color: string }[] }) {
  const clamped = Math.max(0, Math.min(max, value))
  const angle = 180 * (clamped / max)
  const color = zones.find((z) => clamped >= z.from && clamped <= z.to)?.color ?? PALETTE.navy
  return (
    <div className="relative w-full" style={{ height: 96 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={zones.map((z) => ({ v: ((z.to - z.from) / max) * 180 }))} dataKey="v" cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius="84%" outerRadius="93%" stroke="#fff" strokeWidth={0.5} isAnimationActive={false}>
            {zones.map((z, i) => <Cell key={i} fill={z.color} fillOpacity={0.18} />)}
          </Pie>
          <Pie data={[{ v: angle }, { v: 180 - angle }]} dataKey="v" cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius="94%" outerRadius="100%" stroke="none" isAnimationActive={false}>
            <Cell fill={color} /><Cell fill="transparent" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
        <span className="font-display text-[22px] leading-none text-navy-deep">{value.toFixed(unit === 'x' ? 2 : 1)}{unit}</span>
      </div>
    </div>
  )
}

// ── ₹100 cost engine: claims + expense → combined → surplus (or a PAT output) ──
// Both bands come from `view`, so the engine always reconciles with the headline
// combined ratio. A band is omitted when its ratio isn't available.
function RupeeEngine({ claims, expense, combined, output }: { claims: number | null; expense: number | null; combined: number; output?: { label: string; value: string } }) {
  const surplus = Math.round((100 - combined) * 10) / 10
  const below = surplus >= 0
  const crColor = combined < 100 ? PALETTE.emerald : combined <= 105 ? PALETTE.amber : PALETTE.coral
  const blocks = [
    claims != null ? { key: 'c', label: 'Claims', v: claims, color: PALETTE.coral, bg: '#FBEFEF', border: '#EFD4D3' } : null,
    expense != null ? { key: 'e', label: 'Expense', v: expense, color: PALETTE.navy, bg: '#EEF3FB', border: '#D6E2FA' } : null,
  ].filter(Boolean) as { key: string; label: string; v: number; color: string; bg: string; border: string }[]
  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
      <div className="flex w-[78px] shrink-0 flex-col items-center justify-center rounded-xl px-2 py-3 text-center text-white" style={{ background: `linear-gradient(160deg, ${PALETTE.navyDeep}, ${PALETTE.navy})` }}>
        <span className="text-[8px] font-bold uppercase tracking-[0.08em]" style={{ color: '#E9D49A' }}>Premium</span>
        <span className="mt-1 font-display text-[22px] leading-none">₹100</span>
      </div>
      {blocks.map((b, i) => (
        <div key={b.key} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-[12px] font-bold text-ink-secondary/40">+</span>}
          <div className="flex min-w-[88px] flex-1 flex-col justify-between rounded-xl border px-2.5 py-2" style={{ background: b.bg, borderColor: b.border }}>
            <span className="text-[8.5px] font-bold uppercase tracking-[0.04em] text-navy-deep">{b.label}</span>
            <span className="mt-1.5 font-display text-[18px] leading-none" style={{ color: b.color }}>₹{b.v.toFixed(1)}</span>
          </div>
        </div>
      ))}
      <span className="flex items-center px-0.5 text-[12px] font-bold" style={{ color: crColor }}>=</span>
      <div className="flex w-[92px] shrink-0 flex-col items-center justify-center rounded-xl border-2 bg-white px-2 py-2 text-center" style={{ borderColor: crColor }}>
        <span className="text-[8px] font-bold uppercase text-ink-secondary">Combined</span>
        <span className="mt-1 font-display text-[22px] leading-none" style={{ color: crColor }}>{combined.toFixed(1)}%</span>
      </div>
      <span className="flex items-center px-0.5 text-[14px] font-bold" style={{ color: output ? GOLD : below ? PALETTE.emerald : PALETTE.coral }}>→</span>
      {output ? (
        <div className="flex w-[96px] shrink-0 flex-col items-center justify-center rounded-xl border px-2 py-2 text-center" style={{ background: 'linear-gradient(160deg, #FBF1D8, #FFFAEC)', borderColor: '#E9D49A' }}>
          <span className="text-[8px] font-bold uppercase" style={{ color: '#9A7B1E' }}>{output.label}</span>
          <span className="mt-1 font-display text-[22px] leading-none" style={{ color: GOLD }}>{output.value}</span>
        </div>
      ) : (
        <div className="flex w-[92px] shrink-0 flex-col items-center justify-center rounded-xl border px-2 py-2 text-center" style={{ background: below ? 'linear-gradient(160deg,#E3F3EA,#F3FBF7)' : '#FBEFEF', borderColor: below ? '#BFE0CE' : '#EFD4D3' }}>
          <span className="text-[8px] font-bold uppercase" style={{ color: below ? '#1C5C3F' : '#9A3B39' }}>{below ? 'Surplus' : 'Deficit'}</span>
          <span className="mt-1 font-display text-[20px] leading-none" style={{ color: below ? PALETTE.emerald : PALETTE.coral }}>{below ? '+' : ''}{surplus.toFixed(1)}%</span>
        </div>
      )}
    </div>
  )
}

// ── Story map — only available stages render (omit, don't NA) ─────────────────
type NodeId = 'underwriting' | 'core' | 'conversion' | 'returns' | 'capital'
interface Stage { id: NodeId; label: string; metricLabel: string; value: string; color: string; Icon: LucideIcon }

function buildStages(view: ProfitView): Stage[] {
  const s: Stage[] = []
  if (view.combinedRatio != null) s.push({ id: 'underwriting', label: 'Underwriting Discipline', metricLabel: 'Combined Ratio', value: pct(view.combinedRatio), color: PALETTE.emerald, Icon: ShieldCheck })
  if (view.underwritingProfit != null) s.push({ id: 'core', label: 'Core Profitability', metricLabel: 'Underwriting Profit', value: crc(view.underwritingProfit), color: PALETTE.teal, Icon: Gauge })
  if (view.patMargin != null) s.push({ id: 'conversion', label: 'Profit Conversion', metricLabel: 'PAT Margin', value: pct(view.patMargin), color: GOLD, Icon: IndianRupee })
  if (view.roe != null) s.push({ id: 'returns', label: 'Shareholder Return', metricLabel: 'ROE', value: pct(view.roe), color: ORANGE, Icon: BarChart3 })
  if (view.solvency != null) s.push({ id: 'capital', label: 'Capital Support', metricLabel: 'Solvency', value: `${view.solvency.toFixed(2)}x`, color: DEEP_GREEN, Icon: Shield })
  return s
}

function StoryMap({ stages, selected, onSelect, basis }: { stages: Stage[]; selected: NodeId; onSelect: (id: NodeId) => void; basis: AccountingBasis }) {
  return (
    <section className="card-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: PALETTE.champagneSoft }}><Cog className="h-3.5 w-3.5" style={{ color: PALETTE.champagne }} /></span>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-champagne">Profitability Story Map</p>
        </div>
        <BasisPill basis={basis} />
      </div>
      <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-start md:gap-2">
        {stages.map((st) => {
          const on = st.id === selected
          return (
            <button key={st.id} type="button" onClick={() => onSelect(st.id)} aria-pressed={on} className="group flex min-w-0 flex-1 cursor-pointer flex-col items-center rounded-2xl px-1 py-1 text-center outline-none transition-transform focus-visible:ring-2 focus-visible:ring-navy-primary/35">
              <div className="relative">
                <span aria-hidden className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl transition-opacity ${on ? 'h-[110px] w-[110px] opacity-100' : 'h-[88px] w-[88px] opacity-0 group-hover:opacity-90'}`} style={{ background: on ? `${st.color}4d` : `${st.color}2b` }} />
                <div className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 bg-white transition-all group-hover:-translate-y-[3px]" style={{ borderColor: st.color, transform: on ? 'translateY(-3px) scale(1.05)' : 'none', boxShadow: on ? `0 16px 30px ${st.color}66` : `0 6px 16px ${st.color}1f` }}>
                  <st.Icon className="h-7 w-7" style={{ color: st.color }} strokeWidth={on ? 2 : 1.6} />
                </div>
              </div>
              <p className="mt-3 font-display text-[12.5px] leading-tight" style={{ color: on ? PALETTE.navyDeep : '#41506B', fontWeight: on ? 700 : 600 }}>{st.label}</p>
              <span aria-hidden className="my-1 h-px w-6" style={{ background: on ? st.color : PALETTE.border }} />
              <p className="text-[9px] uppercase tracking-wide text-ink-secondary">{st.metricLabel}</p>
              <p className="font-display text-[19px] leading-none" style={{ color: st.color }}>{st.value}</p>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ── One-line investor read per stage ──────────────────────────────────────────
function lensLine(id: NodeId, view: ProfitView): string {
  switch (id) {
    case 'underwriting':
      return view.combinedRatio! < 100 ? 'Costs stay inside ₹100 of premium — underwriting surplus before investment income.' : 'Costs exceed ₹100 of premium — reported profit leans on investment income.'
    case 'core':
      return view.underwritingProfit! >= 0 ? 'Core insurance book is profitable before any investment income.' : 'Core underwriting still runs a deficit; profit leans on investment income.'
    case 'conversion':
      return view.patMargin! > 0 ? 'Premium is converting into profit, though the margin is still thin.' : 'Premium is not yet converting into reported profit.'
    case 'returns':
      return view.roe! >= 12 ? 'Returns are healthy versus the cost of capital.' : 'Returns are still early as profit builds against the capital base.'
    case 'capital':
      return `Capital cushion sits above the 1.5x regulatory floor${view.solvencyIsStatutory ? ' (statutory)' : ''}.`
  }
}

function InvestorRead({ id, view }: { id: NodeId; view: ProfitView }) {
  return (
    <section className="card-surface relative overflow-hidden p-3.5" style={{ background: `linear-gradient(135deg,#fff 0%, ${PALETTE.champagneSoft} 130%)` }}>
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: PALETTE.champagne }} />
      <div className="flex flex-wrap items-center justify-between gap-2 pl-2.5">
        <p className="max-w-2xl text-[12px] font-medium leading-relaxed text-navy-deep">{lensLine(id, view)}</p>
        <ShortSource view={view} />
      </div>
    </section>
  )
}

// ── Per-stage detail (compact, all view-driven) ────────────────────────────────
function StageDetail({ id, view, company, onOpenDetail }: { id: NodeId; view: ProfitView; company: { id: string; shortName: string }; onOpenDetail: () => void }) {
  let body: ReactNode = null
  if (id === 'underwriting' && view.combinedRatio != null) {
    body = (
      <div className="space-y-3">
        <RupeeEngine claims={view.claimsRatio} expense={view.expenseRatio} combined={view.combinedRatio} />
        <CombinedTrend points={view.combinedSeries} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {view.claimsRatio != null && <Chip label="Claims ratio" value={pct(view.claimsRatio)} tone={view.claimsRatio > 70 ? 'warning' : 'positive'} />}
          {view.expenseRatio != null && <Chip label="Expense ratio" value={pct(view.expenseRatio)} />}
          <Chip label="Combined ratio" value={pct(view.combinedRatio)} tone={view.combinedRatio < 100 ? 'positive' : view.combinedRatio <= 105 ? 'warning' : 'negative'} />
        </div>
      </div>
    )
  } else if (id === 'core' && view.underwritingProfit != null) {
    body = (
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div>{bars({ points: view.uwSeries.map((p) => ({ label: p.label, v: p.uw })), accent: PALETTE.teal, unit: 'cr' })}</div>
        <div className="grid grid-cols-1 gap-2 content-start">
          <Chip label="Underwriting profit" value={crc(view.underwritingProfit)} tone={view.underwritingProfit >= 0 ? 'teal' : 'negative'} />
          {view.combinedRatio != null && <Chip label="Combined ratio" value={pct(view.combinedRatio)} tone={view.combinedRatio < 100 ? 'positive' : 'warning'} />}
        </div>
      </div>
    )
  } else if (id === 'conversion' && view.patMargin != null) {
    body = (
      <div className="space-y-4">
        {view.combinedRatio != null && (
          <RupeeEngine claims={view.claimsRatio} expense={view.expenseRatio} combined={view.combinedRatio} output={{ label: 'PAT margin', value: pct(view.patMargin) }} />
        )}
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div>{bars({ points: view.patSeries.map((p) => ({ label: p.label, v: p.pat })), accent: GOLD, unit: 'cr' })}</div>
          <div className="grid grid-cols-1 gap-2 content-start">
            <Chip label="PAT margin" value={pct(view.patMargin)} tone={view.patMargin > 5 ? 'teal' : view.patMargin > 0 ? 'warning' : 'negative'} />
            {view.patGrowth != null && <Chip label="PAT growth · YoY" value={`${view.patGrowth >= 0 ? '+' : ''}${view.patGrowth.toFixed(0)}%`} tone={view.patGrowth >= 0 ? 'positive' : 'negative'} />}
            {view.pat != null && <Chip label="PAT" value={crc(view.pat)} />}
          </div>
        </div>
        {hasBasisData(company.id) && <PatBasisCompareCard companyId={company.id} companyShort={company.shortName} pageBasis={view.basis} onOpenDetail={onOpenDetail} />}
      </div>
    )
  } else if (id === 'returns' && view.roe != null) {
    body = (
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border p-4" style={{ background: '#FBF1E5', borderColor: '#EFD9C4' }}>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-navy-primary">ROE · {view.pointLabel}</p>
          <p className="mt-0.5 font-display text-[24px] leading-none text-navy-deep">{pct(view.roe)}</p>
          <SemiGauge value={view.roe} max={22} unit="%" zones={[{ from: 0, to: 5, color: PALETTE.coral }, { from: 5, to: 12, color: PALETTE.amber }, { from: 12, to: 22, color: PALETTE.emerald }]} />
        </div>
        <div className="content-center">{bars({ points: view.patSeries.map((p) => ({ label: p.label, v: p.pat })), accent: ORANGE, unit: 'cr' })}</div>
      </div>
    )
  } else if (id === 'capital' && view.solvency != null) {
    const cushion = Math.round((view.solvency - 1.5) * 100) / 100
    body = (
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border p-4" style={{ background: '#EFF7F2', borderColor: '#CFE7DA' }}>
          <div className="flex items-center justify-between">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-emerald-700/90">Solvency</p>
            {view.solvencyIsStatutory && <span className="rounded-md border border-soft-border bg-ice/70 px-1.5 py-0.5 text-[9px] font-medium text-ink-secondary">statutory</span>}
          </div>
          <p className="mt-1 font-display text-[26px] leading-none text-navy-deep">{view.solvency.toFixed(2)}x</p>
          <p className="mt-0.5 text-[10px] text-ink-secondary">+{cushion.toFixed(2)}x above the 1.5x floor</p>
        </div>
        <SemiGauge value={view.solvency} max={3.5} unit="x" zones={[{ from: 0, to: 1.5, color: PALETTE.coral }, { from: 1.5, to: 2, color: PALETTE.amber }, { from: 2, to: 3.5, color: PALETTE.emerald }]} />
      </div>
    )
  }
  if (!body) return null
  return <div className="card-surface animate-fade-in space-y-4 p-4">{body}</div>
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------
export function ProfitabilityCapital() {
  const company = useActiveCompany()
  const { range, period } = useFilters()
  const [basis, setBasis] = useState<AccountingBasis>('igaap')
  const [statusOpen, setStatusOpen] = useState(false)
  const [acctOpen, setAcctOpen] = useState(false)
  const [selected, setSelected] = useState<NodeId>('underwriting')
  const copy = getCompanyProfitabilityCopy(company)

  const view = useMemo<ProfitView>(() => {
    const annual = getAnnualSeries(company.id)
    const fallback: FallbackInput = {
      roe: company.roe > 0 ? company.roe : null,
      solvency: company.solvency > 0 ? company.solvency : null,
      annual: annual.map((p) => ({ fy: p.fy, pat: p.pat, nep: p.nep, gwp: p.gwp, combinedRatio: p.combinedRatio, expenseRatio: p.expenseRatio })),
    }
    return resolveProfitView(company.id, basis, period, (fy) => labelInRange(fy, range), fallback)
  }, [company.id, basis, period, range, company.roe, company.solvency])

  const stages = buildStages(view)
  useEffect(() => {
    if (stages.length && !stages.some((s) => s.id === selected)) setSelected(stages[0].id)
  }, [stages, selected])
  const activeId = stages.some((s) => s.id === selected) ? selected : stages[0]?.id

  const heroTone = view.combinedRatio == null ? PALETTE.navy : view.combinedRatio < 100 ? PALETTE.emerald : view.combinedRatio <= 105 ? PALETTE.amber : PALETTE.coral

  const mkMetric = (value: number | null, unit: string): Metric => ({ value, unit, period: view.pointLabel ?? '—', source: view.sourceLabel, status: value == null ? 'Pending' : 'Reported', lastUpdated: '2026-05-31' })
  const statusEntries = [
    view.combinedRatio != null && { label: 'Combined ratio', metric: mkMetric(view.combinedRatio, '%') },
    view.claimsRatio != null && { label: 'Claims ratio', metric: mkMetric(view.claimsRatio, '%') },
    view.patMargin != null && { label: 'PAT margin', metric: mkMetric(view.patMargin, '%') },
    view.roe != null && { label: 'ROE', metric: mkMetric(view.roe, '%') },
    view.solvency != null && { label: 'Solvency', metric: mkMetric(view.solvency, 'x') },
  ].filter(Boolean) as { label: string; metric: Metric }[]
  const drawerBasis: BasisInfo = { basis: 'PAT / ratios', method: 'As reported', accounting: BASIS_LABEL[basis], source: view.sourceLabel, status: 'Reported' }

  return (
    <div className="space-y-5">
      {/* HERO — title · basis/period line · controls */}
      <section className="card-surface relative overflow-hidden p-4">
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: `linear-gradient(180deg, ${heroTone} 0%, ${PALETTE.champagne} 100%)` }} />
        <div className="relative flex flex-wrap items-start justify-between gap-x-5 gap-y-3 pl-2">
          <div className="min-w-[240px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[20px] leading-tight text-navy-deep">{company.shortName} · Profitability Story</h2>
              <SignalBadge label={copy.badge} tone={copy.tone === 'positive' ? 'positive' : copy.tone === 'warning' ? 'warning' : copy.tone === 'negative' ? 'negative' : copy.tone === 'teal' ? 'teal' : 'navy'} size="sm" />
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-secondary">
              Basis: {BASIS_LABEL[basis]} · {view.pointLabel ?? period} · {period}
              <InfoTip text={BASIS_TIP} />
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <AccountingBasisToggle value={basis} onChange={setBasis} />
            <button type="button" onClick={() => setStatusOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-card px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:border-muted-blue hover:text-navy-primary">
              <Database className="h-3.5 w-3.5" /> Data status
            </button>
          </div>
        </div>
      </section>

      {stages.length === 0 || !activeId ? (
        <section className="card-surface flex items-center gap-2.5 p-6 text-[12px] text-ink-secondary">
          <Info className="h-4 w-4 shrink-0 text-champagne" />
          No {BASIS_LABEL[basis]} figures available for {company.shortName} in the selected period — switch basis or period.
        </section>
      ) : (
        <>
          <StoryMap stages={stages} selected={activeId} onSelect={setSelected} basis={basis} />
          <StageDetail id={activeId} view={view} company={company} onOpenDetail={() => setAcctOpen(true)} />
          <InvestorRead id={activeId} view={view} />
        </>
      )}

      <DataStatusDrawer open={statusOpen} onClose={() => setStatusOpen(false)} moduleName={`${company.shortName} · Profitability`} entries={statusEntries} basis={drawerBasis} />
      <AccountingDetailDrawer open={acctOpen} onClose={() => setAcctOpen(false)} companyId={company.id} companyShort={company.shortName} />
    </div>
  )
}
