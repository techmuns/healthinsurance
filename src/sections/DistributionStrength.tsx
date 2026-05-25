import { useState } from 'react'
import { ModuleCard } from '@/components/ModuleCard'
import { SegmentedControl } from '@/components/SegmentedControl'
import { MiniKpi } from '@/components/MiniKpi'
import { InsightBox } from '@/components/InsightBox'
import { SignalBadge } from '@/components/SignalBadge'
import { ChartFrame, DualAxisChart, HorizontalBarChart, StackedBarChart } from '@/components/charts'
import { Heatmap } from '@/components/Heatmap'
import {
  channelGrowth,
  channelRisk,
  channelShare,
  distributionKpis,
  distributionRiskBadges,
  productivity,
} from '@/data/mockData'

type View = 'Channel Share' | 'Channel Growth' | 'Productivity' | 'Risk'

export function DistributionStrength() {
  const [view, setView] = useState<View>('Channel Share')

  const headline = {
    'Channel Share': 'Banca is taking a rising share of distribution — the key concentration watch-item',
    'Channel Growth': 'Banca and brokers are driving growth while direct lags',
    Productivity: 'Agent productivity is rising even as the agent base expands',
    Risk: 'Distribution risk is concentrated in the banca channel',
  }[view]

  return (
    <ModuleCard
      question="Is the sales engine scalable, productive and not over-dependent on risky channels?"
      title="Distribution Strength"
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
        <>
          <InsightBox
            variant="panel"
            signal="Watch"
            lines={[
              { label: 'Signal', value: 'Watch' },
              { label: 'Why', value: 'Productivity is improving, but banca concentration is rising.' },
              { label: 'Implication', value: 'Scalable, but channel mix needs monitoring.' },
              { label: 'Next trigger', value: 'Banca share of fresh premium.' },
            ]}
          />
          <div className="rounded-xl2 border border-soft-border bg-card p-4">
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-secondary">Risk flags</p>
            <div className="flex flex-wrap gap-2">
              {distributionRiskBadges.map((b) => (
                <SignalBadge key={b.label} label={b.label} tone={b.tone} size="sm" />
              ))}
            </div>
          </div>
        </>
      }
      dataStatus={distributionKpis}
    >
      {view === 'Channel Share' && (
        <ChartFrame headline={headline} caption="Share of GWP by channel (%) · mock data">
          <StackedBarChart data={channelShare} series={['Agents', 'Brokers', 'Banca', 'Direct', 'Digital']} unit="%" />
        </ChartFrame>
      )}
      {view === 'Channel Growth' && (
        <ChartFrame headline={headline} caption="YoY premium growth by channel, FY25 (%) · mock data">
          <HorizontalBarChart
            data={channelGrowth.map((d) => ({ label: d.label as string, value: d.value as number, focal: d.label === 'Banca' }))}
            unit="%"
            diverging
          />
        </ChartFrame>
      )}
      {view === 'Productivity' && (
        <ChartFrame headline={headline} caption="Active agents (bars) vs premium per agent, ₹ L (line) · mock data">
          <DualAxisChart data={productivity} barKey="agents" lineKey="perAgent" barLabel="Active agents" lineLabel="Premium / agent (₹ L)" />
        </ChartFrame>
      )}
      {view === 'Risk' && (
        <ChartFrame headline={headline} caption="Channel concentration & growth-dependence (%) · mock data">
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
    </ModuleCard>
  )
}
