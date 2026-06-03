// Clean, premium ranking TABLE for Premium / Settlement / Renewal / Retention.
// Highest → lowest, one airy row per insurer: rank · name (+ listed/unlisted) ·
// a supporting reference value · the dominant metric value · a slim theme-
// coloured strength bar. Tone-coded to the dashboard: navy = selected company,
// champagne/gold = category leader, slate = the rest. Exact values are always
// printed so nothing is overstated.

import { companyColor, type OverviewModel } from '@/lib/industryOverview'

const cr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')} Cr`

/** hex (#rrggbb) + 0..1 alpha → rgba(). */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

const NAVY = '#27457E'
const GOLD = '#B68B3A'

const rankBadge = (focal: boolean, leader: boolean) =>
  focal
    ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white ring-1 ring-[#1B3260]'
    : leader
      ? 'bg-gradient-to-br from-champagne to-champagne-deep text-white ring-1 ring-[#EAD9B6]'
      : 'bg-ice text-ink-secondary ring-1 ring-soft-border'

export function MetricRankingBars({ model }: { model: OverviewModel }) {
  const { metric, rows } = model
  const ranked = rows.filter((r) => r.metricAvailable)
  const isPremium = metric.id === 'premium'

  const vals = ranked.map((r) => r.metricValue)
  const max = Math.max(...vals, 1)
  const min = Math.min(...vals, 0)
  const span = max - min || 1
  // Premium → zero-based; quality ratios → framed just below the lowest value.
  const axisMin = isPremium ? 0 : Math.max(0, min - span * 0.65)
  const axisMax = isPremium ? max : max + span * 0.15

  const colorIdx = new Map(model.byShare.map((r, i) => [r.id, i]))
  const refLabel = isPremium ? 'Market share' : 'Premium'

  if (ranked.length === 0) {
    return <div className="flex flex-1 items-center justify-center text-[12px] text-ink-secondary">Data not available</div>
  }

  return (
    <div className="flex flex-1 flex-col">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">
            <th className="w-9 border-b border-soft-border pb-2 text-center font-semibold">#</th>
            <th className="border-b border-soft-border pb-2 text-left font-semibold">Insurer</th>
            <th className="border-b border-soft-border pb-2 text-right font-semibold">{refLabel}</th>
            <th className="border-b border-soft-border pb-2 pl-3 text-right font-semibold">{metric.label}</th>
            <th className="w-[30%] border-b border-soft-border pb-2 pl-4 text-left font-semibold">Strength</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => {
            const color = companyColor(r.id, r.focal, colorIdx.get(r.id) ?? 0)
            const frac = Math.max(0.05, (r.metricValue - axisMin) / (axisMax - axisMin))
            const refVal = isPremium
              ? r.shareAvailable
                ? `${r.share.toFixed(1)}%`
                : 'n/a'
              : r.premiumAvailable
                ? cr(r.premium)
                : 'n/a'
            const rowBg = r.focal ? hexA(NAVY, 0.05) : r.isLeader ? hexA(GOLD, 0.045) : undefined
            return (
              <tr
                key={r.id}
                className="group border-b border-soft-border/60 transition-colors last:border-0 hover:bg-ice/50"
                style={rowBg ? { background: rowBg } : undefined}
              >
                {/* Rank */}
                <td className="py-3 text-center align-middle">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold shadow-soft ${rankBadge(r.focal, r.isLeader)}`}>
                    {r.rank}
                  </span>
                </td>

                {/* Insurer + listed/unlisted */}
                <td className="py-3 align-middle">
                  <div className="flex items-center gap-1.5">
                    <span className={`truncate text-[13px] font-semibold ${r.focal ? 'text-navy-deep' : 'text-ink-primary'}`}>{r.shortName}</span>
                    {r.isLeader && (
                      <span className="shrink-0 rounded-full bg-champagne-soft px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-champagne-deep">
                        Leader
                      </span>
                    )}
                    {r.focal && !r.isLeader && (
                      <span className="shrink-0 rounded-full bg-soft-blue px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-navy-primary">
                        Selected
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[9.5px] text-ink-secondary">{r.listed ? `${r.ticker} · Listed` : 'Unlisted'}</div>
                </td>

                {/* Reference value (supporting) */}
                <td className="py-3 text-right align-middle text-[11.5px] tabular-nums text-ink-secondary">{refVal}</td>

                {/* Selected metric value (dominant) */}
                <td className="whitespace-nowrap py-3 pl-3 text-right align-middle font-display text-[15px] font-semibold tabular-nums text-navy-deep">
                  {metric.format(r.metricValue)}
                </td>

                {/* Slim theme-coloured strength bar */}
                <td className="py-3 pl-4 align-middle">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-ice">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.round(frac * 100)}%`,
                        background: color,
                        boxShadow: r.focal
                          ? 'inset 0 0 0 1.5px rgba(39,69,126,0.5)'
                          : r.isLeader
                            ? 'inset 0 0 0 1.5px rgba(182,139,58,0.5)'
                            : 'none',
                      }}
                    />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
