import { SectionTabs, type SectionTab } from '@/components/SectionTabs'
import { MarketLandscape } from '@/sections/MarketLandscape'
import { CompanyGrowthEngine } from '@/sections/CompanyGrowthEngine'
import { DistributionStrength } from '@/sections/DistributionStrength'

const TABS: SectionTab[] = [
  { id: 'market-snapshot', label: 'Market Snapshot' },
  { id: 'premium-engine', label: 'Premium Engine' },
  { id: 'distribution', label: 'Distribution Mix' },
]

/**
 * Market & Distribution — consolidates the former Market Engine, Premium Engine
 * and Distribution sidebar items into one section with internal tabs. Each tab
 * renders its existing chart component unchanged.
 */
export function MarketDistribution({ onNavigate, sub }: { onNavigate?: (id: string) => void; sub?: string }) {
  const tab = TABS.find((t) => t.id === sub?.split('/')[0])?.id ?? TABS[0].id
  const go = (id: string) => onNavigate?.(`market-distribution/${id}`)
  return (
    <div className="space-y-5">
      <SectionTabs tabs={TABS} active={tab} onSelect={go} />
      <div key={tab} className="animate-fade-in">
        {tab === 'market-snapshot' && <MarketLandscape />}
        {tab === 'premium-engine' && <CompanyGrowthEngine />}
        {tab === 'distribution' && <DistributionStrength />}
      </div>
    </div>
  )
}
