import { SectionTabs, type SectionTab } from '@/components/SectionTabs'
import { ProfitabilityCapital } from '@/sections/ProfitabilityCapital'
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
 * Company Performance — consolidates Profitability, Valuation, Competitive
 * Position and Historical Trends under one section with internal tabs. Existing
 * chart components are reused as-is; only their home moves.
 *
 * `sub` carries the active tab and, for Profitability, the nested accounting lens
 * (e.g. "profitability/ifrs"). The Profitability lens switcher routes through
 * here so the URL stays consistent under the new section id.
 */
export function CompanyPerformance({ onNavigate, sub }: { onNavigate?: (id: string) => void; sub?: string }) {
  const parts = sub?.split('/') ?? []
  const tab = TABS.find((t) => t.id === parts[0])?.id ?? TABS[0].id
  const go = (id: string) => onNavigate?.(`company-performance/${id}`)

  // Profitability's in-page lens switcher emits routes like "profitability/ifrs";
  // re-home them under this section so navigation stays in sync.
  const profLens = tab === 'profitability' ? parts[1] : undefined
  const profNavigate = (route: string) => {
    const lensKey = route.includes('/') ? route.split('/')[1] : route
    onNavigate?.(`company-performance/profitability/${lensKey}`)
  }

  return (
    <div className="space-y-5">
      <SectionTabs tabs={TABS} active={tab} onSelect={go} />
      <div key={tab} className="animate-fade-in">
        {tab === 'profitability' && <ProfitabilityCapital onNavigate={profNavigate} lens={profLens} />}
        {tab === 'valuation' && <ValuationMarketView />}
        {tab === 'competitive-position' && <CompetitivePositioning />}
        {tab === 'historical-trends' && <HistoricalTrends />}
      </div>
    </div>
  )
}
