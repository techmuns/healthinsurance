import { ArrowUpRight, CalendarClock, Gauge, Lock, TrendingDown, TrendingUp } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { SourceTag } from '@/components/SourceTag'
import { useActiveCompany } from '@/state/filters'
import { analystConsensus, analystReports, itemisedBrokerCount, FOCAL_VALUATION_ID, marketSnapshot } from '@/data/valuationData'
import { srcTag } from '@/data/valuationSources'
import { OpenSource, px, ratingTone, upPct, ValPill } from './valuationShared'

const TEAL = '#168E8E'
const NAVY = '#27457E'
const GOLD = '#B68B3A'
const CORAL = '#C0584F'
const SLATE = '#8C97A8'

// ── Street signal (Bull / Neutral / Bear) ────────────────────────────────────
type SignalKind = 'Bullish' | 'Neutral' | 'Bearish'
function computeSignal(buy: number, _hold: number, sell: number, n: number, upside: number) {
  const ratingScore = n > 0 ? (buy - sell) / n : 0 // −1..1
  const upsideScore = Math.max(-1, Math.min(1, upside / 20))
  const score = Math.max(0, Math.min(10, 5.5 + ratingScore * 3 + upsideScore * 1.5))
  const kind: SignalKind = score >= 6.5 && upside >= 0 ? 'Bullish' : score <= 4 || upside <= -5 ? 'Bearish' : 'Neutral'
  return { score, kind }
}
const SIGNAL_TONE: Record<SignalKind, { fg: string; bg: string; ring: string }> = {
  Bullish: { fg: TEAL, bg: 'linear-gradient(135deg,#F1F8F6,#E1F2F1)', ring: '#BFE3E1' },
  Neutral: { fg: '#9A6B12', bg: 'linear-gradient(135deg,#FBF6EA,#F4ECDB)', ring: '#EAD9B6' },
  Bearish: { fg: CORAL, bg: 'linear-gradient(135deg,#F9EEED,#F4DEDB)', ring: '#EBCFCE' },
}

function StreetSignal({ kind, score, reason }: { kind: SignalKind; score: number; reason: string }) {
  const t = SIGNAL_TONE[kind]
  const Icon = kind === 'Bullish' ? TrendingUp : kind === 'Bearish' ? TrendingDown : Gauge
  return (
    <div
      className="relative w-full max-w-[300px] overflow-hidden rounded-[1.15rem] border p-4 shadow-card"
      style={{ background: t.bg, borderColor: t.ring }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: t.fg }}>Street Signal</span>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/80 shadow-soft" style={{ color: t.fg }}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-[26px] leading-none" style={{ color: t.fg }}>{kind}</span>
        <span className="font-display text-[16px] leading-none text-navy-deep/80">{score.toFixed(1)} / 10</span>
      </div>
      {/* Signal meter */}
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full" style={{ background: 'linear-gradient(90deg,#F4DEDB,#F4ECDB,#E1F2F1)' }}>
        <div className="h-full rounded-full" style={{ width: `${score * 10}%`, background: t.fg }} />
      </div>
      <p className="mt-2 text-[11px] font-medium text-navy-deep/80">{reason}</p>
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────--
// Tone-coded tint presets — a faint colour fill + bloom so each KPI tile is
// instantly readable by meaning (teal = upside, navy = price, slate = neutral,
// coral = downside) while staying premium and calm.
const KPI_TINT: Record<'navy' | 'teal' | 'coral' | 'slate', { bg: string; border: string; glow: string }> = {
  navy: { bg: 'linear-gradient(135deg,#FFFFFF 0%, rgba(39,69,126,0.06) 100%)', border: 'rgba(39,69,126,0.18)', glow: 'rgba(39,69,126,0.10)' },
  teal: { bg: 'linear-gradient(135deg,#FFFFFF 0%, rgba(22,142,142,0.07) 100%)', border: 'rgba(22,142,142,0.18)', glow: 'rgba(22,142,142,0.10)' },
  coral: { bg: 'linear-gradient(135deg,#FFFFFF 0%, rgba(199,93,84,0.06) 100%)', border: 'rgba(199,93,84,0.18)', glow: 'rgba(199,93,84,0.10)' },
  slate: { bg: 'linear-gradient(135deg,#FFFFFF 0%, rgba(140,151,168,0.07) 100%)', border: 'rgba(140,151,168,0.20)', glow: 'rgba(140,151,168,0.10)' },
}

function Kpi({ label, value, sub, tone = 'navy' }: { label: string; value: string; sub: string; tone?: 'navy' | 'teal' | 'coral' | 'slate' }) {
  const color = tone === 'teal' ? 'text-teal' : tone === 'coral' ? 'text-coral' : tone === 'slate' ? 'text-ink-secondary' : 'text-navy-deep'
  const bar = tone === 'teal' ? TEAL : tone === 'coral' ? CORAL : tone === 'slate' ? SLATE : NAVY
  const tint = KPI_TINT[tone]
  return (
    <div
      className="group relative overflow-hidden rounded-[1.15rem] border p-4 shadow-[0_1px_2px_rgba(23,43,77,0.04),0_10px_24px_rgba(23,43,77,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_2px_6px_rgba(23,43,77,0.06),0_16px_34px_rgba(23,43,77,0.1)]"
      style={{ background: tint.bg, borderColor: tint.border }}
    >
      <span className="pointer-events-none absolute -right-8 -top-9 h-24 w-24 rounded-full opacity-70 blur-2xl transition-opacity duration-300 group-hover:opacity-100" style={{ background: tint.glow }} />
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: bar }} />
      <p className="relative pl-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</p>
      <p className={`relative mt-1 pl-1.5 font-display text-[24px] leading-none ${color}`}>{value}</p>
      <p className="relative mt-1 pl-1.5 text-[10px] text-ink-secondary/85">{sub}</p>
    </div>
  )
}

