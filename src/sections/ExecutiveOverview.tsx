import { BadgeCheck, Clock, ShieldCheck } from 'lucide-react'
import { SignalBadge } from '@/components/SignalBadge'
import { SectionHeading } from '@/components/SectionHeading'
import { MarketShareDonut } from '@/components/MarketShareDonut'
import { IndustryLeaders } from '@/components/IndustryLeaders'
import { Heatmap } from '@/components/Heatmap'
import { BestInColumnLegend } from '@/components/LeaderDot'
import { MetricChip } from '@/components/MetricChip'
import { WhatChangedStrip } from '@/components/WhatChangedStrip'
import { CompareCompanies } from '@/components/CompareCompanies'
import { QuarterlyCalcCard } from '@/components/QuarterlyCalcCard'
import { useActiveCompany, useFilters } from '@/state/filters'
import { getFilteredInsurers, getMarketShareSlices, getPeerScorecardData } from '@/lib/insurers'
import { getQuarterlyReview } from '@/lib/review'
import { DATA_FRESHNESS, PEER_GROUP_LABEL, industryMetrics, insurers } from '@/data/mockData'

export function ExecutiveOverview() {
  const filters = useFilters()
  const { scope, peerGroup, period } = filters
  const company = useActiveCompany()
  const isCompanyView = scope === 'company-view'
  const annualOnly = period !== 'Annual'

  const filtered = getFilteredInsurers(filters)
  const review = getQuarterlyReview(company.id)
  // Rank the selected company against its active peer group; if it sits outside
  // the filtered group, fall back to its own peer group so ranks stay meaningful.
  const inFiltered = filtered.some((i) => i.id === company.id)
  const peerList = inFiltered ? filtered : insurers.filter((i) => i.peerGroup === company.peerGroup)
  const slices = getMarketShareSlices(filters)
  const scorecard = getPeerScorecardData(filters)
  const s = scorecard.summary
  const groupLabel = PEER_GROUP_LABEL[peerGroup]
  const shareContext = peerGroup === 'All' ? 'Premium-weighted, full universe' : `${groupLabel} pool`

  return (
    <div className="space-y-8">
      {/* A. Compact, filter-aware hero */}
      <header className="card-surface relative overflow-hidden px-6 py-5 sm:px-7">
        <div className="absolute -right-12 -top-16 hidden h-44 w-44 bg-teal-soft/60 blob-a sm:block" />
        <div className="absolute right-6 top-16 hidden h-20 w-20 bg-soft-blue/60 blob-c sm:block" />
        <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="max-w-2xl">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <SignalBadge label={isCompanyView ? 'Company View' : 'Industry Overview'} tone="navy" size="sm" />
              <span className="text-[11px] font-medium text-ink-secondary">
                · <span className="font-semibold text-champagne">{company.shortName}</span>{' '}
                {isCompanyView ? 'in focus' : 'highlighted'}
              </span>
            </div>
            <h1 className="font-display text-[26px] leading-[1.1] text-navy-deep sm:text-[30px]">
              {isCompanyView ? company.name : 'Insurance Investment Dashboard'}
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-secondary">
              {isCompanyView
                ? `How ${company.shortName} stacks up against ${groupLabel.toLowerCase()}.`
                : 'See who leads, who is improving, and where risk is building.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-soft-border bg-card px-3 py-1.5 text-[11px]">
              <Clock className="h-3.5 w-3.5 text-muted-blue" />
              <span className="text-ink-secondary">Updated</span>
              <span className="font-semibold text-navy-deep">{DATA_FRESHNESS.lastUpdated}</span>
            </div>
            {annualOnly ? (
              <div className="flex items-center gap-1.5 rounded-lg border border-[#F0E1BE] bg-[#FBF3E2] px-3 py-1.5 text-[11px]">
                <ShieldCheck className="h-3.5 w-3.5 text-signal-warning" />
                <span className="font-semibold text-signal-warning">Annual mock data only</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-lg border border-[#CDE6D7] bg-[#EAF3EE] px-3 py-1.5 text-[11px]">
                <BadgeCheck className="h-3.5 w-3.5 text-signal-positive" />
                <span className="font-semibold text-signal-positive">Freshness: current</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 rounded-lg border border-[#F0E1BE] bg-[#FBF3E2] px-3 py-1.5 text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5 text-signal-warning" />
              <span className="font-semibold text-signal-warning">{DATA_FRESHNESS.quality}</span>
            </div>
          </div>
        </div>
      </header>

      {/* B. Industry Snapshot — the visual hero: donut + leaders */}
      <section>
        <SectionHeading
          eyebrow={isCompanyView ? 'Company Snapshot' : 'Industry Snapshot'}
          title={isCompanyView ? `${company.shortName} vs Peers` : 'Who Leads'}
          note={`${groupLabel} · ${company.shortName} highlighted`}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card-surface card-interactive p-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <p className="text-[12px] font-semibold text-navy-deep">Market Share</p>
              <span className="text-[10.5px] text-ink-secondary">{shareContext}</span>
            </div>
            <MarketShareDonut data={slices} onSelect={filters.setHighlightedCompany} />
          </div>
          <div className="card-surface card-interactive p-4">
            <IndustryLeaders insurers={filtered} highlightId={company.id} onSelect={filters.setHighlightedCompany} />
          </div>
        </div>

        {/* Peer scorecard — full width, self-explanatory */}
        <div className="card-surface card-interactive mt-4 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display text-[15px] text-navy-deep">Peer Scorecard</p>
            <BestInColumnLegend />
          </div>

          {/* Dynamic one-line takeaway */}
          <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">
            <span className="font-semibold text-navy-primary">{s.growthLeader.shortName}</span> leads growth at{' '}
            {s.growthLeader.growth.toFixed(1)}%
            {s.marginByCombined ? (
              <>
                , while <span className="font-semibold text-navy-primary">{s.marginLeader.shortName}</span> runs the
                tightest combined ratio at {s.marginLeader.combinedRatio.toFixed(1)}%
              </>
            ) : (
              <>
                , while <span className="font-semibold text-navy-primary">{s.marginLeader.shortName}</span> leads on ROE
                at {s.marginLeader.roe.toFixed(1)}%
              </>
            )}
            .{' '}
            {s.inGroup ? (
              <>
                <span className="font-semibold text-navy-deep">{s.highlighted.shortName}</span> ranks #{s.growthRank} of{' '}
                {s.count} on growth and #{s.marginRank} on {s.marginByCombined ? 'combined ratio' : 'ROE'}.
              </>
            ) : (
              <>
                <span className="font-semibold text-navy-deep">{s.highlighted.shortName}</span> sits outside this peer
                group ({PEER_GROUP_LABEL[s.highlighted.peerGroup].toLowerCase()}).
              </>
            )}
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
              rows={scorecard.rows.map((r) => ({
                label: r.label,
                focal: r.focal,
                values: {
                  gwpGrowth: r.values.growth,
                  marketShareChange: r.values.marketShareChange,
                  combinedRatio: r.values.combinedRatio,
                  solvency: r.values.solvency,
                  valuation: r.values.valuation,
                },
              }))}
            />
          </div>
        </div>
      </section>

      {/* C. What Changed — compact visual strip */}
      <WhatChangedStrip company={company} list={peerList} review={review} />

      {/* D. Compare Companies — time-based grouped comparison */}
      <section>
        <SectionHeading eyebrow="Comparison" title="Compare Companies" note="Compare key insurance metrics over time" />
        <CompareCompanies companies={peerList} focalId={company.id} />
      </section>

      {/* E. Quarterly calculation trust — compact bridge + detail drawer */}
      <QuarterlyCalcCard company={company} />

      {/* F. Supporting industry metrics */}
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
