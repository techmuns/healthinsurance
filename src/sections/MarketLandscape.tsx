import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
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
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Sparkles } from 'lucide-react'
import {
  giPremiumAbsolute,
  giPremiumMix,
  healthCarrierShare,
} from '@/data/mockData'
import type { SeriesPoint } from '@/data/types'
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

// --- Data-Range plumbing ----------------------------------------------------
// Every series on this page is clipped to the dashboard-wide Data Range via
// useRangeClip. These helpers let captions, KPI tiles and source tags read
// straight off whatever survived the clip, so the labels track the top-bar
// selector instead of a hardcoded span.

/** Period span actually drawn after the clip, e.g. "FY23 → FY25". */
function shownSpan(rows: { label: string }[]): string | undefined {
  if (rows.length === 0) return undefined
  const a = rows[0].label
  const b = rows[rows.length - 1].label
  return a === b ? a : `${a} → ${b}`
}

/** Latest in-range numeric value for `key` (skips nulls), with its period label. */
function latestInRange(rows: SeriesPoint[], key: string): { value: number; label: string } | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][key]
    if (typeof v === 'number') return { value: v, label: rows[i].label }
  }
  return null
}

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
  // Headline share tiles read the real per-year series, clipped to the Data
  // Range, so they track the selector. (CAGR is a fixed long-run statistic.)
  const { data: mix } = useRangeClip(giPremiumMix)
  const { data: carrier } = useRangeClip(healthCarrierShare)
  const healthShare = latestInRange(mix, 'Health')
  const sahiShare = latestInRange(carrier, 'SAHI')
  const latestYear = healthShare?.label ?? sahiShare?.label ?? '—'
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
          <KpiPill value={healthShare ? `${healthShare.value.toFixed(1)}%` : 'n/a'} label="Health share of GI premium" tone="teal" sub={healthShare?.label ?? '—'} />
          <KpiPill value="18.8%" label="Health premium CAGR" tone="navy" sub="FY15 – FY26" />
          <KpiPill value={sahiShare ? `${sahiShare.value.toFixed(1)}%` : 'n/a'} label="SAHI share of health" tone="gold" sub={sahiShare?.label ?? '—'} />
        </div>
      </div>
      <div className="relative mt-4 flex justify-end">
        <SourceTag source={MARKET_SOURCE.source} confidence={MARKET_SOURCE.confidence} provenance={MARKET_SOURCE.provenance} period={latestYear} />
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
// "Premium Pool Shift" — a flowing ribbon infographic (no axes / grid / frame)
// of how the GI premium pool splits between Health, Motor and Others, FY21→FY25.
// Each segment is its own ribbon whose thickness encodes its share (Mix %) or
// premium (Absolute): Health widens, Others narrows, Motor holds. A compact
// summary on the right states the FY-first→FY-last pp moves.
type Seg = 'Health' | 'Motor' | 'Others'

function numOrNull(v: number | string | null | undefined): number | null {
  return typeof v === 'number' ? v : null
}

// Width of a flex child, tracked so the ribbon SVG can lay out in real pixels.
function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

// Catmull-Rom → cubic bézier commands through the points (no leading "M";
// assumes the path cursor is already at pts[0]).
function curveThrough(pts: { x: number; y: number }[]): string {
  let d = ''
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += `C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} `
  }
  return d
}

const RIBBON_DEF: { key: Seg; grad: string; labelFill: string }[] = [
  { key: 'Health', grad: 'url(#rfHealth)', labelFill: '#FFFFFF' },
  { key: 'Motor', grad: 'url(#rfMotor)', labelFill: '#2C3A4F' },
  { key: 'Others', grad: 'url(#rfOthers)', labelFill: '#3A4658' },
]

