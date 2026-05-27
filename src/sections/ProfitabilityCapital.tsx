import { useState } from 'react'
import { ModuleCard } from '@/components/ModuleCard'
import { VerdictStrip } from '@/components/VerdictStrip'
import { InvestorRead } from '@/components/InvestorRead'
import { SegmentedControl } from '@/components/SegmentedControl'
import { MiniKpi } from '@/components/MiniKpi'
import { InsightBox } from '@/components/InsightBox'
import { SignalBadge } from '@/components/SignalBadge'
import { BasisTag } from '@/components/BasisTag'
import { BandedLineChart, ChartFrame, TrendLineChart } from '@/components/charts'
import {
  costKpis,
  marginTrend,
  plTrend,
  profitabilityBasis,
  profitabilityKpis,
  returnsTrend,
  solvencyTrend,
} from '@/data/mockData'

type View = 'P&L' | 'Margin' | 'Cost' | 'Returns' | 'Capital'

// Combined ratio threshold styling (soft tones only).
function combinedTone(v: number): { label: string; tone: 'positive' | 'warning' | 'negative' } {
  if (v < 100) return { label: 'Strong', tone: 'positive' }
  if (v <= 105) return { label: 'Watch', tone: 'warning' }
  return { label: 'Weak', tone: 'negative' }
}

export function ProfitabilityCapital() {
  const [view, setView] = useState<View>('Margin')
  const latestCombined = marginTrend[marginTrend.length - 1].Combined as number
  const ct = combinedTone(latestCombined)

  const headline = {
    'P&L': 'Profit is compounding faster than revenue as the book scales',
    Margin: 'Combined ratio is below 100 and trending down — underwriting is profitable',
    Cost: 'Cost ratios are stable to improving despite rapid growth',
    Returns: 'ROE has expanded toward the high-teens',
    Capital: 'Solvency sits comfortably inside the regulatory comfort band',
  }[view]

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow="Profitability Verdict"
        verdict="Underwriting now profitable"
        tone="positive"
        badge="Strong"
        summary="Combined ratio is below 100 and trending down; solvency sits comfortably above the floor while ROE expands toward the high-teens."
      />

    <ModuleCard
      question="Is premium growth converting into profit, underwriting discipline and strong capital returns?"
      title="Profitability & Capital Quality"
      icon="capital"
      controls={
        <SegmentedControl<View>
          label="View"
          options={['P&L', 'Margin', 'Cost', 'Returns', 'Capital'] as View[]}
          value={view}
          onChange={setView}
          size="sm"
        />
      }
      kpis={
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {profitabilityKpis.map((k) => (
            <MiniKpi key={k.label} label={k.label} metric={k.metric} invert={k.label === 'Combined ratio'} />
          ))}
        </div>
      }
      insight={
        <>
          {/* Hero combined-ratio callout */}
          <div className="rounded-xl2 border border-soft-border bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Combined ratio (hero)</p>
              <SignalBadge label={ct.label} tone={ct.tone} size="sm" />
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="font-display text-4xl text-navy-deep">{latestCombined}%</span>
              <span className="mb-1 text-xs text-signal-positive">improving</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ice">
              <div className="h-full rounded-full bg-signal-positive" style={{ width: `${Math.min(100, (latestCombined / 110) * 100)}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-ink-secondary">
              <span>&lt;100 strong</span>
              <span>100–105 watch</span>
              <span>&gt;105 weak</span>
            </div>
          </div>
          <InsightBox
            variant="panel"
            signal="Strong"
            lines={[
              { label: 'Signal', value: 'Strong' },
              { label: 'Why', value: 'Improving combined ratio, stable solvency and rising ROE.' },
              { label: 'Implication', value: 'Growth is converting into quality returns.' },
              { label: 'Next trigger', value: 'Loss ratio trend next quarter.' },
            ]}
          />
        </>
      }
      dataStatus={[...profitabilityKpis, ...costKpis]}
      dataBasis={profitabilityBasis}
    >
      <BasisTag info={profitabilityBasis} className="mb-3" />
      {view === 'P&L' && (
        <ChartFrame headline={headline} caption="Revenue, operating profit & PAT (₹ Cr) · mock data">
          <TrendLineChart data={plTrend} series={['Revenue', 'Operating', 'PAT']} />
        </ChartFrame>
      )}
      {view === 'Margin' && (
        <ChartFrame headline={headline} caption="Combined ratio and its components (%) · mock data">
          <TrendLineChart data={marginTrend} series={['Combined', 'Loss', 'Expense', 'Commission']} unit="%" />
        </ChartFrame>
      )}
      {view === 'Cost' && (
        <ChartFrame headline={headline} caption="Key cost ratios · mock data" height={280}>
          <div className="grid h-full grid-cols-1 content-center gap-3 sm:grid-cols-3">
            {costKpis.map((k) => (
              <MiniKpi key={k.label} label={k.label} metric={k.metric} invert />
            ))}
          </div>
        </ChartFrame>
      )}
      {view === 'Returns' && (
        <ChartFrame headline={headline} caption="ROE & ROA (%) · mock data">
          <TrendLineChart data={returnsTrend} series={['ROE', 'ROA']} unit="%" />
        </ChartFrame>
      )}
      {view === 'Capital' && (
        <ChartFrame headline={headline} caption="Solvency ratio vs regulatory floor (x) · mock data">
          <BandedLineChart data={solvencyTrend} lineKey="Solvency" floorKey="Floor" bandLow={1.5} bandHigh={2.5} />
        </ChartFrame>
      )}
    </ModuleCard>

      <InvestorRead
        title="Profitability Investor Read"
        signal="Strong"
        lines={[
          { label: 'Why', value: 'Improving combined ratio, stable solvency and rising ROE.' },
          { label: 'Implication', value: 'Growth is converting into quality returns.' },
          { label: 'Watch', value: 'Loss-ratio trend next quarter.' },
          { label: 'Read', value: 'Profitability inflection supports a quality re-rating.' },
        ]}
      />
    </div>
  )
}
