// Full-width ranked board for Premium / Settlement / Renewal / Retention.
// Highest → lowest, one airy row per insurer: rank · name (+ listed/unlisted)
// · a supporting reference value · the dominant metric value · a long bar that
// fills the row. Premium bars are zero-based (premiums span widely); the
// clustered quality ratios are framed to a data-fitted range so the spread
// reads, with the exact value always printed so nothing is overstated.

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
      {/* Column header */}
      <div className="flex items-center gap-3 px-3 pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">
        <span className="w-7 shrink-0 text-center">#</span>
        <span className="w-[140px] shrink-0">Insurer</span>
        <span className="w-[70px] shrink-0 text-right">{refLabel}</span>
        <span className="w-[92px] shrink-0 text-right">{metric.label}</span>
        <span className="flex-1">{metric.label} ranking</span>
      </div>

      {/* Rows */}
      <div className="flex flex-1 flex-col justify-center gap-1.5">
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
          return (
            <div
              key={r.id}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200 ${r.focal ? 'focal-mark' : 'hover:bg-ice/60'}`}
            >
              {/* Rank */}
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold shadow-soft ${rankBadge(r.focal, r.isLeader)}`}>
                {r.rank}
              </span>

              {/* Insurer + listed/unlisted */}
              <div className="w-[140px] shrink-0">
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
              </div>

              {/* Reference value (supporting) */}
              <span className="w-[70px] shrink-0 text-right text-[11.5px] tabular-nums text-ink-secondary">{refVal}</span>

              {/* Selected metric value (dominant) */}
              <span className="w-[92px] shrink-0 whitespace-nowrap text-right text-[14px] font-semibold tabular-nums text-navy-deep">{metric.format(r.metricValue)}</span>

              {/* Bar (dominant, fills the row) */}
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-ice">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.round(frac * 100)}%`,
                    background: color,
                    boxShadow: r.focal
                      ? 'inset 0 0 0 1.5px rgba(39,69,126,0.55)'
                      : r.isLeader
                        ? 'inset 0 0 0 1.5px rgba(182,139,58,0.55)'
                        : 'none',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
