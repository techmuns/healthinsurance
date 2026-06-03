import { BadgeCheck, Clock, ShieldCheck } from 'lucide-react'
import { SignalBadge } from '@/components/SignalBadge'
import { SectionHeading } from '@/components/SectionHeading'
import { MarketShareDonut } from '@/components/MarketShareDonut'
import { IndustryLeaders } from '@/components/IndustryLeaders'
import { AboutView } from '@/components/AboutView'
import { HeaderRibbonArt } from '@/components/HeaderRibbonArt'
import { PeriodPending } from '@/components/PeriodPending'
import { useActiveCompany, useFilters } from '@/state/filters'
import { getFilteredInsurers, getMarketShareSlices } from '@/lib/insurers'
import { DATA_FRESHNESS, PEER_GROUP_LABEL } from '@/data/mockData'

export function ExecutiveOverview() {
  const filters = useFilters()
  const { scope, peerGroup, period } = filters
  const company = useActiveCompany()
  const isCompanyView = scope === 'company-view'
  const annualOnly = period !== 'Annual'

  const filtered = getFilteredInsurers(filters)
  const slices = getMarketShareSlices(filters)
  const groupLabel = PEER_GROUP_LABEL[peerGroup]
  const shareContext = peerGroup === 'All' ? 'Premium-weighted, full universe' : `${groupLabel} pool`

  return (
    <div className="space-y-6">
      {/* A. Compact, filter-aware hero — layered navy → champagne backdrop */}
      <header className="card-surface relative min-h-[170px] overflow-hidden rounded-[28px] px-5 py-5 sm:px-6">
        <HeaderRibbonArt />
        {/* Layered ambient backdrop: subtle navy gradient + champagne glow + teal accent */}
        <span
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            background:
              'radial-gradient(circle at 12% 25%, rgba(238,244,255,0.7) 0%, transparent 50%), radial-gradient(circle at 92% 90%, rgba(244,236,219,0.65) 0%, transparent 55%), radial-gradient(circle at 75% 15%, rgba(225,242,241,0.55) 0%, transparent 45%)',
          }}
        />

        {/* About this view — floating top-right */}
        <div className="absolute right-5 top-5 z-20 sm:right-6 sm:top-6">
          <AboutView text="Selected company vs its peer group, period, and dataset." />
        </div>

        {/* Left content */}
        <div className="relative z-10 max-w-2xl">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <SignalBadge label={isCompanyView ? 'Company View' : 'Industry Overview'} tone="navy" size="sm" />
            <span className="text-[11px] font-medium text-ink-secondary">
              · <span className="font-semibold text-champagne">{company.shortName}</span>{' '}
              {isCompanyView ? 'in focus' : 'highlighted'}
            </span>
          </div>
          <h1 className="font-display text-[27px] leading-[1.1] text-navy-deep sm:text-[31px]">
            {isCompanyView ? company.name : 'Insurance Investment Dashboard'}
          </h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-secondary">
            {isCompanyView
              ? `${company.shortName} vs ${groupLabel.toLowerCase()}.`
              : 'Who leads, who’s improving, and where risk is building.'}
          </p>
        </div>

        {/* Status chips — float lower-right on desktop, flow under title on mobile */}
        <div className="relative z-20 mt-5 flex flex-wrap gap-2.5 sm:absolute sm:bottom-6 sm:right-6 sm:mt-0">
          <div className="flex items-center gap-1.5 rounded-lg border border-[#D6E2FA] bg-white/85 px-3 py-1.5 text-[12px] shadow-soft backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5">
            <Clock className="h-3.5 w-3.5 text-navy-primary" />
            <span className="text-ink-secondary">Updated</span>
            <span className="font-semibold text-navy-deep">{DATA_FRESHNESS.lastUpdated}</span>
          </div>
          {annualOnly ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-[#F0E1BE] bg-[#FBF6EA] px-3 py-1.5 text-[12px] shadow-soft backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5">
              <Clock className="h-3.5 w-3.5 text-champagne-deep" />
              <span className="font-semibold text-champagne-deep">{period} data pending</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-lg border border-[#BFE3E1] bg-teal-soft px-3 py-1.5 text-[12px] shadow-soft backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5">
              <BadgeCheck className="h-3.5 w-3.5 text-teal" />
              <span className="font-semibold text-teal">Annual basis · current</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-lg border border-[#BFE3E1] bg-teal-soft px-3 py-1.5 text-[12px] shadow-soft backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5">
            <ShieldCheck className="h-3.5 w-3.5 text-teal" />
            <span className="font-semibold text-teal">{DATA_FRESHNESS.quality}</span>
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
        {annualOnly ? (
          <PeriodPending
            period={period}
            title={`${period} market view pending`}
            body={`Market share and the leader board are tracked on an annual basis. ${period} figures aren't downloaded yet — switch the Period back to Annual to see who leads.`}
            height={300}
          />
        ) : (
        <>
        <div className="grid gap-4 lg:grid-cols-2">
          <div
            className="card-surface card-interactive relative overflow-hidden p-4"
            style={{ background: 'linear-gradient(135deg, #FFFFFF 0%, #F4F7FC 100%)' }}
          >
            <span
              className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-50 blur-3xl"
              style={{ background: 'radial-gradient(circle, rgba(49,90,169,0.16) 0%, transparent 70%)' }}
            />
            <div className="relative mb-3 flex items-baseline justify-between gap-2">
              <p className="font-display text-[14px] text-navy-deep">Market Share</p>
              <span className="text-[10.5px] text-ink-secondary">{shareContext}</span>
            </div>
            <div className="relative">
              <MarketShareDonut data={slices} onSelect={filters.setHighlightedCompany} />
            </div>
          </div>
          <div
            className="card-surface card-interactive relative overflow-hidden p-4"
            style={{ background: 'linear-gradient(135deg, #FFFFFF 0%, #FBF6EA 100%)' }}
          >
            <span
              className="pointer-events-none absolute -right-10 -bottom-10 h-32 w-32 rounded-full opacity-50 blur-3xl"
              style={{ background: 'radial-gradient(circle, rgba(182,139,58,0.18) 0%, transparent 70%)' }}
            />
            <div className="relative">
              <IndustryLeaders insurers={filtered} highlightId={company.id} onSelect={filters.setHighlightedCompany} />
            </div>
          </div>
        </div>
        </>
        )}
      </section>
    </div>
  )
}
