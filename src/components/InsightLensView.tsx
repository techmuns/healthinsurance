import { useState } from 'react'
import {
  Eye,
  Lightbulb,
  ListChecks,
  ExternalLink,
  CalendarClock,
  ChevronDown,
  Gauge,
  TrendingUp,
  Users2,
  Wallet,
  LineChart,
  Landmark,
  Trophy,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'
import generated from '@/data/insights.generated.json'
import type { Insight, InsightsFile } from '@/insights/types'
import { resolveSource, freshnessOf, latestPeriodAcross, type NavTarget } from '@/insights/sourceMap'
import { InsightCard } from '@/components/InsightCard'
import {
  IMPACT_META,
  CONFIDENCE_META,
  CATEGORY_META,
  type InsightLens,
  type LensKey,
  type MetricRead,
  type PulseSignal,
} from '@/insights/investorPulse'

const FILE = generated as unknown as InsightsFile
const PANEL_LATEST = latestPeriodAcross(FILE.insights)
const byId = (id: string): Insight | undefined => FILE.insights.find((i) => i.id === id)

export const LENS_ICON: Record<Exclude<LensKey, 'overviewPulse'>, LucideIcon> = {
  underwritingProfitability: Gauge,
  growthLevers: TrendingUp,
  competitivePositioning: Trophy,
  expenseManagement: Wallet,
  investmentPerformance: LineChart,
  forwardLookingStrategy: Users2,
  riskRegulatoryChanges: Landmark,
}

export function StanceChip({ stance }: { stance: InsightLens['stance'] }) {
  const m = IMPACT_META[stance]
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.05em]" style={{ color: m.fg, background: m.bg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.dot }} />
      {m.label}
    </span>
  )
}

export function ConfidenceChip({ confidence }: { confidence: InsightLens['confidence'] }) {
  const c = CONFIDENCE_META[confidence]
  return (
    <span className="rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.05em]" style={{ color: c.fg, background: c.bg }}>
      {confidence} confidence
    </span>
  )
}

function MetricTile({ m }: { m: MetricRead }) {
  const tone = IMPACT_META[m.tone]
  // A known-disputed figure renders as an honest "verifying" state, never a clean number.
  if (m.disputed) {
    return (
      <div className="rounded-xl border p-3" style={{ borderColor: 'rgba(156,116,48,0.3)', background: 'rgba(156,116,48,0.06)' }}>
        <div className="flex items-center justify-between gap-1.5">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-secondary">{m.label}</p>
          <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.04em]" style={{ color: CONFIDENCE_META.Low.fg, background: CONFIDENCE_META.Low.bg }}>Low confidence</span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-[13px] font-semibold leading-snug text-champagne-deep">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Figure disputed — verifying
          <span className="rounded bg-white/70 px-1 py-0.5 text-[8.5px] font-semibold text-ink-secondary">{m.period}</span>
        </p>
        {m.note && <p className="mt-1 text-[10px] leading-snug text-ink-secondary">{m.note}</p>}
        <p className="mt-1 text-[9.5px] italic text-ink-secondary">{m.sourceName}</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-soft-border bg-card p-3 shadow-soft">
      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-secondary">{m.label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-display text-[22px] font-semibold leading-none" style={{ color: tone.fg }}>{m.value}</span>
        <span className="rounded bg-ice px-1 py-0.5 text-[8.5px] font-semibold text-ink-secondary">{m.period}</span>
      </div>
      {m.note && <p className="mt-1 text-[10px] leading-snug text-ink-secondary">{m.note}</p>}
      {m.sourceUrl ? (
        <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[9.5px] font-medium text-navy-primary hover:underline">
          {m.sourceName}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      ) : (
        <p className="mt-1 text-[9.5px] italic text-ink-secondary">{m.sourceName}</p>
      )}
    </div>
  )
}

