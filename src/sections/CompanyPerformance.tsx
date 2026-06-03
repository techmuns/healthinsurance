import { SectionTabs, type SectionTab } from '@/components/SectionTabs'
import { ProfitabilityReview } from '@/sections/ProfitabilityReview'
import { ValuationMarketView } from '@/sections/ValuationMarketView'
import { CompetitivePositioning } from '@/sections/CompetitivePositioning'

const TABS: SectionTab[] = [
  { id: 'profitability', label: 'Profitability' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'competitive-position', label: 'Competitive Position' },
]

/**
 * Company Performance — Profitability, Valuation and Competitive Position under
 * one section with clearly-clickable pill sub-tabs. Profitability is now a
 * single dual-framework review (no nested lens routing).
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
      </div>
    </div>
  )
}
