import { useState } from 'react'
import { ModuleCard } from '@/components/ModuleCard'
import { SegmentedControl } from '@/components/SegmentedControl'
import { InsightBox } from '@/components/InsightBox'
import { ChartFrame, HorizontalBarChart } from '@/components/charts'
import { BestInColumnLegend } from '@/components/LeaderDot'
import { PeerRankingTable } from '@/components/PeerRankingTable'
import { PeerScorecard } from '@/components/PeerScorecard'
import { Heatmap } from '@/components/Heatmap'
import { SectionHeading } from '@/components/SectionHeading'
import { PEER_GROUP_LABEL, insurers, peerRows } from '@/data/mockData'
import { getPeerScorecardData } from '@/lib/insurers'
import { getCompanySignals, getQuarterlyReview, getScorecardSummary } from '@/lib/review'
import { useActiveCompany, useFilters } from '@/state/filters'
import type { PeerGroup } from '@/data/types'

type View = 'Scorecard' | 'Ranking' | 'Table'
type RankMetric = 'GWP Growth' | 'Market Share' | 'Solvency' | 'ROE' | 'Combined Ratio' | 'Valuation'

const groups: PeerGroup[] = ['SAHI', 'General', 'Life', 'All']

const metricAccessor: Record<RankMetric, { key: keyof (typeof peerRows)[number]; invert?: boolean; unit?: string }> = {
  'GWP Growth': { key: 'gwpGrowth', unit: '%' },
  'Market Share': { key: 'marketShareChange', unit: 'pp' },
  Solvency: { key: 'solvency', unit: 'x' },
  ROE: { key: 'roe', unit: '%' },
  'Combined Ratio': { key: 'combinedRatio', invert: true, unit: '%' },
  Valuation: { key: 'valuation', invert: true, unit: 'x' },
}

