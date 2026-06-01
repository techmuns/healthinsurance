import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  Maximize2,
  Percent,
  PieChart,
  Search,
  TrendingUp,
} from 'lucide-react'
import { insurers, valuationMultiples, valuationMultipleTrend } from '@/data/mockData'
import { getCompanyMetric } from '@/lib/dataLayer'
import { useActiveCompany } from '@/state/filters'
import { SourceTag } from '@/components/SourceTag'

const NAVY = '#27457E'
const TEAL = '#168E8E'
const GOLD = '#B68B3A'
const PEER = '#A6B2C6'
const GRID = '#EEF1F7'
const AXIS = '#6B7280'

const LISTED = new Set(['niva-bupa', 'star-health', 'icici-lombard', 'hdfc-life', 'sbi-life'])
const clamp = (v: number, lo = 16, hi = 96) => Math.max(lo, Math.min(hi, v))

const VAL_SOURCE = {
  source: 'Market data' as const,
  confidence: 'low' as const,
  provenance: {
    source_name: 'Illustrative mock — NSE/BSE market-cap, P/B and P/E pull is pending. P/GWP carried from insurers[].',
    source_url: 'https://www.nseindia.com/get-quotes/equity',
  },
}

export function ValuationMarketView() {
  const company = useActiveCompany()
  const [expanded, setExpanded] = useState(false)
  const listed = LISTED.has(company.id)

  // ── Real metrics ──────────────────────────────────────────────────────────
  const patEnv = getCompanyMetric(company.id, 'company.pat', 'Annual')
  const pat = typeof patEnv.value === 'number' ? patEnv.value : null
  const gwp = company.premiumCollection || null
  const netMargin = pat != null && gwp ? (pat / gwp) * 100 : null

  const pGwp = company.valuation > 0 ? company.valuation : null // listed → P/GWP, else null
  const peerAvgGwp = valuationMultiples.pGwp.peerAvg
  const premiumGwp = pGwp != null ? ((pGwp - peerAvgGwp) / peerAvgGwp) * 100 : null

  // Named peers for the mini-cards (real listed status — unlisted shows n/a).
  const namedPeers = ['star-health', 'care-health', 'aditya-birla']
    .map((id) => insurers.find((i) => i.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))

  const drivers = [
    { icon: TrendingUp, label: 'Revenue growth (GWP YoY)', value: `${company.growth.toFixed(1)}%`, strong: company.growth >= 15 },
    { icon: Percent, label: 'Net margin (PAT / GWP)', value: netMargin != null ? `${netMargin.toFixed(1)}%` : 'n/a', strong: (netMargin ?? -1) > 0 },
    { icon: PieChart, label: 'Market share', value: `${company.marketShare.toFixed(1)}%`, strong: company.marketShareChange >= 0 },
    { icon: BarChart3, label: 'Return on equity', value: company.roe > 0 ? `${company.roe.toFixed(1)}%` : 'n/a', strong: company.roe >= 8 },
  ]

  // ── Compass scores — derived from real metrics, focal vs peer-group avg ─────
  const peerGroup = insurers.filter((i) => i.peerGroup === company.peerGroup && i.id !== company.id)
  const avg = (f: (p: (typeof insurers)[number]) => number) =>
    peerGroup.length ? peerGroup.reduce((s, p) => s + f(p), 0) / peerGroup.length : 0
  const scores = (g: number, mgn: number, ms: number, solv: number, val: number) => ({
    Growth: clamp(g * 2.4),
    Profitability: clamp(48 + mgn * 3 + 12),
    'Market Share': clamp(ms * 3.8),
    'Balance Sheet': clamp(solv * 22),
    Valuation: clamp(val * 17),
  })
  const nivaScores = scores(company.growth, company.margin, company.marketShare, company.solvency, company.valuation || 3)
  const peerScores = scores(avg((p) => p.growth), avg((p) => p.margin), avg((p) => p.marketShare), avg((p) => p.solvency), avg((p) => p.valuation || 3))
  const compassData = (['Growth', 'Profitability', 'Market Share', 'Balance Sheet', 'Valuation'] as const).map((axis) => ({
    axis,
    niva: Math.round(nivaScores[axis]),
    peer: Math.round(peerScores[axis]),
  }))
  const nivaAvg = compassData.reduce((s, d) => s + d.niva, 0) / compassData.length
  const peerAvgScore = compassData.reduce((s, d) => s + d.peer, 0) / compassData.length
  const position = nivaAvg >= peerAvgScore + 8 ? 'Above Average' : nivaAvg <= peerAvgScore - 8 ? 'Below Average' : 'In Line'

  const relMetrics = [
    { label: 'P / GWP', niva: valuationMultiples.pGwp.niva, peer: valuationMultiples.pGwp.peerAvg },
    { label: 'P / B', niva: valuationMultiples.pB.niva, peer: valuationMultiples.pB.peerAvg },
    { label: 'P / E', niva: valuationMultiples.pE.niva, peer: valuationMultiples.pE.peerAvg },
  ]

  return (
    <div className="space-y-5">
      {/* ── 1. Verdict banner ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[1.4rem] border border-[#E4E8F0] bg-gradient-to-br from-[#F7FAFD] via-[#FBFCFD] to-[#F4F7FB] p-6 shadow-[0_2px_4px_rgba(23,43,77,0.04),0_18px_44px_rgba(23,43,77,0.08)]">
        <MagnifierArt />
        <div className="relative grid items-center gap-5 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D6E2FA] bg-soft-blue px-2.5 py-1">
              <Search className="h-3 w-3 text-navy-primary" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-navy-primary">Valuation Verdict</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[26px] leading-tight tracking-tight text-navy-deep">
                {listed ? 'Awaiting market-cap snapshot' : 'No public market valuation'}
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAD9B6] bg-champagne-soft px-2.5 py-1 text-[11px] font-semibold text-champagne-deep">
                <span className="h-1.5 w-1.5 rounded-full bg-champagne-deep" />
                Pending
              </span>
            </div>
          </div>
          <p className="relative text-[13px] leading-relaxed text-ink-secondary">
            {listed
              ? `${company.shortName} is listed on the exchange. P/GWP, P/B and P/E will populate once latest market data is ingested.`
              : `${company.shortName} is unlisted — no public market valuation is available.`}
          </p>
        </div>
        <div className="relative mt-4 flex justify-end">
          <SourceTag source={VAL_SOURCE.source} confidence={VAL_SOURCE.confidence} provenance={VAL_SOURCE.provenance} period="Pending" />
        </div>
      </section>

      {/* ── 2. Section header ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-1 h-7 w-1 rounded-full bg-gradient-to-b from-champagne to-champagne-deep" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">Valuation at a glance</p>
            <h2 className="mt-0.5 font-display text-[22px] leading-tight text-navy-deep">Valuation at a glance</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-secondary">FY21 → FY25 (Annual) · mock</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-white px-3 py-1.5 text-[11.5px] font-semibold text-navy-primary shadow-soft transition-colors hover:bg-soft-blue"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          {expanded ? 'Compact view' : 'Expand view'}
        </button>
      </div>

      {/* ── 3. Row 1: Valuation Multiple + Key Value Drivers ───────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Valuation Multiple */}
        <div className="card-surface relative overflow-hidden p-5">
          <span className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(22,142,142,0.10),transparent_65%)]" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Valuation Multiple</p>
              <p className="text-[10.5px] text-ink-secondary/80">vs listed-peer benchmark</p>
            </div>
            <GrowthGlyph />
          </div>
          <div className="mt-2 flex items-end gap-2">
            <span className="font-display text-[40px] leading-none text-navy-deep">{pGwp != null ? `${pGwp.toFixed(1)}x` : 'n/a'}</span>
            <span className="mb-1 text-[12px] text-ink-secondary">P/GWP · FY25</span>
          </div>
          <p className="mt-1.5 text-[12px] text-ink-secondary">
            vs peer avg. <span className="font-semibold text-navy-deep">{peerAvgGwp.toFixed(1)}x</span>
            {premiumGwp != null && (
              <>
                {' · '}
                <span className={premiumGwp >= 0 ? 'font-semibold text-teal' : 'font-semibold text-signal-negative'}>
                  {premiumGwp >= 0 ? '+' : ''}
                  {premiumGwp.toFixed(0)}% {premiumGwp >= 0 ? 'premium' : 'discount'}
                </span>
              </>
            )}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {namedPeers.map((p) => {
              const avail = p.valuation > 0
              const delta = avail && pGwp != null ? p.valuation - pGwp : null
              return (
                <div key={p.id} className="rounded-xl border border-soft-border bg-ice/60 px-3 py-2.5">
                  <p className="truncate text-[10.5px] font-semibold text-navy-deep/75">{p.shortName}</p>
                  <p className={`mt-1 font-display text-[18px] leading-none ${avail ? 'text-navy-deep' : 'text-ink-secondary/60'}`}>
                    {avail ? `${p.valuation.toFixed(1)}x` : 'n/a'}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-0.5 text-[10.5px] font-semibold">
                    {delta == null ? (
                      <span className="inline-flex items-center gap-0.5 text-ink-secondary/60"><ArrowRight className="h-3 w-3" />unlisted</span>
                    ) : delta >= 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-teal"><ArrowUpRight className="h-3 w-3" />+{delta.toFixed(1)}x</span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-signal-negative"><ArrowDownRight className="h-3 w-3" />{delta.toFixed(1)}x</span>
                    )}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Key Value Drivers */}
        <div className="card-surface p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Key Value Drivers <span className="text-ink-secondary/60">(FY25)</span></p>
          <div className="mt-3 space-y-2">
            {drivers.map(({ icon: Icon, label, value, strong }) => (
              <div key={label} className="flex items-center gap-3 rounded-lg bg-ice/60 px-3 py-2.5">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-soft-blue text-navy-primary">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 text-[12px] text-navy-deep">{label}</span>
                <span className="font-display text-[16px] leading-none text-navy-deep tabular-nums">{value}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${strong ? 'bg-teal-soft text-teal' : 'bg-champagne-soft text-champagne-deep'}`}>
                  {strong ? 'Strong' : 'Watch'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4. Row 2: three analytical cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Relative Valuation vs Peers */}
        <div className="card-surface p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Relative Valuation vs Peers <span className="text-ink-secondary/60">(FY25)</span></p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {relMetrics.map((m) => {
              const max = Math.max(m.niva, m.peer, 0.1)
              const prem = ((m.niva - m.peer) / m.peer) * 100
              return (
                <div key={m.label} className="text-center">
                  <p className="text-[11px] font-semibold text-navy-deep/75">{m.label}<span className="text-ink-secondary/60"> (x)</span></p>
                  <div className="mt-2 flex h-[78px] items-end justify-center gap-2">
                    <Bar value={m.niva} max={max} color={NAVY} label={`${m.niva}x`} />
                    <Bar value={m.peer} max={max} color={PEER} label={`${m.peer}x`} />
                  </div>
                  <p className="mt-1.5 text-[11px] font-semibold text-teal">+{prem.toFixed(0)}%</p>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center gap-3 border-t border-soft-border pt-2.5 text-[10px] text-ink-secondary">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-[2px]" style={{ background: NAVY }} />{company.shortName}</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-[2px]" style={{ background: PEER }} />Peer avg</span>
            <span className="ml-auto italic text-ink-secondary/70">P/B · P/E mock</span>
          </div>
        </div>

        {/* Multiple Trend */}
        <div className="card-surface p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Multiple Trend <span className="text-ink-secondary/60">(FY21 → FY25)</span></p>
          <div className="mt-3" style={{ width: '100%', height: expanded ? 210 : 176 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={valuationMultipleTrend} margin={{ top: 18, right: 42, left: 16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
                {/* P/E sits on its own (upper) scale so P/GWP & P/B aren't flattened. */}
                <YAxis yAxisId="lhs" hide domain={[0, 8]} />
                <YAxis yAxisId="rhs" orientation="right" hide domain={[0, 36]} />
                <Line yAxisId="rhs" type="monotone" dataKey="P/E" stroke={GOLD} strokeWidth={2} dot={{ r: 2.6, fill: GOLD }} activeDot={{ r: 4 }}>
                  <LabelList dataKey="P/E" content={endTrendLabel(GOLD)} />
                </Line>
                <Line yAxisId="lhs" type="monotone" dataKey="P/GWP" stroke={TEAL} strokeWidth={2} dot={{ r: 2.6, fill: TEAL }} activeDot={{ r: 4 }}>
                  <LabelList dataKey="P/GWP" content={endTrendLabel(TEAL)} />
                </Line>
                <Line yAxisId="lhs" type="monotone" dataKey="P/B" stroke={NAVY} strokeWidth={2} dot={{ r: 2.6, fill: NAVY }} activeDot={{ r: 4 }}>
                  <LabelList dataKey="P/B" content={endTrendLabel(NAVY)} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[10px] text-ink-secondary">
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-3 rounded-full" style={{ background: TEAL }} />P/GWP</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-3 rounded-full" style={{ background: NAVY }} />P/B</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-3 rounded-full" style={{ background: GOLD }} />P/E</span>
          </div>
          <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-[#E1F2F1] bg-[#F2FAF9] px-3 py-1.5">
            <TrendingUp className="h-3.5 w-3.5 shrink-0 text-teal" />
            <p className="text-[11.5px] leading-snug text-navy-deep">Sustained upward trend across all major multiples.</p>
          </div>
        </div>

        {/* Valuation Compass */}
        <div className="card-surface p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Valuation Compass</p>
          <div className="mt-2 grid grid-cols-[1.25fr_1fr] items-center gap-2">
            <div style={{ width: '100%', height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={compassData} outerRadius="74%" margin={{ top: 6, right: 8, bottom: 6, left: 8 }}>
                  <PolarGrid stroke="#E3E8F0" />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 8.5, fill: '#64748B' }} />
                  <Radar name="Peer avg" dataKey="peer" stroke={PEER} fill={PEER} fillOpacity={0.16} strokeWidth={1.3} />
                  <Radar name={company.shortName} dataKey="niva" stroke={NAVY} fill={NAVY} fillOpacity={0.26} strokeWidth={1.8} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-xl border border-[#D6E2FA] bg-soft-blue/50 p-3">
              <p className="text-[9.5px] font-semibold uppercase tracking-wide text-navy-primary/70">Overall Position</p>
              <p className="mt-0.5 font-display text-[17px] leading-tight text-navy-deep">{position}</p>
              <ul className="mt-2.5 space-y-1.5">
                {[
                  { ok: company.growth >= 15, label: 'Strong growth' },
                  { ok: (netMargin ?? company.margin) > 0, label: 'Healthy margins' },
                  { ok: company.marketShareChange >= 0, label: 'Rising market share' },
                  { ok: (pGwp ?? 0) >= peerAvgGwp, label: 'Premium valuation' },
                ].map(({ ok, label }) => (
                  <li key={label} className="flex items-center gap-1.5 text-[10.5px] text-navy-deep">
                    <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ${ok ? 'bg-teal/15 text-teal' : 'bg-soft-border text-ink-secondary'}`}>
                      <Check className="h-2.5 w-2.5" />
                    </span>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-3 border-t border-soft-border pt-2 text-[10px] text-ink-secondary">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: NAVY }} />{company.shortName}</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: PEER }} />Peer avg</span>
          </div>
        </div>
      </div>

      {/* ── 5. Investor read (dark navy) ───────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-[#16294B] via-[#1B335C] to-[#13243F] p-6 shadow-[0_18px_44px_rgba(11,22,44,0.30)]">
        <InvestorReadArt />
        <div className="relative flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-champagne/20 text-champagne">
            <Search className="h-3 w-3" />
          </span>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-champagne">Investor Read</p>
        </div>
        <div className="relative mt-4 grid gap-4 md:grid-cols-3">
          <ReadBlock label="The So What" body={`${company.shortName} pairs sector-leading growth with improving margins and rising share — the profile that supports a premium multiple.`} />
          <ReadBlock label="Key Implication" body="A high-growth, improving-fundamentals story can justify trading above peers — once live multiples confirm it." />
          <ReadBlock label="Status" body="Market-cap, P/B and P/E ingestion in progress; P/GWP shown, the rest pending." pill="Pending" />
        </div>
      </section>
    </div>
  )
}

// ── Small building blocks ────────────────────────────────────────────────────

// Value label at the final point of a trend line (e.g. "3.4x").
function endTrendLabel(color: string) {
  return (props: any) => {
    const { x, y, value, index } = props as { x?: number; y?: number; value?: number; index?: number }
    if (index !== valuationMultipleTrend.length - 1 || typeof x !== 'number' || typeof y !== 'number') return null
    return (
      <text x={x + 6} y={y + 3.5} fill={color} fontSize={10} fontWeight={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {typeof value === 'number' ? `${value}x` : ''}
      </text>
    )
  }
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const h = Math.max(6, (value / max) * 64)
  return (
    <div className="flex flex-col items-center justify-end">
      <span className="mb-1 text-[10px] font-semibold text-navy-deep tabular-nums">{label}</span>
      <div className="w-5 rounded-t-md" style={{ height: h, background: color }} />
    </div>
  )
}

function ReadBlock({ label, body, pill }: { label: string; body: string; pill?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-champagne/90">{label}</p>
        {pill && (
          <span className="inline-flex items-center gap-1 rounded-full bg-champagne/15 px-2 py-0.5 text-[9.5px] font-semibold text-champagne">
            <span className="h-1.5 w-1.5 rounded-full bg-champagne" />
            {pill}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-white/85">{body}</p>
    </div>
  )
}

// Faint magnifier-over-chart illustration for the verdict banner.
function MagnifierArt() {
  return (
    <svg className="pointer-events-none absolute -right-2 top-2 h-[120px] w-[200px] opacity-[0.22]" viewBox="0 0 200 120" fill="none" aria-hidden>
      {[
        [120, 78, 18], [142, 66, 30], [164, 50, 46], [186, 40, 56],
      ].map(([x, y, h], i) => (
        <rect key={i} x={x} y={y} width={12} height={h} rx={2.5} fill={NAVY} opacity={0.5} />
      ))}
      <circle cx={92} cy={56} r={30} stroke={TEAL} strokeWidth={4} fill="rgba(22,142,142,0.06)" />
      <path d="M70 78 L52 96" stroke={TEAL} strokeWidth={6} strokeLinecap="round" />
      <path d="M78 64 q14 -22 30 -6" stroke={GOLD} strokeWidth={3} fill="none" strokeLinecap="round" />
    </svg>
  )
}

// Small bar/growth glyph inside the Valuation Multiple card.
function GrowthGlyph() {
  return (
    <svg className="h-9 w-12 opacity-90" viewBox="0 0 48 36" fill="none" aria-hidden>
      <rect x={2} y={22} width={8} height={12} rx={2} fill={PEER} />
      <rect x={14} y={15} width={8} height={19} rx={2} fill="#7FB7B3" />
      <rect x={26} y={8} width={8} height={26} rx={2} fill={TEAL} />
      <path d="M4 18 L18 12 L30 6 L44 2" stroke={GOLD} strokeWidth={2} fill="none" strokeLinecap="round" />
      <path d="M38 2 L44 2 L44 8" stroke={GOLD} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Subtle glowing chart for the investor-read card.
function InvestorReadArt(): ReactNode {
  return (
    <svg className="pointer-events-none absolute -right-2 bottom-0 h-[150px] w-[260px] opacity-40" viewBox="0 0 260 150" fill="none" aria-hidden>
      <defs>
        <linearGradient id="irGlow" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#3FA9A2" stopOpacity={0} />
          <stop offset="100%" stopColor="#5FD0C8" stopOpacity={0.9} />
        </linearGradient>
      </defs>
      {[160, 178, 196, 214, 232].map((x, i) => (
        <rect key={i} x={x} y={120 - i * 18} width={12} height={30 + i * 18} rx={3} fill="url(#irGlow)" />
      ))}
      <path d="M150 110 L172 96 L194 86 L216 64 L240 44" stroke="#7FE6DD" strokeWidth={2.4} fill="none" strokeLinecap="round" opacity={0.9} />
      <circle cx={240} cy={44} r={4} fill="#9FF3EB" />
    </svg>
  )
}
