import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, Eye, ShieldAlert, AlertTriangle, Scale, TrendingUp, Gauge, Users, Landmark, Share2, BadgeCheck, ChevronDown, Sigma, BarChart3, CalendarClock, Presentation, type LucideIcon } from 'lucide-react'
import generated from '@/data/insights.generated.json'
import type { InsightsFile, Insight, InsightCategory, ProvenanceLayer } from '@/insights/types'
import { InsightChart } from '@/components/InsightChart'
import { MethodologyPanel } from '@/components/MethodologyPanel'
import { getPromises, type PromiseStatus } from '@/lib/promiseTracker'
import { classifySource, sourceHref, isLinkable } from '@/lib/sourceHealth'
import { useFilters, useActiveCompany } from '@/state/filters'
import { resolveSource, freshnessOf, latestPeriodAcross, type Freshness, type NavTarget, type SourceLocation } from '@/insights/sourceMap'
import { exportInsightsPptx } from '@/lib/pptExport'
import { InvestorPulse } from '@/components/InvestorPulse'
import { ManagementEventIntelligence } from '@/components/ManagementEventIntelligence'

const FILE = generated as unknown as InsightsFile

// Readable insurer names (the data uses lowercase ids).
const NAMES: Record<string, string> = {
  'niva-bupa': 'Niva Bupa', 'star-health': 'Star Health', 'care-health': 'Care Health',
  'aditya-birla': 'Aditya Birla', 'manipalcigna': 'ManipalCigna', panel: 'Across the panel',
}
const pretty = (id: string) => NAMES[id] ?? id
const GOLD = '#C99736'

// Colour-psychology tones, one per insight character — muted and premium, never
// loud: risk = warm terracotta (caution), opp = deep teal (upside), watch =
// champagne gold (valuation / high-conviction), flag = slate navy (steady,
// competitive). Each tone carries fg (ink + strokes), bg (chip tint), ring
// (hairline border), wash (ultra-faint full-card overlay) and soft (metric-tile fill).
type Tone = 'risk' | 'opp' | 'watch' | 'flag'
const TONE: Record<Tone, { fg: string; bg: string; ring: string; wash: string; soft: string }> = {
  risk:  { fg: '#A8443B', bg: 'rgba(168,68,59,0.08)',  ring: 'rgba(168,68,59,0.20)',  wash: 'rgba(168,68,59,0.05)',  soft: '#FBEEEC' },
  opp:   { fg: '#0E6F6D', bg: 'rgba(14,111,109,0.08)', ring: 'rgba(14,111,109,0.20)', wash: 'rgba(14,111,109,0.045)', soft: '#E6F2F1' },
  watch: { fg: '#9C7430', bg: 'rgba(156,116,48,0.10)', ring: 'rgba(156,116,48,0.24)', wash: 'rgba(156,116,48,0.05)',  soft: '#F6EFDD' },
  flag:  { fg: '#27457E', bg: 'rgba(39,69,126,0.07)',  ring: 'rgba(39,69,126,0.18)',  wash: 'rgba(39,69,126,0.04)',  soft: '#EEF3FB' },
}
const CATCH: Record<InsightCategory, { label: string; Icon: LucideIcon; tone: Tone }> = {
  capital: { label: 'Capital watch', Icon: ShieldAlert, tone: 'risk' },
  earnings_quality: { label: 'Earnings-quality flag', Icon: AlertTriangle, tone: 'risk' },
  valuation: { label: 'Valuation gap', Icon: Scale, tone: 'watch' },
  growth: { label: 'Growth standout', Icon: TrendingUp, tone: 'opp' },
  quality: { label: 'Quality flag', Icon: Gauge, tone: 'flag' },
  management: { label: 'Management read', Icon: Users, tone: 'flag' },
  regulatory: { label: 'Regulatory shift', Icon: Landmark, tone: 'flag' },
  market_structure: { label: 'Market shift', Icon: Share2, tone: 'flag' },
}

const CONVICTION_LABEL: Record<Insight['conviction'], string> = { high: 'High conviction', medium: 'Medium conviction', low: 'Low conviction' }
const CONVICTION_DOT: Record<Insight['conviction'], string> = { high: '#168E8E', medium: '#27457E', low: '#8C97A8' }
const HORIZON: Record<Insight['horizon'], string> = { near: 'Near-term', medium: 'Medium-term', long: 'Long-term' }

