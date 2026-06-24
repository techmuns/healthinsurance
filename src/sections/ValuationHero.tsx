import type { ReactNode } from 'react'
import { ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react'
import {
  analystConsensus,
  focalGwpFy,
  focalMultiples,
  FOCAL_VALUATION_ID,
  marketSnapshot,
  peerValuation,
} from '@/data/valuationData'
import { srcTag } from '@/data/valuationSources'
import { SourceTag } from '@/components/SourceTag'
import { GOLD, NAVY, PEER, TEAL, px, ratingTone, upPct, xMult } from './valuationShared'

// ---------------------------------------------------------------------------
//  Valuation hero — a premium, infographic-style answer to "Is the valuation
//  earned?". Three columns: an editorial intro + verdict (left), a valuation-
//  position gauge that doubles as the IPO → Listed → Current → Fair-value
//  journey (centre), and a compact "valuation lenses" card with the premium-to-
//  listed-peer visual (right).
//
//  NOTHING here changes the underlying data, sources or calculations — every
//  figure is read live from valuationData and derived exactly as the previous
//  view derived it (upside, return-since-listing, premium vs Star). This file is
//  layout + visual storytelling only.
// ---------------------------------------------------------------------------

export function ValuationHero() {
  const ms = marketSnapshot
  const ac = analystConsensus
  const price = ms.currentPrice
  const ipo = ms.ipoPrice
  const listed = ms.listPrice
  const lo = ms.weekLow52
  const hi = ms.weekHigh52
  const target = ac.consensusTargetPrice // street fair value

  const pGwp = focalMultiples.pGwp
  const star = peerValuation.find((r) => r.companyId === 'star-health')
  const starPGwp = star?.pGwp ?? null
  const niva = peerValuation.find((r) => r.companyId === FOCAL_VALUATION_ID)
  const premiumVsStar = pGwp != null && starPGwp ? ((pGwp - starPGwp) / starPGwp) * 100 : null

  const upside = target != null ? (target / price - 1) * 100 : null
  const ret = (price / ipo - 1) * 100

  // Verdict headline + stance — identical thresholds to the prior view.
  const verdictTitle =
    upside == null ? 'Awaiting Street targets'
    : upside >= 12 ? 'Upside to Street targets'
    : upside >= -3 ? 'Near Street fair value'
    : 'Above Street targets'
  const stanceLabel =
    premiumVsStar != null && premiumVsStar > 5 ? 'Premium to listed peers'
    : premiumVsStar != null && premiumVsStar < -5 ? 'Discount to listed peer'
    : 'In line with peer'
  const verdictTone = ratingTone[ac.ratingLabel as keyof typeof ratingTone] ?? ratingTone.Buy
  const growthEdge =
    premiumVsStar != null && premiumVsStar > 0 && niva?.growth != null && star?.growth != null && niva.growth > star.growth

  // One-line takeaway built from the same numbers shown on the page (no new data).
  const takeaway: ReactNode = (
    <>
      Trades at <b className="text-navy-deep">{px(price)}</b> versus the Street&rsquo;s <b className="text-navy-deep">{px(target)}</b> fair value
      {upside != null && (
        <> — about <b style={{ color: upside >= 0 ? '#0E6F6D' : '#A8443B' }}>{upPct(upside)}</b> {upside >= 0 ? 'upside' : 'downside'}</>
      )}
      {premiumVsStar != null && (
        <>, a <b className="text-champagne-deep">~{Math.abs(premiumVsStar).toFixed(0)}% {premiumVsStar >= 0 ? 'premium' : 'discount'}</b> to Star on P/GWP</>
      )}
      {growthEdge ? ' backed by faster growth' : ''}.
    </>
  )

  return (
    <section className="relative overflow-hidden rounded-[1.5rem] border border-[#ECEAE0] bg-gradient-to-br from-[#FBFAF6] via-[#FCFCFA] to-[#F4F7FC] p-5 shadow-[0_2px_4px_rgba(23,43,77,0.04),0_22px_50px_rgba(23,43,77,0.08)] sm:p-6 lg:p-7">
      {/* faint tonal pools — keep the canvas warm, never flat */}
      <span className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-50 blur-3xl" style={{ background: 'radial-gradient(circle,rgba(22,142,142,0.10),transparent 70%)' }} />
      <span className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full opacity-50 blur-3xl" style={{ background: 'radial-gradient(circle,rgba(182,139,58,0.10),transparent 70%)' }} />

      <div className="relative grid items-stretch gap-6 lg:grid-cols-[0.92fr_1.16fr_0.96fr]">
        {/* ── LEFT · the verdict (answers the page's question) ──────────── */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: verdictTone.fg }} />
            <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-champagne-deep">Street verdict</p>
          </div>
          <h2 className="mt-2.5 font-display text-[27px] leading-[1.08] tracking-tight text-navy-deep">{verdictTitle}</h2>
          <p className="mt-3 max-w-[20rem] text-[12.5px] leading-relaxed text-ink-secondary">{takeaway}</p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold" style={{ color: verdictTone.fg, background: verdictTone.bg }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: verdictTone.fg }} />
              {ac.ratingLabel}-skewed · {ac.analystCount} analyst{ac.analystCount === 1 ? '' : 's'}
            </span>
            {premiumVsStar != null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#EAD9B6] bg-champagne-soft px-2.5 py-1 text-[10.5px] font-semibold text-champagne-deep">
                {stanceLabel}
              </span>
            )}
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
            <SourceTag {...srcTag('niva-price')} />
            <SourceTag {...srcTag('niva-consensus')} />
          </div>
        </div>

        {/* ── CENTRE · valuation-position gauge / journey ───────────────── */}
        <div className="flex flex-col items-center rounded-2xl border border-soft-border bg-white/65 px-4 pb-4 pt-3.5 shadow-soft backdrop-blur">
          <div className="flex w-full items-center justify-between">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-ink-secondary">Valuation position</p>
            <p className="text-[9.5px] font-medium text-ink-secondary/80">vs IPO → fair value</p>
          </div>

          <ValuationGauge ipo={ipo} listed={listed} price={price} target={target} hi={hi} />

          {/* Current price anchor */}
          <div className="-mt-1 text-center">
            <p className="font-display text-[30px] leading-none tracking-tight text-navy-deep tabular-nums">{px(price)}</p>
            <p className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-secondary">Current price</p>
            <p className="mt-0.5 text-[9.5px] text-ink-secondary/75">{cleanAsOf(ms.priceAsOf)}</p>
          </div>

          {/* Return + upside callouts */}
          <div className="mt-3.5 grid w-full grid-cols-2 gap-2">
            <Callout
              label="Return since listing"
              value={upPct(ret)}
              tone={ret >= 0 ? 'teal' : 'coral'}
              icon={ret >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            />
            <Callout
              label="Upside to fair value"
              value={upPct(upside)}
              tone={upside == null ? 'navy' : upside >= 0 ? 'gold' : 'coral'}
              icon={<ArrowUpRight className="h-3.5 w-3.5" />}
            />
          </div>
        </div>

        {/* ── RIGHT · valuation lenses ──────────────────────────────────── */}
        <ValuationLensesCard
          pGwp={pGwp}
          starPGwp={starPGwp}
          premiumVsStar={premiumVsStar}
          upside={upside}
          ret={ret}
          lo={lo}
          hi={hi}
          price={price}
          gwpFy={focalGwpFy}
          growthEdge={growthEdge}
        />
      </div>
    </section>
  )
}

