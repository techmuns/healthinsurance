import { useState } from 'react'
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from 'recharts'
import { ArrowRight, ArrowUpRight, Info, Search, TrendingDown, TrendingUp } from 'lucide-react'
import { insurers } from '@/data/mockData'
import {
  analystConsensus,
  focalMultiples,
  focalGwpFy,
  FOCAL_VALUATION_ID,
  marketSnapshot,
  peerValuation,
  UNLISTED_METHODOLOGY,
  type PeerValuationRow,
} from '@/data/valuationData'
import { srcTag } from '@/data/valuationSources'
import { getAnalystCoverage, getMarketQuote } from '@/lib/analystCoverage'
import { useActiveCompany } from '@/state/filters'
import { SourceTag } from '@/components/SourceTag'
import type { Insurer } from '@/data/types'
import { CORAL, Eyebrow, GOLD, GREEN, NAVY, OpenSource, PEER, TEAL, ValPill, clamp, fmtCr, px, ratingTone, upPct, xMult } from './valuationShared'

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

  // Verdict badge tone follows the LIVE consensus label — never frozen to "Buy".
  const verdictTone = ratingTone[ac.ratingLabel as keyof typeof ratingTone] ?? ratingTone.Buy
  // Only assert the premium is "backed by faster growth" when Niva actually grows
  // faster than Star (and is at a premium) — never claim it unconditionally.
  const nivaGrowth = peerValuation.find((r) => r.companyId === FOCAL_VALUATION_ID)?.growth ?? null
  const growthEdge =
    premiumVsStar != null && premiumVsStar > 0 && nivaGrowth != null && starRow?.growth != null && nivaGrowth > starRow.growth
      ? ' — backed by faster growth'
      : ''

  // Verdict headline + stance (the one-line investment takeaway).
  const verdictTitle =
    upsideConsensus == null ? 'Awaiting Street targets'
    : upsideConsensus >= 12 ? 'Upside to Street targets'
    : upsideConsensus >= -3 ? 'Near Street fair value'
    : 'Above Street targets'
  const premiumStance = premiumVsStar != null && premiumVsStar > 5
  const stanceLabel = premiumStance ? 'Premium to listed peers' : premiumVsStar != null && premiumVsStar < -5 ? 'Discount to listed peer' : 'In line with peer'

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
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold" style={{ color: verdictTone.fg, background: verdictTone.bg }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: verdictTone.fg }} />
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
                  {marketSnapshot.company} trades at <b className="text-navy-deep">{px(price)}</b> vs consensus <b className="text-navy-deep">{px(target)}</b> ({upPct(upsideConsensus)}). The {xMult(pGwp)} P/GWP is a {premiumVsStar != null ? `~${Math.abs(premiumVsStar).toFixed(0)}% ${premiumVsStar >= 0 ? 'premium' : 'discount'}` : 'comparison pending'} to Star Health{growthEdge}.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Tile k="Current price" v={px(price)} sub={marketSnapshot.priceAsOf} />
                  <Tile k="Cons. target" v={px(target)} sub={`${ac.analystCount} analysts`} />
                  <Tile k="Upside" v={upPct(upsideConsensus)} tone={upsideConsensus == null ? 'navy' : upsideConsensus >= 0 ? 'teal' : 'red'} sub="to consensus" />
                  <Tile k="P / GWP" v={xMult(pGwp)} sub={focalGwpFy} />
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


          {/* ═══ PEER COMPARISON ══════════════════════════════════════════════════ */}
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
                        <tr key={r.companyId} className={`border-b border-[#F2F4F8] transition-colors last:border-0 ${r.companyId === FOCAL_VALUATION_ID ? 'bg-soft-blue/40' : 'hover:bg-soft-blue/25'}`}>
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
  const quote = getMarketQuote(company.id)
  const coverage = getAnalystCoverage(company.id)
  const listed = peerRow?.listingStatus === 'Listed' || quote != null
  // P/GWP prefers the curated FY26 basis (peer table) for cross-tab consistency;
  // P/E, P/B, price, market cap come from the daily valuation feed.
  const pGwp = peerRow?.pGwp ?? quote?.pGwp ?? null
  const ac = coverage?.consensus
  const target = ac?.consensusTargetPrice ?? null
  const price = quote?.price ?? ac?.currentPrice ?? null
  const upside = target != null && price ? (target / price - 1) * 100 : null
  const hasMultiples = pGwp != null || quote?.pe != null || quote?.pb != null
  const hasReal = hasMultiples || ac != null

  return (
    <section className="relative overflow-hidden rounded-[1.4rem] border border-[#E4E8F0] bg-gradient-to-br from-[#F7FAFD] via-[#FBFCFD] to-[#F4F7FB] p-6 shadow-[0_2px_4px_rgba(23,43,77,0.04),0_18px_44px_rgba(23,43,77,0.08)]">
      <Eyebrow
        label="Valuation"
        title={hasReal ? `${company.shortName} · market valuation` : `Sourced valuation pending for ${company.shortName}`}
        note={hasReal
          ? 'Live multiples & analyst consensus from the market feed. The curated narrative (verdict, since-listing path, thesis) stays with the focal name.'
          : 'Live, source-backed valuation is wired for the listed names with coverage — never shown under another company’s label.'}
        right={<ValPill c={hasReal ? 'secondary' : 'pending'} />}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_1fr]">
        <div className="card-surface p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">What we have for {company.shortName}</p>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${listed ? 'bg-soft-blue text-navy-primary' : 'border border-dashed border-[#C9CFD9] text-ink-secondary'}`}>{listed ? 'Listed' : 'Unlisted'}</span>
          </div>
          {hasReal ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Tile k="Current price" v={px(price)} sub={quote?.asOf ?? '—'} />
                <Tile k="Market cap" v={fmtCr(quote?.marketCap ?? null)} sub="latest" />
                <Tile k="P / GWP" v={xMult(pGwp)} sub="FY26" tone="amber" />
                <Tile k="P / E" v={xMult(quote?.pe ?? null, 1)} sub="TTM" />
                <Tile k="P / B" v={xMult(quote?.pb ?? null, 1)} sub="latest" />
                {ac != null && (
                  <Tile k="Cons. target" v={px(target)} sub={`${ac.analystCount} analysts`} tone={upside == null ? 'navy' : upside >= 0 ? 'teal' : 'red'} />
                )}
              </div>
              {ac != null && (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ice px-2.5 py-1 text-[11px]">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: ratingTone[ac.ratingLabel]?.fg ?? NAVY }} />
                  {ac.ratingLabel}-skewed · {ac.buyCount} Buy · {ac.holdCount} Hold · {ac.sellCount} Sell · {upPct(upside)} to consensus
                </p>
              )}
              <p className="mt-3 text-[11.5px] leading-relaxed text-ink-secondary">
                {company.shortName}&rsquo;s market multiples{ac != null ? ' and analyst consensus are' : ' are'} sourced live. The full curated story — the verdict, since-listing path and bull/bear thesis — is authored for the focal name today.
              </p>
            </>
          ) : (
            <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
              {listed
                ? `${company.shortName} is listed — market multiples will populate here once its price feed is sourced.`
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
            Live multiples are sourced for the listed insurers (Niva Bupa, Star Health, ICICI Lombard, Go Digit); analyst consensus for the names brokers cover. The fully curated valuation narrative is authored for <b>Niva Bupa (NSE: NIVABUPA)</b>. We never display one company&rsquo;s numbers under another&rsquo;s name.
          </p>
          <p className="mt-2 text-[10.5px] leading-relaxed opacity-90">
            The operating-quality view below is computed from {company.shortName}&rsquo;s own reported metrics, so it stays meaningful for every company.
          </p>
        </div>
      </div>
    </section>
  )
}

// ── Building blocks ──────────────────────────────────────────────────────────

function Tile({ k, v, sub, tone = 'navy' }: { k: string; v: string; sub?: string; tone?: 'navy' | 'teal' | 'amber' | 'red' }) {
  // Tone-coded tint + accent so each metric reads by meaning at a glance
  // (navy = price, teal = upside, amber = multiple, coral = downside).
  const t =
    tone === 'teal' ? { text: 'text-teal', bar: TEAL, bg: 'linear-gradient(135deg,#FFFFFF 0%, rgba(22,142,142,0.07) 100%)', border: 'rgba(22,142,142,0.20)' }
    : tone === 'red' ? { text: 'text-signal-negative', bar: CORAL, bg: 'linear-gradient(135deg,#FFFFFF 0%, rgba(194,118,107,0.07) 100%)', border: 'rgba(194,118,107,0.22)' }
    : tone === 'amber' ? { text: 'text-champagne-deep', bar: GOLD, bg: 'linear-gradient(135deg,#FFFFFF 0%, rgba(182,139,58,0.08) 100%)', border: 'rgba(182,139,58,0.22)' }
    : { text: 'text-navy-deep', bar: NAVY, bg: 'linear-gradient(135deg,#FFFFFF 0%, rgba(39,69,126,0.06) 100%)', border: 'rgba(39,69,126,0.16)' }
  return (
    <div className="hover-lift relative overflow-hidden rounded-xl border px-2.5 py-2 shadow-soft" style={{ background: t.bg, borderColor: t.border }}>
      <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: t.bar }} aria-hidden />
      <p className="whitespace-nowrap pl-1 text-[8.5px] font-semibold uppercase text-ink-secondary">{k}</p>
      <p className={`mt-0.5 pl-1 font-display text-[16px] leading-none ${t.text}`}>{v}</p>
      {sub && <p className="mt-0.5 pl-1 text-[8.5px] text-ink-secondary/80">{sub}</p>}
    </div>
  )
}

