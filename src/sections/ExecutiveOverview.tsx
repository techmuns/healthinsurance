import { useState } from 'react'
import { BadgeCheck, ChevronRight, Clock, ShieldCheck } from 'lucide-react'
import { KpiCard } from '@/components/KpiCard'
import { OrganicIconBlob } from '@/components/OrganicIconBlob'
import { SignalBadge } from '@/components/SignalBadge'
import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/icons'
import { useActiveCompany } from '@/state/filters'
import {
  DATA_FRESHNESS,
  heroKpis,
  investorRead,
  storyStrip,
  type StoryTile,
} from '@/data/mockData'

// Lightened tones for legibility on the dark navy Investor Read panel.
const readTone = {
  positive: 'text-[#86CBA3]',
  warning: 'text-[#E7BE74]',
  negative: 'text-[#E59B98]',
  neutral: 'text-soft-blue',
} as const

export function ExecutiveOverview() {
  const company = useActiveCompany()
  const [openTile, setOpenTile] = useState<StoryTile | null>(null)

  return (
    <div className="space-y-7">
      {/* A. Hero header */}
      <header className="card-surface relative overflow-hidden p-7 sm:p-9">
        <div className="absolute -right-16 -top-20 hidden h-72 w-72 bg-soft-blue/60 blob-a sm:block" />
        <div className="absolute -right-2 top-28 hidden h-32 w-32 bg-ice blob-c sm:block" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2">
              <SignalBadge label={company.peerGroup} tone="navy" size="sm" />
              <span className="text-xs font-medium text-ink-secondary">{company.ticker}</span>
            </div>
            <h1 className="font-display text-[34px] leading-[1.1] text-navy-deep sm:text-[42px]">
              Insurance Investment Dashboard
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-secondary">
              Track growth quality, underwriting discipline, capital strength, valuation, and key
              sector events for <span className="font-semibold text-navy-primary">{company.name}</span> in
              one clean investor view.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2 rounded-full border border-soft-border bg-card px-3.5 py-2 text-xs">
              <Clock className="h-3.5 w-3.5 text-muted-blue" />
              <span className="text-ink-secondary">Last updated</span>
              <span className="font-semibold text-navy-deep">{DATA_FRESHNESS.lastUpdated}</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#CDE6D7] bg-[#EAF3EE] px-3.5 py-2 text-xs">
              <BadgeCheck className="h-3.5 w-3.5 text-signal-positive" />
              <span className="font-semibold text-signal-positive">Data freshness: current</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-soft-border bg-soft-blue/50 px-3.5 py-2 text-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-navy-primary" />
              <span className="font-semibold text-navy-primary">Source quality: {DATA_FRESHNESS.quality}</span>
            </div>
          </div>
        </div>
      </header>

      {/* B + C. KPI grid with investor read */}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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

        {/* C. Investor Read */}
        <aside className="card-surface flex flex-col gap-4 bg-navy-deep p-6 text-white shadow-card">
          <div className="flex items-center gap-3">
            <OrganicIconBlob shape="blob-e" tone="muted" size="md">
              <Icon name="overview" />
            </OrganicIconBlob>
            <div>
              <h2 className="font-display text-xl">Investor Read</h2>
              <p className="text-xs text-white/60">Executive signal, at a glance</p>
            </div>
          </div>
          <dl className="mt-1 space-y-3">
            {investorRead.map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0">
                <dt className="text-sm text-white/60">{row.label}</dt>
                <dd className={`text-right text-sm font-semibold ${readTone[row.tone]}`}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>

      {/* D. Mini story strip */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl text-navy-deep">The three things that matter</h2>
          <span className="text-xs text-ink-secondary">Tap a tile for the detail</span>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {storyStrip.map((tile) => (
            <button
              key={tile.id}
              type="button"
              onClick={() => setOpenTile(tile)}
              className="card-surface group flex flex-col gap-4 p-5 text-left transition-shadow duration-300 hover:shadow-lift"
            >
              <div className="flex items-center justify-between">
                <OrganicIconBlob shape={tile.blob} tone="soft" size="md" interactive>
                  <Icon name={tile.icon} />
                </OrganicIconBlob>
                <SignalBadge label={tile.status} size="sm" />
              </div>
              <div>
                <h3 className="font-display text-lg text-navy-deep">{tile.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{tile.insight}</p>
              </div>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-navy-primary">
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
