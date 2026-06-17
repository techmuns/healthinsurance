import { useState, type RefObject } from 'react'
import { ArrowLeft, Sigma, ShieldCheck, Lock, ChevronDown, Check, Flag, FileText } from 'lucide-react'
import type { Insight, MethodDescriptor, ProvenanceLayer } from '@/insights/types'
import { KaTeXFormula } from './KaTeXFormula'

// ---------------------------------------------------------------------------
//  MethodologyPanel — the flip-side of an insight card. It answers one question
//  for a portfolio manager: "why should I believe this?" — with arithmetic, not
//  adjectives. Every value here is rendered from the persisted, deterministic
//  `methodology` block (assembled from the signal payload, never the model), so
//  the working shown is the same computation that produced the insight.
// ---------------------------------------------------------------------------

type Tone = { fg: string; bg: string; ring: string; wash: string; soft: string }

const fmt = (v: number | null): string => {
  if (v == null || !Number.isFinite(v)) return 'n/a'
  const r = Math.round(v * 100) / 100
  return Number.isInteger(r) ? String(r) : String(r)
}
const unitLabel = (u: string): string => (u === 'periods' ? ' yrs' : u === 'x' ? 'x' : u === 'σ' ? 'σ' : u === '%' ? '%' : u === 'pp' ? 'pp' : u === 'items' ? '' : ` ${u}`)
const valUnit = (v: number | null, u: string) => (v == null ? 'n/a' : `${fmt(v)}${unitLabel(u)}`)

// Provenance-layer chips — same taxonomy/confidence palette as the Data Audit:
// teal = directly-sourced (statutory/exchange), navy = filed accounts, gold =
// market/opinion (broker/aggregator), violet = derived, slate = curated.
const LAYER: Record<ProvenanceLayer, { label: string; dot: string; tint: string; ink: string }> = {
  statutory: { label: 'Statutory', dot: '#168E8E', tint: '#E4F3F2', ink: '#0E6F6D' },
  annual_report: { label: 'Annual report', dot: '#27457E', tint: '#ECF1FA', ink: '#27457E' },
  ifrs: { label: 'IFRS', dot: '#27457E', tint: '#ECF1FA', ink: '#27457E' },
  exchange: { label: 'Exchange', dot: '#168E8E', tint: '#E4F3F2', ink: '#0E6F6D' },
  broker: { label: 'Broker', dot: '#B68B3A', tint: '#F5EDDC', ink: '#9C7430' },
  aggregator: { label: 'Aggregator', dot: '#B68B3A', tint: '#F5EDDC', ink: '#9C7430' },
  derived: { label: 'Derived', dot: '#8061B8', tint: '#EDEAF7', ink: '#5E4A93' },
  manual: { label: 'Curated', dot: '#6B7280', tint: '#EEF0F4', ink: '#4B5563' },
}

function LayerBadge({ layer }: { layer: ProvenanceLayer }) {
  const l = LAYER[layer] ?? LAYER.derived
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: l.tint, color: l.ink }}>
      <span className="h-1 w-1 rounded-full" style={{ background: l.dot }} />
      {l.label}
    </span>
  )
}

