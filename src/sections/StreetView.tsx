import { EmptyState } from '@/components/EmptyState'
import { SourceTag } from '@/components/SourceTag'
import { useActiveCompany } from '@/state/filters'
import { analystConsensus, analystReports, coveragePendingCount, FOCAL_VALUATION_ID, marketSnapshot } from '@/data/valuationData'
import { srcTag } from '@/data/valuationSources'
import { Eyebrow, LensRange, OpenSource, px, ratingTone, upPct, ValPill } from './valuationShared'

/**
 * Street View — broker / analyst / street components, lifted out of the Valuation
 * page into their own section. Charts are relocated as-is, not redesigned: the
 * consensus KPIs, rating split, analyst target range and the per-broker note
 * table all read from the same `valuationData` source. Analyst coverage is
 * tracked for the listed focal name; other insurers show an honest "not covered"
 * state rather than fabricated targets.
 */
export function StreetView() {
  const company = useActiveCompany()
  const isFocal = company.id === FOCAL_VALUATION_ID

  if (!isFocal) {
    return (
      <div className="space-y-5">
        <Eyebrow label="Street View" title="What does the Street think it's worth?" />
        <div className="card-surface p-5">
          <EmptyState
            title={`Analyst coverage not tracked for ${company.shortName}`}
            body={`Street estimates, broker targets and consensus are tracked for ${marketSnapshot.company} (listed) today. Other insurers populate here once citable analyst notes are ingested.`}
            height={300}
          />
        </div>
      </div>
    )
  }

  const ac = analystConsensus
  const price = marketSnapshot.currentPrice
  const target = ac.consensusTargetPrice
  const upsideConsensus = target != null ? (target / price - 1) * 100 : null

  return (
    <div className="space-y-5">
      <section>
        <Eyebrow label="Street View" title="What does the Street think it's worth?" note={`${ac.analystCount} analysts cover the stock · ${ac.buyCount} Buy · ${ac.holdCount} Hold · ${ac.sellCount} Sell`} right={<ValPill c="secondary" />} />
        <div className="card-surface p-5">
          <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            {/* Compact KPI grid */}
            <div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {[
                  { k: 'Consensus target', v: px(target), tone: 'navy' as const, sub: 'avg of Street' },
                  { k: 'Current price', v: px(price), tone: 'navy' as const, sub: marketSnapshot.priceAsOf },
                  { k: 'Implied upside', v: upPct(upsideConsensus), tone: (upsideConsensus ?? 0) >= 0 ? ('teal' as const) : ('red' as const), sub: 'to consensus' },
                  { k: 'Highest target', v: px(ac.highestTargetPrice), tone: 'teal' as const, sub: 'Street high' },
                  { k: 'Lowest target', v: px(ac.lowestTargetPrice), tone: 'navy' as const, sub: 'Street low' },
                  { k: 'Analysts', v: `${ac.analystCount}`, tone: 'navy' as const, sub: `${ac.buyCount} Buy · ${ac.sellCount} Sell` },
                ].map((kpi) => (
                  <div key={kpi.k} className="rounded-xl border border-soft-border bg-ice/50 px-3 py-2.5">
                    <p className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-secondary">{kpi.k}</p>
                    <p className={`mt-1 font-display text-[18px] leading-none ${kpi.tone === 'teal' ? 'text-teal' : kpi.tone === 'red' ? 'text-signal-negative' : 'text-navy-deep'}`}>{kpi.v}</p>
                    <p className="mt-0.5 text-[9px] text-ink-secondary/80">{kpi.sub}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-soft-border bg-white/60 px-3 py-2">
                <span className="text-[11px] font-semibold text-navy-deep">Rating split</span>
                <div className="flex h-2.5 w-40 overflow-hidden rounded-full bg-soft-border">
                  <span style={{ width: `${(ac.buyCount / ac.analystCount) * 100}%`, background: ratingTone.Buy.fg }} />
                  <span style={{ width: `${(ac.holdCount / ac.analystCount) * 100}%`, background: ratingTone.Hold.fg }} />
                  <span style={{ width: `${(ac.sellCount / ac.analystCount) * 100}%`, background: ratingTone.Sell.fg }} />
                </div>
                <span className="text-[11px] text-ink-secondary"><b className="text-teal">{ac.buyCount} Buy</b> · <b className="text-champagne-deep">{ac.holdCount} Hold</b> · <b className="text-signal-negative">{ac.sellCount} Sell</b></span>
              </div>
            </div>

            {/* Analyst target range */}
            <div className="rounded-xl border border-soft-border bg-gradient-to-br from-[#FBFCFE] to-[#F4F7FB] p-3.5">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Where the price sits in the target range</p>
              <LensRange price={price} target={target} lo={ac.lowestTargetPrice} hi={ac.highestTargetPrice} analysts={ac.analystCount} />
            </div>
          </div>

          {/* Analyst table — every row carries a clickable source + confidence */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-soft-border text-[10px] uppercase tracking-wide text-ink-secondary">
                  <th className="py-1.5 pr-3 font-semibold">Analyst / Source</th>
                  <th className="py-1.5 pr-3 font-semibold">Valuation view</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">Key number</th>
                  <th className="py-1.5 pr-3 font-semibold">Date</th>
                  <th className="py-1.5 pr-3 font-semibold">Source</th>
                  <th className="py-1.5 font-semibold">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {analystReports.map((r) => {
                  const up = r.targetPrice != null ? (r.targetPrice / price - 1) * 100 : null
                  return (
                    <tr key={r.brokerage} className="border-b border-[#F2F4F8] align-top last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-semibold text-navy-deep">{r.brokerage}</span>
                        {r.rating && <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold" style={{ color: ratingTone[r.rating].fg, background: ratingTone[r.rating].bg }}>{r.rating}</span>}
                      </td>
                      <td className="py-2 pr-3 text-ink-secondary">{r.thesis}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        <span className="font-semibold text-navy-deep">{px(r.targetPrice)}</span>
                        {up != null && <span className={`ml-1 text-[10px] ${up >= 0 ? 'text-teal' : 'text-signal-negative'}`}>{upPct(up)}</span>}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-ink-secondary">{r.reportDate}</td>
                      <td className="py-2 pr-3"><OpenSource id={r.sourceId} /></td>
                      <td className="py-2"><ValPill c={r.confidence} /></td>
                    </tr>
                  )
                })}
                {/* Honest coverage gap — never invent the other brokers' targets */}
                <tr className="align-top">
                  <td className="py-2 pr-3 font-semibold text-ink-secondary">Other brokers ({coveragePendingCount}+)</td>
                  <td className="py-2 pr-3 italic text-ink-secondary">Cover the name, but no citable note on record here</td>
                  <td className="py-2 pr-3 text-right text-ink-secondary">—</td>
                  <td className="py-2 pr-3 text-ink-secondary">—</td>
                  <td className="py-2 pr-3"><span className="text-[10px] font-medium italic text-ink-secondary/70">Source pending</span></td>
                  <td className="py-2"><ValPill c="pending" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10.5px] text-ink-secondary">Targets shown only where a note is citable; the rest are marked <b>Source pending</b>, never invented.</p>
            <SourceTag {...srcTag('niva-consensus')} />
          </div>
        </div>
      </section>
    </div>
  )
}
