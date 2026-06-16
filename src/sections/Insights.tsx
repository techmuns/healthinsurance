import { useMemo, useState } from 'react'
import { Sparkles, Eye, ShieldAlert, AlertTriangle, Scale, TrendingUp, Gauge, Users, Landmark, Share2, Lightbulb, type LucideIcon } from 'lucide-react'
import generated from '@/data/insights.generated.json'
import type { InsightsFile, Insight, InsightCategory, ProvenanceLayer } from '@/insights/types'
import { InsightChart } from '@/components/InsightChart'

const FILE = generated as unknown as InsightsFile

// Readable insurer names (the data uses lowercase ids).
const NAMES: Record<string, string> = {
  'niva-bupa': 'Niva Bupa', 'star-health': 'Star Health', 'care-health': 'Care Health',
  'aditya-birla': 'Aditya Birla', 'manipalcigna': 'ManipalCigna', panel: 'Across the panel',
}
const pretty = (id: string) => NAMES[id] ?? id
const GOLD = '#C99736'

// Each insight is presented as a "catch" — an icon + plain type + an emotional
// tone (colour psychology: coral = caution, teal = upside, gold = attention,
// navy = steady). Keeps the feed scannable and human, not a research table.
type Tone = 'risk' | 'opp' | 'watch' | 'flag'
const TONE: Record<Tone, { fg: string; bg: string; ring: string }> = {
  risk: { fg: '#A8443B', bg: 'rgba(192,88,79,0.09)', ring: 'rgba(192,88,79,0.22)' },
  opp: { fg: '#0E6F6D', bg: 'rgba(22,142,142,0.09)', ring: 'rgba(22,142,142,0.22)' },
  watch: { fg: '#8A6516', bg: 'rgba(182,139,58,0.11)', ring: 'rgba(182,139,58,0.26)' },
  flag: { fg: '#27457E', bg: 'rgba(39,69,126,0.07)', ring: 'rgba(39,69,126,0.18)' },
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

// The insight card template: a calm two-column read. LEFT carries the story —
// a category accent, a ≤7-word headline, the surprising "so what", and the one
// number that proves it. RIGHT carries a single live chart. Generous white
// space and one idea per card keep it scannable: head turns, eye lands, "I get it".
function InsightCard({ ins, hero = false }: { ins: Insight; hero?: boolean }) {
  const cat = CATCH[ins.category]
  const tone = TONE[cat.tone]
  const Icon = cat.Icon
  // Single-subject insight → spotlight that company in gold; comparisons stay multi-tone.
  const focal = ins.affectedInsurers.length === 1 ? ins.affectedInsurers[0] : undefined
  // The one number that makes the insight concrete — the proof under the claim.
  const stat = ins.evidence.find((e) => e.value != null) ?? ins.evidence[0]
  return (
    <article
      className={[
        'group relative overflow-hidden rounded-2xl border bg-card transition-shadow duration-200',
        hero
          ? 'border-[#E7D29B] shadow-[0_2px_6px_rgba(23,43,77,0.05),0_18px_44px_rgba(23,43,77,0.11)]'
          : 'border-soft-border shadow-card hover:shadow-[0_12px_32px_rgba(23,43,77,0.11)]',
      ].join(' ')}
    >
      {/* Category accent rail — an instant, colour-coded read of the insight's character. */}
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: hero ? `linear-gradient(${tone.fg},${GOLD})` : tone.fg }} />

      <div className="grid grid-cols-1 items-center gap-6 py-5 pl-6 pr-5 lg:grid-cols-[1fr_1.04fr] lg:gap-9 lg:py-7">
        {/* ── LEFT · the story ── */}
        <div className="min-w-0">
          {/* category tag · rank · (start here) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={{ color: tone.fg, background: tone.bg, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}>
              <Icon className="h-3.5 w-3.5" strokeWidth={2.4} /> {cat.label}
            </span>
            <span className="text-[10.5px] font-semibold text-ink-secondary">Insight #{ins.rank}</span>
            {hero && <span className="inline-flex items-center gap-1 rounded-full bg-champagne-soft px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-champagne-deep"><Sparkles className="h-3 w-3" />Start here</span>}
          </div>

          {/* the ≤7-word headline — bold and scannable */}
          <h3 className="mt-3 font-display text-[22px] font-semibold leading-[1.16] tracking-[-0.01em] text-navy-deep lg:text-[25px]">{ins.shortHeadline}</h3>

          {/* the aha, then the impact */}
          <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: tone.fg }}>The overlooked angle</p>
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-ink-primary">{ins.summary}</p>

          {/* the single number that proves it */}
          {stat && (
            <div className="mt-5 flex items-baseline gap-3">
              <span className="font-display text-[28px] leading-none text-navy-deep" style={focal && stat.insurer === focal ? { color: GOLD } : undefined}>{fmtVal(stat.value, stat.unit)}</span>
              <span className="text-[11px] leading-snug text-ink-secondary">
                <strong className="font-semibold text-navy-deep">{pretty(stat.insurer)}</strong> · {stat.metric}
                <br />{stat.context} · {stat.period}
              </span>
            </div>
          )}

          {/* quiet credibility line — conviction, what flips the call, and the source */}
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-soft-border pt-3 text-[10.5px] text-ink-secondary">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-navy-deep">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: CONVICTION_DOT[ins.conviction] }} />
              {CONVICTION_LABEL[ins.conviction]} · {HORIZON[ins.horizon]}
            </span>
            <span className="hidden text-soft-border sm:inline">|</span>
            <span className="inline-flex items-start gap-1.5"><Eye className="mt-0.5 h-3 w-3 shrink-0 text-coral" /><span><strong className="text-navy-deep">Flips if:</strong> {ins.falsifier}</span></span>
            <span className="ml-auto whitespace-nowrap">{sourceLine(ins)}</span>
          </div>
        </div>

        {/* ── RIGHT · one visualization ── */}
        <div className="lg:pl-1"><InsightChart spec={ins.chart} focal={focal} embedded /></div>
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
    <div className="space-y-4">
      {/* Advisor briefing lead */}
      <header className="relative overflow-hidden rounded-2xl border border-soft-border bg-gradient-to-br from-[#FBFCFE] via-card to-[#F6F8FC] p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-champagne-soft text-champagne-deep ring-1 ring-[#E7D29B]"><Lightbulb className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-champagne-deep">Advisor's read</p>
            <h1 className="font-display text-[22px] leading-tight text-navy-deep">What stands out across the dashboard</h1>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-secondary">I went through all five health insurers — every chart, filing and price — and pulled out the insights worth acting on, sharpest first. Each one challenges the obvious read, names the single number behind it, and says what would flip the call.</p>
          </div>
          <div className="rounded-xl border border-soft-border bg-white/70 px-3 py-2 text-right">
            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-secondary">Updated</p>
            <p className="font-display text-[15px] text-navy-deep">{FILE.meta.dataAsOf}</p>
            <p className="mt-0.5 text-[10px] text-ink-secondary">{FILE.insights.length} insights · {avgReady}% source-backed</p>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <Filter label="Insurer" value={insurer} onChange={setInsurer} options={[['all', 'All'], ...ALL_INSURERS.map((i) => [i, pretty(i)] as [string, string])]} />
        <Filter label="Type" value={category} onChange={setCategory} options={[['all', 'All'], ...ALL_CATEGORIES.map((c) => [c, CATCH[c].label] as [string, string])]} />
        <Filter label="Conviction" value={conviction} onChange={setConviction} options={[['all', 'All'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} />
        <span className="text-ink-secondary">· {filtered.length} insight{filtered.length === 1 ? '' : 's'}</span>
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-soft-border bg-ice/40 px-4 py-10 text-center text-[12.5px] text-ink-secondary">Nothing matches this filter.</div>
      ) : (
        <div className="space-y-4">
          {filtered.map((ins, i) => (
            <InsightCard key={ins.id} ins={ins} hero={i === 0 && noFilter} />
          ))}
        </div>
      )}
    </div>
  )
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none rounded-lg border border-soft-border bg-white/85 py-1 pl-2.5 pr-3 text-[11.5px] font-semibold text-navy-deep outline-none transition-colors hover:border-muted-blue focus:border-navy-primary">
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  )
}
