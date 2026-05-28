import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Customized, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
  insurers,
} from '@/data/mockData'
import type { FlowPoint, MixSeries, RetentionNode } from '@/data/mockData'
import { useFilters } from '@/state/filters'
import { EmptyState } from './EmptyState'
import { SourceTag } from './SourceTag'
import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'

type Period = 'Quarterly' | 'Yearly'
type Tab = 'Flow' | 'Mix' | 'Retention'
type Stage = 'GWP' | 'NWP' | 'NEP'
type MixType = 'Customer' | 'Channel' | 'Quality'
type MixView = 'Share' | 'Value'

// Color meaning (financial story): deep navy = written premium / foundation
// (GWP); rich teal = retained / healthy quality (NWP); muted terracotta =
// ceded / leakage / friction; steel blue = earned / realized (NEP); soft mist
// grey = inactive context. Mix-tab support colours stay as semantic accents.
const FOCAL = '#234A84'      // GWP — deep navy
const TEAL = '#148A87'       // NWP — rich teal
const NEP_BLUE = '#4D7EA8'   // NEP — steel blue
const AMBER = '#C2902F'
const RED = '#C97A6B'        // ceded / leakage — muted terracotta
const GOLD = '#B68B3A'
const GREEN = '#3F9B6B'
const SLATE = '#64748B'
const GREY = '#94A3B8'
const GRID = '#ECEFF5'
const AXIS_TEXT = '#6B7280'
// Inactive / muted segment fills for the Flow conversion bar (mist greys).
const MUTE_NEAR = '#D9E1EA'
const MUTE_FAR = '#E7ECF2'
const CEDED_MUTE = 'rgba(201, 122, 107, 0.32)'

// Elegant, professional segment palette shared by the Mix tab.
const SEG_COLORS: Record<string, string> = {
  retail: FOCAL,
  group: SLATE,
  banca: TEAL,
  agency: AMBER,
  broker: NEP_BLUE,
  direct: GREEN,
  other: GREY,
  renewal: TEAL,
  fresh: AMBER,
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
  note?: string
  color: string
}

/** Slim horizontal insight pills — the shared insight treatment for all tabs. */
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

// Loosened label-content props (Recharts types x/y/width as string|number).
type LabelProps = { x?: number | string; y?: number | string; width?: number | string; value?: number | string; index?: number }

// --- Flow tab: one premium bar per year, transitioning through stages --------

const STAGE_DEFS: { k: Stage; color: string }[] = [
  { k: 'GWP', color: FOCAL },
  { k: 'NWP', color: TEAL },
  { k: 'NEP', color: NEP_BLUE },
]

function stageSegColor(seg: 'earned' | 'mid' | 'ceded', stage: Stage): string {
  if (stage === 'GWP') return FOCAL
  if (stage === 'NWP') return seg === 'ceded' ? CEDED_MUTE : TEAL
  if (seg === 'earned') return NEP_BLUE
  return seg === 'mid' ? MUTE_NEAR : MUTE_FAR
}

