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
import { OrganicIconBlob } from '@/components/OrganicIconBlob'
import { SignalBadge } from '@/components/SignalBadge'
import { Drawer } from '@/components/Drawer'
import { SectionHeading } from '@/components/SectionHeading'
import { MarketShareDonut } from '@/components/MarketShareDonut'
import { Leaderboard } from '@/components/Leaderboard'
import { PositioningScorecard } from '@/components/PositioningScorecard'
import { MetricChip } from '@/components/MetricChip'
import { Heatmap } from '@/components/Heatmap'
import { Icon } from '@/components/icons'
import { useActiveCompany } from '@/state/filters'
import {
  DATA_FRESHNESS,
  industryMetrics,
  investorRead,
  leaderboard,
  marketShareDonut,
  peerRows,
  pulseStrip,
  storyStrip,
  type PeerRow,
  type PulseItem,
  type ScoreRow,
  type StoryTile,
} from '@/data/mockData'
import type { Signal } from '@/data/types'

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

function signalFor(rank: number, n: number): Signal {
  const f = rank / n
  if (f <= 0.34) return 'Strong'
  if (f <= 0.5) return 'Improving'
  if (f <= 0.75) return 'Watch'
  return 'Weak'
}

// Rank the highlighted company within its own peer group on each pillar.
function buildPositioning(ticker: string, group: PeerRow['peerGroup']): ScoreRow[] | null {
  const peers = peerRows.filter((r) => r.peerGroup === group)
  if (!peers.some((r) => r.ticker === ticker)) return null

  const pillars: { label: string; key: keyof PeerRow; lowerBetter?: boolean }[] = [
    { label: 'Growth', key: 'gwpGrowth' },
    { label: 'Margin', key: 'combinedRatio', lowerBetter: true },
    { label: 'Capital', key: 'solvency' },
    { label: 'Returns', key: 'roe' },
    { label: 'Valuation', key: 'valuation', lowerBetter: true },
  ]

  return pillars.flatMap((p) => {
    const valid = peers.filter((r) => !(p.key === 'combinedRatio' && r.combinedRatio === 0))
    if (!valid.some((r) => r.ticker === ticker)) return []
    const sorted = [...valid].sort((a, b) =>
      p.lowerBetter ? (a[p.key] as number) - (b[p.key] as number) : (b[p.key] as number) - (a[p.key] as number),
    )
    const rank = sorted.findIndex((r) => r.ticker === ticker) + 1
    const n = sorted.length
    return [{ label: p.label, rank, rankOf: n, signal: signalFor(rank, n), score: Math.round(((n - rank + 1) / n) * 100) }]
  })
}

