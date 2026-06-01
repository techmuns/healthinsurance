import { useState } from 'react'
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
import { Check, Flame, Info, Search, ShieldAlert, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { insurers, valuationMultiples, valuationMultipleTrend } from '@/data/mockData'
import {
  analystConsensus,
  analystReports,
  analystThesis,
  marketStreetIntrinsic as msi,
  peerValuationOverlay,
  UNLISTED_METHODOLOGY,
  type Rating,
} from '@/data/valuationData'
import { getCompanyMetric } from '@/lib/dataLayer'
import { useActiveCompany } from '@/state/filters'
import { SourceTag } from '@/components/SourceTag'

const NAVY = '#27457E'
const TEAL = '#168E8E'
const GOLD = '#B68B3A'
const PEER = '#A6B2C6'
const GRID = '#EEF1F7'
const AXIS = '#6B7280'
const CORAL = '#C2766B'

const clamp = (v: number, lo = 16, hi = 96) => Math.max(lo, Math.min(hi, v))
const fmtCr = (v: number | null) => (v == null ? 'n/a' : v >= 1000 ? `₹${(v / 1000).toFixed(1)}k Cr` : `₹${v.toFixed(0)} Cr`)
const fmtPrice = (v: number | null) => (v == null ? 'Pending' : `₹${v.toFixed(0)}`)
const ratingTone: Record<Rating, { fg: string; bg: string }> = {
  Buy: { fg: '#0E6F6D', bg: '#E2F4F1' },
  Hold: { fg: '#9A6B12', bg: '#FBF3E2' },
  Sell: { fg: '#B0564A', bg: '#F8ECEC' },
}

function Mock() {
  return <span className="rounded-full bg-[#F1ECE0] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-champagne-deep">Mock</span>
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
  const [peerView, setPeerView] = useState<'Listed' | 'Unlisted' | 'All'>('Listed')
  const [allAnalysts, setAllAnalysts] = useState(false)
  const [openChip, setOpenChip] = useState<string | null>(null)

  const patEnv = getCompanyMetric(company.id, 'company.pat', 'Annual')
  const pat = typeof patEnv.value === 'number' ? patEnv.value : null
  const gwp = company.premiumCollection || null
  const netMargin = pat != null && gwp ? (pat / gwp) * 100 : null

  const pGwp = company.valuation > 0 ? company.valuation : null
  const peerAvgGwp = valuationMultiples.pGwp.peerAvg
  const premiumGwp = pGwp != null ? ((pGwp - peerAvgGwp) / peerAvgGwp) * 100 : null

  const justified = [
    { label: 'Growth (GWP YoY)', value: `${company.growth.toFixed(0)}%`, strong: company.growth >= 15, supports: company.growth >= 15 },
    { label: 'Net margin (PAT/GWP)', value: netMargin != null ? `${netMargin.toFixed(1)}%` : 'n/a', strong: (netMargin ?? -1) >= 4, supports: (netMargin ?? -1) > 0 },
    { label: 'Market share', value: `${company.marketShare.toFixed(1)}%`, strong: company.marketShareChange > 0, supports: company.marketShareChange >= 0 },
    { label: 'Return on equity', value: company.roe > 0 ? `${company.roe.toFixed(1)}%` : 'n/a', strong: company.roe >= 10, supports: company.roe > 0 },
  ]

  const peerGroup = insurers.filter((i) => i.peerGroup === company.peerGroup && i.id !== company.id)
  const avg = (f: (p: (typeof insurers)[number]) => number) => (peerGroup.length ? peerGroup.reduce((s, p) => s + f(p), 0) / peerGroup.length : 0)
  const scores = (g: number, mgn: number, ms: number, solv: number, val: number) => ({ Growth: clamp(g * 2.4), Profitability: clamp(48 + mgn * 3 + 12), 'Market Share': clamp(ms * 3.8), 'Balance Sheet': clamp(solv * 22), Valuation: clamp(val * 17) })
  const nivaScores = scores(company.growth, company.margin, company.marketShare, company.solvency, company.valuation || 3)
  const peerScores = scores(avg((p) => p.growth), avg((p) => p.margin), avg((p) => p.marketShare), avg((p) => p.solvency), avg((p) => p.valuation || 3))
  const compassData = (['Growth', 'Profitability', 'Market Share', 'Balance Sheet', 'Valuation'] as const).map((axis) => ({ axis, niva: Math.round(nivaScores[axis]), peer: Math.round(peerScores[axis]) }))
  const position = compassData.reduce((s, d) => s + d.niva, 0) / 5 >= compassData.reduce((s, d) => s + d.peer, 0) / 5 + 8 ? 'Above Average' : 'In Line'

  const relMetrics = [
    { label: 'P / GWP', niva: valuationMultiples.pGwp.niva, peer: valuationMultiples.pGwp.peerAvg },
    { label: 'P / B', niva: valuationMultiples.pB.niva, peer: valuationMultiples.pB.peerAvg },
    { label: 'P / E', niva: valuationMultiples.pE.niva, peer: valuationMultiples.pE.peerAvg },
  ]

  const ac = analystConsensus
  const upside = ac.currentPrice && ac.consensusTargetPrice ? (ac.consensusTargetPrice / ac.currentPrice - 1) * 100 : null
  const ratingTotal = ac.buyCount + ac.holdCount + ac.sellCount
  const shownReports = allAnalysts ? analystReports : analystReports.slice(0, 4)

  const PEER_IDS = ['niva-bupa', 'star-health', 'care-health', 'aditya-birla', 'manipalcigna']
  const peerRows = PEER_IDS.map((id) => {
    const ins = insurers.find((i) => i.id === id)
    const ov = peerValuationOverlay[id]
    if (!ov) return null
    return { ...ov, growth: ins?.growth ?? null, marketShare: ins?.marketShare ?? null, profitability: ins?.margin ?? null, focal: id === company.id }
  }).filter((r): r is NonNullable<typeof r> => Boolean(r))
  const shownPeers = peerView === 'All' ? peerRows : peerRows.filter((r) => r.listingStatus === peerView)

  const chips = [
    { key: 'Bull case', Icon: TrendingUp, items: analystThesis.bull },
    { key: 'Bear case', Icon: TrendingDown, items: analystThesis.bear },
    { key: 'Risks', Icon: ShieldAlert, items: analystThesis.risks },
    { key: 'Catalysts', Icon: Flame, items: analystThesis.catalysts },
  ]
  const openItems = chips.find((c) => c.key === openChip)?.items.slice(0, 3) ?? []

  return (
    <div className="space-y-5">
      {/* ── 1. Verdict + compact Valuation Lens ───────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[1.4rem] border border-[#E4E8F0] bg-gradient-to-br from-[#F7FAFD] via-[#FBFCFD] to-[#F4F7FB] p-6 shadow-[0_2px_4px_rgba(23,43,77,0.04),0_18px_44px_rgba(23,43,77,0.08)]">
        <div className="grid items-center gap-5 lg:grid-cols-[1fr_1.15fr]">
          {/* Left — verdict */}
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D6E2FA] bg-soft-blue px-2.5 py-1">
              <Search className="h-3 w-3 text-navy-primary" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-navy-primary">Valuation Verdict</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[25px] leading-tight tracking-tight text-navy-deep">Awaiting market-cap snapshot</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAD9B6] bg-champagne-soft px-2.5 py-1 text-[11px] font-semibold text-champagne-deep">
                <span className="h-1.5 w-1.5 rounded-full bg-champagne-deep" />
                Pending
              </span>
            </div>
            <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-ink-secondary">
              Market, Street and intrinsic lenses update as the latest valuation data is ingested.
            </p>
          </div>

          {/* Right — Valuation Lens snapshot */}
          <div className="rounded-2xl border border-soft-border bg-white/75 p-3.5 shadow-soft backdrop-blur">
            <div className="flex items-center justify-between">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Valuation Lens</p>
              <Mock />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile k="Current price" v={fmtPrice(msi.currentMarketPrice)} />
              <Tile k="Cons. target" v={fmtPrice(msi.consensusTargetPrice)} />
              <Tile k="Intrinsic base" v={fmtPrice(msi.intrinsicBaseValue)} />
              <Tile k="Upside" v={upside != null ? `+${upside.toFixed(1)}%` : 'Pending'} tone={upside == null ? 'navy' : upside >= 0 ? 'teal' : 'red'} />
            </div>
            <LensRange />
          </div>
        </div>
        <div className="relative mt-3 flex justify-end">
          <SourceTag source="Market data" confidence="low" period="Pending" provenance={{ source_name: 'Live NSE/BSE market-cap + analyst feeds pending; lens values are illustrative mock.', source_url: 'https://www.nseindia.com/get-quotes/equity' }} />
        </div>
      </section>

      {/* ── 2. Valuation at a glance (Multiple · Premium justified?) ──────────── */}
      <section>
        <Eyebrow label="Valuation at a Glance" title="Valuation at a glance" note="FY25 · is the multiple justified?" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card-surface relative overflow-hidden p-5">
            <span className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(22,142,142,0.10),transparent_65%)]" />
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Valuation Multiple</p>
              <GrowthGlyph />
            </div>
            <div className="mt-3 flex items-end gap-2">
              <span className="font-display text-[38px] leading-none text-navy-deep">{pGwp != null ? `${pGwp.toFixed(1)}x` : 'n/a'}</span>
              <span className="mb-1 text-[12px] text-ink-secondary">P/GWP · FY25 · vs peer avg. <b className="text-navy-deep">{peerAvgGwp.toFixed(1)}x</b></span>
            </div>
            {premiumGwp != null && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-teal-soft px-2.5 py-1 text-[12px] font-semibold text-teal">
                <TrendingUp className="h-3.5 w-3.5" />
                {premiumGwp >= 0 ? '+' : ''}{premiumGwp.toFixed(0)}% {premiumGwp >= 0 ? 'premium' : 'discount'} to peers
              </div>
            )}
            <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-secondary"><Mock /> P/B &amp; P/E are mock</div>
          </div>

          <div className="card-surface p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Is the Premium Justified?</p>
            <p className="mt-1 text-[11px] text-ink-secondary">Does each driver back a premium multiple?</p>
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
          </div>
        </div>
      </section>

      {/* ── 3. Street view ────────────────────────────────────────────────────── */}
      <section>
        <Eyebrow label="Street View" title="What do analysts think the stock is worth?" right={<Mock />} />
        <div className="card-surface p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { k: 'Consensus target', v: fmtPrice(ac.consensusTargetPrice), tone: 'navy' },
              { k: 'Current price', v: fmtPrice(ac.currentPrice), tone: 'navy' },
              { k: 'Implied upside', v: upside != null ? `+${upside.toFixed(1)}%` : 'Pending', tone: 'teal' },
              { k: 'Highest target', v: fmtPrice(ac.highestTargetPrice), tone: 'navy' },
              { k: 'Lowest target', v: fmtPrice(ac.lowestTargetPrice), tone: 'navy' },
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
              <span style={{ width: `${(ac.buyCount / ratingTotal) * 100}%`, background: ratingTone.Buy.fg }} />
              <span style={{ width: `${(ac.holdCount / ratingTotal) * 100}%`, background: ratingTone.Hold.fg }} />
              <span style={{ width: `${(ac.sellCount / ratingTotal) * 100}%`, background: ratingTone.Sell.fg }} />
            </div>
            <span className="text-[11px] text-ink-secondary"><b className="text-teal">{ac.buyCount} Buy</b> · <b className="text-champagne-deep">{ac.holdCount} Hold</b> · <b className="text-signal-negative">{ac.sellCount} Sell</b></span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-soft-border text-[10px] uppercase tracking-wide text-ink-secondary">
                  <th className="py-1.5 pr-3 font-semibold">Brokerage</th>
                  <th className="py-1.5 pr-3 font-semibold">Rating</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">Target</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">Upside</th>
                  <th className="py-1.5 pr-3 font-semibold">Date</th>
                  <th className="py-1.5 font-semibold">View · source</th>
                </tr>
              </thead>
              <tbody>
                {shownReports.map((r) => (
                  <tr key={r.brokerage} className="border-b border-[#F2F4F8] last:border-0">
                    <td className="py-1.5 pr-3 font-semibold text-navy-deep">{r.brokerage}</td>
                    <td className="py-1.5 pr-3"><span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: ratingTone[r.rating].fg, background: ratingTone[r.rating].bg }}>{r.rating}</span></td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-navy-deep">{r.targetPrice != null ? `₹${r.targetPrice}` : 'Not disclosed'}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{r.impliedUpsideDownside != null ? <span className={r.impliedUpsideDownside >= 0 ? 'text-teal' : 'text-signal-negative'}>{r.impliedUpsideDownside >= 0 ? '+' : ''}{r.impliedUpsideDownside.toFixed(1)}%</span> : <span className="text-ink-secondary">Pending</span>}</td>
                    <td className="py-1.5 pr-3 text-ink-secondary">{r.reportDate}</td>
                    <td className="py-1.5 text-ink-secondary"><span className="text-navy-deep/80">{r.notes}</span> · {r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between">
            {analystReports.length > 4 ? <button type="button" onClick={() => setAllAnalysts((v) => !v)} className="text-[11px] font-semibold text-navy-primary hover:underline">{allAnalysts ? 'Show less' : `View all analysts (${analystReports.length})`}</button> : <span />}
            <SourceTag source="Sell-side consensus" confidence="low" period={ac.lastUpdated} provenance={{ source_name: 'Illustrative mock — concise analyst-view summaries only.', source_url: '' }} />
          </div>
        </div>
      </section>

      {/* ── 4. Peer valuation ─────────────────────────────────────────────────── */}
      <section>
        <Eyebrow
          label="Peer Valuation"
          title="How does it compare with peers?"
          note="Listed = market valuation · Unlisted = estimated valuation."
          right={
            <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-ice p-0.5">
              {(['Listed', 'Unlisted', 'All'] as const).map((v) => (
                <button key={v} type="button" onClick={() => setPeerView(v)} aria-pressed={peerView === v} className={['rounded-full px-3 py-1 text-[11px] font-semibold transition-all', peerView === v ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white shadow-soft' : 'text-ink-secondary hover:bg-soft-blue hover:text-navy-primary'].join(' ')}>{v} Peers</button>
              ))}
            </div>
          }
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="card-surface p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11.5px]">
                <thead>
                  <tr className="border-b border-soft-border text-[10px] uppercase tracking-wide text-ink-secondary">
                    <th className="py-1.5 pr-2 font-semibold">Company</th>
                    <th className="py-1.5 pr-2 font-semibold">Status</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Mkt share</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Growth</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">P/GWP</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Equity value</th>
                    <th className="py-1.5 font-semibold">Basis · conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {shownPeers.map((r) => {
                    const unlisted = r.listingStatus === 'Unlisted'
                    return (
                      <tr key={r.companyId} className={`border-b border-[#F2F4F8] last:border-0 ${r.focal ? 'bg-soft-blue/40' : ''}`}>
                        <td className="py-1.5 pr-2 font-semibold text-navy-deep">{r.companyName}{r.focal && <span className="ml-1 text-[9px] font-bold uppercase text-champagne-deep">·focal</span>}</td>
                        <td className="py-1.5 pr-2"><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${unlisted ? 'border border-dashed border-[#C9CFD9] text-ink-secondary' : 'bg-soft-blue text-navy-primary'}`}>{unlisted ? 'Unlisted' : 'Listed'}</span></td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-navy-deep">{r.marketShare != null ? `${r.marketShare.toFixed(1)}%` : 'n/a'}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-navy-deep">{r.growth != null ? `${r.growth.toFixed(0)}%` : 'n/a'}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-navy-deep">{r.pgwp != null ? `${r.pgwp.toFixed(1)}x` : 'n/a'}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums"><span className={unlisted ? 'italic text-ink-secondary' : 'text-navy-deep'}>{fmtCr(r.marketCap)}</span>{unlisted && <span className="ml-1 text-[8.5px] font-semibold uppercase text-champagne-deep">est.</span>}</td>
                        <td className="py-1.5 text-[10.5px] text-ink-secondary">{r.valuationBasis} · <ConfPill c={r.confidence} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2.5 text-[10px] text-ink-secondary">{peerView === 'Listed' ? 'Market Valuation (Listed) — multiples from market cap.' : peerView === 'Unlisted' ? 'Estimated Valuation (Unlisted) — not live market prices.' : 'Listed = market valuation · Unlisted = estimated.'}</p>
            {peerView !== 'Listed' && <p className="mt-2 flex items-start gap-1.5 rounded-md border border-dashed border-[#D7CBA8] bg-[#FBF6EA]/60 px-2.5 py-1.5 text-[10.5px] leading-snug text-[#8C6B1A]"><Info className="mt-px h-3 w-3 shrink-0" />{UNLISTED_METHODOLOGY}</p>}
            <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-[#E1F2F1] bg-[#F2FAF9] px-3 py-1.5">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-teal" />
              <p className="text-[11.5px] leading-snug text-navy-deep">{company.shortName} carries the richest multiple in the set — justified only while its growth and share lead peers.</p>
            </div>
            <div className="mt-2 flex justify-end"><SourceTag source="Mixed" confidence="low" period="FY25" provenance={{ source_name: 'Listed multiples + unlisted estimates (mock).', source_url: '' }} /></div>
          </div>

          <div className="space-y-4">
            <div className="card-surface p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Relative Multiples <Mock /></p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {relMetrics.map((m) => {
                  const max = Math.max(m.niva, m.peer, 0.1)
                  const prem = ((m.niva - m.peer) / m.peer) * 100
                  return (
                    <div key={m.label} className="text-center">
                      <p className="text-[10.5px] font-semibold text-navy-deep/75">{m.label}</p>
                      <div className="mt-1.5 flex h-[58px] items-end justify-center gap-1.5">
                        <Bar value={m.niva} max={max} color={NAVY} label={`${m.niva}x`} />
                        <Bar value={m.peer} max={max} color={PEER} label={`${m.peer}x`} />
                      </div>
                      <p className="mt-1 text-[10.5px] font-semibold text-teal">+{prem.toFixed(0)}%</p>
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 flex items-center gap-3 border-t border-soft-border pt-1.5 text-[9.5px] text-ink-secondary">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-[2px]" style={{ background: NAVY }} />{company.shortName}</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-[2px]" style={{ background: PEER }} />Peer avg</span>
              </div>
            </div>
            <div className="card-surface p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Multiple Trend <span className="text-ink-secondary/60">FY21→FY25</span> <Mock /></p>
              <div className="mt-2" style={{ width: '100%', height: 152 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={valuationMultipleTrend} margin={{ top: 16, right: 42, left: 16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
                    <YAxis yAxisId="lhs" hide domain={[0, 8]} />
                    <YAxis yAxisId="rhs" orientation="right" hide domain={[0, 36]} />
                    <Line yAxisId="rhs" type="monotone" dataKey="P/E" stroke={GOLD} strokeWidth={2} dot={{ r: 2.4, fill: GOLD }}><LabelList dataKey="P/E" content={endTrendLabel(GOLD)} /></Line>
                    <Line yAxisId="lhs" type="monotone" dataKey="P/GWP" stroke={TEAL} strokeWidth={2} dot={{ r: 2.4, fill: TEAL }}><LabelList dataKey="P/GWP" content={endTrendLabel(TEAL)} /></Line>
                    <Line yAxisId="lhs" type="monotone" dataKey="P/B" stroke={NAVY} strokeWidth={2} dot={{ r: 2.4, fill: NAVY }}><LabelList dataKey="P/B" content={endTrendLabel(NAVY)} /></Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-3 text-[9.5px] text-ink-secondary">
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-3 rounded-full" style={{ background: TEAL }} />P/GWP</span>
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-3 rounded-full" style={{ background: NAVY }} />P/B</span>
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-3 rounded-full" style={{ background: GOLD }} />P/E</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Valuation compass (standalone, compact) ────────────────────────── */}
      <section>
        <Eyebrow label="Quality Lens" title="Valuation Compass" note="Where does the premium come from?" />
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
                <span className="ml-1">· score vs peer</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Investor read (context lives here) ─────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-[#16294B] via-[#1B335C] to-[#13243F] p-6 shadow-[0_18px_44px_rgba(11,22,44,0.30)]">
        <InvestorReadArt />
        <div className="relative flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-champagne/20 text-champagne"><Search className="h-3 w-3" /></span>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-champagne">Investor Read</p>
        </div>
        <div className="relative mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ReadBlock label="Market read" body="Live share price and market-cap are pending; the listed read updates once ingested." pill="Pending" />
          <ReadBlock label="Street read" body="Street consensus points to upside vs the current price, skewed Buy." pill="Mock" />
          <ReadBlock label="Peer read" body="A premium to peers that needs stronger growth, margin and share to hold." pill="Mock" />
          <ReadBlock label="Decision read" body="Premium looks justified only if growth and profitability keep compounding." />
        </div>
        {/* expandable Bull / Bear / Risks / Catalysts */}
        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          {chips.map(({ key, Icon }) => {
            const active = openChip === key
            return (
              <button key={key} type="button" onClick={() => setOpenChip(active ? null : key)} className={['inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors', active ? 'bg-champagne text-[#16294B]' : 'bg-white/[0.06] text-white/85 ring-1 ring-white/15 hover:bg-white/[0.12]'].join(' ')}>
                <Icon className="h-3 w-3" />{key}
              </button>
            )
          })}
          <span className="ml-1 inline-flex items-center gap-1 text-[9px] font-semibold text-white/40"><Mock /></span>
        </div>
        {openChip && (
          <ul className="relative mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
            {openItems.map((it) => (
              <li key={it} className="flex items-start gap-1.5 text-[11.5px] text-white/85"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-champagne" />{it}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ── Building blocks ──────────────────────────────────────────────────────────

function Tile({ k, v, tone = 'navy' }: { k: string; v: string; tone?: 'navy' | 'teal' | 'amber' | 'red' }) {
  const c = tone === 'teal' ? 'text-teal' : tone === 'red' ? 'text-signal-negative' : tone === 'amber' ? 'text-champagne-deep' : 'text-navy-deep'
  return (
    <div className="rounded-lg border border-soft-border bg-white px-2.5 py-1.5">
      <p className="whitespace-nowrap text-[8.5px] font-semibold uppercase text-ink-secondary">{k}</p>
      <p className={`mt-0.5 font-display text-[16px] leading-none ${c}`}>{v}</p>
    </div>
  )
}

function LensRange() {
  const lo = msi.intrinsicBearValue
  const hi = msi.intrinsicBullValue
  const base = msi.intrinsicBaseValue
  const price = msi.currentMarketPrice
  const target = msi.consensusTargetPrice
  if (lo == null || hi == null || base == null) return <p className="mt-3 text-[10px] text-ink-secondary">Range pending.</p>
  const pct = (v: number) => Math.max(2, Math.min(98, ((v - lo) / (hi - lo)) * 100))
  const near = price != null && Math.abs(price - base) / base < 0.04
  const priceTone = price == null ? PEER : near ? GOLD : price < base ? TEAL : CORAL
  return (
    <div className="mt-3">
      <div className="relative h-2 rounded-full" style={{ background: 'linear-gradient(90deg,#E6F4F1,#FBF3E2,#F8ECEC)' }}>
        <span className="absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-navy-primary/45" style={{ left: `${pct(base)}%` }} />
        {price != null && <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: `${pct(price)}%`, background: priceTone }} />}
        {target != null && <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: `${pct(target)}%`, background: TEAL }} />}
      </div>
      <div className="mt-1 flex justify-between text-[8.5px] text-ink-secondary">
        <span>Bear ₹{lo}</span>
        <span className="font-semibold text-navy-deep/70">Base ₹{base}</span>
        <span>Bull ₹{hi}</span>
      </div>
      <div className="mt-1 flex items-center gap-3 text-[8.5px] text-ink-secondary">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: priceTone }} />Price</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: TEAL }} />Target</span>
      </div>
    </div>
  )
}

function endTrendLabel(color: string) {
  return (props: any) => {
    const { x, y, value, index } = props as { x?: number; y?: number; value?: number; index?: number }
    if (index !== valuationMultipleTrend.length - 1 || typeof x !== 'number' || typeof y !== 'number') return null
    return <text x={x + 6} y={y + 3.5} fill={color} fontSize={9.5} fontWeight={700} style={{ fontVariantNumeric: 'tabular-nums' }}>{typeof value === 'number' ? `${value}x` : ''}</text>
  }
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const h = Math.max(5, (value / max) * 48)
  return (
    <div className="flex flex-col items-center justify-end">
      <span className="mb-1 text-[9.5px] font-semibold text-navy-deep tabular-nums">{label}</span>
      <div className="w-4 rounded-t-md" style={{ height: h, background: color }} />
    </div>
  )
}

function ConfPill({ c }: { c: 'High' | 'Medium' | 'Low' }) {
  const tone = c === 'High' ? 'text-teal' : c === 'Medium' ? 'text-champagne-deep' : 'text-ink-secondary'
  return <span className={`font-semibold ${tone}`}>{c} conf.</span>
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