function FlowTooltip({
  active,
  payload,
  stage,
  data,
}: {
  active?: boolean
  payload?: { payload?: FlowPoint }[]
  stage: Stage
  data?: FlowPoint[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  if (!d) return null
  const rows: { k: Stage | 'ceded'; label: string; value: number; color: string }[] = [
    { k: 'GWP', label: 'GWP · Written', value: d.gwp, color: FOCAL },
    { k: 'ceded', label: 'Ceded to reinsurers', value: d.gwp - d.nwp, color: RED },
    { k: 'NWP', label: 'NWP · Retained', value: d.nwp, color: TEAL },
    { k: 'NEP', label: 'NEP · Earned', value: d.nep, color: NEP_BLUE },
  ]
  // YoY row — always shown when a previous period exists.
  let yoy: { value: number; prev: FlowPoint } | null = null
  if (data && data.length > 1) {
    const idx = data.findIndex((p) => p.period === d.period)
    if (idx > 0) {
      const prev = data[idx - 1]
      const stageKey: 'gwp' | 'nwp' | 'nep' = stage === 'GWP' ? 'gwp' : stage === 'NWP' ? 'nwp' : 'nep'
      const prevV = prev[stageKey]
      const currV = d[stageKey]
      if (prevV > 0) yoy = { value: ((currV - prevV) / prevV) * 100, prev }
    }
  }
  const yoyColor = yoy ? (yoy.value >= 0 ? TEAL : RED) : ''
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
        {yoy && (
          <div className="mt-1 flex items-center justify-between gap-5 border-t border-soft-border pt-1 text-[11.5px] font-semibold">
            <span className="flex items-center gap-1.5 text-ink-secondary">
              <span className="h-2 w-2 rounded-sm" style={{ background: yoyColor }} />
              YoY growth · {stage} ({yoy.prev.period} → {d.period})
            </span>
            <span className="tabular-nums" style={{ color: yoyColor }}>
              {yoy.value >= 0 ? '+' : '−'}
              {Math.abs(yoy.value).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * RealFlowChart — minimal annual GWP / NWP / NEP bar chart sourced from
 * src/data/snapshots/insurer-annual-snapshot.json. Only renders bars that
 * have real values; missing series are simply absent (no synthesis).
 */
function RealFlowChart({
  rows,
  companyName,
}: {
  rows: Array<{ fiscal_year: string; gwp: number | null; nwp: number | null; nep: number | null }>
  companyName: string
}) {
  const data = rows.map((r) => ({
    period: r.fiscal_year,
    gwp: r.gwp ?? 0,
    nwp: r.nwp ?? 0,
    nep: r.nep ?? 0,
  }))
  const anyNwp = rows.some((r) => typeof r.nwp === 'number')
  const anyNep = rows.some((r) => typeof r.nep === 'number')
  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 4 }} barCategoryGap="22%" barGap={4}>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
          <XAxis dataKey="period" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 12, fill: '#26303F', fontWeight: 600 }} dy={4} />
          <YAxis tickFormatter={axisCr} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} width={42} />
          <Tooltip
            cursor={{ fill: 'rgba(39,69,126,0.05)' }}
            content={({ active, payload, label }) =>
              active && payload && payload.length ? (
                <div className="rounded-lg border border-soft-border bg-card px-3 py-2 shadow-card">
                  <p className="mb-1 text-[11px] font-semibold text-navy-deep">{label}</p>
                  {payload.map((p) => (
                    <div key={p.dataKey as string} className="flex items-center justify-between gap-4 text-[11.5px]">
                      <span className="flex items-center gap-1.5 text-ink-secondary">
                        <span className="h-2 w-2 rounded-sm" style={{ background: p.color as string }} />
                        {(p.name as string).toUpperCase()}
                      </span>
                      <span className="tabular-nums text-navy-deep">{fmtCr(Number(p.value))}</span>
                    </div>
                  ))}
                </div>
              ) : null
            }
          />
          <Bar dataKey="gwp" name="GWP" fill={FOCAL} maxBarSize={36} isAnimationActive={false} radius={[3, 3, 0, 0]} />
          {anyNwp && (
            <Bar dataKey="nwp" name="NWP" fill={TEAL} maxBarSize={36} isAnimationActive={false} radius={[3, 3, 0, 0]} />
          )}
          {anyNep && (
            <Bar dataKey="nep" name="NEP" fill={NEP_BLUE} maxBarSize={36} isAnimationActive={false} radius={[3, 3, 0, 0]} />
          )}
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[11.5px] text-ink-secondary">
        Navy = GWP (gross written). {anyNwp ? 'Teal = NWP (retained after reinsurance). ' : ''}
        {anyNep ? 'Steel = NEP (earned). ' : ''}
        {!anyNwp && `NWP / NEP per year for ${companyName} will fill in as ingest-company-disclosures.ts extracts more rows.`}
      </p>
      <div className="mt-2 flex justify-end">
        <SourceTag
          source="Company filing"
          confidence="high"
          period={`${data[0].period} → ${data[data.length - 1].period}`}
          provenance={{
            source_name: `${companyName} annual disclosures — verified per-year GWP`,
            source_url: 'https://transactions.nivabupa.com/pages/investor-relations.aspx',
          }}
        />
      </div>
    </div>
  )
}

