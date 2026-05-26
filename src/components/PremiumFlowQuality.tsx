import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BadgeCheck, ChevronDown, Coins, Layers, Repeat, Shield, TrendingDown } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import {
  getChannelMix,
  getCompareSeries,
  getCustomerMix,
  getQualityMix,
  getRetentionCohort,
} from '@/data/mockData'
import type { MixSeries } from '@/data/mockData'
import type { Insurer } from '@/data/types'

type Period = 'Quarterly' | 'Yearly'
type Tab = 'Flow' | 'Mix' | 'Retention'
type MixType = 'Customer' | 'Channel' | 'Quality'
type MixView = 'Share' | 'Value'
type RetView = 'Customers' | 'Premium' | 'Renewal'

// Color meaning: deep blue = core premium / focal, teal = retained / renewal /
// positive, amber = concentration watch, soft red = leakage / drop-off, gold =
// premium accent (used sparingly), grey = background / prior periods.
const FOCAL = '#27457E'
const TEAL = '#168E8E'
const NEP_BLUE = '#2F6E8F'
const AMBER = '#C2902F'
const RED = '#C8635A'
const GOLD = '#B68B3A'
const SLATE = '#64748B'
const LAV = '#6E7BD6'
const GREY = '#94A3B8'
const GRID = '#ECEFF5'
const AXIS_TEXT = '#6B7280'

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
const pct = (v: number, d = 0) => `${v.toFixed(d)}%`
const axisCr = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${v}`)
const lastIdx = 3

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
  icon: typeof Coins
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

// --- Flow tab: GWP → NWP → NEP premium journey across periods ----------------

function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex h-9 items-end gap-1" aria-hidden>
      {values.map((v, i) => (
        <div
          key={i}
          className="w-2.5 rounded-sm"
          style={{ height: `${Math.max(10, (v / max) * 100)}%`, background: i === values.length - 1 ? color : '#DCE2EC' }}
        />
      ))}
    </div>
  )
}

function FlowView({ companyId, period }: { companyId: string; period: Period }) {
  const gwpS = getCompareSeries(companyId, 'gwp', period).filter((v): v is number => v !== null)
  const nwpS = getCompareSeries(companyId, 'nwp', period).filter((v): v is number => v !== null)
  const nepS = getCompareSeries(companyId, 'nep', period).filter((v): v is number => v !== null)
  if (!gwpS.length || !nwpS.length || !nepS.length) {
    return <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-4 py-10 text-center text-[12px] text-ink-secondary">Premium flow is not reported for this company.</div>
  }
  const G = gwpS[gwpS.length - 1]
  const N = nwpS[nwpS.length - 1]
  const E = nepS[nepS.length - 1]
  const chg = (s: number[]) => (s.length >= 2 && s[s.length - 2] !== 0 ? ((s[s.length - 1] - s[s.length - 2]) / s[s.length - 2]) * 100 : null)
  const label = period === 'Quarterly' ? 'QoQ' : 'YoY'

  const stages = [
    { key: 'gwp', name: 'GWP', desc: 'Total written', value: G, series: gwpS, color: FOCAL, icon: Coins, chg: chg(gwpS) },
    { key: 'nwp', name: 'NWP', desc: 'Retained after reinsurance', value: N, series: nwpS, color: TEAL, icon: Shield, chg: chg(nwpS) },
    { key: 'nep', name: 'NEP', desc: 'Earned in the period', value: E, series: nepS, color: NEP_BLUE, icon: BadgeCheck, chg: chg(nepS) },
  ]
  const connectors = [
    { tone: TEAL, ratio: `${Math.round((N / G) * 100)}% retained`, leak: `−${fmtCr(G - N)} ceded to reinsurers` },
    { tone: NEP_BLUE, ratio: `${Math.round((E / N) * 100)}% earned`, leak: `−${fmtCr(N - E)} still unearned` },
  ]

  return (
    <div>
      {stages.map((s, i) => (
        <div key={s.key}>
          <div className="relative overflow-hidden rounded-xl2 border border-soft-border p-3" style={{ background: `linear-gradient(135deg, ${hexA(s.color, 0.07)}, transparent 70%)` }}>
            <span className="absolute left-0 top-0 h-full w-1" style={{ background: s.color }} />
            <div className="flex items-center justify-between gap-3 pl-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: hexA(s.color, 0.12), color: s.color }}>
                  <s.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-navy-deep">{s.name}</p>
                  <p className="truncate text-[11px] text-ink-secondary">{s.desc}</p>
                </div>
              </div>
              <MiniBars values={s.series} color={s.color} />
              <div className="shrink-0 text-right">
                <p className="font-display text-[18px] leading-none text-navy-deep">{fmtCr(s.value)}</p>
                {s.chg != null && (
                  <p className="mt-1 text-[11px] font-semibold" style={{ color: s.chg >= 0 ? TEAL : RED }}>
                    {s.chg >= 0 ? '+' : '−'}
                    {Math.abs(s.chg).toFixed(1)}% {label}
                  </p>
                )}
              </div>
            </div>
          </div>
          {i < connectors.length && (
            <div className="flex items-center justify-center gap-2 py-1.5 text-[11px]">
              <span className="rounded-full px-2 py-0.5 font-semibold" style={{ color: connectors[i].tone, background: hexA(connectors[i].tone, 0.1) }}>
                ↓ {connectors[i].ratio}
              </span>
              <span className="text-ink-secondary">{connectors[i].leak}</span>
            </div>
          )}
        </div>
      ))}
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
              <span key={s.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-secondary">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SEG_COLORS[s.key] ?? GREY }} />
                {s.label}
              </span>
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
  const [period, setPeriod] = useState<Period>('Quarterly')
  const [companyId, setCompanyId] = useState(focalId)

  useEffect(() => {
    if (!companies.some((c) => c.id === companyId)) {
      setCompanyId(companies.some((c) => c.id === focalId) ? focalId : (companies[0]?.id ?? focalId))
    }
  }, [companies, companyId, focalId])

  const company = companies.find((c) => c.id === companyId) ?? companies[0]
  const name = company?.shortName ?? 'Company'
  const periodLabel = period === 'Quarterly' ? 'Last 4 quarters' : 'FY22–FY25'
  const headline = tab === 'Flow' ? 'From Written Premium to Earned Premium' : tab === 'Mix' ? 'Where Premium Comes From' : 'How Sticky the Customer Base Is'
  const tabPhrase = tab === 'Flow' ? 'Premium flow' : tab === 'Mix' ? 'Premium mix' : 'Customer retention'

  const chips = useMemo<Chip[]>(() => {
    if (!company) return []
    if (tab === 'Flow') {
      const G = getCompareSeries(company.id, 'gwp', period)[lastIdx]
      const N = getCompareSeries(company.id, 'nwp', period)[lastIdx]
      const E = getCompareSeries(company.id, 'nep', period)[lastIdx]
      if (G == null || N == null || E == null) return []
      const peerRet = companies
        .map((c) => {
          const g = getCompareSeries(c.id, 'gwp', period)[lastIdx]
          const n = getCompareSeries(c.id, 'nwp', period)[lastIdx]
          return g && n ? (n / g) * 100 : null
        })
        .filter((x): x is number => x !== null)
        .sort((a, b) => a - b)
      const median = peerRet.length ? peerRet[Math.floor(peerRet.length / 2)] : null
      const ret = (N / G) * 100
      return [
        { label: 'Retention Ratio', value: pct(ret), sub: 'NWP / GWP', note: median != null ? (ret >= median ? 'Above peer median' : 'Below peer median') : undefined, color: TEAL, icon: Repeat },
        { label: 'Earned Ratio', value: pct((E / N) * 100), sub: 'NEP / NWP', color: NEP_BLUE, icon: BadgeCheck },
        { label: 'Premium Leakage', value: fmtCr(G - N), sub: 'ceded to reinsurers', color: RED, icon: TrendingDown },
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
  }, [tab, company, period, companies])

  const basis: string[] = useMemo(() => {
    const src = 'Source: IRDAI / company filing'
    const per = `Period: ${periodLabel}`
    if (tab === 'Flow') return ['Basis: GWP / NWP / NEP', per, src, period === 'Quarterly' ? 'Q4 FY25 = FY25 YTD − Q3 FY25 YTD' : 'FY25 reported / derived from annual source']
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
          <SegmentedControl<Period> label="Period" options={['Quarterly', 'Yearly'] as Period[]} value={period} onChange={setPeriod} size="sm" />
        </div>
      </div>

      {/* Headline with gold accent + automatic period context */}
      <div className="mt-3.5 flex items-center gap-2.5">
        <span className="h-5 w-1.5 rounded-full" style={{ background: GOLD }} />
        <h3 className="font-display text-[18px] leading-tight text-navy-deep">{headline}</h3>
      </div>
      <p className="mt-1 pl-4 text-[12px] text-ink-secondary">
        <span className="font-semibold text-navy-deep">{name}</span> · <span className="font-semibold" style={{ color: GOLD }}>{periodLabel}</span> · {tabPhrase}
        {period === 'Yearly' && tab === 'Flow' ? ' · year-on-year' : ''}
      </p>

      {/* Insight chips */}
      {chips.length > 0 && (
        <div className="mt-3.5">
          <InsightChips chips={chips} />
        </div>
      )}

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
