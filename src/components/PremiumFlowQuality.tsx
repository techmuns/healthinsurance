import { useEffect, useMemo, useRef, useState } from 'react'
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
import { distributionEngineMix, DIST_CHANNELS } from '@/lib/distributionEngine'
import { formatRange, labelInRange } from '@/lib/dateRange'

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

/** Small leakage / ratio callout pill — the shared treatment for the
 *  contextual strip under the Premium Engine bars. */
function CalloutPill({ color, label, value, muted = false }: { color: string; label: string; value: string; muted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-soft-border bg-ice/60 px-2 py-1">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</span>
      <span className={['text-[12px] font-semibold tabular-nums', muted ? 'text-ink-secondary' : 'text-navy-deep'].join(' ')}>{value}</span>
    </span>
  )
}

/**
 * RealFlowChart — the Premium Engine "lens".
 *
 * One fixed-width, fixed-position bar per fiscal year whose FULL height is that
 * year's gross written premium (the GWP base). The stage toggle (Gross · GWP /
 * Retained · NWP / Earned · NEP) is a lens: the bar never moves or resizes —
 * only its fill changes. The strongly-coloured region recedes GWP → NWP → NEP
 * while the portion above fades to muted blue-grey leakage bands:
 *   • reinsurance leakage = GWP − NWP   (ceded to reinsurers)
 *   • timing leakage      = NWP − NEP   (unearned-premium movement)
 *
 * The value pill glides down with the fill (600ms ease-in-out) so the same
 * premium bar visibly reduces step by step; bands cross-fade their colour
 * (~520ms). Missing values are never zero — a year with no GWP renders a
 * hatched n/a placeholder, and a year missing the active metric renders a
 * muted "n/a" bar.
 *
 * Data semantics preserved: the flow uses the Revenue-Account gross premium
 * (passed in as `gwp`) so cession reads true, the 1/n `basisNote` still
 * surfaces, and the company-filing source stays in the footer.
 */
