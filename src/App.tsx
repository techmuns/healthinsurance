import { useEffect, useState, type ComponentType } from 'react'
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

const sections: Record<string, ComponentType<{ onNavigate?: (id: string) => void }>> = {
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
  const [active, setActive] = useState('overview')
  const Section = sections[active] ?? ExecutiveOverview

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [active])

  return (
    <FilterProvider>
      <DashboardShell active={active} onNavigate={setActive}>
        {/* Soft page-change transition: each section fades + slides up gently
            when `active` changes, so navigating between pages feels calm
            rather than a hard jump. Keyed on `active` so React mounts a new
            wrapper that runs the entry animation. */}
        <div key={active} className="animate-page-enter">
          <Section onNavigate={setActive} />
        </div>
      </DashboardShell>
    </FilterProvider>
  )
}
