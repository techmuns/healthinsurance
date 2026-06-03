// Data-first peer ranking TABLE for Premium / Settlement / Renewal / Retention.
// A clean institutional table — every company readable across fixed columns:
// rank · insurer · type · premium · the selected metric (number-primary, with a
// micro-bar) · the metric rank · difference vs the metric leader · data status.
// Sorted by the selected metric; the focal company row is softly navy-tinted and
// the metric leader carries a small gold "Leader" pill. Numbers right-aligned.

import { Lock } from 'lucide-react'
import { companyColor, type OverviewModel } from '@/lib/industryOverview'
import { useFilters } from '@/state/filters'

const cr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')} Cr`

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

const NAVY = '#27457E'
const GOLD = '#B68B3A'

/** Difference vs the metric leader — pp for ratios, ₹ Cr for premium. */
function fmtDiff(diff: number, unit: '%' | '₹ Cr'): string {
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : ''
  const a = Math.abs(diff)
  if (unit === '%') return `${sign}${a % 1 === 0 ? a.toFixed(0) : a.toFixed(1)} pp`
  return `${sign}₹${Math.round(a).toLocaleString('en-IN')} Cr`
}

export function MetricRankingBars({ model }: { model: OverviewModel }) {
  const { metric, rows } = model
  const ranked = rows.filter((r) => r.metricAvailable)
  const isPremium = metric.id === 'premium'
  const isMock = useFilters().dataset === 'mock'

  // Micro-bar framing: premium zero-based; clustered ratios framed below the
  // lowest value so the spread still reads while the number stays primary.
  const vals = ranked.map((r) => r.metricValue)
  const max = Math.max(...vals, 1)
  const min = Math.min(...vals, 0)
  const span = max - min || 1
  const axisMin = isPremium ? 0 : Math.max(0, min - span * 0.65)
  const axisMax = isPremium ? max : max + span * 0.15

  const colorIdx = new Map(model.byShare.map((r, i) => [r.id, i]))
  const leaderValue = ranked[0]?.metricValue ?? 0
  const metricHead = metric.unit === '%' ? `${metric.label} %` : metric.label

  if (ranked.length === 0) {
    return <div className="flex flex-1 items-center justify-center text-[12px] text-ink-secondary">Data not available</div>
  }

  return (
    <div className="flex flex-1 flex-col overflow-x-auto">
      <table className="w-full min-w-[600px] border-collapse text-[11.5px]">
        <thead>
          <tr className="bg-[#F4F7FC] text-[9px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
            <th className="rounded-l-lg px-2 py-2 text-center font-semibold">#</th>
            <th className="px-2 py-2 text-left font-semibold">Insurer</th>
            <th className="px-2 py-2 text-left font-semibold">Type</th>
            <th className="px-2 py-2 text-right font-semibold">Premium</th>
            <th className="px-2 py-2 text-right font-semibold">{metricHead}</th>
            <th className="px-2 py-2 text-center font-semibold">Rank</th>
            <th className="px-2 py-2 text-right font-semibold">vs Leader</th>
            <th className="rounded-r-lg px-2 py-2 text-center font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => {
            const isLeader = r.rank === 1
            const color = companyColor(r.id, r.focal, colorIdx.get(r.id) ?? 0)
            const frac = Math.max(0.04, (r.metricValue - axisMin) / (axisMax - axisMin))
            const diff = r.metricValue - leaderValue
            const rowBg = r.focal ? hexA(NAVY, 0.06) : isLeader ? hexA(GOLD, 0.045) : undefined
            return (
              <tr
                key={r.id}
                className="border-b border-soft-border/60 transition-colors last:border-0 hover:bg-ice/50"
                style={rowBg ? { background: rowBg } : undefined}
              >
                {/* Rank */}
                <td className="px-2 py-2.5 text-center align-middle">
                  <span className="font-display text-[13px] font-semibold tabular-nums text-navy-deep">{r.rank}</span>
                </td>

                {/* Insurer (+ leader / selected pill) */}
                <td className="px-2 py-2.5 align-middle">
                  <div className="flex items-center gap-1.5">
                    <span className={`truncate text-[12.5px] font-semibold ${r.focal ? 'text-navy-deep' : 'text-ink-primary'}`}>{r.shortName}</span>
                    {isLeader && (
                      <span className="shrink-0 rounded-full bg-champagne-soft px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-champagne-deep">Leader</span>
                    )}
                    {r.focal && !isLeader && (
                      <span className="shrink-0 rounded-full bg-soft-blue px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-navy-primary">Selected</span>
                    )}
                  </div>
                </td>

                {/* Type / status */}
                <td className="px-2 py-2.5 align-middle text-[10.5px] text-ink-secondary">{r.listed ? 'Listed' : 'Unlisted'}</td>

                {/* Premium (always) */}
                <td className="px-2 py-2.5 text-right align-middle tabular-nums text-ink-secondary">
                  {r.premiumAvailable ? cr(r.premium) : 'n/a'}
                </td>

                {/* Selected metric — number primary + a small micro-bar */}
                <td className="px-2 py-2.5 text-right align-middle">
                  <div className="font-display text-[13.5px] font-semibold tabular-nums text-navy-deep">{metric.format(r.metricValue)}</div>
                  <div className="ml-auto mt-1 h-1 w-14 overflow-hidden rounded-full bg-ice">
                    <div className="h-full rounded-full" style={{ width: `${Math.round(frac * 100)}%`, background: color }} />
                  </div>
                </td>

                {/* Metric rank */}
                <td className="px-2 py-2.5 text-center align-middle">
                  <span className="text-[11px] font-semibold tabular-nums text-ink-secondary">#{r.rank}</span>
                </td>

                {/* Difference vs leader */}
                <td className="px-2 py-2.5 text-right align-middle">
                  {isLeader ? (
                    <span className="inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide" style={{ background: hexA(GOLD, 0.12), color: '#8A6516' }}>
                      Leader
                    </span>
                  ) : (
                    <span className="text-[11.5px] font-medium tabular-nums text-coral">{fmtDiff(diff, metric.unit)}</span>
                  )}
                </td>

                {/* Data status */}
                <td className="px-2 py-2.5 text-center align-middle">
                  <StatusPill available={r.metricAvailable} mock={isMock} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function StatusPill({ available, mock }: { available: boolean; mock: boolean }) {
  if (!available) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ice px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-secondary ring-1 ring-soft-border">
        <Lock className="h-2.5 w-2.5 text-champagne-deep" />
        Locked
      </span>
    )
  }
  if (mock) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide" style={{ background: hexA(GOLD, 0.12), color: '#8A6516' }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} />
        Illustrative
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-teal ring-1 ring-[#CFE3DA]">
      <span className="h-1.5 w-1.5 rounded-full bg-teal" />
      Official
    </span>
  )
}
