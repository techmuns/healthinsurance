import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, Eye, ShieldAlert, AlertTriangle, Scale, TrendingUp, Gauge, Users, Landmark, Share2, Lightbulb, BadgeCheck, ChevronDown, Sigma, BarChart3, type LucideIcon } from 'lucide-react'
import generated from '@/data/insights.generated.json'
import type { InsightsFile, Insight, InsightCategory, ProvenanceLayer } from '@/insights/types'
import { InsightChart } from '@/components/InsightChart'
import { MethodologyPanel } from '@/components/MethodologyPanel'

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
// read (unchanged); a "Show the working" control flips it to the deterministic
// methodology panel on the BACK. LEFT is the written read: category badge, the
// editorial title, the overlooked angle + short thesis, a hero metric tile, then
// conviction / falsifier / source. RIGHT is the visual evidence: one live chart.
function InsightCard({ ins, hero = false }: { ins: Insight; hero?: boolean }) {
  const cat = CATCH[ins.category]
  const tone = TONE[cat.tone]
  const Icon = cat.Icon
  // Single-subject insight → spotlight that company in gold; comparisons stay multi-tone.
  const focal = ins.affectedInsurers.length === 1 ? ins.affectedInsurers[0] : undefined
  // The one number that makes the insight concrete — the proof under the claim.
  const stat = ins.evidence.find((e) => e.value != null) ?? ins.evidence[0]
  // The hero number leans gold when it spotlights one company, else its tone colour.
  const statColor = focal && stat && stat.insurer === focal ? GOLD : tone.fg

  // ── flip state + variable-height 3D flip ──────────────────────────────────
  const reduced = usePrefersReducedMotion()
  const [flipped, setFlipped] = useState(false)
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

  const innerStyle: React.CSSProperties = reduced
    ? { transform: 'none' }
    : { transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)', transition: 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)' }
  const frontFaceStyle: React.CSSProperties = reduced
    ? { opacity: flipped ? 0 : 1, transition: 'opacity 0.22s ease', pointerEvents: flipped ? 'none' : undefined, zIndex: flipped ? 0 : 1 }
    : { zIndex: flipped ? 0 : 1 }
  const backFaceStyle: React.CSSProperties = reduced
    ? { position: 'absolute', inset: 0, transform: 'none', opacity: flipped ? 1 : 0, transition: 'opacity 0.22s ease', pointerEvents: flipped ? undefined : 'none', zIndex: flipped ? 1 : 0 }
    : { position: 'absolute', inset: 0, transform: 'rotateY(180deg)' }

  return (
    <article
      className={[
        'group relative overflow-hidden rounded-2xl border bg-card transition-all duration-200',
        hero
          ? 'border-[#E4CE93] shadow-[0_2px_8px_rgba(23,43,77,0.05),0_22px_52px_rgba(23,43,77,0.12)]'
          : 'border-soft-border shadow-card hover:-translate-y-px hover:shadow-[0_18px_42px_rgba(23,43,77,0.12)]',
      ].join(' ')}
    >
      {/* Category accent strip on the left edge — instant, colour-coded character (shared chrome). */}
      <span aria-hidden className="absolute inset-y-0 left-0 z-[2] w-[3.5px]" style={{ background: hero ? `linear-gradient(180deg, ${tone.fg}, ${GOLD})` : tone.fg }} />

      <div className="flip-3d" style={{ height: h }}>
        <div className="flip-inner" style={innerStyle}>
          {/* ───────────────────── FRONT ───────────────────── */}
          <div ref={frontFaceRef} className="flip-face relative" style={frontFaceStyle}>
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

                {/* source-backed footer strip + the "show the working" control — anchored to the bottom */}
                <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-2 border-t border-soft-border pt-4 text-[10px] text-ink-secondary">
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 font-bold uppercase tracking-[0.08em] text-teal"><BadgeCheck className="h-3 w-3" />Source-backed</span>
                  <span>{sourceLine(ins)}</span>
                  {hasMethodology && (
                    <button
                      ref={showBtnRef}
                      type="button"
                      onClick={() => setFlipped(true)}
                      aria-expanded={flipped}
                      aria-controls={backId}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] shadow-soft transition-all duration-200 hover:shadow-card"
                      style={{ color: tone.fg, background: tone.bg, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
                    >
                      <Sigma className="h-3.5 w-3.5" strokeWidth={2.4} /> Show the working
                    </button>
                  )}
                </div>
              </div>

              {/* ── RIGHT · visual evidence — 55%, the dominant analytical proof ── */}
              <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-soft-border bg-card shadow-soft">
                {/* dark navy header strip */}
                <div className="flex items-center gap-2 bg-gradient-to-r from-navy-deep to-navy-primary px-4 py-2.5">
                  <BarChart3 className="h-3.5 w-3.5 text-[#E4CE93]" strokeWidth={2.2} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/90">Visual Evidence</span>
                </div>
                {/* chart body — grows to fill, so the card bottom-aligns with the memo */}
                <div className="min-h-0 flex-1 p-3.5">
                  <InsightChart spec={ins.chart} focal={focal} bare fill />
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

          {/* ───────────────────── BACK ───────────────────── */}
          {hasMethodology && (
            <div ref={backFaceRef} className="flip-face overflow-hidden rounded-2xl bg-card" style={backFaceStyle} id={backId}>
              <div ref={backRef}>
                <MethodologyPanel ins={ins} tone={tone} onBack={() => setFlipped(false)} backRef={backBtnRef} labelId={labelId} />
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

const ALL_INSURERS = [...new Set(FILE.insights.flatMap((i) => i.affectedInsurers))].filter((id) => id !== 'panel')
const ALL_CATEGORIES = [...new Set(FILE.insights.map((i) => i.category))]

export function Insights() {
  const [insurer, setInsurer] = useState<string>('all')
  const [category, setCategory] = useState<string>('all')
  const [conviction, setConviction] = useState<string>('all')

  const filtered = useMemo(
    () =>
      FILE.insights
        .filter((i) => insurer === 'all' || i.affectedInsurers.includes(insurer))
        .filter((i) => category === 'all' || i.category === category)
        .filter((i) => conviction === 'all' || i.conviction === conviction)
        .sort((a, b) => a.rank - b.rank),
    [insurer, category, conviction],
  )
  const avgReady = Math.round(FILE.meta.coverage.reduce((s, c) => s + c.readyPct, 0) / Math.max(1, FILE.meta.coverage.length))
  const noFilter = insurer === 'all' && category === 'all' && conviction === 'all'

  return (
    // `insights-tab` scopes the editorial Cormorant Garamond serif to this tab's
    // written narrative only; charts, tables, numbers and controls stay sans.
    <div className="insights-tab space-y-5">
      {/* Advisor briefing lead — slim, premium hero */}
      <header className="relative overflow-hidden rounded-2xl border border-soft-border bg-gradient-to-br from-[#F7F5EF] via-card to-[#EAEFF7] px-4 py-3.5 shadow-card sm:px-5 sm:py-4">
        {/* soft gold glow behind the icon + a thin gold seam at the top edge */}
        <span aria-hidden className="pointer-events-none absolute -left-8 -top-10 h-36 w-36 rounded-full bg-champagne/20 opacity-70 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute right-1/4 top-0 h-px w-1/3 bg-gradient-to-r from-transparent via-[#B68B3A]/30 to-transparent" />
        <div className="relative flex flex-wrap items-center gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-champagne-soft text-champagne-deep ring-1 ring-[#E7D29B] shadow-[0_4px_14px_rgba(182,139,58,0.22)]"><Lightbulb className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne-deep">Advisor's read</p>
            <h1 className="font-editorial text-[24px] font-semibold leading-tight text-navy-deep">What stands out across the dashboard</h1>
            <p className="mt-1 max-w-2xl font-editorial text-[13.5px] leading-relaxed text-ink-secondary">I went through all five health insurers — every chart, filing and price — and pulled out the insights worth acting on, sharpest first. Each one challenges the obvious read, names the single number behind it, and says what would flip the call.</p>
          </div>
          {/* compact status badge — a live update chip, not a separate card */}
          <div className="inline-flex shrink-0 items-center gap-2.5 rounded-xl border border-soft-border bg-white/75 px-3 py-1.5 shadow-soft backdrop-blur-sm">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-teal/40" /><span className="relative inline-flex h-2 w-2 rounded-full bg-teal" /></span>
            <div className="text-right leading-tight">
              <p className="font-display text-[12.5px] text-navy-deep">Updated {FILE.meta.dataAsOf}</p>
              <p className="text-[9.5px] text-ink-secondary">{FILE.insights.length} insights · {avgReady}% source-backed</p>
            </div>
          </div>
        </div>
      </header>

      {/* Filters — understated premium controls */}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Filter</span>
        <Filter label="Insurer" value={insurer} onChange={setInsurer} options={[['all', 'All'], ...ALL_INSURERS.map((i) => [i, pretty(i)] as [string, string])]} />
        <Filter label="Type" value={category} onChange={setCategory} options={[['all', 'All'], ...ALL_CATEGORIES.map((c) => [c, CATCH[c].label] as [string, string])]} />
        <Filter label="Conviction" value={conviction} onChange={setConviction} options={[['all', 'All'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} />
        <span className="ml-1 text-[10.5px] font-medium text-ink-secondary">{filtered.length} insight{filtered.length === 1 ? '' : 's'} shown</span>
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-soft-border bg-ice/40 px-4 py-10 text-center text-[12.5px] text-ink-secondary">Nothing matches this filter.</div>
      ) : (
        <div className="space-y-5">
          {filtered.map((ins, i) => (
            <InsightCard key={ins.id} ins={ins} hero={i === 0 && noFilter} />
          ))}
        </div>
      )}
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