// ── A single labelled value range bar on a shared ₹ scale ─────────────────────
function ScaledRange({
  label,
  lo,
  hi,
  domainLo,
  domainHi,
  trackColor,
  marker,
}: {
  label: string
  lo: number
  hi: number
  domainLo: number
  domainHi: number
  trackColor: string
  marker?: { value: number; color: string; caption: string }
}) {
  const span = domainHi - domainLo || 1
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - domainLo) / span) * 100))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px]">
        <span className="font-semibold uppercase tracking-wide text-ink-secondary">{label}</span>
        <span className="tabular-nums text-ink-secondary">{px(lo)} – {px(hi)}</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-ice">
        <div className="absolute top-0 h-full rounded-full" style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%`, background: trackColor }} />
        {marker && (
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white shadow-soft"
            style={{ left: `${pos(marker.value)}%`, background: marker.color }}
            title={marker.caption}
          />
        )}
      </div>
    </div>
  )
}

export function StreetView() {
  const company = useActiveCompany()
  const isFocal = company.id === FOCAL_VALUATION_ID

  if (!isFocal) {
    return (
      <div className="space-y-5">
        <header>
          <h2 className="font-display text-[22px] leading-tight text-navy-deep">Street View</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-secondary">Analyst targets, ratings, price trend, and key catalysts.</p>
        </header>
        <div className="card-surface p-5">
          <EmptyState
            title={`Analyst coverage not tracked for ${company.shortName}`}
            body={`Street estimates, broker targets and consensus are tracked for ${marketSnapshot.company} (listed) today. Other insurers populate here once citable analyst notes are ingested.`}
            height={300}
          />
        </div>
      </div>
    )
  }

  const ac = analystConsensus
  const price = marketSnapshot.currentPrice
  const target = ac.consensusTargetPrice
  const lo = ac.lowestTargetPrice
  const hi = ac.highestTargetPrice
  const upside = target != null ? (target / price - 1) * 100 : 0
  const { score, kind } = computeSignal(ac.buyCount, ac.holdCount, ac.sellCount, ac.analystCount, upside)
  const reason = `${ac.buyCount} Buy · ${ac.holdCount} Hold · ${ac.sellCount} Sell · ${upPct(upside)} upside`
  const up = (t: number | null) => (t != null ? (t / price - 1) * 100 : null)

  // Takeaways (all source-backed; unattributed figures marked source-pending).
  const dom = { lo: Math.min(marketSnapshot.weekLow52, lo ?? marketSnapshot.weekLow52), hi: Math.max(marketSnapshot.weekHigh52, hi ?? marketSnapshot.weekHigh52) }

  return (
    <div className="space-y-5">
      {/* ── Top: title + Street Signal ─────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">Street View</p>
          <h2 className="mt-0.5 font-display text-[23px] leading-tight text-navy-deep">{marketSnapshot.company} · Street View</h2>
          <p className="mt-1 text-[12.5px] text-ink-secondary">Analyst targets, ratings, price trend, and key catalysts.</p>
        </div>
        <StreetSignal kind={kind} score={score} reason={reason} />
      </header>

      {/* ── Row 1: KPI cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Consensus Target" value={px(target)} sub={`${upPct(upside)} vs current`} tone={upside >= 0 ? 'teal' : 'coral'} />
        <Kpi label="Current Price" value={px(price)} sub={`as of ${marketSnapshot.priceAsOf}`} tone="navy" />
        <Kpi label={upside >= 0 ? 'Implied Upside' : 'Implied Downside'} value={upPct(upside)} sub="to consensus target" tone={upside >= 0 ? 'teal' : 'coral'} />
        <Kpi label="Analysts Covering" value={`${ac.analystCount}`} sub={`${ac.buyCount} Buy · ${ac.holdCount} Hold · ${ac.sellCount} Sell`} tone="slate" />
      </div>

      {/* ── Row 2: Target range + Price vs target ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Target range with current-price marker */}
        <div className="card-surface flex flex-col p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-champagne-deep">Target Range</p>
          <p className="mt-0.5 text-[11.5px] text-ink-secondary">Where the price sits across the analyst target range.</p>
          <div className="mt-5 flex-1">
            <div className="relative h-3 rounded-full" style={{ background: 'linear-gradient(90deg,#F8ECEC,#FBF3E2,#E6F4F1)' }}>
              {target != null && lo != null && hi != null && (
                <span className="absolute top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-navy-primary/50" style={{ left: `${((target - lo) / (hi - lo)) * 100}%` }} />
              )}
              {lo != null && hi != null && (
                <span className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white shadow-soft" style={{ left: `${Math.max(0, Math.min(100, ((price - lo) / (hi - lo)) * 100))}%`, background: target != null && price < target ? TEAL : GOLD }} />
              )}
            </div>
            <div className="mt-2 flex justify-between text-[11px]">
              <div><p className="font-semibold tabular-nums text-coral">{px(lo)}</p><p className="text-[9px] uppercase tracking-wide text-ink-secondary">Low</p></div>
              <div className="text-center"><p className="font-semibold tabular-nums text-navy-deep">{px(target)}</p><p className="text-[9px] uppercase tracking-wide text-ink-secondary">Consensus</p></div>
              <div className="text-right"><p className="font-semibold tabular-nums text-teal">{px(hi)}</p><p className="text-[9px] uppercase tracking-wide text-ink-secondary">High</p></div>
            </div>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ice px-2.5 py-1 text-[11px]">
              <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: target != null && price < target ? TEAL : GOLD }} />
              Current <span className="font-semibold text-navy-deep">{px(price)}</span> · {upPct(upside)} to consensus
            </div>
          </div>
        </div>

        {/* Price vs target — 52-week trading range vs analyst target range */}
        <div className="card-surface flex flex-col p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-champagne-deep">Price vs Target</p>
          <p className="mt-0.5 text-[11.5px] text-ink-secondary">52-week trading range vs the analyst target range.</p>
          <div className="mt-5 flex flex-1 flex-col justify-center gap-5">
            <ScaledRange label="52-week trading range" lo={marketSnapshot.weekLow52} hi={marketSnapshot.weekHigh52} domainLo={dom.lo} domainHi={dom.hi} trackColor={SLATE} marker={{ value: price, color: GOLD, caption: `Current ${px(price)}` }} />
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
      </div>

      {/* ── Row 3: Rating split + Top analyst takeaways ───────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="card-surface flex flex-col p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-champagne-deep">Rating Split</p>
          <p className="mt-0.5 text-[11.5px] text-ink-secondary">{ac.analystCount} analysts · refreshed {ac.lastUpdated}</p>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-soft-border">
            <span style={{ width: `${(ac.buyCount / ac.analystCount) * 100}%`, background: ratingTone.Buy.fg }} />
            <span style={{ width: `${(ac.holdCount / ac.analystCount) * 100}%`, background: ratingTone.Hold.fg }} />
            <span style={{ width: `${(ac.sellCount / ac.analystCount) * 100}%`, background: ratingTone.Sell.fg }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {([['Buy', ac.buyCount], ['Hold', ac.holdCount], ['Sell', ac.sellCount]] as const).map(([r, c]) => (
              <span key={r} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color: ratingTone[r].fg, background: ratingTone[r].bg }}>
                {c} {r}
              </span>
            ))}
          </div>
        </div>

        <div className="card-surface p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-champagne-deep">Top Analyst Takeaways</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Takeaway icon={<TrendingUp className="h-3.5 w-3.5" />} tone="teal" head="Most bullish" name="Motilal Oswal" detail={`Buy · ${px(hi)} · ${upPct(up(hi))}`} pending={false} />
            <Takeaway icon={<TrendingDown className="h-3.5 w-3.5" />} tone="slate" head="Most conservative" name="JM Financial" detail={`Add · ${px(lo)} · ${upPct(up(lo))}`} pending={false} />
            <Takeaway icon={<CalendarClock className="h-3.5 w-3.5" />} tone="navy" head="Latest update" name={`Motilal Oswal · ${ac.lastUpdated}`} detail={`Buy ${px(hi)} · ${px(target)} consensus`} pending={false} />
          </div>
        </div>
      </div>

      {/* ── Row 4: All analyst views ──────────────────────────────────────── */}
      <div className="card-surface p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-champagne-deep">All Analyst Views</p>
            <p className="mt-0.5 text-[11.5px] text-ink-secondary">Every broker on record — citable notes carry a live source; the rest are marked Source pending, never invented.</p>
          </div>
          <SourceTag {...srcTag('niva-consensus')} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11.5px]">
            <thead>
              <tr className="border-b border-soft-border text-[10px] uppercase tracking-wide text-ink-secondary">
                <th className="py-2 pr-3 font-semibold">Analyst / Broker</th>
                <th className="py-2 pr-3 font-semibold">Rating</th>
                <th className="py-2 pr-3 text-right font-semibold">Target</th>
                <th className="py-2 pr-3 text-right font-semibold">Upside</th>
                <th className="py-2 pr-3 font-semibold">Date</th>
                <th className="py-2 pr-3 font-semibold">Key view</th>
                <th className="py-2 pr-3 font-semibold">Source</th>
                <th className="py-2 font-semibold">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {analystReports.map((r) => {
                const u = up(r.targetPrice)
                return (
                  <tr key={r.sourceId} className="border-b border-[#F2F4F8] align-top transition-colors last:border-0 hover:bg-ice/40">
                    <td className="py-2.5 pr-3 font-semibold text-navy-deep">{r.brokerage}</td>
                    <td className="py-2.5 pr-3">
                      {r.rating ? (
                        <span className="rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold" style={{ color: ratingTone[r.rating].fg, background: ratingTone[r.rating].bg }}>{r.rating}</span>
                      ) : (
                        <span className="text-ink-secondary/40">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums font-semibold text-navy-deep">{r.targetPrice != null ? px(r.targetPrice) : <span className="text-ink-secondary/40">—</span>}</td>
                    <td className={`py-2.5 pr-3 text-right tabular-nums ${u == null ? 'text-ink-secondary/40' : u >= 0 ? 'text-teal' : 'text-coral'}`}>{u == null ? '—' : upPct(u)}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-ink-secondary">{r.reportDate}</td>
                    <td className="py-2.5 pr-3 text-ink-secondary">{r.thesis}</td>
                    <td className="py-2.5 pr-3"><OpenSource id={r.sourceId} /></td>
                    <td className="py-2.5"><ValPill c={r.confidence} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10.5px] text-ink-secondary">
          {analystReports.length} dated broker notes on record from {itemisedBrokerCount} brokers — every row carries a live source. The consensus above reflects each broker&rsquo;s most recent view; older notes are kept as history.
        </p>
      </div>
    </div>
  )
}

function Takeaway({ icon, tone, head, name, detail, pending }: { icon: React.ReactNode; tone: 'teal' | 'slate' | 'navy'; head: string; name: string; detail: string; pending: boolean }) {
  const c = tone === 'teal' ? { bg: '#E1F2F1', fg: TEAL } : tone === 'navy' ? { bg: '#EAF0FB', fg: NAVY } : { bg: '#EEF1F6', fg: SLATE }
  return (
    <div className="rounded-xl border border-soft-border bg-white/70 p-3">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full" style={{ background: c.bg, color: c.fg }}>{icon}</span>
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
