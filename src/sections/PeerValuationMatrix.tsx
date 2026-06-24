import { Info } from 'lucide-react'
import { FOCAL_VALUATION_ID, peerValuation } from '@/data/valuationData'
import { Eyebrow, OpenSource, fmtCr, xMult } from './valuationShared'

// ---------------------------------------------------------------------------
//  Peer valuation matrix — ONE clean comparable table. No Listed/Unlisted/All
//  toggles, no repeated "not available" language: a market-based metric that
//  can't exist without a live price simply reads as an em-dash "—", explained
//  once in the footer. Operating scale (GWP, GWP growth) is shown for every peer
//  because it is filed and real; only the price-derived columns dash out for the
//  unlisted names.
//
//  Data, peer set, sources and every number are unchanged — this is the same
//  `peerValuation` rows, re-presented.
// ---------------------------------------------------------------------------

const GROWTH_GREEN = '#2E8B63'
const CORAL = '#A8443B'

function fmtGrowth(v: number | null) {
  if (v == null) return null
  const s = v >= 0 ? '+' : '−'
  const a = Math.abs(v)
  return `${s}${Number.isInteger(a) ? a.toFixed(0) : a.toFixed(1)}%`
}

// Short, honest per-row comment derived only from facts already in the row
// (listing status, scale rank, premium/discount vs the listed benchmark).
function noteFor(companyId: string, premiumVsStar: number | null): string {
  if (companyId === FOCAL_VALUATION_ID) {
    if (premiumVsStar == null) return 'Focal name · listed SAHI'
    if (premiumVsStar > 5) return 'Trades at a premium to Star Health'
    if (premiumVsStar < -5) return 'Trades at a discount to Star Health'
    return 'In line with Star Health'
  }
  if (companyId === 'star-health') return 'Largest listed SAHI peer'
  return 'Unlisted — no public market price'
}

function Dash() {
  return <span className="text-ink-secondary/45">—</span>
}

export function PeerValuationMatrix() {
  const rows = peerValuation
  const niva = rows.find((r) => r.companyId === FOCAL_VALUATION_ID)
  const star = rows.find((r) => r.companyId === 'star-health')
  const premiumVsStar =
    niva?.pGwp != null && star?.pGwp ? ((niva.pGwp - star.pGwp) / star.pGwp) * 100 : null

  return (
    <section>
      <Eyebrow
        label="Peer Comparison"
        title="Peer valuation matrix"
        note="Operating scale for every SAHI peer; market-based multiples where a live price exists."
      />
      <div className="card-surface card-tint-slate overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-[11.5px]">
            <thead>
              <tr className="border-b border-soft-border bg-[#EEF2F9] text-[9.5px] uppercase tracking-[0.04em] text-ink-secondary">
                <th className="py-2.5 pl-4 pr-3 font-semibold">Company</th>
                <th className="py-2.5 pr-3 font-semibold">Listing</th>
                <th className="py-2.5 pr-3 text-right font-semibold">GWP · latest FY</th>
                <th className="py-2.5 pr-3 text-right font-semibold">GWP growth</th>
                <th className="py-2.5 pr-3 text-right font-semibold">P / GWP</th>
                <th className="py-2.5 pr-3 text-right font-semibold">P / E</th>
                <th className="py-2.5 pr-3 text-right font-semibold">Market value</th>
                <th className="py-2.5 pr-4 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const focal = r.companyId === FOCAL_VALUATION_ID
                const unlisted = r.listingStatus === 'Unlisted'
                const growth = fmtGrowth(r.growth)
                return (
                  <tr
                    key={r.companyId}
                    className={`border-b border-[#EEF1F6] align-middle transition-colors last:border-0 ${focal ? 'bg-soft-blue/45' : 'hover:bg-soft-blue/20'}`}
                  >
                    {/* Company */}
                    <td className="py-2.5 pl-4 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        {focal && <span className="h-3.5 w-[3px] rounded-full bg-gradient-to-b from-champagne to-champagne-deep" />}
                        <span className="font-semibold text-navy-deep">{r.companyName}</span>
                        {focal && <span className="rounded-full bg-champagne-soft px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-champagne-deep">Focal</span>}
                      </span>
                    </td>
                    {/* Listing */}
                    <td className="py-2.5 pr-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${unlisted ? 'border border-dashed border-[#CAD0DA] text-ink-secondary' : 'bg-emerald-soft text-emerald'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${unlisted ? 'bg-[#B7BECB]' : 'bg-emerald'}`} />
                        {r.listingStatus}
                      </span>
                    </td>
                    {/* GWP + FY */}
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {r.gwp != null ? (
                        <span className="inline-flex items-baseline gap-1">
                          <span className="font-semibold text-navy-deep">{fmtCr(r.gwp)}</span>
                          {r.gwpFy && <span className="text-[8.5px] font-semibold uppercase tracking-wide text-ink-secondary/70">{r.gwpFy}</span>}
                        </span>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    {/* GWP growth */}
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {growth != null ? (
                        <span className="font-semibold" style={{ color: r.growth != null && r.growth >= 0 ? GROWTH_GREEN : CORAL }}>{growth}</span>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    {/* P/GWP */}
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {r.pGwp != null ? <span className="font-semibold text-navy-deep">{xMult(r.pGwp)}</span> : <Dash />}
                    </td>
                    {/* P/E */}
                    <td className="py-2.5 pr-3 text-right tabular-nums text-navy-deep">
                      {r.pe != null ? xMult(r.pe, 1) : <Dash />}
                    </td>
                    {/* Market value */}
                    <td className="py-2.5 pr-3 text-right tabular-nums text-navy-deep">
                      {r.marketCap != null ? fmtCr(r.marketCap) : <Dash />}
                    </td>
                    {/* Notes + quiet source */}
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10.5px] leading-snug text-ink-secondary">{noteFor(r.companyId, premiumVsStar)}</span>
                        <OpenSource id={r.sourceId} url={r.sourceUrl ?? undefined} title={r.sourceName ?? undefined} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* One neat footer note — explains the dash once, not in every cell. */}
        <div className="flex items-start gap-1.5 border-t border-soft-border bg-[#FAFBFD] px-4 py-2.5 text-[10.5px] leading-snug text-ink-secondary">
          <Info className="mt-px h-3 w-3 shrink-0 text-ink-secondary/70" />
          <span>
            <b className="text-navy-deep/80">“—”</b> marks a market-based metric (P/GWP, P/E, market value) that can&rsquo;t exist without a live share price — the unlisted peers (Care Health, Aditya Birla Health, ManipalCigna) have no public listing. Their GWP and growth are real filed figures.
          </span>
        </div>
      </div>
    </section>
  )
}
