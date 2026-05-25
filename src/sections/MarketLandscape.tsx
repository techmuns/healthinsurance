import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { ModuleCard } from '@/components/ModuleCard'
import { SegmentedControl } from '@/components/SegmentedControl'
import { MiniKpi } from '@/components/MiniKpi'
import { InsightBox } from '@/components/InsightBox'
import {
  ChartFrame,
  HorizontalBarChart,
  StackedBarChart,
  TrendLineChart,
} from '@/components/charts'
import { marketKpis, marketRanking, marketSplit, marketTrend } from '@/data/mockData'

type View = 'Trend' | 'Split' | 'Ranking'
type Segment = 'Total' | 'Health' | 'Life' | 'General' | 'SAHI'

const segments: Segment[] = ['Total', 'Health', 'Life', 'General', 'SAHI']

export function MarketLandscape() {
  const [view, setView] = useState<View>('Trend')
  const [segment, setSegment] = useState<Segment>('Health')

  const headline =
    view === 'Ranking'
      ? 'SAHI and health premiums are growing fastest across the industry'
      : view === 'Split'
        ? 'Health is taking a rising share of the industry premium mix'
        : 'Health and SAHI premium growth are outpacing the broader market'

  return (
    <ModuleCard
      question="Is the insurance market growing, and which segment is gaining share?"
      title="Insurance Market Growth"
      icon="market"
      controls={
        <>
          <SegmentedControl<View> label="View" options={['Trend', 'Split', 'Ranking'] as View[]} value={view} onChange={setView} size="sm" />
          {view === 'Trend' && (
            <SegmentedControl<Segment> label="Segment" options={segments} value={segment} onChange={setSegment} size="sm" />
          )}
        </>
      }
      kpis={
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          {marketKpis.map((k) => (
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
            { label: 'Why', value: 'Health and SAHI continue to outgrow the broader market.' },
            { label: 'Implication', value: 'Growth is shifting toward specialised health players.' },
            { label: 'Next trigger', value: 'Watch monthly GWP and the retail health mix.' },
          ]}
        />
      }
      dataStatus={marketKpis}
      drawer={<MarketDrawer />}
      drawerTitle="Market landscape — detail"
      drawerSubtitle="Segment split, contribution and regulatory notes"
    >
      {view === 'Trend' && (
        <ChartFrame headline={headline} caption="Indexed to 100 at FY21 · mock data" footnote={<RegWatch />}>
          <TrendLineChart data={marketTrend} series={[segment]} />
        </ChartFrame>
      )}
      {view === 'Split' && (
        <ChartFrame headline={headline} caption="Share of total industry GWP (%) · mock data" footnote={<RegWatch />}>
          <StackedBarChart data={marketSplit} series={['Health', 'Life', 'General', 'SAHI']} unit="%" />
        </ChartFrame>
      )}
      {view === 'Ranking' && (
        <ChartFrame headline={headline} caption="GWP growth by segment, FY25 (%) · mock data" footnote={<RegWatch />}>
          <HorizontalBarChart data={marketRanking.map((d) => ({ label: d.label as string, value: d.value as number, focal: d.label === 'SAHI' }))} unit="%" />
        </ChartFrame>
      )}
    </ModuleCard>
  )
}

function RegWatch() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[#F0E1BE] bg-[#FBF3E2]/70 px-3.5 py-2.5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal-warning" />
      <p className="text-xs leading-relaxed text-ink-primary">
        <span className="font-semibold text-signal-warning">Regulatory watch:</span> revised Expense of
        Management norms phase in over FY26 — most relevant for high-commission, banca-led growth.
      </p>
    </div>
  )
}

function MarketDrawer() {
  return (
    <div className="space-y-5">
      <div>
        <h4 className="mb-2 text-sm font-semibold text-navy-deep">Segment split (FY25)</h4>
        <StackedBarChart data={marketSplit} series={['Health', 'Life', 'General', 'SAHI']} unit="%" height={200} />
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-navy-deep">Market share movement (FY25 growth)</h4>
        <HorizontalBarChart
          data={marketRanking.map((d) => ({ label: d.label as string, value: d.value as number, focal: d.label === 'SAHI' }))}
          unit="%"
          height={200}
        />
      </div>
      <div className="rounded-xl2 border border-soft-border bg-card p-4 text-sm text-ink-secondary">
        <h4 className="mb-1.5 font-semibold text-navy-deep">Regulatory notes</h4>
        Revised EOM framework, rising retail health penetration in tier-2 markets, and continued private
        insurer share gains are the structural drivers behind the segment mix shift.
      </div>
    </div>
  )
}
