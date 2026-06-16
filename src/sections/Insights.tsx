import { useMemo, useState } from 'react'
import { Sparkles, Target, Crosshair } from 'lucide-react'
import generated from '@/data/insights.generated.json'
import type { InsightsFile, Insight, InsightCategory, ProvenanceLayer } from '@/insights/types'
import { InsightChart } from '@/components/InsightChart'

const FILE = generated as unknown as InsightsFile

// ── Tone tokens (reuse the existing palette — no new colors) ────────────────
const CONVICTION: Record<Insight['conviction'], { bg: string; fg: string; dot: string; label: string }> = {
  high: { bg: 'rgba(22,142,142,0.12)', fg: '#0E6F6D', dot: '#168E8E', label: 'High conviction' },
  medium: { bg: 'rgba(39,69,126,0.10)', fg: '#27457E', dot: '#27457E', label: 'Medium conviction' },
  low: { bg: 'rgba(182,139,58,0.16)', fg: '#8A6516', dot: '#B68B3A', label: 'Low conviction' },
}
const HORIZON: Record<Insight['horizon'], string> = { near: 'Near-term', medium: 'Medium-term', long: 'Long-term' }
const CATEGORY_LABEL: Record<InsightCategory, string> = {
  growth: 'Growth', quality: 'Quality', earnings_quality: 'Earnings quality', valuation: 'Valuation',
  capital: 'Capital', management: 'Management', regulatory: 'Regulatory', market_structure: 'Market structure',
}
const LAYER: Record<ProvenanceLayer, { label: string; cls: string }> = {
  statutory: { label: 'Statutory', cls: 'bg-soft-blue text-navy-primary' },
  annual_report: { label: 'Annual report', cls: 'bg-soft-blue text-navy-primary' },
  ifrs: { label: 'IFRS', cls: 'bg-teal-soft text-teal' },
  broker: { label: 'Broker', cls: 'bg-gold-soft text-gold' },
  aggregator: { label: 'Aggregator', cls: 'bg-gold-soft text-gold' },
  exchange: { label: 'Exchange', cls: 'bg-soft-blue text-navy-primary' },
  derived: { label: 'Derived', cls: 'bg-ice text-ink-secondary ring-1 ring-soft-border' },
  manual: { label: 'Manual', cls: 'bg-champagne-soft text-champagne-deep' },
}

