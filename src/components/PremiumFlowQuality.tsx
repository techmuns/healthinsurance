import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BadgeCheck, ChevronDown, Layers, Repeat, TrendingDown } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import {
  compareQuarters,
  compareYears,
  getChannelMix,
  getCompareSeries,
  getCustomerMix,
  getPremiumFlow,
  getQualityMix,
  getRetentionCohort,
} from '@/data/mockData'
import type { FlowPoint, MixSeries } from '@/data/mockData'
import type { Insurer } from '@/data/types'

type Period = 'Quarterly' | 'Yearly'
type Tab = 'Flow' | 'Mix' | 'Retention'
type Stage = 'GWP' | 'NWP' | 'NEP'
type MixType = 'Customer' | 'Channel' | 'Quality'
type MixView = 'Share' | 'Value'
type RetView = 'Customers' | 'Premium' | 'Renewal'

// Color meaning: deep blue = core premium / written, teal = retained / positive,
// steel = earned, amber = concentration watch, soft red = leakage / ceded,
// gold = premium accent (used sparingly), grey = background / inactive.
const FOCAL = '#27457E'
const TEAL = '#168E8E'
const NEP_BLUE = '#3D7396'
const AMBER = '#C2902F'
const RED = '#C8635A'
const GOLD = '#B68B3A'
const SLATE = '#64748B'
const LAV = '#6E7BD6'
const GREY = '#94A3B8'
const GRID = '#ECEFF5'
const AXIS_TEXT = '#6B7280'
// Inactive / muted segment fills for the conversion bar.
const MUTE_NEAR = '#D3DBE6'
const MUTE_FAR = '#E7EBF1'
const CEDED_MUTE = 'rgba(199, 93, 90, 0.34)'

const SEG_COLORS: Record<string, string> = {
  retail: TEAL,
  group: SLATE,
  banca: AMBER,
  agency: FOCAL,
  broker: LAV,
  direct: TEAL,
  other: GREY,
  renewal: TEAL,
  fresh: FOCAL,
}

const fmtCr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')} Cr`
const compactCr = (v: number) => `₹${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
const pct = (v: number, d = 0) => `${v.toFixed(d)}%`
const axisCr = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${v}`)

/** hex + alpha → rgba(), for soft gradient/tint fills. */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

interface Chip {
  label: string
  value: string
  sub: string
  note?: string
  color: string
  icon: typeof Repeat
}

