import { BadgeCheck, BarChart3, CircleDot, Clock, Info, ShieldCheck } from 'lucide-react'
import { MarketBubbleChart } from '@/components/MarketBubbleChart'
import { MetricRankingTable, type MetricTableRow } from '@/components/MetricRankingBars'
import { IndustrySnapshotBand } from '@/components/IndustrySnapshotBand'
import { PoolShiftCard } from '@/sections/MarketDistribution'
import { AboutView } from '@/components/AboutView'
import { SignalBadge } from '@/components/SignalBadge'
import { HeaderRibbonArt } from '@/components/HeaderRibbonArt'
import { SourceTag } from '@/components/SourceTag'
import { DataEmptyState } from '@/components/DataEmptyState'
import {
  companyColor,
  getIndustryOverview,
  metricById,
  type OverviewMetricId,
} from '@/lib/industryOverview'
import { useFilters } from '@/state/filters'
import { DATA_FRESHNESS } from '@/data/mockData'

// All metrics shown as columns, left → right. Market Share first (also the row
// sort key), then the four operating/quality metrics.
const COL_METRIC_IDS: OverviewMetricId[] = ['share', 'premium', 'settlement', 'renewal', 'retention']

const FY = 'FY25'
const SOURCE_PROVENANCE = {
  source_name: 'Per-insurer FY25 GWP, market share & ratios from company annual reports & IRDAI public disclosures (see Company Performance for per-company source links).',
}

// Quiet, on-theme source chip reused across the cards.
function CardSource() {
  return <SourceTag source="IRDAI + Company filing" period={FY} confidence="high" provenance={SOURCE_PROVENANCE} />
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

export function ExecutiveOverview({ view = 'industry' }: { view?: 'industry' | 'sahi' }) {
  const filters = useFilters()
  const { period } = filters
  // One model per metric so every metric can be shown as its own column.
  const colMetrics = COL_METRIC_IDS.map(metricById)
  const colModels = new Map(COL_METRIC_IDS.map((id) => [id, getIndustryOverview(filters, id)]))
  const model = colModels.get('premium')!
  const { leader, runnerUp, highlighted, concentration } = model
  const annualBasisNote = period !== 'Annual'

  // ── Industry Insights — the clean industry homepage: hero + market-structure
  //    snapshot + premium-pool shift. No peer/company cards, no selectors. ────
  if (view === 'industry') {
    return (
      <div className="space-y-4">
        <HeroHeader period={period} annualBasisNote={annualBasisNote} />
        <IndustrySnapshotBand />
        {/* GI pool-shift trend — full width on its own row. The health-share
            charts that used to sit beside it now lead the SAHI Analysis block
            below (composed in IndustryInsightsPage). */}
        <PoolShiftCard />
      </div>
    )
  }

  // ── SAHI · Overview — peer landscape + the Market Trend Explorer. ─────────
  if (!leader || model.count === 0) {
    return (
      <DataEmptyState kind="pending" title="No insurers in this pool" body="Adjust the data range to see the SAHI overview." height={280} />
    )
  }

  // Build the table: rows = companies sorted by market share; each row carries
  // every metric's value, indexed by metric id, so the table needs no toggle.
  const valueByMetric = new Map<OverviewMetricId, Map<string, { value: number; available: boolean }>>(
    COL_METRIC_IDS.map((id) => [
      id,
      new Map(colModels.get(id)!.rows.map((r) => [r.id, { value: r.metricValue, available: r.metricAvailable }])),
    ]),
  )
  const tableRows: MetricTableRow[] = model.byShare.map((r, idx) => ({
    id: r.id,
    shortName: r.shortName,
    listed: r.listed,
    focal: r.focal,
    isLeader: r.isLeader,
    rank: r.shareRank,
    color: companyColor(r.id, r.focal, idx),
    cells: Object.fromEntries(
      COL_METRIC_IDS.map((id) => [id, valueByMetric.get(id)!.get(r.id) ?? { value: 0, available: false }]),
    ),
  }))

  return (
    <div className="space-y-4">
      {/* ── Peer landscape: Market Share map (left) + metric rankings (right) ─ */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className="h-3 w-[3px] rounded-full bg-champagne" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Company-Specific Analysis</span>
          <span className="text-[11px] text-ink-secondary">{FY} · {model.groupLabel}</span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-stretch">
          {/* LEFT — Market Share map (the visual side). */}
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

          {/* RIGHT — Peer metrics table (every metric a column, no toggle). */}
          <div className="card-surface flex min-h-[440px] min-w-0 flex-col p-4 sm:p-5">
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-navy-primary" />
              <p className="font-display text-[14px] text-navy-deep">Peer Metrics · {model.groupLabel}</p>
              <span
                className="cursor-default text-ink-secondary/60"
                title="Every metric as a column. Sorted by market share. Navy = selected · gold = leader · teal = best in column."
              >
                <Info className="h-3.5 w-3.5" />
              </span>
            </div>

            <MetricRankingTable metrics={colMetrics} rows={tableRows} />

            <div className="mt-3 flex justify-end pt-2">
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
