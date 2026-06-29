import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { NavTarget } from '@/insights/sourceMap'
import { ANALYTICAL_LENSES, selectManagementEvents, type InsightLens, type InvestorPulse as InvestorPulseData, type LensKey } from '@/insights/investorPulse'
import { InsightLensView, LENS_ICON, StanceChip, ConfidenceChip } from '@/components/InsightLensView'
import { ManagementEventIntelligence } from '@/components/ManagementEventIntelligence'

type AnalyticalKey = Exclude<LensKey, 'overviewPulse'>

// Sections that carry a compact REFERENCE to the shared management-events feed
// (the full version lives in Pulse). Forward-Looking → leadership/execution read;
// Risk & Regulatory → governance-risk read. Same shared component + data path.
const MGMT_EVENT_LENSES = new Set<AnalyticalKey>(['forwardLookingStrategy', 'riskRegulatoryChanges'])
const MGMT_EVENT_LABEL: Partial<Record<AnalyticalKey, string>> = {
  forwardLookingStrategy: 'Leadership & board references',
  riskRegulatoryChanges: 'Governance-risk references',
}

// Data Insights — the fact-based deep dive. The seven analytical lenses are
// stacked as compact accordion SECTIONS (not separate tabs): each header shows
// the lens title, stance, confidence and one-line read so the whole company
// reads "at a glance" while scrolling; click a header to expand the full section
// (metric strip + the unchanged flip cards + missed-signal / implication /
// watch-next / source trail).

function LensAccordion({
  lens,
  open,
  onToggle,
  onGoToSource,
  reopenInsightId,
  companyId,
  companyName,
}: {
  lens: InsightLens
  open: boolean
  onToggle: () => void
  onGoToSource: (target: NavTarget, insightId: string) => void
  reopenInsightId?: string | null
  companyId: string
  companyName: string
}) {
  const Icon = LENS_ICON[lens.key as AnalyticalKey]
  // Forward-Looking / Risk sections reference the shared management events (compact),
  // but only when this company actually has governance events on record.
  const showMgmtRef = MGMT_EVENT_LENSES.has(lens.key as AnalyticalKey)
  const govEvents = showMgmtRef ? selectManagementEvents(companyId, { governanceOnly: true }) : []
  return (
    <div className="overflow-hidden rounded-2xl border border-soft-border bg-card shadow-soft">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2.5 p-3.5 text-left transition-colors hover:bg-ice/40">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-soft-blue text-navy-primary">
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[16px] leading-tight text-navy-deep">{lens.title}</h3>
            <StanceChip stance={lens.stance} />
            <ConfidenceChip confidence={lens.confidence} />
            {!lens.available && <span className="rounded-full bg-ice px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-ink-secondary">Limited data</span>}
          </div>
          <p className={`mt-0.5 font-editorial text-[12.5px] leading-snug text-ink-secondary ${open ? '' : 'line-clamp-1'}`}>{lens.oneLineRead}</p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-soft-border p-4">
          <InsightLensView lens={lens} onGoToSource={onGoToSource} reopenInsightId={reopenInsightId} hideHeader />
          {showMgmtRef && govEvents.length > 0 && (
            <div>
              <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-ink-secondary">{MGMT_EVENT_LABEL[lens.key as AnalyticalKey]}</p>
              <ManagementEventIntelligence variant="compact" governanceOnly companyId={companyId} companyName={companyName} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function DataInsights({
  pulse,
  onGoToSource,
  reopenInsightId,
  initialOpenKey,
}: {
  pulse: InvestorPulseData
  onGoToSource: (target: NavTarget, insightId: string) => void
  reopenInsightId?: string | null
  initialOpenKey?: AnalyticalKey | null
}) {
  const keys = ANALYTICAL_LENSES as AnalyticalKey[]
  const firstAvailable = keys.find((k) => pulse.lenses[k].available) ?? keys[0]
  // One section open at a time — clicking a header collapses any other.
  const [openKey, setOpenKey] = useState<AnalyticalKey | null>(initialOpenKey ?? firstAvailable)
  const toggle = (k: AnalyticalKey) => setOpenKey((prev) => (prev === k ? null : k))

  return (
    <div className="space-y-3">
      <p className="px-0.5 text-[11.5px] text-ink-secondary">
        Fact-based deep dive from the wired dashboard data — GI Council / IRDAI, financials, peers and valuation. Each section is source-backed; expand any to see the workings.
      </p>
      {keys.map((k) => (
        <LensAccordion
          key={k}
          lens={pulse.lenses[k]}
          open={openKey === k}
          onToggle={() => toggle(k)}
          onGoToSource={onGoToSource}
          reopenInsightId={reopenInsightId}
          companyId={pulse.companyId}
          companyName={pulse.company}
        />
      ))}
    </div>
  )
}