function InsightChips({ chips }: { chips: Chip[] }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      {chips.map((c) => {
        const Icon = c.icon
        return (
          <div
            key={c.label}
            className="relative overflow-hidden rounded-xl2 border border-soft-border p-3.5"
            style={{ background: `linear-gradient(135deg, ${hexA(c.color, 0.09)}, transparent 65%)` }}
          >
            <span className="absolute left-0 top-0 h-full w-1" style={{ background: c.color }} />
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">
              <span className="flex h-5 w-5 items-center justify-center rounded-md" style={{ background: hexA(c.color, 0.14), color: c.color }}>
                <Icon className="h-3 w-3" />
              </span>
              {c.label}
            </div>
            <p className="mt-1.5 font-display text-[20px] leading-none text-navy-deep">{c.value}</p>
            <p className="mt-1 text-[11px] text-ink-secondary">{c.sub}</p>
            {c.note && (
              <span className="mt-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: GOLD, background: hexA(GOLD, 0.12) }}>
                {c.note}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Slim horizontal pills — replaces the bulky cards on the Flow tab. */
function SlimStrip({ chips }: { chips: Chip[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <div key={c.label} className="flex items-center gap-2 rounded-lg border border-soft-border bg-ice/50 px-3 py-1.5">
          <span className="h-4 w-1 rounded-full" style={{ background: c.color }} />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{c.label}</span>
          <span className="font-display text-[15px] leading-none text-navy-deep">{c.value}</span>
          {c.note && (
            <span className="text-[10.5px] font-semibold" style={{ color: GOLD }}>
              {c.note}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-soft-border bg-ice/70 px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
      {children}
    </span>
  )
}

function CompanyMenu({ companies, value, onChange }: { companies: Insurer[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const current = companies.find((c) => c.id === value)
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-soft-border bg-ice px-3 py-1.5 text-[13px] outline-none transition-colors hover:border-muted-blue focus:border-navy-primary"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">Company</span>
        <span className="font-semibold text-navy-deep">{current?.shortName ?? 'Select'}</span>
        <ChevronDown className={['h-3.5 w-3.5 text-ink-secondary transition-transform', open ? 'rotate-180' : ''].join(' ')} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-52 rounded-xl2 border border-soft-border bg-card p-1.5 shadow-card">
          {companies.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange(c.id)
                setOpen(false)
              }}
              className={[
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors',
                c.id === value ? 'bg-soft-blue font-semibold text-navy-deep' : 'text-ink-primary hover:bg-ice',
              ].join(' ')}
            >
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: FOCAL }} />
              {c.shortName}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Tabs({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  const tabs: Tab[] = ['Flow', 'Mix', 'Retention']
  return (
    <div className="flex items-center gap-1">
      {tabs.map((t) => {
        const active = t === value
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={['relative px-3 py-1.5 text-[13.5px] font-semibold transition-colors', active ? 'text-navy-deep' : 'text-ink-secondary hover:text-navy-primary'].join(' ')}
          >
            {t}
            {active && <span className="absolute inset-x-2.5 -bottom-0.5 h-[2.5px] rounded-full" style={{ background: GOLD }} />}
          </button>
        )
      })}
    </div>
  )
}

function LegendSwatch({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-secondary">
      <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      {children}
    </span>
  )
}

// --- Flow tab: one premium bar per year, transitioning through stages --------

const STAGE_DEFS: { k: Stage; color: string }[] = [
  { k: 'GWP', color: FOCAL },
  { k: 'NWP', color: TEAL },
  { k: 'NEP', color: NEP_BLUE },
]

function stageSegColor(seg: 'earned' | 'mid' | 'ceded', stage: Stage): string {
  if (stage === 'GWP') return FOCAL // whole bar = gross premium
  if (stage === 'NWP') return seg === 'ceded' ? CEDED_MUTE : TEAL // retained highlighted, ceded muted
  if (seg === 'earned') return NEP_BLUE // earned highlighted
  return seg === 'mid' ? MUTE_NEAR : MUTE_FAR // remaining muted
}

function FlowTooltip({ active, payload, stage }: { active?: boolean; payload?: { payload?: FlowPoint }[]; stage: Stage }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  if (!d) return null
  const rows: { k: Stage | 'ceded'; label: string; value: number; color: string }[] = [
    { k: 'GWP', label: 'GWP · Written', value: d.gwp, color: FOCAL },
    { k: 'ceded', label: 'Ceded to reinsurers', value: d.gwp - d.nwp, color: RED },
    { k: 'NWP', label: 'NWP · Retained', value: d.nwp, color: TEAL },
    { k: 'NEP', label: 'NEP · Earned', value: d.nep, color: NEP_BLUE },
  ]
  return (
    <div className="rounded-lg border border-soft-border bg-card px-3 py-2 shadow-card">
      <p className="mb-1.5 text-[11px] font-semibold text-navy-deep">{d.period}</p>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className={['flex items-center justify-between gap-5 text-[11.5px]', r.k === stage ? 'font-semibold' : ''].join(' ')}>
            <span className="flex items-center gap-1.5 text-ink-secondary">
              <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />
              {r.label}
            </span>
            <span className="tabular-nums text-navy-deep">{fmtCr(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FlowView({ companyId, period }: { companyId: string; period: Period }) {
  const [stage, setStage] = useState<Stage>('GWP')
  const flow = getPremiumFlow(companyId, period)
  if (!flow) {
    return <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-4 py-10 text-center text-[12px] text-ink-secondary">Premium flow is not reported for this company.</div>
  }
  const data = flow.map((f) => ({ ...f, earned: f.nep, mid: Math.max(0, f.nwp - f.nep), ceded: Math.max(0, f.gwp - f.nwp) }))

  const makeLabel = (key: 'gwp' | 'nwp' | 'nep') => (props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
    const x = Number(props.x) || 0
    const y = Number(props.y) || 0
    const width = Number(props.width) || 0
    const v = props.index != null ? data[props.index]?.[key] : null
    if (v == null) return <g />
    return (
      <text x={x + width / 2} y={y - 5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#172B4D">
        {compactCr(Number(v))}
      </text>
    )
  }

  const caption =
    stage === 'GWP'
      ? 'Full gross premium written each year — the starting point.'
      : stage === 'NWP'
        ? 'Teal = premium retained · muted red = ceded to reinsurers.'
        : 'Steel = premium earned in the period · muted = retained but not yet earned.'

  return (
    <div>
      {/* Stage selector — same bar, highlight a different portion */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-soft-border bg-ice p-0.5">
          {STAGE_DEFS.map((s) => {
            const on = s.k === stage
            return (
              <button
                key={s.k}
                type="button"
                onClick={() => setStage(s.k)}
                className={['rounded-md px-3.5 py-1 text-[12px] font-semibold transition-all', on ? 'text-white shadow-soft' : 'text-ink-secondary hover:text-navy-primary'].join(' ')}
                style={on ? { background: s.color } : undefined}
              >
                {s.k}
              </button>
            )
          })}
        </div>
        <span className="text-[11px] text-ink-secondary">Same premium bar · highlighting <span className="font-semibold text-navy-deep">{stage}</span></span>
      </div>
      <ResponsiveContainer width="100%" height={288}>
        <BarChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 4 }} barCategoryGap="34%">
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
          <XAxis dataKey="period" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 12, fill: '#26303F', fontWeight: 600 }} dy={4} />
          <YAxis tickFormatter={axisCr} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} width={42} />
          <Tooltip cursor={{ fill: 'rgba(39,69,126,0.05)' }} content={<FlowTooltip stage={stage} />} />
          <Bar dataKey="earned" stackId="flow" fill={stageSegColor('earned', stage)} maxBarSize={44} isAnimationActive={false}>
            {stage === 'NEP' && <LabelList content={makeLabel('nep')} />}
          </Bar>
          <Bar dataKey="mid" stackId="flow" fill={stageSegColor('mid', stage)} maxBarSize={44} isAnimationActive={false}>
            {stage === 'NWP' && <LabelList content={makeLabel('nwp')} />}
          </Bar>
          <Bar dataKey="ceded" stackId="flow" fill={stageSegColor('ceded', stage)} maxBarSize={44} radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {stage === 'GWP' && <LabelList content={makeLabel('gwp')} />}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[11.5px] text-ink-secondary">{caption}</p>
    </div>
  )
}

// --- Mix tab: composition of premium -----------------------------------------

function MixTooltip({ active, payload, label, segments, view }: { active?: boolean; payload?: { dataKey?: string | number; value?: number }[]; label?: string; segments: { key: string; label: string }[]; view: MixView }) {
  if (!active || !payload?.length || !label) return null
  const byKey = new Map(payload.map((p) => [String(p.dataKey), p.value ?? 0]))
  return (
    <div className="rounded-lg border border-soft-border bg-card px-3 py-2 shadow-card">
      <p className="mb-1.5 text-[11px] font-semibold text-navy-deep">{label}</p>
      <div className="space-y-1">
        {[...segments].reverse().map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-5 text-[11.5px]">
            <span className="flex items-center gap-1.5 text-ink-secondary">
              <span className="h-2 w-2 rounded-sm" style={{ background: SEG_COLORS[s.key] ?? GREY }} />
              {s.label}
            </span>
            <span className="font-semibold tabular-nums text-navy-deep">
              {view === 'Share' ? pct(Number(byKey.get(s.key) ?? 0)) : fmtCr(Number(byKey.get(s.key) ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MixView({ companyId, period }: { companyId: string; period: Period }) {
  const [mixType, setMixType] = useState<MixType>('Customer')
  const [view, setView] = useState<MixView>('Share')

  const series: MixSeries | null =
    mixType === 'Customer' ? getCustomerMix(companyId, period) : mixType === 'Channel' ? getChannelMix(companyId, period) : getQualityMix(companyId, period)

  const gwp = getCompareSeries(companyId, 'gwp', period)

  const rows = useMemo(() => {
    if (!series) return []
    if (view === 'Share') return series.rows
    return series.rows.map((r, i) => {
      const out: Record<string, number | string> = { period: r.period }
      const g = gwp[i] ?? 0
      series.segments.forEach((seg) => {
        out[seg.key] = Math.round(((Number(r[seg.key]) || 0) / 100) * g)
      })
      return out
    })
  }, [series, view, gwp])

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <SegmentedControl<MixType> options={['Customer', 'Channel', 'Quality'] as MixType[]} value={mixType} onChange={setMixType} size="sm" />
        <SegmentedControl<MixView> label="View" options={['Share', 'Value'] as MixView[]} value={view} onChange={setView} size="sm" />
      </div>
      {!series ? (
        <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-4 py-10 text-center text-[12px] text-ink-secondary">
          {mixType} mix is not reported for this company — data pending.
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {series.segments.map((s) => (
              <LegendSwatch key={s.key} color={SEG_COLORS[s.key] ?? GREY}>
                {s.label}
              </LegendSwatch>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={252}>
            <BarChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 4 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
              <XAxis dataKey="period" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 12, fill: '#26303F', fontWeight: 600 }} dy={4} />
              <YAxis
                tickFormatter={view === 'Share' ? (v: number) => `${v}%` : axisCr}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: AXIS_TEXT }}
                width={42}
                domain={view === 'Share' ? [0, 100] : [0, 'auto']}
              />
              <Tooltip cursor={{ fill: 'rgba(39,69,126,0.05)' }} content={<MixTooltip segments={series.segments} view={view} />} />
              {series.segments.map((seg, idx) => (
                <Bar
                  key={seg.key}
                  dataKey={seg.key}
                  name={seg.label}
                  stackId="mix"
                  fill={SEG_COLORS[seg.key] ?? GREY}
                  maxBarSize={46}
                  isAnimationActive={false}
                  radius={idx === series.segments.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}

// --- Retention tab: policyholder cohort survival -----------------------------

function RetentionView({ companyId }: { companyId: string }) {
  const [view, setView] = useState<RetView>('Customers')
  const cohort = getRetentionCohort(companyId)
  if (!cohort) {
    return <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-4 py-10 text-center text-[12px] text-ink-secondary">Retention is not reported for this company — data pending.</div>
  }
  const nodeValue = (i: number) => {
    const n = cohort[i]
    if (view === 'Premium') return n.premium
    if (view === 'Renewal') return i === 0 ? 100 : (n.renewalPct ?? 0)
    return n.customers
  }
  const nodeLabel = (i: number) => {
    if (view === 'Renewal') return i === 0 ? 'Start' : pct(nodeValue(i), 0)
    if (view === 'Premium') return `₹${nodeValue(i).toFixed(0)}`
    return `${nodeValue(i).toFixed(0)}`
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <SegmentedControl<RetView> label="View" options={['Customers', 'Premium', 'Renewal'] as RetView[]} value={view} onChange={setView} size="sm" />
      </div>
      <div className="flex items-start">
        {cohort.map((n, i) => {
          const endpoint = i === cohort.length - 1
          return (
            <div key={n.year} className="contents">
              {i > 0 && (
                <div className="relative mt-7 h-0 flex-1">
                  <div className="border-t-2 border-dashed border-soft-border" />
                  {(() => {
                    const isDrop = view !== 'Renewal'
                    const drop = isDrop ? nodeValue(i) - nodeValue(i - 1) : cohort[i].renewalPct ?? 0
                    return (
                      <span
                        className="absolute left-1/2 -top-3 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ color: isDrop ? RED : TEAL, background: isDrop ? hexA(RED, 0.1) : hexA(TEAL, 0.1) }}
                      >
                        {isDrop ? `−${Math.abs(drop).toFixed(0)}` : `${drop.toFixed(0)}% renew`}
                      </span>
                    )
                  })()}
                </div>
              )}
              <div className="flex w-16 shrink-0 flex-col items-center">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full text-[13px] font-semibold text-white shadow-soft"
                  style={{ background: `linear-gradient(150deg, ${endpoint ? TEAL : FOCAL}, ${hexA(endpoint ? TEAL : FOCAL, 0.78)})`, opacity: i === 0 ? 1 : 0.96 }}
                >
                  {nodeLabel(i)}
                </div>
                <span className="mt-2 text-[11.5px] font-semibold text-navy-deep">{n.year}</span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-[12px] text-ink-secondary">
        Higher renewal means <span className="font-semibold" style={{ color: GOLD }}>more sticky premium</span>.
      </p>
    </div>
  )
}

// --- Module shell ------------------------------------------------------------

export function PremiumFlowQuality({ companies, focalId }: { companies: Insurer[]; focalId: string }) {
  const [tab, setTab] = useState<Tab>('Flow')
  const [period, setPeriod] = useState<Period>('Yearly')
  const [companyId, setCompanyId] = useState(focalId)

  useEffect(() => {
    if (!companies.some((c) => c.id === companyId)) {
      setCompanyId(companies.some((c) => c.id === focalId) ? focalId : (companies[0]?.id ?? focalId))
    }
  }, [companies, companyId, focalId])

  const company = companies.find((c) => c.id === companyId) ?? companies[0]
  const name = company?.shortName ?? 'Company'
  const periodLabel = period === 'Quarterly' ? 'Last 4 quarters' : 'FY21–FY25'
  const lastIdx = (period === 'Quarterly' ? compareQuarters.length : compareYears.length) - 1
  const headline = tab === 'Flow' ? 'From Gross Premium to Earned Premium' : tab === 'Mix' ? 'Where Premium Comes From' : 'How Sticky the Customer Base Is'
  const tabPhrase = tab === 'Flow' ? 'Premium conversion over time' : tab === 'Mix' ? 'Premium mix' : 'Customer retention'

  const chips = useMemo<Chip[]>(() => {
    if (!company) return []
    if (tab === 'Flow') {
      const flow = getPremiumFlow(company.id, period)
      if (!flow || flow.length < 2) return []
      const last = flow[flow.length - 1]
      const prev = flow[flow.length - 2]
      const ret = (last.nwp / last.gwp) * 100
      const dRet = ret - (prev.nwp / prev.gwp) * 100
      const earn = (last.nep / last.nwp) * 100
      const dEarn = earn - (prev.nep / prev.nwp) * 100
      const lbl = period === 'Quarterly' ? 'QoQ' : 'YoY'
      const trend = (d: number) => (Math.abs(d) < 0.3 ? `Stable ${lbl}` : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} pp ${lbl}`)
      return [
        { label: 'Retention Ratio', value: pct(ret), sub: 'NWP / GWP', note: trend(dRet), color: TEAL, icon: Repeat },
        { label: 'Earned Ratio', value: pct(earn), sub: 'NEP / NWP', note: trend(dEarn), color: NEP_BLUE, icon: BadgeCheck },
        { label: 'Leakage', value: fmtCr(last.gwp - last.nwp), sub: 'ceded to reinsurers', note: dRet > 0.1 ? 'Improving' : 'Watch', color: RED, icon: TrendingDown },
      ]
    }
    if (tab === 'Mix') {
      const ch = getChannelMix(company.id, period)
      const ql = getQualityMix(company.id, period)
      const out: Chip[] = []
      if (ch) {
        const lastRow = ch.rows[lastIdx]
        const firstRow = ch.rows[0]
        const largest = [...ch.segments].sort((a, b) => Number(lastRow[b.key]) - Number(lastRow[a.key]))[0]
        const bancaNow = Number(lastRow.banca)
        const rising = bancaNow > Number(firstRow.banca)
        out.push({ label: 'Largest Source', value: largest.label, sub: `${pct(Number(lastRow[largest.key]))} of GWP`, color: SEG_COLORS[largest.key] ?? FOCAL, icon: Layers })
        out.push({ label: 'Concentration Risk', value: `Banca ${pct(bancaNow)}`, sub: rising ? 'channel concentration' : 'easing vs start', note: rising ? 'Rising' : undefined, color: AMBER, icon: TrendingDown })
      }
      if (ql) out.push({ label: 'Renewal Strength', value: pct(Number(ql.rows[lastIdx].renewal)), sub: 'renewal premium share', color: TEAL, icon: Repeat })
      return out
    }
    const cohort = getRetentionCohort(company.id)
    if (!cohort) return []
    let maxDrop = 0
    let maxAt = 1
    for (let i = 1; i < cohort.length; i++) {
      const d = cohort[i - 1].customers - cohort[i].customers
      if (d > maxDrop) {
        maxDrop = d
        maxAt = i
      }
    }
    return [
      { label: 'Year-2 Retention', value: pct(cohort[1].customers), sub: 'of the Year-1 cohort', color: TEAL, icon: Repeat },
      { label: 'Long-term Stickiness', value: pct(cohort[3].customers), sub: 'remain at Year 4+', note: cohort[3].customers >= 75 ? 'Sticky book' : undefined, color: FOCAL, icon: BadgeCheck },
      { label: 'Drop-off Watch', value: `−${maxDrop.toFixed(0)} pp`, sub: `${cohort[maxAt - 1].year} → ${cohort[maxAt].year}`, color: RED, icon: TrendingDown },
    ]
  }, [tab, company, period, companies, lastIdx])

  const basis: string[] = useMemo(() => {
    const src = 'Source: IRDAI / company filing'
    const per = `Period: ${periodLabel}`
    if (tab === 'Flow') return ['Basis: GWP / NWP / NEP', per, src, period === 'Quarterly' ? 'Status: Derived from YTD where applicable' : 'Status: Reported / Derived']
    if (tab === 'Mix') return ['Basis: % of GWP', per, src, 'Status: Reported / Derived']
    return ['Basis: Renewal rate (proxy)', 'Cohort: indicative', src, 'Status: Derived']
  }, [tab, period, periodLabel])

  return (
    <div className="card-surface p-4 sm:p-5">
      {/* Controls: tabs + company + period (minimal, no extra dropdowns) */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-soft-border pb-3">
        <Tabs value={tab} onChange={setTab} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <CompanyMenu companies={companies} value={companyId} onChange={setCompanyId} />
          <SegmentedControl<Period> label="Period" options={['Yearly', 'Quarterly'] as Period[]} value={period} onChange={setPeriod} size="sm" />
        </div>
      </div>

      {/* Headline with gold accent + automatic period context */}
      <div className="mt-3.5 flex items-center gap-2.5">
        <span className="h-5 w-1.5 rounded-full" style={{ background: GOLD }} />
        <h3 className="font-display text-[18px] leading-tight text-navy-deep">{headline}</h3>
      </div>
      <p className="mt-1 pl-4 text-[12px] text-ink-secondary">
        <span className="font-semibold text-navy-deep">{name}</span> · <span className="font-semibold" style={{ color: GOLD }}>{periodLabel}</span> · {tabPhrase}
      </p>

      {/* Insight strip / cards */}
      {chips.length > 0 && <div className="mt-3.5">{tab === 'Flow' ? <SlimStrip chips={chips} /> : <InsightChips chips={chips} />}</div>}

      {/* Tab content */}
      <div className="mt-4">
        {tab === 'Flow' && company && <FlowView companyId={company.id} period={period} />}
        {tab === 'Mix' && company && <MixView companyId={company.id} period={period} />}
        {tab === 'Retention' && company && <RetentionView companyId={company.id} />}
      </div>

      {/* Basis tags */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-soft-border pt-3">
        {basis.map((b) => (
          <Pill key={b}>{b}</Pill>
        ))}
      </div>
    </div>
  )
}
