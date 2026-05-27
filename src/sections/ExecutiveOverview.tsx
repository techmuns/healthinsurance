import { BadgeCheck, ChevronRight, Clock, ShieldCheck } from 'lucide-react'
import { SignalBadge } from '@/components/SignalBadge'
import { SectionHeading } from '@/components/SectionHeading'
import { MarketShareDonut } from '@/components/MarketShareDonut'
import { IndustryLeaders } from '@/components/IndustryLeaders'
import { WhatChangedStrip } from '@/components/WhatChangedStrip'
import { OrganicIconBlob } from '@/components/OrganicIconBlob'
import { Icon } from '@/components/icons'
import { useActiveCompany, useFilters } from '@/state/filters'
import { getFilteredInsurers, getMarketShareSlices } from '@/lib/insurers'
import { getQuarterlyReview } from '@/lib/review'
import { navItems } from '@/nav'
import { DATA_FRESHNESS, PEER_GROUP_LABEL, insurers } from '@/data/mockData'

// Curated "next click" destinations — labels/icons/questions reused from nav.
const deepLinkConfig: { id: string; label?: string }[] = [
  { id: 'market' },
  { id: 'growth' },
  { id: 'profitability' },
  { id: 'peers' },
  { id: 'valuation' },
  { id: 'ownership', label: 'Governance' },
]

export function ExecutiveOverview({ onNavigate }: { onNavigate?: (id: string) => void }) {
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
  const groupLabel = PEER_GROUP_LABEL[peerGroup]
  const shareContext = peerGroup === 'All' ? 'Premium-weighted, full universe' : `${groupLabel} pool`

  const deepLinks = deepLinkConfig.map((d) => {
    const item = navItems.find((n) => n.id === d.id)!
    return { ...item, label: d.label ?? item.label }
  })

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

      {/* B. Who Leads — the visual hero: donut + leaders */}
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
      </section>

      {/* C. What Changed — compact visual strip */}
      <WhatChangedStrip company={company} list={peerList} review={review} />

      {/* D. Understand the story deeper — navigation to the full analysis pages */}
      <section>
        <SectionHeading eyebrow="Next Click" title="Understand the Story Deeper" note="Open the full analysis for each theme" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {deepLinks.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => onNavigate?.(link.id)}
              className="card-surface card-interactive group flex items-start gap-3 p-4 text-left"
            >
              <OrganicIconBlob shape="blob-d" tone="navySoft" size="sm">
                <Icon name={link.icon} />
              </OrganicIconBlob>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-navy-deep">{link.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-secondary">{link.question}</p>
              </div>
              <ChevronRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-ink-secondary transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
