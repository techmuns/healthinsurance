import { useState } from 'react'
import { ModuleCard } from '@/components/ModuleCard'
import { VerdictStrip } from '@/components/VerdictStrip'
import { InvestorRead } from '@/components/InvestorRead'
import { SegmentedControl } from '@/components/SegmentedControl'
import { MiniKpi } from '@/components/MiniKpi'
import { InsightBox } from '@/components/InsightBox'
import { SignalBadge } from '@/components/SignalBadge'
import { ChartFrame, HorizontalBarChart, StackedBarChart } from '@/components/charts'
import { majorHolders, ownershipChange, ownershipKpis, ownershipTrend } from '@/data/mockData'

type View = 'Trend' | 'Change' | 'Table'

export function Ownership() {
  const [view, setView] = useState<View>('Trend')

  const headline = {
    Trend: 'Long-only institutions are steadily replacing PE and promoter sell-down',
    Change: 'FIIs are the marginal buyer; PE and mutual funds are trimming',
    Table: 'Top of the register is rotating toward quality foreign institutions',
  }[view]

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow="Ownership Signal"
        verdict="Quality institutions accumulating"
        tone="positive"
        badge="Improving"
        summary="Long-only FIIs are steadily replacing PE and promoter sell-down; no large exit overhang remains."
      />

    <ModuleCard
      question="Who owns the company, and are serious investors increasing or reducing exposure?"
      title="Ownership Trend"
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
      insight={
        <InsightBox
          variant="panel"
          signal="Improving"
          lines={[
            { label: 'Signal', value: 'Improving' },
            { label: 'Why', value: 'Quality FIIs are accumulating while promoter alignment stays stable.' },
            { label: 'Implication', value: 'Supportive ownership backdrop; no large exit overhang.' },
            { label: 'Next trigger', value: 'Any block deal from the remaining PE holder.' },
          ]}
        />
      }
      dataStatus={ownershipKpis}
    >
      {view === 'Trend' && (
        <ChartFrame headline={headline} caption="Shareholding by holder type (%) · mock data">
          <StackedBarChart data={ownershipTrend} series={['Promoter', 'FII', 'DII', 'MF', 'PE', 'Public']} unit="%" />
        </ChartFrame>
      )}
      {view === 'Change' && (
        <ChartFrame headline={headline} caption="Change in holding over FY25 (pp) · mock data">
          <HorizontalBarChart
            data={ownershipChange.map((d) => ({ label: d.label as string, value: d.value as number, focal: d.label === 'FII' }))}
            unit=" pp"
            diverging
          />
        </ChartFrame>
      )}
      {view === 'Table' && (
        <ChartFrame headline={headline} caption="Major holders · mock data" height="auto">
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
    </ModuleCard>

      <InvestorRead
        title="Ownership Investor Read"
        signal="Improving"
        lines={[
          { label: 'Why', value: 'Quality FIIs are accumulating; promoter alignment is stable.' },
          { label: 'Implication', value: 'Supportive ownership backdrop, no exit overhang.' },
          { label: 'Watch', value: 'Any block deal from the remaining PE holder.' },
          { label: 'Read', value: 'Register is rotating toward sticky, quality capital.' },
        ]}
      />
    </div>
  )
}
