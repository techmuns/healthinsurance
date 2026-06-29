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
    // A relative shell so the soft blue/gold blob backdrop can sit behind the
    // whole tab (Pulse + Data Insights) without bleeding into other tabs.
    <div className="insights-tab relative isolate space-y-4">
      <InsightsBackdrop />

      {/* ── One compact header row: title · company filter · Pulse | Data Insights. */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-soft-border bg-surface-tint/80 px-3.5 py-2.5 backdrop-blur-md">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] leading-none text-navy-deep">Insights</h1>
          <p className="mt-1 text-[11px] leading-snug text-ink-secondary">Senior analyst read + data-backed insights for the selected company.</p>
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
                    'relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                    on ? 'bg-navy-deep text-white shadow-soft' : 'text-navy-deep hover:bg-ice',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} />
                  {label}
                  {/* thin gold underline accent on the active tab */}
                  {on && <span className="pointer-events-none absolute inset-x-2.5 bottom-[3px] h-[2px] rounded-full bg-champagne" />}
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

// Soft abstract blob backdrop for the whole Insights tab — a very light
// blue-white canvas, a couple of pale blue blobs, and a single controlled warm
// gold accent toward the lower/right. Subtle, never cartoonish; sits behind all
// content (-z-10) and is purely decorative.
function InsightsBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute -inset-x-2 -inset-y-2 -z-10 overflow-hidden rounded-3xl">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(165deg, #F5F9FE 0%, #EAF1FB 48%, #F2F7FD 100%)' }} />
      <div className="blob-a absolute -left-28 -top-24 h-80 w-80 opacity-80 blur-3xl" style={{ background: 'radial-gradient(circle at 40% 40%, rgba(183,209,245,0.7), transparent 70%)' }} />
      <div className="blob-b absolute -right-24 top-16 h-[26rem] w-[26rem] opacity-70 blur-3xl" style={{ background: 'radial-gradient(circle at 50% 40%, rgba(203,222,246,0.72), transparent 72%)' }} />
      <div className="blob-c absolute left-1/3 top-1/2 h-80 w-80 opacity-55 blur-3xl" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(215,231,249,0.7), transparent 72%)' }} />
      <div className="blob-d absolute -bottom-24 right-4 h-72 w-72 opacity-50 blur-3xl" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(226,201,142,0.4), transparent 70%)' }} />
    </div>
  )
}
