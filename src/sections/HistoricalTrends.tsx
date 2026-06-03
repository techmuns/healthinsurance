import { useEffect } from 'react'
import { PremiumFlowQuality } from '@/components/PremiumFlowQuality'
import { CompanyBridgeCard } from '@/sections/MarketLandscape'
import { useActiveCompany, useFilters } from '@/state/filters'

/**
 * Historical Trends — the company's real multi-year history, grouped in one
 * place: the Premium Engine stack (GWP / NWP / NEP by year) and the market-share
 * trajectory. Both are existing, source-backed charts, reused as-is. They report
 * on an annual basis, so the section pins the global Period to Annual on entry
 * (Monthly/Quarterly aren't reported for these series).
 */
export function HistoricalTrends() {
  const company = useActiveCompany()
  const { setPeriod } = useFilters()

  // These series are annual-only; ensure the annual view renders even if the
  // reader last left an operating section on Quarterly.
  useEffect(() => {
    setPeriod('Annual')
  }, [setPeriod])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <span className="h-6 w-1.5 rounded-full bg-champagne" />
        <div>
          <h2 className="font-display text-[20px] leading-tight text-navy-deep">Historical Trends</h2>
          <p className="mt-0.5 text-[12px] text-ink-secondary">
            <span className="font-semibold text-navy-deep">{company.shortName}</span> · multi-year premium and market-share history · annual basis
          </p>
        </div>
      </div>

      {/* Premium history — Gross / Net / Earned by year */}
      <PremiumFlowQuality focalId={company.id} />

      {/* Market-share trajectory */}
      <CompanyBridgeCard />
    </div>
  )
}