// The ribbon flow — three separated, smoothly-flowing bands whose thickness is
// the segment's share (Mix) or premium (Absolute) at each year.
function RibbonFlow({ rows, isMix }: { rows: SeriesPoint[]; isMix: boolean }) {
  const [ref, w] = useElementWidth()
  const H = 236
  const n = rows.length
  const xPad = 20
  const yTop = 36
  const yBot = H - 16
  const gap = 14
  const usable = yBot - yTop - 2 * gap

  const tv = (row: SeriesPoint, seg: Seg) => Math.max(0, numOrNull(row[seg]) ?? 0)
  const totals = rows.map((r) => tv(r, 'Health') + tv(r, 'Motor') + tv(r, 'Others'))
  const maxTotal = Math.max(1, ...totals)
  const scale = usable / maxTotal
  const xOf = (i: number) => (n <= 1 ? w / 2 : xPad + ((w - 2 * xPad) * i) / (n - 1))

  // Per-year stacked top/bottom for each segment, with white gaps between.
  const top: Record<Seg, number[]> = { Health: [], Motor: [], Others: [] }
  const bot: Record<Seg, number[]> = { Health: [], Motor: [], Others: [] }
  rows.forEach((r, i) => {
    let y = yTop
    ;(['Health', 'Motor', 'Others'] as Seg[]).forEach((seg, si) => {
      const th = tv(r, seg) * scale
      top[seg][i] = y
      bot[seg][i] = y + th
      y += th + (si < 2 ? gap : 0)
    })
  })

  const ribbon = (seg: Seg) => {
    const tp = rows.map((_, i) => ({ x: xOf(i), y: top[seg][i] }))
    const bp = rows.map((_, i) => ({ x: xOf(i), y: bot[seg][i] }))
    return `M ${tp[0].x.toFixed(1)} ${tp[0].y.toFixed(1)} ${curveThrough(tp)}L ${bp[n - 1].x.toFixed(1)} ${bp[n - 1].y.toFixed(1)} ${curveThrough(bp.slice().reverse())}Z`
  }
  const fmt = (v: number) => (isMix ? `${Math.round(v)}%` : `₹${Math.round(v)}k`)

  return (
    <div ref={ref} className="relative min-w-0 flex-1" style={{ height: H }}>
      {w > 0 && n >= 2 && (
        <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className="overflow-visible">
          <defs>
            <linearGradient id="rfHealth" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#34B7AE" />
              <stop offset="100%" stopColor={HEALTH} />
            </linearGradient>
            <linearGradient id="rfMotor" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#B2BCCB" />
              <stop offset="100%" stopColor={MOTOR} />
            </linearGradient>
            <linearGradient id="rfOthers" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={OTHERS} />
              <stop offset="100%" stopColor="#E7EBF1" />
            </linearGradient>
          </defs>

          {rows.map((r, i) => (
            <text key={`yr-${r.label}`} x={xOf(i)} y={16} textAnchor="middle" fontSize={11} fontWeight={700} fill="#26303F" style={{ letterSpacing: 0.3 }}>
              {r.label}
            </text>
          ))}

          {RIBBON_DEF.map((rd, idx) => (
            <g key={rd.key} className="rf-ribbon" style={{ animationDelay: `${idx * 0.1}s` }}>
              <path d={ribbon(rd.key)} fill={rd.grad} style={{ filter: 'drop-shadow(0 2px 5px rgba(23,43,77,0.12))' }} />
              {rows.map((r, i) => {
                const thick = bot[rd.key][i] - top[rd.key][i]
                if (thick < 14) return null
                // First / last labels are anchored inward so they stay on the
                // ribbon (a centred label at the edge would fall onto the card).
                const anchor: 'start' | 'middle' | 'end' = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
                const lx = i === 0 ? xOf(i) + 5 : i === n - 1 ? xOf(i) - 5 : xOf(i)
                return (
                  <text key={`lb-${rd.key}-${i}`} x={lx} y={(top[rd.key][i] + bot[rd.key][i]) / 2 + 3.5} textAnchor={anchor} fontSize={10.5} fontWeight={700} fill={rd.labelFill} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(tv(r, rd.key))}
                  </text>
                )
              })}
            </g>
          ))}
        </svg>
      )}
      <style>{`
        .rf-ribbon { opacity: 0; animation: rfFade 0.6s ease forwards; }
        @keyframes rfFade { to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .rf-ribbon { animation: none; opacity: 1; } }
      `}</style>
    </div>
  )
}

