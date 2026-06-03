import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Landmark, ShieldCheck } from 'lucide-react'
import { useActiveCompany } from '@/state/filters'
import { SourceTag } from '@/components/SourceTag'
import { DataEmptyState } from '@/components/DataEmptyState'
import {
  ANNUAL_PERIODS,
  BASIS_TRACKED_COMPANIES,
  getBasisNep,
  getBasisProfit,
  getBasisSolvency,
  getStatutoryRoe,
  hasBasisData,
  type AccountingBasis,
  type BasisPeriod,
} from '@/data/accountingBasis'
import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'

// ---------------------------------------------------------------------------
//  Profitability Review — one clean dual-framework comparison. Two side-by-side
//  review tables (IND AS / IFRS-style · navy, IGAAP / Statutory · gold) with a
//  4-year (FY23→FY26) matrix per metric and a colour-coded trend sparkline.
//  Every value is read from the real dual-basis filing model; missing cells
//  render as a quiet "—" (never fabricated).
// ---------------------------------------------------------------------------

const YEARS = ANNUAL_PERIODS // ['FY23','FY24','FY25','FY26']

type MetricKind = 'cr' | 'pct' | 'x'

interface MetricDef {
  label: string
  kind: MetricKind
  /** Trend is "good" when the value rises (premium, profit, solvency) vs falls
   *  (cost / combined ratios). Drives the sparkline colour. */
  goodWhenUp: boolean
  get: (period: BasisPeriod) => number | null
}

// GWP per FY from the annual snapshot (basis-neutral premium).
function useGwpByFy(companyId: string): Record<string, number> {
  return useMemo(() => {
    const m: Record<string, number> = {}
    ;(annualSnapshot.data as Array<Record<string, unknown>>)
      .filter((r) => r.company_id === companyId)
      .forEach((r) => {
        if (typeof r.gwp === 'number') m[String(r.fiscal_year)] = r.gwp
      })
    return m
  }, [companyId])
}

const round = (v: number) => Math.round(v)
// Underwriting result derived from real inputs: NEP × (1 − combined ratio).
const uw = (nep: number | null, cr: number | null): number | null =>
  nep != null && cr != null ? round(nep * (1 - cr / 100)) : null

function fmt(value: number | null, kind: MetricKind): string {
  if (value == null) return '—'
  if (kind === 'pct') return `${value.toFixed(1)}%`
  if (kind === 'x') return `${value.toFixed(2)}x`
  return value.toLocaleString('en-IN')
}

