import { Activity, ArrowUpRight, CalendarClock, Gauge, Lock, Percent, Target, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { SourceTag } from '@/components/SourceTag'
import { useActiveCompany } from '@/state/filters'
import { FOCAL_VALUATION_ID, marketSnapshot } from '@/data/valuationData'
import { getAnalystCoverage, getMarketQuote } from '@/lib/analystCoverage'
import { srcTag } from '@/data/valuationSources'
import { OpenSource, px, ratingTone, upPct, ValPill } from './valuationShared'

// ── Soft premium palette ─────────────────────────────────────────────────────
// Muted teal/emerald = bullish/positive · soft burgundy/coral = negative ·
// warm gold = premium markers · deep navy = text/structure · slate = neutral.
const NAVY = '#27457E'
const TEAL = '#168E8E'
const GOLD = '#B68B3A'
const BURG = '#B0564A'
const SLATE = '#8C97A8'
// Soft surface tints (mist blue / ivory / slate-blue / teal / coral).
const TINT = {
  mist: { from: '#F2F6FC', to: '#E8F0FA', ring: 'rgba(39,69,126,0.14)' },
  navy: { from: '#FFFFFF', to: '#EBF0FA', ring: 'rgba(39,69,126,0.16)' },
  teal: { from: '#FFFFFF', to: '#E6F4F1', ring: 'rgba(22,142,142,0.20)' },
  coral: { from: '#FFFFFF', to: '#F7ECEA', ring: 'rgba(176,86,74,0.20)' },
  gold: { from: '#FFFFFF', to: '#F8F1E1', ring: 'rgba(182,139,58,0.22)' },
  slate: { from: '#FFFFFF', to: '#EEF2F8', ring: 'rgba(140,151,168,0.22)' },
}
type TintKey = keyof typeof TINT
const RAIL_GRAD = 'linear-gradient(90deg,#F4DEDB 0%,#F6EAD6 50%,#DDEFEA 100%)' // coral → gold → teal

// ── Street signal (Bull / Neutral / Bear) — logic unchanged ──────────────────
type SignalKind = 'Bullish' | 'Neutral' | 'Bearish'
function computeSignal(buy: number, _hold: number, sell: number, n: number, upside: number) {
  const ratingScore = n > 0 ? (buy - sell) / n : 0 // −1..1
  const upsideScore = Math.max(-1, Math.min(1, upside / 20))
  const score = Math.max(0, Math.min(10, 5.5 + ratingScore * 3 + upsideScore * 1.5))
  const kind: SignalKind = score >= 6.5 && upside >= 0 ? 'Bullish' : score <= 4 || upside <= -5 ? 'Bearish' : 'Neutral'
  return { score, kind }
}
const SIGNAL_TONE: Record<SignalKind, string> = { Bullish: TEAL, Neutral: GOLD, Bearish: BURG }

// A calm market-line for the hero background — trends up / flat / down with the
// signal (data-driven ambiance, not a value chart).
function heroPath(kind: SignalKind): string {
  const pts = kind === 'Bullish' ? [62, 58, 60, 50, 52, 40, 34, 26] : kind === 'Bearish' ? [30, 36, 32, 44, 40, 52, 58, 64] : [46, 42, 48, 44, 50, 45, 48, 44]
  const step = 320 / (pts.length - 1)
  return pts.map((y, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(0)},${y}`).join(' ')
}

// ── Semicircular signal gauge ────────────────────────────────────────────────
function SignalGauge({ kind, score, buy, hold, sell, upside }: { kind: SignalKind; score: number; buy: number; hold: number; sell: number; upside: number | null }) {
  const fg = SIGNAL_TONE[kind]
  const Icon = kind === 'Bullish' ? TrendingUp : kind === 'Bearish' ? TrendingDown : Gauge
  const a = Math.PI * (1 - Math.max(0, Math.min(10, score)) / 10) // π (0) … 0 (10)
  const mx = 100 + 80 * Math.cos(a)
  const my = 92 - 80 * Math.sin(a)
  const progress = `M20,92 A80,80 0 0 1 ${mx.toFixed(1)},${my.toFixed(1)}`
  const upTone = upside == null ? SLATE : upside >= 0 ? TEAL : BURG
  return (
    <div className="relative flex flex-col rounded-[1.15rem] border bg-white/80 p-4 shadow-card backdrop-blur-sm" style={{ borderColor: TINT.teal.ring }}>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#B68B3A]/45 to-transparent" />
      <div className="flex items-center justify-between">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-ink-secondary">Street Signal</span>
        <span className="grid h-6 w-6 place-items-center rounded-lg" style={{ background: `${fg}14`, color: fg }}><Icon className="h-3.5 w-3.5" /></span>
      </div>
      {/* gauge */}
      <div className="relative mx-auto mt-1 w-[200px]">
        <svg viewBox="0 0 200 108" className="w-full">
          <defs>
            <linearGradient id="gaugeArc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#E7C9C5" /><stop offset="50%" stopColor="#EAD9B6" /><stop offset="100%" stopColor="#BFE3E1" />
            </linearGradient>
          </defs>
          <path d="M20,92 A80,80 0 0 1 180,92" fill="none" stroke="#E9EDF4" strokeWidth="11" strokeLinecap="round" />
          <path d={progress} fill="none" stroke="url(#gaugeArc)" strokeWidth="11" strokeLinecap="round" />
          <circle cx={mx} cy={my} r="7" fill="#fff" />
          <circle cx={mx} cy={my} r="5" fill={fg} />
        </svg>
        <div className="absolute inset-x-0 bottom-1 text-center">
          <p className="font-display text-[22px] leading-none" style={{ color: fg }}>{kind}</p>
          <p className="font-display text-[13px] leading-tight text-navy-deep/75 tabular-nums">{score.toFixed(1)} <span className="text-ink-secondary/70">/ 10</span></p>
        </div>
      </div>
      {/* chips */}
      <div className="mt-1 flex flex-wrap justify-center gap-1.5">
        {([['Buy', buy], ['Hold', hold], ['Sell', sell]] as const).map(([r, c]) => (
          <span key={r} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: ratingTone[r].fg, background: ratingTone[r].bg }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: ratingTone[r].fg }} />{c} {r}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: upTone, background: `${upTone}16` }}>
          <Percent className="h-2.5 w-2.5" />{upPct(upside)} upside
        </span>
      </div>
    </div>
  )
}

// ── KPI card — soft tint + icon + a data-driven mini accent ──────────────────
function Kpi({ label, value, sub, tone, Icon, accent }: { label: string; value: string; sub: string; tone: TintKey; Icon: typeof Target; accent?: React.ReactNode }) {
  const t = TINT[tone]
  const fg = tone === 'teal' ? TEAL : tone === 'coral' ? BURG : tone === 'gold' ? GOLD : tone === 'slate' ? SLATE : NAVY
  return (
    <div className="group relative overflow-hidden rounded-[1.15rem] border p-4 shadow-[0_1px_2px_rgba(23,43,77,0.04),0_10px_24px_rgba(23,43,77,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_2px_6px_rgba(23,43,77,0.06),0_16px_34px_rgba(23,43,77,0.09)]" style={{ background: `linear-gradient(150deg, ${t.from} 0%, ${t.to} 100%)`, borderColor: t.ring }}>
      <div className="flex items-center justify-between">
        <p className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</p>
        <span className="grid h-6 w-6 place-items-center rounded-lg" style={{ background: `${fg}14`, color: fg }}><Icon className="h-3.5 w-3.5" /></span>
      </div>
      <p className="mt-1.5 font-display text-[24px] leading-none tabular-nums" style={{ color: fg }}>{value}</p>
      <p className="mt-1 text-[10px] text-ink-secondary/85">{sub}</p>
      {accent && <div className="mt-2.5">{accent}</div>}
    </div>
  )
}

// data-driven mini accents
function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.05]">
      <div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, pct))}%`, background: color }} />
    </div>
  )
}
function MiniSplit({ buy, hold, sell, total }: { buy: number; hold: number; sell: number; total: number }) {
  const w = (n: number) => (total > 0 ? (n / total) * 100 : 0)
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-black/[0.05]">
      <span style={{ width: `${w(buy)}%`, background: ratingTone.Buy.fg }} />
      <span style={{ width: `${w(hold)}%`, background: ratingTone.Hold.fg }} />
      <span style={{ width: `${w(sell)}%`, background: ratingTone.Sell.fg }} />
    </div>
  )
}
function MiniDot({ pct }: { pct: number }) {
  return (
    <div className="relative h-1.5 w-full rounded-full" style={{ background: 'linear-gradient(90deg,#EEF2F8,#E2E8F2)' }}>
      <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: `${Math.max(3, Math.min(97, pct))}%`, background: GOLD }} />
    </div>
  )
}

