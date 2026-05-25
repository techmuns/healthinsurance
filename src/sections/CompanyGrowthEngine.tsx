import { useState } from 'react'
import { ModuleCard } from '@/components/ModuleCard'
import { SegmentedControl } from '@/components/SegmentedControl'
import { MiniKpi } from '@/components/MiniKpi'
import { InsightBox } from '@/components/InsightBox'
import { ChartFrame, GroupedBarChart, StackedBarChart, TrendLineChart } from '@/components/charts'
import { growthDrawer, growthKpis, growthMix, growthQuality, growthTrend } from '@/data/mockData'

type View = 'Growth' | 'Mix' | 'Quality'
type Metric = 'GWP' | 'NWP' | 'NEP'

export function CompanyGrowthEngine() {
  const [view, setView] = useState<View>('Growth')
  const [metric, setMetric] = useState<Metric>('GWP')

  const headline =
    view === 'Quality'
      ? 'Renewal premium now funds the majority of growth — a sign of durable quality'
      : view === 'Mix'
        ? 'Retail health is crowding out lower-margin group business in the mix'
        : `${metric} growth is accelerating on retail and renewal strength`

  return (
    <ModuleCard
      question="Which company is growing fastest, and is that growth high quality?"
      title="Premium Growth Engine"
      icon="growth"
      controls={
        <>
          <SegmentedControl<View> label="View" options={['Growth', 'Mix', 'Quality'] as View[]} value={view} onChange={setView} size="sm" />
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
      insight={
        <InsightBox
          variant="panel"
          signal="Strong"
          lines={[
            { label: 'Signal', value: 'Strong' },
            { label: 'Why', value: 'Premium expansion is supported by retail mix, renewals and share gains — not low-margin group.' },
            { label: 'Implication', value: 'Growth is high quality and likely to persist.' },
            { label: 'Next trigger', value: 'Fresh-premium concentration by channel.' },
          ]}
        />
      }
      dataStatus={growthKpis}
      drawer={<GrowthDrawer />}
      drawerTitle="Growth engine — detail"
      drawerSubtitle="Fresh vs renewal, policy count and segment contribution"
    >
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
    </ModuleCard>
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
