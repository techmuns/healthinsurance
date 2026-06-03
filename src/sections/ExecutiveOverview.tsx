import { useState } from 'react'
import { BarChart3, Building2, CircleDot, Layers, Network, Percent, Shield } from 'lucide-react'
import { RadialGauge } from '@/components/RadialGauge'
import { MarketBubbleChart } from '@/components/MarketBubbleChart'
import { MetricRankingBars } from '@/components/MetricRankingBars'
import { SourceTag } from '@/components/SourceTag'
import { DataEmptyState } from '@/components/DataEmptyState'
import {
  getIndustryOverview,
  OVERVIEW_METRICS,
  companyColor,
  type ConcentrationBand,
  type OverviewMetricId,
} from '@/lib/industryOverview'
import { useFilters } from '@/state/filters'
import { DATA_FRESHNESS } from '@/data/mockData'

const FY = 'FY25'
const SOURCE_PROVENANCE = {
  source_name: 'Per-insurer FY25 GWP, market share & ratios from company annual reports & IRDAI public disclosures (see Company Performance for per-company source links).',
}

// Quiet, on-theme source chip reused across the cards.
function CardSource() {
  return <SourceTag source="IRDAI + Company filing" period={FY} confidence="high" provenance={SOURCE_PROVENANCE} />
}

function bandColor(band: ConcentrationBand): string {
  return band === 'High' ? '#A8453C' : band === 'Moderate' ? '#9C7430' : '#0E6F6D'
}

