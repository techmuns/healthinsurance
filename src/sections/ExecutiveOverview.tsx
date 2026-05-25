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
    <div className="space-y-5">
      {/* A. Compact hero header */}
      <header className="card-surface relative overflow-hidden px-6 py-5 sm:px-7">
        <div className="absolute -right-12 -top-16 hidden h-44 w-44 bg-soft-blue/50 blob-a sm:block" />
        <div className="absolute right-6 top-16 hidden h-20 w-20 bg-ice blob-c sm:block" />
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

      {/* B + C. KPI grid with investor read */}
      <div className="grid gap-4 xl:grid-cols-[1fr_312px]">
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

        {/* C. Investor Read */}
        <aside className="card-surface flex flex-col bg-navy-deep p-5 text-white shadow-card">
          <div className="flex items-center gap-2.5">
            <OrganicIconBlob shape="blob-e" tone="muted" size="sm">
              <Icon name="overview" />
            </OrganicIconBlob>
            <div className="leading-tight">
              <h2 className="font-display text-lg">Investor Read</h2>
              <p className="text-[11px] text-white/55">Executive signal, at a glance</p>
            </div>
          </div>
          <dl className="mt-3.5 divide-y divide-white/10">
            {investorRead.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 py-2 first:pt-0">
                <dt className="text-[12px] text-white/55">{row.label}</dt>
                <dd className={`text-right text-[12.5px] font-semibold ${readTone[row.tone]}`}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>

      {/* D. Mini story strip */}
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
              className="card-surface group flex flex-col gap-2.5 p-4 text-left transition-shadow duration-300 hover:shadow-lift"
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
