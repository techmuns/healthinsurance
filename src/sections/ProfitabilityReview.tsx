import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Info, Landmark, ShieldCheck } from 'lucide-react'
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

function FrameworkTable({ theme, metrics, years }: { theme: FrameworkTheme; metrics: MetricDef[]; years: BasisPeriod[] }) {
  const rows = metrics.map((m) => ({ ...m, values: years.map((p) => m.get(p)) }))
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
              {years.map((y) => (
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

function FrameworkCharts({ theme, basis, companyId, years }: { theme: FrameworkTheme; basis: AccountingBasis; companyId: string; years: BasisPeriod[] }) {
  const cr = years.map((p) => ({ fy: p, v: getBasisProfit(companyId, basis, p)?.combinedRatio ?? null }))
  const pat = years.map((p) => ({ fy: p, v: getBasisProfit(companyId, basis, p)?.pat ?? null }))
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

// ── PAT Quality Split — operating vs investment contribution to reported PAT ──
// Per year, a stacked column (per basis) splits the REPORTED PAT into two quality
// buckets — operating profit (underwriting) and investment profit — that sum to
// PAT, with PAT printed as a label at the top. "Compare Both" puts the IFRS and
// IGAAP columns side by side per year. No tax/other residual, no floating PAT
// line: the chart answers one question — how much of profit is operating vs
// investment.
//
// Honesty: the TOTAL is the real reported PAT (and the label). The operating vs
// investment SPLIT is illustrative (mock) — the dual-basis filing model carries
// reported PAT but not a clean per-year operating-vs-investment breakdown for
// every year (e.g. FY26 investment income isn't separately available). The split
// is grounded in real investment income vs the real underwriting result where
// both exist, and the card says "Illustrative split" plainly in four places.
const Q = {
  op: '#2B8C86', // muted teal — operating profit contribution
  inv: '#E3C27E', // soft gold — investment profit contribution
  pat: '#27457E', // navy — Total PAT label
  neg: '#C58B84', // muted rose — only ever used for a negative contribution
}

function investmentIncome(id: string, p: BasisPeriod): number | null {
  const inv = getInvestment(id, p)
  if (!inv || inv.aum == null || inv.yield == null) return null
  return Math.round((inv.aum * inv.yield) / 100)
}

// Illustrative investment share of PAT (0–1). Grounded in real investment income
// vs the real underwriting result where both exist; a neutral 0.5 otherwise.
// Clamped so neither slice vanishes — a readable split, not a precise claim.
function investmentShare(id: string, basis: AccountingBasis, p: BasisPeriod): number {
  const inv = investmentIncome(id, p)
  const op = uw(getBasisNep(id, p), getBasisProfit(id, basis, p)?.combinedRatio ?? null)
  if (inv != null && op != null) {
    const denom = inv + Math.max(op, 0)
    if (denom > 0) return Math.min(0.72, Math.max(0.3, inv / denom))
  }
  return 0.5
}

// One year's PAT quality split on a basis: real PAT as the total, illustrative
// operating/investment slices that sum to it. Null PAT → no bar (honest gap).
function patSplit(id: string, basis: AccountingBasis, p: BasisPeriod): { pat: number | null; op: number | null; inv: number | null } {
  const pat = getBasisProfit(id, basis, p)?.pat ?? null
  if (pat == null) return { pat: null, op: null, inv: null }
  const inv = Math.round(pat * investmentShare(id, basis, p))
  return { pat, op: pat - inv, inv }
}

// PAT total printed above each stacked column (LabelList content).
function PatLabel(props: { x?: number; y?: number; width?: number; value?: number | string | null }) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const width = Number(props.width ?? 0)
  const value = typeof props.value === 'number' ? props.value : null
  if (value == null) return null
  return (
    <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={Q.pat}>
      ₹{value.toLocaleString('en-IN')}
    </text>
  )
}

const INFO_TEXT =
  'PAT quality split: how much of reported profit (PAT) each year came from operating (underwriting) vs investment. Each bar stacks the two contributions up to the reported PAT total shown as a label. The operating vs investment split is illustrative; the PAT total is as reported. Use the toggle for IFRS, IGAAP, or both side by side.'

function InfoIcon() {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        aria-label="About this chart"
        className="grid h-4 w-4 place-items-center rounded-full text-ink-secondary transition-colors hover:text-navy-primary"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span className="absolute left-1/2 top-[calc(100%+6px)] z-30 w-64 -translate-x-1/4 rounded-lg border border-soft-border bg-white px-3 py-2 text-[11px] font-normal leading-snug text-ink-primary shadow-[0_8px_30px_rgba(23,43,77,0.16)]">
          {INFO_TEXT}
        </span>
      )}
    </span>
  )
}

type FwMode = 'ifrs' | 'igaap' | 'both'
const FW_TABS: { id: FwMode; label: string }[] = [
  { id: 'ifrs', label: 'IFRS' },
  { id: 'igaap', label: 'IGAAP' },
  { id: 'both', label: 'Compare Both' },
]

function ProfitQualityBand({ companyId, years }: { companyId: string; years: BasisPeriod[] }) {
  const [mode, setMode] = useState<FwMode>('ifrs')
  const data = useMemo(
    () =>
      years.map((p) => {
        const f = patSplit(companyId, 'ifrs', p)
        const g = patSplit(companyId, 'igaap', p)
        return {
          fy: p,
          ifrsOp: f.op, ifrsInv: f.inv, ifrsPat: f.pat,
          igaapOp: g.op, igaapInv: g.inv, igaapPat: g.pat,
        }
      }),
    [companyId, years],
  )
  const hasAny = data.some((d) => d.ifrsPat != null || d.igaapPat != null)
  if (!hasAny) return null

  // Per-segment colour: positive → theme colour, negative → muted rose (labelled).
  const seg = (key: 'ifrsOp' | 'ifrsInv' | 'igaapOp' | 'igaapInv', base: string) =>
    data.map((d, i) => <Cell key={i} fill={(d[key] ?? 0) < 0 ? Q.neg : base} />)

  const single = mode !== 'both'
  const opKey = mode === 'igaap' ? 'igaapOp' : 'ifrsOp'
  const invKey = mode === 'igaap' ? 'igaapInv' : 'ifrsInv'
  const patKey = mode === 'igaap' ? 'igaapPat' : 'ifrsPat'

  // Latest year carrying both bases — for the Compare-Both gap caption only.
  const gapRow = [...data].reverse().find((d) => d.ifrsPat != null && d.igaapPat != null)
  const gap = gapRow ? (gapRow.ifrsPat as number) - (gapRow.igaapPat as number) : null

  return (
    <div className="rounded-[18px] border border-soft-border bg-white p-4 shadow-[0_1px_2px_rgba(23,43,77,0.04),0_10px_26px_rgba(23,43,77,0.06)]">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-champagne-deep">PAT Quality Split (₹ Cr)</p>
            <InfoIcon />
            <span
              className="rounded-full bg-champagne-soft/70 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-champagne-deep"
              title="The operating vs investment split is illustrative; the PAT total is as reported."
            >
              Illustrative split
            </span>
          </div>
          <p className="mt-0.5 text-[10.5px] text-ink-secondary">PAT quality split: operating vs investment contribution</p>
        </div>
        {/* Framework toggle */}
        <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-ice/60 p-0.5">
          {FW_TABS.map((t) => {
            const on = mode === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setMode(t.id)}
                aria-pressed={on}
                className={['rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all', on ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white shadow-soft' : 'text-ink-secondary hover:text-navy-primary'].join(' ')}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Clean legend — operating, investment, PAT label */}
      <QualityLegend />

      <div style={{ width: '100%', height: 224 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 18, right: 8, left: -10, bottom: 0 }} barCategoryGap={single ? '38%' : '24%'} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F2F7" vertical={false} />
            <XAxis dataKey="fy" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: '#E5E8EF' }} />
            <YAxis tick={{ fontSize: 10.5, fill: '#6B7280' }} tickLine={false} axisLine={false} width={44} />
            <ReferenceLine y={0} stroke="#9FACC0" strokeWidth={1} />
            <Tooltip
              content={(props) => {
                const p = props as unknown as { active?: boolean; payload?: Array<{ dataKey?: string | number; value?: number | null }>; label?: string }
                return <QualityTooltip active={p.active} payload={p.payload} label={p.label} mode={mode} />
              }}
              cursor={{ fill: 'rgba(23,43,77,0.04)' }}
            />
            {single ? (
              <>
                <Bar dataKey={opKey} stackId="x" maxBarSize={42} isAnimationActive={false}>{seg(opKey as 'ifrsOp', Q.op)}</Bar>
                <Bar dataKey={invKey} stackId="x" maxBarSize={42} isAnimationActive={false}>
                  {seg(invKey as 'ifrsInv', Q.inv)}
                  <LabelList dataKey={patKey} content={<PatLabel />} />
                </Bar>
              </>
            ) : (
              <>
                <Bar dataKey="ifrsOp" stackId="ifrs" maxBarSize={26} isAnimationActive={false}>{seg('ifrsOp', Q.op)}</Bar>
                <Bar dataKey="ifrsInv" stackId="ifrs" maxBarSize={26} isAnimationActive={false}>
                  {seg('ifrsInv', Q.inv)}
                  <LabelList dataKey="ifrsPat" content={<PatLabel />} />
                </Bar>
                <Bar dataKey="igaapOp" stackId="igaap" maxBarSize={26} isAnimationActive={false}>{seg('igaapOp', Q.op)}</Bar>
                <Bar dataKey="igaapInv" stackId="igaap" maxBarSize={26} isAnimationActive={false}>
                  {seg('igaapInv', Q.inv)}
                  <LabelList dataKey="igaapPat" content={<PatLabel />} />
                </Bar>
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-ink-secondary/80">
        <span>Total PAT is as reported; the operating vs investment split is illustrative.</span>
        {mode === 'both' && (
          <span className="inline-flex items-center gap-1.5">
            <span>Each year: IFRS (left) · IGAAP (right)</span>
            {gap != null && gapRow && (
              <span className="font-medium text-navy-deep">· {gapRow.fy} IFRS−IGAAP PAT gap ₹{gap.toLocaleString('en-IN')} Cr</span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

function QualityLegend() {
  const bar = (c: string) => <span className="h-2 w-3 shrink-0 rounded-[2px]" style={{ background: c }} />
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-ink-secondary">
      <span className="inline-flex items-center gap-1.5">{bar(Q.op)} Operating profit contribution</span>
      <span className="inline-flex items-center gap-1.5">{bar(Q.inv)} Investment profit contribution</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded-[3px] px-1 text-[8.5px] font-bold leading-tight text-white" style={{ background: Q.pat }}>₹</span>
        Total PAT (reported)
      </span>
    </div>
  )
}

function QualityTooltip({ active, payload, label, mode }: { active?: boolean; payload?: Array<{ dataKey?: string | number; value?: number | null }>; label?: string; mode: FwMode }) {
  if (!active || !payload?.length) return null
  const v = (k: string): number | null => {
    const found = payload.find((p) => String(p.dataKey) === k)?.value
    return typeof found === 'number' ? found : null
  }
  const Row = ({ c, name, val, bold }: { c: string; name: string; val: number | null; bold?: boolean }) =>
    val == null ? null : (
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-ink-secondary"><span className="h-1.5 w-1.5 rounded-full" style={{ background: val < 0 ? Q.neg : c }} />{name}</span>
        <span className={['tabular-nums', bold ? 'font-semibold text-navy-deep' : 'font-medium'].join(' ')} style={bold ? undefined : { color: val < 0 ? Q.neg : '#1F2937' }}>₹{val.toLocaleString('en-IN')}</span>
      </div>
    )
  const Group = ({ pre, title }: { pre: 'ifrs' | 'igaap'; title?: string }) => (
    <div className="space-y-0.5">
      {title && <p className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-secondary/80">{title}</p>}
      <Row c={Q.op} name="Operating" val={v(`${pre}Op`)} />
      <Row c={Q.inv} name="Investment" val={v(`${pre}Inv`)} />
      <Row c={Q.pat} name="Total PAT" val={v(`${pre}Pat`)} bold />
    </div>
  )
  return (
    <div className="min-w-[168px] rounded-lg border border-soft-border bg-white/97 px-2.5 py-1.5 text-[11px] shadow-soft">
      <p className="mb-1 font-semibold text-navy-deep">{label} · PAT quality split</p>
      {mode === 'both' ? (
        <div className="space-y-1.5">
          <Group pre="ifrs" title="IFRS" />
          <Group pre="igaap" title="IGAAP" />
        </div>
      ) : (
        <Group pre={mode === 'igaap' ? 'igaap' : 'ifrs'} />
      )}
      <p className="mt-1 border-t border-soft-border/70 pt-1 text-[9.5px] text-ink-secondary/80">Split illustrative · PAT as reported</p>
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
      { label: 'Net Worth (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => getNetWorth(id, p) },
      { label: 'Investment AUM (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => getInvestment(id, p)?.aum ?? null },
      { label: 'Investment Yield (%)', kind: 'pct', goodWhenUp: true, get: (p) => getInvestment(id, p)?.yield ?? null },
      { label: 'Investment Leverage (x)', kind: 'x', goodWhenUp: true, get: (p) => getInvestmentLeverage(id, p) },
    ]

    const ifrs: MetricDef[] = [
      { label: 'Net Earned Premium (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => nep(p) },
      { label: 'Combined Ratio (%)', kind: 'pct', goodWhenUp: false, get: (p) => ifrsCr(p) },
      { label: 'Expense Ratio (%)', kind: 'pct', goodWhenUp: false, get: (p) => getBasisProfit(id, 'ifrs', p)?.expenseRatio ?? null },
      { label: 'Underwriting Result (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => uw(nep(p), ifrsCr(p)) },
      { label: 'PAT (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => getBasisProfit(id, 'ifrs', p)?.pat ?? null },
      { label: 'RoE (%)', kind: 'pct', goodWhenUp: true, get: (p) => getStatutoryRoe(id, p) }, // statutory — no IFRS equity reported
      { label: 'Solvency Ratio (x)', kind: 'x', goodWhenUp: true, get: (p) => getBasisSolvency(id, p) },
      ...capital,
    ]
    const igaap: MetricDef[] = [
      { label: 'Gross Written Premium (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => gwpByFy[p] ?? null },
      { label: 'Claims Ratio (%)', kind: 'pct', goodWhenUp: false, get: (p) => getBasisProfit(id, 'igaap', p)?.claimsRatio ?? null },
      { label: 'Expense Ratio (%)', kind: 'pct', goodWhenUp: false, get: (p) => getBasisProfit(id, 'igaap', p)?.expenseRatio ?? null },
      { label: 'Underwriting Result (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => uw(nep(p), igaapCr(p)) },
      { label: 'PAT (₹ Cr)', kind: 'cr', goodWhenUp: true, get: (p) => getBasisProfit(id, 'igaap', p)?.pat ?? null },
      { label: 'Solvency Ratio (x)', kind: 'x', goodWhenUp: true, get: (p) => getBasisSolvency(id, p) },
      ...capital,
    ]
    return { ifrsMetrics: ifrs, igaapMetrics: igaap }
  }, [id, gwpByFy])

  // Honest, data-driven key takeaways (IGAAP/Statutory series).
  const takeaways = useMemo(() => buildTakeaways(id, periods), [id, periods])

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

      {periods.length === 0 ? (
        <DataEmptyState
          kind="pending"
          title="No profitability periods in the selected range"
          body="Profitability is reported on annual (FY23–FY26) and Q4 standalone bases. Widen the Data Range — or switch the Annual/Quarterly toggle — to bring a reported period into view."
          height={240}
        />
      ) : view === 'table' ? (
        <div className="space-y-5 animate-fade-in">
          <ProfitQualityBand companyId={id} years={periods} />
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
          source="Company filing"
          period={periodSpan}
          confidence="high"
          provenance={{ source_name: 'Company Annual Reports / Statutory Filings — IGAAP statutory accounts & IFRS / Ind AS accounts.' }}
        />
      </div>

      <p className="text-[10px] text-ink-secondary/70">
        Underwriting result = net earned premium × (1 − combined ratio). Investment leverage = investment AUM ÷ net worth. RoE, solvency, net worth and the investment book are statutory measures (IFRS equity is not separately reported), shown for reference on both bases.
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
