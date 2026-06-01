import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { DashboardShell } from '@/components/DashboardShell'
import { FilterProvider } from '@/state/filters'
import { ExecutiveOverview } from '@/sections/ExecutiveOverview'
import { MarketLandscape } from '@/sections/MarketLandscape'
import { CompanyGrowthEngine } from '@/sections/CompanyGrowthEngine'
import { DistributionStrength } from '@/sections/DistributionStrength'
import { ProfitabilityCapital } from '@/sections/ProfitabilityCapital'
import { CompetitivePositioning } from '@/sections/CompetitivePositioning'
import { ValuationMarketView } from '@/sections/ValuationMarketView'
import { Ownership } from '@/sections/Ownership'
import { ManagementEvents } from '@/sections/ManagementEvents'

const sections: Record<string, ComponentType<{ onNavigate?: (id: string) => void; lens?: string }>> = {
  overview: ExecutiveOverview,
  market: MarketLandscape,
  growth: CompanyGrowthEngine,
  distribution: DistributionStrength,
  profitability: ProfitabilityCapital,
  peers: CompetitivePositioning,
  valuation: ValuationMarketView,
  ownership: Ownership,
  management: ManagementEvents,
}

export default function App() {
  // `active` may be a plain section id ("profitability") or a nested lens route
  // ("profitability/ifrs"). The base id selects the section component; the lens
  // suffix is passed through so the section can render the right sub-view.
  const [active, setActive] = useState('overview')
  const [baseId, lens] = useMemo(() => {
    const slash = active.indexOf('/')
    return slash === -1 ? [active, undefined] : [active.slice(0, slash), active.slice(slash + 1)]
  }, [active])
  const Section = sections[baseId] ?? ExecutiveOverview

  // Scroll to top when the section (not just the lens) changes, so switching
  // lenses keeps the reader's place rather than jerking to the top each time.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [baseId])

  return (
    <FilterProvider>
      <DashboardShell active={active} onNavigate={setActive}>
        {/* Soft page-change transition: each section fades + slides up gently
            when the section changes. Keyed on the base section id (not the full
            route) so switching lenses inside a section updates in place — calm,
            no full-page re-animation — while page-to-page navigation animates. */}
        <div key={baseId} className="animate-page-enter">
          <Section onNavigate={setActive} lens={lens} />
        </div>
      </DashboardShell>
    </FilterProvider>
  )
}
