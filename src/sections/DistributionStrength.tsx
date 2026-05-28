import { useState } from 'react'
import { ModuleCard } from '@/components/ModuleCard'
import { VerdictStrip } from '@/components/VerdictStrip'
import { InvestorRead } from '@/components/InvestorRead'
import { SegmentedControl } from '@/components/SegmentedControl'
import { MiniKpi } from '@/components/MiniKpi'
import { SignalBadge } from '@/components/SignalBadge'
import { ChartFrame, DualAxisChart, HorizontalBarChart, StackedBarChart } from '@/components/charts'
import { Heatmap } from '@/components/Heatmap'
import { EmptyState } from '@/components/EmptyState'
import {
  channelGrowth,
  channelRisk,
  channelShare,
  distributionKpis,
  distributionRiskBadges,
  productivity,
} from '@/data/mockData'
import { useActiveCompany } from '@/state/filters'
import { getCompanyDistributionCopy } from '@/lib/companyCopy'
import { usePeriodGate } from '@/lib/usePeriodGate'

type View = 'Channel Share' | 'Channel Growth' | 'Productivity' | 'Risk'

export function DistributionStrength() {
  const [view, setView] = useState<View>('Channel Share')
  const company = useActiveCompany()
  const copy = getCompanyDistributionCopy(company)
  const gate = usePeriodGate()

  const headline = {
    'Channel Share': `${company.shortName} channel mix — share of GWP`,
    'Channel Growth': `Channel growth for ${company.shortName}`,
    Productivity: `Agent productivity for ${company.shortName}`,
    Risk: `Channel risk profile for ${company.shortName}`,
  }[view]

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow={copy.eyebrow}
        verdict={copy.verdict}
        tone={copy.tone === 'positive' ? 'positive' : copy.tone === 'warning' ? 'warning' : copy.tone === 'teal' ? 'teal' : copy.tone === 'negative' ? 'negative' : 'navy'}
        badge={copy.badge}
        summary={copy.summary}
      />

    <ModuleCard
      question="Is the sales engine scalable, productive and not over-dependent on risky channels?"
      title={`${company.shortName} · Distribution Strength`}
      icon="distribution"
      controls={
        <SegmentedControl<View>
          label="View"
          options={['Channel Share', 'Channel Growth', 'Productivity', 'Risk'] as View[]}
          value={view}
          onChange={setView}
          size="sm"
        />
      }
      kpis={
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {distributionKpis.map((k) => (
            <MiniKpi key={k.label} label={k.label} metric={k.metric} invert={k.label === 'Banca dependence' || k.label === 'Commission ratio'} />
          ))}
        </div>
      }
      insight={
        <div className="rounded-xl2 border border-soft-border bg-card p-4">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-secondary">Risk flags</p>
          <div className="flex flex-wrap gap-2">
            {distributionRiskBadges.map((b) => (
              <SignalBadge key={b.label} label={b.label} tone={b.tone} size="sm" />
            ))}
          </div>
        </div>
      }
      dataStatus={distributionKpis}
    >
      {!gate.ok ? (
        <EmptyState
          title="Data unavailable for this period"
          body={gate.reason ?? 'Switch the period toggle to Annual to see channel charts.'}
          height={240}
        />
      ) : (
        <>
          {view === 'Channel Share' && (
            <ChartFrame headline={headline} caption="Share of GWP by channel (%) · illustrative · mock">
              <StackedBarChart data={channelShare} series={['Agents', 'Brokers', 'Banca', 'Direct', 'Digital']} unit="%" />
            </ChartFrame>
          )}
          {view === 'Channel Growth' && (
            <ChartFrame headline={headline} caption="YoY premium growth by channel · illustrative · mock">
              <HorizontalBarChart
                data={channelGrowth.map((d) => ({ label: d.label as string, value: d.value as number, focal: d.label === 'Banca' }))}
                unit="%"
                diverging
              />
            </ChartFrame>
          )}
          {view === 'Productivity' && (
            <ChartFrame headline={headline} caption="Agents vs premium per agent (₹ L) · illustrative · mock">
              <DualAxisChart data={productivity} barKey="agents" lineKey="perAgent" barLabel="Active agents" lineLabel="Premium / agent (₹ L)" />
            </ChartFrame>
          )}
          {view === 'Risk' && (
            <ChartFrame headline={headline} caption="Channel concentration & growth-dependence · illustrative · mock">
              <Heatmap
                columns={[
                  { key: 'concentration', label: 'GWP share', invert: true, format: (v) => `${v}%` },
                  { key: 'growthDependence', label: 'Growth dependence', invert: true, format: (v) => `${v}%` },
                ]}
                rows={channelRisk.map((c) => ({
                  label: c.channel,
                  values: { concentration: c.concentration, growthDependence: c.growthDependence },
                  focal: c.channel === 'Banca',
                }))}
              />
            </ChartFrame>
          )}
        </>
      )}
    </ModuleCard>

      <InvestorRead
        title={`${company.shortName} · Distribution Investor Read`}
        signal={copy.badge}
        lines={copy.readLines}
      />
    </div>
  )
}
