import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  LabelList,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import {
  giPremiumAbsolute,
  giPremiumMix,
  healthCarrierShare,
} from '@/data/mockData'
import { useActiveCompany, useFilters, useRangeClip } from '@/state/filters'
import {
  getCompanyMarketBridge,
  getCompanyMarketEngineHeroSub,
  getCompanyTakeawayLine,
} from '@/lib/companyCopy'
import { usePeriodGate } from '@/lib/usePeriodGate'
import { EmptyState } from '@/components/EmptyState'
import { SourceTag } from '@/components/SourceTag'

// Default source-tag preset for Market Engine cards — UI currently reads
// from mockData.ts; will switch to IRDAI + GI Council snapshots when
// dataLayer migration lands.
const MARKET_SOURCE = {
  source: 'Derived from IRDAI' as const,
  confidence: 'medium' as const,
  provenance: {
    source_name: 'IRDAI flash figures (re-aggregated by CareRatings Non-Life Insurance Update, March 2025). Direct IRDAI handbook parse pending.',
    source_url: 'https://www.careratings.com/uploads/newsfiles/1745386639_Non-Life%20Insurance%20Update%20for%20March%202025.pdf',
    fetched_at: '2026-05-28',
  },
}

type ChartMode = 'Absolute Premium' | 'Mix %'

// Colour intentions for the Market Engine story:
//   Health / Niva / SAHI → highlighted teal+navy
//   Motor / Private      → muted slate
//   Others / PSU         → softest grey
const HEALTH = '#168E8E'
const NIVA = '#27457E'
const SAHI = '#27457E'
const PRIVATE = '#8C97A8'
const PSU = '#B7BFCC'
const MOTOR = '#94A3B5'
const OTHERS = '#CCD3DC'
const GRID = '#EEF1F7'
const AXIS = '#6B7280'

export function MarketLandscape() {
  return (
    <div className="space-y-5">
      <HeroCard />
      <MainChartBlock />
      <BridgeBlock />
      <TakeawayStrip />
    </div>
  )
}

// ─── 1. HERO CARD ──────────────────────────────────────────────────────────
function HeroCard() {
  const company = useActiveCompany()
  const heroSub = getCompanyMarketEngineHeroSub(company)
  return (
    <section className="relative overflow-hidden rounded-[1.4rem] border border-[#E4E8F0] bg-gradient-to-br from-[#F7FAFD] via-[#FBFCFD] to-[#F4F7FB] p-6 shadow-[0_2px_4px_rgba(23,43,77,0.04),0_18px_44px_rgba(23,43,77,0.08)] sm:p-7">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(182,139,58,0.10),transparent_65%)]" />
      <div className="pointer-events-none absolute -bottom-28 -left-16 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(22,142,142,0.08),transparent_65%)]" />

      <div className="relative grid items-center gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E7DCC4] bg-[#FBF3E2]/70 px-2.5 py-1">
              <Sparkles className="h-3 w-3 text-champagne-deep" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">
                Market Engine
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#BFE3E1] bg-teal-soft px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_6px_rgba(22,142,142,0.6)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal">
                Structural opportunity
              </span>
            </span>
          </div>
          <h1 className="mt-3 font-display text-[26px] leading-[1.18] tracking-tight text-navy-deep sm:text-[28px]">
            Health insurance is becoming the largest structural growth pool in
            general insurance.
          </h1>
          <p className="mt-2.5 max-w-xl text-[13.5px] leading-relaxed text-ink-secondary">
            {heroSub}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <KpiPill value="40.8%" label="Health share of GI premium" tone="teal" sub="FY26" />
          <KpiPill value="18.8%" label="Health premium CAGR" tone="navy" sub="FY15 – FY26" />
          <KpiPill value="32.7%" label="SAHI share of health" tone="gold" sub="FY26" />
        </div>
      </div>
      <div className="relative mt-4 flex justify-end">
        <SourceTag source={MARKET_SOURCE.source} confidence={MARKET_SOURCE.confidence} provenance={MARKET_SOURCE.provenance} period="FY26" />
      </div>
    </section>
  )
}