const fmtVal = (v: number | null, unit: string) => (v == null ? 'n/a' : unit === 'x' ? `${v}x` : unit === '%' || unit === 'pp' ? `${v}${unit}` : `${v} ${unit}`)

// One-line, human provenance — no audit badges, just where it comes from.
const LAYER_WORD: Record<ProvenanceLayer, string> = {
  statutory: 'statutory filings', annual_report: 'annual reports', ifrs: 'IFRS accounts',
  broker: 'broker notes', aggregator: 'market aggregators', exchange: 'exchange data',
  derived: 'derived metrics', manual: 'curated filings',
}
function sourceLine(ins: Insight): string {
  const words = [...new Set(ins.evidence.flatMap((e) => e.layers).map((l) => LAYER_WORD[l]))].slice(0, 3)
  return words.length ? `Backed by ${words.join(', ')}` : 'Backed by the dashboard data'
}

// Data-freshness pill — states the period the insight actually uses. Teal when it
// is the newest period in the run; warm champagne when it trails (honest "older
// basis" cue, never hidden). Wording comes from the deterministic freshness read.
function FreshnessPill({ freshness }: { freshness: Freshness }) {
  const fresh = freshness.tone === 'fresh'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold uppercase tracking-[0.06em]"
      style={fresh ? { background: 'rgba(14,111,109,0.09)', color: '#0E6F6D' } : { background: 'rgba(156,116,48,0.12)', color: '#9C7430' }}
      title={freshness.detail}
    >
      <CalendarClock className="h-3 w-3" strokeWidth={2.4} />
      {freshness.shortLabel}
    </span>
  )
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

// The insight card template — a buyside advisor memo. The FRONT is the written
// read (unchanged); clicking ANYWHERE on the card flips it to the deterministic
// methodology panel on the BACK (a "View workings" pill signals the affordance;
// a drag-to-select never flips). LEFT is the written read: category badge, the
// editorial title, the overlooked angle + short thesis, a hero metric tile, then
// Per-target guidance breakdown — the end-to-end "which specific targets were
// met and which were missed" behind a "X of Y delivered" insight. Real and
// source-backed: reads the same getPromises() the Promise Tracker uses, so the
// aggregate never disagrees with the line items. Delivered first, then the ones
// still open, each with its target, current actual and a link to the guidance.
const GUIDE_STATUS: Record<PromiseStatus, { label: string; mark: string; fg: string; bg: string; ring: string }> = {
  Delivered:        { label: 'Met',            mark: '✓', fg: '#0E6F6D', bg: 'rgba(14,111,109,0.10)',  ring: 'rgba(14,111,109,0.22)' },
  'On Track':       { label: 'On track',       mark: '→', fg: '#3D5F9F', bg: 'rgba(61,95,159,0.10)',   ring: 'rgba(61,95,159,0.22)' },
  Delayed:          { label: 'Behind',         mark: '!', fg: '#9C7430', bg: 'rgba(156,116,48,0.12)',  ring: 'rgba(156,116,48,0.26)' },
  Missed:           { label: 'Missed',         mark: '✗', fg: '#A8443B', bg: 'rgba(168,68,59,0.10)',   ring: 'rgba(168,68,59,0.22)' },
  'Not Measurable': { label: 'Not measurable', mark: '–', fg: '#64748B', bg: 'rgba(100,116,139,0.10)', ring: 'rgba(100,116,139,0.22)' },
}
const GUIDE_ORDER: PromiseStatus[] = ['Delivered', 'On Track', 'Delayed', 'Missed', 'Not Measurable']

