// Top Players by Market Share — a compact, crown-free ranking table. Rows are
// ranked by the selected metric; the market-share leader carries a gold "Leader"
// chip and the selected company is highlighted with a soft navy focal band.
// Premium and market share stay visible as reference columns; the selected
// metric carries the horizontal "rank signal" bar.

import { companyColor, type OverviewModel } from '@/lib/industryOverview'

const cr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')} Cr`
const pct1 = (v: number) => `${v.toFixed(1)}%`

const rankBadge = (focal: boolean, leader: boolean) =>
  focal
    ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white ring-1 ring-[#1B3260]'
    : leader
      ? 'bg-gradient-to-br from-champagne to-champagne-deep text-white ring-1 ring-[#EAD9B6]'
      : 'bg-ice text-ink-secondary ring-1 ring-soft-border'

export function IndustryRankTable({ model }: { model: OverviewModel }) {
  const { metric, rows, others } = model
  // Keep the table at four columns in every view: Rank · Insurer · a reference
  // column · the selected metric (value + bar). Premium is the reference column
  // unless premium *is* the metric, in which case market share takes its place.
  const showPremiumCol = metric.id !== 'premium'
  const showShareCol = metric.id === 'premium'

  const maxPrimary = Math.max(...rows.filter((r) => r.metricAvailable).map((r) => r.metricValue), 1)
  // Stable color index by share rank so table tones match the bubble map.
  const colorIdx = new Map(model.byShare.map((r, i) => [r.id, i]))

  return (
    <div className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">
        <span className="w-7 shrink-0 text-center">#</span>
        <span className="flex-1">Insurer</span>
        {showPremiumCol && <span className="w-[78px] shrink-0 text-right">Premium</span>}
        {showShareCol && <span className="w-[58px] shrink-0 text-right">Share</span>}
        <span className="w-[112px] shrink-0 text-right">{metric.label}</span>
      </div>

      <div className="space-y-1">
        {rows.map((r) => {
          const color = companyColor(r.id, r.focal, colorIdx.get(r.id) ?? 0)
          const frac = r.metricAvailable ? Math.max(0.04, r.metricValue / maxPrimary) : 0
          return (
            <div
              key={r.id}
              className={[
                'flex items-center gap-2 rounded-xl px-1.5 py-1.5 transition-all duration-200',
                r.focal ? 'focal-mark' : 'hover:bg-ice/70',
              ].join(' ')}
            >
              {/* Rank */}
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold shadow-soft ${rankBadge(r.focal, r.isLeader)}`}>
                {r.rank || '–'}
              </span>

              {/* Company */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`truncate text-[12.5px] font-semibold ${r.focal ? 'text-navy-deep' : 'text-ink-primary'}`}>
                    {r.shortName}
                  </span>
                  {r.isLeader && (
                    <span className="shrink-0 rounded-full bg-champagne-soft px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide text-champagne-deep">
                      Leader
                    </span>
                  )}
                  {r.focal && !r.isLeader && (
                    <span className="shrink-0 rounded-full bg-soft-blue px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide text-navy-primary">
                      Selected
                    </span>
                  )}
                </div>
                <div className="truncate text-[10px] text-ink-secondary">{r.listed ? `${r.ticker} · Listed` : 'Unlisted'}</div>
              </div>

              {/* Premium (reference) */}
              {showPremiumCol && (
                <span className="w-[78px] shrink-0 text-right text-[11.5px] tabular-nums text-ink-secondary">
                  {r.premiumAvailable ? cr(r.premium) : 'n/a'}
                </span>
              )}

              {/* Market share (reference) */}
              {showShareCol && (
                <span className={`w-[58px] shrink-0 text-right text-[11.5px] tabular-nums ${r.focal ? 'font-semibold text-navy-deep' : 'text-ink-secondary'}`}>
                  {r.shareAvailable ? pct1(r.share) : 'n/a'}
                </span>
              )}

              {/* Selected metric — value + rank-signal bar */}
              <div className="w-[112px] shrink-0">
                {r.metricAvailable ? (
                  <>
                    <div className="text-right text-[12.5px] font-semibold tabular-nums text-navy-deep">{metric.format(r.metricValue)}</div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ice">
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.round(frac * 100)}%`, background: color }} />
                    </div>
                  </>
                ) : (
                  <div className="text-right text-[11px] italic text-ink-secondary/70">n/a</div>
                )}
              </div>
            </div>
          )
        })}

        {/* Untracked tail */}
        {others && (
          <div className="flex items-center gap-2 rounded-xl px-1.5 py-1.5 opacity-80">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ice text-[11px] font-bold text-ink-secondary/70 ring-1 ring-soft-border">
              –
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[12.5px] font-medium text-ink-secondary">Others</span>
              <div className="truncate text-[10px] text-ink-secondary/80">Smaller standalone insurers</div>
            </div>
            {showPremiumCol && <span className="w-[78px] shrink-0 text-right text-[11.5px] tabular-nums text-ink-secondary/70">n/a</span>}
            {showShareCol && <span className="w-[58px] shrink-0 text-right text-[11.5px] tabular-nums text-ink-secondary/70">{pct1(others.share)}</span>}
            <div className="w-[112px] shrink-0 text-right">
              {metric.id === 'share' ? (
                <>
                  <div className="text-[12.5px] font-medium tabular-nums text-ink-secondary/80">{pct1(others.share)}</div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ice">
                    <div className="h-full rounded-full bg-[#D4D9E0]" style={{ width: `${Math.round(Math.max(0.04, others.share / Math.max(...rows.map((r) => r.metricValue), 1)) * 100)}%` }} />
                  </div>
                </>
              ) : (
                <span className="text-[11px] italic text-ink-secondary/60">n/a</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
