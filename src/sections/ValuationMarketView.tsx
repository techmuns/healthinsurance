import { useState } from 'react'
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from 'recharts'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ExternalLink,
  Info,
  Minus,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { insurers } from '@/data/mockData'
import {
  analystConsensus,
  analystReports,
  coveragePendingCount,
  focalFinancials,
  focalMultiples,
  FOCAL_VALUATION_ID,
  marketSnapshot,
  peerValuation,
  UNLISTED_METHODOLOGY,
  type Rating,
  type ValConfidence,
  type PeerValuationRow,
} from '@/data/valuationData'
import { srcTag, valSrc } from '@/data/valuationSources'
import { useActiveCompany } from '@/state/filters'
import { SourceTag } from '@/components/SourceTag'
import type { Insurer } from '@/data/types'

// ── Colour psychology (kept subtle, light, source-backed) ────────────────────
//   Navy      → trust, institutional seriousness, the focal name
//   Teal      → verified positive signal · upside · value created since listing
//   Green     → strong operating support behind the multiple
//   Gold      → premium valuation · secondary confidence · watch item
//   Blue-gray → neutral analytical context (peers, IPO reference)
//   Coral     → risk · downside · weak support (only where the data is negative)
const NAVY = '#27457E'
const TEAL = '#168E8E'
const GREEN = '#3F9C6B'
const GOLD = '#B68B3A'
const PEER = '#A6B2C6'
const CORAL = '#C2766B'

const clamp = (v: number, lo = 16, hi = 96) => Math.max(lo, Math.min(hi, v))
const fmtCr = (v: number | null) => (v == null ? 'n/a' : v >= 1000 ? `₹${(v / 1000).toFixed(1)}k Cr` : `₹${v.toFixed(0)} Cr`)
const px = (v: number | null) => (v == null ? 'Pending' : `₹${Number.isInteger(v) ? v : v.toFixed(1)}`)
const xMult = (v: number | null, d = 2) => (v == null ? 'n/a' : `${v.toFixed(d)}x`)
const upPct = (v: number | null) => (v == null ? 'Pending' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`)

const ratingTone: Record<Rating, { fg: string; bg: string }> = {
  Buy: { fg: '#0E6F6D', bg: '#E2F4F1' },
  Hold: { fg: '#9A6B12', bg: '#FBF3E2' },
  Sell: { fg: '#B0564A', bg: '#F8ECEC' },
}

const VAL_TONE: Record<ValConfidence, { label: string; fg: string; bg: string; dot: string }> = {
  verified: { label: 'Verified', fg: '#0E6F6D', bg: '#E2F4F1', dot: TEAL },
  secondary: { label: 'Secondary', fg: '#9A6B12', bg: '#FBF3E2', dot: GOLD },
  pending: { label: 'Source pending', fg: '#64748B', bg: '#EEF1F6', dot: '#94A3B8' },
}

/** Verified / Secondary / Source-pending validation status pill. */
function ValPill({ c, className = '' }: { c: ValConfidence; className?: string }) {
  const t = VAL_TONE[c]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none ${className}`} style={{ color: t.fg, background: t.bg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.dot }} />
      {t.label}
    </span>
  )
}

/** Small "Open source" button — one click opens the exact report / filing. */
function OpenSource({ id }: { id: string }) {
  const s = valSrc(id)
  if (!s || !s.source_url) {
    return <span className="inline-flex items-center gap-1 text-[10px] font-medium italic text-ink-secondary/70">Source pending</span>
  }
  return (
    <a
      href={s.source_url}
      target="_blank"
      rel="noreferrer"
      title={`${s.report_title} — opens in a new tab`}
      className="inline-flex items-center gap-1 rounded-full border border-soft-border bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-navy-primary transition-all hover:border-muted-blue hover:bg-white hover:text-navy-deep hover:shadow-soft"
    >
      Open source
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  )
}

