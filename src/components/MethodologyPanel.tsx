import { useState, type RefObject } from 'react'
import {
  ArrowLeft, Sigma, ShieldCheck, Lock, ChevronDown, Check, Flag, Minus, FileText,
  Calculator, Activity, Users, Globe2, Compass, Bell, type LucideIcon,
} from 'lucide-react'
import type { Application, Insight, Lens, LensBlock, MethodDescriptor, ProvenanceLayer, Watch, WatchItem } from '@/insights/types'
import { KaTeXFormula } from './KaTeXFormula'

const LENS_ORDER: Lens[] = ['fundamental', 'technical', 'sentiment', 'macro']

// ---------------------------------------------------------------------------
//  MethodologyPanel — the flip-side, on a FIXED template so a PM reads every card
//  the same way:
//    PART A · How we got here  →  Fundamental | Technical | Sentiment | Macro
//             (the deterministic methods, regrouped under four lenses; empty
//              lenses are shown honestly so the full analytical frame is visible)
//    PART B · Next steps       →  How to use this · What to watch
//             (model-authored on rails; every number traces to the signals)
// ---------------------------------------------------------------------------

type Tone = { fg: string; bg: string; ring: string; wash: string; soft: string }
const GOLD = '#9C7430'
const BURGUNDY = '#A8443B'
const TEAL = '#0E6F6D'

const fmt = (v: number | null): string => {
  if (v == null || !Number.isFinite(v)) return 'n/a'
  const r = Math.round(v * 100) / 100
  return Number.isInteger(r) ? String(r) : String(r)
}
const unitLabel = (u: string): string => (u === 'periods' ? ' yrs' : u === 'x' ? 'x' : u === 'σ' ? 'σ' : u === '%' ? '%' : u === 'pp' ? 'pp' : u === 'items' ? '' : ` ${u}`)
const valUnit = (v: number | null, u: string) => (v == null ? 'n/a' : `${fmt(v)}${unitLabel(u)}`)

// Provenance-layer chips — the Data Audit taxonomy/confidence palette.
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

const LENS_META: Record<Lens, { label: string; Icon: LucideIcon }> = {
  fundamental: { label: 'Fundamental', Icon: Calculator },
  technical: { label: 'Technical', Icon: Activity },
  sentiment: { label: 'Sentiment & Positioning', Icon: Users },
  macro: { label: 'Macro & Sector', Icon: Globe2 },
}

