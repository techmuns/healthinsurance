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
// Card copy is built per selected company inside the component; tints are fixed.
// Mostly-white cards; per-card identity comes from a thin left accent line, a
// soft icon medallion and a subtle corner glow, with a navy/teal icon anchor.
const tintClass: Record<'green' | 'teal' | 'amber', { accent: string; medallion: string; icon: string; glow: string }> = {
  green: { accent: 'border-l-teal', medallion: 'bg-teal-soft', icon: 'text-teal', glow: 'rgba(22,142,142,0.22)' },
  teal: { accent: 'border-l-navy-primary', medallion: 'bg-soft-blue', icon: 'text-navy-primary', glow: 'rgba(49,90,169,0.18)' },
  amber: { accent: 'border-l-gold', medallion: 'bg-gold-soft', icon: 'text-navy-primary', glow: 'rgba(183,121,31,0.20)' },
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
      {/* A. Compact, filter-aware hero */}
      <header className="card-surface relative min-h-[170px] rounded-[28px] px-5 py-5 sm:px-6">
        <HeaderRibbonArt />

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
          <h1 className="font-display text-[26px] leading-[1.1] text-navy-deep sm:text-[30px]">
            {isCompanyView ? company.name : 'Insurance Investment Dashboard'}
          </h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-secondary">
            {isCompanyView
              ? `${company.shortName} vs ${groupLabel.toLowerCase()}.`
              : 'Who leads, who’s improving, and where risk is building.'}
          </p>
        </div>

        {/* Status chips — float lower-right on desktop, flow under title on mobile */}
        <div className="relative z-20 mt-5 flex flex-wrap gap-3 sm:absolute sm:bottom-6 sm:right-6 sm:mt-0">
          <div className="flex items-center gap-1.5 rounded-xl border border-[#2956A02E] bg-[#FFFFFFC7] px-3.5 py-2 text-[12.5px] shadow-soft backdrop-blur-sm">
            <Clock className="h-3.5 w-3.5 text-muted-blue" />
            <span className="text-ink-secondary">Updated</span>
            <span className="font-semibold text-navy-deep">{DATA_FRESHNESS.lastUpdated}</span>
          </div>
          {annualOnly ? (
            <div className="flex items-center gap-1.5 rounded-xl border border-[#C4841D3D] bg-[#FFF6E0E0] px-3.5 py-2 text-[12.5px] shadow-soft backdrop-blur-sm">
              <ShieldCheck className="h-3.5 w-3.5 text-signal-warning" />
              <span className="font-semibold text-signal-warning">Annual mock data only</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-xl border border-[#16968438] bg-[#E8FAF4D9] px-3.5 py-2 text-[12.5px] shadow-soft backdrop-blur-sm">
              <BadgeCheck className="h-3.5 w-3.5 text-teal" />
              <span className="font-semibold text-teal">Freshness: current</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-xl border border-[#C4841D3D] bg-[#FFF6E0E0] px-3.5 py-2 text-[12.5px] shadow-soft backdrop-blur-sm">
            <ShieldCheck className="h-3.5 w-3.5 text-signal-warning" />
            <span className="font-semibold text-signal-warning">{DATA_FRESHNESS.quality}</span>
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
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-navy-primary to-navy-deep px-3 py-1 text-[11px] font-semibold text-white shadow-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-champagne" />
            Highlighted: {company.shortName}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {investorRead.map((r) => {
            const tint = tintClass[r.tint]
            return (
              <div
                key={r.title}
                className={`relative overflow-hidden rounded-xl border border-soft-border border-l-[3px] ${tint.accent} bg-card p-3.5 shadow-[0_6px_18px_rgba(23,43,77,0.08)]`}
              >
                <span
                  className="pointer-events-none absolute -right-7 -top-7 h-20 w-20 rounded-full blur-2xl"
                  style={{ background: tint.glow }}
                />
                <div className="relative flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-lg ${tint.medallion}`}>
                      <r.icon className={`h-3.5 w-3.5 ${tint.icon}`} />
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-navy-deep">{r.title}</span>
                  </div>
                  <SignalBadge label={r.status} tone={r.tone} size="sm" />
                </div>
                <p className="relative mt-2 text-[12px] font-medium leading-snug text-ink-primary">{r.text}</p>
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
              className="card-surface card-interactive group flex items-center gap-2.5 p-3 text-left"
            >
              <OrganicIconBlob shape="blob-d" tone="navySoft" size="sm">
                <Icon name={link.icon} />
              </OrganicIconBlob>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-navy-deep">{link.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-secondary">{link.learn}</p>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-ink-secondary transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