// Compact FY-first→FY-last share-move summary beside the ribbon.
function RibbonSummary({ ppH, ppM, ppO, span }: { ppH: number | null; ppM: number | null; ppO: number | null; span: string }) {
  const fmtPp = (v: number | null) => (v == null ? 'n/a' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} pp`)
  const items = [
    { label: 'Health gained', v: ppH, Icon: ArrowUp, tint: '#E2F4F1', fg: '#0E6F6D' },
    { label: 'Motor change', v: ppM, Icon: ArrowRight, tint: '#ECF0F6', fg: '#6F7C90' },
    { label: 'Others ceded', v: ppO, Icon: ArrowDown, tint: '#F6E9E6', fg: '#B06A5E' },
  ]
  return (
    <div className="w-[172px] shrink-0 self-center rounded-2xl border border-[#EAEEF4] bg-white/80 p-3 shadow-[0_1px_2px_rgba(23,43,77,0.04),0_10px_24px_rgba(23,43,77,0.06)]">
      <p className="mb-2.5 text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne-deep">{span} shift</p>
      <div className="space-y-2.5">
        {items.map(({ label, v, Icon, tint, fg }) => (
          <div key={label} className="flex items-center gap-2.5">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: tint, color: fg }}>
              <Icon className="h-3.5 w-3.5" strokeWidth={2.6} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10.5px] leading-tight text-navy-deep/70">{label}</p>
              <p className="font-display text-[15px] leading-tight tabular-nums" style={{ color: fg }}>{fmtPp(v)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MainChartBlock() {
  const [mode, setMode] = useState<ChartMode>('Mix %')
  const gate = usePeriodGate()
  const isMix = mode === 'Mix %'
  const data = isMix ? giPremiumMix : giPremiumAbsolute
  const { data: clipped } = useRangeClip(data)
  const span = shownSpan(clipped)

  // Summary reads share movement (pp) from the mix series so it's correct in
  // either toggle — FY-first → FY-last within the active range.
  const { data: mixClipped } = useRangeClip(giPremiumMix)
  const mf = mixClipped[0]
  const ml = mixClipped[mixClipped.length - 1]
  const ppOf = (seg: Seg): number | null => {
    const a = numOrNull(mf?.[seg])
    const b = numOrNull(ml?.[seg])
    return a == null || b == null ? null : b - a
  }

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
            Health vs Motor vs Others · {span ?? '—'} · mock
          </p>
        </div>
        <ChartToggle value={mode} onChange={setMode} />
      </header>

      {!gate.ok ? (
        <EmptyState
          title="Data unavailable for this period"
          body={gate.reason ?? 'Switch the period toggle to Annual to see the GI pool shift.'}
          height={236}
        />
      ) : clipped.length === 0 ? (
        <EmptyState
          title="Data not available from source"
          body="No reported years fall inside the selected Data Range. Widen the range in the top bar."
          height={236}
        />
      ) : (
        <div className="flex flex-wrap items-stretch gap-4">
          <RibbonFlow rows={clipped} isMix={isMix} />
          <RibbonSummary ppH={ppOf('Health')} ppM={ppOf('Motor')} ppO={ppOf('Others')} span={span ?? 'FY21 → FY25'} />
        </div>
      )}

      {gate.ok && clipped.length > 0 && (
        <AiRead text="Health is gaining share in the GI premium pool, largely at the expense of Others, while Motor remains broadly stable." />
      )}
      <div className="mt-3 flex justify-end">
        <SourceTag source={MARKET_SOURCE.source} confidence={MARKET_SOURCE.confidence} provenance={MARKET_SOURCE.provenance} period={span ?? '—'} />
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
  const span = shownSpan(clipped)
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
            Share of health premium by carrier type · {span ?? '—'}
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
        <SourceTag source={MARKET_SOURCE.source} confidence={MARKET_SOURCE.confidence} provenance={MARKET_SOURCE.provenance} period={span ?? '—'} />
      </div>
    </div>
  )
}

function CompanyBridgeCard() {
  const company = useActiveCompany()
  const { peerGroup } = useFilters()
  const gate = usePeriodGate()
  const bridge = getCompanyMarketBridge(company, peerGroup)

  // Clip the (illustrative) retail-share trajectory to the Data Range so it
  // never draws a year outside the selector — e.g. FY26 when the range ends FY25.
  const { data: trajectory } = useRangeClip(bridge.trajectory)
  const span = shownSpan(trajectory)
  const lastIdx = trajectory.length - 1
  const firstShare = trajectory.length ? trajectory[0].share : 0
  const lastShare = trajectory.length ? trajectory[lastIdx].share : 0
  const firstLabel = trajectory.length ? trajectory[0].label : ''
  const lastLabel = trajectory.length ? trajectory[lastIdx].label : ''

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
        {!gate.ok || trajectory.length === 0 ? (
          <EmptyState
            title={trajectory.length === 0 ? 'Data not available for this range' : 'Data unavailable for this period'}
            body={
              trajectory.length === 0
                ? 'No reported years fall inside the selected Data Range. Widen the range in the top bar.'
                : gate.reason ?? 'Switch to Annual to see the share trajectory.'
            }
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
        <SourceTag source="Derived from IRDAI" confidence="medium" period={span ?? '—'} provenance={{ source_name: 'Retail share trajectory derived from real FY25 GWP + marketShareChange in insurers[]', source_url: 'https://www.careratings.com/uploads/newsfiles/1745386639_Non-Life%20Insurance%20Update%20for%20March%202025.pdf' }} />
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