// FlowView / MixView / RetentionView are intentionally retained — they will
// be re-mounted once per-period IRDAI / company-filing data is ingested.
// Exported to silence noUnusedLocals while the chart bodies are dark.
export function FlowView({ companyId, period }: { companyId: string; period: Period }) {
  const [stage, setStage] = useState<Stage>('GWP')
  const flow = getPremiumFlow(companyId, period)
  if (!flow) {
    return <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-4 py-10 text-center text-[12px] text-ink-secondary">Premium flow is not reported for this company.</div>
  }
  const data = flow.map((f) => ({ ...f, earned: f.nep, mid: Math.max(0, f.nwp - f.nep), ceded: Math.max(0, f.gwp - f.nwp) }))

  const makeLabel = (key: 'gwp' | 'nwp' | 'nep') => (props: LabelProps) => {
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
        ? 'Teal = premium retained · muted terracotta = ceded to reinsurers.'
        : 'Steel = premium earned in the period · muted = retained but not yet earned.'

  // YoY overlay — always rendered. Reads the top-most stacked bar geometry
  // from Recharts so the connector lands on the actual rendered bar tops
  // regardless of the active stage.
  const stageKey: 'gwp' | 'nwp' | 'nep' = stage === 'GWP' ? 'gwp' : stage === 'NWP' ? 'nwp' : 'nep'
  const YoyOverlay = (cprops: { formattedGraphicalItems?: { item?: { props?: { dataKey?: string } }; props?: { data?: { x?: number; y?: number; width?: number; height?: number }[] } }[] }) => {
    const items = cprops.formattedGraphicalItems ?? []
    // Walk the stack from outermost layer inward to find the first layer that
    // has non-zero height for each index — that's the top of each bar.
    const cededLayer = items.find((it) => it.item?.props?.dataKey === 'ceded')?.props?.data ?? []
    const midLayer = items.find((it) => it.item?.props?.dataKey === 'mid')?.props?.data ?? []
    const earnedLayer = items.find((it) => it.item?.props?.dataKey === 'earned')?.props?.data ?? []
    const tops: { x: number; y: number }[] = data.map((_, i) => {
      const c = cededLayer[i]
      const m = midLayer[i]
      const e = earnedLayer[i]
      const layer = c && (c.height ?? 0) > 0 ? c : m && (m.height ?? 0) > 0 ? m : e
      const x = (layer?.x ?? 0) + (layer?.width ?? 0) / 2
      const y = layer?.y ?? 0
      return { x, y }
    })
    const nodes: JSX.Element[] = []
    for (let i = 1; i < data.length; i++) {
      const prevV = data[i - 1][stageKey]
      const currV = data[i][stageKey]
      if (!prevV || prevV <= 0) continue
      const yoy = ((currV - prevV) / prevV) * 100
      const a = tops[i - 1]
      const b = tops[i]
      if (!a || !b) continue
      const mx = (a.x + b.x) / 2
      const my = Math.min(a.y, b.y) - 14
      const cy = Math.min(a.y, b.y) - 22 // gentle arc control point
      const positive = yoy >= 0
      const stroke = positive ? '#148A87' : '#C97A6B'
      const fill = positive ? 'rgba(20,138,135,0.10)' : 'rgba(201,122,107,0.12)'
      const text = positive ? '#0E6F6D' : '#A05A4B'
      const label = `${positive ? '+' : '−'}${Math.abs(yoy).toFixed(1)}%`
      // Pill geometry — sized to the label so short values aren't oversized.
      const labelW = Math.max(34, label.length * 6 + 8)
      const labelH = 16
      nodes.push(
        <g key={`yoy-${i}`} pointerEvents="none">
          <path
            d={`M ${a.x} ${a.y - 4} Q ${mx} ${cy} ${b.x} ${b.y - 4}`}
            stroke="#94A3B8"
            strokeOpacity={0.55}
            strokeWidth={1}
            strokeDasharray="3 3"
            fill="none"
          />
          <rect
            x={mx - labelW / 2}
            y={my - labelH / 2}
            width={labelW}
            height={labelH}
            rx={labelH / 2}
            ry={labelH / 2}
            fill={fill}
            stroke={stroke}
            strokeOpacity={0.55}
            strokeWidth={0.8}
          />
          <text
            x={mx}
            y={my + 4}
            textAnchor="middle"
            fontSize={10}
            fontWeight={700}
            fill={text}
          >
            {label}
          </text>
        </g>,
      )
    }
    return <g>{nodes}</g>
  }

  return (
    <div>
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
                // Active button: stage colour fill + subtle gold inset underline
                // as the "premium selected" accent.
                style={on ? { background: s.color, boxShadow: 'inset 0 -2px 0 0 #B68B3A, 0 1px 2px rgba(23,43,77,0.05)' } : undefined}
              >
                {s.k}
              </button>
            )
          })}
        </div>
        <span className="text-[11px] text-ink-secondary">
          Highlighting <span className="font-semibold text-navy-deep">{stage}</span> · YoY shown between bars
        </span>
      </div>
      <ResponsiveContainer width="100%" height={288}>
        <BarChart data={data} margin={{ top: 30, right: 8, left: 0, bottom: 4 }} barCategoryGap="34%">
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
          <XAxis dataKey="period" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 12, fill: '#26303F', fontWeight: 600 }} dy={4} />
          <YAxis tickFormatter={axisCr} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} width={42} />
          <Tooltip cursor={{ fill: 'rgba(39,69,126,0.05)' }} content={<FlowTooltip stage={stage} data={data} />} />
          <Bar dataKey="earned" stackId="flow" fill={stageSegColor('earned', stage)} maxBarSize={44} isAnimationActive={false}>
            {stage === 'NEP' && <LabelList content={makeLabel('nep')} />}
          </Bar>
          <Bar dataKey="mid" stackId="flow" fill={stageSegColor('mid', stage)} maxBarSize={44} isAnimationActive={false}>
            {stage === 'NWP' && <LabelList content={makeLabel('nwp')} />}
          </Bar>
          <Bar dataKey="ceded" stackId="flow" fill={stageSegColor('ceded', stage)} maxBarSize={44} radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {stage === 'GWP' && <LabelList content={makeLabel('gwp')} />}
          </Bar>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Customized component={YoyOverlay as any} />
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