// ── A labelled value range rail on a shared ₹ scale (data unchanged) ─────────
function ScaledRange({ label, lo, hi, domainLo, domainHi, trackColor, marker }: { label: string; lo: number; hi: number; domainLo: number; domainHi: number; trackColor: string; marker?: { value: number; color: string; caption: string } }) {
  const span = domainHi - domainLo || 1
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - domainLo) / span) * 100))
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[10px]">
        <span className="font-semibold uppercase tracking-wide text-ink-secondary">{label}</span>
        <span className="tabular-nums text-ink-secondary">{px(lo)} – {px(hi)}</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-[#EEF2F8]">
        <div className="absolute top-0 h-full rounded-full" style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%`, background: trackColor, opacity: 0.85 }} />
        {marker && (
          <span className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${pos(marker.value)}%` }} title={marker.caption}>
            <span className="h-3.5 w-3.5 rounded-full ring-2 ring-white shadow-soft" style={{ background: marker.color }} />
          </span>
        )}
      </div>
    </div>
  )
}

export function StreetView() {
  const company = useActiveCompany()
  const coverage = getAnalystCoverage(company.id)
  const isFocal = company.id === FOCAL_VALUATION_ID

  if (!coverage) {
    return (
      <div className="space-y-5">
        <HeroBanner company={company.shortName} subtitle="Analyst targets, ratings, price trend, and key catalysts." kind="Neutral" right={null} />
        <div className="card-surface p-5">
          <EmptyState
            title={`Analyst coverage not tracked for ${company.shortName}`}
            body={`Broker targets and consensus are tracked for the listed insurers with citable analyst notes (Niva Bupa, Star Health, ICICI Lombard). ${company.shortName} populates here once such notes are ingested.`}
            height={300}
          />
        </div>
      </div>
    )
  }

  const quote = getMarketQuote(company.id)
  const ac = coverage.consensus
  const reports = coverage.reports
  const price = ac.currentPrice ?? quote?.price ?? null
  const priceAsOf = isFocal ? marketSnapshot.priceAsOf : quote?.asOf ?? '—'
  const has52 = isFocal // 52-week range / daily price history curated for the focal name only
  const target = ac.consensusTargetPrice
  const lo = ac.lowestTargetPrice
  const hi = ac.highestTargetPrice
  const upside = target != null && price != null && price > 0 ? (target / price - 1) * 100 : null
  const { score, kind } = computeSignal(ac.buyCount, ac.holdCount, ac.sellCount, ac.analystCount, upside ?? 0)
  const up = (t: number | null) => (t != null && price != null && price > 0 ? (t / price - 1) * 100 : null)

  // One row per broker: keep each broker's most recent note (newest-first).
  const latestByBroker = reports.filter((r, i) => reports.findIndex((x) => x.brokerage === r.brokerage) === i)

  // Attributions for the takeaway cards, derived from the live coverage (never
  // hardcoded): highest target = most bullish, lowest = most conservative,
  // newest note = latest update.
  const withTarget = latestByBroker.filter((r) => r.targetPrice != null)
  const mostBullish = withTarget.reduce<(typeof withTarget)[number] | null>((best, r) => (best == null || (r.targetPrice as number) > (best.targetPrice as number) ? r : best), null)
  const mostConservative = withTarget.reduce<(typeof withTarget)[number] | null>((worst, r) => (worst == null || (r.targetPrice as number) < (worst.targetPrice as number) ? r : worst), null)
  const latestNote = latestByBroker[0] ?? null

  // Shared ₹ domain for the range bars (52-week range exists for the focal name only).
  const dom = has52
    ? { lo: Math.min(marketSnapshot.weekLow52, lo ?? marketSnapshot.weekLow52), hi: Math.max(marketSnapshot.weekHigh52, hi ?? marketSnapshot.weekHigh52) }
    : { lo: lo ?? price ?? 0, hi: hi ?? price ?? 0 }

  const rangePos = (v: number | null) => (v != null && lo != null && hi != null && hi > lo ? Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)) : 50)
  const pos52 = (v: number | null) => (v != null && has52 ? Math.max(0, Math.min(100, ((v - marketSnapshot.weekLow52) / (marketSnapshot.weekHigh52 - marketSnapshot.weekLow52)) * 100)) : 50)

  return (
    <div className="space-y-5">
      {/* ── Hero + Street Signal ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <HeroBanner
          company={company.shortName}
          subtitle="Price, targets and momentum as the market sees them today."
          kind={kind}
          right={
            <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
              <div><p className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Current price</p><p className="font-display text-[20px] leading-none text-navy-deep tabular-nums">{px(price)}</p></div>
              <div><p className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Consensus</p><p className="font-display text-[20px] leading-none tabular-nums" style={{ color: NAVY }}>{px(target)}</p></div>
              <div><p className="text-[9px] font-semibold uppercase tracking-wide text-ink-secondary">Upside</p><p className="font-display text-[20px] leading-none tabular-nums" style={{ color: upside == null ? SLATE : upside >= 0 ? TEAL : BURG }}>{upPct(upside)}</p></div>
            </div>
          }
          asOf={priceAsOf}
        />
        <SignalGauge kind={kind} score={score} buy={ac.buyCount} hold={ac.holdCount} sell={ac.sellCount} upside={upside} />
      </div>

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Consensus Target" value={px(target)} sub={`${upPct(upside)} vs current`} tone={upside == null ? 'slate' : upside >= 0 ? 'teal' : 'coral'} Icon={Target}
          accent={<MiniBar pct={upside == null ? 0 : Math.abs(upside) * 3} color={upside == null ? SLATE : upside >= 0 ? TEAL : BURG} />} />
        <Kpi label="Current Price" value={px(price)} sub={`as of ${priceAsOf}`} tone="navy" Icon={Wallet}
          accent={has52 ? <MiniDot pct={pos52(price)} /> : <MiniBar pct={rangePos(price)} color={NAVY} />} />
        <Kpi label="Analysts Covering" value={`${ac.analystCount}`} sub={`${ac.buyCount} Buy · ${ac.holdCount} Hold · ${ac.sellCount} Sell`} tone="gold" Icon={Users}
          accent={<MiniSplit buy={ac.buyCount} hold={ac.holdCount} sell={ac.sellCount} total={ac.analystCount} />} />
      </div>

      {/* ── Target range rail + Price vs target rails ──────────────────────── */}
      <div className={`grid grid-cols-1 gap-4 ${has52 ? 'lg:grid-cols-2' : ''}`}>
        {/* Target range — gradient rail with callout markers */}
        <div className="card-surface flex flex-col p-5">
          <PanelHead title="Target Range" note="Where the price sits across the analyst target range." />
          <div className="mt-7 flex-1">
            <div className="relative h-3 rounded-full" style={{ background: RAIL_GRAD }}>
              {/* consensus tick */}
              {target != null && lo != null && hi != null && (
                <span className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-center" style={{ left: `${rangePos(target)}%` }}>
                  <span className="rounded-md bg-white px-1.5 py-0.5 text-[9px] font-semibold text-navy-deep shadow-soft ring-1 ring-soft-border">Consensus {px(target)}</span>
                </span>
              )}
              {target != null && lo != null && hi != null && (
                <span className="absolute top-1/2 h-5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${rangePos(target)}%`, background: 'rgba(39,69,126,0.55)' }} />
              )}
              {/* current price marker + callout */}
              {price != null && lo != null && hi != null && (
                <>
                  <span className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white shadow-soft" style={{ left: `${rangePos(price)}%`, background: target != null && price < target ? TEAL : GOLD }} />
                  <span className="absolute top-7 -translate-x-1/2 whitespace-nowrap" style={{ left: `${rangePos(price)}%` }}>
                    <span className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-soft" style={{ background: target != null && price < target ? TEAL : GOLD }}>Now {px(price)}</span>
                  </span>
                </>
              )}
            </div>
            <div className="mt-9 flex justify-between text-[11px]">
              <div><p className="font-semibold tabular-nums" style={{ color: BURG }}>{px(lo)}</p><p className="text-[9px] uppercase tracking-wide text-ink-secondary">Low</p></div>
              <div className="text-center"><p className="font-semibold tabular-nums text-navy-deep">{px(target)}</p><p className="text-[9px] uppercase tracking-wide text-ink-secondary">Consensus</p></div>
              <div className="text-right"><p className="font-semibold tabular-nums" style={{ color: TEAL }}>{px(hi)}</p><p className="text-[9px] uppercase tracking-wide text-ink-secondary">High</p></div>
            </div>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#F1F4F9] px-2.5 py-1 text-[11px]">
              <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: target != null && price != null && price < target ? TEAL : GOLD }} />
              Current <span className="font-semibold text-navy-deep">{px(price)}</span> · {upPct(upside)} to consensus
            </div>
          </div>
        </div>

        {/* Price vs target — 52-week range vs analyst target range (focal only) */}
        {has52 && (
          <div className="card-surface flex flex-col p-5">
            <PanelHead title="Price vs Target" note="52-week trading range vs the analyst target range." />
            <div className="mt-6 flex flex-1 flex-col justify-center gap-6">
              <ScaledRange label="52-week trading range" lo={marketSnapshot.weekLow52} hi={marketSnapshot.weekHigh52} domainLo={dom.lo} domainHi={dom.hi} trackColor={SLATE} marker={price != null ? { value: price, color: GOLD, caption: `Current ${px(price)}` } : undefined} />
              {lo != null && hi != null && (
                <ScaledRange label="Analyst target range" lo={lo} hi={hi} domainLo={dom.lo} domainHi={dom.hi} trackColor={TEAL} marker={target != null ? { value: target, color: NAVY, caption: `Consensus ${px(target)}` } : undefined} />
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-secondary">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: GOLD }} />Current price</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: NAVY }} />Consensus target</span>
                <span className="italic text-ink-secondary/70">Daily price history not yet ingested — shown as ranges.</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Rating split capsule + Top analyst takeaways ───────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="card-surface flex flex-col p-5">
          <PanelHead title="Rating Split" note={`${ac.analystCount} analysts · refreshed ${ac.lastUpdated}`} />
          {/* segmented capsule */}
          <div className="mt-5 flex h-9 overflow-hidden rounded-full shadow-[inset_0_1px_2px_rgba(23,43,77,0.06)] ring-1 ring-soft-border">
            {([['Buy', ac.buyCount], ['Hold', ac.holdCount], ['Sell', ac.sellCount]] as const).map(([r, c], i) =>
              c > 0 ? (
                <div key={r} className="flex items-center justify-center gap-1 text-[11px] font-semibold tabular-nums" style={{ width: `${(c / ac.analystCount) * 100}%`, background: ratingTone[r].bg, color: ratingTone[r].fg, boxShadow: i < 2 ? 'inset -1px 0 0 rgba(255,255,255,0.7)' : undefined }} title={`${c} ${r}`}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: ratingTone[r].fg }} />
                  {c}
                </div>
              ) : null,
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {([['Buy', ac.buyCount], ['Hold', ac.holdCount], ['Sell', ac.sellCount]] as const).map(([r, c]) => (
              <span key={r} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color: ratingTone[r].fg, background: ratingTone[r].bg }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: ratingTone[r].fg }} />{c} {r}
              </span>
            ))}
          </div>
          <p className="mt-auto pt-3 text-[10.5px] text-ink-secondary">{ac.buyCount} of {ac.analystCount} rate it a Buy — the consensus tilt.</p>
        </div>

        <div className="card-surface p-5">
          <PanelHead title="Top Analyst Takeaways" />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Takeaway icon={<TrendingUp className="h-3.5 w-3.5" />} tone="teal" head="Most bullish" name={mostBullish?.brokerage ?? '—'} detail={mostBullish ? `${mostBullish.rating ?? '—'} · ${px(mostBullish.targetPrice as number)} · ${upPct(up(mostBullish.targetPrice))}` : 'Source pending'} pending={mostBullish == null} />
            <Takeaway icon={<TrendingDown className="h-3.5 w-3.5" />} tone="slate" head="Most conservative" name={mostConservative?.brokerage ?? '—'} detail={mostConservative ? `${mostConservative.rating ?? '—'} · ${px(mostConservative.targetPrice as number)} · ${upPct(up(mostConservative.targetPrice))}` : 'Source pending'} pending={mostConservative == null} />
            <Takeaway icon={<CalendarClock className="h-3.5 w-3.5" />} tone="navy" head="Latest update" name={latestNote ? `${latestNote.brokerage} · ${latestNote.reportDate}` : '—'} detail={latestNote ? `${latestNote.rating ?? '—'}${latestNote.targetPrice != null ? ` ${px(latestNote.targetPrice)}` : ''} · ${px(target)} consensus` : 'Source pending'} pending={latestNote == null} />
          </div>
        </div>
      </div>

      {/* ── All analyst views ──────────────────────────────────────────────── */}
      <div className="card-surface p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <PanelHead title="All Analyst Views" note="Each broker’s most recent call — one row per broker, every row with a live source." />
          {isFocal ? (
            <SourceTag {...srcTag('niva-consensus')} />
          ) : (
            <SourceTag source="Broker research" period={ac.lastUpdated} confidence="medium" provenance={{ source_name: 'Dated broker reports (rating + target + price-at-reco) via the Trendlyne research aggregator.', source_url: reports.find((r) => r.sourceUrl)?.sourceUrl ?? '', fetched_at: '' }} />
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-left text-[11.5px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-navy-primary/80">
                <th className="rounded-l-lg border-y border-l border-[#DCE6F4] bg-[#EBF1FB] py-2.5 pl-3 pr-3 font-semibold">Analyst / Broker</th>
                <th className="border-y border-[#DCE6F4] bg-[#EBF1FB] py-2.5 pr-3 font-semibold">Rating</th>
                <th className="border-y border-[#DCE6F4] bg-[#EBF1FB] py-2.5 pr-3 text-right font-semibold">Target</th>
                <th className="border-y border-[#DCE6F4] bg-[#EBF1FB] py-2.5 pr-3 text-right font-semibold">Upside</th>
                <th className="border-y border-[#DCE6F4] bg-[#EBF1FB] py-2.5 pr-3 font-semibold">Date</th>
                <th className="border-y border-[#DCE6F4] bg-[#EBF1FB] py-2.5 pr-3 font-semibold">Key view</th>
                <th className="border-y border-[#DCE6F4] bg-[#EBF1FB] py-2.5 pr-3 font-semibold">Source</th>
                <th className="rounded-r-lg border-y border-r border-[#DCE6F4] bg-[#EBF1FB] py-2.5 pr-3 font-semibold">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {latestByBroker.map((r) => {
                const u = up(r.targetPrice)
                return (
                  <tr key={r.sourceId} className="align-top transition-colors duration-200 hover:bg-[#F4F8FE]">
                    <td className="border-b border-[#EEF1F7] py-2.5 pl-3 pr-3 font-semibold text-navy-deep">{r.brokerage}</td>
                    <td className="border-b border-[#EEF1F7] py-2.5 pr-3">
                      {r.rating ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-semibold" style={{ color: ratingTone[r.rating].fg, background: ratingTone[r.rating].bg }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: ratingTone[r.rating].fg }} />{r.rating}</span>
                      ) : (
                        <span className="text-ink-secondary/40">—</span>
                      )}
                    </td>
                    <td className="border-b border-[#EEF1F7] py-2.5 pr-3 text-right font-semibold tabular-nums text-navy-deep">{r.targetPrice != null ? px(r.targetPrice) : <span className="text-ink-secondary/40">—</span>}</td>
                    <td className="border-b border-[#EEF1F7] py-2.5 pr-3 text-right font-semibold tabular-nums" style={{ color: u == null ? '#A6AEBC' : u >= 0 ? TEAL : BURG }}>{u == null ? '—' : upPct(u)}</td>
                    <td className="whitespace-nowrap border-b border-[#EEF1F7] py-2.5 pr-3 text-ink-secondary">{r.reportDate}</td>
                    <td className="border-b border-[#EEF1F7] py-2.5 pr-3 text-ink-secondary">{r.thesis}</td>
                    <td className="border-b border-[#EEF1F7] py-2.5 pr-3"><OpenSource id={r.sourceId} url={r.sourceUrl} /></td>
                    <td className="border-b border-[#EEF1F7] py-2.5 pr-3"><ValPill c={r.confidence} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10.5px] text-ink-secondary">
          {latestByBroker.length} brokers on record — each shown with its most recent target; the consensus above reflects these latest views. Targets are sourced, never invented.
        </p>
      </div>
    </div>
  )
}

// ── Hero banner — soft mist-blue, calm market-line ambiance ──────────────────
function HeroBanner({ company, subtitle, kind, right, asOf }: { company: string; subtitle: string; kind: SignalKind; right: React.ReactNode; asOf?: string }) {
  return (
    <header className="relative flex flex-col justify-between overflow-hidden rounded-2xl border p-5 shadow-card" style={{ background: `linear-gradient(135deg, ${TINT.mist.from} 0%, ${TINT.mist.to} 100%)`, borderColor: TINT.mist.ring }}>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#B68B3A]/45 to-transparent" />
      {/* calm market-line + soft glows */}
      <svg aria-hidden viewBox="0 0 320 90" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full opacity-[0.5]">
        <defs>
          <linearGradient id="heroLine" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SIGNAL_TONE[kind]} stopOpacity="0.18" /><stop offset="100%" stopColor={SIGNAL_TONE[kind]} stopOpacity="0" /></linearGradient>
        </defs>
        <path d={`${heroPath(kind)} L320,90 L0,90 Z`} fill="url(#heroLine)" />
        <path d={heroPath(kind)} fill="none" stroke={SIGNAL_TONE[kind]} strokeOpacity="0.4" strokeWidth="1.5" />
      </svg>
      <span aria-hidden className="pointer-events-none absolute -left-12 -top-16 h-44 w-44 rounded-full opacity-50 blur-3xl" style={{ background: 'rgba(39,69,126,0.10)' }} />
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-md" style={{ background: 'rgba(182,139,58,0.14)', color: GOLD }}><Activity className="h-3 w-3" /></span>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">The live market read</p>
        </div>
        <h2 className="mt-1.5 font-display text-[24px] leading-tight text-navy-deep">{company}</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-secondary">{subtitle}{asOf ? <span className="text-ink-secondary/70"> · as of {asOf}</span> : null}</p>
      </div>
      {right && <div className="relative mt-4">{right}</div>}
    </header>
  )
}

// Compact premium panel header — thin gold tick + eyebrow + optional note.
function PanelHead({ title, note }: { title: string; note?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="h-3 w-[3px] rounded-full bg-gradient-to-b from-champagne to-champagne-deep" />
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-champagne-deep">{title}</p>
      </div>
      {note && <p className="mt-1 pl-[11px] text-[11.5px] text-ink-secondary">{note}</p>}
    </div>
  )
}

// Compact mini insight card — soft tint, small icon, subtle left accent.
function Takeaway({ icon, tone, head, name, detail, pending }: { icon: React.ReactNode; tone: 'teal' | 'slate' | 'navy'; head: string; name: string; detail: string; pending: boolean }) {
  const c = tone === 'teal' ? { bg: '#E6F4F1', fg: TEAL } : tone === 'navy' ? { bg: '#EAF0FB', fg: NAVY } : { bg: '#EEF2F8', fg: SLATE }
  return (
    <div className="relative overflow-hidden rounded-xl border border-soft-border p-3 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card" style={{ background: `linear-gradient(150deg, #FFFFFF 58%, ${c.bg})` }}>
      <span className="absolute inset-y-0 left-0 w-[2.5px]" style={{ background: c.fg }} aria-hidden />
      <div className="flex items-center gap-1.5">
        <span className="grid h-6 w-6 place-items-center rounded-lg" style={{ background: c.bg, color: c.fg }}>{icon}</span>
        <span className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-secondary">{head}</span>
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-[12.5px] font-semibold text-navy-deep">
        {name}
        {pending ? <Lock className="h-3 w-3 text-champagne-deep" /> : <ArrowUpRight className="h-3 w-3 text-ink-secondary/50" />}
      </p>
      <p className="mt-0.5 text-[10.5px] text-ink-secondary">{detail}</p>
    </div>
  )
}