function RealFlowChart({
  rows,
  companyName,
  basisNote,
}: {
  rows: Array<{ fiscal_year: string; gwp: number | null; nwp: number | null; nep: number | null }>
  companyName: string
  basisNote?: string
}) {
  const [stage, setStage] = useState<Stage>('GWP')
  const [hover, setHover] = useState<number | null>(null)

  // Strong, on-brand fills per lens + calm muted blue-greys for leakage (never
  // red — leakage is friction, not a risk event). Reinsurance sits a touch
  // deeper than timing so the two leakage zones read as distinct in Earned view.
  const STRONG: Record<Stage, string> = { GWP: FOCAL, NWP: TEAL, NEP: NEP_BLUE }
  const MUTE_REINS = '#C79A48'
  const MUTE_TIMING = '#9AA6B6'

  const stageMeta: Record<Stage, { word: string; abbrev: Stage; meaning: string }> = {
    GWP: { word: 'Gross', abbrev: 'GWP', meaning: 'Total premium written during the year.' },
    NWP: { word: 'Retained', abbrev: 'NWP', meaning: 'Premium kept after reinsurance cession.' },
    NEP: { word: 'Earned', abbrev: 'NEP', meaning: 'Premium earned after unearned-premium movement.' },
  }
  const active = stageMeta[stage]
  const stageKey: 'gwp' | 'nwp' | 'nep' = stage === 'GWP' ? 'gwp' : stage === 'NWP' ? 'nwp' : 'nep'

  // Per-year computed record + back-walk to the previous *reported* year for YoY.
  const data = rows.map((r, i) => {
    const gwp = r.gwp
    const nwp = r.nwp
    const nep = r.nep
    const sel = r[stageKey]
    let prev: number | null = null
    let prevPeriod: string | null = null
    for (let j = i - 1; j >= 0; j--) {
      const v = rows[j][stageKey]
      if (v != null) {
        prev = v
        prevPeriod = rows[j].fiscal_year
        break
      }
    }
    const yoyPct = sel != null && prev != null && prev > 0 ? (sel / prev - 1) * 100 : null
    const reinsuranceLeakage = gwp != null && nwp != null ? gwp - nwp : null
    const timingLeakage = nwp != null && nep != null ? nwp - nep : null
    const retentionRatio = gwp != null && nwp != null && gwp > 0 ? (nwp / gwp) * 100 : null
    const earnedOnGross = gwp != null && nep != null && gwp > 0 ? (nep / gwp) * 100 : null
    return { period: r.fiscal_year, gwp, nwp, nep, sel, prevPeriod, yoyPct, reinsuranceLeakage, timingLeakage, retentionRatio, earnedOnGross }
  })

  const maxGwp = Math.max(1, ...data.map((d) => d.gwp ?? 0))
  const PLOT = 218 // px — height of the tallest (GWP) bar
  const stageReported = data.filter((d) => d.sel != null).length

  // The contextual callout follows the hovered year, else the latest reported.
  const latest = [...data].reverse().find((d) => d.gwp != null) ?? data[data.length - 1]
  const focus = hover != null && data[hover] ? data[hover] : latest

  return (
    <div>
      {/* Lens toggle + plain-English meaning of the active metric. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3">
        <div className="inline-flex items-center gap-1 rounded-full bg-ice p-0.5 ring-1 ring-soft-border">
          {(Object.keys(stageMeta) as Stage[]).map((s) => {
            const meta = stageMeta[s]
            const isActive = stage === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStage(s)}
                className={[
                  'flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold transition-all duration-200',
                  isActive ? 'bg-navy-primary text-white shadow-soft' : 'text-ink-secondary hover:text-navy-deep',
                ].join(' ')}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: isActive ? '#FFFFFF' : STRONG[s], opacity: isActive ? 0.9 : 0.75 }} />
                {meta.word}
                <span
                  className={['rounded px-1 py-px text-[9px] font-bold tracking-wider', isActive ? 'bg-white/20 text-white' : 'bg-soft-blue text-navy-primary/80'].join(' ')}
                >
                  {meta.abbrev}
                </span>
              </button>
            )
          })}
        </div>
        <div className="text-[10px] text-ink-secondary">
          {stageReported} of {data.length} yrs · <span className="font-semibold text-navy-deep">{active.meaning}</span>
        </div>
      </div>

      {/* Plot — fixed-position bars; only the fill changes between lenses. */}
      <div className="pt-8">
        <div className="relative flex items-end justify-between gap-2 border-b border-soft-border sm:gap-5" style={{ height: PLOT }}>
          {data.map((d, i) => {
            const hasGwp = d.gwp != null
            const dim = hover != null && hover !== i ? 0.82 : 1
            // Column body — bottom-aligned bar so all bars share one baseline.
            let body: JSX.Element
            if (!hasGwp) {
              body = (
                <div
                  className="w-full max-w-[68px] rounded-t-[5px] border border-dashed border-[#C7D2E0]"
                  style={{ height: 14, background: 'repeating-linear-gradient(45deg,#F4F7FC 0 4px,#E8EEF5 4px 8px)' }}
                  title="Data not available from source"
                />
              )
            } else if (d.sel == null) {
              // GWP exists but the active metric is not reported this year.
              const barH = (d.gwp! / maxGwp) * PLOT
              body = (
                <div
                  className="flex w-full max-w-[68px] items-center justify-center rounded-t-[5px] border border-dashed border-[#C7D2E0]"
                  style={{ height: barH, background: 'repeating-linear-gradient(45deg,#F4F7FC 0 5px,#E8EEF5 5px 10px)', opacity: dim, transition: 'opacity 200ms' }}
                  title="Data not available from source"
                >
                  <span className="text-[9px] italic text-ink-secondary">n/a</span>
                </div>
              )
            } else {
              const barH = (d.gwp! / maxGwp) * PLOT
              const nwpFrac = d.nwp != null ? d.nwp / d.gwp! : 1
              const nepFrac = d.nep != null ? d.nep / d.gwp! : nwpFrac
              const earnedH = barH * nepFrac
              const timingH = Math.max(0, barH * (nwpFrac - nepFrac))
              const reinsH = Math.max(0, barH * (1 - nwpFrac))
              const fillFrac = stage === 'GWP' ? 1 : stage === 'NWP' ? nwpFrac : nepFrac
              const fillH = barH * fillFrac
              const earnedColor = STRONG[stage]
              const timingColor = stage === 'GWP' ? STRONG.GWP : stage === 'NWP' ? STRONG.NWP : MUTE_TIMING
              const reinsColor = stage === 'GWP' ? STRONG.GWP : MUTE_REINS
              const bandTx = 'background-color 520ms ease-in-out'
              body = (
                <>
                  {/* Value pill — rides the top of the strong fill as the lens changes. */}
                  <div
                    className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-white/85 px-1.5 py-0.5 text-center shadow-[0_1px_3px_rgba(23,43,77,0.10)] ring-1 ring-black/[0.05] backdrop-blur-sm"
                    style={{ bottom: fillH, transition: 'bottom 600ms ease-in-out' }}
                  >
                    <div className="font-display text-[12px] leading-none text-navy-deep">{fmtCr(d.sel)}</div>
                    {d.yoyPct != null && (
                      <div className="mt-0.5 text-[9.5px] font-bold leading-none" style={{ color: d.yoyPct >= 0 ? GOLD : '#9C7430' }}>
                        {d.yoyPct >= 0 ? '+' : '−'}
                        {Math.abs(d.yoyPct).toFixed(0)}% YoY
                      </div>
                    )}
                  </div>
                  {/* The bar — three stacked bands; only colours animate per lens. */}
                  <div
                    className="flex w-full max-w-[68px] flex-col-reverse overflow-hidden rounded-t-[5px] ring-1 ring-inset ring-black/[0.05]"
                    style={{ height: barH, opacity: dim, transition: 'opacity 200ms' }}
                  >
                    <div style={{ height: earnedH, background: earnedColor, transition: bandTx }} />
                    <div style={{ height: timingH, background: timingColor, transition: bandTx }} />
                    <div style={{ height: reinsH, background: reinsColor, transition: bandTx }} />
                  </div>
                </>
              )
            }
            return (
              <div
                key={d.period}
                className="relative flex h-full flex-1 flex-col items-center justify-end"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {body}
              </div>
            )
          })}
        </div>
        {/* Period axis — honest labels; missing years flagged italic n/a. */}
        <div className="mt-2 flex justify-between gap-2 sm:gap-5">
          {data.map((d) => (
            <div key={d.period} className="flex-1 text-center">
              <div className="text-[11px] font-semibold text-navy-deep">{d.period}</div>
              {d.gwp == null && <div className="text-[9px] italic text-ink-secondary">n/a</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Contextual leakage + ratio callouts — follow the hovered year, else latest. */}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">{focus.period}</span>
        {stage === 'GWP' && (
          <>
            <CalloutPill color={FOCAL} label="Gross written" value={focus.gwp != null ? fmtCr(focus.gwp) : 'Data not available from source'} />
            <span className="text-[11px] italic text-ink-secondary">Full premium base — leakage is removed under Retained &amp; Earned.</span>
          </>
        )}
        {stage === 'NWP' && (
          <>
            <CalloutPill color={TEAL} label="Retention" value={focus.retentionRatio != null ? pct(focus.retentionRatio) : 'n/a'} />
            <CalloutPill
              color={MUTE_REINS}
              muted
              label="Reinsurance leakage"
              value={
                focus.reinsuranceLeakage != null
                  ? `${fmtCr(focus.reinsuranceLeakage)}${focus.retentionRatio != null ? ` · ${pct(100 - focus.retentionRatio)}` : ''}`
                  : 'Data not available from source'
              }
            />
          </>
        )}
        {stage === 'NEP' && (
          <>
            <CalloutPill color={NEP_BLUE} label="Earned / Gross" value={focus.earnedOnGross != null ? pct(focus.earnedOnGross) : 'n/a'} />
            <CalloutPill color={MUTE_REINS} muted label="Reinsurance leakage" value={focus.reinsuranceLeakage != null ? fmtCr(focus.reinsuranceLeakage) : 'Data not available from source'} />
            <CalloutPill color={MUTE_TIMING} muted label="Timing leakage" value={focus.timingLeakage != null ? fmtCr(focus.timingLeakage) : 'Data not available from source'} />
          </>
        )}
      </div>

      {stageReported === 0 && (
        <p className="mt-2 rounded-md bg-[#FBF3E2] px-2.5 py-1.5 text-[10.5px] text-[#8C6B1A]">
          {active.word} premium ({active.abbrev}) is not reported in the selected range. Switch the lens or widen the Data Range.
        </p>
      )}
      {basisNote && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-soft-border bg-ice/60 px-2.5 py-1.5 text-[10.5px] leading-snug text-ink-secondary">
          <span aria-hidden className="mt-px text-[11px] font-bold text-navy-primary/70">&#9432;</span>
          <span>{basisNote}</span>
        </p>
      )}

      {/* Single footer — legend + calc note + source. No duplicates. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-soft-border pt-2.5 text-[10.5px] text-ink-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: STRONG[stage] }} />
          {active.word} · <span className="font-bold tracking-wider text-navy-primary/80">{active.abbrev}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: MUTE_REINS }} />
          Reinsurance leakage
        </span>
        {stage === 'NEP' && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: MUTE_TIMING }} />
            Timing leakage
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3 rounded-sm border border-dashed border-[#C7D2E0] bg-[#F4F7FC]" />
          Data not available
        </span>
        <span>·</span>
        <span>Premium metrics, not profit</span>
        <span>·</span>
        <span>Leakage = GWP − NWP and NWP − NEP where available</span>
        <span>·</span>
        <span>Missing values are source unavailable, not zero</span>
        <span>·</span>
        <span>
          Source ·{' '}
          <a
            href="https://transactions.nivabupa.com/pages/doc/pub-dis/annual-reports/Annual-Report-FY-2024-25.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-navy-deep underline-offset-2 hover:underline"
            title={`${companyName} annual disclosures + live PDF parse — written / retained / earned premium per year`}
          >
            Company filing
          </a>
        </span>
      </div>
    </div>
  )
}

/**
 * RealMixChart — 100% stacked bar of channel mix per period sourced from
 * distributionEngineMix (Niva Bupa real filing values FY22–FY25, range-clipped
 * by the caller). Reads-only, no synthesis.
 */
const CHANNEL_COLORS_MIX: Record<string, string> = {
  Banca: FOCAL,
  Brokers: TEAL,
  Agents: NEP_BLUE,
  'Corporate Agents': GOLD,
  Direct: GREEN,
  Others: GREY,
}

function RealMixChart({
  rows,
  companyName,
}: {
  rows: Array<{ period: string; Banca: number; Brokers: number; Agents: number; 'Corporate Agents': number; Direct: number; Others: number }>
  companyName: string
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {DIST_CHANNELS.map((ch) => (
          <LegendSwatch key={ch} color={CHANNEL_COLORS_MIX[ch] ?? GREY}>
            {ch}
          </LegendSwatch>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={264}>
        <BarChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 4 }} barCategoryGap="32%">
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
          <XAxis dataKey="period" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 12, fill: '#26303F', fontWeight: 600 }} dy={4} />
          <YAxis tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} width={42} domain={[0, 100]} />
          <Tooltip
            cursor={{ fill: 'rgba(39,69,126,0.05)' }}
            content={({ active, payload, label }) =>
              active && payload && payload.length ? (
                <div className="rounded-lg border border-soft-border bg-card px-3 py-2 shadow-card">
                  <p className="mb-1 text-[11px] font-semibold text-navy-deep">{label}</p>
                  {[...payload].reverse().map((p) => (
                    <div key={p.dataKey as string} className="flex items-center justify-between gap-4 text-[11.5px]">
                      <span className="flex items-center gap-1.5 text-ink-secondary">
                        <span className="h-2 w-2 rounded-sm" style={{ background: p.color as string }} />
                        {p.name}
                      </span>
                      <span className="font-semibold tabular-nums text-navy-deep">{Number(p.value).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              ) : null
            }
          />
          {DIST_CHANNELS.map((ch, idx) => (
            <Bar
              key={ch}
              dataKey={ch}
              name={ch}
              stackId="mix"
              fill={CHANNEL_COLORS_MIX[ch] ?? GREY}
              maxBarSize={48}
              isAnimationActive={false}
              radius={idx === DIST_CHANNELS.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[11.5px] text-ink-secondary">
        Share of GWP by distribution channel for {companyName} — values from the
        annual report MD&A section.
      </p>
      <div className="mt-2 flex justify-end">
        <SourceTag
          source="Company filing"
          confidence="high"
          period={`${rows[0].period} → ${rows[rows.length - 1].period}`}
          provenance={{
            source_name: `${companyName} annual report — channel-mix table`,
            source_url: 'https://transactions.nivabupa.com/pages/doc/pub-dis/annual-reports/Annual-Report-FY-2024-25.pdf',
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

// Customer Renewal & Stickiness — a soft upward curve with a translucent teal
// area fill (no axis / grid / border). Each year is a clean point with its
// renewal % above it; the latest year is highlighted with a larger glowing teal
// point. On mount the line draws in and the points fade gently. Data-driven, so
// it follows the focal company's actual renewal series.
function RenewalProgression({ companyId, period }: { companyId: string; period: Period }) {
  const series = getCompareSeries(companyId, 'renewalRate', period)
  const periods = period === 'Quarterly' ? compareQuarters : compareYears
  const pts: { period: string; v: number }[] = []
  periods.forEach((p, i) => {
    const v = series[i]
    if (v != null) pts.push({ period: p, v })
  })

  const wrapRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (!pts.length) return null

  const H = 96
  const padX = 26
  const topY = 26
  const botY = 66
  const fillBottom = 84
  const n = pts.length
  const last = n - 1
  const vals = pts.map((d) => d.v)
  const vMin = Math.min(...vals)
  const vMax = Math.max(...vals)
  const span = vMax - vMin || 1
  const xOf = (i: number) => (n === 1 ? w / 2 : padX + ((w - 2 * padX) * i) / (n - 1))
  const yOf = (v: number) => topY + (botY - topY) * ((vMax - v) / span)
  const P = pts.map((d, i) => ({ x: xOf(i), y: yOf(d.v), v: d.v, period: d.period }))

  // Catmull-Rom → cubic bézier for a smooth curve through every point.
  let line = P.length ? `M ${P[0].x.toFixed(1)} ${P[0].y.toFixed(1)}` : ''
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] ?? P[i]
    const p1 = P[i]
    const p2 = P[i + 1]
    const p3 = P[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    line += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  const area = P.length >= 2 ? `${line} L ${P[last].x.toFixed(1)} ${fillBottom} L ${P[0].x.toFixed(1)} ${fillBottom} Z` : ''

  return (
    <div ref={wrapRef} className="relative" style={{ height: H }}>
      {w > 0 && P.length >= 2 && (
        <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className="overflow-visible">
          <defs>
            <linearGradient id="rrArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TEAL} stopOpacity={0.36} />
              <stop offset="55%" stopColor={TEAL} stopOpacity={0.13} />
              <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
            </linearGradient>
            <filter id="rrGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3.2" />
            </filter>
          </defs>

          {/* soft translucent teal area under the curve */}
          <path d={area} fill="url(#rrArea)" className="rr-area" />
          {/* soft teal glow tracing the line */}
          <path d={line} fill="none" stroke={TEAL} strokeWidth={4.5} strokeOpacity={0.22} strokeLinecap="round" filter="url(#rrGlow)" className="rr-area" />
          {/* the upward trend line — draws in on mount */}
          <path d={line} fill="none" stroke={TEAL} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="rr-line" />

          {P.map((p, i) => {
            const isLast = i === last
            return (
              <g key={p.period} className="rr-pt" style={{ animationDelay: `${0.5 + i * 0.12}s` }}>
                {isLast && <circle cx={p.x} cy={p.y} r={9} fill={TEAL} fillOpacity={0.22} filter="url(#rrGlow)" />}
                <circle cx={p.x} cy={p.y} r={isLast ? 5 : 3.4} fill={isLast ? TEAL : '#FFFFFF'} stroke={TEAL} strokeWidth={isLast ? 0 : 1.6} />
                <text x={p.x} y={p.y - 11} textAnchor="middle" fontSize={isLast ? 12.5 : 11} fontWeight={isLast ? 800 : 600} fill={isLast ? TEAL : '#26303F'}>
                  {Math.round(p.v)}%
                </text>
                <text x={p.x} y={H - 4} textAnchor="middle" fontSize={9.5} fill={AXIS_TEXT} opacity={0.85}>
                  {p.period}
                </text>
              </g>
            )
          })}
        </svg>
      )}
      <style>{`
        .rr-line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: rrDraw 1.05s cubic-bezier(0.4,0,0.2,1) forwards; }
        .rr-area { opacity: 0; animation: rrFade 0.9s ease 0.45s forwards; }
        .rr-pt { opacity: 0; animation: rrFade 0.5s ease forwards; }
        @keyframes rrDraw { to { stroke-dashoffset: 0; } }
        @keyframes rrFade { to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .rr-line, .rr-area, .rr-pt { animation: none; opacity: 1; stroke-dashoffset: 0; }
        }
      `}</style>
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
function StayPath({ cohort, benchmarkYear4 }: { cohort: RetentionNode[]; benchmarkYear4: number | null }) {
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
              {/* Ghost benchmark marker — only on the Year 4+ endpoint when a
                  peer benchmark is available. Dotted slate circle so it reads
                  as "reference", not "actual". */}
              {endpoint && benchmarkYear4 != null && (
                <div
                  className="mt-1 flex h-7 w-7 items-center justify-center rounded-full border border-dashed bg-white text-[10px] font-semibold text-ink-secondary"
                  style={{ borderColor: '#94A3B8' }}
                  title={`Peer median: ${benchmarkYear4} of 100`}
                >
                  {benchmarkYear4}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Walks the same cohort math as getRetentionCohort to project a Year-4+
// retained-customer count from a renewal-rate anchor. Lets us derive a peer
// benchmark from the median renewalRate of the focal company's peer group.
function projectYear4FromRenewal(r: number): number {
  const r2 = r / 100
  const r3 = Math.min(0.99, (r + (100 - r) * 0.2) / 100)
  const r4 = Math.min(0.99, (r + (100 - r) * 0.35) / 100)
  const c2 = 100 * r2
  const c3 = c2 * r3
  const c4 = c3 * r4
  return Math.round(c4)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const peerGroupLabel: Record<string, string> = {
  SAHI: 'SAHI peer',
  General: 'General peer',
  Life: 'Life peer',
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

  // Peer-median benchmark — exclude focal, require at least 2 peers in the
  // same group so the median is meaningful; otherwise mark as pending.
  const focal = insurers.find((i) => i.id === companyId)
  const peerGroup = focal?.peerGroup
  const peerRates = insurers
    .filter((i) => i.id !== companyId && i.peerGroup === peerGroup)
    .map((i) => i.renewalRate)
    .filter((v): v is number => typeof v === 'number' && v > 0)
  const peerMedianRR = peerRates.length >= 2 ? median(peerRates) : null
  const benchmarkYear4 = peerMedianRR != null ? projectYear4FromRenewal(peerMedianRR) : null
  const benchmarkLabel = peerGroup ? peerGroupLabel[peerGroup] ?? 'Peer' : 'Peer'

  // Classification per spec: ±5 = In line, +5+ = Sticky, −5+ = Weak retention.
  const delta = benchmarkYear4 != null ? year4 - benchmarkYear4 : null
  const status: { label: string; tone: 'positive' | 'navy' | 'negative' } =
    delta == null
      ? { label: year4 >= 75 ? 'Sticky book' : 'Watch', tone: year4 >= 75 ? 'positive' : 'navy' }
      : delta >= 5
        ? { label: 'Sticky book', tone: 'positive' }
        : delta <= -5
          ? { label: 'Weak retention', tone: 'negative' }
          : { label: 'In line with peers', tone: 'navy' }
  const explainer =
    delta == null
      ? null
      : delta >= 5
        ? 'Retention is above peer benchmark, suggesting better customer stickiness.'
        : delta <= -5
          ? 'Retention is below peer benchmark — customer stickiness lags peers.'
          : 'Retention sits in line with the peer benchmark.'

  const pills: Chip[] = [
    { label: 'Year-4 Retained', value: `${year4} of 100`, color: TEAL },
    { label: 'Drop-off', value: `−${dropTotal}`, note: 'customers', color: RED },
    {
      label: 'Status',
      value: status.label,
      note:
        delta != null
          ? `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} vs ${benchmarkLabel} benchmark`
          : 'benchmark pending',
      color: status.tone === 'positive' ? TEAL : status.tone === 'negative' ? RED : FOCAL,
    },
  ]

  return (
    <div className="space-y-4">
      {/* Primary: renewal rate hero + progression */}
      <HeroRenewal companyId={companyId} period={period} rrFirst={rrFirst} rrLast={rrLast} firstLabel={periods[0]} improving={improving} />

      {/* Secondary: customer stay path */}
      <div className="rounded-xl2 border border-soft-border bg-ice/40 p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[12px] font-semibold text-navy-deep">Customer Stay Path</p>
            <p className="mt-0.5 text-[11.5px] text-ink-secondary">
              Out of 100 customers, <span className="font-semibold" style={{ color: TEAL }}>{year4}</span> remain by Year 4+.
            </p>
          </div>
          {/* Benchmark chip — only when peer median is computable. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {benchmarkYear4 != null ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-white/70 px-2 py-0.5 text-[10.5px] text-ink-secondary">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#94A3B8', boxShadow: 'inset 0 0 0 1px #FFFFFF' }} />
                  {benchmarkLabel} median: <span className="font-semibold text-navy-deep">{benchmarkYear4} of 100</span>
                </span>
                {delta != null && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                    style={
                      delta >= 5
                        ? { background: hexA(TEAL, 0.12), color: '#0E6F6D', boxShadow: 'inset 0 0 0 1px rgba(22,142,142,0.30)' }
                        : delta <= -5
                          ? { background: hexA(RED, 0.12), color: '#9C463D', boxShadow: 'inset 0 0 0 1px rgba(201,122,107,0.30)' }
                          : { background: '#EEF1F7', color: '#475569', boxShadow: 'inset 0 0 0 1px #D2DAE6' }
                    }
                  >
                    {delta >= 0 ? '+' : '−'}{Math.abs(delta)} vs benchmark
                  </span>
                )}
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-white/70 px-2 py-0.5 text-[10.5px] italic text-ink-secondary">
                Peer benchmark pending
              </span>
            )}
          </div>
        </div>
        <StayPath cohort={cohort} benchmarkYear4={benchmarkYear4} />
        {explainer && (
          <p className="mt-3 text-[11.5px] leading-snug text-navy-deep/80">{explainer}</p>
        )}
      </div>

      {/* Supporting summary pills */}
      <SlimStrip chips={pills} />
    </div>
  )
}

// --- Module shell ------------------------------------------------------------

export function PremiumFlowQuality({ focalId }: { focalId: string }) {
  const [tab, setTab] = useState<Tab>('Flow')
  const { period: globalPeriod, range } = useFilters()
  // Dashboard-wide active window, in the current period's vocabulary
  // (FY22–FY25 / Q1 FY23–Q4 FY25 / Apr 2022–Mar 2025).
  const rangeLabel = formatRange(range, globalPeriod)
  // Map global TimePeriod ('Annual' | 'Quarterly' | 'Monthly') to the internal
  // Period the chart speaks ('Yearly' | 'Quarterly'). Monthly is not supported
  // by the underlying premium series — gate it with an EmptyState below.
  const period: Period = globalPeriod === 'Quarterly' ? 'Quarterly' : 'Yearly'
  const periodUnavailable = globalPeriod === 'Monthly'

  const company = insurers.find((c) => c.id === focalId) ?? insurers[0]
  const name = company?.shortName ?? 'Company'
  // Derive the period label from the actual snapshot rows we'll render for
  // this focal company — so "FY22–FY25" appears only if those rows exist.
  const annualRowsForFocal = (annualSnapshot.data as Array<{ company_id: string; fiscal_year: string; gwp: number | null }>)
    .filter((r) => r.company_id === focalId && typeof r.gwp === 'number')
    .map((r) => r.fiscal_year)
    .sort()
  const periodLabel =
    period === 'Quarterly'
      ? 'Last 4 quarters'
      : annualRowsForFocal.length > 0
        ? `${annualRowsForFocal[0]}–${annualRowsForFocal[annualRowsForFocal.length - 1]}`
        : 'Annual'
  const lastIdx = (period === 'Quarterly' ? compareQuarters.length : compareYears.length) - 1
  const headline =
    tab === 'Flow' ? 'Premium Engine: Gross → Retained → Earned' : tab === 'Mix' ? 'Where Premium Comes From' : 'Customer Renewal & Stickiness'
  const tabPhrase =
    tab === 'Flow' ? 'Premium conversion over time' : tab === 'Mix' ? 'Premium composition over time' : 'Renewal performance and customer stay path'
  // On the Flow lens the subtitle reflects the selected Data Range and the
  // conversion story; other tabs keep their period-derived context.
  const subPeriod = tab === 'Flow' || tab === 'Mix' ? rangeLabel : periodLabel
  const subTail = tab === 'Flow' ? 'How written premium converts into earned premium' : tabPhrase

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
        <span className="font-semibold" style={{ color: GOLD }}>{subPeriod}</span> · {subTail}
      </p>

      {/* Slim insight strip removed — chips derived from mock anchors are
          intentionally hidden until per-period data is ingested. */}

      {/* Tab content — real annual GWP from snapshot when available;
          empty state only when no real rows exist for the company. */}
      <div className="mt-4">
        {(() => {
          // Monthly isn't wired for Mix / Retention; the Flow tab falls through
          // to its own annual-only gate below so it gives a consistent message.
          if (periodUnavailable && tab !== 'Flow') {
            return (
              <EmptyState
                title="Monthly view not yet wired"
                body="Switch the period toggle in the header to Annual."
                height={300}
              />
            )
          }
          if (tab === 'Mix') {
            // Channel mix is reported annually (annual-report MD&A). Honour the
            // Period toggle: only Annual is supported here.
            if (globalPeriod !== 'Annual') {
              return (
                <EmptyState
                  title={`${globalPeriod} channel mix not reported`}
                  body={`${name}'s channel mix is reported annually in the annual-report MD&A. Switch Period to Annual.`}
                  height={300}
                />
              )
            }
            const allMix = distributionEngineMix[focalId] ?? []
            // Clip to the dashboard-wide Data Range and to full-year rows only
            // (drop interim periods like "9M FY26") — same rule the Flow tab uses,
            // so the bars always match the header years.
            const mixRows = allMix.filter((r) => /^FY\d{2}$/.test(r.period) && labelInRange(r.period, range))
            if (mixRows.length === 0) {
              return (
                <EmptyState
                  title={allMix.length ? 'Data not available from source' : `Channel mix not yet ingested for ${name}`}
                  body={allMix.length
                    ? `No channel-mix years for ${name} fall inside ${rangeLabel}. Widen the Data Range in the top bar.`
                    : `Channel-mix tables from ${name}'s annual report MD&A section will populate this view as ingest-distribution.ts extracts them.`}
                  height={300}
                />
              )
            }
            return <RealMixChart rows={mixRows} companyName={name} />
          }
          if (tab === 'Retention') {
            return <RetentionView companyId={focalId} period={period} />
          }
          // Flow tab is annual-only: the source reports GWP / NWP / NEP per
          // fiscal year, not per quarter or month. Honour the Period toggle by
          // showing an explicit "not reported" state instead of annual bars
          // under a quarterly/monthly header. (Monthly is already caught above.)
          if (globalPeriod !== 'Annual') {
            return (
              <EmptyState
                title={`${globalPeriod} premium flow not reported from source`}
                body={`Only annual GWP / NWP / NEP is reported for ${name}. Switch Period to Annual to see the Gross → Retained → Earned conversion; use the Data Range to narrow the years.`}
                height={300}
              />
            )
          }
          // Flow tab: render from real snapshot annual rows for this company.
          const allCompanyRows = (annualSnapshot.data as Array<{
            company_id: string
            fiscal_year: string
            gwp: number | null
            gross_direct_premium?: number | null
            nwp: number | null
            nep: number | null
          }>)
            .filter((r) => r.company_id === focalId && typeof r.gwp === 'number')
            .sort((a, b) => a.fiscal_year.localeCompare(b.fiscal_year))
          if (allCompanyRows.length === 0) {
            return (
              <EmptyState
                title={`Annual premium history not yet ingested for ${name}`}
                body="ingest-company-disclosures.ts will populate per-year GWP / NWP / NEP from the company's annual report on the next scheduled run."
                height={300}
              />
            )
          }
          // Clip to the dashboard-wide Data Range. Years outside the window are
          // never shown; if the window excludes every reported year, surface an
          // honest "not available from source" state rather than an empty axis.
          const annualRows = allCompanyRows.filter((r) => labelInRange(r.fiscal_year, range))
          if (annualRows.length === 0) {
            return (
              <EmptyState
                title="Data not available from source"
                body={`No reported premium years for ${name} fall inside ${rangeLabel}. Widen the Data Range in the top bar.`}
                height={300}
              />
            )
          }
          // The flow uses the Revenue-Account "Gross Direct Premium" when present,
          // so GWP→NWP→NEP stay one consistent basis (cession = GWP − NWP reads
          // true). Where that differs materially from the headline GWP — IRDAI's
          // 1/n long-term-premium rule, e.g. Niva Bupa FY25 — surface a compact
          // note so the wider written→retained gap isn't misread as reinsurance.
          // The headline `gwp` is left untouched for market-share / growth views.
          const oneByN = annualRows.filter(
            (r) =>
              typeof r.gross_direct_premium === 'number' &&
              typeof r.gwp === 'number' &&
              Math.abs(r.gwp - r.gross_direct_premium) > Math.max(50, r.gwp * 0.02),
          )
          const basisNote =
            oneByN.length === 1
              ? `${oneByN[0].fiscal_year} gross premium shown on the IRDAI 1/n basis (${fmtCr(oneByN[0].gross_direct_premium as number)}); headline GWP ${fmtCr(oneByN[0].gwp as number)}.`
              : oneByN.length > 1
                ? `${oneByN.map((r) => r.fiscal_year).join(', ')} gross premium shown on the IRDAI 1/n (Revenue-Account) basis; headline GWP differs.`
                : undefined
          const rows = annualRows.map((r) => ({
            ...r,
            gwp: typeof r.gross_direct_premium === 'number' ? r.gross_direct_premium : r.gwp,
          }))
          return <RealFlowChart rows={rows} companyName={name} basisNote={basisNote} />
        })()}
      </div>

      {/* Basis tags — the Flow chart renders its own compact basis row, so
          skip the duplicate in that case. */}
      {tab !== 'Flow' && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-soft-border pt-3">
          {basis.map((b) => (
            <Pill key={b}>{b}</Pill>
          ))}
        </div>
      )}
    </div>
  )
}
