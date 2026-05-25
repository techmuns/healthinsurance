import { useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  ChevronRight,
  Clock,
  Flame,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { KpiCard } from '@/components/KpiCard'
import { OrganicIconBlob } from '@/components/OrganicIconBlob'
import { SignalBadge } from '@/components/SignalBadge'
import { Drawer } from '@/components/Drawer'
import { SectionHeading } from '@/components/SectionHeading'
import { MarketShareDonut } from '@/components/MarketShareDonut'
import { Leaderboard } from '@/components/Leaderboard'
import { PositioningScorecard } from '@/components/PositioningScorecard'
import { Icon } from '@/components/icons'
import { useActiveCompany } from '@/state/filters'
import {
  DATA_FRESHNESS,
  heroKpis,
  investorRead,
  leaderboard,
  marketShareDonut,
  positioningScore,
  pulseStrip,
  storyStrip,
  type PulseItem,
  type StoryTile,
} from '@/data/mockData'

// Lightened tones for legibility on the dark navy Investor Read panel.
const readTone = {
  positive: 'text-[#86CBA3]',
  warning: 'text-[#E7BE74]',
  negative: 'text-[#E59B98]',
  neutral: 'text-soft-blue',
} as const

const pulseStyle: Record<PulseItem['kind'], { ring: string; chip: string; iconBg: string; icon: typeof Flame }> = {
  Strength: { ring: 'border-emerald/30 bg-emerald-soft/50', chip: 'bg-emerald text-white', iconBg: 'bg-emerald text-white', icon: Sparkles },
  Watch: { ring: 'border-gold/30 bg-gold-soft/60', chip: 'bg-gold text-white', iconBg: 'bg-gold text-white', icon: AlertTriangle },
  Risk: { ring: 'border-coral/30 bg-coral-soft/60', chip: 'bg-coral text-white', iconBg: 'bg-coral text-white', icon: ShieldAlert },
}

export function ExecutiveOverview() {
  const company = useActiveCompany()
  const [openTile, setOpenTile] = useState<StoryTile | null>(null)

  return (
    <div className="space-y-5">
      {/* A. Compact hero header */}
      <header className="card-surface relative overflow-hidden px-6 py-5 sm:px-7">
        <div className="absolute -right-12 -top-16 hidden h-44 w-44 bg-soft-blue/50 blob-a sm:block" />
        <div className="absolute right-6 top-16 hidden h-20 w-20 bg-teal-soft blob-c sm:block" />
        <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2">
              <SignalBadge label={company.peerGroup} tone="navy" size="sm" />
              <span className="text-[11px] font-semibold text-ink-secondary">{company.ticker}</span>
            </div>
            <h1 className="font-display text-[26px] leading-[1.1] text-navy-deep sm:text-[30px]">
              Insurance Investment Dashboard
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-secondary">
              Growth quality, underwriting discipline, capital strength, valuation and key sector
              events for <span className="font-semibold text-navy-primary">{company.name}</span>.
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

      {/* B. Industry at a glance — visual summary first */}
      <section>
        <SectionHeading
          eyebrow="Industry at a glance"
          title="Where the sector stands"
          icon="market"
          right={<span className="text-[11px] text-ink-secondary">SAHI health pool · mock data</span>}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Leadership donut */}
          <div className="card-surface p-4">
            <p className="mb-3 text-[12px] font-semibold text-navy-deep">Health premium share</p>
            <MarketShareDonut data={marketShareDonut} />
            <p className="mt-3 border-t border-soft-border pt-2.5 text-[11.5px] leading-relaxed text-ink-secondary">
              <span className="font-semibold text-navy-primary">Star Health</span> leads the SAHI pool;{' '}
              <span className="font-semibold text-teal">Niva Bupa</span> is narrowing the gap with faster growth.
            </p>
          </div>

          {/* Leaderboard */}
          <div className="card-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[12px] font-semibold text-navy-deep">Top performers</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-soft px-2 py-0.5 text-[10px] font-semibold text-emerald">
                <Flame className="h-3 w-3" /> Fastest GWP growth
              </span>
            </div>
            <Leaderboard rows={leaderboard} />
          </div>

          {/* Positioning scorecard */}
          <div className="card-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[12px] font-semibold text-navy-deep">Niva Bupa vs peers</p>
              <SignalBadge label="Strong" size="sm" />
            </div>
            <PositioningScorecard rows={positioningScore} />
            <p className="mt-3 border-t border-soft-border pt-2.5 text-[11.5px] leading-relaxed text-ink-secondary">
              Leads on <span className="font-semibold text-emerald">margin</span>, lags on{' '}
              <span className="font-semibold text-gold">valuation</span> and distribution mix.
            </p>
          </div>
        </div>
      </section>

      {/* C. Strength / Watch / Risk strip */}
      <div className="grid gap-4 md:grid-cols-3">
        {pulseStrip.map((p) => {
          const s = pulseStyle[p.kind]
          const PulseIcon = s.icon
          return (
            <div key={p.kind} className={`rounded-xl2 border p-4 ${s.ring}`}>
              <div className="flex items-center justify-between">
                <span className={`blob-c inline-flex h-9 w-9 items-center justify-center ${s.iconBg}`}>
                  <PulseIcon className="h-[18px] w-[18px]" />
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.chip}`}>
                  {p.kind}
                </span>
              </div>
              <h3 className="mt-2.5 text-[14px] font-semibold text-navy-deep">{p.headline}</h3>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-secondary">{p.detail}</p>
              <p className="mt-2 inline-block rounded-md bg-card/70 px-2 py-1 text-[11px] font-semibold text-navy-primary">
                {p.metric}
              </p>
            </div>
          )
        })}
      </div>

      {/* D. KPI grid with upgraded Investor Read */}
      <section>
        <SectionHeading eyebrow="Key metrics" title="The numbers behind the signal" icon="overview" />
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {heroKpis.map((k) => (
              <KpiCard
                key={k.id}
                label={k.label}
                metric={k.metric}
                signal={k.signal}
                spark={k.spark}
                icon={k.icon}
                blob={k.blob}
                tone={k.tone}
                invert={k.id === 'combined-ratio' || k.id === 'valuation'}
              />
            ))}
          </div>

          {/* Investor Read — PM readout */}
          <aside className="card-surface relative flex flex-col overflow-hidden bg-gradient-to-br from-navy-deep via-navy-primary to-[#1E396B] p-5 text-white shadow-card">
            <span className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 blob-a bg-white/5" />
            <div className="relative flex items-center gap-2.5 border-b border-white/10 pb-3">
              <OrganicIconBlob shape="blob-e" tone="muted" size="sm">
                <TrendingUp />
              </OrganicIconBlob>
              <div className="leading-tight">
                <h2 className="font-display text-lg">Investor Read</h2>
                <p className="text-[11px] text-white/55">PM signal readout, at a glance</p>
              </div>
            </div>
            <dl className="relative mt-1 divide-y divide-white/10">
              {investorRead.map((row) => {
                const emphasised = row.label === 'Key Risk' || row.label === 'Next Trigger'
                return (
                  <div key={row.label} className="flex items-baseline justify-between gap-3 py-2">
                    <dt className={`text-[12px] ${emphasised ? 'font-semibold text-white/75' : 'text-white/55'}`}>
                      {row.label}
                    </dt>
                    <dd className={`max-w-[60%] text-right text-[12.5px] font-semibold ${readTone[row.tone]}`}>
                      {row.value}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </aside>
        </div>
      </section>

      {/* E. Mini story strip */}
      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="font-display text-lg text-navy-deep">The three things that matter</h2>
          <span className="text-[11px] text-ink-secondary">Tap a tile for the detail</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {storyStrip.map((tile) => (
            <button
              key={tile.id}
              type="button"
              onClick={() => setOpenTile(tile)}
              className="card-surface group flex flex-col gap-2.5 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <OrganicIconBlob shape={tile.blob} tone="soft" size="sm" interactive>
                    <Icon name={tile.icon} />
                  </OrganicIconBlob>
                  <h3 className="font-display text-[15px] text-navy-deep">{tile.title}</h3>
                </div>
                <SignalBadge label={tile.status} size="sm" />
              </div>
              <p className="text-[12.5px] leading-relaxed text-ink-secondary">{tile.insight}</p>
              <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-navy-primary">
                Open detail
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>
      </div>

      <Drawer
        open={openTile !== null}
        onClose={() => setOpenTile(null)}
        title={openTile?.title ?? ''}
        subtitle={openTile?.insight}
      >
        {openTile && (
          <div className="space-y-5">
            <SignalBadge label={openTile.status} />
            <ul className="space-y-3">
              {openTile.detail.map((d, i) => (
                <li key={i} className="flex gap-3 rounded-xl2 border border-soft-border bg-card p-4 text-sm text-ink-primary">
                  <span className="blob-d mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center bg-soft-blue text-[11px] font-bold text-navy-primary">
                    {i + 1}
                  </span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Drawer>
    </div>
  )
}
