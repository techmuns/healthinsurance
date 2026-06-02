import { ArrowUpRight, Award, BadgeCheck, BookOpen, ChevronRight, Clock, Eye, Lightbulb, ShieldAlert, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { SignalBadge } from '@/components/SignalBadge'
import { SectionHeading } from '@/components/SectionHeading'
import { MarketShareDonut } from '@/components/MarketShareDonut'
import { IndustryLeaders } from '@/components/IndustryLeaders'
import { WhatChangedStrip } from '@/components/WhatChangedStrip'
import { AboutView } from '@/components/AboutView'
import { HeaderRibbonArt } from '@/components/HeaderRibbonArt'
import { PeriodPending } from '@/components/PeriodPending'
import { Icon } from '@/components/icons'
import { useActiveCompany, useFilters } from '@/state/filters'
import { getFilteredInsurers, getMarketShareSlices } from '@/lib/insurers'
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
  // Rank the selected company against its active peer group; if it sits outside
  // the filtered group, fall back to its own peer group so ranks stay meaningful.
  const inFiltered = filtered.some((i) => i.id === company.id)
  const peerList = inFiltered ? filtered : insurers.filter((i) => i.peerGroup === company.peerGroup)
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
        <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
          {company.shortName} is currently {positionPhrase}; the key question is whether growth quality and profitability
          continue to improve.
        </p>
        </>
        )}
      </section>

      {/* C. What Changed — compact visual strip (annual basis) */}
      {annualOnly ? (
        <section>
          <SectionHeading eyebrow="What Changed" title={`${company.shortName} · recent movement`} note="Annual basis" />
          <PeriodPending
            period={period}
            title={`${period} movement pending`}
            body={`"What changed" compares full-year figures. ${period} data for ${company.shortName} isn't downloaded yet — it will appear here automatically once ingested.`}
            height={200}
          />
        </section>
      ) : (
        <WhatChangedStrip company={company} list={peerList} />
      )}

      {/* Final Buy-side Read — Decision Panel (dark navy base with tinted lanes) */}
      <section>
        <SectionHeading eyebrow="So What?" title="Final Buy-side Read" />
        <div
          className="relative overflow-hidden rounded-2xl border border-[#1B3260] p-4 shadow-[0_12px_30px_rgba(23,43,77,0.18)] sm:p-5"
          style={{ background: 'linear-gradient(135deg, #172B4D 0%, #1F3F7F 60%, #243F78 100%)' }}
        >
          <span
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(182,139,58,0.45) 0%, transparent 70%)' }}
          />
          <span
            className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full opacity-30 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(22,142,142,0.55) 0%, transparent 70%)' }}
          />

          <div className="relative grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr]">
            {/* Left — verdict / signal meter */}
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-sm">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-champagne" />
                <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-champagne">Investor Read</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[26px] leading-none text-white">Improving</span>
                <ArrowUpRight className="h-4 w-4 text-[#86CBA3]" />
              </div>
              {/* Signal pulse — 4 bars rising left to right */}
              <div className="mt-1 flex items-end gap-1" aria-hidden>
                {[7, 11, 15, 22].map((h, i) => (
                  <span
                    key={i}
                    className="w-1.5 rounded-sm"
                    style={{
                      height: `${h}px`,
                      background:
                        i === 3
                          ? 'linear-gradient(180deg, #B68B3A 0%, #86CBA3 100%)'
                          : 'rgba(134,203,163,0.55)',
                    }}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-[#1E8E8B66] bg-[#168E8E26] px-2 py-0.5 text-[10px] font-semibold text-[#7FD0D0]">
                  Sector tailwind
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#B68B3A55] bg-[#B68B3A1F] px-2 py-0.5 text-[10px] font-semibold text-champagne">
                  Quality compounder
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#E59B9866] bg-[#C75D5424] px-2 py-0.5 text-[10px] font-semibold text-[#E59B98]">
                  Valuation watch
                </span>
              </div>
            </div>

            {/* Right — 4 lanes (Why / Implication / Watch / Read) */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {[
                {
                  label: 'Why',
                  icon: Lightbulb,
                  text: (
                    <>
                      A <span className="font-semibold text-white">#2 SAHI player</span> riding a sector tailwind with improving growth quality.
                    </>
                  ),
                  dot: '#A9BFE0',
                  accent: 'rgba(63,127,224,0.85)',
                  bg: 'rgba(63,127,224,0.10)',
                  ringColor: 'rgba(169,191,224,0.30)',
                  iconColor: '#A9BFE0',
                },
                {
                  label: 'Implication',
                  icon: TrendingUp,
                  text: (
                    <>
                      A <span className="font-semibold text-[#86CBA3]">quality compounder</span> in a structurally growing segment.
                    </>
                  ),
                  dot: '#7FD0D0',
                  accent: 'rgba(22,142,142,0.85)',
                  bg: 'rgba(22,142,142,0.12)',
                  ringColor: 'rgba(127,208,208,0.30)',
                  iconColor: '#7FD0D0',
                },
                {
                  label: 'Watch',
                  icon: ShieldAlert,
                  text: (
                    <>
                      <span className="font-semibold text-[#E7BE74]">Banca concentration</span>, combined-ratio drift and valuation.
                    </>
                  ),
                  dot: '#E7BE74',
                  accent: 'rgba(231,190,116,0.85)',
                  bg: 'rgba(231,190,116,0.10)',
                  ringColor: 'rgba(231,190,116,0.30)',
                  iconColor: '#E7BE74',
                },
                {
                  label: 'Read',
                  icon: BookOpen,
                  text: (
                    <>
                      Own the <span className="font-semibold text-champagne">quality</span>; let valuation discipline guide entry.
                    </>
                  ),
                  dot: '#B68B3A',
                  accent: 'rgba(182,139,58,0.85)',
                  bg: 'rgba(182,139,58,0.12)',
                  ringColor: 'rgba(182,139,58,0.35)',
                  iconColor: '#D6B26D',
                },
              ].map((lane) => (
                <div
                  key={lane.label}
                  className="relative overflow-hidden rounded-lg border p-3"
                  style={{ background: lane.bg, borderColor: lane.ringColor }}
                >
                  <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: lane.accent }} />
                  <div className="flex items-center gap-2 pl-1.5">
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-md"
                      style={{ background: 'rgba(255,255,255,0.08)', boxShadow: `inset 0 0 0 1px ${lane.ringColor}` }}
                    >
                      <lane.icon className="h-3 w-3" style={{ color: lane.iconColor }} />
                    </span>
                    <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/70">{lane.label}</span>
                    <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: lane.dot }} />
                  </div>
                  <p className="mt-1.5 pl-1.5 text-[12px] leading-snug text-white/85">{lane.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
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
