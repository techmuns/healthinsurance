import { BadgeCheck, Clock, ShieldCheck } from 'lucide-react'
import { SignalBadge } from '@/components/SignalBadge'
import { SectionHeading } from '@/components/SectionHeading'
import { MarketShareDonut } from '@/components/MarketShareDonut'
import { IndustryLeaders } from '@/components/IndustryLeaders'
import { MetricChip } from '@/components/MetricChip'
import { Heatmap } from '@/components/Heatmap'
import { useActiveCompany } from '@/state/filters'
import { DATA_FRESHNESS, industryMetrics, marketShareDonut, peerRows } from '@/data/mockData'

export function ExecutiveOverview() {
  const company = useActiveCompany()
  const shortName = company.name.split(' ').slice(0, 2).join(' ')

  const heatRows = peerRows
    .filter((r) => r.peerGroup === 'SAHI')
    .map((r) => ({
      label: r.company.replace(' Insurance', '').replace(' and Allied', ''),
      focal: r.ticker === company.ticker,
      values: {
        gwpGrowth: r.gwpGrowth,
        marketShareChange: r.marketShareChange,
        combinedRatio: r.combinedRatio,
        solvency: r.solvency,
        valuation: r.valuation,
      },
    }))

  return (
    <div className="space-y-7">
      {/* A. Compact, industry-framed hero */}
      <header className="card-surface relative overflow-hidden px-6 py-5 sm:px-7">
        <div className="absolute -right-12 -top-16 hidden h-44 w-44 bg-soft-blue/50 blob-a sm:block" />
        <div className="absolute right-6 top-16 hidden h-20 w-20 bg-teal-soft blob-c sm:block" />
        <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2">
              <SignalBadge label="Industry Overview" tone="navy" size="sm" />
              <span className="text-[11px] font-medium text-ink-secondary">
                · <span className="font-semibold text-champagne">{shortName}</span> highlighted
              </span>
            </div>
            <h1 className="font-display text-[26px] leading-[1.1] text-navy-deep sm:text-[30px]">
              Insurance Investment Dashboard
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-secondary">
              See who leads, who is improving, and where risk is building.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-soft-border bg-card px-3 py-1.5 text-[11px]">
              <Clock className="h-3.5 w-3.5 text-muted-blue" />
              <span className="text-ink-secondary">Updated</span>
              <span className="font-semibold text-navy-deep">{DATA_FRESHNESS.lastUpdated}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-[#CDE6D7] bg-[#EAF3EE] px-3 py-1.5 text-[11px]">
              <BadgeCheck className="h-3.5 w-3.5 text-signal-positive" />
              <span className="font-semibold text-signal-positive">Freshness: current</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-[#F0E1BE] bg-[#FBF3E2] px-3 py-1.5 text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5 text-signal-warning" />
              <span className="font-semibold text-signal-warning">{DATA_FRESHNESS.quality}</span>
            </div>
          </div>
        </div>
      </header>

      {/* B. Industry at a glance — visual story first */}
      <section>
        <SectionHeading eyebrow="Industry Snapshot" title="Who Leads" note="SAHI insurers" />
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Leadership donut — all companies, selected one highlighted */}
          <div className="card-surface p-4">
            <p className="mb-3 text-[12px] font-semibold text-navy-deep">Market Share</p>
            <MarketShareDonut data={marketShareDonut} highlight={company.name} />
          </div>

          {/* Industry leaders — tabbed top-3 ranking */}
          <div className="card-surface p-4">
            <IndustryLeaders highlight={company.ticker} />
          </div>
        </div>

        {/* Peer scorecard — full width, self-explanatory */}
        <div className="card-surface mt-4 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display text-[15px] text-navy-deep">Peer Scorecard</p>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-champagne" /> = best in column
            </span>
          </div>

          {/* One-line takeaway */}
          <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">
            Growth leaders aren’t margin leaders —{' '}
            <span className="font-semibold text-navy-primary">Niva Bupa</span> and{' '}
            <span className="font-semibold text-navy-primary">Care Health</span> look the most balanced,
            while Aditya Birla leads growth but trails on margin and valuation.
          </p>

          {/* Reading guide */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-ice/70 px-3 py-2 text-[10.5px] text-ink-secondary">
            <span className="font-semibold text-navy-deep">How to read:</span>
            <span>
              <span className="font-semibold text-emerald">Green</span> stronger ·{' '}
              <span className="font-semibold text-coral">red</span> weaker
            </span>
            <span>·</span>
            <span>Growth &amp; Share Δ are YoY</span>
            <span>·</span>
            <span>Combined ratio: lower is better</span>
            <span>·</span>
            <span>Solvency: higher is safer</span>
            <span>·</span>
            <span>Valuation (P/GWP): lower is cheaper</span>
          </div>

          <div className="mt-3">
            <Heatmap
              markBest
              columns={[
                { key: 'gwpGrowth', label: 'Growth', format: (v) => `${v.toFixed(0)}%` },
                { key: 'marketShareChange', label: 'Share Δ', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} pp` },
                { key: 'combinedRatio', label: 'Combined Ratio', invert: true, format: (v) => `${v.toFixed(0)}%` },
                { key: 'solvency', label: 'Solvency', format: (v) => `${v.toFixed(2)}x` },
                { key: 'valuation', label: 'Valuation', invert: true, format: (v) => `${v.toFixed(1)}x` },
              ]}
              rows={heatRows}
            />
          </div>
        </div>
      </section>

      {/* C. Supporting industry metrics — premium navy mini-cards */}
      <section>
        <SectionHeading eyebrow="At a Glance" title="Key Sector Metrics" note="YoY unless noted" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {industryMetrics.map((mtr) => (
            <MetricChip key={mtr.label} metric={mtr} />
          ))}
        </div>
      </section>
    </div>
  )
}
