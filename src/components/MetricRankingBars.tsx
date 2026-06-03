// Ranked horizontal bars for the quality ratios (settlement / renewal /
// retention). These cluster in a narrow band (≈80–99%), so a bubble map would
// pile up — a clean high→low ranking reads far better. Bars are framed to a
// data-fitted range so differences are visible, but the exact value is always
// printed on the right so nothing is overstated. Premium rides along as small
// secondary text, never as an axis.

import { companyColor, type OverviewModel } from '@/lib/industryOverview'

const cr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')} Cr`

const rankBadge = (focal: boolean, leader: boolean) =>
  focal
    ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white ring-1 ring-[#1B3260]'
    : leader
      ? 'bg-gradient-to-br from-champagne to-champagne-deep text-white ring-1 ring-[#EAD9B6]'
      : 'bg-ice text-ink-secondary ring-1 ring-soft-border'

export function MetricRankingBars({ model }: { model: OverviewModel }) {
  const { metric, rows } = model
  const ranked = rows.filter((r) => r.metricAvailable)
  const vals = ranked.map((r) => r.metricValue)
  const max = Math.max(...vals, 1)
  const min = Math.min(...vals, 0)
  const span = max - min || 1
  // Frame the bars just below the lowest value so the ranking spread is legible
  // without distorting it; the printed number carries the precise reading.
  const axisMin = Math.max(0, min - span * 0.65)
  const axisMax = max + span * 0.15
  const colorIdx = new Map(model.byShare.map((r, i) => [r.id, i]))

  if (ranked.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-[12px] text-ink-secondary">Data not available</div>
    )
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-2 py-1">
      {ranked.map((r) => {
        const color = companyColor(r.id, r.focal, colorIdx.get(r.id) ?? 0)
        const frac = Math.max(0.06, (r.metricValue - axisMin) / (axisMax - axisMin))
        return (
          <div
            key={r.id}
            className={`flex items-center gap-3 rounded-xl px-2 py-1.5 transition-all duration-200 ${r.focal ? 'focal-mark' : ''}`}
          >
            {/* Rank */}
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold shadow-soft ${rankBadge(r.focal, r.isLeader)}`}>
              {r.rank}
            </span>

            {/* Company + premium secondary */}
            <div className="w-[112px] shrink-0">
              <div className="flex items-center gap-1.5">
                <span className={`truncate text-[12px] font-semibold ${r.focal ? 'text-navy-deep' : 'text-ink-primary'}`}>{r.shortName}</span>
                {r.isLeader && (
                  <span className="shrink-0 rounded-full bg-champagne-soft px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-champagne-deep">
                    Leader
                  </span>
                )}
                {r.focal && !r.isLeader && (
                  <span className="shrink-0 rounded-full bg-soft-blue px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-navy-primary">
                    You
                  </span>
                )}
              </div>
              <div className="truncate text-[9.5px] tabular-nums text-ink-secondary">{r.premiumAvailable ? cr(r.premium) : 'Premium n/a'}</div>
            </div>

            {/* Bar */}
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-ice">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round(frac * 100)}%`,
                  background: color,
                  boxShadow: r.focal ? 'inset 0 0 0 1.5px rgba(39,69,126,0.55)' : r.isLeader ? 'inset 0 0 0 1.5px rgba(182,139,58,0.55)' : 'none',
                }}
              />
            </div>

            {/* Value */}
            <span className="w-[52px] shrink-0 text-right text-[13px] font-semibold tabular-nums text-navy-deep">{metric.format(r.metricValue)}</span>
          </div>
        )
      })}
    </div>
  )
}
