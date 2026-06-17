import { useId, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Landmark, ShieldCheck } from 'lucide-react'
import { useActiveCompany, useFilters } from '@/state/filters'
import { fyLabelsInRange } from '@/lib/dateRange'
import { SourceTag } from '@/components/SourceTag'
import { DataEmptyState } from '@/components/DataEmptyState'
import {
  ANNUAL_PERIODS,
  Q4_PERIODS,
  BASIS_TRACKED_COMPANIES,
  getBasisNep,
  getBasisProfit,
  getBasisSolvency,
  getInvestment,
  getInvestmentLeverage,
  getNetWorth,
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

// The visible periods now follow the header controls — the Annual/Quarterly
// toggle (annual FYs vs the reported Q4 standalones) clipped to the Data Range.
// Computed in ProfitabilityReview and threaded down so every table, chart and
// takeaway reacts to the selection.
function useVisiblePeriods(): BasisPeriod[] {
  const { profitabilityFrequency, range } = useFilters()
  return useMemo(() => {
    const base = profitabilityFrequency === 'Quarterly' ? Q4_PERIODS : ANNUAL_PERIODS
    const fysInRange = new Set(fyLabelsInRange(range))
    const clipped = base.filter((p) => {
      const fy = /FY\d{2}/.exec(p)?.[0]
      return fy ? fysInRange.has(fy) : true
    })
    return clipped
  }, [profitabilityFrequency, range])
}

type MetricKind = 'cr' | 'pct' | 'x'

interface MetricDef {
  label: string
  kind: MetricKind
  /** Trend is "good" when the value rises (premium, profit, solvency) vs falls
   *  (cost / combined ratios). Drives the sparkline colour. */
  goodWhenUp: boolean
  /** True for statutory/regulatory measures that are NOT restated by accounting
   *  basis (net worth, solvency, the investment book, statutory RoE). They carry
   *  the same figure on both the IFRS and IGAAP tables — tagged so the identical
   *  values read as intentional, not a duplication. */
  basisNeutral?: boolean
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
  const gid = `spark-${useId().replace(/:/g, '')}`
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
  // Soft tonal area under the line — same colour as the trend, fading to clear.
  // Purely cosmetic depth; the up/down/flat colour meaning is unchanged.
  const area = `${d} L ${sx(last.i).toFixed(1)} ${H} L ${sx(pts[0].i).toFixed(1)} ${H} Z`

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(last.i)} cy={sy(last.v)} r={3.6} fill={color} opacity={0.16} />
      <circle cx={sx(last.i)} cy={sy(last.v)} r={2} fill={color} stroke="#ffffff" strokeWidth={0.8} />
    </svg>
  )
}

interface FrameworkTheme {
  label: string
  Icon: typeof Landmark
  /** Gradient banner at the top of each card (navy = IFRS, gold = IGAAP). */
  headerClass: string
  /** Tinted header row inside the table (the column labels band). */
  headBand: string
  /** Muted label colour for the "Metric"/"Trend" header cells. */
  headMeta: string
  /** Stronger label colour for the FY column headers. */
  fyColor: string
  /** Soft tone behind the rows — cool for IFRS, warm for IGAAP. */
  bodyBg: string
  /** Alternating row fills: flat sits calmer, lift sits a touch brighter. */
  rowFlat: string
  rowLift: string
  /** Alternating elevation — flat rows barely lift, lift rows lift a touch more. */
  shadowFlatClass: string
  shadowLiftClass: string
  /** Hairline frame colour, tone-matched to the side. */
  frameBorder: string
}

const IFRS_THEME: FrameworkTheme = {
  label: 'IND AS / IFRS-style',
  Icon: Landmark,
  headerClass: 'bg-gradient-to-r from-navy-primary to-navy-deep',
  headBand: '#E8F0FB',
  headMeta: '#5C6E91',
  fyColor: '#27457E',
  bodyBg: 'linear-gradient(180deg,#FBFCFE 0%,#F3F8FD 100%)',
  rowFlat: '#FCFDFF',
  rowLift: '#F1F6FC',
  shadowFlatClass: 'shadow-[0_1px_2px_rgba(23,43,77,0.05)] hover:shadow-[0_2px_8px_rgba(23,43,77,0.09)]',
  shadowLiftClass: 'shadow-[0_2px_6px_rgba(23,43,77,0.08),0_1px_2px_rgba(23,43,77,0.04)] hover:shadow-[0_4px_12px_rgba(23,43,77,0.11)]',
  frameBorder: 'rgba(39,69,126,0.12)',
}
const IGAAP_THEME: FrameworkTheme = {
  label: 'IGAAP / Statutory',
  Icon: ShieldCheck,
  headerClass: 'bg-gradient-to-r from-[#C29A45] to-[#9C7430]',
  headBand: '#F7EFDC',
  headMeta: '#8A7647',
  fyColor: '#9C7430',
  bodyBg: 'linear-gradient(180deg,#FEFDFA 0%,#FBF5EA 100%)',
  rowFlat: '#FFFEFB',
  rowLift: '#FAF4E8',
  shadowFlatClass: 'shadow-[0_1px_2px_rgba(120,92,30,0.06)] hover:shadow-[0_2px_8px_rgba(120,92,30,0.10)]',
  shadowLiftClass: 'shadow-[0_2px_6px_rgba(120,92,30,0.09),0_1px_2px_rgba(120,92,30,0.04)] hover:shadow-[0_4px_12px_rgba(120,92,30,0.12)]',
  frameBorder: 'rgba(156,116,48,0.16)',
}