function Eyebrow({ label, title, note, right }: { label: string; title: string; note?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-1 h-7 w-1 rounded-full bg-gradient-to-b from-champagne to-champagne-deep" />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">{label}</p>
          <h2 className="mt-0.5 font-display text-[20px] leading-tight text-navy-deep">{title}</h2>
          {note && <p className="mt-0.5 text-[11.5px] text-ink-secondary">{note}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

export function ValuationMarketView() {
  const company = useActiveCompany()
  const isFocal = company.id === FOCAL_VALUATION_ID
  const [peerView, setPeerView] = useState<'Listed' | 'Unlisted' | 'All'>('Listed')

  // ── Real, sourced figures (focal = Niva Bupa) ───────────────────────────────
  const price = marketSnapshot.currentPrice
  const ac = analystConsensus
  const target = ac.consensusTargetPrice
  const upsideConsensus = target != null ? (target / price - 1) * 100 : null

  const pGwp = focalMultiples.pGwp
  const starRow = peerValuation.find((r) => r.companyId === 'star-health')
  const starPGwp = starRow?.pGwp ?? null
  const premiumVsStar = pGwp != null && starPGwp ? ((pGwp - starPGwp) / starPGwp) * 100 : null

  // Verdict headline + stance (the one-line investment takeaway).
  const verdictTitle =
    upsideConsensus == null ? 'Awaiting Street targets'
    : upsideConsensus >= 12 ? 'Upside to Street targets'
    : upsideConsensus >= -3 ? 'Near Street fair value'
    : 'Above Street targets'
  const premiumStance = premiumVsStar != null && premiumVsStar > 5
  const stanceLabel = premiumStance ? 'Premium to listed peers' : premiumVsStar != null && premiumVsStar < -5 ? 'Discount to listed peer' : 'In line with peer'

  // Drivers behind the multiple — all from the FY26 filing.
  const justified = [
    { label: 'Growth · GWP YoY', value: `+${focalFinancials.gwpGrowthFY26.toFixed(0)}%`, strong: focalFinancials.gwpGrowthFY26 >= 15, supports: true },
    { label: 'Profit growth · PAT YoY', value: `+${focalFinancials.patGrowthFY26.toFixed(0)}%`, strong: focalFinancials.patGrowthFY26 >= 15, supports: true },
    { label: 'Net margin · PAT/GWP', value: `${focalFinancials.netMarginFY26.toFixed(1)}%`, strong: focalFinancials.netMarginFY26 >= 4, supports: focalFinancials.netMarginFY26 > 0 },
    { label: 'Retail-health share', value: `${focalFinancials.retailShareFY26.toFixed(1)}%`, strong: focalFinancials.retailShareDeltaBps > 0, supports: true },
  ]
  const supportCount = justified.filter((d) => d.strong).length
  const justifiedVerdict = supportCount >= 3 ? 'Premium looks earned' : supportCount >= 2 ? 'Premium partly earned' : 'Premium hard to justify'

  // ── Operating-quality compass (relative, from insurers[] headline metrics) ──
  const peerGroup = insurers.filter((i) => i.peerGroup === company.peerGroup && i.id !== company.id)
  const avg = (f: (p: (typeof insurers)[number]) => number) => (peerGroup.length ? peerGroup.reduce((s, p) => s + f(p), 0) / peerGroup.length : 0)
  const sc = (g: number, mgn: number, ms: number, solv: number) => ({ Growth: clamp(g * 2.4), Profitability: clamp(48 + mgn * 3 + 12), 'Market Share': clamp(ms * 3.8), 'Balance Sheet': clamp(solv * 22) })
  const nivaScores = sc(company.growth, company.margin, company.marketShare, company.solvency)
  const peerScores = sc(avg((p) => p.growth), avg((p) => p.margin), avg((p) => p.marketShare), avg((p) => p.solvency))
  const compassData = (['Growth', 'Profitability', 'Market Share', 'Balance Sheet'] as const).map((axis) => ({ axis, niva: Math.round(nivaScores[axis]), peer: Math.round(peerScores[axis]) }))
  const compassDelta = compassData.reduce((s, d) => s + d.niva, 0) / 4 - compassData.reduce((s, d) => s + d.peer, 0) / 4
  const position = compassDelta >= 8 ? 'Above Average' : compassDelta <= -8 ? 'Weak vs peers' : 'Average'

  const peerRows = peerValuation
  const shownPeers = peerView === 'All' ? peerRows : peerRows.filter((r) => r.listingStatus === peerView)
  const peerVerdict = premiumVsStar == null ? 'Valuation pending' : premiumVsStar > 5 ? 'Premium to listed peer' : premiumVsStar < -5 ? 'Discount to listed peer' : 'In line with listed peer'

  return (
    <div className="space-y-5">
      {isFocal ? (
        <>
          {/* ═══ 1. VALUATION HERO — verdict (left) + since-listing path (right) ═══ */}
          <section className="relative overflow-hidden rounded-[1.4rem] border border-[#E4E8F0] bg-gradient-to-br from-[#F7FAFD] via-[#FBFCFD] to-[#F4F7FB] p-6 shadow-[0_2px_4px_rgba(23,43,77,0.04),0_18px_44px_rgba(23,43,77,0.08)]">
            <div className="grid items-stretch gap-5 lg:grid-cols-[1fr_1.05fr]">
              {/* Verdict — the single investment takeaway */}
              <div className="flex flex-col">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D6E2FA] bg-soft-blue px-2.5 py-1">
                    <Search className="h-3 w-3 text-navy-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-navy-primary">Valuation Verdict</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold" style={{ color: ratingTone.Buy.fg, background: ratingTone.Buy.bg }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: ratingTone.Buy.fg }} />
                    {ac.ratingLabel}-skewed · {ac.analystCount} analysts
                  </span>
                  {premiumVsStar != null && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#EAD9B6] bg-champagne-soft px-2 py-1 text-[10.5px] font-semibold text-champagne-deep">
                      {stanceLabel}
                    </span>
                  )}
                </div>

                <h1 className="mt-3 font-display text-[26px] leading-[1.12] tracking-tight text-navy-deep">{verdictTitle}</h1>
                <p className="mt-2 max-w-md text-[12px] leading-relaxed text-ink-secondary">
                  {marketSnapshot.company} trades at <b className="text-navy-deep">{px(price)}</b> vs consensus <b className="text-navy-deep">{px(target)}</b> ({upPct(upsideConsensus)}). The {xMult(pGwp)} P/GWP is a {premiumVsStar != null ? `~${Math.abs(premiumVsStar).toFixed(0)}% ${premiumVsStar >= 0 ? 'premium' : 'discount'}` : 'comparison pending'} to Star Health — backed by faster growth.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Tile k="Current price" v={px(price)} sub={marketSnapshot.priceAsOf} />
                  <Tile k="Cons. target" v={px(target)} sub={`${ac.analystCount} analysts`} />
                  <Tile k="Upside" v={upPct(upsideConsensus)} tone={upsideConsensus == null ? 'navy' : upsideConsensus >= 0 ? 'teal' : 'red'} sub="to consensus" />
                  <Tile k="P / GWP" v={xMult(pGwp)} sub="FY26" />
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-4">
                  <SourceTag {...srcTag('niva-price')} />
                  <SourceTag {...srcTag('niva-consensus')} />
                </div>
              </div>

              {/* Since-listing growth path */}
              <SinceListingPath />
            </div>
          </section>

          {/* ═══ 2. STREET VIEW ═══════════════════════════════════════════════════ */}
          <section>
            <Eyebrow label="Street View" title="What does the Street think it's worth?" note={`${ac.analystCount} analysts cover the stock · ${ac.buyCount} Buy · ${ac.holdCount} Hold · ${ac.sellCount} Sell`} right={<ValPill c="secondary" />} />
            <div className="card-surface p-5">
              <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
                {/* Compact KPI grid */}
                <div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {[
                      { k: 'Consensus target', v: px(target), tone: 'navy' as const, sub: 'avg of Street' },
                      { k: 'Current price', v: px(price), tone: 'navy' as const, sub: marketSnapshot.priceAsOf },
                      { k: 'Implied upside', v: upPct(upsideConsensus), tone: (upsideConsensus ?? 0) >= 0 ? ('teal' as const) : ('red' as const), sub: 'to consensus' },
                      { k: 'Highest target', v: px(ac.highestTargetPrice), tone: 'teal' as const, sub: 'Street high' },
                      { k: 'Lowest target', v: px(ac.lowestTargetPrice), tone: 'navy' as const, sub: 'Street low' },
                      { k: 'Analysts', v: `${ac.analystCount}`, tone: 'navy' as const, sub: `${ac.buyCount} Buy · ${ac.sellCount} Sell` },
                    ].map((kpi) => (
                      <div key={kpi.k} className="rounded-xl border border-soft-border bg-ice/50 px-3 py-2.5">
                        <p className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-secondary">{kpi.k}</p>
                        <p className={`mt-1 font-display text-[18px] leading-none ${kpi.tone === 'teal' ? 'text-teal' : kpi.tone === 'red' ? 'text-signal-negative' : 'text-navy-deep'}`}>{kpi.v}</p>
                        <p className="mt-0.5 text-[9px] text-ink-secondary/80">{kpi.sub}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-soft-border bg-white/60 px-3 py-2">
                    <span className="text-[11px] font-semibold text-navy-deep">Rating split</span>
                    <div className="flex h-2.5 w-40 overflow-hidden rounded-full bg-soft-border">
                      <span style={{ width: `${(ac.buyCount / ac.analystCount) * 100}%`, background: ratingTone.Buy.fg }} />
                      <span style={{ width: `${(ac.holdCount / ac.analystCount) * 100}%`, background: ratingTone.Hold.fg }} />
                      <span style={{ width: `${(ac.sellCount / ac.analystCount) * 100}%`, background: ratingTone.Sell.fg }} />
                    </div>
                    <span className="text-[11px] text-ink-secondary"><b className="text-teal">{ac.buyCount} Buy</b> · <b className="text-champagne-deep">{ac.holdCount} Hold</b> · <b className="text-signal-negative">{ac.sellCount} Sell</b></span>
                  </div>
                </div>

                {/* Analyst target range */}
                <div className="rounded-xl border border-soft-border bg-gradient-to-br from-[#FBFCFE] to-[#F4F7FB] p-3.5">
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Where the price sits in the target range</p>
                  <LensRange price={price} target={target} lo={ac.lowestTargetPrice} hi={ac.highestTargetPrice} analysts={ac.analystCount} />
                </div>
              </div>

              {/* Analyst table — every row carries a clickable source + confidence */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-[11.5px]">
                  <thead>
                    <tr className="border-b border-soft-border text-[10px] uppercase tracking-wide text-ink-secondary">
                      <th className="py-1.5 pr-3 font-semibold">Analyst / Source</th>
                      <th className="py-1.5 pr-3 font-semibold">Valuation view</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">Key number</th>
                      <th className="py-1.5 pr-3 font-semibold">Date</th>
                      <th className="py-1.5 pr-3 font-semibold">Source</th>
                      <th className="py-1.5 font-semibold">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analystReports.map((r) => {
                      const up = r.targetPrice != null ? (r.targetPrice / price - 1) * 100 : null
                      return (
                        <tr key={r.brokerage} className="border-b border-[#F2F4F8] align-top last:border-0">
                          <td className="py-2 pr-3">
                            <span className="font-semibold text-navy-deep">{r.brokerage}</span>
                            {r.rating && <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold" style={{ color: ratingTone[r.rating].fg, background: ratingTone[r.rating].bg }}>{r.rating}</span>}
                          </td>
                          <td className="py-2 pr-3 text-ink-secondary">{r.thesis}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            <span className="font-semibold text-navy-deep">{px(r.targetPrice)}</span>
                            {up != null && <span className={`ml-1 text-[10px] ${up >= 0 ? 'text-teal' : 'text-signal-negative'}`}>{upPct(up)}</span>}
                          </td>
                          <td className="whitespace-nowrap py-2 pr-3 text-ink-secondary">{r.reportDate}</td>
                          <td className="py-2 pr-3"><OpenSource id={r.sourceId} /></td>
                          <td className="py-2"><ValPill c={r.confidence} /></td>
                        </tr>
                      )
                    })}
                    {/* Honest coverage gap — never invent the other brokers' targets */}
                    <tr className="align-top">
                      <td className="py-2 pr-3 font-semibold text-ink-secondary">Other brokers ({coveragePendingCount}+)</td>
                      <td className="py-2 pr-3 italic text-ink-secondary">Cover the name, but no citable note on record here</td>
                      <td className="py-2 pr-3 text-right text-ink-secondary">—</td>
                      <td className="py-2 pr-3 text-ink-secondary">—</td>
                      <td className="py-2 pr-3"><span className="text-[10px] font-medium italic text-ink-secondary/70">Source pending</span></td>
                      <td className="py-2"><ValPill c="pending" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10.5px] text-ink-secondary">Targets shown only where a note is citable; the rest are marked <b>Source pending</b>, never invented.</p>
                <SourceTag {...srcTag('niva-consensus')} />
              </div>
            </div>
          </section>

          {/* ═══ 3. MULTIPLE JUSTIFICATION ════════════════════════════════════════ */}
          <section>
            <Eyebrow label="Multiple Justification" title="Is the multiple justified?" note="FY26 · the multiple set against the operating drivers behind it" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.15fr]">
              {/* The multiples */}
              <div className="card-surface relative overflow-hidden p-5">
                <span className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(39,69,126,0.08),transparent_65%)]" />
                <div className="flex items-start justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Valuation Multiples</p>
                  <ValPill c="secondary" />
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <span className="font-display text-[40px] leading-none text-navy-deep">{xMult(pGwp)}</span>
                  <span className="mb-1.5 text-[12px] text-ink-secondary">P / GWP · FY26</span>
                </div>
                <p className="mt-1 text-[11.5px] text-ink-secondary">Price-to-premium — how the market prices each rupee of FY26 gross premium.</p>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-soft-border pt-3">
                  <MiniMult k="P / GWP" v={xMult(pGwp)} id="niva-pgwp" />
                  <MiniMult k="P / E" v={xMult(focalMultiples.pe, 1)} id="niva-pe" />
                  <MiniMult k="P / B" v={xMult(focalMultiples.pb, 1)} id="niva-pb" />
                </div>
              </div>

              {/* Driver validation scorecard */}
              <div className="card-surface flex flex-col p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Does each driver back the premium?</p>
                    <p className="mt-1 text-[11px] text-ink-secondary">Operating drivers from the FY26 filing — fast to scan.</p>
                  </div>
                  <ValPill c="verified" />
                </div>
                <div className="mt-3 grid flex-1 gap-2 sm:grid-cols-2">
                  {justified.map((d) => (
                    <div key={d.label} className="flex items-center gap-2 rounded-xl border border-soft-border bg-ice/50 px-2.5 py-2">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={d.strong ? { background: '#E9F4EC', color: GREEN } : { background: '#FBF3E2', color: GOLD }}>
                        {d.strong ? <Check className="h-3 w-3" /> : <Info className="h-3 w-3" />}
                      </span>
                      <span className="flex-1 truncate text-[11px] text-navy-deep">{d.label}</span>
                      <span className="font-display text-[13px] leading-none tabular-nums text-navy-deep">{d.value}</span>
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={d.strong ? { background: '#E9F4EC', color: GREEN } : { background: '#FBF3E2', color: GOLD }}>{d.strong ? 'Strong' : 'Watch'}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-soft-border pt-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: supportCount >= 3 ? '#E9F4EC' : '#FBF3E2', color: supportCount >= 3 ? GREEN : GOLD }}>
                    {supportCount >= 3 ? <Check className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
                    {justifiedVerdict} · {supportCount}/4 drivers strong
                  </span>
                  <SourceTag {...srcTag('niva-fy26-gwp')} />
                </div>
              </div>
            </div>
          </section>

          {/* ═══ 4. PEER COMPARISON ═══════════════════════════════════════════════ */}
          <section>
            <Eyebrow
              label="Peer Comparison"
              title="How does it compare with peers?"
              note="Listed = live market valuation · Unlisted = no public price (source pending)."
              right={
                <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-ice p-0.5">
                  {(['Listed', 'Unlisted', 'All'] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setPeerView(v)} aria-pressed={peerView === v} className={['rounded-full px-3 py-1 text-[11px] font-semibold transition-all', peerView === v ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white shadow-soft' : 'text-ink-secondary hover:bg-soft-blue hover:text-navy-primary'].join(' ')}>{v} Peers</button>
                  ))}
                </div>
              }
            />
            <div className="card-surface p-5">
              {/* Verdict strip — one line, not a repeated focal point */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-soft-border bg-gradient-to-r from-[#F7FAFD] to-[#F4F7FB] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="font-display text-[17px] leading-none text-navy-deep">{peerVerdict}</h3>
                  {premiumVsStar != null && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${premiumVsStar >= 0 ? 'bg-champagne-soft text-champagne-deep' : 'bg-[#F8ECEC] text-signal-negative'}`}>
                      {premiumVsStar >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {premiumVsStar >= 0 ? '+' : ''}{premiumVsStar.toFixed(0)}% vs Star on P/GWP
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-ink-secondary">Only one listed SAHI peer (Star Health); others are unlisted.</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11.5px]">
                  <thead>
                    <tr className="border-b border-soft-border text-[10px] uppercase tracking-wide text-ink-secondary">
                      <th className="py-1.5 pr-2 font-semibold">Company</th>
                      <th className="py-1.5 pr-2 font-semibold">Status</th>
                      <th className="py-1.5 pr-2 text-right font-semibold">GWP (FY26)</th>
                      <th className="py-1.5 pr-2 text-right font-semibold">P/GWP</th>
                      <th className="py-1.5 pr-2 text-right font-semibold">Equity value</th>
                      <th className="py-1.5 pr-2 font-semibold">Source</th>
                      <th className="py-1.5 font-semibold">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownPeers.map((r) => {
                      const unlisted = r.listingStatus === 'Unlisted'
                      return (
                        <tr key={r.companyId} className={`border-b border-[#F2F4F8] last:border-0 ${r.companyId === FOCAL_VALUATION_ID ? 'bg-soft-blue/40' : ''}`}>
                          <td className="py-2 pr-2 font-semibold text-navy-deep">{r.companyName}{r.companyId === FOCAL_VALUATION_ID && <span className="ml-1 text-[9px] font-bold uppercase text-champagne-deep">·focal</span>}</td>
                          <td className="py-2 pr-2"><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${unlisted ? 'border border-dashed border-[#C9CFD9] text-ink-secondary' : 'bg-soft-blue text-navy-primary'}`}>{unlisted ? 'Unlisted' : 'Listed'}</span></td>
                          <td className="py-2 pr-2 text-right tabular-nums text-navy-deep">{r.gwp != null ? fmtCr(r.gwp) : <span className="italic text-ink-secondary">n/a</span>}</td>
                          <td className="py-2 pr-2 text-right tabular-nums text-navy-deep">{r.pGwp != null ? xMult(r.pGwp) : <span className="italic text-ink-secondary">n/a</span>}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{r.marketCap != null ? <span className="text-navy-deep">{fmtCr(r.marketCap)}</span> : <span className="italic text-ink-secondary">{unlisted ? 'No public price' : 'Source pending'}</span>}</td>
                          <td className="py-2 pr-2"><OpenSource id={r.sourceId} /></td>
                          <td className="py-2"><ValPill c={r.confidence} /></td>
                        </tr>
                      )
                    })}
                    {shownPeers.length === 0 && (
                      <tr><td colSpan={7} className="py-4 text-center text-[11px] italic text-ink-secondary">No peers in this view.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {peerView !== 'Listed' && (
                <p className="mt-3 flex items-start gap-1.5 rounded-md border border-dashed border-[#D7CBA8] bg-[#FBF6EA]/60 px-2.5 py-1.5 text-[10.5px] leading-snug text-[#8C6B1A]">
                  <Info className="mt-px h-3 w-3 shrink-0" />
                  {UNLISTED_METHODOLOGY}
                </p>
              )}
              <div className="mt-3 flex justify-end"><SourceTag {...srcTag('star-pgwp')} /></div>
            </div>
          </section>
        </>
      ) : (
        <ValuationPending company={company} peerRow={peerValuation.find((r) => r.companyId === company.id) ?? null} />
      )}

      {/* ═══ 5. QUALITY LENS — supports whether the premium is earned ════════════ */}
      <section>
        <Eyebrow
          label="Quality Lens"
          title="Is the premium supported by operating quality?"
          note={`Relative scores on the operating metrics behind the multiple · vs ${company.peerGroup} peer average.`}
          right={<ValPill c="secondary" />}
        />
        <div className="card-surface p-5">
          <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[1.1fr_1fr]">
            <div style={{ width: '100%', height: 210 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={compassData} outerRadius="76%" margin={{ top: 8, right: 30, bottom: 8, left: 30 }}>
                  <PolarGrid stroke="#E3E8F0" />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9.5, fill: '#64748B' }} />
                  <Radar name="Peer avg" dataKey="peer" stroke={PEER} fill={PEER} fillOpacity={0.16} strokeWidth={1.3} />
                  <Radar name={company.shortName} dataKey="niva" stroke={NAVY} fill={NAVY} fillOpacity={0.26} strokeWidth={1.8} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: position === 'Above Average' ? '#C8E2DD' : position === 'Weak vs peers' ? '#EAD2CD' : '#D6E2FA', background: position === 'Above Average' ? '#EAF5EE' : position === 'Weak vs peers' ? '#F8ECEC' : '#EAF0FB' }}>
                <span className="font-display text-[18px] leading-none" style={{ color: position === 'Above Average' ? GREEN : position === 'Weak vs peers' ? CORAL : NAVY }}>{position}</span>
                <span className="text-[10px] text-ink-secondary">operating quality</span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-1.5">
                {compassData.map((d) => {
                  const ahead = d.niva >= d.peer
                  return (
                    <div key={d.axis} className="flex items-center gap-2 text-[11px]">
                      <span className="w-[88px] shrink-0 text-ink-secondary">{d.axis}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-soft-border">
                        <span className="block h-full rounded-full" style={{ width: `${d.niva}%`, background: ahead ? GREEN : NAVY }} />
                      </div>
                      <span className="w-8 text-right text-[10.5px] font-semibold" style={{ color: ahead ? GREEN : '#64748B' }}>{ahead ? `+${d.niva - d.peer}` : d.niva - d.peer}</span>
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-[9.5px] text-ink-secondary">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: NAVY }} />{company.shortName}</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: PEER }} />Peer avg</span>
                <span className="ml-1">· operating quality, not valuation</span>
              </p>
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}

// ── Since-listing growth path ─────────────────────────────────────────────────
// IPO → Current → Return, as a premium horizontal journey (not boxes / not a
// trading terminal). IPO sits in neutral blue-gray, current is highlighted teal,
// and value created since listing reads in soft teal/green. A compact 52-week
// band underneath gives honest price context. All figures are sourced (niva-ipo,
// niva-price, niva-52wk).
function SinceListingPath() {
  const ipo = marketSnapshot.ipoPrice
  const cur = marketSnapshot.currentPrice
  const lo = marketSnapshot.weekLow52
  const hi = marketSnapshot.weekHigh52
  const ret = (cur / ipo - 1) * 100
  const up = ret >= 0
  const retColor = up ? TEAL : CORAL
  const at = (v: number) => Math.max(3, Math.min(97, ((v - lo) / (hi - lo)) * 100))

  return (
    <div className="flex flex-col rounded-2xl border border-soft-border bg-white/75 p-4 shadow-soft backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Since Listing · {marketSnapshot.listDate.replace(/^\d+\s/, '')} → now</p>
        <ValPill c="verified" />
      </div>

      {/* Journey: IPO → Current → Return */}
      <div className="mt-4 flex items-stretch gap-2">
        <JourneyNode label="IPO issue" value={px(ipo)} sub={marketSnapshot.listDate} tone="neutral" />
        <JourneyConnector />
        <JourneyNode label="Current" value={px(cur)} sub={marketSnapshot.priceAsOf} tone="teal" highlight />
        <JourneyConnector />
        <div className="flex min-w-[88px] flex-1 flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center" style={{ borderColor: up ? '#C8E2DD' : '#EAD2CD', background: up ? 'linear-gradient(135deg,#EAF5EE,#F1F8F6)' : '#F8ECEC' }}>
          <span className="inline-flex items-center gap-0.5 font-display text-[20px] leading-none" style={{ color: retColor }}>
            {up ? <ArrowUpRight className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {up ? '+' : ''}{ret.toFixed(1)}%
          </span>
          <span className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Return since listing</span>
        </div>
      </div>

      {/* 52-week band context */}
      <div className="mt-5">
        <div className="relative h-2 rounded-full" style={{ background: 'linear-gradient(90deg,#EEF1F6,#E6F4F1)' }}>
          {/* value-created segment from IPO → current */}
          <span className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full" style={{ left: `${Math.min(at(ipo), at(cur))}%`, width: `${Math.abs(at(cur) - at(ipo))}%`, background: up ? 'rgba(22,142,142,0.28)' : 'rgba(194,118,107,0.28)' }} />
          <span className="absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${at(ipo)}%`, background: PEER }} title={`IPO ${px(ipo)}`} />
          <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: `${at(cur)}%`, background: TEAL }} title={`Now ${px(cur)}`} />
        </div>
        <div className="mt-1.5 flex justify-between text-[9px] text-ink-secondary">
          <span>52-wk low <b className="text-navy-deep/70">{px(lo)}</b></span>
          <span>52-wk high <b className="text-navy-deep/70">{px(hi)}</b></span>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="text-[10px] text-ink-secondary">Listed <b className="text-navy-deep/80">{px(marketSnapshot.listPrice)}</b> · issue <b className="text-navy-deep/80">{px(ipo)}</b></span>
        <SourceTag {...srcTag('niva-ipo')} />
      </div>
    </div>
  )
}

function JourneyNode({ label, value, sub, tone, highlight = false }: { label: string; value: string; sub?: string; tone: 'neutral' | 'teal'; highlight?: boolean }) {
  const style = tone === 'teal'
    ? { borderColor: highlight ? '#9FD6CF' : '#C8E2DD', background: 'linear-gradient(135deg,#F1F8F6,#E1F2F1)' }
    : { borderColor: '#D7DEE9', background: 'linear-gradient(135deg,#F6F8FC,#EEF1F7)' }
  return (
    <div className="relative flex min-w-[84px] flex-1 flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center" style={style}>
      {highlight && <span className="absolute -top-1.5 right-2 inline-flex h-2 w-2 rounded-full ring-2 ring-white" style={{ background: TEAL }} />}
      <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</span>
      <span className="mt-0.5 font-display text-[20px] leading-none" style={{ color: tone === 'teal' ? TEAL : NAVY }}>{value}</span>
      {sub && <span className="mt-0.5 text-[8.5px] text-ink-secondary/80">{sub}</span>}
    </div>
  )
}

function JourneyConnector() {
  return (
    <div className="flex shrink-0 items-center self-center text-ink-secondary/50">
      <ArrowRight className="h-4 w-4" />
    </div>
  )
}

// ── Per-company pending state ─────────────────────────────────────────────────
// Shown when the selected company is NOT the focal listed name. We never render
// the focal company's price / targets / multiples under another company's label.
function ValuationPending({ company, peerRow }: { company: Insurer; peerRow: PeerValuationRow | null }) {
  const listed = peerRow?.listingStatus === 'Listed'
  const hasMultiples = peerRow != null && peerRow.pGwp != null
  return (
    <section className="relative overflow-hidden rounded-[1.4rem] border border-[#E4E8F0] bg-gradient-to-br from-[#F7FAFD] via-[#FBFCFD] to-[#F4F7FB] p-6 shadow-[0_2px_4px_rgba(23,43,77,0.04),0_18px_44px_rgba(23,43,77,0.08)]">
      <Eyebrow
        label="Valuation"
        title={`Sourced valuation pending for ${company.shortName}`}
        note="Live, source-backed valuation is wired for the focal listed name today — never shown under another company's label."
        right={<ValPill c="pending" />}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_1fr]">
        <div className="card-surface p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">What we have for {company.shortName}</p>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${listed ? 'bg-soft-blue text-navy-primary' : 'border border-dashed border-[#C9CFD9] text-ink-secondary'}`}>{listed ? 'Listed' : 'Unlisted'}</span>
          </div>
          {hasMultiples ? (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Tile k="P / GWP" v={xMult(peerRow!.pGwp)} sub="FY26" />
                <Tile k="P / E" v={xMult(peerRow!.pe, 1)} sub="FY26" />
                <Tile k="GWP" v={fmtCr(peerRow!.gwp)} sub="FY26" />
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-ink-secondary">
                {company.shortName}'s own market multiples are sourced. The full valuation story — analyst targets, price history and the verdict — is wired for the focal name and will extend to {company.shortName} as its coverage is sourced.
              </p>
              <div className="mt-3 flex justify-end"><OpenSource id={peerRow!.sourceId} /></div>
            </>
          ) : (
            <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
              {listed
                ? `${company.shortName} is listed — market multiples will populate here once its price and FY26 GWP are sourced.`
                : `${company.shortName} is unlisted: there is no public market price, so we don't publish an equity value. Marked source pending — never estimated.`}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-dashed border-[#D7CBA8] bg-[#FBF6EA]/60 p-5 text-[#8C6B1A]">
          <div className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            <p className="text-[10px] font-bold uppercase tracking-[0.16em]">Coverage</p>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed">
            Full live valuation — current price, analyst consensus, multiples and the peer verdict — is sourced for <b>Niva Bupa (NSE: NIVABUPA)</b>. Every other company shows its own real figures where available and an honest <b>source pending</b> otherwise. We never display one company's numbers under another's name.
          </p>
          <p className="mt-2 text-[10.5px] leading-relaxed opacity-90">
            The operating-quality view below is computed from {company.shortName}'s own reported metrics, so it stays meaningful for every company.
          </p>
        </div>
      </div>
    </section>
  )
}

// ── Building blocks ──────────────────────────────────────────────────────────

function Tile({ k, v, sub, tone = 'navy' }: { k: string; v: string; sub?: string; tone?: 'navy' | 'teal' | 'amber' | 'red' }) {
  const c = tone === 'teal' ? 'text-teal' : tone === 'red' ? 'text-signal-negative' : tone === 'amber' ? 'text-champagne-deep' : 'text-navy-deep'
  return (
    <div className="rounded-lg border border-soft-border bg-white px-2.5 py-1.5">
      <p className="whitespace-nowrap text-[8.5px] font-semibold uppercase text-ink-secondary">{k}</p>
      <p className={`mt-0.5 font-display text-[16px] leading-none ${c}`}>{v}</p>
      {sub && <p className="mt-0.5 text-[8.5px] text-ink-secondary/80">{sub}</p>}
    </div>
  )
}

function MiniMult({ k, v, id }: { k: string; v: string; id: string }) {
  return (
    <div className="rounded-lg bg-ice/60 px-2.5 py-1.5 text-center">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">{k}</p>
      <p className="mt-0.5 font-display text-[15px] leading-none text-navy-deep">{v}</p>
      <div className="mt-1 flex justify-center"><OpenSource id={id} /></div>
    </div>
  )
}

function LensRange({ price, target, lo, hi, analysts }: { price: number; target: number | null; lo: number | null; hi: number | null; analysts: number }) {
  if (lo == null || hi == null || hi <= lo) return <p className="mt-3 text-[10px] text-ink-secondary">Target range pending.</p>
  const pct = (v: number) => Math.max(2, Math.min(98, ((v - lo) / (hi - lo)) * 100))
  const near = Math.abs(price - (target ?? price)) / (target ?? price) < 0.04
  const priceTone = near ? GOLD : target != null && price < target ? TEAL : CORAL
  return (
    <div className="mt-3">
      <p className="mb-1 text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary">Analyst target range · {analysts} analysts</p>
      <div className="relative h-2 rounded-full" style={{ background: 'linear-gradient(90deg,#F8ECEC,#FBF3E2,#E6F4F1)' }}>
        {target != null && <span className="absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-navy-primary/45" style={{ left: `${pct(target)}%` }} />}
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: `${pct(price)}%`, background: priceTone }} />
      </div>
      <div className="mt-1 flex justify-between text-[8.5px] text-ink-secondary">
        <span>Low {px(lo)}</span>
        <span className="font-semibold text-navy-deep/70">Cons. {px(target)}</span>
        <span>High {px(hi)}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[8.5px] text-ink-secondary">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: priceTone }} />Price</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-navy-primary/45" />Consensus</span>
        <span className="inline-flex items-center gap-1"><Minus className="h-2.5 w-2.5" /> {near ? 'near fair value' : target != null && price < target ? 'below target' : 'above target'}</span>
      </div>
    </div>
  )
}