function LayerBadges({ layers }: { layers: ProvenanceLayer[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {[...new Set(layers)].map((l) => (
        <span key={l} className={`rounded px-1 py-0.5 text-[8.5px] font-bold uppercase tracking-wide ${LAYER[l].cls}`}>{LAYER[l].label}</span>
      ))}
    </span>
  )
}

const fmtVal = (v: number | null, unit: string) => (v == null ? 'n/a' : unit === 'x' ? `${v}x` : unit === '%' || unit === 'pp' ? `${v}${unit}` : `${v} ${unit}`)

function InsightCard({ ins, hero = false }: { ins: Insight; hero?: boolean }) {
  const c = CONVICTION[ins.conviction]
  return (
    <article className={`overflow-hidden rounded-2xl border border-soft-border bg-card shadow-soft ${hero ? 'ring-1 ring-navy-primary/25' : ''}`}>
      <div className="border-b border-soft-border px-4 py-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-navy-primary/8 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-navy-primary">#{ins.rank} · {CATEGORY_LABEL[ins.category]}</span>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: c.bg, color: c.fg }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />{c.label}
          </span>
          <span className="rounded-full bg-ice px-2 py-0.5 text-[10px] font-medium text-ink-secondary ring-1 ring-soft-border">{HORIZON[ins.horizon]}</span>
        </div>
        <h3 className="font-display text-[16px] leading-snug text-navy-deep">{ins.headline}</h3>
      </div>

      <div className="grid grid-cols-1 gap-4 px-4 py-3 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-3">
          <p className="text-[12.5px] leading-relaxed text-ink-primary">{ins.thesis}</p>
          <div className="rounded-lg bg-soft-blue/40 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-navy-primary"><Sparkles className="h-3 w-3" /> What consensus misses</p>
            <p className="mt-1 text-[12px] leading-snug text-navy-deep">{ins.whatConsensusMisses}</p>
          </div>
          <div>
            <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-ink-secondary">Evidence</p>
            <ul className="space-y-1.5">
              {ins.evidence.map((e, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-soft-border bg-ice/40 px-2.5 py-1.5 text-[11px]">
                  <span className="font-semibold text-navy-deep">{e.insurer === 'panel' ? 'Panel' : e.insurer}</span>
                  <span className="text-ink-secondary">{e.metric}</span>
                  <span className="font-semibold tabular-nums text-navy-deep">{fmtVal(e.value, e.unit)}</span>
                  <span className="text-ink-secondary">· {e.context} · {e.period}</span>
                  <span className="ml-auto"><LayerBadges layers={e.layers} /></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <InsightChart spec={ins.chart} />
        </div>
      </div>

      <div className="space-y-1.5 border-t border-soft-border bg-ice/30 px-4 py-2.5">
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-primary"><Crosshair className="mt-0.5 h-3.5 w-3.5 shrink-0 text-coral" /><span><strong className="text-navy-deep">Falsifier:</strong> {ins.falsifier}</span></p>
        <p className="flex items-start gap-1.5 text-[10px] leading-snug text-ink-secondary"><Target className="mt-0.5 h-3 w-3 shrink-0" /><span>{ins.sourceNote}</span></p>
      </div>
    </article>
  )
}

const ALL_INSURERS = [...new Set(FILE.insights.flatMap((i) => i.affectedInsurers))]
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

  return (
    <div className="space-y-4">
      {/* Header + coverage */}
      <header className="card-surface rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold-soft text-gold"><Sparkles className="h-4 w-4" /></span>
              <h1 className="font-display text-[22px] leading-tight text-navy-deep">Insights</h1>
            </div>
            <p className="max-w-2xl text-[12.5px] text-ink-secondary">Non-obvious, buy-side reads across the standalone health insurers — each one a divergence, inflection or quality flag a systematic scan surfaces, with an explicit falsifier. Generated from {FILE.meta.signalsComputed} computed signals; the AI writes only what the numbers support.</p>
          </div>
          <div className="rounded-xl border border-soft-border bg-white/70 px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">Data as of</p>
            <p className="font-display text-[15px] text-navy-deep">{FILE.meta.dataAsOf}</p>
            <p className="mt-1 text-[10px] text-ink-secondary">{avgReady}% source-backed · {FILE.meta.signalHash}</p>
          </div>
        </div>
        {/* coverage bar */}
        <div className="mt-3 flex flex-wrap gap-2">
          {FILE.meta.coverage.map((c) => (
            <span key={c.insurer} className="inline-flex items-center gap-1.5 rounded-full bg-ice px-2.5 py-1 text-[10.5px] text-ink-secondary ring-1 ring-soft-border">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.readyPct >= 90 ? '#168E8E' : c.readyPct >= 75 ? '#B68B3A' : '#A8443B' }} />
              {c.insurer} <strong className="text-navy-deep">{c.readyPct}%</strong>{c.gapped ? ` · ${c.gapped} gap` : ''}
            </span>
          ))}
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <Filter label="Insurer" value={insurer} onChange={setInsurer} options={[['all', 'All'], ...ALL_INSURERS.map((i) => [i, i] as [string, string])]} />
        <Filter label="Category" value={category} onChange={setCategory} options={[['all', 'All'], ...ALL_CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]] as [string, string])]} />
        <Filter label="Conviction" value={conviction} onChange={setConviction} options={[['all', 'All'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} />
        <span className="text-ink-secondary">· {filtered.length} insight{filtered.length === 1 ? '' : 's'}</span>
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-soft-border bg-ice/40 px-4 py-10 text-center text-[12.5px] text-ink-secondary">No insights match this filter.</div>
      ) : (
        <div className="space-y-4">
          {filtered.map((ins, i) => <InsightCard key={ins.id} ins={ins} hero={i === 0 && insurer === 'all' && category === 'all' && conviction === 'all'} />)}
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
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}
