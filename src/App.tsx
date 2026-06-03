import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { DashboardShell } from '@/components/DashboardShell'
import { FilterProvider } from '@/state/filters'
import { ExecutiveOverview } from '@/sections/ExecutiveOverview'
import { MarketDistribution } from '@/sections/MarketDistribution'
import { CompanyPerformance } from '@/sections/CompanyPerformance'
import { StreetView } from '@/sections/StreetView'
import { CompetitivePositioning } from '@/sections/CompetitivePositioning'
import { OwnershipGovernance } from '@/sections/OwnershipGovernance'

// Six consolidated sections. `peers` (Peer Comparison) renders the peer
// scorecard directly; the other multi-area sections are tabbed wrappers.
const sections: Record<string, ComponentType<{ onNavigate?: (id: string) => void; sub?: string }>> = {
  overview: ExecutiveOverview,
  'market-distribution': MarketDistribution,
  'company-performance': CompanyPerformance,
  'street-view': StreetView,
  peers: CompetitivePositioning,
  'ownership-governance': OwnershipGovernance,
}

export default function App() {
  // `active` may be a plain section id ("street-view") or a section/tab route
  // ("company-performance/valuation", "company-performance/profitability/ifrs").
  // The base id selects the section; the `sub` suffix is the active tab (and any
  // nested lens), passed through so the section renders the right sub-view.
  const [active, setActive] = useState('overview')
  const [baseId, sub] = useMemo(() => {
    const slash = active.indexOf('/')
    return slash === -1 ? [active, undefined] : [active.slice(0, slash), active.slice(slash + 1)]
  }, [active])
  const Section = sections[baseId] ?? ExecutiveOverview

  // Scroll to top when the section (not just the tab) changes.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [baseId])

  return (
    <FilterProvider>
      <DashboardShell active={active} onNavigate={setActive}>
        {/* Soft page-change transition keyed on the base section id, so switching
            tabs inside a section updates in place rather than re-animating. */}
        <div key={baseId} className="animate-page-enter">
          <Section onNavigate={setActive} sub={sub} />
        </div>
      </DashboardShell>
    </FilterProvider>
  )
}
