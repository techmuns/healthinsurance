import { SectionTabs, type SectionTab } from '@/components/SectionTabs'
import { ProfitabilityReview } from '@/sections/ProfitabilityReview'
import { ValuationMarketView } from '@/sections/ValuationMarketView'
import { CompetitivePositioning } from '@/sections/CompetitivePositioning'
import { HistoricalTrends } from '@/sections/HistoricalTrends'

const TABS: SectionTab[] = [
  { id: 'profitability', label: 'Profitability' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'competitive-position', label: 'Competitive Position' },
  { id: 'historical-trends', label: 'Historical Trends' },
]

/**
 * Company Performance — Profitability, Valuation, Competitive Position and
 * Historical Trends under one section with clearly-clickable pill sub-tabs.
 * Historical Trends holds the multi-year Premium Engine stack (GWP / NWP / NEP
 * by year); it was previously dropped from the tab list, which orphaned that
 * chart, so it is restored here.
 */
export function CompanyPerformance({ onNavigate, sub }: { onNavigate?: (id: string) => void; sub?: string }) {
  const tab = TABS.find((t) => t.id === sub?.split('/')[0])?.id ?? TABS[0].id
  const go = (id: string) => onNavigate?.(`company-performance/${id}`)

  return (
    <div className="space-y-5">
      <SectionTabs tabs={TABS} active={tab} onSelect={go} />
      <div key={tab} className="animate-fade-in">
        {tab === 'profitability' && <ProfitabilityReview />}
        {tab === 'valuation' && <ValuationMarketView />}
        {tab === 'competitive-position' && <CompetitivePositioning />}
        {tab === 'historical-trends' && <HistoricalTrends />}
      </div>
    </div>
  )
}
