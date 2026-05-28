import { Award, BadgeCheck, ChevronRight, Clock, Eye, ShieldCheck, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { SignalBadge } from '@/components/SignalBadge'
import { SectionHeading } from '@/components/SectionHeading'
import { MarketShareDonut } from '@/components/MarketShareDonut'
import { IndustryLeaders } from '@/components/IndustryLeaders'
import { WhatChangedStrip } from '@/components/WhatChangedStrip'
import { OrganicIconBlob } from '@/components/OrganicIconBlob'
import { AboutView } from '@/components/AboutView'
import { HeaderRibbonArt } from '@/components/HeaderRibbonArt'
import { InvestorRead } from '@/components/InvestorRead'
import { Icon } from '@/components/icons'
import { useActiveCompany, useFilters } from '@/state/filters'
import { getFilteredInsurers, getMarketShareSlices } from '@/lib/insurers'
import { getQuarterlyReview } from '@/lib/review'
import { navItems } from '@/nav'
import { DATA_FRESHNESS, PEER_GROUP_LABEL, insurers } from '@/data/mockData'

// Retail-investor translation layer — plain-English read before the data.
// Each card carries its own tinted gradient background so meaning is felt
// before it is read: green/teal = positive operating support, navy/blue =
// structural positioning, amber/champagne = watch / caution.
const tintClass: Record<
  'green' | 'teal' | 'amber',
  { accent: string; medallion: string; icon: string; glow: string; bg: string; border: string }
> = {
  green: {
    accent: 'border-l-teal',
    medallion: 'bg-white text-teal ring-1 ring-[#BFE3E1]',
    icon: 'text-teal',
    glow: 'rgba(22,142,142,0.22)',
    bg: 'linear-gradient(135deg, #F1F8F6 0%, #E1F2F1 100%)',
    border: '#C8E2DD',
  },
  teal: {
    accent: 'border-l-navy-primary',
    medallion: 'bg-white text-navy-primary ring-1 ring-[#D6E2FA]',
    icon: 'text-navy-primary',
    glow: 'rgba(49,90,169,0.20)',
    bg: 'linear-gradient(135deg, #F2F5FC 0%, #E6EEFA 100%)',
    border: '#D2DEF1',
  },
  amber: {
    accent: 'border-l-champagne',
    medallion: 'bg-white text-champagne-deep ring-1 ring-[#EFE2C2]',
    icon: 'text-champagne-deep',
    glow: 'rgba(182,139,58,0.22)',
    bg: 'linear-gradient(135deg, #FBF6EA 0%, #F4ECDB 100%)',
    border: '#EAD9B6',
  },
}

// Curated "next click" destinations — icons reused from nav, with a plain-English
// "what you will learn" line per page.
// {co} is replaced with the selected company's short name at render time.
const deepLinkConfig: { id: string; label?: string; learn: string }[] = [
  { id: 'market', learn: 'Why the sector is growing' },
  { id: 'growth', learn: 'How {co} is growing' },
  { id: 'profitability', learn: 'Whether growth is profitable' },
  { id: 'peers', learn: 'How {co} compares' },
  { id: 'valuation', learn: 'Whether the stock is expensive' },
  { id: 'ownership', label: 'Governance', learn: 'Who owns and runs the company' },
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
    return { ...item, label: d.label ?? item.label, learn: d.learn.replace('{co}', company.shortName) }
  })

  // Position rank by market share within the company's own segment pool
  // (marketShare is a within-segment figure, so we rank inside the segment).
  const segmentPeers = insurers.filter((i) => i.peerGroup === company.peerGroup)
  const sharePosition = [...segmentPeers]
    .sort((a, b) => b.marketShare - a.marketShare)
    .findIndex((i) => i.id === company.id)
  const positionRank = sharePosition >= 0 ? sharePosition + 1 : null
  const positionPhrase = positionRank
    ? positionRank === 1
      ? `the #1 ${company.peerGroup} player`
      : `a top-${positionRank} ${company.peerGroup} player`
    : `a tracked ${company.peerGroup} player`

  const investorRead: {
    icon: LucideIcon
    title: string
    text: ReactNode
    status: string
    tone?: 'positive' | 'warning' | 'teal'
    tint: keyof typeof tintClass
  }[] = [
    {
      icon: TrendingUp,
      title: 'Market Tailwind',
      text: `Sector growth outpaces the broader market — a tailwind for ${company.shortName}.`,
      status: 'Positive',
      tone: 'teal',
      tint: 'green',
    },
    {
      icon: Award,
      title: 'Company Position',
      text: positionRank ? (
        <>
          <span className="font-bold text-navy-primary">#{positionRank}</span> in the {company.peerGroup} peer pool.
        </>
      ) : (
        'Tracked vs the selected peer pool.'
      ),
      // Live company signal drives the pill; SignalBadge resolves its tone.
      status: company.signal ?? 'Improving',
      tint: 'teal',
    },
    {
      icon: Eye,
      title: 'Main Watch',
      text: 'Banca mix, claims discipline, and valuation.',
      status: 'Watch',
      tone: 'warning',
      tint: 'amber',
    },
  ]

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
              <ShieldCheck className="h-3.5 w-3.5 text-champagne-deep" />
              <span className="font-semibold text-champagne-deep">Annual mock data only</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-lg border border-[#BFE3E1] bg-teal-soft px-3 py-1.5 text-[12px] shadow-soft backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5">
              <BadgeCheck className="h-3.5 w-3.5 text-teal" />
              <span className="font-semibold text-teal">Freshness · current</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-lg border border-[#BFE3E1] bg-teal-soft px-3 py-1.5 text-[12px] shadow-soft backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5">
            <ShieldCheck className="h-3.5 w-3.5 text-teal" />
            <span className="font-semibold text-teal">{DATA_FRESHNESS.quality}</span>
          </div>
        </div>
      </header>

      {/* A2. Today's Investor Read — plain-English translation layer */}
      <section>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="h-3 w-[3px] rounded-full bg-champagne" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Investor Read</span>
            </div>
            <h2 className="font-display text-[23px] leading-tight text-navy-deep">
              Today’s Investor Read for {company.shortName}
            </h2>
            <p className="mt-0.5 text-[12px] text-ink-secondary">A quick read on {company.shortName}.</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-navy-primary to-navy-deep px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_4px_12px_rgba(23,43,77,0.18)] ring-1 ring-[#1B3260]">
            <span className="h-1.5 w-1.5 rounded-full bg-champagne shadow-[0_0_6px_rgba(182,139,58,0.7)]" />
            Highlighted · {company.shortName}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {investorRead.map((r) => {
            const tint = tintClass[r.tint]
            return (
              <div
                key={r.title}
                className={`group relative overflow-hidden rounded-xl border border-l-[4px] ${tint.accent} p-3.5 shadow-[0_4px_14px_rgba(23,43,77,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(23,43,77,0.10)]`}
                style={{ background: tint.bg, borderColor: tint.border }}
              >
                <span
                  className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl transition-opacity duration-200 group-hover:opacity-90"
                  style={{ background: tint.glow }}
                />
                <span
                  className="pointer-events-none absolute -bottom-10 -left-6 h-20 w-20 rounded-full opacity-60 blur-3xl"
                  style={{ background: tint.glow }}
                />
                <div className="relative flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg shadow-soft ${tint.medallion}`}>
                      <r.icon className={`h-3.5 w-3.5 ${tint.icon}`} />
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-navy-deep">{r.title}</span>
                  </div>
                  <SignalBadge label={r.status} tone={r.tone} size="sm" />
                </div>
                <p className="relative mt-2.5 text-[12.5px] font-medium leading-snug text-navy-deep/90">{r.text}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* B. Who Leads — the visual hero: donut + leaders */}
      <section>
        <SectionHeading
          eyebrow={isCompanyView ? 'Company Snapshot' : 'Industry Snapshot'}
          title={isCompanyView ? `${company.shortName} vs Peers` : 'Who Leads'}
          note={`${groupLabel} · ${company.shortName} highlighted`}
        />
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
        <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
          {company.shortName} is currently {positionPhrase}; the key question is whether growth quality and profitability
          continue to improve.
        </p>
      </section>

      {/* C. What Changed — compact visual strip */}
      <WhatChangedStrip company={company} list={peerList} review={review} />

      {/* Final Buy-side Read */}
      <InvestorRead
        title="Final Buy-side Read"
        signal="Improving"
        lines={[
          { label: 'Why', value: 'A #2 SAHI player riding a sector tailwind with improving growth quality.' },
          { label: 'Implication', value: 'A quality compounder in a structurally growing segment.' },
          { label: 'Watch', value: 'Banca concentration, combined-ratio drift and valuation.' },
          { label: 'Read', value: 'Own the quality; let valuation discipline guide entry.' },
        ]}
      />

      {/* D. Understand the story deeper — navigation to the full analysis pages */}
      <section>
        <SectionHeading eyebrow="Next Click" title="Understand the Story Deeper" note="Open the full analysis" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {deepLinks.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => onNavigate?.(link.id)}
              className="group relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-soft-border p-3 text-left shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D6E2FA] hover:shadow-[0_8px_24px_rgba(23,43,77,0.10)]"
              style={{ background: 'linear-gradient(135deg, #FFFFFF 0%, #F4F7FC 80%, #EEF4FF 100%)' }}
            >
              <span
                className="pointer-events-none absolute -right-6 -bottom-6 h-16 w-16 rounded-full opacity-0 blur-2xl transition-opacity duration-200 group-hover:opacity-100"
                style={{ background: 'rgba(49,90,169,0.18)' }}
              />
              <OrganicIconBlob shape="blob-d" tone="navySoft" size="sm">
                <Icon name={link.icon} />
              </OrganicIconBlob>
              <div className="relative min-w-0">
                <p className="text-[13px] font-semibold text-navy-deep">{link.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-secondary">{link.learn}</p>
              </div>
              <ChevronRight className="relative ml-auto h-4 w-4 shrink-0 text-navy-primary transition-transform group-hover:translate-x-1" />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
