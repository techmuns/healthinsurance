import { SectionHeading } from '@/components/SectionHeading'
import { PremiumFlowQuality } from '@/components/PremiumFlowQuality'
import { QuarterlyCalcCard } from '@/components/QuarterlyCalcCard'
import { VerdictStrip } from '@/components/VerdictStrip'
import { InvestorRead } from '@/components/InvestorRead'
import { insurers } from '@/data/mockData'
import { getFilteredInsurers } from '@/lib/insurers'
import { useActiveCompany, useFilters } from '@/state/filters'

export function CompanyGrowthEngine() {
  const filters = useFilters()
  const company = useActiveCompany()

  // Peer set for the Premium Engine company switcher (falls back to own segment).
  const filtered = getFilteredInsurers(filters)
  const inFiltered = filtered.some((i) => i.id === company.id)
  const peerList = inFiltered ? filtered : insurers.filter((i) => i.peerGroup === company.peerGroup)

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow="Growth Verdict"
        verdict="Growing — and the growth is high quality"
        tone="teal"
        badge="Strong"
        summary="Premium expansion is led by retail mix, renewals and share gains — not low-margin group business — so the growth is durable."
      />

      {/* Premium Engine — the hero premium-conversion story (Flow → Mix → Retention) */}
      <section>
        <SectionHeading
          eyebrow="Premium Story"
          title="Premium Engine"
          note={`How ${company.shortName} writes, retains, and earns premium over time`}
        />
        <PremiumFlowQuality companies={peerList} focalId={company.id} />
      </section>

      {/* Calculation basis behind the premium flow */}
      <QuarterlyCalcCard company={company} />

      <InvestorRead
        title="Growth Investor Read"
        signal="Strong"
        lines={[
          { label: 'Why', value: 'Retail mix, renewals and share gains drive premium.' },
          { label: 'Implication', value: 'High-quality growth, likely to persist.' },
          { label: 'Watch', value: 'Fresh-premium concentration by channel.' },
          { label: 'Read', value: 'Durable compounding if retail mix keeps rising.' },
        ]}
      />
    </div>
  )
}
