import { useEffect, useMemo, useRef, useState } from 'react'
import { Radar, Layers, Presentation } from 'lucide-react'
import generated from '@/data/insights.generated.json'
import type { InsightsFile } from '@/insights/types'
import { useFilters, useActiveCompany } from '@/state/filters'
import { type NavTarget } from '@/insights/sourceMap'
import { exportInsightsPptx } from '@/lib/pptExport'
import { buildInvestorPulse, lensForInsight, type LensKey } from '@/insights/investorPulse'
import { CompanyFilter, PulseView } from '@/components/InvestorPulse'
import { DataInsights } from '@/components/DataInsights'

const FILE = generated as unknown as InsightsFile

type View = 'pulse' | 'dataInsights'

/**
 * Insights — one compact header row (title + company filter + Pulse|Data Insights
 * toggle), then the selected view. Pulse is the senior-analyst daily read;
 * Data Insights is the fact-based deep dive (seven accordion sections, flip cards
 * preserved). No oversized hero, no duplicated company chips, no separate large
 * "Daily Signal Pulse" block — every insight still present, just simpler.
 */
export function Insights({ onNavigate, reopenInsightId, onReopened }: { onNavigate?: (target: NavTarget, insightId: string) => void; reopenInsightId?: string | null; onReopened?: () => void }) {
  const company = useActiveCompany()
  const { setHighlightedCompany } = useFilters()
  const pulse = useMemo(() => buildInvestorPulse(company.id, company.shortName), [company.id, company.shortName])

  // On return from "Go to source → Back to Insight": the reopened insight lives in
  // a Data Insights section, so open that view + section.
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

  const TABS: { id: View; label: string; Icon: typeof Radar }[] = [
    { id: 'pulse', label: 'Pulse', Icon: Radar },
    { id: 'dataInsights', label: 'Data Insights', Icon: Layers },
  ]

  return (
    // `insights-tab` scopes the editorial serif to this tab's written narrative.
    <div className="insights-tab space-y-4">
      {/* ── One compact header row: title · company filter · Pulse | Data Insights. */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-soft-border bg-surface-tint/85 px-3 py-2 backdrop-blur-sm">
        <div className="min-w-0">
          <h1 className="font-display text-[20px] leading-tight text-navy-deep">Insights</h1>
          <p className="text-[11px] leading-snug text-ink-secondary">Senior analyst read + data-backed insights for the selected company.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CompanyFilter />
          <div className="inline-flex rounded-lg border border-soft-border bg-white p-0.5 shadow-soft">
            {TABS.map(({ id, label, Icon }) => {
              const on = id === view
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
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
          <button
            type="button"
            onClick={() => exportInsightsPptx(FILE)}
            title="Download all insights as a PowerPoint deck"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2CF9B] bg-champagne-soft px-2.5 py-1.5 text-[11px] font-semibold text-champagne-deep shadow-soft transition-colors hover:bg-white"
          >
            <Presentation className="h-3.5 w-3.5" /> Export
          </button>
        </div>
      </div>

      {/* ── Active view ──────────────────────────────────────────────────── */}
      <div key={view} className="animate-fade-in">
        {view === 'pulse' ? (
          <PulseView pulse={pulse} />
        ) : (
          <DataInsights pulse={pulse} onGoToSource={goToSource} reopenInsightId={reopenRef.current} initialOpenKey={reopenLens} />
        )}
      </div>
    </div>
  )
}
