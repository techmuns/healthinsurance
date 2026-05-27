import { useState } from 'react'
import { ArrowUpRight, Target } from 'lucide-react'
import { ModuleCard } from '@/components/ModuleCard'
import { VerdictStrip } from '@/components/VerdictStrip'
import { InvestorRead } from '@/components/InvestorRead'
import { SegmentedControl } from '@/components/SegmentedControl'
import { MiniKpi } from '@/components/MiniKpi'
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
    Trend: 'Off its peak, still a premium to peers',
    'Peer Comparison': 'Above the peer median — earned on quality',
    Scatter: 'Valuation looks reasonable vs growth',
  }[view]

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow="Valuation Verdict"
        verdict="Premium — but largely earned"
        tone="navy"
        badge="Fair"
        summary="The stock trades above the peer median; the premium is backed by growth quality, solvency and share gains, leaving a limited margin of safety."
      />

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
        // Analyst Street View
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
        <ChartFrame headline={headline} caption="Growth vs valuation · Niva Bupa highlighted · mock">
          <ScatterPlot data={valuationScatter} />
        </ChartFrame>
      )}
    </ModuleCard>

      <InvestorRead
        title="Valuation Investor Read"
        signal="Fair"
        lines={[
          { label: 'Why', value: 'Premium multiple is backed by growth quality and share gains.' },
          { label: 'Implication', value: 'Acceptable entry, but limited margin of safety.' },
          { label: 'Watch', value: 'Any slip in combined ratio or growth.' },
          { label: 'Read', value: 'Own for quality; add on valuation resets.' },
        ]}
      />
    </div>
  )
}