// Shared, refined banner — an icon chip on the tone-coded gradient with a faint
// top sheen so it reads polished rather than a flat colour block.
function FrameworkHeader({ theme }: { theme: FrameworkTheme }) {
  return (
    <div
      className={`relative flex items-center justify-center gap-2 py-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] ${theme.headerClass}`}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/20">
        <theme.Icon className="h-3.5 w-3.5" />
      </span>
      <span className="text-[13px] font-semibold tracking-[0.04em]">{theme.label}</span>
    </div>
  )
}

function FrameworkTable({ theme, metrics, years }: { theme: FrameworkTheme; metrics: MetricDef[]; years: BasisPeriod[] }) {
  const rows = metrics.map((m) => ({ ...m, values: years.map((p) => m.get(p)) }))
  return (
    <div
      className="overflow-hidden rounded-[18px] border bg-white shadow-[0_1px_2px_rgba(23,43,77,0.04),0_10px_26px_rgba(23,43,77,0.06)]"
      style={{ borderColor: theme.frameBorder }}
    >
      <FrameworkHeader theme={theme} />
      {/* Tinted body surface — the gaps between card-rows show this tone. */}
      <div className="overflow-x-auto px-3 pb-3.5 pt-2.5" style={{ background: theme.bodyBg }}>
        <table className="w-full text-[12.5px]" style={{ borderCollapse: 'separate', borderSpacing: '0 5px' }}>
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-[0.08em]">
              <th className="rounded-l-[10px] px-4 py-2.5 text-left" style={{ background: theme.headBand, color: theme.headMeta }}>
                Metric
              </th>
              {years.map((y) => (
                <th key={y} className="px-3 py-2.5 text-right" style={{ background: theme.headBand, color: theme.fyColor }}>
                  {y}
                </th>
              ))}
              <th className="rounded-r-[10px] px-3 py-2.5 text-center" style={{ background: theme.headBand, color: theme.headMeta }}>
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              // Alternate the depth: even rows sit calmer, odd rows lift a touch.
              const lifted = ri % 2 === 1
              const rowBg = lifted ? theme.rowLift : theme.rowFlat
              const shadowClass = lifted ? theme.shadowLiftClass : theme.shadowFlatClass
              return (
                <tr key={r.label} className={`${shadowClass} transition-shadow duration-normal ease-premium`}>
                  <td className="rounded-l-[11px] px-4 py-3 text-left font-semibold text-navy-deep" style={{ background: rowBg }}>
                    {r.label}
                    {r.basisNeutral && (
                      <span
                        className="ml-1.5 align-middle rounded-full bg-white/70 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary ring-1 ring-black/[0.06]"
                        title="Statutory / regulatory measure — reported on a single basis (not restated under IFRS vs IGAAP), so it shows the same figure on both tables."
                      >
                        statutory
                      </span>
                    )}
                  </td>
                  {r.values.map((v, i) => {
                    const negative = r.kind === 'cr' && v != null && v < 0
                    return (
                      <td
                        key={i}
                        className={`px-3 py-3 text-right tabular-nums ${
                          v == null ? 'text-ink-secondary/40' : negative ? 'font-semibold text-coral' : 'text-ink-primary'
                        }`}
                        style={{ background: rowBg }}
                      >
                        {fmt(v, r.kind)}
                      </td>
                    )
                  })}
                  <td className="rounded-r-[11px] px-3 py-3" style={{ background: rowBg }}>
                    <div className="flex justify-center">
                      <Trend values={r.values} goodWhenUp={r.goodWhenUp} />
                    </div>
                  </td>
                </tr>
              )
            })}
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