// ── Trend sparkline — colour-coded by direction & whether that's good ─────────
function Trend({ values, goodWhenUp }: { values: (number | null)[]; goodWhenUp: boolean }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null)
  if (pts.length < 2) return <span className="text-[11px] text-ink-secondary/40">—</span>

  const W = 58
  const H = 22
  const pad = 3
  const xs = pts.map((p) => p.i)
  const ys = pts.map((p) => p.v)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const sx = (i: number) => (maxX === minX ? W / 2 : pad + ((W - 2 * pad) * (i - minX)) / (maxX - minX))
  const sy = (v: number) => (maxY === minY ? H / 2 : H - pad - ((H - 2 * pad) * (v - minY)) / (maxY - minY))

  const delta = ys[ys.length - 1] - ys[0]
  const dir = Math.abs(delta) < 1e-9 ? 0 : goodWhenUp ? (delta > 0 ? 1 : -1) : delta < 0 ? 1 : -1
  const color = dir > 0 ? '#168E8E' : dir < 0 ? '#C0584F' : '#8C97A8'
  const d = pts.map((p, k) => `${k === 0 ? 'M' : 'L'} ${sx(p.i).toFixed(1)} ${sy(p.v).toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]

  return (
    <svg width={W} height={H} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(last.i)} cy={sy(last.v)} r={2.2} fill={color} />
    </svg>
  )
}

interface FrameworkTheme {
  label: string
  Icon: typeof Landmark
  headerClass: string
  theadClass: string
  fyClass: string
}

const IFRS_THEME: FrameworkTheme = {
  label: 'IND AS / IFRS-style',
  Icon: Landmark,
  headerClass: 'bg-gradient-to-r from-navy-primary to-navy-deep',
  theadClass: 'bg-soft-blue/60',
  fyClass: 'text-navy-primary',
}
const IGAAP_THEME: FrameworkTheme = {
  label: 'IGAAP / Statutory',
  Icon: ShieldCheck,
  headerClass: 'bg-gradient-to-r from-[#C29A45] to-[#9C7430]',
  theadClass: 'bg-champagne-soft/70',
  fyClass: 'text-champagne-deep',
}

function FrameworkTable({ theme, metrics }: { theme: FrameworkTheme; metrics: MetricDef[] }) {
  const rows = metrics.map((m) => ({ ...m, values: YEARS.map((p) => m.get(p)) }))
  return (
    <div className="overflow-hidden rounded-[18px] border border-[rgba(23,43,77,0.08)] bg-white shadow-[0_1px_2px_rgba(23,43,77,0.04),0_10px_26px_rgba(23,43,77,0.06)]">
      <div className={`flex items-center justify-center gap-2 py-3 text-white ${theme.headerClass}`}>
        <theme.Icon className="h-4 w-4" />
        <span className="text-[13.5px] font-semibold tracking-wide">{theme.label}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className={`${theme.theadClass} text-[10.5px] font-semibold uppercase tracking-wide`}>
              <th className="px-4 py-2.5 text-left text-ink-secondary">Metric</th>
              {YEARS.map((y) => (
                <th key={y} className={`px-2 py-2.5 text-right ${theme.fyClass}`}>{y}</th>
              ))}
              <th className="px-3 py-2.5 text-center text-ink-secondary">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-soft-border/70 transition-colors hover:bg-ice/40">
                <td className="px-4 py-2.5 text-left font-medium text-navy-deep">{r.label}</td>
                {r.values.map((v, i) => {
                  const negative = r.kind === 'cr' && v != null && v < 0
                  return (
                    <td
                      key={i}
                      className={`px-2 py-2.5 text-right tabular-nums ${
                        v == null ? 'text-ink-secondary/40' : negative ? 'font-semibold text-coral' : 'text-ink-primary'
                      }`}
                    >
                      {fmt(v, r.kind)}
                    </td>
                  )
                })}
                <td className="px-3 py-2.5">
                  <div className="flex justify-center">
                    <Trend values={r.values} goodWhenUp={r.goodWhenUp} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Compact chart view (optional toggle) ─────────────────────────────────────
function MiniSeriesChart({ title, data, unit, color }: { title: string; data: { fy: string; v: number | null }[]; unit: string; color: string }) {
  return (
    <div className="rounded-xl border border-soft-border bg-white/70 p-3">
      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-secondary">{title}</p>
      <div style={{ width: '100%', height: 120 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 10, left: -14, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F7" vertical={false} />
            <XAxis dataKey="fy" tick={{ fontSize: 10.5, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: '#EEF1F7' }} />
            <YAxis tick={{ fontSize: 10.5, fill: '#6B7280' }} tickLine={false} axisLine={false} width={40} unit={unit === '%' ? '%' : ''} />
            <Tooltip
              cursor={{ stroke: '#C7D2E5', strokeDasharray: '3 3' }}
              contentStyle={{ borderRadius: 10, border: '1px solid #E5E8EF', fontSize: 11 }}
              formatter={(val: number) => [`${val}${unit}`, title]}
            />
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={{ r: 2.5, fill: color }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function FrameworkCharts({ theme, basis, companyId }: { theme: FrameworkTheme; basis: AccountingBasis; companyId: string }) {
  const cr = YEARS.map((p) => ({ fy: p, v: getBasisProfit(companyId, basis, p)?.combinedRatio ?? null }))
  const pat = YEARS.map((p) => ({ fy: p, v: getBasisProfit(companyId, basis, p)?.pat ?? null }))
  const lineColor = basis === 'ifrs' ? '#27457E' : '#9C7430'
  return (
    <div className="overflow-hidden rounded-[18px] border border-[rgba(23,43,77,0.08)] bg-white shadow-[0_1px_2px_rgba(23,43,77,0.04),0_10px_26px_rgba(23,43,77,0.06)]">
      <div className={`flex items-center justify-center gap-2 py-3 text-white ${theme.headerClass}`}>
        <theme.Icon className="h-4 w-4" />
        <span className="text-[13.5px] font-semibold tracking-wide">{theme.label}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <MiniSeriesChart title="Combined Ratio (%)" data={cr} unit="%" color={lineColor} />
        <MiniSeriesChart title="PAT (₹ Cr)" data={pat} unit="" color={lineColor} />
      </div>
    </div>
  )
}

export function ProfitabilityReview() {
  const company = useActiveCompany()
  const [view, setView] = useState<'table' | 'chart'>('table')
  const gwpByFy = useGwpByFy(company.id)
  const id = company.id

  // Per-basis metric definitions, wired to the real model.
  const { ifrsMetrics, igaapMetrics } = useMemo(() => {
    const nep = (p: BasisPeriod) => getBasisNep(id, p)
    const igaapCr = (p: BasisPeriod) => getBasisProfit(id, 'igaap', p)?.combinedRatio ?? null
    const ifrsCr = (p: BasisPeriod) => getBasisProfit(id, 'ifrs', p)?.combinedRatio ?? null

    const ifrs: MetricDef[] = [
      { label: 'Net Earned Premium (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => nep(p) },
      { label: 'Combined Ratio (%)', kind: 'pct', goodWhenUp: false, get: (p) => ifrsCr(p) },
      { label: 'Underwriting Result (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => uw(nep(p), ifrsCr(p)) },
      { label: 'PAT (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => getBasisProfit(id, 'ifrs', p)?.pat ?? null },
      { label: 'RoE (%)', kind: 'pct', goodWhenUp: true, get: (p) => getStatutoryRoe(id, p) }, // statutory — no IFRS equity reported
      { label: 'Solvency Ratio (x)', kind: 'x', goodWhenUp: true, get: (p) => getBasisSolvency(id, p) },
    ]
    const igaap: MetricDef[] = [
      { label: 'Gross Written Premium (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => gwpByFy[p] ?? null },
      { label: 'Claims Ratio (%)', kind: 'pct', goodWhenUp: false, get: (p) => getBasisProfit(id, 'igaap', p)?.claimsRatio ?? null },
      { label: 'Expense Ratio (%)', kind: 'pct', goodWhenUp: false, get: (p) => getBasisProfit(id, 'igaap', p)?.expenseRatio ?? null },
      { label: 'Underwriting Result (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => uw(nep(p), igaapCr(p)) },
      { label: 'PAT (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => getBasisProfit(id, 'igaap', p)?.pat ?? null },
      { label: 'Solvency Ratio (x)', kind: 'x', goodWhenUp: true, get: (p) => getBasisSolvency(id, p) },
    ]
    return { ifrsMetrics: ifrs, igaapMetrics: igaap }
  }, [id, gwpByFy])

  // Honest, data-driven key takeaways (IGAAP/Statutory series).
  const takeaways = useMemo(() => buildTakeaways(id), [id])

  if (!hasBasisData(id)) {
    return (
      <div className="space-y-5">
        <ReviewHeader name={company.shortName} view={view} onView={setView} />
        <DataEmptyState
          kind="pending"
          title="Dual-framework profitability not yet tracked for this insurer"
          body={`A full IND AS / IFRS-style vs IGAAP / Statutory comparison is curated for ${BASIS_TRACKED_COMPANIES.join(', ')}. Select one of those companies above to review both bases.`}
          height={260}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <ReviewHeader name={company.shortName} view={view} onView={setView} />

      {view === 'table' ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start animate-fade-in">
          <FrameworkTable theme={IFRS_THEME} metrics={ifrsMetrics} />
          <FrameworkTable theme={IGAAP_THEME} metrics={igaapMetrics} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start animate-fade-in">
          <FrameworkCharts theme={IFRS_THEME} basis="ifrs" companyId={id} />
          <FrameworkCharts theme={IGAAP_THEME} basis="igaap" companyId={id} />
        </div>
      )}

      {/* Key takeaways + source */}
      <div className="flex flex-col gap-3 rounded-[18px] border border-soft-border bg-gradient-to-br from-white to-ice/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-champagne-deep">Key takeaways</span>
          {takeaways.map((t) => (
            <span key={t} className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-navy-deep ring-1 ring-soft-border">
              {t}
            </span>
          ))}
        </div>
        <SourceTag
          source="Company filing"
          period="FY23–FY26"
          confidence="high"
          provenance={{ source_name: 'Company Annual Reports / Statutory Filings — IGAAP statutory accounts & IFRS / Ind AS accounts.' }}
        />
      </div>

      <p className="text-[10px] text-ink-secondary/70">
        Underwriting result = net earned premium × (1 − combined ratio). RoE and solvency are statutory measures (IFRS equity is not separately reported), shown for reference on both bases.
      </p>
    </div>
  )
}

function ReviewHeader({ name, view, onView }: { name: string; view: 'table' | 'chart'; onView: (v: 'table' | 'chart') => void }) {
  return (
    <header className="relative flex flex-wrap items-start justify-between gap-3 overflow-hidden rounded-[1.15rem] border border-[#EAD9B6]/70 bg-gradient-to-br from-white to-[#FBF6EA] p-5 shadow-[0_1px_2px_rgba(23,43,77,0.04),0_12px_30px_rgba(23,43,77,0.06)]">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-champagne to-champagne-deep" />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">Profitability Review</p>
        <h2 className="mt-1 font-display text-[21px] leading-tight text-navy-deep">{name} · Profitability Review</h2>
        <p className="mt-1 max-w-2xl text-[12.5px] text-ink-secondary">
          Compare profitability under IND AS / IFRS-style and IGAAP / Statutory reporting — reviewed side by side for easy comparison.
        </p>
      </div>
      <div className="inline-flex items-center gap-1 rounded-full border border-soft-border bg-white/80 p-0.5 shadow-soft">
        <span className="px-2 text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">View</span>
        {(['table', 'chart'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            aria-pressed={view === v}
            className={[
              'rounded-full px-3 py-1 text-[11.5px] font-medium capitalize transition-all duration-200',
              view === v ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white shadow-soft' : 'text-ink-secondary hover:text-navy-primary',
            ].join(' ')}
          >
            {v}
          </button>
        ))}
      </div>
    </header>
  )
}

// Build up to four short, real takeaways from the IGAAP/Statutory series.
function buildTakeaways(id: string): string[] {
  const out: string[] = []
  const cr = YEARS.map((p) => getBasisProfit(id, 'igaap', p)?.combinedRatio ?? null).filter((v): v is number => v != null)
  if (cr.length >= 2) {
    const d = cr[cr.length - 1] - cr[0]
    out.push(d <= 0 ? `Combined ratio improved ${Math.abs(d).toFixed(1)} pp` : `Combined ratio up ${d.toFixed(1)} pp`)
  }
  const pats = YEARS.map((p) => getBasisProfit(id, 'igaap', p)?.pat ?? null).filter((v): v is number => v != null)
  if (pats.length >= 2 && pats[0] !== 0) {
    const turned = pats[0] <= 0 && pats[pats.length - 1] > 0
    out.push(turned ? 'PAT turned positive' : `PAT ${pats[pats.length - 1] >= pats[0] ? 'rising' : 'softening'} to ₹${pats[pats.length - 1].toLocaleString('en-IN')} Cr`)
  }
  const solv = YEARS.map((p) => getBasisSolvency(id, p)).filter((v): v is number => v != null)
  if (solv.length) {
    const latest = solv[solv.length - 1]
    out.push(`Solvency ${latest >= 1.5 ? 'comfortable' : 'tight'} at ${latest.toFixed(2)}x`)
  }
  return out.slice(0, 4)
}