export function ExecutiveOverview() {
  const company = useActiveCompany()
  const [openTile, setOpenTile] = useState<StoryTile | null>(null)

  const positioning = buildPositioning(company.ticker, company.peerGroup)
  const heatRows = peerRows
    .filter((r) => r.peerGroup === 'SAHI')
    .map((r) => ({
      label: r.company.replace(' Insurance', '').replace(' and Allied', ''),
      focal: r.ticker === company.ticker,
      values: {
        gwpGrowth: r.gwpGrowth,
        marketShareChange: r.marketShareChange,
        combinedRatio: r.combinedRatio,
        solvency: r.solvency,
        valuation: r.valuation,
      },
    }))

  return (
    <div className="space-y-5">
      {/* A. Compact, industry-framed hero */}
      <header className="card-surface relative overflow-hidden px-6 py-5 sm:px-7">
        <div className="absolute -right-12 -top-16 hidden h-44 w-44 bg-soft-blue/50 blob-a sm:block" />
        <div className="absolute right-6 top-16 hidden h-20 w-20 bg-teal-soft blob-c sm:block" />
        <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2">
              <SignalBadge label="Industry Overview" tone="navy" size="sm" />
              <span className="text-[11px] font-medium text-ink-secondary">
                Highlighting <span className="font-semibold text-teal">{company.ticker}</span>
              </span>
            </div>
            <h1 className="font-display text-[26px] leading-[1.1] text-navy-deep sm:text-[30px]">
              Insurance Investment Dashboard
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-secondary">
              A sector-wide read on growth, leadership, underwriting discipline, capital strength and
              valuation across India’s health insurers.
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

      {/* B. Industry at a glance — visual story first */}
      <section>
        <SectionHeading
          eyebrow="Industry at a glance"
          title="Who leads, and where the sector stands"
          icon="market"
          right={<span className="text-[11px] text-ink-secondary">All tracked SAHI insurers · mock data</span>}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Leadership donut — all companies, selected one highlighted */}
          <div className="card-surface p-4">
            <p className="mb-3 text-[12px] font-semibold text-navy-deep">Health insurance market share</p>
            <MarketShareDonut data={marketShareDonut} highlight={company.name} />
          </div>

          {/* Leaderboard — all companies */}
          <div className="card-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[12px] font-semibold text-navy-deep">Who is leading this period?</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-soft px-2 py-0.5 text-[10px] font-semibold text-emerald">
                <Flame className="h-3 w-3" /> Fastest GWP growth
              </span>
            </div>
            <Leaderboard rows={leaderboard} highlight={company.ticker} />
          </div>
        </div>

        {/* Industry score grid — full width */}
        <div className="card-surface mt-4 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] font-semibold text-navy-deep">Industry score grid</p>
            <span className="text-[11px] text-ink-secondary">Greener is stronger on each pillar</span>
          </div>
          <Heatmap
            columns={[
              { key: 'gwpGrowth', label: 'Growth', format: (v) => `${v.toFixed(0)}%` },
              { key: 'marketShareChange', label: 'Share Δ', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
              { key: 'combinedRatio', label: 'Margin', invert: true, format: (v) => `${v.toFixed(0)}%` },
              { key: 'solvency', label: 'Solvency', format: (v) => `${v.toFixed(2)}x` },
              { key: 'valuation', label: 'Valuation', invert: true, format: (v) => `${v.toFixed(1)}x` },
            ]}
            rows={heatRows}
          />
        </div>
      </section>

      {/* C. Strength / Watch / Risk — industry level */}
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

      {/* D. Compact supporting industry metrics */}
      <section>
        <SectionHeading eyebrow="Supporting evidence" title="Industry metrics" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {industryMetrics.map((mtr) => (
            <MetricChip key={mtr.label} metric={mtr} />
          ))}
        </div>
      </section>

      {/* E. Investor Read (industry) + highlighted company */}
      <section>
        <SectionHeading eyebrow="Executive read" title="The investment signal" icon="overview" />
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <aside className="card-surface relative flex flex-col overflow-hidden bg-gradient-to-br from-navy-deep via-navy-primary to-[#1E396B] p-5 text-white shadow-card">
            <span className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 blob-a bg-white/5" />
            <div className="relative flex items-center gap-2.5 border-b border-white/10 pb-3">
              <OrganicIconBlob shape="blob-e" tone="muted" size="sm">
                <TrendingUp />
              </OrganicIconBlob>
              <div className="leading-tight">
                <h2 className="font-display text-lg">Investor Read</h2>
                <p className="text-[11px] text-white/55">Industry PM signal readout</p>
              </div>
            </div>
            <dl className="relative mt-1 grid gap-x-6 sm:grid-cols-2">
              {investorRead.map((row) => {
                const emphasised = row.label === 'Key Risk' || row.label === 'Next Trigger'
                return (
                  <div
                    key={row.label}
                    className={`flex items-baseline justify-between gap-3 border-b border-white/10 py-2 ${
                      emphasised ? 'sm:col-span-2' : ''
                    }`}
                  >
                    <dt className={`text-[12px] ${emphasised ? 'font-semibold text-white/75' : 'text-white/55'}`}>
                      {row.label}
                    </dt>
                    <dd className={`text-right text-[12.5px] font-semibold ${readTone[row.tone]}`}>{row.value}</dd>
                  </div>
                )
              })}
            </dl>
            <p className="relative mt-3 rounded-lg bg-white/10 px-3 py-2 text-[12px] text-white/85">
              <span className="font-semibold text-teal">Highlighted:</span> {company.name} — see its
              standing across the visuals and the score grid above.
            </p>
          </aside>

          {/* Highlighted company positioning (dynamic vs its peer group) */}
          <div className="card-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[12px] font-semibold text-navy-deep">{company.ticker} vs {company.peerGroup} peers</p>
              <SignalBadge label={company.peerGroup} tone="navy" size="sm" />
            </div>
            {positioning ? (
              <PositioningScorecard rows={positioning} />
            ) : (
              <p className="py-6 text-center text-[12px] text-ink-secondary">Positioning data pending</p>
            )}
          </div>
        </div>
      </section>

      {/* F. Mini story strip */}
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
