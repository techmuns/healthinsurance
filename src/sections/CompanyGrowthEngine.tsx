import { useState } from 'react'
import { ModuleCard } from '@/components/ModuleCard'
import { SegmentedControl } from '@/components/SegmentedControl'
import { MiniKpi } from '@/components/MiniKpi'
import { BasisTag } from '@/components/BasisTag'
import { YtdBridge } from '@/components/YtdBridge'
import { SectionHeading } from '@/components/SectionHeading'
import { PremiumFlowQuality } from '@/components/PremiumFlowQuality'
import { QuarterlyCalcCard } from '@/components/QuarterlyCalcCard'
import { VerdictStrip } from '@/components/VerdictStrip'
import { InvestorRead } from '@/components/InvestorRead'
import { ChartFrame, GroupedBarChart, StackedBarChart, TrendLineChart } from '@/components/charts'
import { growthBasis, growthDrawer, growthKpis, growthMix, growthQuality, growthTrend, insurers } from '@/data/mockData'
import { getFilteredInsurers } from '@/lib/insurers'
import { useActiveCompany, useFilters } from '@/state/filters'

type View = 'Growth' | 'Mix' | 'Quality' | 'Quarterly'
type Metric = 'GWP' | 'NWP' | 'NEP'

export function CompanyGrowthEngine() {
  const [view, setView] = useState<View>('Growth')
  const [metric, setMetric] = useState<Metric>('GWP')
  const filters = useFilters()
  const company = useActiveCompany()

  // Peer set for the Premium Flow & Quality module's company switcher.
  const filtered = getFilteredInsurers(filters)
  const inFiltered = filtered.some((i) => i.id === company.id)
  const peerList = inFiltered ? filtered : insurers.filter((i) => i.peerGroup === company.peerGroup)

  const headline =
    view === 'Quality'
      ? 'Renewal premium now funds the majority of growth — a sign of durable quality'
      : view === 'Mix'
        ? 'Retail health is crowding out lower-margin group business in the mix'
        : `${metric} growth is accelerating on retail and renewal strength`

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow="Growth Verdict"
        verdict="Growing — and the growth is high quality"
        tone="teal"
        badge="Strong"
        summary="Premium expansion is led by retail mix, renewals and share gains — not low-margin group business — so the growth is durable."
      />

      {/* Premium Flow & Quality — the hero premium-engine story (Flow → Mix → Retention) */}
      <section>
        <SectionHeading eyebrow="Premium Story" title="Premium Flow & Quality" note="How premium is written, retained, earned and renewed" />
        <PremiumFlowQuality companies={peerList} focalId={company.id} />
      </section>

      {/* Calculation basis behind the premium flow */}
      <QuarterlyCalcCard company={company} />

    <ModuleCard
      question="How is premium growing, and is the growth high quality?"
      title="Premium Growth Engine"
      icon="growth"
      controls={
        <>
          <SegmentedControl<View> label="View" options={['Growth', 'Mix', 'Quality', 'Quarterly'] as View[]} value={view} onChange={setView} size="sm" />
          {view === 'Growth' && (
            <SegmentedControl<Metric> label="Metric" options={['GWP', 'NWP', 'NEP'] as Metric[]} value={metric} onChange={setMetric} size="sm" />
          )}
        </>
      }
      kpis={
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {growthKpis.map((k) => (
            <MiniKpi key={k.label} label={k.label} metric={k.metric} />
          ))}
        </div>
      }
      dataStatus={growthKpis}
      dataBasis={growthBasis}
      drawer={<GrowthDrawer />}
      drawerTitle="Growth engine — detail"
      drawerSubtitle="Fresh vs renewal, policy count and segment contribution"
    >
      <BasisTag info={growthBasis} className="mb-3" />
      {view === 'Growth' && (
        <ChartFrame headline={headline} caption="YoY growth (%), quarterly · mock data">
          <TrendLineChart data={growthTrend} series={[metric]} unit="%" />
        </ChartFrame>
      )}
      {view === 'Mix' && (
        <ChartFrame headline={headline} caption="Segment share of GWP (%) · mock data">
          <StackedBarChart data={growthMix} series={['Retail Health', 'Group Health', 'Motor', 'Life', 'Other']} unit="%" />
        </ChartFrame>
      )}
      {view === 'Quality' && (
        <ChartFrame headline={headline} caption="Fresh vs renewal premium share (%) · mock data">
          <GroupedBarChart data={growthQuality} series={['Fresh', 'Renewal']} unit="%" />
        </ChartFrame>
      )}
      {view === 'Quarterly' && (
        <ChartFrame
          headline={`Cumulative-to-standalone bridge — ${company.shortName}`}
          caption="How the standalone quarter is derived from cumulative YTD disclosures"
          height="auto"
        >
          <YtdBridge companyId={company.id} />
        </ChartFrame>
      )}
    </ModuleCard>

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

function GrowthDrawer() {
  return (
    <div className="space-y-3">
      {growthDrawer.map((row) => (
        <div key={row.metric} className="flex items-center justify-between rounded-xl2 border border-soft-border bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink-primary">{row.metric}</p>
            <p className="text-[11px] text-ink-secondary">{row.status}</p>
          </div>
          <span className="font-display text-lg text-navy-deep">{row.value}</span>
        </div>
      ))}
    </div>
  )
}
