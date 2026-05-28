import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
  nivaRetailShare,
} from '@/data/mockData'

type ChartMode = 'Absolute Premium' | 'Mix %'

// Colour intentions for the Market Engine story:
//   Health / Niva / SAHI → highlighted teal+navy
//   Motor / Private      → muted slate
//   Others / PSU         → softest grey
const HEALTH = '#168E8E'       // structural-growth teal
const NIVA = '#27457E'         // focal navy
const SAHI = '#27457E'
const PRIVATE = '#8C97A8'
const PSU = '#C8CFDA'
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
  return (
    <section className="relative overflow-hidden rounded-[1.4rem] border border-[#E4E8F0] bg-gradient-to-br from-[#F7FAFD] via-[#FBFCFD] to-[#F4F7FB] p-6 shadow-[0_2px_4px_rgba(23,43,77,0.04),0_18px_44px_rgba(23,43,77,0.08)] sm:p-7">
      {/* Subtle atmospheric tints — gold + teal glow, kept low-intensity */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(182,139,58,0.10),transparent_65%)]" />
      <div className="pointer-events-none absolute -bottom-28 -left-16 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(22,142,142,0.08),transparent_65%)]" />

      <div className="relative grid items-center gap-6 lg:grid-cols-[1.25fr_1fr]">
        {/* Left — narrative */}
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E7DCC4] bg-[#FBF3E2]/70 px-2.5 py-1">
            <Sparkles className="h-3 w-3 text-champagne-deep" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">
              Market Engine
            </span>
          </div>
          <h1 className="mt-3 font-display text-[26px] leading-[1.18] tracking-tight text-navy-deep sm:text-[28px]">
            Health insurance is becoming the largest structural growth pool in
            general insurance.
          </h1>
          <p className="mt-2.5 max-w-xl text-[13.5px] leading-relaxed text-ink-secondary">
            The industry tailwind is strong before we even look at Niva Bupa.
          </p>
        </div>

        {/* Right — three KPI pills */}
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiPill
            value="40.8%"
            label="Health share of GI premium"
            tone="teal"
            sub="FY26"
          />
          <KpiPill
            value="18.8%"
            label="Health premium CAGR"
            tone="navy"
            sub="FY15 – FY26"
          />
          <KpiPill
            value="32.7%"
            label="SAHI share of health"
            tone="gold"
            sub="FY26"
          />
        </div>
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
      ? { bar: '#168E8E', tint: 'bg-teal-soft', text: 'text-teal' }
      : tone === 'gold'
        ? { bar: '#B68B3A', tint: 'bg-champagne-soft', text: 'text-champagne-deep' }
        : { bar: '#27457E', tint: 'bg-soft-blue', text: 'text-navy-primary' }
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[#E4E8F0] bg-white/85 p-3.5 shadow-[0_1px_2px_rgba(23,43,77,0.03),0_8px_22px_rgba(23,43,77,0.05)] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(23,43,77,0.04),0_14px_30px_rgba(23,43,77,0.08)]">
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: accent.bar }}
      />
      <div className="flex items-baseline justify-between pl-2">
        <p className={`font-display text-[22px] leading-none ${accent.text}`}>
          {value}
        </p>
        <span
          className={`rounded-full ${accent.tint} px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${accent.text}`}
        >
          {sub}
        </span>
      </div>
      <p className="mt-2 pl-2 text-[11.5px] leading-snug text-ink-secondary">
        {label}
      </p>
    </div>
  )
}

