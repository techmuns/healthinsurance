import { BadgeCheck, ChevronRight, Clock, ShieldCheck } from 'lucide-react'
import { SignalBadge } from '@/components/SignalBadge'
import { SectionHeading } from '@/components/SectionHeading'
import { MarketShareDonut } from '@/components/MarketShareDonut'
import { IndustryLeaders } from '@/components/IndustryLeaders'
import { AboutView } from '@/components/AboutView'
import { HeaderRibbonArt } from '@/components/HeaderRibbonArt'
import { PeriodPending } from '@/components/PeriodPending'
import { Icon } from '@/components/icons'
import { useActiveCompany, useFilters } from '@/state/filters'
import { getFilteredInsurers, getMarketShareSlices } from '@/lib/insurers'
import { navItems } from '@/nav'
import { DATA_FRESHNESS, PEER_GROUP_LABEL } from '@/data/mockData'

// Curated "next click" destinations — each tile carries a per-section accent
// tone (color psychology: teal = growth, blue = premium flow, emerald =
// profit, indigo = ranking, amber = valuation discipline, slate = governance)
// plus a tiny preview chip surfacing one specific question the page answers.
type DeepLinkAccent = {
  bar: string
  glow: string
  chipBg: string
  chipBorder: string
  chipText: string
  iconRing: string
}
const deepLinkConfig: {
  id: string
  label?: string
  learn: string
  preview: string
  accent: DeepLinkAccent
}[] = [
  {
    id: 'market',
    learn: 'Why the sector is growing',
    preview: 'Sector tailwind',
    accent: {
      bar: 'linear-gradient(180deg, #2EA9A4 0%, #168E8E 100%)',
      glow: 'rgba(22,142,142,0.20)',
      chipBg: '#E1F2F1',
      chipBorder: '#BFE3E1',
      chipText: '#0E6F6D',
      iconRing: 'rgba(22,142,142,0.30)',
    },
  },
  {
    id: 'growth',
    learn: 'How {co} is growing',
    preview: 'Premium flow',
    accent: {
      bar: 'linear-gradient(180deg, #4F7BCF 0%, #27457E 100%)',
      glow: 'rgba(49,90,169,0.22)',
      chipBg: '#EEF4FF',
      chipBorder: '#D6E2FA',
      chipText: '#27457E',
      iconRing: 'rgba(49,90,169,0.30)',
    },
  },
  {
    id: 'profitability',
    learn: 'Whether growth is profitable',
    preview: 'Profit conversion',
    accent: {
      bar: 'linear-gradient(180deg, #4FA37A 0%, #2F855A 100%)',
      glow: 'rgba(47,133,90,0.22)',
      chipBg: '#EAF3EE',
      chipBorder: '#CDE6D7',
      chipText: '#23633F',
      iconRing: 'rgba(47,133,90,0.30)',
    },
  },
  {
    id: 'peers',
    learn: 'How {co} compares',
    preview: 'Peer ranking',
    accent: {
      bar: 'linear-gradient(180deg, #6D7FCB 0%, #44509B 100%)',
      glow: 'rgba(68,80,155,0.22)',
      chipBg: '#EEF0FB',
      chipBorder: '#CFD4ED',
      chipText: '#3B4691',
      iconRing: 'rgba(68,80,155,0.32)',
    },
  },
  {
    id: 'valuation',
    learn: 'Whether the stock is expensive',
    preview: 'Valuation discipline',
    accent: {
      bar: 'linear-gradient(180deg, #D5B36A 0%, #B68B3A 100%)',
      glow: 'rgba(182,139,58,0.22)',
      chipBg: '#FBF6EA',
      chipBorder: '#EAD9B6',
      chipText: '#8C6B1A',
      iconRing: 'rgba(182,139,58,0.32)',
    },
  },
  {
    id: 'ownership',
    label: 'Governance',
    learn: 'Who owns and runs the company',
    preview: 'Risk control',
    accent: {
      bar: 'linear-gradient(180deg, #9AA6BB 0%, #5E6C82 100%)',
      glow: 'rgba(110,126,150,0.22)',
      chipBg: '#EFF2F7',
      chipBorder: '#D4DAE5',
      chipText: '#3F4A5E',
      iconRing: 'rgba(110,126,150,0.32)',
    },
  },
]

export function ExecutiveOverview({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const filters = useFilters()
  const { scope, peerGroup, period } = filters
  const company = useActiveCompany()
  const isCompanyView = scope === 'company-view'
  const annualOnly = period !== 'Annual'

  const filtered = getFilteredInsurers(filters)
  const slices = getMarketShareSlices(filters)
  const groupLabel = PEER_GROUP_LABEL[peerGroup]
  const shareContext = peerGroup === 'All' ? 'Premium-weighted, full universe' : `${groupLabel} pool`

  const deepLinks = deepLinkConfig.map((d) => {
    const item = navItems.find((n) => n.id === d.id)!
    return {
      ...item,
      label: d.label ?? item.label,
      learn: d.learn.replace('{co}', company.shortName),
      preview: d.preview,
      accent: d.accent,
    }
  })

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

      {/* D. Understand the story deeper — story-continuation tiles, one accent
          tone per section, with a tiny preview chip per destination. */}
      <section>
        <SectionHeading eyebrow="Next Click" title="Understand the Story Deeper" note="Open the full analysis" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {deepLinks.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => onNavigate?.(link.id)}
              className="group relative flex items-stretch gap-3 overflow-hidden rounded-xl border border-soft-border bg-white p-3 pl-4 text-left shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D6E2FA] hover:shadow-[0_10px_26px_rgba(23,43,77,0.10)]"
            >
              {/* Section accent bar on the left edge */}
              <span
                className="absolute inset-y-2 left-0 w-[3px] rounded-r-full"
                style={{ background: link.accent.bar }}
              />
              {/* Ambient glow that brightens on hover */}
              <span
                className="pointer-events-none absolute -right-8 -bottom-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-200 group-hover:opacity-100"
                style={{ background: link.accent.glow }}
              />
              <span
                className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-lg bg-white"
                style={{ boxShadow: `inset 0 0 0 1px ${link.accent.iconRing}`, color: link.accent.chipText }}
              >
                <Icon name={link.icon} />
              </span>
              <div className="relative min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[13px] font-semibold text-navy-deep">{link.label}</p>
                  <span
                    className="inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide"
                    style={{
                      background: link.accent.chipBg,
                      borderColor: link.accent.chipBorder,
                      color: link.accent.chipText,
                    }}
                  >
                    {link.preview}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-ink-secondary">{link.learn}</p>
              </div>
              <ChevronRight
                className="relative ml-1 h-4 w-4 shrink-0 self-center transition-transform duration-200 group-hover:translate-x-1"
                style={{ color: link.accent.chipText }}
              />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