// ── Gauge ─────────────────────────────────────────────────────────────────────
// A 180° arc from the IPO issue price (left) to the Street's consensus fair value
// (right). A teal segment fills the climb made since issue; a soft-gold segment
// shows the remaining upside to fair value. Milestone dots mark IPO, listing and
// the current price (the needle). Pure presentation over already-derived numbers.
function ValuationGauge({ ipo, listed, price, target, hi }: { ipo: number; listed: number; price: number; target: number | null; hi: number }) {
  const W = 300
  const H = 168
  const cx = 150
  const cy = 150
  const R = 124
  const SW = 13
  const gMin = ipo
  const gMax = target ?? hi
  const span = gMax - gMin
  const frac = (v: number) => (span > 0 ? Math.max(0, Math.min(1, (v - gMin) / span)) : 0)
  const polar = (f: number, r = R) => ({ x: cx - r * Math.cos(f * Math.PI), y: cy - r * Math.sin(f * Math.PI) })

  const cf = frac(price)
  const L = Math.PI * R
  const track = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`
  const valueDash = `${cf * L} ${L * 2}`
  const upsideDash = `0 ${cf * L} ${(1 - cf) * L} ${L * 2}`
  const tip = polar(cf, R - 1)

  const dots: { f: number; color: string; r: number; title: string }[] = [
    { f: 0, color: GOLD, r: 3.6, title: `IPO issue ${px(ipo)}` },
    { f: frac(listed), color: PEER, r: 3.6, title: `Listed ${px(listed)}` },
  ]

  return (
    <div className="relative mt-1 w-full" style={{ maxWidth: 320 }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Valuation position from IPO issue price to Street fair value">
        <defs>
          <linearGradient id="valGaugeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#C9A24C" />
            <stop offset="0.55" stopColor="#5FB0A6" />
            <stop offset="1" stopColor={TEAL} />
          </linearGradient>
        </defs>
        {/* track */}
        <path d={track} fill="none" stroke="#E9EDF4" strokeWidth={SW} strokeLinecap="round" />
        {/* upside-to-fair-value (soft gold) */}
        <path d={track} fill="none" stroke={GOLD} strokeOpacity={0.34} strokeWidth={SW} strokeLinecap="round" strokeDasharray={upsideDash} />
        {/* value created since IPO (teal gradient) */}
        <path d={track} fill="none" stroke="url(#valGaugeGrad)" strokeWidth={SW} strokeLinecap="round" strokeDasharray={valueDash} />

        {/* fair-value flag at the right end */}
        {target != null && (
          <g>
            <circle cx={cx + R} cy={cy} r={5.5} fill="#FFFFFF" stroke={GOLD} strokeWidth={2} />
          </g>
        )}
        {/* milestone dots */}
        {dots.map((d) => {
          const p = polar(d.f)
          return <circle key={d.title} cx={p.x} cy={p.y} r={d.r} fill={d.color} stroke="#FFFFFF" strokeWidth={1.5}><title>{d.title}</title></circle>
        })}

        {/* needle → current price */}
        <line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke={NAVY} strokeWidth={2.8} strokeLinecap="round" />
        <circle cx={tip.x} cy={tip.y} r={4.5} fill={TEAL} stroke="#FFFFFF" strokeWidth={1.6} />
        <circle cx={cx} cy={cy} r={7} fill={NAVY} />
        <circle cx={cx} cy={cy} r={2.6} fill="#FFFFFF" />
      </svg>

      {/* end anchors */}
      <div className="-mt-2 flex items-start justify-between px-1">
        <div className="text-left">
          <p className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-ink-secondary/80">IPO issue</p>
          <p className="font-display text-[14px] leading-none text-navy-deep tabular-nums">{px(ipo)}</p>
        </div>
        <div className="text-right">
          <p className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-champagne-deep">Fair value</p>
          <p className="font-display text-[14px] leading-none tabular-nums" style={{ color: GOLD }}>{px(target)}</p>
        </div>
      </div>
    </div>
  )
}

// ── Right lenses card ──────────────────────────────────────────────────────────
function ValuationLensesCard({
  pGwp,
  starPGwp,
  premiumVsStar,
  upside,
  ret,
  lo,
  hi,
  price,
  gwpFy,
  growthEdge,
}: {
  pGwp: number | null
  starPGwp: number | null
  premiumVsStar: number | null
  upside: number | null
  ret: number
  lo: number
  hi: number
  price: number
  gwpFy: string
  growthEdge: boolean
}) {
  const maxV = Math.max(pGwp ?? 0, starPGwp ?? 0) || 1
  const barH = (v: number | null) => (v == null ? 0 : Math.round(20 + 74 * (v / maxV)))
  const pos52 = hi > lo ? Math.max(0, Math.min(100, ((price - lo) / (hi - lo)) * 100)) : 50
  const premiumUp = premiumVsStar != null && premiumVsStar >= 0

  return (
    <aside className="flex flex-col rounded-2xl border border-soft-border bg-white/70 p-4 shadow-soft backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-ink-secondary">Valuation lenses</p>
        <span className="rounded-full bg-soft-blue px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-navy-primary">{gwpFy}</span>
      </div>

      {/* Premium to listed peer — paired bars */}
      {pGwp != null && starPGwp != null && (
        <div className="mt-3 rounded-xl border border-[#EAD9B6] bg-gradient-to-b from-[#FBF7EE] to-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-champagne-deep">Premium to listed peer</p>
            {premiumVsStar != null && (
              <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ${premiumUp ? 'bg-champagne-soft text-champagne-deep' : 'bg-[#F1FAF8] text-teal'}`}>
                {premiumUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                {premiumVsStar >= 0 ? '+' : ''}{premiumVsStar.toFixed(0)}%
              </span>
            )}
          </div>
          <div className="mt-2.5 flex items-end justify-center gap-6" style={{ height: 104 }}>
            <PeerBar name="Niva Bupa" value={xMult(pGwp)} h={barH(pGwp)} color={TEAL} focal />
            <PeerBar name="Star Health" value={xMult(starPGwp)} h={barH(starPGwp)} color={PEER} />
          </div>
          <p className="mt-1.5 text-center text-[9px] font-medium uppercase tracking-[0.1em] text-ink-secondary/80">P / GWP · {gwpFy}</p>
        </div>
      )}

      {/* Lens rows */}
      <div className="mt-3 space-y-1.5">
        <LensRow label="P / GWP" value={xMult(pGwp)} tone="navy" hint={gwpFy} />
        <LensRow label="Premium vs Star" value={premiumVsStar == null ? 'n/a' : `${premiumVsStar >= 0 ? '+' : ''}${premiumVsStar.toFixed(0)}%`} tone={premiumUp ? 'gold' : 'teal'} hint="P/GWP" />
        <LensRow label="Upside to fair value" value={upPct(upside)} tone={upside == null ? 'navy' : upside >= 0 ? 'gold' : 'coral'} hint="to consensus" />
        <LensRow label="Return since listing" value={upPct(ret)} tone={ret >= 0 ? 'teal' : 'coral'} hint="vs IPO ₹74" />
      </div>

      {/* 52-week position */}
      <div className="mt-3 rounded-xl border border-soft-border bg-ice/50 p-2.5">
        <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">
          <span>52-week range</span>
          <span className="tabular-nums text-navy-deep">{px(lo)} – {px(hi)}</span>
        </div>
        <div className="relative mt-2 h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg,#EEF1F6,#E6F4F1)' }}>
          <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: `${pos52}%`, background: TEAL }} title={`Now ${px(price)}`} />
        </div>
      </div>

      {growthEdge && (
        <p className="mt-3 text-[10.5px] leading-snug text-ink-secondary">
          The premium is <span className="font-semibold text-champagne-deep">backed by faster growth</span> than the listed peer.
        </p>
      )}
    </aside>
  )
}

