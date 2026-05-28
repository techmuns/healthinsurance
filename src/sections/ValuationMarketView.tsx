import { useState } from 'react'
import { ArrowUpRight, Target } from 'lucide-react'
import { ModuleCard } from '@/components/ModuleCard'
import { VerdictStrip } from '@/components/VerdictStrip'
import { InvestorRead } from '@/components/InvestorRead'
import { SegmentedControl } from '@/components/SegmentedControl'
import { MiniKpi } from '@/components/MiniKpi'
import { OrganicIconBlob } from '@/components/OrganicIconBlob'
import { AreaMiniChart, ChartFrame, HorizontalBarChart, ScatterPlot, TrendLineChart } from '@/components/charts'
import { EmptyState } from '@/components/EmptyState'
import {
  priceVolume,
  streetView,
  valuationPeers,
  valuationScatter,
  valuationTrend,
} from '@/data/mockData'
import { useActiveCompany, useFilters } from '@/state/filters'
import { getCompanyValuationCopy } from '@/lib/companyCopy'
import { usePeriodGate } from '@/lib/usePeriodGate'
import { getFilteredInsurers, getRankByMetric } from '@/lib/insurers'
import type { Metric } from '@/data/types'

type View = 'Trend' | 'Peer Comparison' | 'Scatter'

export function ValuationMarketView() {
  const [view, setView] = useState<View>('Trend')
  const company = useActiveCompany()
  const { peerGroup } = useFilters()
  const copy = getCompanyValuationCopy(company, peerGroup)
  const gate = usePeriodGate()

  const peerList = getFilteredInsurers({ peerGroup, highlightedCompany: company.id })
  const peerVals = peerList.filter((i) => i.valuation > 0).map((i) => i.valuation)
  const median = peerVals.length
    ? peerVals.slice().sort((a, b) => a - b)[Math.floor(peerVals.length / 2)]
    : company.valuation
  const valRank = getRankByMetric('valuation', company, peerList)

  const upside = (((streetView.targetPrice - streetView.currentPrice) / streetView.currentPrice) * 100).toFixed(1)
  const headline = {
    Trend: `${company.shortName} P/GWP vs peer median`,
    'Peer Comparison': `${company.shortName} vs peers on P/GWP`,
    Scatter: `${company.shortName} growth vs valuation positioning`,
  }[view]

  const m = (value: number | null, opts: Partial<Metric> = {}): Metric => ({
    value,
    period: 'FY26',
    source: 'Company filings (mock)',
    status: value === null ? 'Pending' : 'Reported',
    lastUpdated: '2026-05-23',
    ...opts,
  })

  const companyKpis: { label: string; metric: Metric; invert?: boolean }[] = [
    { label: 'P / GWP', metric: m(company.valuation, { unit: 'x' }) },
    {
      label: 'Premium to peer median',
      metric: m(((company.valuation - median) / median) * 100, { unit: '%' }),
      invert: true,
    },
    {
      label: 'Valuation rank',
      metric: m(valRank || null, { unit: peerList.length ? `/ ${peerList.length}` : '' }),
    },
    { label: 'ROE', metric: m(company.roe, { unit: '%' }) },
  ]

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow={copy.eyebrow}
        verdict={copy.verdict}
        tone={copy.tone === 'positive' ? 'positive' : copy.tone === 'warning' ? 'warning' : copy.tone === 'teal' ? 'teal' : copy.tone === 'negative' ? 'negative' : 'navy'}
        badge={copy.badge}
        summary={copy.summary}
        source="Mixed: IRDAI + Company filing"
        sourceConfidence="medium"
        sourceProvenance={{ source_name: 'SAHI peer GWP / ROE from FY25 company filings; price / multiples still mock', source_url: 'https://www.nseindia.com/get-quotes/equity?symbol=NIVABUPA' }}
      />

    <ModuleCard
      question="Is the stock pricing in too much optimism, or still offering upside?"
      title={`${company.shortName} · Valuation Compass`}
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
          {companyKpis.map((k) => (
            <MiniKpi key={k.label} label={k.label} metric={k.metric} invert={k.invert} />
          ))}
        </div>
      }
      insight={
        <div className="rounded-xl2 border border-soft-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <OrganicIconBlob shape="blob-c" tone="soft" size="sm">
                <Target />
              </OrganicIconBlob>
              <p className="text-sm font-semibold text-navy-deep">Street View · illustrative</p>
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
            <p className="mt-3 rounded-lg bg-ice px-3 py-2 text-[11px] text-ink-secondary">
              Street consensus shape is illustrative — values do not yet swap per company.
            </p>
        </div>
      }
      dataStatus={companyKpis.map((k) => ({ label: k.label, metric: k.metric }))}
      drawer={
        <ChartFrame headline="Price & traded volume (indexed) — recent months" caption="illustrative · mock" height={180}>
          <AreaMiniChart data={priceVolume} dataKey="price" height={180} />
        </ChartFrame>
      }
      drawerTitle="Valuation — price & volume"
    >
      {!gate.ok ? (
        <EmptyState
          title="Data unavailable for this period"
          body={gate.reason ?? 'Switch the period toggle to Annual to see the valuation series.'}
          height={240}
        />
      ) : (
        <>
          {view === 'Trend' && (
            <ChartFrame
              headline={headline}
              caption="P/GWP vs peer median (x) · illustrative · mock"
              source="Mixed: IRDAI + Company filing"
              sourceConfidence="medium"
              sourceProvenance={{ source_name: 'P/GWP derived from FY25 GWP + market cap; price series is illustrative.' }}
            >
              <TrendLineChart data={valuationTrend} series={['P/GWP', 'Peer median']} unit="x" />
            </ChartFrame>
          )}
          {view === 'Peer Comparison' && (
            <ChartFrame
              headline={headline}
              caption="P/GWP by peer (x) · illustrative · mock"
              source="Mixed: IRDAI + Company filing"
              sourceConfidence="medium"
              sourceProvenance={{ source_name: 'P/GWP derived from FY25 GWP + market cap; price series is illustrative.' }}
            >
              <HorizontalBarChart
                data={valuationPeers.map((d) => ({
                  label: d.label as string,
                  value: d.value as number,
                  focal: String(d.label).includes(company.shortName),
                }))}
                unit="x"
              />
            </ChartFrame>
          )}
          {view === 'Scatter' && (
            <ChartFrame
              headline={headline}
              caption={`Growth vs valuation · ${company.shortName} highlighted · illustrative · mock`}
              source="Mixed: IRDAI + Company filing"
              sourceConfidence="medium"
              sourceProvenance={{ source_name: 'P/GWP derived from FY25 GWP + market cap; price series is illustrative.' }}
            >
              <ScatterPlot
                data={valuationScatter.map((d) => ({
                  ...d,
                  focal: d.name.includes(company.shortName),
                }))}
              />
            </ChartFrame>
          )}
        </>
      )}
    </ModuleCard>

      <InvestorRead
        title={`${company.shortName} · Valuation Investor Read`}
        signal={copy.badge}
        lines={copy.readLines}
        source="Mixed: IRDAI + Company filing"
        sourceConfidence="medium"
      />
    </div>
  )
}
