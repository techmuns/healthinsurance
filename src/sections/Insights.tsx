import { useEffect, useMemo, useRef, useState } from 'react'
import { Radar, Layers, Presentation } from 'lucide-react'
import generated from '@/data/insights.generated.json'
import type { InsightsFile } from '@/insights/types'
import { useFilters, useActiveCompany } from '@/state/filters'
import { latestPeriodAcross, type NavTarget } from '@/insights/sourceMap'
import { exportInsightsPptx } from '@/lib/pptExport'
import { buildInvestorPulse, lensForInsight, type LensKey } from '@/insights/investorPulse'
import { InvestorPulseHero, OverviewPulse } from '@/components/InvestorPulse'
import { DataInsights } from '@/components/DataInsights'

const FILE = generated as unknown as InsightsFile
const PANEL_LATEST = latestPeriodAcross(FILE.insights)
const GEN_DATE = new Date(FILE.meta.generatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

type View = 'pulse' | 'dataInsights'

/**
 * Insights — two internal lenses only: Pulse (the senior-analyst daily read:
 * curated market intelligence, management events, daily signal pulse, anomaly
 * watch) and Data Insights (the fact-based deep dive — seven analytical sections
 * built from the wired dashboard data). The "Today's Investor Pulse" hero sits
 * persistently on top (it carries the company picker, so it serves both views).
 * Every existing insight is preserved: news/event/catalyst lives in Pulse; the
 * metric/financial flip cards live in their Data Insights section. Flip-card
 * design is unchanged.
 */
export function Insights({ onNavigate, reopenInsightId, onReopened }: { onNavigate?: (target: NavTarget, insightId: string) => void; reopenInsightId?: string | null; onReopened?: () => void }) {
  const company = useActiveCompany()
  const { setHighlightedCompany } = useFilters()
  const pulse = useMemo(() => buildInvestorPulse(company.id, company.shortName), [company.id, company.shortName])

  // On return from "Go to source → Back to Insight": the reopened insight always
  // lives in a Data Insights section, so switch to that view and open its section.
  const reopenRef = useRef(reopenInsightId ?? null)
  const reopenInsight = reopenRef.current ? FILE.insights.find((i) => i.id === reopenRef.current) : undefined
  const reopenLens = reopenInsight ? (lensForInsight(reopenInsight) as Exclude<LensKey, 'overviewPulse'>) : null
  const [view, setView] = useState<View>(reopenInsight ? 'dataInsights' : 'pulse')

  useEffect(() => {
    if (reopenRef.current) onReopened?.()
  }, [])

  const goToSource = (target: NavTarget, insightId: string) => {
    if (target.company) setHighlightedCompany(target.company)
    onNavigate?.(target, insightId)
  }

  const avgReady = Math.round(FILE.meta.coverage.reduce((s, c) => s + c.readyPct, 0) / Math.max(1, FILE.meta.coverage.length))

  const TABS: { id: View; label: string; Icon: typeof Radar; hint: string }[] = [
    { id: 'pulse', label: 'Pulse', Icon: Radar, hint: 'The senior-analyst daily read — what matters right now' },
    { id: 'dataInsights', label: 'Data Insights', Icon: Layers, hint: 'Fact-based deep dive across the wired dashboard data' },
  ]

  return (
    // `insights-tab` scopes the editorial serif to this tab's written narrative.
    <div className="insights-tab space-y-5">
      {/* ── Persistent hero — Today's Investor Pulse (carries the company picker). */}
      <InvestorPulseHero pulse={pulse} />

      {/* ── Two internal lenses only: Pulse | Data Insights ──────────────── */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-soft-border bg-surface-tint/80 px-2 py-1.5 backdrop-blur-sm">
        <span className="mr-0.5 pl-1 text-[9px] font-bold uppercase tracking-[0.14em] text-ink-secondary">View</span>
        <div className="inline-flex rounded-lg border border-soft-border bg-white p-0.5 shadow-soft">
          {TABS.map(({ id, label, Icon, hint }) => {
            const on = id === view
            return (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                title={hint}
                className={[
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                  on ? 'bg-navy-deep text-white shadow-soft' : 'text-navy-deep hover:bg-ice',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                {label}
              </button>
            )
          })}
        </div>
        {/* Export all insights as a PowerPoint deck (one slide per insight). */}
        <button
          type="button"
          onClick={() => exportInsightsPptx(FILE)}
          title="Download all insights as a PowerPoint deck — a title slide plus one slide per insight"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[#E2CF9B] bg-champagne-soft px-2.5 py-1 text-[11px] font-semibold text-champagne-deep shadow-soft transition-colors hover:bg-white"
        >
          <Presentation className="h-3.5 w-3.5" /> Export
        </button>
      </div>

      {/* ── Active view ──────────────────────────────────────────────────── */}
      <div key={view} className="animate-fade-in">
        {view === 'pulse' ? (
          <OverviewPulse pulse={pulse} />
        ) : (
          <DataInsights pulse={pulse} onGoToSource={goToSource} reopenInsightId={reopenRef.current} initialOpenKey={reopenLens} />
        )}
      </div>

      {/* Honest provenance footnote for the deep-dive insight set. */}
      <p className="border-t border-soft-border pt-3 text-center text-[10.5px] text-ink-secondary">
        {FILE.insights.length} curated insights · {avgReady}% source-backed · data through {PANEL_LATEST} · generated {GEN_DATE}
      </p>
    </div>
  )
}