export function MixView({ companyId, period }: { companyId: string; period: Period }) {
  const [mixType, setMixType] = useState<MixType>('Channel')
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
            <BarChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 4 }} barCategoryGap="32%">
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
                  maxBarSize={38}
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

// --- Retention tab: Customer Renewal & Stickiness ----------------------------

// Small flat renewal-rate progression (FY21 → FY25), latest highlighted teal.
function RenewalProgression({ companyId, period }: { companyId: string; period: Period }) {
  const series = getCompareSeries(companyId, 'renewalRate', period)
  const periods = period === 'Quarterly' ? compareQuarters : compareYears
  const pts: { period: string; v: number }[] = []
  periods.forEach((p, i) => {
    const v = series[i]
    if (v != null) pts.push({ period: p, v })
  })
  if (!pts.length) return null
  const last = pts.length - 1
  return (
    <div className="relative pt-1">
      <div className="absolute left-[10%] right-[10%] top-[7px] h-0.5 rounded-full bg-soft-border" />
      <div className="relative flex justify-between">
        {pts.map((d, i) => (
          <div key={d.period} className="flex flex-1 flex-col items-center">
            <span className="h-3.5 w-3.5 rounded-full ring-2 ring-card" style={{ background: i === last ? TEAL : FOCAL, opacity: i === last ? 1 : 0.4 }} />
            <span className="mt-2 text-[10px] text-ink-secondary">{d.period}</span>
            <span className="text-[11.5px] font-semibold" style={{ color: i === last ? TEAL : '#26303F' }}>
              {Math.round(d.v)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Hero: renewal rate as the primary metric, with the progression strip beside it.
function HeroRenewal({ companyId, period, rrFirst, rrLast, firstLabel, improving }: { companyId: string; period: Period; rrFirst: number; rrLast: number; firstLabel: string; improving: boolean }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl2 border border-soft-border p-4 shadow-soft sm:p-5"
      style={{ background: `linear-gradient(135deg, ${hexA(TEAL, 0.1)}, ${hexA(FOCAL, 0.05)} 55%, transparent)` }}
    >
      <span className="absolute left-0 top-0 h-full w-1.5" style={{ background: TEAL }} />
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pl-2">
        <div className="shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">Renewal Rate</p>
          <div className="mt-1 flex items-end gap-2">
            <span className="font-display text-[40px] leading-none text-navy-deep">{rrLast}%</span>
            {improving && (
              <span className="mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: TEAL, background: hexA(TEAL, 0.12) }}>
                ↑ Improving
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[12px] text-ink-secondary">
            Up from <span className="font-semibold" style={{ color: GOLD }}>{rrFirst}%</span> in {firstLabel}
          </p>
        </div>
        <div className="min-w-[220px] flex-1">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{period === 'Quarterly' ? 'Quarterly renewal' : 'Yearly renewal'}</p>
          <RenewalProgression companyId={companyId} period={period} />
        </div>
      </div>
    </div>
  )
}

// Secondary supporting visual: how many of 100 customers stay each year.
function StayPath({ cohort }: { cohort: RetentionNode[] }) {
  const cust = (i: number) => Math.round(cohort[i].customers)
  return (
    <div className="flex items-start">
      {cohort.map((n, i) => {
        const endpoint = i === cohort.length - 1
        return (
          <div key={n.year} className="contents">
            {i > 0 && (
              <div className="relative mt-6 h-0 flex-1">
                <div className="border-t-2 border-dashed border-soft-border" />
                <span
                  className="absolute left-1/2 -top-3 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ color: RED, background: hexA(RED, 0.1) }}
                >
                  −{Math.abs(cust(i) - cust(i - 1))}
                </span>
              </div>
            )}
            <div className="flex w-14 shrink-0 flex-col items-center">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full text-[12.5px] font-semibold text-white shadow-soft"
                style={{ background: `linear-gradient(150deg, ${endpoint ? TEAL : FOCAL}, ${hexA(endpoint ? TEAL : FOCAL, 0.78)})`, opacity: i === 0 ? 1 : 0.95 }}
              >
                {cust(i)}
              </div>
              <span className="mt-1.5 text-[11px] font-semibold text-navy-deep">{n.year}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function RetentionView({ companyId, period }: { companyId: string; period: Period }) {
  const cohort = getRetentionCohort(companyId)
  const rrSeries = getCompareSeries(companyId, 'renewalRate', period)
  const rrVals = rrSeries.filter((v): v is number => v != null)
  if (!cohort || !rrVals.length) {
    return <div className="rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-4 py-10 text-center text-[12px] text-ink-secondary">Retention is not reported for this company — data pending.</div>
  }
  const periods = period === 'Quarterly' ? compareQuarters : compareYears
  const rrFirst = Math.round(rrVals[0])
  const rrLast = Math.round(rrVals[rrVals.length - 1])
  const improving = rrLast > rrFirst
  const year4 = Math.round(cohort[cohort.length - 1].customers)
  const dropTotal = 100 - year4
  const pills: Chip[] = [
    { label: 'Year-4 Retained', value: `${year4} of 100`, color: TEAL },
    { label: 'Drop-off', value: `−${dropTotal}`, note: 'customers', color: RED },
    { label: 'Status', value: year4 >= 75 ? 'Sticky book' : 'Watch', color: FOCAL },
  ]

  return (
    <div className="space-y-4">
      {/* Primary: renewal rate hero + progression */}
      <HeroRenewal companyId={companyId} period={period} rrFirst={rrFirst} rrLast={rrLast} firstLabel={periods[0]} improving={improving} />

      {/* Secondary: customer stay path */}
      <div className="rounded-xl2 border border-soft-border bg-ice/40 p-4">
        <p className="text-[12px] font-semibold text-navy-deep">Customer Stay Path</p>
        <p className="mb-3 mt-0.5 text-[11.5px] text-ink-secondary">
          Out of 100 customers, <span className="font-semibold" style={{ color: TEAL }}>{year4}</span> remain by Year 4+.
        </p>
        <StayPath cohort={cohort} />
      </div>

      {/* Supporting summary pills */}
      <SlimStrip chips={pills} />
    </div>
  )
}

// --- Module shell ------------------------------------------------------------

export function PremiumFlowQuality({ focalId }: { focalId: string }) {
  const [tab, setTab] = useState<Tab>('Flow')
  const { period: globalPeriod } = useFilters()
  // Map global TimePeriod ('Annual' | 'Quarterly' | 'Monthly') to the internal
  // Period the chart speaks ('Yearly' | 'Quarterly'). Monthly is not supported
  // by the underlying premium series — gate it with an EmptyState below.
  const period: Period = globalPeriod === 'Quarterly' ? 'Quarterly' : 'Yearly'
  const periodUnavailable = globalPeriod === 'Monthly'

  const company = insurers.find((c) => c.id === focalId) ?? insurers[0]
  const name = company?.shortName ?? 'Company'
  const periodLabel = period === 'Quarterly' ? 'Last 4 quarters' : 'FY21–FY25'
  const lastIdx = (period === 'Quarterly' ? compareQuarters.length : compareYears.length) - 1
  const headline = tab === 'Flow' ? 'From Gross Premium to Earned Premium' : tab === 'Mix' ? 'Where Premium Comes From' : 'Customer Renewal & Stickiness'
  const tabPhrase =
    tab === 'Flow' ? 'Premium conversion over time' : tab === 'Mix' ? 'Premium composition over time' : 'Renewal performance and customer stay path'

  void useMemo<Chip[]>(() => {
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
        { label: 'Retention Ratio', value: pct(ret), note: trend(dRet), color: TEAL },
        { label: 'Earned Ratio', value: pct(earn), note: trend(dEarn), color: NEP_BLUE },
        { label: 'Leakage', value: fmtCr(last.gwp - last.nwp), note: dRet > 0.1 ? 'Improving' : 'Watch', color: RED },
      ]
    }
    if (tab === 'Mix') {
      const ch = getChannelMix(company.id, period)
      const ql = getQualityMix(company.id, period)
      const cm = getCustomerMix(company.id, period)
      const out: Chip[] = []
      if (ch) {
        const lastRow = ch.rows[lastIdx]
        const largest = [...ch.segments].sort((a, b) => Number(lastRow[b.key]) - Number(lastRow[a.key]))[0]
        out.push({ label: 'Largest Channel', value: largest.label, note: pct(Number(lastRow[largest.key])), color: SEG_COLORS[largest.key] ?? FOCAL })
      }
      if (ql) {
        const r = Number(ql.rows[lastIdx].renewal)
        out.push({ label: 'Renewal Share', value: pct(r), note: r >= 70 ? 'Strong' : r >= 60 ? 'Healthy' : 'Watch', color: TEAL })
      }
      if (cm) {
        const retailNow = Number(cm.rows[lastIdx].retail)
        const retailThen = Number(cm.rows[0].retail)
        out.push({ label: 'Retail Mix', value: pct(retailNow), note: retailNow > retailThen + 0.5 ? 'Improving' : 'Stable', color: FOCAL })
      }
      return out
    }
    // Retention renders its own hero + pills inside RetentionView.
    return []
  }, [tab, company, period, lastIdx])

  const basis: string[] = useMemo(() => {
    const src = 'Source: IRDAI / company filing'
    const per = `Period: ${periodLabel}`
    if (tab === 'Flow') return ['Basis: GWP / NWP / NEP', per, src, period === 'Quarterly' ? 'Status: Derived from YTD where applicable' : 'Status: Reported / Derived']
    if (tab === 'Mix') return ['Basis: % of GWP', per, src, 'Status: Reported / Derived']
    return ['Basis: Renewal rate proxy', per, src, 'Status: Proxy / Derived']
  }, [tab, period, periodLabel])

  return (
    <div className="card-surface p-4 sm:p-5">
      {/* Controls: tabs only — company & period come from the global header. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-soft-border pb-3">
        <Tabs value={tab} onChange={setTab} />
      </div>

      {/* Headline with gold accent + automatic period context (from header). */}
      <div className="mt-3.5 flex items-center gap-2.5">
        <span className="h-5 w-1.5 rounded-full" style={{ background: GOLD }} />
        <h3 className="font-display text-[18px] leading-tight text-navy-deep">{headline}</h3>
      </div>
      <p className="mt-1 pl-4 text-[12px] text-ink-secondary">
        <span className="font-semibold text-navy-deep">{name}</span> ·{' '}
        <span className="font-semibold" style={{ color: GOLD }}>{periodLabel}</span> · {tabPhrase}
      </p>

      {/* Slim insight strip removed — chips derived from mock anchors are
          intentionally hidden until per-period data is ingested. */}

      {/* Tab content — real annual GWP from snapshot when available;
          empty state only when no real rows exist for the company. */}
      <div className="mt-4">
        {(() => {
          if (periodUnavailable) {
            return (
              <EmptyState
                title="Monthly view not yet wired"
                body="Switch the period toggle in the header to Annual."
                height={300}
              />
            )
          }
          if (tab !== 'Flow') {
            return (
              <EmptyState
                title={`${tab} time-series not yet ingested for ${name}`}
                body={`${tab} per-${period.toLowerCase()} data needs IRDAI L-forms / NL-forms or monthly business figures. ingest-irdai-monthly.ts and ingest-company-disclosures.ts will populate these on the next scheduled run.`}
                height={300}
              />
            )
          }
          // Flow tab: render from real snapshot annual rows for this company.
          const rows = (annualSnapshot.data as Array<{
            company_id: string
            fiscal_year: string
            gwp: number | null
            nwp: number | null
            nep: number | null
          }>)
            .filter((r) => r.company_id === focalId && typeof r.gwp === 'number')
            .sort((a, b) => a.fiscal_year.localeCompare(b.fiscal_year))
          if (rows.length === 0) {
            return (
              <EmptyState
                title={`Annual premium history not yet ingested for ${name}`}
                body="ingest-company-disclosures.ts will populate per-year GWP / NWP / NEP from the company's annual report on the next scheduled run."
                height={300}
              />
            )
          }
          return <RealFlowChart rows={rows} companyName={name} />
        })()}
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
