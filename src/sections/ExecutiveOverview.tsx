import { useState } from 'react'
import { Building2, CircleDot, Layers, Lightbulb, ListOrdered, Network, Percent, Shield } from 'lucide-react'
import { RadialGauge } from '@/components/RadialGauge'
import { MarketBubbleChart } from '@/components/MarketBubbleChart'
import { IndustryRankTable } from '@/components/IndustryRankTable'
import { SourceTag } from '@/components/SourceTag'
import { DataEmptyState } from '@/components/DataEmptyState'
import {
  getIndustryOverview,
  OVERVIEW_METRICS,
  companyColor,
  type OverviewMetricId,
  type Insight,
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

const INSIGHT_TONE: Record<Insight['kind'], { dot: string; chip: string; label: string }> = {
  leader: { dot: '#B68B3A', chip: 'text-champagne-deep', label: 'Market leader' },
  selected: { dot: '#27457E', chip: 'text-navy-primary', label: 'Selected company' },
  concentration: { dot: '#168E8E', chip: 'text-teal', label: 'Concentration' },
  implication: { dot: '#3D5F9F', chip: 'text-muted-blue', label: 'Implication' },
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
    <div className="surface-soft rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-ink-secondary">
        <span className="text-navy-primary/70">{icon}</span>
        <span className="text-[9.5px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1 font-display text-[20px] leading-none text-navy-deep">{value}</div>
      <div className="mt-1 text-[10px] text-ink-secondary">{sub}</div>
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

  // Guard: empty pool (shouldn't happen with the seeded universe).
  if (!leader || model.count === 0) {
    return (
      <div className="space-y-5">
        <PageHeader groupLabel={model.groupLabel} highlightName={highlighted?.shortName} period={period} annualBasisNote={annualBasisNote} />
        <DataEmptyState kind="pending" title="No insurers in this pool" body="Switch the Peer Group above to see the industry overview." height={280} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader groupLabel={model.groupLabel} highlightName={highlighted?.shortName} period={period} annualBasisNote={annualBasisNote} />

      {/* ── Top row: Leader · Snapshot · Concentration ───────────────────── */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Card 1 — Market Leader (gold accent) */}
        <div
          className="relative overflow-hidden rounded-[1.15rem] border p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5"
          style={{ borderColor: '#E6D2A2', background: 'linear-gradient(135deg, #FFFFFF 0%, #FBF6EA 100%)' }}
        >
          <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-champagne to-champagne-deep" />
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-champagne" />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-champagne-deep">Market Leader</span>
          </div>
          <h2 className="mt-2 font-display text-[23px] leading-tight text-navy-deep">{leader.name}</h2>
          <p className="text-[11px] text-ink-secondary">{leader.listed ? `${leader.ticker} · Listed` : 'Unlisted'}</p>

          <div className="mt-3 flex items-end gap-5">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-ink-secondary">Market share</p>
              <p className="font-display text-[28px] leading-none text-champagne-deep">{leader.share.toFixed(1)}%</p>
            </div>
            {runnerUp && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-ink-secondary">Lead over #2</p>
                <p className="font-display text-[20px] leading-none text-navy-deep">+{model.leadGap.toFixed(1)} pp</p>
                <p className="mt-0.5 text-[10px] text-ink-secondary">ahead of {runnerUp.shortName}</p>
              </div>
            )}
          </div>

          {highlighted && (
            <div className="mt-3 rounded-lg border border-[#D6E2FA] bg-white/70 px-3 py-2 text-[11.5px]">
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

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[9.5px] text-ink-secondary/80">GWP — premium metric, not profit</span>
            <CardSource />
          </div>
        </div>

        {/* Card 2 — Industry Snapshot (2×2 tiles) */}
        <div className="card-surface card-interactive p-4">
          <div className="mb-2.5 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-navy-primary" />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-navy-primary">Industry Snapshot</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
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
          <div className="mt-2.5 flex items-center justify-between rounded-lg bg-ice px-3 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-ink-secondary">Combined GWP</span>
            <span className="text-[12.5px] font-semibold tabular-nums text-navy-deep">
              ₹{Math.round(model.totalPremium).toLocaleString('en-IN')} Cr
            </span>
          </div>
          <div className="mt-2 flex justify-end">
            <CardSource />
          </div>
        </div>

        {/* Card 3 — Market Concentration (gauge) */}
        <div className="card-surface card-interactive p-4">
          <div className="mb-1 flex items-center gap-1.5">
            <Network className="h-3.5 w-3.5 text-teal" />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal">Market Concentration</span>
          </div>
          <p className="font-display text-[17px] leading-tight" style={{ color: INSIGHT_TONE.concentration.dot }}>
            {concentration.bandLabel}
          </p>
          <RadialGauge value={concentration.hhi} display={concentration.hhi.toFixed(2)} caption="HHI · 0–1" band={concentration.band} />
          <p className="-mt-1 text-center text-[11.5px] text-ink-secondary">
            Top 3 players control <span className="font-semibold text-navy-deep">{concentration.top3Share.toFixed(1)}%</span> of the pool.
          </p>
          <p className="mt-2 text-center text-[9.5px] text-ink-secondary/80">Low &lt; 0.10 · Moderate 0.10–0.25 · High &gt; 0.25</p>
          <div className="mt-1.5 flex justify-end">
            <CardSource />
          </div>
        </div>
      </section>

      {/* ── Middle row: Bubble map + Ranking ──────────────────────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="h-3 w-[3px] rounded-full bg-champagne" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Peer Landscape</span>
            </div>
            <div className="flex items-baseline gap-2.5">
              <h2 className="font-display text-[22px] leading-tight text-navy-deep">Market Share Overview</h2>
              <span className="text-[11px] text-ink-secondary">{FY} · {model.groupLabel}</span>
            </div>
          </div>
          <MetricToggle value={metricId} onChange={setMetricId} />
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Bubble map */}
          <div className="card-surface p-4 lg:col-span-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <CircleDot className="h-4 w-4 text-navy-primary" />
                <p className="font-display text-[14px] text-navy-deep">Market Map</p>
              </div>
              <span className="text-[10.5px] text-ink-secondary">Bubble size = market share</span>
            </div>
            <MarketBubbleChart model={model} />
            {/* Color legend */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {model.byShare.map((r, i) => (
                <span key={r.id} className="inline-flex items-center gap-1 text-[10px] text-ink-secondary">
                  <span className="h-2 w-2 rounded-full" style={{ background: companyColor(r.id, r.focal, i) }} />
                  {r.shortName}
                </span>
              ))}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[9.5px] text-ink-secondary/80">
                <span className="font-semibold text-navy-primary">Navy glow</span> = selected ·{' '}
                <span className="font-semibold text-champagne-deep">gold ring</span> = leader
              </span>
              <CardSource />
            </div>
          </div>

          {/* Ranking table */}
          <div className="card-surface p-4 lg:col-span-2">
            <div className="mb-2 flex items-center gap-1.5">
              <ListOrdered className="h-4 w-4 text-navy-primary" />
              <p className="font-display text-[14px] text-navy-deep">Top Players · {model.metric.label}</p>
            </div>
            <IndustryRankTable model={model} />
            <div className="mt-2 flex justify-end">
              <CardSource />
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom: Key Insights strip ────────────────────────────────────── */}
      <section
        className="card-surface relative overflow-hidden p-4"
        style={{ background: 'linear-gradient(135deg, #FFFFFF 0%, #F6F9FD 100%)' }}
      >
        <div className="mb-3 flex items-center gap-1.5">
          <Lightbulb className="h-4 w-4 text-champagne-deep" />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-navy-deep">Key Insights</span>
        </div>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {model.insights.map((ins) => {
            const tone = INSIGHT_TONE[ins.kind]
            return (
              <div key={ins.id} className="flex gap-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: tone.dot }} />
                <div>
                  <p className={`text-[9.5px] font-bold uppercase tracking-wide ${tone.chip}`}>{tone.label}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-primary">{ins.text}</p>
                </div>
              </div>
            )
          })}
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
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-[27px] leading-tight text-navy-deep sm:text-[30px]">Industry Overview</h1>
        <p className="mt-1 text-[13px] text-ink-secondary">
          Get a quick snapshot of standalone health insurers and market leadership.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-soft-border bg-white/80 px-3 py-1.5 text-[11.5px] font-medium text-navy-deep shadow-soft">
          {groupLabel}
        </span>
        {highlightName && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6E2FA] bg-white/80 px-3 py-1.5 text-[11.5px] shadow-soft">
            <span className="text-ink-secondary">Highlighting</span>
            <span className="font-semibold text-navy-primary">{highlightName}</span>
          </span>
        )}
        <span
          className={[
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-medium shadow-soft',
            annualBasisNote ? 'border border-[#F0E1BE] bg-[#FBF6EA] text-champagne-deep' : 'border border-[#BFE3E1] bg-teal-soft text-teal',
          ].join(' ')}
          title={annualBasisNote ? `Industry structure is reported annually — showing ${FY} regardless of the ${period} toggle.` : undefined}
        >
          {FY} · Annual basis
        </span>
        <span className="hidden items-center gap-1.5 rounded-lg border border-soft-border bg-white/80 px-3 py-1.5 text-[11.5px] text-ink-secondary shadow-soft sm:inline-flex">
          Updated {DATA_FRESHNESS.lastUpdated}
        </span>
      </div>
    </header>
  )
}
