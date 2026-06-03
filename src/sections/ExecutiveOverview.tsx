import { useState } from 'react'
import { BadgeCheck, BarChart3, Building2, CircleDot, Clock, Info, Layers, Network, Percent, Shield, ShieldCheck } from 'lucide-react'
import { RadialGauge } from '@/components/RadialGauge'
import { MarketBubbleChart } from '@/components/MarketBubbleChart'
import { MetricRankingBars } from '@/components/MetricRankingBars'
import { AboutView } from '@/components/AboutView'
import { SignalBadge } from '@/components/SignalBadge'
import { HeaderRibbonArt } from '@/components/HeaderRibbonArt'
import { SourceTag } from '@/components/SourceTag'
import { DataEmptyState } from '@/components/DataEmptyState'
import {
  getIndustryOverview,
  OVERVIEW_METRICS,
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
  // Market Share lives permanently in the left card, so the ranking toggle
  // only offers the bar-charted metrics.
  const rankingMetrics = OVERVIEW_METRICS.filter((m) => m.id !== 'share')
  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">View by</span>
      {rankingMetrics.map((m) => {
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

/** Tiny tone-coded micro-insight chip (embedded near a chart title). */
function InsightChip({ label, tone = 'slate' }: { label: string; tone?: 'slate' | 'teal' | 'gold' }) {
  const c =
    tone === 'teal'
      ? 'bg-teal-soft text-teal ring-[#BFE3E1]'
      : tone === 'gold'
        ? 'bg-champagne-soft text-champagne-deep ring-[#EAD9B6]'
        : 'bg-soft-blue text-navy-primary ring-[#D6E2FA]'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${c}`}>
      {label}
    </span>
  )
}

export function ExecutiveOverview() {
  const filters = useFilters()
  const { period } = filters
  const [metricId, setMetricId] = useState<OverviewMetricId>('premium')
  const model = getIndustryOverview(filters, metricId)
  const { leader, runnerUp, highlighted, concentration } = model
  const annualBasisNote = period !== 'Annual'
  // Rank-1 insurer on the currently-toggled metric — drives a quiet footer insight.
  const metricLeaderName = model.rows.find((r) => r.metricAvailable)?.shortName

  if (!leader || model.count === 0) {
    return (
      <div className="space-y-4">
        <HeroHeader highlightName={highlighted?.shortName} period={period} annualBasisNote={annualBasisNote} />
        <DataEmptyState kind="pending" title="No insurers in this pool" body="Switch the Peer Group above to see the industry overview." height={280} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <HeroHeader highlightName={highlighted?.shortName} period={period} annualBasisNote={annualBasisNote} />

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
            <div className="mt-auto rounded-lg border border-[#E6D2A2]/70 bg-white/60 px-2.5 py-1.5 text-[11px]">
              {highlighted.isLeader ? (
                <span className="text-navy-deep">
                  <span className="font-semibold">{highlighted.shortName}</span> is the market leader.
                </span>
              ) : (
                <span className="text-ink-secondary">
                  <span className="font-semibold text-navy-deep">{highlighted.shortName}</span> · #{highlighted.shareRank} ·{' '}
                  <span className="font-semibold text-navy-deep">{highlighted.share.toFixed(1)}%</span> · challenger cluster
                </span>
              )}
            </div>
          )}
        </div>

        {/* Card 2 — Industry Snapshot (2×2 tiles) */}
        <div className="card-surface card-tint-slate card-interactive flex min-h-[228px] flex-col p-4">
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
          <div
            className="mt-auto flex items-center justify-between rounded-lg bg-ice/80 px-3 py-1.5"
            title="Combined gross written premium — a premium metric, not profit."
          >
            <span className="text-[10px] font-medium uppercase tracking-wide text-ink-secondary">Combined GWP</span>
            <span className="text-[12.5px] font-semibold tabular-nums text-navy-deep">
              ₹{Math.round(model.totalPremium).toLocaleString('en-IN')} Cr
            </span>
          </div>
        </div>

        {/* Card 3 — Market Concentration (gauge) */}
        <div className="card-surface card-tint-teal card-interactive flex min-h-[228px] flex-col p-4">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5 text-teal" />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal">Market Concentration</span>
            </div>
            <span
              className="cursor-default text-ink-secondary/70"
              title="HHI on a 0–1 scale · Low < 0.10 · Moderate 0.10–0.25 · High > 0.25"
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-1 font-display text-[16px] leading-tight" style={{ color: bandColor(concentration.band) }}>
            {concentration.bandLabel}
          </p>
          <RadialGauge value={concentration.hhi} display={concentration.hhi.toFixed(2)} caption="HHI · 0–1" band={concentration.band} />
          <p className="mt-auto text-center text-[10.5px] text-ink-secondary">
            Top 3 hold <span className="font-semibold text-navy-deep">{concentration.top3Share.toFixed(1)}%</span> of the pool
          </p>
        </div>
      </section>

      {/* One compact source row for the whole snapshot strip */}
      <div className="-mt-1 flex justify-end">
        <CardSource />
      </div>

      {/* ── Peer landscape: Market Share map (left, constant) + metric
            rankings (right, toggled) ───────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className="h-3 w-[3px] rounded-full bg-champagne" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Peer Landscape</span>
          <span className="text-[11px] text-ink-secondary">{FY} · {model.groupLabel}</span>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-stretch">
          {/* LEFT — Market Share map. Always visible; never changes with the
              ranking toggle (it reads market share straight from the model). */}
          <div className="card-surface flex min-h-[440px] min-w-0 flex-col p-4 sm:p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <CircleDot className="h-4 w-4 text-navy-primary" />
                <p className="font-display text-[14px] text-navy-deep">Market Share Map</p>
                <span
                  className="cursor-default text-ink-secondary/60"
                  title="Circle size = market share. Navy ring = selected · gold ring = leader. Hover a circle for share & premium."
                >
                  <Info className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <InsightChip tone="slate" label={`Top 3 · ${concentration.top3Share.toFixed(1)}%`} />
                {highlighted && !highlighted.isLeader && (
                  <InsightChip tone="slate" label={`${highlighted.shortName} #${highlighted.shareRank}`} />
                )}
                {runnerUp && <InsightChip tone="gold" label={`Lead +${model.leadGap.toFixed(1)} pp`} />}
              </div>
            </div>

            <MarketBubbleChart model={model} height={360} />

            <div className="mt-auto flex justify-end pt-2">
              <CardSource />
            </div>
          </div>

          {/* RIGHT — ranked board for the toggled metric (Premium / Settlement
              / Renewal / Retention). The toggle lives in this card's header. */}
          <div className="card-surface flex min-h-[440px] min-w-0 flex-col p-4 sm:p-5">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-navy-primary" />
                <p className="font-display text-[14px] text-navy-deep">{model.metric.label} Ranking</p>
                <span
                  className="cursor-default text-ink-secondary/60"
                  title="Ranked high → low. Navy = selected · gold = leader. Secondary value shown per row."
                >
                  <Info className="h-3.5 w-3.5" />
                </span>
              </div>
              <MetricToggle value={metricId} onChange={setMetricId} />
            </div>

            <MetricRankingBars model={model} />

            <div className="mt-auto flex items-center justify-between gap-2 pt-2">
              {metricLeaderName && (
                <span className="text-[10px] text-ink-secondary">
                  <span className="font-semibold text-navy-deep">{metricLeaderName}</span> leads on {model.metric.label.toLowerCase()}
                </span>
              )}
              <CardSource />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

// Compact, filter-aware hero — layered navy → champagne backdrop with the
// petal end-cap art, the highlighted-company chip, and the data-status chips.
function HeroHeader({
  highlightName,
  period,
  annualBasisNote,
}: {
  highlightName?: string
  period: string
  annualBasisNote: boolean
}) {
  return (
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
        <AboutView text="Standalone health insurers vs the selected peer group — market leadership, premium and quality rankings on an FY25 annual basis." />
      </div>

      {/* Left content */}
      <div className="relative z-10 max-w-2xl">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <SignalBadge label="Industry Overview" tone="navy" size="sm" />
          {highlightName && (
            <span className="text-[11px] font-medium text-ink-secondary">
              · <span className="font-semibold text-champagne">{highlightName}</span> highlighted
            </span>
          )}
        </div>
        <h1 className="font-display text-[27px] leading-[1.1] text-navy-deep sm:text-[31px]">
          Insurance Investment Dashboard
        </h1>
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-secondary">
          Who leads, who&rsquo;s improving, and where risk is building.
        </p>
      </div>

      {/* Status chips — float lower-right on desktop, flow under title on mobile */}
      <div className="relative z-20 mt-5 flex flex-wrap gap-2.5 sm:absolute sm:bottom-6 sm:right-6 sm:mt-0">
        <div className="flex items-center gap-1.5 rounded-lg border border-[#D6E2FA] bg-white/85 px-3 py-1.5 text-[12px] shadow-soft backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5">
          <Clock className="h-3.5 w-3.5 text-navy-primary" />
          <span className="text-ink-secondary">Updated</span>
          <span className="font-semibold text-navy-deep">{DATA_FRESHNESS.lastUpdated}</span>
        </div>
        {annualBasisNote ? (
          <div
            className="flex items-center gap-1.5 rounded-lg border border-[#F0E1BE] bg-[#FBF6EA] px-3 py-1.5 text-[12px] shadow-soft backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5"
            title={`Industry structure is reported annually — showing ${FY} regardless of the ${period} toggle.`}
          >
            <Clock className="h-3.5 w-3.5 text-champagne-deep" />
            <span className="font-semibold text-champagne-deep">{FY} · annual basis</span>
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
  )
}