function GuidanceBreakdown({ companyId }: { companyId: string }) {
  const items = getPromises(companyId)
  if (!items.length) return null
  const delivered = items.filter((p) => p.status === 'Delivered').length
  const sorted = [...items].sort((a, b) => GUIDE_ORDER.indexOf(a.status) - GUIDE_ORDER.indexOf(b.status))
  return (
    <div className="flex h-full flex-col">
      <p className="text-[11.5px] leading-snug text-ink-secondary">
        <span className="font-bold text-navy-deep">{delivered} of {items.length}</span> guidance targets delivered — each line is management&apos;s own target vs the latest audited actual.
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {sorted.map((p, i) => {
          const s = GUIDE_STATUS[p.status]
          return (
            <li key={`${p.metric}-${i}`} className="flex items-start gap-2 rounded-lg border bg-card px-2.5 py-1.5" style={{ borderColor: s.ring }}>
              <span className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold" style={{ color: s.fg, background: s.bg }}>{s.mark}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-navy-deep">{p.metric}</p>
                <p className="text-[10.5px] tabular-nums leading-snug text-ink-secondary">
                  Target {p.target} · now {p.current}{p.actualFy ? ` (${p.actualFy})` : ''}
                </p>
              </div>
              <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: s.fg, background: s.bg }}>{s.label}</span>
            </li>
          )
        })}
      </ul>
      {isLinkable(items[0].sourceUrl) && (
        <p className="mt-2 text-[10px] leading-snug text-ink-secondary">
          Source: <a href={sourceHref(items[0].sourceUrl)!} target="_blank" rel="noreferrer" title={classifySource(items[0].sourceUrl).hint} className="text-navy-primary hover:underline">{items[0].source}</a> · targets are management&apos;s stated guidance; actuals read live from the audited annual disclosures.
        </p>
      )}
    </div>
  )
}