// ── Small building blocks ───────────────────────────────────────────────────────
const TONE: Record<'teal' | 'gold' | 'navy' | 'coral', { fg: string; bg: string; ring: string }> = {
  teal: { fg: '#0E6F6D', bg: '#F1FAF8', ring: '#CFE7E3' },
  gold: { fg: '#8A6A1E', bg: '#FBF6EA', ring: '#EAD9A8' },
  navy: { fg: '#27457E', bg: '#EEF3FB', ring: '#D6E2FA' },
  coral: { fg: '#A8443B', bg: '#F8ECEC', ring: '#EAD2CD' },
}

function Callout({ label, value, tone, icon }: { label: string; value: string; tone: 'teal' | 'gold' | 'navy' | 'coral'; icon: ReactNode }) {
  const t = TONE[tone]
  return (
    <div className="rounded-xl border px-2.5 py-2" style={{ background: t.bg, borderColor: t.ring }}>
      <p className="text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</p>
      <p className="mt-0.5 inline-flex items-center gap-1 font-display text-[18px] leading-none tabular-nums" style={{ color: t.fg }}>
        <span style={{ color: t.fg }}>{icon}</span>
        {value}
      </p>
    </div>
  )
}

function LensRow({ label, value, tone, hint }: { label: string; value: string; tone: 'teal' | 'gold' | 'navy' | 'coral'; hint?: string }) {
  const t = TONE[tone]
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5" style={{ background: t.bg }}>
      <span className="text-[10.5px] font-medium text-ink-secondary">{label}</span>
      <span className="inline-flex items-baseline gap-1">
        <span className="font-display text-[14px] leading-none tabular-nums" style={{ color: t.fg }}>{value}</span>
        {hint && <span className="text-[8.5px] uppercase tracking-wide text-ink-secondary/70">{hint}</span>}
      </span>
    </div>
  )
}

function PeerBar({ name, value, h, color, focal = false }: { name: string; value: string; h: number; color: string; focal?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-end" style={{ height: '100%' }}>
      <span className="mb-1 font-display text-[14px] leading-none tabular-nums" style={{ color: focal ? '#0E6F6D' : '#64748B' }}>{value}</span>
      <span
        className="w-9 rounded-t-md"
        style={{ height: Math.max(8, h), background: focal ? `linear-gradient(180deg,${color},#0E6F6D)` : `linear-gradient(180deg,${color},#8C97AB)`, boxShadow: focal ? '0 6px 14px rgba(22,142,142,0.22)' : 'none' }}
      />
      <span className={`mt-1 max-w-[4.5rem] truncate text-[9px] font-semibold ${focal ? 'text-navy-deep' : 'text-ink-secondary'}`} title={name}>{name}</span>
    </div>
  )
}

// Tidy the as-of stamp: the live feed stamps "2026-06-24 15:59:37"; show the date
// (and time when present) in a calmer form. Pure formatting — no value change.
function cleanAsOf(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(s)
  if (!m) return `As of ${s}`
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const d = `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`
  return `As of ${d}${m[4] ? `, ${m[4]}` : ''}`
}