// One method step — name + reference, the formula (general → instantiated), the
// working table, result-vs-trigger, and why it isn't noise. Controlled accordion.
function MethodStep({ step, tone, index, open, onToggle }: { step: MethodDescriptor; tone: Tone; index: number; open: boolean; onToggle: () => void }) {
  const passed = step.threshold?.passed
  return (
    <div>
      <button type="button" onClick={(e) => { e.stopPropagation(); onToggle() }} aria-expanded={open} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-ice/60">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold tabular-nums" style={{ background: tone.bg, color: tone.fg, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}>{index}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display text-[12.5px] font-semibold leading-tight text-navy-deep">{step.name}</span>
            <span className="rounded-full bg-ice px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-ink-secondary ring-1 ring-soft-border">{step.refTag}</span>
          </span>
          {!open && <span className="mt-0.5 block truncate text-[10.5px] text-ink-secondary">{step.gloss}</span>}
        </span>
        {step.threshold && (
          <span className="hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold sm:inline-flex" style={passed ? { background: '#E4F3F2', color: TEAL } : { background: tone.bg, color: tone.fg }}>
            {passed ? <Check className="h-3 w-3" strokeWidth={2.6} /> : <Flag className="h-3 w-3" strokeWidth={2.6} />}
            {valUnit(step.statistic.value, step.statistic.unit)}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-3 px-3 pb-3.5 pt-0.5">
          <p className="font-editorial text-[12.5px] leading-relaxed text-ink-secondary">{step.gloss}</p>
          <div className="rounded-lg p-3" style={{ background: tone.soft, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}>
            <p className="mb-1 text-[8.5px] font-bold uppercase tracking-[0.12em]" style={{ color: tone.fg }}>The formula</p>
            <div className="overflow-x-auto text-[15px] text-navy-deep"><KaTeXFormula tex={step.formulaTeX} display /></div>
            <div className="mt-2.5 border-t pt-2" style={{ borderColor: tone.ring }}>
              <p className="mb-1 text-[8.5px] font-bold uppercase tracking-[0.12em]" style={{ color: tone.fg }}>With these numbers</p>
              <div className="overflow-x-auto text-[15px] font-semibold text-navy-deep"><KaTeXFormula tex={step.instanceTeX} display /></div>
            </div>
          </div>
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
          <div className="flex flex-wrap items-center gap-2.5 rounded-lg bg-ice/60 px-3 py-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-secondary">Result</span>
            <span className="font-display text-[17px] font-semibold leading-none tabular-nums" style={{ color: tone.fg }}>{valUnit(step.statistic.value, step.statistic.unit)}</span>
            {step.threshold && (
              <>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold" style={passed ? { background: '#E4F3F2', color: TEAL } : { background: tone.bg, color: tone.fg }}>
                  {passed ? <Check className="h-3 w-3" strokeWidth={2.6} /> : <Flag className="h-3 w-3" strokeWidth={2.6} />}
                  {passed ? 'trigger met' : 'flagged'}
                </span>
                <span className="basis-full text-[10.5px] leading-snug text-ink-secondary">Trigger · {step.threshold.rule}</span>
              </>
            )}
          </div>
          {step.robustness && (
            <p className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-secondary">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: tone.fg }} />
              <span><strong className="font-semibold text-navy-deep">Why it isn’t noise · </strong>{step.robustness}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const STATUS_PILL: Record<LensBlock['status'], { label: string; bg: string; fg: string }> = {
  populated: { label: '', bg: '', fg: '' }, // tone-driven, set inline
  not_applicable: { label: 'N/A', bg: '#EEF0F4', fg: '#4B5563' },
  no_signal: { label: 'None', bg: '#F1F3F7', fg: '#8C97A8' },
  data_gap: { label: 'Gap', bg: '#FAEFE0', fg: '#9C7430' },
}
function emptyLine(block: LensBlock): string {
  if (block.status === 'not_applicable') return block.reason ?? 'Not applicable to this name.'
  if (block.status === 'data_gap') return `Data gap — ${block.reason ?? 'input not staged'}. This caps conviction.`
  return 'No material signal under this lens.'
}

function LensSection({ lens, block, steps, tone, openKey, setOpenKey, startIndex }: { lens: Lens; block: LensBlock; steps: MethodDescriptor[]; tone: Tone; openKey: string; setOpenKey: (k: string) => void; startIndex: number }) {
  const meta = LENS_META[lens]
  const populated = block.status === 'populated'
  const pill = STATUS_PILL[block.status]
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-soft-border bg-white/70">
      <header className="flex items-center gap-2 border-b border-soft-border/70 bg-ice/40 px-3 py-2">
        <meta.Icon className="h-3.5 w-3.5 shrink-0" style={{ color: populated ? tone.fg : '#8C97A8' }} strokeWidth={2.2} />
        <span className="min-w-0 flex-1 truncate font-display text-[12px] font-semibold text-navy-deep">{meta.label}</span>
        {populated
          ? <span className="rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.05em]" style={{ background: tone.bg, color: tone.fg }}>{steps.length} method{steps.length > 1 ? 's' : ''}</span>
          : <span className="rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.05em]" style={{ background: pill.bg, color: pill.fg }}>{pill.label}</span>}
      </header>
      {populated ? (
        <div className="divide-y divide-soft-border/60">
          {steps.map((s, i) => <MethodStep key={s.key} step={s} tone={tone} index={startIndex + i} open={openKey === s.key} onToggle={() => setOpenKey(openKey === s.key ? '' : s.key)} />)}
        </div>
      ) : (
        <p className="px-3 py-2.5 text-[10.5px] italic leading-snug text-ink-secondary">{emptyLine(block)}</p>
      )}
    </section>
  )
}

const DIRECTION: Record<WatchItem['direction'], { label: string; color: string; bg: string; Icon: LucideIcon }> = {
  confirms: { label: 'confirms', color: TEAL, bg: '#E4F3F2', Icon: Check },
  invalidates: { label: 'invalidates', color: BURGUNDY, bg: '#FBEEEC', Icon: Flag },
  either: { label: 'either way', color: '#6B7280', bg: '#F1F3F7', Icon: Minus },
}

// "How to use this" — forward angles (gold). Content/styling unchanged; only its
// placement on the card moves.
function ApplicationBlock({ application }: { application: Application }) {
  return (
    <div className="overflow-hidden rounded-xl border border-soft-border bg-white/70" style={{ borderLeft: `3px solid ${GOLD}` }}>
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <Compass className="h-4 w-4 shrink-0" style={{ color: GOLD }} strokeWidth={2.2} />
        <span className="font-editorial text-[15px] font-semibold text-navy-deep">How to use this</span>
      </div>
      <p className="px-3.5 pt-1.5 font-editorial text-[13px] leading-relaxed text-ink-secondary">{application.framing}</p>
      <ul className="space-y-1.5 px-3.5 py-3">
        {application.uses.map((u, i) => (
          <li key={i} className="flex items-start gap-2 text-[11.5px] leading-snug text-ink-primary">
            <span className="mt-px shrink-0 rounded-md px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.05em]" style={{ background: '#F5EDDC', color: GOLD }}>{u.angle}</span>
            <span className="font-editorial text-[12.5px] leading-relaxed">{u.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// "What to watch" — anchored monitorables (burgundy). Content/styling unchanged.
function WatchBlock({ watch }: { watch: Watch }) {
  return (
    <div className="overflow-hidden rounded-xl border border-soft-border bg-white/70" style={{ borderLeft: `3px solid ${BURGUNDY}` }}>
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <Bell className="h-4 w-4 shrink-0" style={{ color: BURGUNDY }} strokeWidth={2.2} />
        <span className="font-editorial text-[15px] font-semibold text-navy-deep">What to watch</span>
      </div>
      <ul className="space-y-2 px-3.5 py-3">
        {watch.items.map((w, i) => {
          const d = DIRECTION[w.direction]
          return (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.04em]" style={{ background: d.bg, color: d.color }}>
                <d.Icon className="h-2.5 w-2.5" strokeWidth={2.8} />{d.label}
              </span>
              <span className="min-w-0 flex-1 font-editorial text-[13px] leading-relaxed text-ink-primary">
                <strong className="font-semibold text-navy-deep">{w.trigger}</strong> — {w.condition}
                {w.cadence && <span className="ml-1.5 inline-block rounded bg-ice px-1.5 py-0.5 text-[9px] font-medium text-ink-secondary ring-1 ring-soft-border">{w.cadence}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function MethodologyPanel({ ins, tone, onBack, backRef, labelId }: { ins: Insight; tone: Tone; onBack: () => void; backRef: RefObject<HTMLButtonElement>; labelId: string }) {
  const m = ins.methodology
  const steps = m?.steps ?? []
  const [openKey, setOpenKey] = useState(steps[0]?.key ?? '')

  const layersUsed = [...new Set(steps.flatMap((s) => s.inputs.map((i) => i.layer)))]
  const periodsUsed = [...new Set(steps.flatMap((s) => s.inputs.map((i) => i.period)))].sort()
  // Continuous step numbering across the (ordered) lenses.
  const startIndex = {} as Record<Lens, number>
  let acc = 0
  for (const lens of LENS_ORDER) { startIndex[lens] = acc + 1; acc += m?.lenses[lens].stepKeys.length ?? 0 }

  return (
    <div className="flex h-full flex-col" role="region" aria-labelledby={labelId}>
      {/* back header */}
      <div className="flex items-start gap-3 border-b border-soft-border px-5 py-3.5" style={{ background: `linear-gradient(100deg, ${tone.wash} 0%, transparent 55%)` }}>
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: tone.bg, color: tone.fg, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}><Sigma className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: tone.fg }}>Show the working</p>
          <h3 id={labelId} className="font-editorial text-[17px] font-semibold leading-tight text-navy-deep">How we got here — and what to do with it</h3>
          <p className="mt-0.5 truncate text-[10.5px] text-ink-secondary">{ins.shortHeadline}</p>
        </div>
        <button ref={backRef} type="button" onClick={(e) => { e.stopPropagation(); onBack() }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-soft-border bg-white px-2.5 py-1.5 text-[10.5px] font-semibold text-navy-deep shadow-soft transition-colors hover:border-muted-blue hover:text-muted-blue">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to insight
        </button>
      </div>

      <div className="flex-1 px-5 py-4">
        {m?.isQuantitative ? (
          <>
            <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Part A · How we got here</p>
            {/* Two INDEPENDENT columns (not a row-aligned grid) so a short/empty lens
                never leaves a blank box beside a tall one. Left = Fundamental ·
                Sentiment · Provenance; right = Technical · Macro · the forward
                "Next steps", which fill what would otherwise be dead space. */}
            <div className="lg:flex lg:items-start lg:gap-2.5">
              {/* LEFT — the written/derivation column */}
              <div className="space-y-2.5 lg:min-w-0 lg:flex-1">
                {(['fundamental', 'sentiment'] as const).map((lens) => (
                  <LensSection key={lens} lens={lens} block={m.lenses[lens]} steps={steps.filter((s) => s.lens === lens)} tone={tone} openKey={openKey} setOpenKey={setOpenKey} startIndex={startIndex[lens]} />
                ))}
                {/* provenance + reproducibility — foot of Part A (left) */}
                <div className="space-y-2 rounded-xl border border-soft-border bg-ice/40 px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-secondary">Provenance</span>
                    {layersUsed.map((l) => <LayerBadge key={l} layer={l} />)}
                    {periodsUsed.length > 0 && <span className="text-[10px] font-medium text-ink-secondary">· as of {periodsUsed.join(' · ')}</span>}
                  </div>
                  <p className="flex items-start gap-1.5 text-[10px] leading-snug" style={{ color: tone.fg }}>
                    <Lock className="mt-px h-3 w-3 shrink-0" />
                    <span><strong className="font-bold">Reproducible.</strong> Lenses and every number are computed deterministically from the signal payload (<span className="font-mono">{m.payloadHash}</span>) — not model-generated.</span>
                  </p>
                </div>
              </div>

              {/* RIGHT — short lenses, then the forward "Next steps" filling the space */}
              <div className="mt-2.5 space-y-2.5 lg:mt-0 lg:min-w-0 lg:flex-1">
                {(['technical', 'macro'] as const).map((lens) => (
                  <LensSection key={lens} lens={lens} block={m.lenses[lens]} steps={steps.filter((s) => s.lens === lens)} tone={tone} openKey={openKey} setOpenKey={setOpenKey} startIndex={startIndex[lens]} />
                ))}
                {(ins.application || ins.watch) && (
                  <>
                    <p className="pt-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Part B · Next steps</p>
                    {ins.application && <ApplicationBlock application={ins.application} />}
                    {ins.watch && <WatchBlock watch={ins.watch} />}
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-soft-border bg-white/70 p-4">
              <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: tone.fg }}><FileText className="h-3.5 w-3.5" /> Detection rule — not a quantitative signal</p>
              <p className="mt-2 font-editorial text-[13.5px] leading-relaxed text-ink-primary">This item is flagged from a filing or news event rather than a computed statistic. No formula is shown because none applies — the honesty is the point.</p>
              <p className="mt-2 font-editorial text-[12px] leading-relaxed text-ink-secondary">{ins.sourceNote}</p>
            </div>
            {(ins.application || ins.watch) && (
              <section className="space-y-2.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Part B · Next steps</p>
                {ins.application && <ApplicationBlock application={ins.application} />}
                {ins.watch && <WatchBlock watch={ins.watch} />}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
