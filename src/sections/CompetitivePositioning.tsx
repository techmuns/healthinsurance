import { useState } from 'react'
import { ModuleCard } from '@/components/ModuleCard'
import { SegmentedControl } from '@/components/SegmentedControl'
import { InsightBox } from '@/components/InsightBox'
import { ChartFrame, HorizontalBarChart } from '@/components/charts'
import { Heatmap } from '@/components/Heatmap'
import { PeerRankingTable } from '@/components/PeerRankingTable'
import { peerRows } from '@/data/mockData'
import type { PeerGroup } from '@/data/types'

type View = 'Ranking' | 'Table' | 'Heatmap'
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
  const [view, setView] = useState<View>('Ranking')
  const [group, setGroup] = useState<PeerGroup>('SAHI')
  const [metric, setMetric] = useState<RankMetric>('GWP Growth')

  const rows = peerRows.filter((r) => group === 'All' || r.peerGroup === group)

  const acc = metricAccessor[metric]
  const rankingData = rows
    .filter((r) => !(acc.key === 'combinedRatio' && r.combinedRatio === 0))
    .map((r) => ({ label: r.company.replace(' Insurance', ''), value: r[acc.key] as number, focal: r.focal }))
    .sort((a, b) => (acc.invert ? a.value - b.value : b.value - a.value))

  return (
    <ModuleCard
      question="Who is winning versus peers?"
      title="Peer Positioning"
      icon="peers"
      controls={
        <>
          <SegmentedControl<PeerGroup> label="Peers" options={groups} value={group} onChange={setGroup} size="sm" />
          <SegmentedControl<View> label="View" options={['Ranking', 'Table', 'Heatmap'] as View[]} value={view} onChange={setView} size="sm" />
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
          signal="Strong"
          lines={[
            { label: 'Signal', value: 'Strong (focal name)' },
            { label: 'Why', value: 'Aurora leads on growth, ROE and share gain while holding underwriting discipline.' },
            { label: 'Implication', value: 'Best-positioned within the SAHI peer set.' },
            { label: 'Next trigger', value: 'Whether peers close the combined-ratio gap.' },
          ]}
        />
      }
    >
      {view === 'Ranking' && (
        <ChartFrame headline={`Peer leaderboard — ${metric}`} caption={`${group} peer group · mock data`} height="auto">
          <HorizontalBarChart data={rankingData} unit={acc.unit} diverging={metric === 'Market Share'} height={Math.max(220, rankingData.length * 44)} />
        </ChartFrame>
      )}
      {view === 'Table' && (
        <ChartFrame headline="One peer table — sort any column to find the leader" caption={`${group} peer group · mock data`} height="auto">
          <PeerRankingTable rows={rows} />
        </ChartFrame>
      )}
      {view === 'Heatmap' && (
        <ChartFrame headline="Peer scorecard — green is better on each metric" caption={`${group} peer group · mock data`} height="auto">
          <Heatmap
            columns={[
              { key: 'gwpGrowth', label: 'Growth', format: (v) => `${v.toFixed(0)}%` },
              { key: 'marketShareChange', label: 'Share Δ', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
              { key: 'combinedRatio', label: 'Combined', invert: true, format: (v) => `${v.toFixed(0)}%` },
              { key: 'solvency', label: 'Solvency', format: (v) => `${v.toFixed(2)}x` },
              { key: 'roe', label: 'ROE', format: (v) => `${v.toFixed(0)}%` },
              { key: 'valuation', label: 'P/GWP', invert: true, format: (v) => `${v.toFixed(1)}x` },
            ]}
            rows={rows.map((r) => ({
              label: r.company.replace(' Insurance', ''),
              focal: r.focal,
              values: {
                gwpGrowth: r.gwpGrowth,
                marketShareChange: r.marketShareChange,
                combinedRatio: r.combinedRatio,
                solvency: r.solvency,
                roe: r.roe,
                valuation: r.valuation,
              },
            }))}
          />
        </ChartFrame>
      )}
    </ModuleCard>
  )
}
