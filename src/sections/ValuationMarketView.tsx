import { useState } from 'react'
import { ArrowUpRight, Target } from 'lucide-react'
import { ModuleCard } from '@/components/ModuleCard'
import { SegmentedControl } from '@/components/SegmentedControl'
import { MiniKpi } from '@/components/MiniKpi'
import { InsightBox } from '@/components/InsightBox'
import { OrganicIconBlob } from '@/components/OrganicIconBlob'
import { AreaMiniChart, ChartFrame, HorizontalBarChart, ScatterPlot, TrendLineChart } from '@/components/charts'
import {
  priceVolume,
  streetView,
  valuationKpis,
  valuationPeers,
  valuationScatter,
  valuationTrend,
} from '@/data/mockData'

type View = 'Trend' | 'Peer Comparison' | 'Scatter'

export function ValuationMarketView() {
  const [view, setView] = useState<View>('Trend')

  const upside = (((streetView.targetPrice - streetView.currentPrice) / streetView.currentPrice) * 100).toFixed(1)
  const headline = {
    Trend: 'Valuation has cooled from its peak but stays at a premium to peers',
    'Peer Comparison': 'Niva Bupa trades above the peer median — justified only by superior quality',
    Scatter: 'Growth-adjusted, the premium multiple looks defensible',
  }[view]

  return (
    <ModuleCard
      question="Is the stock pricing in too much optimism, or still offering upside?"
      title="Valuation Compass"
      icon="valuation"
      controls={
        <SegmentedControl<View>
          label="View"
          options={['Trend', 'Peer Comparison', 'Scatter'] as View[]}
          value={view}
          onChange={setView}
          size="sm"
        />
      }
      kpis={
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {valuationKpis.map((k) => (
            <MiniKpi key={k.label} label={k.label} metric={k.metric} invert={k.label.includes('Premium')} />
          ))}
        </div>
      }
      insight={
        <>
          {/* Street view card */}
          <div className="rounded-xl2 border border-soft-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <OrganicIconBlob shape="blob-c" tone="soft" size="sm">
                <Target />
              </OrganicIconBlob>
              <p className="text-sm font-semibold text-navy-deep">Street View</p>
            </div>
            <div className="flex gap-1.5">
              {[
                { label: 'Buy', n: streetView.buy, cls: 'bg-signal-positive' },
                { label: 'Hold', n: streetView.hold, cls: 'bg-muted-blue' },
                { label: 'Sell', n: streetView.sell, cls: 'bg-signal-negative' },
              ].map((b) => (
                <div key={b.label} className="flex-1 text-center">
                  <div className={`h-1.5 rounded-full ${b.cls}`} style={{ opacity: 0.85 }} />
                  <p className="mt-1.5 font-display text-lg text-navy-deep">{b.n}</p>
                  <p className="text-[11px] text-ink-secondary">{b.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-soft-border pt-3 text-sm">
              <span className="text-ink-secondary">Avg target</span>
              <span className="font-semibold text-navy-deep">₹ {streetView.targetPrice}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-sm">
              <span className="text-ink-secondary">Implied upside</span>
              <span className="inline-flex items-center gap-1 font-semibold text-signal-positive">
                <ArrowUpRight className="h-3.5 w-3.5" />
                {upside}%
              </span>
            </div>
            <p className="mt-3 rounded-lg bg-ice px-3 py-2 text-[11px] text-ink-secondary">{streetView.recentChange}</p>
          </div>
          <InsightBox
            variant="panel"
            signal="Fair"
            lines={[
              { label: 'Signal', value: 'Fair → Full' },
              { label: 'Why', value: 'Premium multiple is backed by growth quality, solvency and share gains.' },
              { label: 'Implication', value: 'Acceptable, but limited margin of safety.' },
              { label: 'Next trigger', value: 'Any slip in combined ratio or growth.' },
            ]}
          />
        </>
      }
      dataStatus={valuationKpis}
      drawer={
        <ChartFrame headline="Price & traded volume (indexed) — recent months" caption="mock data" height={180}>
          <AreaMiniChart data={priceVolume} dataKey="price" height={180} />
        </ChartFrame>
      }
      drawerTitle="Valuation — price & volume"
    >
      {view === 'Trend' && (
        <ChartFrame headline={headline} caption="P/GWP vs peer median (x) · mock data">
          <TrendLineChart data={valuationTrend} series={['P/GWP', 'Peer median']} unit="x" />
        </ChartFrame>
      )}
      {view === 'Peer Comparison' && (
        <ChartFrame headline={headline} caption="P/GWP by peer (x) · mock data">
          <HorizontalBarChart
            data={valuationPeers.map((d) => ({ label: d.label as string, value: d.value as number, focal: String(d.label).includes('Niva Bupa') }))}
            unit="x"
          />
        </ChartFrame>
      )}
      {view === 'Scatter' && (
        <ChartFrame headline={headline} caption="GWP growth (x-axis) vs P/GWP (y-axis) · star = focal · mock data">
          <ScatterPlot data={valuationScatter} />
        </ChartFrame>
      )}
    </ModuleCard>
  )
}
