import type { ReactNode } from 'react'
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from 'recharts'
import { Info, Lightbulb } from 'lucide-react'
import { insurers } from '@/data/mockData'
import { FOCAL_VALUATION_ID, peerValuation, type PeerValuationRow } from '@/data/valuationData'
import { getAnalystCoverage, getMarketQuote } from '@/lib/analystCoverage'
import { useActiveCompany } from '@/state/filters'
import { NavValuationCard } from '@/components/NavValuationCard'
import type { Insurer } from '@/data/types'
import { CORAL, Eyebrow, GOLD, GREEN, NAVY, PEER, TEAL, ValPill, clamp, fmtCr, px, ratingTone, upPct, xMult } from './valuationShared'
import { ValuationHero } from './ValuationHero'
import { PeerValuationMatrix } from './PeerValuationMatrix'

export function ValuationMarketView() {
  const company = useActiveCompany()
  const isFocal = company.id === FOCAL_VALUATION_ID

  // ── Operating-quality compass (relative, from insurers[] headline metrics) ──
  const peerGroup = insurers.filter((i) => i.peerGroup === company.peerGroup && i.id !== company.id)
  const avg = (f: (p: (typeof insurers)[number]) => number) => (peerGroup.length ? peerGroup.reduce((s, p) => s + f(p), 0) / peerGroup.length : 0)
  const sc = (g: number, mgn: number, ms: number, solv: number) => ({ Growth: clamp(g * 2.4), Profitability: clamp(48 + mgn * 3 + 12), 'Market Share': clamp(ms * 3.8), 'Balance Sheet': clamp(solv * 22) })
  const nivaScores = sc(company.growth, company.margin, company.marketShare, company.solvency)
  const peerScores = sc(avg((p) => p.growth), avg((p) => p.margin), avg((p) => p.marketShare), avg((p) => p.solvency))
  const compassData = (['Growth', 'Profitability', 'Market Share', 'Balance Sheet'] as const).map((axis) => ({ axis, niva: Math.round(nivaScores[axis]), peer: Math.round(peerScores[axis]) }))
  const compassDelta = compassData.reduce((s, d) => s + d.niva, 0) / 4 - compassData.reduce((s, d) => s + d.peer, 0) / 4
  const position = compassDelta >= 8 ? 'Above Average' : compassDelta <= -8 ? 'Weak vs peers' : 'Average'

  // "What this means" read for the quality lens — honest one-liner, no new numbers.
  const qualityRead: { tone: WtmTone; text: ReactNode } =
    position === 'Above Average'
      ? { tone: 'teal', text: <>Operating quality screens <b className="text-teal">above the peer average</b> — supportive of a valuation premium.</> }
      : position === 'Weak vs peers'
        ? { tone: 'coral', text: <>Operating quality screens <b style={{ color: CORAL }}>below peers</b> — a premium is harder to justify on fundamentals alone.</> }
        : { tone: 'navy', text: <>Operating quality is <b className="text-navy-deep">broadly in line</b> with peers.</> }

  return (
    <div className="space-y-5">
      {isFocal ? (
        <>
          {/* ═══ 1. VALUATION HERO — gauge / journey infographic + lenses ════════ */}
          <ValuationHero />

          {/* ═══ 2. PEER VALUATION MATRIX — one clean comparable table ═══════════ */}
          <PeerValuationMatrix />
        </>
      ) : (
        <ValuationPending company={company} peerRow={peerValuation.find((r) => r.companyId === company.id) ?? null} />
      )}

      {/* ═══ NAV / BOOK-VALUE LENS — implied value at peer P/BV, working hidden ══ */}
      <section>
        <Eyebrow
          label="Book-Value Lens"
          title="NAV / book-value valuation"
          note="Values the company on its net worth at a comparable listed-peer P/BV. The final number shows here; the full working is one click away."
        />
        <NavValuationCard companyId={company.id} companyName={company.shortName} />
      </section>

      {/* ═══ 5. QUALITY LENS — supports whether the premium is earned ════════════ */}
      <section>
        <Eyebrow
          label="Quality Lens"
          title="Is the premium supported by operating quality?"
          note={`Relative scores on the operating metrics behind the multiple · vs ${company.peerGroup} peer average.`}
          right={<ValPill c="secondary" />}
        />
        <div className="card-surface card-tint-slate p-5">
          <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[1.1fr_1fr]">
            <div className="rounded-xl bg-gradient-to-br from-[#F6F9FD] to-[#ECF1F8] ring-1 ring-[rgba(39,69,126,0.06)]" style={{ width: '100%', height: 210 }}>
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
          <WhatThisMeans tone={qualityRead.tone}>{qualityRead.text}</WhatThisMeans>
        </div>
      </section>
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

// ── "What this means" — a compact, tone-coded decision read that ties a section's
//    numbers back to the valuation question (the so-what). Colour psychology:
//    gold = premium / importance, teal = supportive / positive, coral = stretch /
//    caution, navy = neutral peer context.
type WtmTone = 'teal' | 'gold' | 'navy' | 'coral'
function WhatThisMeans({ tone, children }: { tone: WtmTone; children: ReactNode }) {
  const t =
    tone === 'teal' ? { bg: '#F1FAF8', ring: '#CFE7E3', fg: '#0E6F6D', ic: TEAL }
    : tone === 'gold' ? { bg: '#FBF6EA', ring: '#EAD9A8', fg: '#8A6A1E', ic: GOLD }
    : tone === 'coral' ? { bg: '#F8ECEC', ring: '#EAD2CD', fg: '#A8443B', ic: CORAL }
    : { bg: '#EEF3FB', ring: '#D6E2FA', fg: '#27457E', ic: NAVY }
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5" style={{ background: t.bg, borderColor: t.ring }}>
      <span className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/80" style={{ color: t.ic, boxShadow: `inset 0 0 0 1px ${t.ring}` }}>
        <Lightbulb className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: t.fg }}>What this means</p>
        <p className="mt-0.5 text-[12px] leading-snug text-navy-deep">{children}</p>
      </div>
    </div>
  )
}