// ─── 2. MAIN CHART BLOCK ───────────────────────────────────────────────────
function MainChartBlock() {
  const [mode, setMode] = useState<ChartMode>('Mix %')
  const data = mode === 'Absolute Premium' ? giPremiumAbsolute : giPremiumMix
  const unit = mode === 'Absolute Premium' ? ' ₹k Cr' : '%'

  return (
    <section className="card-surface p-5 sm:p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">
            Pool Shift
          </p>
          <h2 className="mt-1 font-display text-[19px] leading-tight text-navy-deep">
            Where is the GI premium pool shifting?
          </h2>
          <p className="mt-1 text-[12px] text-ink-secondary">
            Health vs Motor vs Others, FY15 → FY26 · mock
          </p>
        </div>
        <ChartToggle value={mode} onChange={setMode} />
      </header>

      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 18, left: -4, bottom: 4 }}
          >
            <defs>
              <linearGradient id="healthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={HEALTH} stopOpacity={0.55} />
                <stop offset="100%" stopColor={HEALTH} stopOpacity={0.18} />
              </linearGradient>
              <linearGradient id="motorFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={MOTOR} stopOpacity={0.32} />
                <stop offset="100%" stopColor={MOTOR} stopOpacity={0.12} />
              </linearGradient>
              <linearGradient id="othersFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={OTHERS} stopOpacity={0.45} />
                <stop offset="100%" stopColor={OTHERS} stopOpacity={0.18} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: AXIS }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: AXIS }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              width={46}
              unit={unit.trim() === '%' ? '%' : ''}
            />
            <Tooltip
              cursor={{ stroke: '#27457E', strokeOpacity: 0.18, strokeWidth: 1 }}
              content={<EngineTooltip unit={unit} highlight="Health" />}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
              iconType="circle"
              align="right"
              verticalAlign="top"
            />
            <Area
              type="monotone"
              dataKey="Others"
              stackId="1"
              stroke={OTHERS}
              strokeWidth={1.2}
              fill="url(#othersFill)"
            />
            <Area
              type="monotone"
              dataKey="Motor"
              stackId="1"
              stroke={MOTOR}
              strokeWidth={1.2}
              fill="url(#motorFill)"
            />
            <Area
              type="monotone"
              dataKey="Health"
              stackId="1"
              stroke={HEALTH}
              strokeWidth={2.4}
              fill="url(#healthFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <AiRead text="Health has moved from a support category to the main growth engine of general insurance." />
    </section>
  )
}

function ChartToggle({
  value,
  onChange,
}: {
  value: ChartMode
  onChange: (v: ChartMode) => void
}) {
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
                ? 'bg-navy-primary text-white shadow-soft'
                : 'text-ink-secondary hover:text-navy-primary',
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
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: p.color }}
              />
              <span className="text-[10.5px] uppercase tracking-wide">
                {p.name}
              </span>
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
    <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#E1F2F1] bg-[#F2FAF9] px-3.5 py-2.5">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal/15 text-teal">
        <Sparkles className="h-3 w-3" />
      </span>
      <p className="text-[12.5px] leading-relaxed text-navy-deep">
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
      <NivaBridgeCard />
    </section>
  )
}

function SahiShiftCard() {
  return (
    <div className="card-surface p-5">
      <header className="mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">
          Inside Health
        </p>
        <h3 className="mt-1 font-display text-[16px] leading-tight text-navy-deep">
          Specialist insurers are gaining relevance
        </h3>
        <p className="mt-0.5 text-[11.5px] text-ink-secondary">
          Share of health premium by carrier type · FY18 → FY26
        </p>
      </header>

      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={healthCarrierShare}
            margin={{ top: 6, right: 8, left: -8, bottom: 0 }}
            stackOffset="expand"
          >
            <defs>
              <linearGradient id="sahiFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SAHI} stopOpacity={0.55} />
                <stop offset="100%" stopColor={SAHI} stopOpacity={0.22} />
              </linearGradient>
              <linearGradient id="privateFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PRIVATE} stopOpacity={0.4} />
                <stop offset="100%" stopColor={PRIVATE} stopOpacity={0.15} />
              </linearGradient>
              <linearGradient id="psuFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PSU} stopOpacity={0.55} />
                <stop offset="100%" stopColor={PSU} stopOpacity={0.25} />
              </linearGradient>
            </defs>
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
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              width={36}
            />
            <Tooltip
              cursor={{ stroke: '#27457E', strokeOpacity: 0.15 }}
              content={<EngineTooltip unit="%" highlight="SAHI" />}
            />
            <Legend
              wrapperStyle={{ fontSize: 10.5, paddingTop: 4 }}
              iconType="circle"
            />
            <Area
              type="monotone"
              dataKey="PSU"
              stackId="h"
              stroke={PSU}
              strokeWidth={1}
              fill="url(#psuFill)"
            />
            <Area
              type="monotone"
              dataKey="Private"
              stackId="h"
              stroke={PRIVATE}
              strokeWidth={1}
              fill="url(#privateFill)"
            />
            <Area
              type="monotone"
              dataKey="SAHI"
              stackId="h"
              stroke={SAHI}
              strokeWidth={2.2}
              fill="url(#sahiFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
        Within health, standalone health insurers are steadily gaining
        relevance as the market shifts away from PSU dominance.
      </p>
    </div>
  )
}

