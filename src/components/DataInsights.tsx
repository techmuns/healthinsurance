import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { NavTarget } from '@/insights/sourceMap'
import { ANALYTICAL_LENSES, type InsightLens, type InvestorPulse as InvestorPulseData, type LensKey } from '@/insights/investorPulse'
import { InsightLensView, LENS_ICON, StanceChip, ConfidenceChip } from '@/components/InsightLensView'

type AnalyticalKey = Exclude<LensKey, 'overviewPulse'>

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
}: {
  lens: InsightLens
  open: boolean
  onToggle: () => void
  onGoToSource: (target: NavTarget, insightId: string) => void
  reopenInsightId?: string | null
}) {
  const Icon = LENS_ICON[lens.key as AnalyticalKey]
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
        <div className="border-t border-soft-border p-4">
          <InsightLensView lens={lens} onGoToSource={onGoToSource} reopenInsightId={reopenInsightId} hideHeader />
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
  // Accordions open independently; the reopened (or first available) section starts open.
  const [openKeys, setOpenKeys] = useState<Set<AnalyticalKey>>(() => new Set([initialOpenKey ?? firstAvailable]))
  const toggle = (k: AnalyticalKey) =>
    setOpenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  return (
    <div className="space-y-3">
      <p className="px-0.5 text-[11.5px] text-ink-secondary">
        Fact-based deep dive from the wired dashboard data — GI Council / IRDAI, financials, peers and valuation. Each section is source-backed; expand any to see the workings.
      </p>
      {keys.map((k) => (
        <LensAccordion
          key={k}
          lens={pulse.lenses[k]}
          open={openKeys.has(k)}
          onToggle={() => toggle(k)}
          onGoToSource={onGoToSource}
          reopenInsightId={reopenInsightId}
        />
      ))}
    </div>
  )
}
