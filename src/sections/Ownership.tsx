import { useState } from 'react'
import { ModuleCard } from '@/components/ModuleCard'
import { VerdictStrip } from '@/components/VerdictStrip'
import { InvestorRead } from '@/components/InvestorRead'
import { SegmentedControl } from '@/components/SegmentedControl'
import { MiniKpi } from '@/components/MiniKpi'
import { SignalBadge } from '@/components/SignalBadge'
import { ChartFrame, HorizontalBarChart, StackedBarChart } from '@/components/charts'
import { EmptyState } from '@/components/EmptyState'
import { majorHolders, ownershipChange, ownershipKpis, ownershipTrend } from '@/data/mockData'
import { useActiveCompany } from '@/state/filters'
import { getCompanyOwnershipCopy } from '@/lib/companyCopy'
import { usePeriodGate } from '@/lib/usePeriodGate'

type View = 'Trend' | 'Change' | 'Table'

export function Ownership() {
  const [view, setView] = useState<View>('Trend')
  const company = useActiveCompany()
  const copy = getCompanyOwnershipCopy(company)
  const gate = usePeriodGate()

  const headline = {
    Trend: `${company.shortName} shareholding mix · illustrative`,
    Change: `Marginal buyers & sellers around ${company.shortName} · illustrative`,
    Table: `${company.shortName} major holders · illustrative`,
  }[view]

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow={copy.eyebrow}
        verdict={copy.verdict}
        tone={copy.tone === 'positive' ? 'positive' : copy.tone === 'warning' ? 'warning' : copy.tone === 'teal' ? 'teal' : copy.tone === 'negative' ? 'negative' : 'navy'}
        badge={copy.badge}
        summary={copy.summary}
        source="Mock dataset"
        sourceConfidence="pending"
        sourceProvenance={{ source_name: 'UI mock seed — ownership snapshot scaffold in src/data/snapshots/ownership-snapshot.json' }}
      />

    <ModuleCard
      question="Who owns the company, and are serious investors increasing or reducing exposure?"
      title={`${company.shortName} · Ownership Trend`}
      icon="ownership"
      controls={
        <SegmentedControl<View> label="View" options={['Trend', 'Change', 'Table'] as View[]} value={view} onChange={setView} size="sm" />
      }
      kpis={
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ownershipKpis.map((k) => (
            <MiniKpi key={k.label} label={k.label} metric={k.metric} />
          ))}
        </div>
      }
      dataStatus={ownershipKpis}
    >
      {!gate.ok ? (
        <EmptyState
          title="Data unavailable for this period"
          body={gate.reason ?? 'Switch the period toggle to Annual to see ownership.'}
          height={240}
        />
      ) : (
        <>
          {view === 'Trend' && (
            <ChartFrame
              headline={headline}
              caption="Shareholding by holder type (%) · illustrative · mock"
              source="Mock dataset"
              sourceConfidence="pending"
            >
              <StackedBarChart data={ownershipTrend} series={['Promoter', 'FII', 'DII', 'MF', 'PE', 'Public']} unit="%" />
            </ChartFrame>
          )}
          {view === 'Change' && (
            <ChartFrame
              headline={headline}
              caption="Change in holding over the period (pp) · illustrative · mock"
              source="Mock dataset"
              sourceConfidence="pending"
            >
              <HorizontalBarChart
                data={ownershipChange.map((d) => ({ label: d.label as string, value: d.value as number, focal: d.label === 'FII' }))}
                unit=" pp"
                diverging
              />
            </ChartFrame>
          )}
          {view === 'Table' && (
            <ChartFrame
              headline={headline}
              caption="Major holders · illustrative · mock"
              height="auto"
              source="Mock dataset"
              sourceConfidence="pending"
            >
              <div className="overflow-hidden rounded-xl2 border border-soft-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-ice text-[11px] uppercase tracking-wide text-ink-secondary">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Holder</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Stake</th>
                      <th className="px-4 py-3 font-semibold">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {majorHolders.map((h, i) => (
                      <tr key={h.holder} className={i % 2 ? 'bg-ice/40' : ''}>
                        <td className="px-4 py-3 font-medium text-ink-primary">{h.holder}</td>
                        <td className="px-4 py-3">
                          <SignalBadge label={h.type} tone="navy" size="sm" />
                        </td>
                        <td className="px-4 py-3 tabular-nums text-ink-primary">{h.stake.toFixed(1)}%</td>
                        <td className={`px-4 py-3 font-semibold tabular-nums ${h.change >= 0 ? 'text-signal-positive' : 'text-signal-negative'}`}>
                          {h.change > 0 ? '+' : ''}
                          {h.change.toFixed(1)} pp
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartFrame>
          )}
        </>
      )}
    </ModuleCard>

      <InvestorRead
        title={`${company.shortName} · Ownership Investor Read`}
        signal={copy.badge}
        lines={copy.readLines}
        source="Mock dataset"
        sourceConfidence="pending"
      />
    </div>
  )
}