export function CompetitivePositioning() {
  const [view, setView] = useState<View>('Scorecard')
  const [group, setGroup] = useState<PeerGroup>('SAHI')
  const [metric, setMetric] = useState<RankMetric>('GWP Growth')
  const filters = useFilters()
  const active = useActiveCompany()

  // Filter-aware peer scorecard heatmap (moved from Executive Overview).
  const heatmapData = getPeerScorecardData(filters)
  const s = heatmapData.summary

  const rows = peerRows
    .filter((r) => group === 'All' || r.peerGroup === group)
    .map((r) => ({ ...r, focal: r.ticker === active.ticker }))

  // Insurer-typed list for the scorecard; falls back to the company's own group.
  const scorecardList = group === 'All' ? insurers : insurers.filter((i) => i.peerGroup === group)
  const inGroup = scorecardList.some((i) => i.id === active.id)
  const signalList = inGroup ? scorecardList : insurers.filter((i) => i.peerGroup === active.peerGroup)
  const summary = getScorecardSummary(active, signalList)
  const signals = getCompanySignals(active, signalList)
  const review = getQuarterlyReview(active.id)

  const acc = metricAccessor[metric]
  const rankingData = rows
    .filter((r) => !(acc.key === 'combinedRatio' && r.combinedRatio === 0))
    .map((r) => ({ label: r.shortName, value: r[acc.key] as number, focal: r.focal }))
    .sort((a, b) => (acc.invert ? a.value - b.value : b.value - a.value))

  return (
    <div className="space-y-7">
    <ModuleCard
      question="Who is winning versus peers?"
      title="Peer Positioning"
      icon="peers"
      controls={
        <>
          <SegmentedControl<PeerGroup> label="Peers" options={groups} value={group} onChange={setGroup} size="sm" />
          <SegmentedControl<View> label="View" options={['Scorecard', 'Ranking', 'Table'] as View[]} value={view} onChange={setView} size="sm" />
          {view === 'Ranking' && (
            <SegmentedControl<RankMetric>
              label="Metric"
              options={['GWP Growth', 'Market Share', 'Solvency', 'ROE', 'Combined Ratio', 'Valuation'] as RankMetric[]}
              value={metric}
              onChange={setMetric}
              size="sm"
            />
          )}
        </>
      }
      insight={
        <InsightBox
          variant="panel"
          signal={signals.overall}
          lines={[
            { label: 'Signal', value: `${signals.overall} (${active.shortName})` },
            { label: 'Why', value: summary },
            { label: 'Peer rank', value: signals.peerRankSummary },
            { label: 'Next trigger', value: review?.nextTrigger ?? 'Whether peers close the gap.' },
          ]}
        />
      }
    >
      {view === 'Scorecard' && (
        <ChartFrame
          headline="Multi-metric peer scorecard"
          caption={`${group} peer group · value, rank and signal per metric · mock data`}
          height="auto"
          footnote={<BestInColumnLegend />}
        >
          <p className="mb-3 rounded-lg bg-ice/70 px-3 py-2 text-[12px] leading-relaxed text-ink-secondary">
            {summary}
          </p>
          <PeerScorecard list={scorecardList} focalId={active.id} />
        </ChartFrame>
      )}
      {view === 'Ranking' && (
        <ChartFrame
          headline={`Peer leaderboard — ${metric}`}
          caption={`${group} peer group · mock data`}
          height="auto"
          footnote={<BestInColumnLegend />}
        >
          <HorizontalBarChart
            data={rankingData}
            unit={acc.unit}
            diverging={metric === 'Market Share'}
            leaderLabel={rankingData[0]?.label}
            height={Math.max(220, rankingData.length * 44)}
          />
        </ChartFrame>
      )}
      {view === 'Table' && (
        <ChartFrame headline="One peer table — sort any column to find the leader" caption={`${group} peer group · mock data`} height="auto">
          <PeerRankingTable rows={rows} />
        </ChartFrame>
      )}
    </ModuleCard>

      {/* Peer Scorecard heatmap — full width, self-explanatory (moved from Executive Overview) */}
      <section>
        <SectionHeading eyebrow="At a Glance" title="Peer Scorecard" note="Best-in-column highlighted · mock data" />
        <div className="card-surface card-interactive p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display text-[15px] text-navy-deep">Multi-metric snapshot</p>
            <BestInColumnLegend />
          </div>

          {/* Dynamic one-line takeaway */}
          <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">
            <span className="font-semibold text-navy-primary">{s.growthLeader.shortName}</span> leads growth at{' '}
            {s.growthLeader.growth.toFixed(1)}%
            {s.marginByCombined ? (
              <>
                , while <span className="font-semibold text-navy-primary">{s.marginLeader.shortName}</span> runs the
                tightest combined ratio at {s.marginLeader.combinedRatio.toFixed(1)}%
              </>
            ) : (
              <>
                , while <span className="font-semibold text-navy-primary">{s.marginLeader.shortName}</span> leads on ROE
                at {s.marginLeader.roe.toFixed(1)}%
              </>
            )}
            .{' '}
            {s.inGroup ? (
              <>
                <span className="font-semibold text-navy-deep">{s.highlighted.shortName}</span> ranks #{s.growthRank} of{' '}
                {s.count} on growth and #{s.marginRank} on {s.marginByCombined ? 'combined ratio' : 'ROE'}.
              </>
            ) : (
              <>
                <span className="font-semibold text-navy-deep">{s.highlighted.shortName}</span> sits outside this peer
                group ({PEER_GROUP_LABEL[s.highlighted.peerGroup].toLowerCase()}).
              </>
            )}
          </p>

          {/* Reading guide */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-ice/70 px-3 py-2 text-[10.5px] text-ink-secondary">
            <span className="font-semibold text-navy-deep">How to read:</span>
            <span>
              <span className="font-semibold text-emerald">Green</span> stronger ·{' '}
              <span className="font-semibold text-coral">red</span> weaker
            </span>
            <span>·</span>
            <span>Growth &amp; Share Δ are YoY</span>
            <span>·</span>
            <span>Combined ratio: lower is better</span>
            <span>·</span>
            <span>Solvency: higher is safer</span>
            <span>·</span>
            <span>Valuation (P/GWP): lower is cheaper</span>
          </div>

          <div className="mt-3">
            <Heatmap
              markBest
              columns={[
                { key: 'gwpGrowth', label: 'Growth', format: (v) => `${v.toFixed(0)}%` },
                { key: 'marketShareChange', label: 'Share Δ', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} pp` },
                { key: 'combinedRatio', label: 'Combined Ratio', invert: true, format: (v) => `${v.toFixed(0)}%` },
                { key: 'solvency', label: 'Solvency', format: (v) => `${v.toFixed(2)}x` },
                { key: 'valuation', label: 'Valuation', invert: true, format: (v) => `${v.toFixed(1)}x` },
              ]}
              rows={heatmapData.rows.map((r) => ({
                label: r.label,
                focal: r.focal,
                values: {
                  gwpGrowth: r.values.growth,
                  marketShareChange: r.values.marketShareChange,
                  combinedRatio: r.values.combinedRatio,
                  solvency: r.values.solvency,
                  valuation: r.values.valuation,
                },
              }))}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