// conviction / falsifier / source. RIGHT is the visual evidence: one live chart.
function InsightCard({ ins, hero = false, source, freshness, onGoToSource, initialFlipped = false }: { ins: Insight; hero?: boolean; source: SourceLocation; freshness: Freshness; onGoToSource: () => void; initialFlipped?: boolean }) {
  const cat = CATCH[ins.category]
  const tone = TONE[cat.tone]
  const Icon = cat.Icon
  // Single-subject insight → spotlight that company in gold; comparisons stay multi-tone.
  const focal = ins.affectedInsurers.length === 1 ? ins.affectedInsurers[0] : undefined
  // The one number that makes the insight concrete — the proof under the claim.
  const stat = ins.evidence.find((e) => e.value != null) ?? ins.evidence[0]
  // A "X of Y guidance delivered" insight → show the per-target met/missed
  // breakdown as its visual evidence (this card carries no chart otherwise).
  const guidanceCo = ins.evidence.find((e) => /guidance delivered/i.test(e.metric))?.insurer ?? null
  // The hero number leans gold when it spotlights one company, else its tone colour.
  const statColor = focal && stat && stat.insurer === focal ? GOLD : tone.fg

  // ── flip state + variable-height 3D flip ──────────────────────────────────
  // `initialFlipped` is true only when the reader is returning from "Go to source
  // → Back to Insight", so the card reopens on its workings, where they left off.
  const reduced = usePrefersReducedMotion()
  const [flipped, setFlipped] = useState(initialFlipped)
  const articleRef = useRef<HTMLElement>(null)
  const frontRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const frontFaceRef = useRef<HTMLDivElement>(null)
  const backFaceRef = useRef<HTMLDivElement>(null)
  const showBtnRef = useRef<HTMLButtonElement>(null)
  const backBtnRef = useRef<HTMLButtonElement>(null)
  const [h, setH] = useState<number | undefined>(undefined)
  const didMount = useRef(false)
  const backId = `methodology-${ins.id}`
  const labelId = `methodology-label-${ins.id}`
  const hasMethodology = !!ins.methodology

  // Measure both faces and size the card to whichever is showing (auto-grow, never clip).
  useLayoutEffect(() => {
    const measure = () => setH((flipped ? backRef.current?.offsetHeight : frontRef.current?.offsetHeight) || undefined)
    measure()
    const ro = new ResizeObserver(measure)
    if (frontRef.current) ro.observe(frontRef.current)
    if (backRef.current) ro.observe(backRef.current)
    return () => ro.disconnect()
  }, [flipped])

  // Move focus to the newly-revealed face; keep inert/aria-hidden on the hidden one.
  useEffect(() => {
    if (frontFaceRef.current) frontFaceRef.current.inert = flipped
    if (backFaceRef.current) backFaceRef.current.inert = !flipped
    if (!didMount.current) { didMount.current = true; return }
    if (flipped) backBtnRef.current?.focus()
    else showBtnRef.current?.focus()
  }, [flipped])

  // On return from "Go to source", scroll this (re-flipped) card back into view.
  useEffect(() => {
    if (initialFlipped) articleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const innerStyle: React.CSSProperties = reduced
    ? { transform: 'none' }
    : { transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)', transition: 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)' }
  const frontFaceStyle: React.CSSProperties = reduced
    ? { opacity: flipped ? 0 : 1, transition: 'opacity 0.22s ease', pointerEvents: flipped ? 'none' : undefined, zIndex: flipped ? 0 : 1 }
    : { zIndex: flipped ? 0 : 1 }
  const backFaceStyle: React.CSSProperties = reduced
    ? { position: 'absolute', inset: 0, transform: 'none', opacity: flipped ? 1 : 0, transition: 'opacity 0.22s ease', pointerEvents: flipped ? undefined : 'none', zIndex: flipped ? 1 : 0 }
    : { position: 'absolute', inset: 0, transform: 'rotateY(180deg)' }

  // Whole-card flip. Guard: a drag-to-select (or a click on a real link) must not
  // flip — interactive children stopPropagation; here we also skip mid-selection.
  const flipTo = (next: boolean) => {
    if (typeof window !== 'undefined' && window.getSelection?.()?.toString()) return
    setFlipped(next)
  }

  return (
    <article
      ref={articleRef}
      className={[
        'group relative overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:-translate-y-px',
        hero
          ? 'border-[#E4CE93] shadow-[0_2px_8px_rgba(23,43,77,0.05),0_22px_52px_rgba(23,43,77,0.12)] hover:shadow-[0_4px_12px_rgba(23,43,77,0.06),0_26px_58px_rgba(23,43,77,0.14),0_0_0_1px_rgba(228,206,147,0.75)]'
          : 'border-soft-border shadow-card hover:shadow-[0_18px_44px_rgba(23,43,77,0.13),0_0_0_1px_rgba(228,206,147,0.5)]',
      ].join(' ')}
    >
      {/* Category accent strip on the left edge — instant, colour-coded character (shared chrome). */}
      <span aria-hidden className="absolute inset-y-0 left-0 z-[2] w-[3.5px]" style={{ background: hero ? `linear-gradient(180deg, ${tone.fg}, ${GOLD})` : tone.fg }} />

      <div className="flip-3d" style={{ height: h }}>
        <div className="flip-inner" style={innerStyle}>
          {/* ───────────────────── FRONT ───── whole face flips to the working ── */}
          <div ref={frontFaceRef} onClick={() => hasMethodology && flipTo(true)} className={`flip-face relative ${hasMethodology ? 'cursor-pointer' : ''}`} style={frontFaceStyle}>
           <div ref={frontRef} className="relative">
            {/* Ultra-faint category wash — a tinted overlay, never a flat fill. */}
            <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(100deg, ${tone.wash} 0%, transparent 40%)` }} />

            <div className="relative grid grid-cols-1 items-stretch gap-6 py-6 pl-7 pr-6 lg:grid-cols-[45fr_55fr] lg:gap-7 lg:py-7">
              {/* ── LEFT · the advisor memo — 45%, footer anchored to the bottom ── */}
              <div className="flex min-w-0 flex-col">
                {/* category badge · insight number · featured flag — one compact row */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.05em]" style={{ color: tone.fg, background: tone.bg, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}>
                    <Icon className="h-3.5 w-3.5" strokeWidth={2.4} /> {cat.label}
                  </span>
                  <span className="text-[10.5px] font-semibold tabular-nums text-ink-secondary">Insight #{ins.rank}</span>
                  {hero && <span className="inline-flex items-center gap-1 rounded-full bg-champagne-soft px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-champagne-deep ring-1 ring-[#E7D29B]"><Sparkles className="h-3 w-3" />Featured</span>}
                  {/* Interactive cue — the whole card flips, this pill just signals it. */}
                  {hasMethodology && (
                    <button
                      ref={showBtnRef}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setFlipped(true) }}
                      aria-expanded={flipped}
                      aria-controls={backId}
                      title="View the working behind this insight"
                      className="ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-ink-secondary shadow-soft transition-all duration-200 group-hover:shadow-card"
                      style={{ borderColor: tone.ring, background: tone.bg }}
                    >
                      <Sigma className="h-3 w-3" style={{ color: tone.fg }} strokeWidth={2.4} />
                      <span style={{ color: tone.fg }}>View workings</span>
                    </button>
                  )}
                </div>

                {/* title — editorial navy display */}
                <h3 className="mt-3 font-editorial text-[26px] font-bold leading-[1.12] tracking-[-0.01em] text-navy-deep lg:text-[30px]">{ins.shortHeadline}</h3>

                {/* the overlooked angle → short thesis */}
                <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: tone.fg }}>The overlooked angle</p>
                <p className="mt-1.5 font-editorial text-[15px] leading-relaxed text-ink-primary">{ins.summary}</p>

                {/* hero metric tile — locked to the full paragraph width */}
                {stat && (
                  <div className="mt-4 flex w-full items-stretch gap-3.5 rounded-xl p-3.5" style={{ background: tone.soft, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}>
                    <span aria-hidden className="w-[2.5px] shrink-0 rounded-full" style={{ background: statColor }} />
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-[30px] font-semibold leading-none" style={{ color: statColor }}>{fmtVal(stat.value, stat.unit)}</span>
                        <span className="rounded-md bg-white/70 px-1.5 py-0.5 text-[9.5px] font-semibold text-ink-secondary ring-1 ring-soft-border">{stat.period}</span>
                      </div>
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.07em] text-navy-deep">{pretty(stat.insurer)} · {stat.metric}</p>
                      <p className="mt-0.5 font-editorial text-[12.5px] leading-snug text-ink-secondary">{stat.context}</p>
                    </div>
                  </div>
                )}

                {/* conviction / timeframe + the falsifier */}
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[10.5px]">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ice px-2.5 py-1 font-semibold text-navy-deep ring-1 ring-soft-border">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: CONVICTION_DOT[ins.conviction] }} />
                    {CONVICTION_LABEL[ins.conviction]} · {HORIZON[ins.horizon]}
                  </span>
                  <span className="inline-flex items-start gap-1.5 text-ink-secondary"><Eye className="mt-0.5 h-3 w-3 shrink-0 text-coral" /><span className="font-editorial text-[12.5px] italic leading-snug"><strong className="font-semibold not-italic text-navy-deep">Flips if:</strong> {ins.falsifier}</span></span>
                </div>

                {/* source-backed footer strip — anchored to the bottom. Carries an
                    honest data-freshness pill (the period the insight actually uses). */}
                <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-2 border-t border-soft-border pt-4 text-[10px] text-ink-secondary">
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 font-bold uppercase tracking-[0.08em] text-teal"><BadgeCheck className="h-3 w-3" />Source-backed</span>
                  <FreshnessPill freshness={freshness} />
                  <span>{sourceLine(ins)}</span>
                </div>
              </div>

              {/* ── RIGHT · visual evidence — 55%, the dominant analytical proof ── */}
              <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-soft-border bg-card shadow-soft">
                {/* dark navy header strip */}
                <div className="flex items-center gap-2 bg-gradient-to-r from-navy-deep to-navy-primary px-4 py-2.5">
                  <BarChart3 className="h-3.5 w-3.5 text-[#E4CE93]" strokeWidth={2.2} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/90">Visual Evidence</span>
                </div>
                {/* chart body — grows to fill, so the card bottom-aligns with the memo.
                    Guidance insights show the per-target met/missed breakdown here. */}
                <div className="min-h-0 flex-1 p-3.5">
                  {guidanceCo ? <GuidanceBreakdown companyId={guidanceCo} /> : <InsightChart spec={ins.chart} focal={focal} bare fill />}
                </div>
                {/* key takeaway strip — the insight's own "what consensus misses", verbatim */}
                <div className="border-t border-soft-border bg-ice/60 px-4 py-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: tone.fg }}>Key takeaway</p>
                  <p className="mt-1 font-editorial text-[13px] leading-snug text-ink-primary">{ins.whatConsensusMisses}</p>
                </div>
              </div>
            </div>
           </div>
          </div>

          {/* ─────────────── BACK ───── click anywhere to flip back (interactive
               controls inside stop propagation, so accordions/links still work) ── */}
          {hasMethodology && (
            <div ref={backFaceRef} onClick={() => flipTo(false)} className="flip-face cursor-pointer overflow-hidden rounded-2xl bg-card" style={backFaceStyle} id={backId}>
              <div ref={backRef}>
                <MethodologyPanel ins={ins} tone={tone} source={source} freshness={freshness} onGoToSource={onGoToSource} onBack={() => setFlipped(false)} backRef={backBtnRef} labelId={labelId} />
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

const ALL_CATEGORIES = [...new Set(FILE.insights.map((i) => i.category))]

// Company filter — a simple, grouped lens (not one row per insurer). Defaults to
// Niva Bupa so the focal name leads; "Other peers" rolls up the remaining SAHIs.
const OTHER_PEERS = ['care-health', 'aditya-birla', 'manipalcigna']
// Map the GLOBAL selected-company id → the deep-dive feed's grouped lens, so the
// one company picker in the Investor Pulse hero drives this feed too (no
// duplicate company control on the page).
const groupForId = (id: string): string => {
  if (id === 'niva-bupa') return 'niva-bupa'
  if (id === 'star-health') return 'star-health'
  if (OTHER_PEERS.includes(id)) return 'others'
  return 'all'
}
const matchCompany = (ins: Insight, sel: string): boolean => {
  if (sel === 'all') return true
  if (sel === 'others') return ins.affectedInsurers.some((id) => OTHER_PEERS.includes(id))
  return ins.affectedInsurers.includes(sel)
}
// The filter group that surfaces a given insight — so a card reopened on return
// is guaranteed visible in the feed.
const groupFor = (ins: Insight): string => {
  if (ins.affectedInsurers.includes('niva-bupa')) return 'niva-bupa'
  if (ins.affectedInsurers.includes('star-health')) return 'star-health'
  if (ins.affectedInsurers.some((id) => OTHER_PEERS.includes(id))) return 'others'
  return 'all'
}
// The insight's PRIMARY subject — the company its lead evidence stat is about
// (the "101.1% · Star Health" hero). A five-insurer sector card's primary is Star
// even though it also touches Niva; this is what lets a focused-company view LEAD
// with that company instead of merely including it.
const primarySubject = (ins: Insight): string | null => ins.evidence[0]?.insurer ?? null
const leadsFor = (ins: Insight, sel: string): boolean => {
  const p = primarySubject(ins)
  if (sel === 'others') return p != null && OTHER_PEERS.includes(p)
  return p === sel
}

// The newest period anywhere in the run — the yardstick for "latest vs older".
const PANEL_LATEST = latestPeriodAcross(FILE.insights)
// Real generation date (honest) — replaces the stale FY label in the header.
const GEN_DATE = new Date(FILE.meta.generatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

export function Insights({ onNavigate, reopenInsightId, onReopened }: { onNavigate?: (target: NavTarget, insightId: string) => void; reopenInsightId?: string | null; onReopened?: () => void }) {
  // Captured once at mount: when the reader returns from "Go to source", this is
  // the insight to re-open (flipped), and the filter must be set to show it.
  const reopenRef = useRef(reopenInsightId ?? null)
  const { highlightedCompany, setHighlightedCompany } = useFilters()
  const activeCompany = useActiveCompany()
  // The deep-dive feed follows the GLOBAL company picker (in the Pulse hero); on a
  // reopen it snaps to the reopened insight's group so that card is visible.
  const [company, setCompany] = useState<string>(() => {
    const id = reopenRef.current
    const ins = id ? FILE.insights.find((i) => i.id === id) : undefined
    return ins ? groupFor(ins) : groupForId(highlightedCompany)
  })
  const [category, setCategory] = useState<string>('all')
  const [conviction, setConviction] = useState<string>('all')

  // Keep the deep-dive feed in sync with the global company picker (skip the very
  // first run so a reopen-driven initial group isn't immediately overwritten).
  const firstSync = useRef(true)
  useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false
      return
    }
    setCompany(groupForId(highlightedCompany))
  }, [highlightedCompany])

  // Clear the App-level reopen flag once we've mounted (the matching card opens
  // flipped + scrolls itself); the card's own state persists after this clears.
  useEffect(() => {
    if (reopenRef.current) onReopened?.()
  }, [])

  const filtered = useMemo(
    () =>
      FILE.insights
        .filter((i) => matchCompany(i, company))
        .filter((i) => category === 'all' || i.category === category)
        .filter((i) => conviction === 'all' || i.conviction === conviction)
        // In a focused-company view, lead with the insights that are ABOUT that
        // company (primary subject), not merely the ones that mention it — so the
        // Niva view opens on the Niva insight, never a sector card whose hero is a
        // peer. "All" stays sharpest-first (pure editorial rank).
        .sort((a, b) => {
          if (company !== 'all') {
            const d = (leadsFor(a, company) ? 0 : 1) - (leadsFor(b, company) ? 0 : 1)
            if (d !== 0) return d
          }
          return a.rank - b.rank
        }),
    [company, category, conviction],
  )
  const avgReady = Math.round(FILE.meta.coverage.reduce((s, c) => s + c.readyPct, 0) / Math.max(1, FILE.meta.coverage.length))

  // "Go to source" — highlight the insight's company, then jump to its source:
  // Data Audit first (the verification layer), the chart only on fallback. The
  // insight id rides along so the reader can return to this exact card.
  const goToSource = (ins: Insight) => {
    const src = resolveSource(ins)
    if (src.target.company) setHighlightedCompany(src.target.company)
    onNavigate?.(src.target, ins.id)
  }

  return (
    // `insights-tab` scopes the editorial Cormorant Garamond serif to this tab's
    // written narrative only; charts, tables, numbers and controls stay sans.
    <div className="insights-tab space-y-6">
      {/* ── Today's Investor Pulse — the hero/value section. Curated daily
          investor intelligence for the selected company; the Curated Market
          Intelligence feed and Daily Signal Pulse live inside it. ── */}
      <InvestorPulse />

      {/* ── Management & Event Intelligence — the shared, reusable events
          component (full variant). Governance shows only the compact,
          governance-relevant version of this same component. ── */}
      <ManagementEventIntelligence variant="full" companyId={activeCompany.id} companyName={activeCompany.shortName} />

      {/* ── Deep-Dive Insights — the analytical advisor memos (the existing
          insight engine), driven by the same company picker in the Pulse hero. ── */}
      <div className="border-t border-soft-border pt-5">
        <div className="mb-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="h-3 w-[3px] rounded-full bg-champagne" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Deep-Dive Insights</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h2 className="font-display text-[20px] leading-tight text-navy-deep">The analytical reads behind the numbers</h2>
            <span className="text-[11px] text-ink-secondary">{FILE.insights.length} insights · {avgReady}% source-backed · data through {PANEL_LATEST} · updated {GEN_DATE}</span>
          </div>
        </div>

        {/* Filters — Type & Conviction refine; the company is set by the Pulse picker. */}
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Filter</span>
          <Filter label="Type" value={category} onChange={setCategory} options={[['all', 'All'], ...ALL_CATEGORIES.map((c) => [c, CATCH[c].label] as [string, string])]} />
          <Filter label="Conviction" value={conviction} onChange={setConviction} options={[['all', 'All'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} />
          <span className="ml-1 text-[10.5px] font-medium text-ink-secondary">{filtered.length} insight{filtered.length === 1 ? '' : 's'} shown</span>
          {/* Export the shown insights as a PowerPoint deck (one slide per insight). */}
          <button
            type="button"
            onClick={() => exportInsightsPptx({ ...FILE, insights: filtered })}
            disabled={filtered.length === 0}
            title="Download these insights as a PowerPoint deck — a title slide plus one slide per insight"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[#E2CF9B] bg-champagne-soft px-2.5 py-1 text-[11px] font-semibold text-champagne-deep shadow-soft transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Presentation className="h-3.5 w-3.5" /> Export to PowerPoint
          </button>
        </div>

        {/* Feed */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-soft-border bg-ice/40 px-4 py-10 text-center text-[12.5px] text-ink-secondary">No deep-dive insight matches this filter for {activeCompany.shortName}.</div>
        ) : (
          <div className="space-y-5">
            {filtered.map((ins, i) => (
              <InsightCard
                key={ins.id}
                ins={ins}
                hero={i === 0}
                source={resolveSource(ins)}
                freshness={freshnessOf(ins, PANEL_LATEST)}
                onGoToSource={() => goToSource(ins)}
                initialFlipped={ins.id === reopenRef.current}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  const active = value !== 'all'
  return (
    <label
      className={[
        'group inline-flex cursor-pointer items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1 shadow-soft transition-colors',
        active ? 'border-[#E2CF9B] ring-1 ring-[#E2CF9B]/50' : 'border-soft-border hover:border-muted-blue focus-within:border-navy-primary',
      ].join(' ')}
    >
      <span className="text-[8.5px] font-bold uppercase tracking-[0.09em] text-ink-secondary">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none bg-transparent pr-1 text-[11.5px] font-semibold text-navy-deep outline-none">
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <ChevronDown className="h-3 w-3 shrink-0 text-ink-secondary transition-colors group-hover:text-muted-blue" />
    </label>
  )
}