function KpiPill({
  value,
  label,
  sub,
  tone,
}: {
  value: string
  label: string
  sub: string
  tone: 'teal' | 'navy' | 'gold'
}) {
  const accent =
    tone === 'teal'
      ? {
          bar: '#168E8E',
          tint: 'bg-white text-teal ring-1 ring-[#BFE3E1]',
          text: 'text-teal',
          bg: 'linear-gradient(135deg, #F1F8F6 0%, #E1F2F1 100%)',
          border: '#BFE3E1',
          glow: 'rgba(22,142,142,0.18)',
        }
      : tone === 'gold'
        ? {
            bar: '#B68B3A',
            tint: 'bg-white text-champagne-deep ring-1 ring-[#EAD9B6]',
            text: 'text-champagne-deep',
            bg: 'linear-gradient(135deg, #FBF6EA 0%, #F4ECDB 100%)',
            border: '#EAD9B6',
            glow: 'rgba(182,139,58,0.20)',
          }
        : {
            bar: '#27457E',
            tint: 'bg-white text-navy-primary ring-1 ring-[#D6E2FA]',
            text: 'text-navy-primary',
            bg: 'linear-gradient(135deg, #F2F5FC 0%, #E6EEFA 100%)',
            border: '#D2DEF1',
            glow: 'rgba(49,90,169,0.20)',
          }
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border p-3.5 shadow-[0_1px_2px_rgba(23,43,77,0.03),0_6px_18px_rgba(23,43,77,0.05)] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_6px_rgba(23,43,77,0.06),0_14px_30px_rgba(23,43,77,0.10)]"
      style={{ background: accent.bg, borderColor: accent.border }}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent.bar }} />
      <span
        className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-70 blur-2xl transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: accent.glow }}
      />
      <div className="relative flex items-baseline justify-between pl-2">
        <p className={`font-display text-[22px] leading-none ${accent.text}`}>{value}</p>
        <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide shadow-soft ${accent.tint}`}>
          {sub}
        </span>
      </div>
      <p className="relative mt-2 pl-2 text-[11.5px] leading-snug text-navy-deep/80">{label}</p>
    </div>
  )
}

// ─── 2. MAIN CHART BLOCK ───────────────────────────────────────────────────
// "Premium Pool Shift Ribbon" — how the GI premium pool splits between Health,
// Motor and Others over time. Health is the highlighted (teal) band, Motor a
// muted blue-grey, Others the lightest grey. A short reported series (≤4 years)
// reads cleanest as 100% stacked columns; a longer one flows as a smooth mix
// ribbon. Health is anchored to the baseline so its growing slice reads first.
type Seg = 'Health' | 'Motor' | 'Others'

function numOrNull(v: number | string | null | undefined): number | null {
  return typeof v === 'number' ? v : null
}

function MainChartBlock() {
  const [mode, setMode] = useState<ChartMode>('Mix %')
  const gate = usePeriodGate()
  const isMix = mode === 'Mix %'
  const data = isMix ? giPremiumMix : giPremiumAbsolute
  const { data: clipped } = useRangeClip(data)
  const unit = isMix ? '%' : ' ₹k Cr'
  const lastIdx = clipped.length - 1
  // 3 reported years (or fewer, after a Data-Range clip) read best as clean 100%
  // stacked columns; a longer series flows as a smooth ribbon.
  const asBars = clipped.length <= 4

  const first = clipped[0]
  const last = clipped[lastIdx]

  // First→latest change per segment, in the active unit — percentage points in
  // Mix %, ₹k Cr in Absolute. null-safe: a missing endpoint stays null, never a
  // fabricated 0.
  const delta = (seg: Seg): number | null => {
    const a = numOrNull(first?.[seg])
    const b = numOrNull(last?.[seg])
    return a == null || b == null ? null : b - a
  }
  const fmtVal = (v: number | null) =>
    v == null ? 'n/a' : isMix ? `${v.toFixed(1)}%` : `₹${v.toFixed(0)}k`
  const fmtDelta = (v: number | null) => {
    if (v == null) return 'n/a'
    const sign = v >= 0 ? '+' : '−'
    return isMix ? `${sign}${Math.abs(v).toFixed(1)} pp` : `${sign}₹${Math.abs(v).toFixed(0)}k`
  }

  // Right-edge labels at the final reported year: segment name, latest value and
  // the first→latest delta — plus a "Largest growth pool" pin on Health. Recharts
  // hands us (x, y) at the top edge of each band/column; bars also expose `width`
  // (areas don't, so `width ?? 0` collapses to the area case).
  const endLabel = (seg: Seg, color: string, bold: boolean) =>
    (props: any) => {
      const { x, y, width, index, value } = props as {
        x?: number; y?: number; width?: number; index?: number; value?: number
      }
      if (index !== lastIdx || typeof x !== 'number' || typeof y !== 'number') return null
      const lx = x + (typeof width === 'number' ? width : 0) + 9
      const d = delta(seg)
      const deltaColor = d == null ? '#9AA3B2' : d >= 0 ? '#0E6F6D' : '#B06A5E'
      return (
        <g>
          <text x={lx} y={y + 11} fill={color} fontSize={11} fontWeight={bold ? 700 : 600} style={{ letterSpacing: 0.1 }}>
            {seg}
          </text>
          <text x={lx} y={y + 24} fill={color} fontSize={10.5} opacity={0.82} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {typeof value === 'number' ? fmtVal(value) : 'n/a'}
          </text>
          <text x={lx + 44} y={y + 24} fill={deltaColor} fontSize={10} fontWeight={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmtDelta(d)}
          </text>
          {seg === 'Health' && (
            <g transform={`translate(${lx}, ${y + 31})`}>
              <rect width={130} height={14} rx={7} fill="#E1F2F1" stroke="#BFE3E1" />
              <circle cx={7} cy={7} r={2.5} fill={HEALTH} />
              <text x={14} y={10.5} fill="#0E6F6D" fontSize={9} fontWeight={700} style={{ letterSpacing: 0.2 }}>
                LARGEST GROWTH POOL
              </text>
            </g>
          )}
        </g>
      )
    }

  // Investor read — crisp, specific to the active toggle, and honest to the real
  // numbers (in this series Others is the segment that loses share, not Motor).
  const read = (() => {
    if (!first || !last) return ''
    if (clipped.length < 2) {
      const h = numOrNull(last.Health)
      return isMix
        ? `In ${last.label}, Health is already the single largest slice of the GI premium pool${h != null ? ` at ${h.toFixed(1)}%` : ''}.`
        : `In ${last.label}, Health is the largest premium pool in general insurance${h != null ? `, at roughly ₹${h.toFixed(0)}k Cr` : ''}.`
    }
    const dH = delta('Health')
    const dO = delta('Others')
    return isMix
      ? `Health is gaining structural share of the GI premium pool — up ${fmtDelta(dH)} since ${first.label} — almost entirely at the expense of Others (${fmtDelta(dO)}), while Motor holds roughly steady.`
      : `Health is adding the most new premium of any GI pool — about ${fmtDelta(dH)} Cr since ${first.label} — while Others has stopped growing.`
  })()

  return (
    <section className="card-surface p-5 sm:p-6">
      {/* Strong card header — eyebrow + title + subtitle on the left, toggle pinned right.
          A hairline divider separates the header from the chart so the card no longer
          reads as a floating chart. */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#EEF1F7] pb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
            Pool Shift
          </p>
          <h2 className="mt-1.5 font-display text-[20px] leading-tight text-navy-deep">
            Where is the GI premium pool shifting?
          </h2>
          <p className="mt-1 text-[12px] text-ink-secondary">
            Health vs Motor vs Others · FY15 → FY26 · mock
          </p>
        </div>
        <ChartToggle value={mode} onChange={setMode} />
      </header>

      {!gate.ok ? (
        <EmptyState
          title="Data unavailable for this period"
          body={gate.reason ?? 'Switch the period toggle to Annual to see the GI pool shift.'}
          height={276}
        />
      ) : clipped.length === 0 ? (
        <EmptyState
          title="Data not available from source"
          body="No reported years fall inside the selected Data Range. Widen the range in the top bar."
          height={276}
        />
      ) : (
      <div style={{ width: '100%', height: 276 }}>
        <ResponsiveContainer width="100%" height="100%">
          {asBars ? (
            <BarChart data={clipped} margin={{ top: 8, right: 132, left: -4, bottom: 4 }} barCategoryGap="26%">
              <defs>
                <linearGradient id="healthBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#18A0A0" />
                  <stop offset="100%" stopColor="#147E7E" />
                </linearGradient>
                <linearGradient id="motorBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A6B2C2" />
                  <stop offset="100%" stopColor="#8E9BAD" />
                </linearGradient>
                <linearGradient id="othersBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D9DEE6" />
                  <stop offset="100%" stopColor="#C7CED8" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis
                tick={{ fontSize: 11, fill: AXIS }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                width={46}
                domain={isMix ? [0, 100] : [0, 'auto']}
                ticks={isMix ? [0, 25, 50, 75, 100] : undefined}
                unit={isMix ? '%' : ''}
              />
              <Tooltip cursor={{ fill: 'rgba(39,69,126,0.05)' }} content={<EngineTooltip unit={unit} highlight="Health" />} />
              {/* Health anchored to the baseline (rounded bottom); Others caps the
                  column (rounded top); Motor squared in the middle. */}
              <Bar dataKey="Health" stackId="1" fill="url(#healthBar)" maxBarSize={42} radius={[0, 0, 5, 5]}>
                <LabelList dataKey="Health" content={endLabel('Health', HEALTH, true)} />
              </Bar>
              <Bar dataKey="Motor" stackId="1" fill="url(#motorBar)" maxBarSize={42} radius={[0, 0, 0, 0]}>
                <LabelList dataKey="Motor" content={endLabel('Motor', '#6F7C90', false)} />
              </Bar>
              <Bar dataKey="Others" stackId="1" fill="url(#othersBar)" maxBarSize={42} radius={[5, 5, 0, 0]}>
                <LabelList dataKey="Others" content={endLabel('Others', '#7A8597', false)} />
              </Bar>
            </BarChart>
          ) : (
            <AreaChart data={clipped} margin={{ top: 8, right: 132, left: -4, bottom: 4 }}>
              <defs>
                <linearGradient id="healthRibbon" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={HEALTH} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={HEALTH} stopOpacity={0.22} />
                </linearGradient>
                <linearGradient id="motorRibbon" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={MOTOR} stopOpacity={0.34} />
                  <stop offset="100%" stopColor={MOTOR} stopOpacity={0.14} />
                </linearGradient>
                <linearGradient id="othersRibbon" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={OTHERS} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={OTHERS} stopOpacity={0.16} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis
                tick={{ fontSize: 11, fill: AXIS }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                width={46}
                domain={isMix ? [0, 100] : [0, 'auto']}
                ticks={isMix ? [0, 25, 50, 75, 100] : undefined}
                unit={isMix ? '%' : ''}
              />
              <Tooltip cursor={{ stroke: '#27457E', strokeOpacity: 0.18, strokeWidth: 1 }} content={<EngineTooltip unit={unit} highlight="Health" />} />
              {/* Health anchored to the baseline as the highlighted ribbon. */}
              <Area type="natural" dataKey="Health" stackId="1" stroke={HEALTH} strokeWidth={2.2} fill="url(#healthRibbon)">
                <LabelList dataKey="Health" content={endLabel('Health', HEALTH, true)} />
              </Area>
              <Area type="natural" dataKey="Motor" stackId="1" stroke={MOTOR} strokeWidth={1.2} fill="url(#motorRibbon)">
                <LabelList dataKey="Motor" content={endLabel('Motor', '#6F7C90', false)} />
              </Area>
              <Area type="natural" dataKey="Others" stackId="1" stroke={OTHERS} strokeWidth={1.2} fill="url(#othersRibbon)">
                <LabelList dataKey="Others" content={endLabel('Others', '#7A8597', false)} />
              </Area>
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
      )}

      {gate.ok && clipped.length > 0 && <AiRead text={read} />}
      <div className="mt-3 flex justify-end">
        <SourceTag source={MARKET_SOURCE.source} confidence={MARKET_SOURCE.confidence} provenance={MARKET_SOURCE.provenance} period="FY15 → FY26" />
      </div>
    </section>
  )
}

function ChartToggle({ value, onChange }: { value: ChartMode; onChange: (v: ChartMode) => void }) {
  const opts: ChartMode[] = ['Absolute Premium', 'Mix %']
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-ice p-0.5">
      {opts.map((o) => {
        const active = o === value
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={active}
            className={[
              'rounded-full px-3 py-1 text-[11.5px] font-medium transition-all duration-200',
              active
                ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white shadow-soft ring-1 ring-[#1B3260]'
                : 'text-ink-secondary hover:bg-soft-blue hover:text-navy-primary',
            ].join(' ')}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

// Compact, horizontal multi-series tooltip — calm, no jumpy animation.
function EngineTooltip({
  active,
  payload,
  label,
  unit,
  highlight,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  unit: string
  highlight?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-xl border border-[#E5E8EF] bg-white/96 px-3 py-2 shadow-[0_8px_22px_rgba(23,43,77,0.1)] backdrop-blur">
      <p className="mb-1 text-[11px] font-semibold text-navy-deep">{label}</p>
      <div className="flex items-center gap-3">
        {payload
          .slice()
          .reverse()
          .map((p) => (
            <div
              key={p.name}
              className={`flex items-center gap-1.5 ${p.name === highlight ? 'font-semibold text-navy-deep' : 'text-ink-secondary'}`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="text-[10.5px] uppercase tracking-wide">{p.name}</span>
              <span className="text-[11.5px] tabular-nums">
                {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
                {unit.trim() === '%' ? '%' : ` ${unit.trim()}`}
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}

function AiRead({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-[#E1F2F1] bg-[#F2FAF9] px-3 py-1.5">
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-teal/15 text-teal">
        <Sparkles className="h-2.5 w-2.5" />
      </span>
      <p className="text-[12px] leading-snug text-navy-deep">
        <span className="font-semibold">AI read · </span>
        {text}
      </p>
    </div>
  )
}

// ─── 3. BOTTOM BRIDGE BLOCK ────────────────────────────────────────────────
function BridgeBlock() {
  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <SahiShiftCard />
      <CompanyBridgeCard />
    </section>
  )
}

// Three-line trend — SAHI highlighted (thicker navy), Private muted slate,
// PSU lightest grey. Right-side end labels make the up/down story instant.
function SahiShiftCard() {
  const data = healthCarrierShare
  const { data: clipped } = useRangeClip(data)
  const lastIdx = clipped.length - 1
  const gate = usePeriodGate()

  const seriesLabel = (name: 'SAHI' | 'Private' | 'PSU', color: string, bold: boolean) =>
    (props: any) => {
      const { x, y, index, value } = props as { x?: number; y?: number; index?: number; value?: number }
      if (index !== lastIdx || typeof x !== 'number' || typeof y !== 'number') return null
      return (
        <g>
          <text x={x + 8} y={y + 4} fill={color} fontSize={11} fontWeight={bold ? 700 : 600}>
            {name}
          </text>
          <text x={x + 8} y={y + 16} fill={color} fontSize={10} opacity={0.8}>
            {typeof value === 'number' ? `${value.toFixed(1)}%` : ''}
          </text>
        </g>
      )
    }

  return (
    <div className="card-surface p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-[#EEF1F7] pb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
            Inside Health
          </p>
          <h3 className="mt-1 font-display text-[16px] leading-tight text-navy-deep">
            Specialist insurers are gaining relevance
          </h3>
          <p className="mt-0.5 text-[11.5px] text-ink-secondary">
            Share of health premium by carrier type · FY18 → FY26
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#D6E2FA] bg-soft-blue px-2 py-0.5 text-[10px] font-semibold text-navy-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-navy-primary" />
          SAHIs gaining share
        </span>
      </header>

      {!gate.ok ? (
        <EmptyState
          title="Data unavailable for this period"
          body={gate.reason ?? 'Carrier-share series is annual-only.'}
          height={196}
        />
      ) : clipped.length === 0 ? (
        <EmptyState
          title="Data not available from source"
          body="No reported years fall inside the selected Data Range. Widen the range in the top bar."
          height={196}
        />
      ) : (
      <div style={{ width: '100%', height: 196 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={clipped} margin={{ top: 6, right: 64, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10.5, fill: AXIS }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis
              tick={{ fontSize: 10.5, fill: AXIS }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              width={36}
              domain={[15, 50]}
              ticks={[20, 30, 40, 50]}
              unit="%"
            />
            <Tooltip
              cursor={{ stroke: '#27457E', strokeOpacity: 0.15 }}
              content={<EngineTooltip unit="%" highlight="SAHI" />}
            />
            <Line
              type="monotone"
              dataKey="PSU"
              stroke={PSU}
              strokeWidth={1.6}
              dot={false}
              activeDot={{ r: 3.5 }}
            >
              <LabelList dataKey="PSU" content={seriesLabel('PSU', '#7A8597', false)} />
            </Line>
            <Line
              type="monotone"
              dataKey="Private"
              stroke={PRIVATE}
              strokeWidth={1.6}
              dot={false}
              activeDot={{ r: 3.5 }}
            >
              <LabelList dataKey="Private" content={seriesLabel('Private', '#6F7C90', false)} />
            </Line>
            <Line
              type="monotone"
              dataKey="SAHI"
              stroke={SAHI}
              strokeWidth={2.8}
              dot={{ r: 3, fill: SAHI, strokeWidth: 0 }}
              activeDot={{ r: 4.5 }}
            >
              <LabelList dataKey="SAHI" content={seriesLabel('SAHI', SAHI, true)} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}

      <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
        Within health, standalone health insurers are steadily gaining
        relevance as the market shifts away from PSU dominance.
      </p>
      <div className="mt-2 flex justify-end">
        <SourceTag source={MARKET_SOURCE.source} confidence={MARKET_SOURCE.confidence} provenance={MARKET_SOURCE.provenance} period="FY18 → FY26" />
      </div>
    </div>
  )
}

function CompanyBridgeCard() {
  const company = useActiveCompany()
  const { peerGroup } = useFilters()
  const gate = usePeriodGate()
  const bridge = getCompanyMarketBridge(company, peerGroup)

  const trajectory = bridge.trajectory
  const firstShare = trajectory[0].share
  const lastShare = trajectory[trajectory.length - 1].share
  const firstLabel = trajectory[0].label
  const lastLabel = trajectory[trajectory.length - 1].label

  const badgeClass =
    bridge.badgeTone === 'teal'
      ? 'bg-teal-soft text-teal'
      : bridge.badgeTone === 'warning'
        ? 'bg-champagne-soft text-champagne-deep'
        : 'bg-soft-blue text-navy-primary'

  return (
    <div className="card-surface relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(39,69,126,0.06),transparent_70%)]" />

      <header className="relative mb-3 flex items-start justify-between gap-2 border-b border-[#EEF1F7] pb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
            Bridge
          </p>
          <h3 className="mt-1 font-display text-[16px] leading-tight text-navy-deep">
            {bridge.title}
          </h3>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
          <ArrowUpRight className="h-3 w-3" />
          {bridge.badge}
        </span>
      </header>

      <div className="relative grid grid-cols-2 gap-2.5">
        {bridge.chips.map((c) => (
          <MetricMini key={c.label} value={c.value} label={c.label} tone={c.tone} />
        ))}
      </div>

      <div
        className="relative mt-4 overflow-hidden rounded-xl border border-[#EAD9B6] px-3 pb-2 pt-2.5"
        style={{ background: 'linear-gradient(135deg, #FBF6EA 0%, #FFFFFF 60%, #F1F8F6 100%)' }}
      >
        <span
          className="pointer-events-none absolute -right-10 -bottom-10 h-24 w-24 rounded-full opacity-50 blur-2xl"
          style={{ background: 'rgba(182,139,58,0.18)' }}
        />
        <div className="relative mb-1 flex items-baseline justify-between">
          <p className="text-[11px] font-semibold text-navy-deep">
            {bridge.miniTitle}
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-champagne-soft px-1.5 py-0.5 text-[10px] font-semibold text-champagne-deep">
            <ArrowUpRight className="h-2.5 w-2.5" />
            {company.marketShareChange >= 0 ? '+' : ''}
            {Math.round(company.marketShareChange * 100)} bps
          </span>
        </div>
        {!gate.ok ? (
          <EmptyState
            title="Data unavailable for this period"
            body={gate.reason ?? 'Switch to Annual to see the share trajectory.'}
            height={104}
          />
        ) : (
        <div style={{ width: '100%', height: 104 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trajectory} margin={{ top: 16, right: 36, left: 28, bottom: 0 }}>
              <defs>
                <linearGradient id="nivaLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={NIVA} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={HEALTH} stopOpacity={1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: AXIS }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
              />
              <YAxis hide domain={['dataMin - 0.5', 'dataMax + 0.7']} />
              <Tooltip
                cursor={{ stroke: NIVA, strokeOpacity: 0.2 }}
                content={({ active, payload, label }) =>
                  active && payload && payload[0] ? (
                    <div className="rounded-lg border border-[#E5E8EF] bg-white px-2.5 py-1.5 shadow-md">
                      <p className="text-[10px] font-semibold text-navy-deep">{label}</p>
                      <p className="text-[11px] tabular-nums text-navy-primary">
                        {Number(payload[0].value).toFixed(2)}%
                      </p>
                    </div>
                  ) : null
                }
              />
              <Line
                type="monotone"
                dataKey="share"
                stroke="url(#nivaLine)"
                strokeWidth={2.4}
                // Endpoints (FY23 / FY26) render as solid navy dots; the two
                // intermediate years use a lighter, smaller dot so the eye lands
                // on the start-to-finish gain.
                dot={(props) => {
                  const { cx, cy, index } = props as { cx?: number; cy?: number; index?: number }
                  if (cx == null || cy == null) return <g />
                  const isEnd = index === 0 || index === trajectory.length - 1
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isEnd ? 4.5 : 2.4}
                      fill={isEnd ? NIVA : '#B7C2D6'}
                      stroke={isEnd ? '#FFFFFF' : undefined}
                      strokeWidth={isEnd ? 1.5 : 0}
                    />
                  )
                }}
                activeDot={{ r: 5 }}
              />
              {/* Anchor labels for the FY23 start and FY26 end of the bridge. */}
              <ReferenceDot x={firstLabel} y={firstShare} r={0} ifOverflow="extendDomain">
                <Label
                  value={`${firstShare.toFixed(2)}%`}
                  position="top"
                  offset={10}
                  fill="#6B7280"
                  fontSize={10}
                  fontWeight={600}
                />
              </ReferenceDot>
              <ReferenceDot x={lastLabel} y={lastShare} r={0} ifOverflow="extendDomain">
                <Label
                  value={`${lastShare.toFixed(2)}%`}
                  position="top"
                  offset={10}
                  fill={NIVA}
                  fontSize={11}
                  fontWeight={700}
                />
              </ReferenceDot>
            </LineChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
        {bridge.closingLine}
      </p>
      <div className="relative mt-2 flex justify-end">
        <SourceTag source="Derived from IRDAI" confidence="medium" period="FY23 → FY26" provenance={{ source_name: 'Retail share trajectory derived from real FY25 GWP + marketShareChange in insurers[]', source_url: 'https://www.careratings.com/uploads/newsfiles/1745386639_Non-Life%20Insurance%20Update%20for%20March%202025.pdf' }} />
      </div>
    </div>
  )
}

function MetricMini({
  value,
  label,
  tone,
}: {
  value: string
  label: string
  tone: 'teal' | 'navy' | 'gold'
}) {
  const meta =
    tone === 'teal'
      ? {
          bar: '#168E8E',
          text: 'text-teal',
          bg: 'linear-gradient(135deg, #F4FAF8 0%, #E8F4F1 100%)',
          border: '#C8E2DD',
          glow: 'rgba(22,142,142,0.18)',
        }
      : tone === 'gold'
        ? {
            bar: '#B68B3A',
            text: 'text-champagne-deep',
            bg: 'linear-gradient(135deg, #FDF8EC 0%, #F4ECDB 100%)',
            border: '#EAD9B6',
            glow: 'rgba(182,139,58,0.20)',
          }
        : {
            bar: '#27457E',
            text: 'text-navy-primary',
            bg: 'linear-gradient(135deg, #F4F7FC 0%, #E6EEFA 100%)',
            border: '#D2DEF1',
            glow: 'rgba(49,90,169,0.18)',
          }
  return (
    <div
      className="group relative overflow-hidden rounded-xl border px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(23,43,77,0.09)]"
      style={{ background: meta.bg, borderColor: meta.border }}
    >
      <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: meta.bar }} />
      <span
        className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-0 blur-2xl transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: meta.glow }}
      />
      <p className={`relative font-display text-[17px] leading-none ${meta.text}`}>{value}</p>
      <p className="relative mt-1.5 text-[10.5px] leading-snug text-navy-deep/80">{label}</p>
    </div>
  )
}

// ─── 4. TAKEAWAY STRIP ─────────────────────────────────────────────────────
// Highlights known thesis tokens inside the takeaway line with semantic colour
// so the eye lands on the load-bearing words (growth → teal, prestige → gold,
// company → navy). Tokens are matched case-insensitively in source order so
// they don't double-wrap if `getCompanyTakeawayLine` rephrases.
function highlightTakeaway(line: string, companyShortName: string): ReactNode[] {
  const tokens: { match: RegExp; className: string }[] = [
    { match: /fastest structural pool/i, className: 'font-semibold text-teal' },
    { match: /SAHIs gaining share/i, className: 'font-semibold text-navy-primary' },
    { match: /compounding faster/i, className: 'font-semibold text-champagne-deep' },
    { match: /structural growth/i, className: 'font-semibold text-teal' },
    { match: /gaining share/i, className: 'font-semibold text-navy-primary' },
    { match: new RegExp(companyShortName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), className: 'font-semibold text-champagne-deep' },
  ]
  const out: ReactNode[] = []
  let cursor = 0
  while (cursor < line.length) {
    let nextMatch: { idx: number; len: number; className: string } | null = null
    for (const t of tokens) {
      const slice = line.slice(cursor)
      const m = slice.match(t.match)
      if (m && m.index != null) {
        const absIdx = cursor + m.index
        if (!nextMatch || absIdx < nextMatch.idx) {
          nextMatch = { idx: absIdx, len: m[0].length, className: t.className }
        }
      }
    }
    if (!nextMatch) {
      out.push(line.slice(cursor))
      break
    }
    if (nextMatch.idx > cursor) out.push(line.slice(cursor, nextMatch.idx))
    out.push(
      <span key={`${nextMatch.idx}-${nextMatch.len}`} className={nextMatch.className}>
        {line.slice(nextMatch.idx, nextMatch.idx + nextMatch.len)}
      </span>,
    )
    cursor = nextMatch.idx + nextMatch.len
  }
  return out
}

function TakeawayStrip() {
  const company = useActiveCompany()
  const line = getCompanyTakeawayLine(company)
  const parts = highlightTakeaway(line, company.shortName)
  return (
    <section
      className="relative overflow-hidden rounded-xl border border-[#EAD9B6] px-4 py-2.5 shadow-[0_1px_2px_rgba(23,43,77,0.03),0_8px_18px_rgba(23,43,77,0.05)]"
      style={{ background: 'linear-gradient(90deg, #F1F8F6 0%, #FAF6EC 55%, #FBF3E2 100%)' }}
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-teal via-[#7FB99B] to-champagne" />
      <span
        className="pointer-events-none absolute -right-12 -bottom-10 h-24 w-24 rounded-full opacity-60 blur-2xl"
        style={{ background: 'rgba(182,139,58,0.18)' }}
      />
      <div className="relative flex flex-wrap items-center gap-3 pl-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-0.5 shadow-soft ring-1 ring-[#CFE3DA]">
          <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_6px_rgba(22,142,142,0.55)]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal">
            Market Read
          </span>
        </span>
        <p className="flex-1 text-[12.5px] leading-snug text-navy-deep">{parts}</p>
        <SourceTag source={MARKET_SOURCE.source} confidence={MARKET_SOURCE.confidence} provenance={MARKET_SOURCE.provenance} />
      </div>
    </section>
  )
}
