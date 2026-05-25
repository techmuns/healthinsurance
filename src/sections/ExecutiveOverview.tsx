import { BadgeCheck, Clock, ShieldCheck, TrendingUp } from 'lucide-react'
import { OrganicIconBlob } from '@/components/OrganicIconBlob'
import { SignalBadge } from '@/components/SignalBadge'
import { SectionHeading } from '@/components/SectionHeading'
import { MarketShareDonut } from '@/components/MarketShareDonut'
import { IndustryLeaders } from '@/components/IndustryLeaders'
import { PositioningScorecard } from '@/components/PositioningScorecard'
import { MetricChip } from '@/components/MetricChip'
import { Heatmap } from '@/components/Heatmap'
import { useActiveCompany } from '@/state/filters'
import {
  DATA_FRESHNESS,
  industryMetrics,
  investorRead,
  marketShareDonut,
  peerRows,
  type PeerRow,
  type ScoreRow,
} from '@/data/mockData'
import type { Signal } from '@/data/types'

// Lightened tones for legibility on the dark navy Investor Read panel.
const readTone = {
  positive: 'text-[#86CBA3]',
  warning: 'text-[#E7BE74]',
  negative: 'text-[#E59B98]',
  neutral: 'text-soft-blue',
} as const

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
  const shortName = company.name.split(' ').slice(0, 2).join(' ')

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
                · <span className="font-semibold text-champagne">{shortName}</span> highlighted
              </span>
            </div>
            <h1 className="font-display text-[26px] leading-[1.1] text-navy-deep sm:text-[30px]">
              Insurance Investment Dashboard
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-secondary">
              See who leads, who is improving, and where risk is building.
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
        <SectionHeading eyebrow="Industry Snapshot" title="Who Leads" note="SAHI insurers" />
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Leadership donut — all companies, selected one highlighted */}
          <div className="card-surface p-4">
            <p className="mb-3 text-[12px] font-semibold text-navy-deep">Market Share</p>
            <MarketShareDonut data={marketShareDonut} highlight={company.name} />
          </div>

          {/* Industry leaders — tabbed top-3 ranking */}
          <div className="card-surface p-4">
            <IndustryLeaders highlight={company.ticker} />
          </div>
        </div>

        {/* Industry score grid — full width */}
        <div className="card-surface mt-4 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] font-semibold text-navy-deep">Scorecard</p>
            <span className="text-[11px] text-ink-secondary">Green = better</span>
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

      {/* C. Compact supporting industry metrics */}
      <section>
        <SectionHeading eyebrow="At a Glance" title="Quick Metrics" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {industryMetrics.map((mtr) => (
            <MetricChip key={mtr.label} metric={mtr} />
          ))}
        </div>
      </section>

      {/* E. Investor Read (industry) + highlighted company */}
      <section>
        <SectionHeading eyebrow="Executive Read" title="The Signal" />
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <aside className="card-surface relative flex flex-col overflow-hidden bg-gradient-to-br from-navy-deep via-navy-primary to-[#1E396B] p-5 text-white shadow-card">
            <span className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 blob-a bg-white/5" />
            <div className="relative flex items-center gap-2.5 border-b border-white/10 pb-3">
              <OrganicIconBlob shape="blob-e" tone="muted" size="sm">
                <TrendingUp />
              </OrganicIconBlob>
              <div className="leading-tight">
                <h2 className="font-display text-lg">Investor Read</h2>
                <p className="text-[11px] text-white/55">At a glance</p>
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
              <span className="font-semibold text-champagne">{shortName}</span> highlighted across the
              visuals above.
            </p>
          </aside>

          {/* Highlighted company positioning (dynamic vs its peer group) */}
          <div className="card-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[12px] font-semibold text-navy-deep">{shortName} vs peers</p>
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

    </div>
  )
}