function RelatedSignal({ s }: { s: PulseSignal }) {
  const [open, setOpen] = useState(false)
  const cat = CATEGORY_META[s.category]
  const imp = IMPACT_META[s.impact]
  return (
    <li className="rounded-xl border border-soft-border bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full flex-col p-2.5 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-ink-secondary"><CalendarClock className="h-3 w-3 text-navy-primary" />{s.dateLabel}</span>
          <span className="rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.04em]" style={{ color: cat.fg, background: cat.bg }}>{s.category}</span>
          <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase" style={{ color: imp.fg, background: imp.bg }}><span className="h-1 w-1 rounded-full" style={{ background: imp.dot }} />{imp.label}</span>
          <span className="ml-auto"><ChevronDown className={`h-3 w-3 text-ink-secondary transition-transform ${open ? 'rotate-180' : ''}`} /></span>
        </div>
        <p className="mt-1 text-[12px] font-semibold leading-snug text-navy-deep">{s.title}</p>
        {open && s.whyItMatters && <p className="mt-0.5 text-[11px] leading-snug text-ink-secondary">{s.whyItMatters}</p>}
        {s.sourceUrl && (
          <a href={s.sourceUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-navy-primary hover:underline">
            {s.sourceName}<ExternalLink className="h-3 w-3" />
          </a>
        )}
      </button>
    </li>
  )
}

export function InsightLensView({
  lens,
  onGoToSource,
  reopenInsightId,
  hideHeader = false,
}: {
  lens: InsightLens
  onGoToSource: (target: NavTarget, insightId: string) => void
  reopenInsightId?: string | null
  /** Skip the built-in header when an outer accordion already provides one. */
  hideHeader?: boolean
}) {
  const Icon = LENS_ICON[lens.key as Exclude<LensKey, 'overviewPulse'>] ?? Gauge
  const insights = lens.insightIds.map(byId).filter((i): i is Insight => !!i)

  const goToSource = (ins: Insight) => {
    const src = resolveSource(ins)
    onGoToSource(src.target, ins.id)
  }

  return (
    <section className="space-y-5">
      {/* ── Lens header (omitted when an accordion supplies it) ──────────── */}
      {!hideHeader && (
        <div className="rounded-2xl border border-soft-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-soft-blue text-navy-primary">
              <Icon className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[20px] leading-tight text-navy-deep">{lens.title}</h2>
              <p className="text-[11px] text-ink-secondary">{lens.purpose}</p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <StanceChip stance={lens.stance} />
              <ConfidenceChip confidence={lens.confidence} />
            </div>
          </div>
          {lens.available && lens.oneLineRead && (
            <p className="mt-2.5 border-t border-soft-border pt-2.5 font-editorial text-[14px] leading-snug text-ink-primary">{lens.oneLineRead}</p>
          )}
        </div>
      )}

      {!lens.available ? (
        <div className="rounded-2xl border border-dashed border-soft-border bg-ice/40 px-4 py-10 text-center">
          <p className="font-editorial text-[14px] font-semibold text-navy-deep">Not enough verified data for this category yet.</p>
          <p className="mt-1 text-[12px] text-ink-secondary">This category turns on automatically once source-backed {lens.title.toLowerCase()} data is wired for {/* company implied by selection */}the selected company.</p>
        </div>
      ) : (
        <>
          {/* Metric strip — real, source-backed numbers (nulls omitted, never faked). */}
          {lens.metrics.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {lens.metrics.map((m, i) => (
                <MetricTile key={`${m.label}-${i}`} m={m} />
              ))}
            </div>
          )}

          {/* The deep-dive insights — the SAME flip cards, preserved exactly. */}
          {insights.length > 0 && (
            <div className="space-y-5">
              {insights.map((ins, i) => (
                <InsightCard
                  key={ins.id}
                  ins={ins}
                  hero={i === 0}
                  source={resolveSource(ins)}
                  freshness={freshnessOf(ins, PANEL_LATEST)}
                  onGoToSource={() => goToSource(ins)}
                  initialFlipped={ins.id === reopenInsightId}
                />
              ))}
            </div>
          )}

          {/* Usually missed signal + Investor implication */}
          {(lens.missedSignals.length > 0 || lens.investorImplication) && (
            <div className="grid gap-3 lg:grid-cols-2">
              {lens.missedSignals.length > 0 && (
                <div className="rounded-xl border p-3.5" style={{ borderColor: 'rgba(156,116,48,0.24)', background: 'rgba(156,116,48,0.05)' }}>
                  <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-champagne-deep"><Eye className="h-3.5 w-3.5" />Usually missed signal</p>
                  <ul className="mt-2 space-y-1.5">
                    {lens.missedSignals.map((s, i) => (
                      <li key={i} className="font-editorial text-[12.5px] leading-snug text-ink-primary">{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {lens.investorImplication && (
                <div className="rounded-xl border p-3.5" style={{ borderColor: 'rgba(39,69,126,0.18)', background: 'rgba(39,69,126,0.04)' }}>
                  <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-navy-primary"><Lightbulb className="h-3.5 w-3.5" />Investor implication</p>
                  <p className="mt-2 font-editorial text-[12.5px] leading-relaxed text-ink-primary">{lens.investorImplication}</p>
                </div>
              )}
            </div>
          )}

          {/* Watch next — a checklist the investor monitors. */}
          {lens.watchNext.length > 0 && (
            <div className="rounded-xl border border-soft-border bg-card p-3.5 shadow-soft">
              <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-navy-primary"><ListChecks className="h-3.5 w-3.5" />Watch next</p>
              <ul className="mt-2 space-y-1.5">
                {lens.watchNext.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] leading-snug text-ink-secondary">
                    <span className="mt-1 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border border-soft-border bg-ice text-[8px] text-ink-secondary">{i + 1}</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Related market signals routed to this lens (everything is also in Overview). */}
          {lens.relatedSignals.length > 0 && (
            <div>
              <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Related market signals</p>
              <ul className="space-y-2">
                {lens.relatedSignals.slice(0, 4).map((s) => (
                  <RelatedSignal key={s.id} s={s} />
                ))}
              </ul>
            </div>
          )}

          {/* Source trail */}
          {lens.sourceRefs.length > 0 && (
            <div className="rounded-xl border border-soft-border bg-ice/40 p-3.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Source / data reference</p>
              {lens.asOf && (
                <p className="mt-1 text-[10px] leading-snug text-ink-secondary">
                  Fundamentals last reported as of <span className="font-semibold text-navy-deep">{lens.asOf}</span> — these ratios update quarterly/annually, not daily.
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {lens.sourceRefs.map((r, i) =>
                  r.url ? (
                    <a key={i} href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10.5px] font-medium text-navy-primary hover:underline">
                      {r.name}<ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span key={i} className="text-[10.5px] text-ink-secondary">{r.name}</span>
                  ),
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