function FrameworkCharts({ theme, basis, companyId, years }: { theme: FrameworkTheme; basis: AccountingBasis; companyId: string; years: BasisPeriod[] }) {
  const cr = years.map((p) => ({ fy: p, v: getBasisProfit(companyId, basis, p)?.combinedRatio ?? null }))
  const pat = years.map((p) => ({ fy: p, v: getBasisProfit(companyId, basis, p)?.pat ?? null }))
  const lineColor = basis === 'ifrs' ? '#27457E' : '#9C7430'
  return (
    <div
      className="overflow-hidden rounded-[18px] border bg-white shadow-[0_1px_2px_rgba(23,43,77,0.04),0_10px_26px_rgba(23,43,77,0.06)]"
      style={{ borderColor: theme.frameBorder }}
    >
      <FrameworkHeader theme={theme} />
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
  // Periods follow the header's Annual/Quarterly toggle + Data Range.
  const periods = useVisiblePeriods()
  const periodSpan = periods.length
    ? periods.length === 1
      ? periods[0]
      : `${periods[0]}–${periods[periods.length - 1]}`
    : '—'

  // Per-basis metric definitions, wired to the real model.
  const { ifrsMetrics, igaapMetrics } = useMemo(() => {
    const nep = (p: BasisPeriod) => getBasisNep(id, p)
    const igaapCr = (p: BasisPeriod) => getBasisProfit(id, 'igaap', p)?.combinedRatio ?? null
    const ifrsCr = (p: BasisPeriod) => getBasisProfit(id, 'ifrs', p)?.combinedRatio ?? null

    // Balance-sheet & investment-book metrics — statutory basis, shown on both
    // tables for reference. Investment leverage is the calculation-based row.
    const capital: MetricDef[] = [
      { label: 'Net Worth (₹ Cr)', kind: 'cr', goodWhenUp: true, basisNeutral: true, get: (p) => getNetWorth(id, p) },
      { label: 'Investment AUM (₹ Cr)', kind: 'cr', goodWhenUp: true, basisNeutral: true, get: (p) => getInvestment(id, p)?.aum ?? null },
      { label: 'Investment Yield (%)', kind: 'pct', goodWhenUp: true, basisNeutral: true, get: (p) => getInvestment(id, p)?.yield ?? null },
      { label: 'Investment Leverage (x)', kind: 'x', goodWhenUp: true, basisNeutral: true, get: (p) => getInvestmentLeverage(id, p) },
    ]

    const ifrs: MetricDef[] = [
      { label: 'Net Earned Premium (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => nep(p) },
      { label: 'Combined Ratio (%)', kind: 'pct', goodWhenUp: false, get: (p) => ifrsCr(p) },
      { label: 'Expense Ratio (%)', kind: 'pct', goodWhenUp: false, get: (p) => getBasisProfit(id, 'ifrs', p)?.expenseRatio ?? null },
      { label: 'Underwriting Result (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => uw(nep(p), ifrsCr(p)) },
      { label: 'PAT (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => getBasisProfit(id, 'ifrs', p)?.pat ?? null },
      { label: 'RoE (%)', kind: 'pct', goodWhenUp: true, basisNeutral: true, get: (p) => getStatutoryRoe(id, p) }, // statutory — no IFRS equity reported
      { label: 'Solvency Ratio (x)', kind: 'x', goodWhenUp: true, basisNeutral: true, get: (p) => getBasisSolvency(id, p) },
      ...capital,
    ]
    const igaap: MetricDef[] = [
      { label: 'Gross Written Premium (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => gwpByFy[p] ?? null },
      { label: 'Claims Ratio (%)', kind: 'pct', goodWhenUp: false, get: (p) => getBasisProfit(id, 'igaap', p)?.claimsRatio ?? null },
      { label: 'Expense Ratio (%)', kind: 'pct', goodWhenUp: false, get: (p) => getBasisProfit(id, 'igaap', p)?.expenseRatio ?? null },
      { label: 'Underwriting Result (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => uw(nep(p), igaapCr(p)) },
      { label: 'PAT (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => getBasisProfit(id, 'igaap', p)?.pat ?? null },
      { label: 'Solvency Ratio (x)', kind: 'x', goodWhenUp: true, basisNeutral: true, get: (p) => getBasisSolvency(id, p) },
      ...capital,
    ]
    return { ifrsMetrics: ifrs, igaapMetrics: igaap }
  }, [id, gwpByFy])

  // Honest, data-driven key takeaways (IGAAP/Statutory series).
  const takeaways = useMemo(() => buildTakeaways(id, periods), [id, periods])

  if (!hasBasisData(id)) {
    return (
      <div className="space-y-5">
        <ReviewToolbar name={company.shortName} span={periodSpan} view={view} onView={setView} />
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
      <ReviewToolbar name={company.shortName} span={periodSpan} view={view} onView={setView} />

      {periods.length === 0 ? (
        <DataEmptyState
          kind="pending"
          title="No profitability periods in the selected range"
          body="Profitability is reported on annual (FY23–FY26) and Q4 standalone bases. Widen the Data Range — or switch the Annual/Quarterly toggle — to bring a reported period into view."
          height={240}
        />
      ) : view === 'table' ? (
        <div className="space-y-5 animate-fade-in">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
            <FrameworkTable theme={IFRS_THEME} metrics={ifrsMetrics} years={periods} />
            <FrameworkTable theme={IGAAP_THEME} metrics={igaapMetrics} years={periods} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start animate-fade-in">
          <FrameworkCharts theme={IFRS_THEME} basis="ifrs" companyId={id} years={periods} />
          <FrameworkCharts theme={IGAAP_THEME} basis="igaap" companyId={id} years={periods} />
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
          source="Annual reports & filings"
          period={periodSpan}
          confidence="high"
          provenance={{ source_name: 'Company Annual Reports / Statutory Filings — IGAAP statutory accounts & IFRS / Ind AS accounts.' }}
        />
      </div>

      <p className="text-[10px] text-ink-secondary/70">
        Net earned premium (NEP) and gross written premium (GWP) are premium measures, not profit — PAT, underwriting result and combined ratio are the profit measures. Underwriting result = net earned premium × (1 − combined ratio). Investment leverage = investment AUM ÷ net worth. RoE, solvency, net worth and the investment book are statutory measures (IFRS equity is not separately reported), shown for reference on both bases.
      </p>
    </div>
  )
}

// Slim comparison toolbar — replaces the old large "Profitability Review" card
// (the page headline above already carries the Profitability narrative). One
// compact, horizontally-aligned strip: company · descriptor · period badge · the
// Table/Chart view toggle. Premium, calm, no second big heading.
function ReviewToolbar({ name, span, view, onView }: { name: string; span: string; view: 'table' | 'chart'; onView: (v: 'table' | 'chart') => void }) {
  return (
    <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2 overflow-hidden rounded-xl border border-soft-border bg-gradient-to-r from-[#F8F7F2] via-card to-[#EEF3F9] px-3.5 py-2 shadow-soft">
      {/* thin muted-gold accent line */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-champagne to-champagne-deep" />
      <span className="pl-1.5 font-display text-[14px] leading-none text-navy-deep">{name}</span>
      <span className="hidden text-[11.5px] leading-none text-ink-secondary sm:inline">IND AS / IFRS-style and IGAAP / Statutory comparison</span>
      {span && span !== '—' && (
        <span className="inline-flex items-center rounded-full bg-soft-blue px-2 py-0.5 text-[10px] font-semibold tabular-nums text-navy-primary ring-1 ring-[#D6E2FA]">{span}</span>
      )}
      <div className="ml-auto inline-flex items-center gap-1 rounded-full border border-soft-border bg-white/80 p-0.5 shadow-soft">
        <span className="px-2 text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">View</span>
        {(['table', 'chart'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            aria-pressed={view === v}
            className={[
              'rounded-full px-3 py-1 text-[11.5px] font-medium capitalize transition-all duration-normal ease-premium',
              view === v ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white shadow-soft ring-1 ring-[#B68B3A]/30' : 'text-ink-secondary hover:text-navy-primary',
            ].join(' ')}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}

// Build up to four short, real takeaways from the IGAAP/Statutory series,
// scoped to the periods currently in view.
function buildTakeaways(id: string, years: BasisPeriod[]): string[] {
  const out: string[] = []
  const cr = years.map((p) => getBasisProfit(id, 'igaap', p)?.combinedRatio ?? null).filter((v): v is number => v != null)
  if (cr.length >= 2) {
    const d = cr[cr.length - 1] - cr[0]
    out.push(d <= 0 ? `Combined ratio improved ${Math.abs(d).toFixed(1)} pp` : `Combined ratio up ${d.toFixed(1)} pp`)
  }
  const pats = years.map((p) => getBasisProfit(id, 'igaap', p)?.pat ?? null).filter((v): v is number => v != null)
  if (pats.length >= 2 && pats[0] !== 0) {
    const turned = pats[0] <= 0 && pats[pats.length - 1] > 0
    out.push(turned ? 'PAT turned positive' : `PAT ${pats[pats.length - 1] >= pats[0] ? 'rising' : 'softening'} to ₹${pats[pats.length - 1].toLocaleString('en-IN')} Cr`)
  }
  const solv = years.map((p) => getBasisSolvency(id, p)).filter((v): v is number => v != null)
  if (solv.length) {
    const latest = solv[solv.length - 1]
    out.push(`Solvency ${latest >= 1.5 ? 'comfortable' : 'tight'} at ${latest.toFixed(2)}x`)
  }
  return out.slice(0, 4)
}
