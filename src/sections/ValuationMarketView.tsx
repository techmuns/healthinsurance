import { useState } from 'react'
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from 'recharts'
import { Check, ChevronDown, ExternalLink, Flame, Info, Search, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react'
import { insurers } from '@/data/mockData'
import {
  analystConsensus,
  analystReports,
  analystThesis,
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

const NAVY = '#27457E'
const TEAL = '#168E8E'
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
  const [showTable, setShowTable] = useState(false)
  const [openChip, setOpenChip] = useState<string | null>(null)

  // ── Real, sourced figures (focal = Niva Bupa) ───────────────────────────────
  const price = marketSnapshot.currentPrice
  const ac = analystConsensus
  const target = ac.consensusTargetPrice
  const upsideConsensus = target != null ? (target / price - 1) * 100 : null
  const mosl = analystReports.find((r) => r.brokerage === 'Motilal Oswal')
  const upsideMosl = mosl?.targetPrice != null ? (mosl.targetPrice / price - 1) * 100 : null

  const pGwp = focalMultiples.pGwp
  const starRow = peerValuation.find((r) => r.companyId === 'star-health')
  const starPGwp = starRow?.pGwp ?? null
  const premiumVsStar = pGwp != null && starPGwp ? ((pGwp - starPGwp) / starPGwp) * 100 : null
  const sinceIpo = (price / marketSnapshot.ipoPrice - 1) * 100

  const verdictTitle = upsideConsensus == null ? 'Awaiting Street targets' : upsideConsensus >= 12 ? 'Upside to Street targets' : upsideConsensus >= 0 ? 'Near Street fair value' : 'Above Street targets'

  // Drivers behind the multiple — all from the FY26 filing.
  const justified = [
    { label: 'Growth (GWP YoY)', value: `+${focalFinancials.gwpGrowthFY26.toFixed(0)}%`, strong: focalFinancials.gwpGrowthFY26 >= 15, supports: true },
    { label: 'Profit growth (PAT YoY)', value: `+${focalFinancials.patGrowthFY26.toFixed(0)}%`, strong: focalFinancials.patGrowthFY26 >= 15, supports: true },
    { label: 'Net margin (PAT/GWP)', value: `${focalFinancials.netMarginFY26.toFixed(1)}%`, strong: focalFinancials.netMarginFY26 >= 4, supports: focalFinancials.netMarginFY26 > 0 },
    { label: 'Retail-health share', value: `${focalFinancials.retailShareFY26.toFixed(1)}%`, strong: focalFinancials.retailShareDeltaBps > 0, supports: true },
  ]

  // ── Operating-quality compass (relative, from insurers[] headline metrics) ──
  const peerGroup = insurers.filter((i) => i.peerGroup === company.peerGroup && i.id !== company.id)
  const avg = (f: (p: (typeof insurers)[number]) => number) => (peerGroup.length ? peerGroup.reduce((s, p) => s + f(p), 0) / peerGroup.length : 0)
  const sc = (g: number, mgn: number, ms: number, solv: number) => ({ Growth: clamp(g * 2.4), Profitability: clamp(48 + mgn * 3 + 12), 'Market Share': clamp(ms * 3.8), 'Balance Sheet': clamp(solv * 22) })
  const nivaScores = sc(company.growth, company.margin, company.marketShare, company.solvency)
  const peerScores = sc(avg((p) => p.growth), avg((p) => p.margin), avg((p) => p.marketShare), avg((p) => p.solvency))
  const compassData = (['Growth', 'Profitability', 'Market Share', 'Balance Sheet'] as const).map((axis) => ({ axis, niva: Math.round(nivaScores[axis]), peer: Math.round(peerScores[axis]) }))
  const position = compassData.reduce((s, d) => s + d.niva, 0) / 4 >= compassData.reduce((s, d) => s + d.peer, 0) / 4 + 8 ? 'Above Average' : 'In Line'

  // ── Relative multiples vs the one listed SAHI peer (Star Health) ────────────
  const relMetrics = [
    { label: 'P / GWP', niva: pGwp, peer: starPGwp },
    { label: 'P / E', niva: focalMultiples.pe, peer: starRow?.pe ?? null },
  ]

  const peerRows = peerValuation
  const shownPeers = peerView === 'All' ? peerRows : peerRows.filter((r) => r.listingStatus === peerView)

  const peerVerdict = premiumVsStar == null ? 'Valuation pending' : premiumVsStar > 5 ? 'Premium to listed peer' : premiumVsStar < -5 ? 'Discount to listed peer' : 'In line with listed peer'
  const peerVerdictLine =
    premiumVsStar == null
      ? 'Peer comparison is pending.'
      : premiumVsStar > 5
        ? `Niva Bupa trades at a ~${premiumVsStar.toFixed(0)}% premium to Star Health on P/GWP. The premium is backed by faster growth (GWP +${focalFinancials.gwpGrowthFY26.toFixed(0)}% vs +${starRow?.growth?.toFixed(0)}%) and PAT +${focalFinancials.patGrowthFY26.toFixed(0)}%.`
        : `Niva Bupa trades broadly in line with Star Health on P/GWP.`

  const chips = [
    { key: 'Bull case', Icon: TrendingUp, items: analystThesis.bull },
    { key: 'Bear case', Icon: TrendingDown, items: analystThesis.bear },
    { key: 'Risks', Icon: ShieldAlert, items: analystThesis.risks },
    { key: 'Catalysts', Icon: Flame, items: analystThesis.catalysts },
  ]
  const openItems = chips.find((c) => c.key === openChip)?.items.slice(0, 4) ?? []

  return (
    <div className="space-y-5">
      {isFocal ? (
      <>
      {/* ── 1. Verdict + Valuation Lens ───────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[1.4rem] border border-[#E4E8F0] bg-gradient-to-br from-[#F7FAFD] via-[#FBFCFD] to-[#F4F7FB] p-6 shadow-[0_2px_4px_rgba(23,43,77,0.04),0_18px_44px_rgba(23,43,77,0.08)]">
        <div className="grid items-center gap-5 lg:grid-cols-[1fr_1.15fr]">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D6E2FA] bg-soft-blue px-2.5 py-1">
              <Search className="h-3 w-3 text-navy-primary" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-navy-primary">Valuation Verdict</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[25px] leading-tight tracking-tight text-navy-deep">{verdictTitle}</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color: ratingTone.Buy.fg, background: ratingTone.Buy.bg }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: ratingTone.Buy.fg }} />
                {ac.ratingLabel}-skewed · {ac.analystCount} analysts
              </span>
            </div>
            <p className="mt-2 max-w-md text-[12px] leading-relaxed text-ink-secondary">
              {marketSnapshot.company} ({marketSnapshot.ticker}) trades at <b className="text-navy-deep">{px(price)}</b> vs consensus <b className="text-navy-deep">{px(target)}</b> ({upPct(upsideConsensus)}). Motilal Oswal sees {px(mosl?.targetPrice ?? null)} ({upPct(upsideMosl)}). The {xMult(pGwp)} P/GWP is a ~{premiumVsStar?.toFixed(0)}% premium to Star Health — backed by faster growth.
            </p>
          </div>

          <div className="rounded-2xl border border-soft-border bg-white/75 p-3.5 shadow-soft backdrop-blur">
            <div className="flex items-center justify-between">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Valuation Lens · {marketSnapshot.company}</p>
              <ValPill c="secondary" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile k="Current price" v={px(price)} sub={marketSnapshot.priceAsOf} />
              <Tile k="Cons. target" v={px(target)} sub={`${ac.analystCount} analysts`} />
              <Tile k="P / GWP" v={xMult(pGwp)} sub="FY26" />
              <Tile k="Upside" v={upPct(upsideConsensus)} tone={upsideConsensus == null ? 'navy' : upsideConsensus >= 0 ? 'teal' : 'red'} sub="to consensus" />
            </div>
            <LensRange price={price} target={target} lo={ac.lowestTargetPrice} hi={ac.highestTargetPrice} />
          </div>
        </div>
        <div className="relative mt-3 flex justify-end gap-2">
          <SourceTag {...srcTag('niva-price')} />
          <SourceTag {...srcTag('niva-consensus')} />
        </div>
      </section>

      {/* ── 2. Valuation at a glance ──────────────────────────────────────────── */}
      <section>
        <Eyebrow label="Valuation at a Glance" title="Is the multiple justified?" note="FY26 · multiple vs the drivers behind it" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card-surface relative overflow-hidden p-5">
            <span className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(22,142,142,0.10),transparent_65%)]" />
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Valuation Multiples</p>
              <GrowthGlyph />
            </div>
            <div className="mt-3 flex items-end gap-2">
              <span className="font-display text-[38px] leading-none text-navy-deep">{xMult(pGwp)}</span>
              <span className="mb-1 text-[12px] text-ink-secondary">P/GWP · FY26 · vs Star <b className="text-navy-deep">{xMult(starPGwp)}</b></span>
            </div>
            {premiumVsStar != null && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-teal-soft px-2.5 py-1 text-[12px] font-semibold text-teal">
                <TrendingUp className="h-3.5 w-3.5" />
                {premiumVsStar >= 0 ? '+' : ''}{premiumVsStar.toFixed(0)}% {premiumVsStar >= 0 ? 'premium' : 'discount'} to Star Health
              </div>
            )}
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-soft-border pt-3">
              <MiniMult k="P / GWP" v={xMult(pGwp)} id="niva-pgwp" />
              <MiniMult k="P / E" v={xMult(focalMultiples.pe, 1)} id="niva-pe" />
              <MiniMult k="P / B" v={xMult(focalMultiples.pb, 1)} id="niva-pb" />
            </div>
          </div>

          <div className="card-surface p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Is the Premium Justified?</p>
                <p className="mt-1 text-[11px] text-ink-secondary">Does each driver back a premium multiple?</p>
              </div>
              <ValPill c="verified" />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {justified.map((d) => (
                <div key={d.label} className="flex items-center gap-2 rounded-lg bg-ice/60 px-2.5 py-2">
                  <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${d.supports ? 'bg-teal/15 text-teal' : 'bg-champagne-soft text-champagne-deep'}`}>{d.supports ? <Check className="h-2.5 w-2.5" /> : <Info className="h-2.5 w-2.5" />}</span>
                  <span className="flex-1 truncate text-[11px] text-navy-deep">{d.label}</span>
                  <span className="font-display text-[13px] leading-none text-navy-deep tabular-nums">{d.value}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${d.strong ? 'bg-teal-soft text-teal' : 'bg-champagne-soft text-champagne-deep'}`}>{d.strong ? 'Strong' : 'Watch'}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end"><SourceTag {...srcTag('niva-fy26-gwp')} /></div>
          </div>
        </div>
      </section>

      {/* ── 3. Street view ────────────────────────────────────────────────────── */}
      <section>
        <Eyebrow label="Street View" title="What do analysts think it's worth?" note={`${ac.analystCount} analysts cover the stock · ${ac.buyCount} Buy · ${ac.sellCount} Sell`} right={<ValPill c="secondary" />} />
        <div className="card-surface p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { k: 'Consensus target', v: px(target), tone: 'navy' },
              { k: 'Current price', v: px(price), tone: 'navy' },
              { k: 'Implied upside', v: upPct(upsideConsensus), tone: 'teal' },
              { k: 'Highest target', v: px(ac.highestTargetPrice), tone: 'navy' },
              { k: 'Lowest target', v: px(ac.lowestTargetPrice), tone: 'navy' },
              { k: 'Analysts', v: `${ac.analystCount}`, tone: 'navy' },
            ].map((kpi) => (
              <div key={kpi.k} className="rounded-xl border border-soft-border bg-ice/50 px-3 py-2.5">
                <p className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-secondary">{kpi.k}</p>
                <p className={`mt-1 font-display text-[17px] leading-none ${kpi.tone === 'teal' ? 'text-teal' : 'text-navy-deep'}`}>{kpi.v}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-semibold text-navy-deep">Rating split</span>
            <div className="flex h-2.5 w-40 overflow-hidden rounded-full bg-soft-border">
              <span style={{ width: `${(ac.buyCount / ac.analystCount) * 100}%`, background: ratingTone.Buy.fg }} />
              <span style={{ width: `${(ac.holdCount / ac.analystCount) * 100}%`, background: ratingTone.Hold.fg }} />
              <span style={{ width: `${(ac.sellCount / ac.analystCount) * 100}%`, background: ratingTone.Sell.fg }} />
            </div>
            <span className="text-[11px] text-ink-secondary"><b className="text-teal">{ac.buyCount} Buy</b> · <b className="text-champagne-deep">{ac.holdCount} Hold</b> · <b className="text-signal-negative">{ac.sellCount} Sell</b></span>
          </div>

          {/* Analyst table — every row carries a clickable source + confidence */}
          <div className="mt-3 overflow-x-auto">
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
                    <tr key={r.brokerage} className="border-b border-[#F2F4F8] last:border-0 align-top">
                      <td className="py-2 pr-3">
                        <span className="font-semibold text-navy-deep">{r.brokerage}</span>
                        {r.rating && <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold" style={{ color: ratingTone[r.rating].fg, background: ratingTone[r.rating].bg }}>{r.rating}</span>}
                      </td>
                      <td className="py-2 pr-3 text-ink-secondary">{r.thesis}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        <span className="font-semibold text-navy-deep">{px(r.targetPrice)}</span>
                        {up != null && <span className={`ml-1 text-[10px] ${up >= 0 ? 'text-teal' : 'text-signal-negative'}`}>{upPct(up)}</span>}
                      </td>
                      <td className="py-2 pr-3 text-ink-secondary whitespace-nowrap">{r.reportDate}</td>
                      <td className="py-2 pr-3"><OpenSource id={r.sourceId} /></td>
                      <td className="py-2"><ValPill c={r.confidence} /></td>
                    </tr>
                  )
                })}
                {/* Honest coverage gap — never invent the other brokers' targets */}
                <tr className="align-top">
                  <td className="py-2 pr-3 font-semibold text-ink-secondary">Other brokers ({coveragePendingCount}+)</td>
                  <td className="py-2 pr-3 text-ink-secondary italic">Cover the name, but no citable note on record here</td>
                  <td className="py-2 pr-3 text-right text-ink-secondary">—</td>
                  <td className="py-2 pr-3 text-ink-secondary">—</td>
                  <td className="py-2 pr-3"><span className="text-[10px] font-medium italic text-ink-secondary/70">Source pending</span></td>
                  <td className="py-2"><ValPill c="pending" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[10.5px] text-ink-secondary">Targets shown only where a note is citable; the rest are marked <b>Source pending</b>, never invented.</p>
            <SourceTag {...srcTag('niva-consensus')} />
          </div>
        </div>
      </section>

      {/* ── 4. Peer valuation ─────────────────────────────────────────────────── */}
      <section>
        <Eyebrow
          label="Peer Valuation"
          title="How does it compare with peers?"
          note="Listed = market valuation · Unlisted = no public price (source pending)."
          right={
            <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-ice p-0.5">
              {(['Listed', 'Unlisted', 'All'] as const).map((v) => (
                <button key={v} type="button" onClick={() => { setPeerView(v); setShowTable(true) }} aria-pressed={peerView === v} className={['rounded-full px-3 py-1 text-[11px] font-semibold transition-all', peerView === v ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white shadow-soft' : 'text-ink-secondary hover:bg-soft-blue hover:text-navy-primary'].join(' ')}>{v} Peers</button>
              ))}
            </div>
          }
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.05fr]">
          {/* Verdict card */}
          <div className="card-surface relative overflow-hidden p-5">
            <span className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(182,139,58,0.10),transparent_65%)]" />
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Peer Valuation Verdict</p>
              <ValPill c="secondary" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <h3 className="font-display text-[22px] leading-none text-navy-deep">{peerVerdict}</h3>
              {premiumVsStar != null && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${premiumVsStar >= 0 ? 'bg-teal-soft text-teal' : 'bg-[#F8ECEC] text-signal-negative'}`}>
                  {premiumVsStar >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {premiumVsStar >= 0 ? 'Premium' : 'Discount'}
                </span>
              )}
            </div>
            <div className="mt-3 flex items-end gap-2">
              <span className="font-display text-[40px] leading-none text-navy-deep">{xMult(pGwp)}</span>
              <span className="mb-1.5 text-[12px] text-ink-secondary">P/GWP · FY26</span>
            </div>
            <p className="mt-1 text-[12px] text-ink-secondary">
              vs Star Health <b className="text-navy-deep">{xMult(starPGwp)}</b>
              {premiumVsStar != null && <> · <b className={premiumVsStar >= 0 ? 'text-teal' : 'text-signal-negative'}>{premiumVsStar >= 0 ? '+' : ''}{premiumVsStar.toFixed(0)}% {premiumVsStar >= 0 ? 'premium' : 'discount'}</b></>}
            </p>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">{peerVerdictLine}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <PeerChip name="Niva Bupa" mult={pGwp} tag="Focal" tone="focal" />
              <PeerChip name="Star Health" mult={starPGwp} tag="Listed" tone="listed" />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-soft-border pt-3">
              <button type="button" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable} className="inline-flex items-center gap-1 text-[11px] font-semibold text-navy-primary transition-colors hover:text-navy-deep">
                {showTable ? 'Hide peer details' : 'View peer details'}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showTable ? 'rotate-180' : ''}`} />
              </button>
              <SourceTag {...srcTag('star-pgwp')} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="card-surface p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Niva Bupa vs Star Health</p>
                <ValPill c="secondary" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {relMetrics.map((m) => {
                  const max = Math.max(m.niva ?? 0, m.peer ?? 0, 0.1)
                  const prem = m.niva != null && m.peer ? ((m.niva - m.peer) / m.peer) * 100 : null
                  return (
                    <div key={m.label} className="text-center">
                      <p className="text-[10.5px] font-semibold text-navy-deep/75">{m.label}</p>
                      <div className="mt-1.5 flex h-[58px] items-end justify-center gap-1.5">
                        <Bar value={m.niva} max={max} color={NAVY} label={xMult(m.niva, m.label === 'P / E' ? 1 : 2)} />
                        <Bar value={m.peer} max={max} color={PEER} label={xMult(m.peer, m.label === 'P / E' ? 1 : 2)} />
                      </div>
                      {prem != null && <p className={`mt-1 text-[10.5px] font-semibold ${prem >= 0 ? 'text-teal' : 'text-signal-negative'}`}>{prem >= 0 ? '+' : ''}{prem.toFixed(0)}%</p>}
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 flex items-center gap-3 border-t border-soft-border pt-1.5 text-[9.5px] text-ink-secondary">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-[2px]" style={{ background: NAVY }} />Niva Bupa</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-[2px]" style={{ background: PEER }} />Star Health</span>
              </div>
            </div>

            {/* Real "since listing" levels (replaces the impossible 5-yr mock trend) */}
            <div className="card-surface p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Since Listing <span className="text-ink-secondary/60">Nov 2024 → now</span></p>
                <ValPill c="verified" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Tile k="IPO issue" v={px(marketSnapshot.ipoPrice)} sub={marketSnapshot.listDate} />
                <Tile k="Now" v={px(price)} sub={marketSnapshot.priceAsOf} tone="teal" />
                <Tile k="vs IPO" v={`${sinceIpo >= 0 ? '+' : ''}${sinceIpo.toFixed(1)}%`} tone={sinceIpo >= 0 ? 'teal' : 'red'} sub="price" />
              </div>
              <div className="mt-3">
                <div className="relative h-2 rounded-full bg-soft-border">
                  {(() => {
                    const lo = marketSnapshot.weekLow52
                    const hi = marketSnapshot.weekHigh52
                    const at = (v: number) => Math.max(2, Math.min(98, ((v - lo) / (hi - lo)) * 100))
                    return (
                      <>
                        <span className="absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-navy-primary/40" style={{ left: `${at(marketSnapshot.ipoPrice)}%` }} title={`IPO ${px(marketSnapshot.ipoPrice)}`} />
                        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal ring-2 ring-white" style={{ left: `${at(price)}%` }} title={`Now ${px(price)}`} />
                      </>
                    )
                  })()}
                </div>
                <div className="mt-1 flex justify-between text-[8.5px] text-ink-secondary">
                  <span>52-wk low {px(marketSnapshot.weekLow52)}</span>
                  <span>52-wk high {px(marketSnapshot.weekHigh52)}</span>
                </div>
              </div>
              <div className="mt-2 flex justify-end"><SourceTag {...srcTag('niva-ipo')} /></div>
            </div>
          </div>
        </div>

        {/* Full peer table */}
        {showTable && (
          <div className="card-surface mt-4 p-5">
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
                        <td className="py-1.5 pr-2 font-semibold text-navy-deep">{r.companyName}{r.companyId === FOCAL_VALUATION_ID && <span className="ml-1 text-[9px] font-bold uppercase text-champagne-deep">·focal</span>}</td>
                        <td className="py-1.5 pr-2"><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${unlisted ? 'border border-dashed border-[#C9CFD9] text-ink-secondary' : 'bg-soft-blue text-navy-primary'}`}>{unlisted ? 'Unlisted' : 'Listed'}</span></td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-navy-deep">{r.gwp != null ? fmtCr(r.gwp) : <span className="italic text-ink-secondary">n/a</span>}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-navy-deep">{r.pGwp != null ? xMult(r.pGwp) : <span className="italic text-ink-secondary">n/a</span>}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{r.marketCap != null ? <span className="text-navy-deep">{fmtCr(r.marketCap)}</span> : <span className="italic text-ink-secondary">Source pending</span>}</td>
                        <td className="py-1.5 pr-2"><OpenSource id={r.sourceId} /></td>
                        <td className="py-1.5"><ValPill c={r.confidence} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {peerView !== 'Listed' && <p className="mt-2.5 flex items-start gap-1.5 rounded-md border border-dashed border-[#D7CBA8] bg-[#FBF6EA]/60 px-2.5 py-1.5 text-[10.5px] leading-snug text-[#8C6B1A]"><Info className="mt-px h-3 w-3 shrink-0" />{UNLISTED_METHODOLOGY}</p>}
          </div>
        )}
      </section>
      </>
      ) : (
        <ValuationPending company={company} peerRow={peerValuation.find((r) => r.companyId === company.id) ?? null} />
      )}

      {/* ── 5. Operating-quality compass · adapts to the selected company ─────── */}
      <section>
        <Eyebrow label="Quality Lens" title="Operating quality vs peers" note="Relative scores on the operating metrics behind the multiple." right={<ValPill c="secondary" />} />
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
              <div className="inline-flex items-center gap-2 rounded-xl border border-[#D6E2FA] bg-soft-blue/50 px-3 py-2">
                <span className="font-display text-[18px] leading-none text-navy-deep">{position}</span>
                <span className="text-[10px] text-ink-secondary">overall</span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-1.5">
                {compassData.map((d) => (
                  <div key={d.axis} className="flex items-center gap-2 text-[11px]">
                    <span className="w-[88px] shrink-0 text-ink-secondary">{d.axis}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-soft-border">
                      <span className="block h-full rounded-full" style={{ width: `${d.niva}%`, background: NAVY }} />
                    </div>
                    <span className={`w-8 text-right text-[10.5px] font-semibold ${d.niva >= d.peer ? 'text-teal' : 'text-ink-secondary'}`}>{d.niva >= d.peer ? `+${d.niva - d.peer}` : d.niva - d.peer}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 flex items-center gap-2 text-[9.5px] text-ink-secondary">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: NAVY }} />{company.shortName}</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: PEER }} />Peer avg</span>
                <span className="ml-1">· operating quality, not valuation</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Investor read · focal listed name only ─────────────────────────── */}
      {isFocal && (
      <section className="relative overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-[#16294B] via-[#1B335C] to-[#13243F] p-6 shadow-[0_18px_44px_rgba(11,22,44,0.30)]">
        <InvestorReadArt />
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-champagne/20 text-champagne"><Search className="h-3 w-3" /></span>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-champagne">Investor Read</p>
          </div>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold text-champagne ring-1 ring-white/15">Grounded in FY26 filing + cited notes</span>
        </div>
        <div className="relative mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ReadBlock label="Market read" body={`Trades at ${px(price)} (${marketSnapshot.priceAsOf}), ${sinceIpo >= 0 ? 'up' : 'down'} ${Math.abs(sinceIpo).toFixed(0)}% vs the ${px(marketSnapshot.ipoPrice)} IPO; inside its ${px(marketSnapshot.weekLow52)}–${px(marketSnapshot.weekHigh52)} band.`} pill="Verified" />
          <ReadBlock label="Street read" body={`Consensus ${px(target)} (${upPct(upsideConsensus)}); ${ac.buyCount}/${ac.analystCount} Buy, 0 Sell. Motilal Oswal sees ${px(mosl?.targetPrice ?? null)}.`} pill="Secondary" />
          <ReadBlock label="Peer read" body={`${xMult(pGwp)} P/GWP — a ~${premiumVsStar?.toFixed(0)}% premium to Star (${xMult(starPGwp)}), backed by faster growth.`} pill="Secondary" />
          <ReadBlock label="Decision read" body="Premium looks earned while GWP compounds >20% and profit scales — watch margin and combined ratio." />
        </div>
        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          {chips.map(({ key, Icon }) => {
            const active = openChip === key
            return (
              <button key={key} type="button" onClick={() => setOpenChip(active ? null : key)} className={['inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors', active ? 'bg-champagne text-[#16294B]' : 'bg-white/[0.06] text-white/85 ring-1 ring-white/15 hover:bg-white/[0.12]'].join(' ')}>
                <Icon className="h-3 w-3" />{key}
              </button>
            )
          })}
          <span className="ml-1 text-[9px] font-medium text-white/45">Bull / bear cite reported FY26 figures</span>
        </div>
        {openChip && (
          <ul className="relative mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
            {openItems.map((it) => (
              <li key={it} className="flex items-start gap-1.5 text-[11.5px] text-white/85"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-champagne" />{it}</li>
            ))}
          </ul>
        )}
      </section>
      )}
    </div>
  )
}

// ── Per-company pending state ─────────────────────────────────────────────────
// Shown when the selected company is NOT the focal listed name. We never render
// the focal company's price / targets / multiples under another company's label.
// Instead we show that company's OWN sourced figures where they exist, and an
// honest "source pending" where they don't.
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
        {/* What we genuinely have for THIS company */}
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

        {/* Honest coverage explainer */}
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

function LensRange({ price, target, lo, hi }: { price: number; target: number | null; lo: number | null; hi: number | null }) {
  if (lo == null || hi == null || hi <= lo) return <p className="mt-3 text-[10px] text-ink-secondary">Target range pending.</p>
  const pct = (v: number) => Math.max(2, Math.min(98, ((v - lo) / (hi - lo)) * 100))
  const near = Math.abs(price - (target ?? price)) / (target ?? price) < 0.04
  const priceTone = near ? GOLD : target != null && price < target ? TEAL : CORAL
  return (
    <div className="mt-3">
      <p className="mb-1 text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary">Analyst target range · 8 analysts</p>
      <div className="relative h-2 rounded-full" style={{ background: 'linear-gradient(90deg,#F8ECEC,#FBF3E2,#E6F4F1)' }}>
        {target != null && <span className="absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-navy-primary/45" style={{ left: `${pct(target)}%` }} />}
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: `${pct(price)}%`, background: priceTone }} />
      </div>
      <div className="mt-1 flex justify-between text-[8.5px] text-ink-secondary">
        <span>Low {px(lo)}</span>
        <span className="font-semibold text-navy-deep/70">Cons. {px(target)}</span>
        <span>High {px(hi)}</span>
      </div>
      <div className="mt-1 flex items-center gap-3 text-[8.5px] text-ink-secondary">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: priceTone }} />Price</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-navy-primary/45" />Consensus</span>
      </div>
    </div>
  )
}

function Bar({ value, max, color, label }: { value: number | null; max: number; color: string; label: string }) {
  if (value == null) {
    return (
      <div className="flex flex-col items-center justify-end">
        <span className="mb-1 text-[9px] italic text-ink-secondary">n/a</span>
        <div className="w-4 rounded-t-md border border-dashed border-[#C9CFD9]" style={{ height: 10 }} />
      </div>
    )
  }
  const h = Math.max(5, (value / max) * 48)
  return (
    <div className="flex flex-col items-center justify-end">
      <span className="mb-1 text-[9.5px] font-semibold text-navy-deep tabular-nums">{label}</span>
      <div className="w-4 rounded-t-md" style={{ height: h, background: color }} />
    </div>
  )
}

function PeerChip({ name, mult, tag, tone }: { name: string; mult: number | null; tag?: string; tone: 'focal' | 'listed' | 'avg' }) {
  const styles =
    tone === 'focal'
      ? 'border-[#EAD9B6] bg-champagne-soft text-champagne-deep'
      : tone === 'listed'
        ? 'border-[#D6E2FA] bg-soft-blue text-navy-primary'
        : 'border-soft-border bg-ice text-ink-secondary'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] ${styles}`}>
      <b className="font-semibold">{name}</b>
      <span className="tabular-nums">· {mult != null ? `${mult.toFixed(2)}x` : 'n/a'}</span>
      {tag && <span className="opacity-70">· {tag}</span>}
    </span>
  )
}

function ReadBlock({ label, body, pill }: { label: string; body: string; pill?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-champagne/90">{label}</p>
        {pill && <span className="inline-flex items-center gap-1 rounded-full bg-champagne/15 px-1.5 py-0.5 text-[9px] font-semibold text-champagne">{pill}</span>}
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/85">{body}</p>
    </div>
  )
}

function GrowthGlyph() {
  return (
    <svg className="h-8 w-11 opacity-90" viewBox="0 0 48 36" fill="none" aria-hidden>
      <rect x={2} y={22} width={8} height={12} rx={2} fill={PEER} />
      <rect x={14} y={15} width={8} height={19} rx={2} fill="#7FB7B3" />
      <rect x={26} y={8} width={8} height={26} rx={2} fill={TEAL} />
      <path d="M4 18 L18 12 L30 6 L44 2" stroke={GOLD} strokeWidth={2} fill="none" strokeLinecap="round" />
    </svg>
  )
}

function InvestorReadArt() {
  return (
    <svg className="pointer-events-none absolute -right-2 bottom-0 h-[150px] w-[260px] opacity-40" viewBox="0 0 260 150" fill="none" aria-hidden>
      <defs>
        <linearGradient id="irGlowV" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#3FA9A2" stopOpacity={0} /><stop offset="100%" stopColor="#5FD0C8" stopOpacity={0.9} /></linearGradient>
      </defs>
      {[160, 178, 196, 214, 232].map((x, i) => (<rect key={i} x={x} y={120 - i * 18} width={12} height={30 + i * 18} rx={3} fill="url(#irGlowV)" />))}
      <path d="M150 110 L172 96 L194 86 L216 64 L240 44" stroke="#7FE6DD" strokeWidth={2.4} fill="none" strokeLinecap="round" opacity={0.9} />
    </svg>
  )
}