function NivaBridgeCard() {
  const chips: { value: string; label: string; tone: 'teal' | 'navy' | 'gold' }[] = [
    { value: '28.2%', label: 'Niva GWP CAGR · FY23–FY26', tone: 'teal' },
    { value: '24.6%', label: 'Retail GWP CAGR', tone: 'navy' },
    { value: '+196 bps', label: 'Retail market share gain', tone: 'gold' },
    { value: '10.1%', label: 'FY26 retail market share', tone: 'navy' },
  ]
  return (
    <div className="card-surface relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(39,69,126,0.06),transparent_70%)]" />
      <header className="relative mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">
            Bridge
          </p>
          <h3 className="mt-1 font-display text-[16px] leading-tight text-navy-deep">
            Niva is riding the specialist shift
          </h3>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-semibold text-teal">
          <ArrowUpRight className="h-3 w-3" />
          Gaining share
        </span>
      </header>

      <div className="relative grid grid-cols-2 gap-2.5">
        {chips.map((c) => (
          <MetricMini key={c.label} value={c.value} label={c.label} tone={c.tone} />
        ))}
      </div>

      <div className="relative mt-4 rounded-xl border border-[#E8EBF1] bg-[#FAFBFD] p-3">
        <div className="mb-1 flex items-baseline justify-between">
          <p className="text-[11px] font-semibold text-navy-deep">
            Niva retail market share
          </p>
          <p className="text-[10px] uppercase tracking-wide text-ink-secondary">
            FY23 → FY26
          </p>
        </div>
        <div style={{ width: '100%', height: 96 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={nivaRetailShare}
              margin={{ top: 8, right: 8, left: -18, bottom: -6 }}
            >
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
              <YAxis
                tick={{ fontSize: 10, fill: AXIS }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                width={32}
                domain={['dataMin - 0.4', 'dataMax + 0.4']}
                unit="%"
              />
              <Tooltip
                cursor={{ stroke: NIVA, strokeOpacity: 0.2 }}
                content={({ active, payload, label }) =>
                  active && payload && payload[0] ? (
                    <div className="rounded-lg border border-[#E5E8EF] bg-white px-2.5 py-1.5 shadow-md">
                      <p className="text-[10px] font-semibold text-navy-deep">
                        {label}
                      </p>
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
                dot={{ r: 3, fill: NIVA, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
        Niva is not just present in the right market — it is gaining share
        inside it.
      </p>
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
  const bar =
    tone === 'teal' ? '#168E8E' : tone === 'gold' ? '#B68B3A' : '#27457E'
  const text =
    tone === 'teal'
      ? 'text-teal'
      : tone === 'gold'
        ? 'text-champagne-deep'
        : 'text-navy-primary'
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#E4E8F0] bg-white px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(23,43,77,0.07)]">
      <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: bar }} />
      <p className={`font-display text-[17px] leading-none ${text}`}>{value}</p>
      <p className="mt-1.5 text-[10.5px] leading-snug text-ink-secondary">
        {label}
      </p>
    </div>
  )
}

// ─── 4. TAKEAWAY STRIP ─────────────────────────────────────────────────────
function TakeawayStrip() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#D6E5DF] bg-gradient-to-r from-[#EFF7F4] via-[#F5FBF8] to-[#F9F4E8] p-4 shadow-[0_1px_2px_rgba(23,43,77,0.03),0_10px_24px_rgba(23,43,77,0.05)]">
      <span className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-teal to-champagne" />
      <div className="flex flex-wrap items-center gap-3 pl-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 ring-1 ring-[#CFE3DA]">
          <span className="h-1.5 w-1.5 rounded-full bg-teal" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal">
            Market Read · Positive
          </span>
        </span>
        <p className="flex-1 text-[13px] leading-relaxed text-navy-deep">
          Health is the fastest structural pool in GI, SAHIs are gaining
          share, and{' '}
          <span className="font-semibold">
            Niva is compounding faster than the market.
          </span>
        </p>
      </div>
    </section>
  )
}
