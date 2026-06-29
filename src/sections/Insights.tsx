import { useEffect, useMemo, useRef, useState } from 'react'
import { Radar, Gauge, TrendingUp, Trophy, Wallet, LineChart, Users2, Landmark, Presentation, type LucideIcon } from 'lucide-react'
import generated from '@/data/insights.generated.json'
import type { InsightsFile } from '@/insights/types'
import { useFilters, useActiveCompany } from '@/state/filters'
import { latestPeriodAcross, type NavTarget } from '@/insights/sourceMap'
import { exportInsightsPptx } from '@/lib/pptExport'
import {
  buildInvestorPulse,
  lensForInsight,
  LENS_ORDER,
  LENS_META,
  type LensKey,
} from '@/insights/investorPulse'
import { InvestorPulseHero, OverviewPulse } from '@/components/InvestorPulse'
import { InsightLensView } from '@/components/InsightLensView'

const FILE = generated as unknown as InsightsFile
const PANEL_LATEST = latestPeriodAcross(FILE.insights)
const GEN_DATE = new Date(FILE.meta.generatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

// Lens chip icons (Overview leads, then the deep analytical lenses).
const LENS_ICON: Record<LensKey, LucideIcon> = {
  overviewPulse: Radar,
  underwritingProfitability: Gauge,
  growthLevers: TrendingUp,
  competitivePositioning: Trophy,
  expenseManagement: Wallet,
  investmentPerformance: LineChart,
  forwardLookingStrategy: Users2,
  riskRegulatoryChanges: Landmark,
}

/**
 * Insights — the investor-intelligence hub. A persistent "Today's Investor Pulse"
 * hero sits on top; below it, internal LENS chips switch between the Overview
 * digest and the deep analytical lenses (Underwriting, Growth, Competitive,
 * Expense, Investment, Forward-Looking, Risk & Regulatory). Every existing
 * deep-dive insight is mapped into a lens (no-loss migration, see the adapter),
 * and rendered with the SAME flip card — the flip design is unchanged.
 */
export function Insights({ onNavigate, reopenInsightId, onReopened }: { onNavigate?: (target: NavTarget, insightId: string) => void; reopenInsightId?: string | null; onReopened?: () => void }) {
  const company = useActiveCompany()
  const { setHighlightedCompany } = useFilters()
  const pulse = useMemo(() => buildInvestorPulse(company.id, company.shortName), [company.id, company.shortName])

  // On return from "Go to source → Back to Insight", open the lens that holds the
  // reopened insight so its flip card is visible (and re-flips to its workings).
  const reopenRef = useRef(reopenInsightId ?? null)
  const reopenInsight = reopenRef.current ? FILE.insights.find((i) => i.id === reopenRef.current) : undefined
  const [activeLens, setActiveLens] = useState<LensKey>(() => (reopenInsight ? lensForInsight(reopenInsight) : 'overviewPulse'))

  useEffect(() => {
    if (reopenRef.current) onReopened?.()
  }, [])

  // "Go to source" from a lens flip card — highlight the company, then jump.
  const goToSource = (target: NavTarget, insightId: string) => {
    if (target.company) setHighlightedCompany(target.company)
    onNavigate?.(target, insightId)
  }

  const avgReady = Math.round(FILE.meta.coverage.reduce((s, c) => s + c.readyPct, 0) / Math.max(1, FILE.meta.coverage.length))

  // Availability per chip — Overview is the digest; the deep lenses report their own.
  const lensAvailable = (key: LensKey): boolean => (key === 'overviewPulse' ? !pulse.isEmpty : pulse.lenses[key].available)

  return (
    // `insights-tab` scopes the editorial serif to this tab's written narrative.
    <div className="insights-tab space-y-5">
      {/* ── Persistent hero — Today's Investor Pulse (drives the company picker). */}
      <InvestorPulseHero pulse={pulse} />

      {/* ── Internal lens chips — analysis lenses inside the Insights tab (NOT
          top-level navigation). The company is set in the hero above. ── */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-1.5 rounded-xl border border-soft-border bg-surface-tint/80 px-2 py-1.5 backdrop-blur-sm">
        <span className="mr-0.5 pl-1 text-[9px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Lens</span>
        {LENS_ORDER.map((key) => {
          const Icon = LENS_ICON[key]
          const on = key === activeLens
          const avail = lensAvailable(key)
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveLens(key)}
              title={LENS_META[key].purpose}
              className={[
                'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-colors',
                on
                  ? 'bg-navy-deep text-white shadow-soft'
                  : avail
                    ? 'border border-soft-border bg-white text-navy-deep hover:border-muted-blue'
                    : 'border border-soft-border bg-white/60 text-ink-secondary hover:border-muted-blue',
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              {LENS_META[key].title}
              {!avail && key !== 'overviewPulse' && <span className="h-1 w-1 rounded-full bg-ink-secondary/40" title="Limited data" />}
            </button>
          )
        })}
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

      {/* ── Active lens ──────────────────────────────────────────────────── */}
      <div key={activeLens} className="animate-fade-in">
        {activeLens === 'overviewPulse' ? (
          <OverviewPulse pulse={pulse} />
        ) : (
          <InsightLensView lens={pulse.lenses[activeLens]} onGoToSource={goToSource} reopenInsightId={reopenRef.current} />
        )}
      </div>

      {/* Honest provenance footnote for the deep-dive insight set. */}
      <p className="border-t border-soft-border pt-3 text-center text-[10.5px] text-ink-secondary">
        {FILE.insights.length} curated insights · {avgReady}% source-backed · data through {PANEL_LATEST} · generated {GEN_DATE}
      </p>
    </div>
  )
}