function MetricToggle({ value, onChange }: { value: OverviewMetricId; onChange: (id: OverviewMetricId) => void }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">View by</span>
      {OVERVIEW_METRICS.map((m) => {
        const on = m.id === value
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            aria-pressed={on}
            className={[
              'rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-all duration-200',
              on
                ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white shadow-soft ring-1 ring-[#1B3260]'
                : 'bg-ice text-ink-secondary hover:bg-soft-blue hover:text-navy-primary',
            ].join(' ')}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}

/** Small 2×2 metric tile for the Industry Snapshot card. */
function SnapTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="surface-soft rounded-xl px-3 py-2">
      <div className="flex items-center gap-1.5 text-ink-secondary">
        <span className="text-navy-primary/70">{icon}</span>
        <span className="text-[9.5px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-0.5 font-display text-[19px] leading-none text-navy-deep">{value}</div>
      <div className="mt-0.5 text-[9.5px] text-ink-secondary">{sub}</div>
    </div>
  )
}

export function ExecutiveOverview() {
  const filters = useFilters()
  const { period } = filters
  const [metricId, setMetricId] = useState<OverviewMetricId>('share')
  const model = getIndustryOverview(filters, metricId)
  const { leader, runnerUp, highlighted, concentration } = model
  const annualBasisNote = period !== 'Annual'

  if (!leader || model.count === 0) {
    return (
      <div className="space-y-4">
        <PageHeader groupLabel={model.groupLabel} highlightName={highlighted?.shortName} period={period} annualBasisNote={annualBasisNote} />
        <DataEmptyState kind="pending" title="No insurers in this pool" body="Switch the Peer Group above to see the industry overview." height={280} />
      </div>
    )
  }

  // The left card is a premium-scaled market map for share/premium, and a
  // ranked bar chart for the tightly-clustered quality ratios.
  const isBubble = model.metric.chartKind === 'bubble'
  const leftTitle = isBubble ? 'Market Map' : `${model.metric.label} Ranking`
  const leftCaption = isBubble
    ? model.metric.id === 'premium'
      ? 'Bubble size = premium'
      : 'Bubble size = market share'
    : 'Ranked high → low · premium shown as secondary'
  const LeftIcon = isBubble ? CircleDot : BarChart3

  return (
    <div className="space-y-4">
      <PageHeader groupLabel={model.groupLabel} highlightName={highlighted?.shortName} period={period} annualBasisNote={annualBasisNote} />

      {/* ── Top row: Leader · Snapshot · Concentration ───────────────────── */}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:items-stretch">
        {/* Card 1 — Market Leader (gold accent) */}
        <div
          className="relative flex min-h-[228px] flex-col overflow-hidden rounded-[1.15rem] border p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5"
          style={{ borderColor: '#E6D2A2', background: 'linear-gradient(135deg, #FFFFFF 0%, #FBF6EA 100%)' }}
        >
          <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-champagne to-champagne-deep" />
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-champagne" />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-champagne-deep">Market Leader</span>
          </div>
          <h2 className="mt-1.5 font-display text-[19px] leading-[1.15] text-navy-deep">{leader.name}</h2>
          <p className="mt-0.5 text-[10px] text-ink-secondary">{leader.listed ? `${leader.ticker} · Listed` : 'Unlisted'}</p>

          <div className="mt-3 flex items-end gap-6">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-ink-secondary">Market share</p>
              <p className="font-display text-[26px] leading-none text-champagne-deep">{leader.share.toFixed(1)}%</p>
            </div>
            {runnerUp && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-ink-secondary">Lead over #2</p>
                <p className="font-display text-[19px] leading-none text-navy-deep">+{model.leadGap.toFixed(1)} pp</p>
                <p className="mt-0.5 text-[9.5px] text-ink-secondary">ahead of {runnerUp.shortName}</p>
              </div>
            )}
          </div>

          {highlighted && (
            <div className="mt-2.5 rounded-lg border border-[#D6E2FA] bg-white/70 px-2.5 py-1.5 text-[11px]">
              {highlighted.isLeader ? (
                <span className="text-navy-deep">
                  <span className="font-semibold">{highlighted.shortName}</span> is the market leader.
                </span>
              ) : (
                <span className="text-ink-secondary">
                  Selected · <span className="font-semibold text-navy-deep">{highlighted.shortName}</span> · Rank{' '}
                  <span className="font-semibold text-navy-deep">#{highlighted.shareRank}</span> · Share{' '}
                  <span className="font-semibold text-navy-deep">{highlighted.share.toFixed(1)}%</span>
                </span>
              )}
            </div>
          )}

          <div className="mt-auto flex items-center justify-between pt-2.5">
            <span className="text-[9px] text-ink-secondary/80">GWP — premium, not profit</span>
            <CardSource />
          </div>
        </div>

        {/* Card 2 — Industry Snapshot (2×2 tiles) */}
        <div className="card-surface card-interactive flex min-h-[228px] flex-col p-4">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-navy-primary" />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-navy-primary">Industry Snapshot</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <SnapTile icon={<Building2 className="h-3.5 w-3.5" />} label="Insurers" value={`${model.count}`} sub={model.groupLabel} />
            <SnapTile icon={<Layers className="h-3.5 w-3.5" />} label="Top 3 share" value={`${concentration.top3Share.toFixed(1)}%`} sub={`${leader.shortName} + 2`} />
            <SnapTile
              icon={<Shield className="h-3.5 w-3.5" />}
              label={highlighted ? highlighted.shortName : 'Selected'}
              value={highlighted ? `#${highlighted.shareRank}` : '—'}
              sub={`of ${model.count} by share`}
            />
            <SnapTile icon={<Percent className="h-3.5 w-3.5" />} label="Avg share" value={`${model.avgShare.toFixed(1)}%`} sub="per insurer" />
          </div>
          <div className="mt-auto flex items-center justify-between rounded-lg bg-ice px-3 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-ink-secondary">Combined GWP</span>
            <span className="text-[12.5px] font-semibold tabular-nums text-navy-deep">
              ₹{Math.round(model.totalPremium).toLocaleString('en-IN')} Cr
            </span>
          </div>
          <div className="mt-1.5 flex justify-end">
            <CardSource />
          </div>
        </div>

        {/* Card 3 — Market Concentration (gauge) */}
        <div className="card-surface card-interactive flex min-h-[228px] flex-col p-4">
          <div className="flex items-center gap-1.5">
            <Network className="h-3.5 w-3.5 text-teal" />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal">Market Concentration</span>
          </div>
          <p className="mt-1 font-display text-[16px] leading-tight" style={{ color: bandColor(concentration.band) }}>
            {concentration.bandLabel}
          </p>
          <RadialGauge value={concentration.hhi} display={concentration.hhi.toFixed(2)} caption="HHI · 0–1" band={concentration.band} />
          <p className="-mt-1 text-center text-[11px] text-ink-secondary">
            Top 3 players control <span className="font-semibold text-navy-deep">{concentration.top3Share.toFixed(1)}%</span> of the pool.
          </p>
          <p className="mt-1 text-center text-[9px] text-ink-secondary/80">Low &lt; 0.10 · Moderate 0.10–0.25 · High &gt; 0.25</p>
          <div className="mt-auto flex justify-end pt-1">
            <CardSource />
          </div>
        </div>
      </section>

      {/* ── Peer landscape header + wide bubble/ranking row ──────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-0.5 flex items-center gap-2">
              <span className="h-3 w-[3px] rounded-full bg-champagne" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Peer Landscape</span>
            </div>
            <div className="flex items-baseline gap-2.5">
              <h2 className="font-display text-[21px] leading-tight text-navy-deep">{model.metric.title}</h2>
              <span className="text-[11px] text-ink-secondary">{FY} · {model.groupLabel}</span>
            </div>
          </div>
          <MetricToggle value={metricId} onChange={setMetricId} />
        </div>

        {/* One full-width card: bubble market map (Market Share) or a ranked
            horizontal bar board (Premium / Settlement / Renewal / Retention). */}
        <div className="card-surface flex min-h-[440px] w-full min-w-0 flex-col p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <LeftIcon className="h-4 w-4 text-navy-primary" />
              <p className="font-display text-[14px] text-navy-deep">{leftTitle}</p>
            </div>
            <span className="text-[10.5px] text-ink-secondary">{leftCaption}</span>
          </div>

          {isBubble ? (
            <>
              <MarketBubbleChart model={model} height={360} />
              {/* Color legend (bubble only — bars label themselves) */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                {model.byShare.map((r, i) => (
                  <span key={r.id} className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-secondary">
                    <span className="h-2 w-2 rounded-full" style={{ background: companyColor(r.id, r.focal, i) }} />
                    {r.shortName}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <MetricRankingBars model={model} />
          )}

          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            <span className="text-[9px] text-ink-secondary/80">
              <span className="font-semibold text-navy-primary">Navy</span> = selected ·{' '}
              <span className="font-semibold text-champagne-deep">gold</span> = leader
            </span>
            <CardSource />
          </div>
        </div>
      </section>
    </div>
  )
}

function PageHeader({
  groupLabel,
  highlightName,
  period,
  annualBasisNote,
}: {
  groupLabel: string
  highlightName?: string
  period: string
  annualBasisNote: boolean
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div>
        <h1 className="font-display text-[25px] leading-tight text-navy-deep sm:text-[27px]">Industry Overview</h1>
        <p className="mt-0.5 text-[12.5px] text-ink-secondary">
          Get a quick snapshot of standalone health insurers and market leadership.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-lg border border-soft-border bg-white/80 px-2.5 py-1 text-[11px] font-medium text-navy-deep shadow-soft">
          {groupLabel}
        </span>
        {highlightName && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-[#D6E2FA] bg-white/80 px-2.5 py-1 text-[11px] shadow-soft">
            <span className="text-ink-secondary">Highlighting</span>
            <span className="font-semibold text-navy-primary">{highlightName}</span>
          </span>
        )}
        <span
          className={[
            'inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-medium shadow-soft',
            annualBasisNote ? 'border border-[#F0E1BE] bg-[#FBF6EA] text-champagne-deep' : 'border border-[#BFE3E1] bg-teal-soft text-teal',
          ].join(' ')}
          title={annualBasisNote ? `Industry structure is reported annually — showing ${FY} regardless of the ${period} toggle.` : undefined}
        >
          {FY} · Annual basis
        </span>
        <span className="hidden items-center rounded-lg border border-soft-border bg-white/80 px-2.5 py-1 text-[11px] text-ink-secondary shadow-soft sm:inline-flex">
          Updated {DATA_FRESHNESS.lastUpdated}
        </span>
      </div>
    </header>
  )
}