// One method step: name + reference, the formula (general → instantiated), the
// working table, result-vs-trigger, and why it isn't noise.
function MethodStep({ step, tone, index, total, open, onToggle }: { step: MethodDescriptor; tone: Tone; index: number; total: number; open: boolean; onToggle: () => void }) {
  const accordion = total > 2
  const passed = step.threshold?.passed
  return (
    <section className="overflow-hidden rounded-xl border border-soft-border bg-white/70">
      {/* step header */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-ice/60"
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold tabular-nums" style={{ background: tone.bg, color: tone.fg, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}>{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display text-[13.5px] font-semibold leading-tight text-navy-deep">{step.name}</span>
            <span className="rounded-full bg-ice px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.07em] text-ink-secondary ring-1 ring-soft-border">{step.refTag}</span>
          </span>
          {!open && <span className="mt-0.5 block truncate text-[10.5px] text-ink-secondary">{step.gloss}</span>}
        </span>
        {step.threshold && (
          <span className="hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold sm:inline-flex" style={passed ? { background: '#E4F3F2', color: '#0E6F6D' } : { background: tone.bg, color: tone.fg }}>
            {passed ? <Check className="h-3 w-3" strokeWidth={2.6} /> : <Flag className="h-3 w-3" strokeWidth={2.6} />}
            {valUnit(step.statistic.value, step.statistic.unit)}
          </span>
        )}
        {accordion && <ChevronDown className={`h-4 w-4 shrink-0 text-ink-secondary transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {open && (
        <div className="space-y-3 px-3.5 pb-3.5 pt-0.5">
          <p className="text-[11px] leading-snug text-ink-secondary">{step.gloss}</p>

          {/* formula — general, then instantiated with these numbers */}
          <div className="rounded-lg p-3" style={{ background: tone.soft, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}>
            <p className="mb-1 text-[8.5px] font-bold uppercase tracking-[0.12em]" style={{ color: tone.fg }}>The formula</p>
            <div className="overflow-x-auto text-[15px] text-navy-deep"><KaTeXFormula tex={step.formulaTeX} display /></div>
            <div className="mt-2.5 border-t pt-2" style={{ borderColor: tone.ring }}>
              <p className="mb-1 text-[8.5px] font-bold uppercase tracking-[0.12em]" style={{ color: tone.fg }}>With these numbers</p>
              <div className="overflow-x-auto text-[15px] font-semibold text-navy-deep"><KaTeXFormula tex={step.instanceTeX} display /></div>
            </div>
          </div>

          {/* the working — symbol · input · value · source layer · period */}
          <div className="overflow-hidden rounded-lg border border-soft-border">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-ice/70 text-[8.5px] uppercase tracking-[0.06em] text-ink-secondary">
                  <th className="px-2.5 py-1.5 text-left font-bold">Input</th>
                  <th className="px-2 py-1.5 text-right font-bold">Value</th>
                  <th className="px-2 py-1.5 text-left font-bold">Source</th>
                  <th className="px-2.5 py-1.5 text-right font-bold">Period</th>
                </tr>
              </thead>
              <tbody>
                {step.inputs.map((inp, i) => (
                  <tr key={i} className="border-t border-soft-border/70">
                    <td className="px-2.5 py-1.5">
                      <span className="font-mono text-[10px] font-semibold" style={{ color: tone.fg }}><KaTeXFormula tex={inp.symbol} /></span>
                      <span className="ml-1.5 text-ink-primary">{inp.label}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums text-navy-deep">{valUnit(inp.value, inp.unit)}</td>
                    <td className="px-2 py-1.5"><LayerBadge layer={inp.layer} /></td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-right text-ink-secondary">{inp.period}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* result vs trigger */}
          <div className="flex flex-wrap items-center gap-2.5 rounded-lg bg-ice/60 px-3 py-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-secondary">Result</span>
            <span className="font-display text-[18px] font-semibold leading-none tabular-nums" style={{ color: tone.fg }}>{valUnit(step.statistic.value, step.statistic.unit)}</span>
            {step.threshold && (
              <>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold" style={passed ? { background: '#E4F3F2', color: '#0E6F6D' } : { background: tone.bg, color: tone.fg }}>
                  {passed ? <Check className="h-3 w-3" strokeWidth={2.6} /> : <Flag className="h-3 w-3" strokeWidth={2.6} />}
                  {passed ? 'trigger met' : 'flagged'}
                </span>
                <span className="basis-full text-[10.5px] leading-snug text-ink-secondary">Trigger · {step.threshold.rule}</span>
              </>
            )}
          </div>

          {/* why it isn't noise */}
          {step.robustness && (
            <p className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-secondary">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: tone.fg }} />
              <span><strong className="font-semibold text-navy-deep">Why it isn’t noise · </strong>{step.robustness}</span>
            </p>
          )}
        </div>
      )}
    </section>
  )
}

export function MethodologyPanel({ ins, tone, onBack, backRef, labelId }: { ins: Insight; tone: Tone; onBack: () => void; backRef: RefObject<HTMLButtonElement>; labelId: string }) {
  const m = ins.methodology
  const total = m?.steps.length ?? 0
  // Accordion when >2 steps: one open at a time. ≤2 steps: all expanded.
  const [openIdx, setOpenIdx] = useState(0)
  const isAccordion = total > 2

  const layersUsed = [...new Set((m?.steps ?? []).flatMap((s) => s.inputs.map((i) => i.layer)))]
  const periodsUsed = [...new Set((m?.steps ?? []).flatMap((s) => s.inputs.map((i) => i.period)))].sort()

  return (
    <div className="flex h-full flex-col" role="region" aria-labelledby={labelId}>
      {/* back header */}
      <div className="flex items-start gap-3 border-b border-soft-border px-5 py-3.5" style={{ background: `linear-gradient(100deg, ${tone.wash} 0%, transparent 55%)` }}>
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: tone.bg, color: tone.fg, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}><Sigma className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: tone.fg }}>Show the working</p>
          <h3 id={labelId} className="font-display text-[15px] font-semibold leading-tight text-navy-deep">How this was computed — and why it’s real</h3>
          <p className="mt-0.5 truncate text-[10.5px] text-ink-secondary">{ins.shortHeadline}</p>
        </div>
        <button
          ref={backRef}
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-soft-border bg-white px-2.5 py-1.5 text-[10.5px] font-semibold text-navy-deep shadow-soft transition-colors hover:border-muted-blue hover:text-muted-blue"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to insight
        </button>
      </div>

      {/* steps (or honest non-quantitative note) */}
      <div className="flex-1 space-y-2.5 px-5 py-4">
        {m?.isQuantitative ? (
          m.steps.map((step, i) => (
            <MethodStep key={step.key + i} step={step} tone={tone} index={i} total={total} open={isAccordion ? openIdx === i : true} onToggle={() => setOpenIdx(isAccordion ? (openIdx === i ? -1 : i) : openIdx)} />
          ))
        ) : (
          <div className="rounded-xl border border-soft-border bg-white/70 p-4">
            <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: tone.fg }}><FileText className="h-3.5 w-3.5" /> Detection rule — not a quantitative signal</p>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-primary">This item is flagged from a filing or news event rather than a computed statistic. No formula is shown because none applies — the honesty is the point.</p>
            <p className="mt-2 text-[11px] leading-snug text-ink-secondary">{ins.sourceNote}</p>
          </div>
        )}
      </div>

      {/* provenance + reproducibility */}
      <div className="space-y-2.5 border-t border-soft-border px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-secondary">Provenance</span>
          {layersUsed.map((l) => <LayerBadge key={l} layer={l} />)}
          {periodsUsed.length > 0 && <span className="text-[10px] font-medium text-ink-secondary">· as of {periodsUsed.join(' · ')}</span>}
        </div>
        <p className="text-[10.5px] leading-snug text-ink-secondary">{ins.sourceNote}</p>
        {m?.isQuantitative && (
          <p className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[10px] leading-snug" style={{ background: tone.soft, color: tone.fg, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}>
            <Lock className="mt-px h-3 w-3 shrink-0" />
            <span><strong className="font-bold">Reproducible.</strong> Computed deterministically from the signal payload (<span className="font-mono">{m.payloadHash}</span>) — not model-generated.</span>
          </p>
        )}
      </div>
    </div>
  )
}
