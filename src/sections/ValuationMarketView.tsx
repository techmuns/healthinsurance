import { Database } from 'lucide-react'
import { ModuleCard } from '@/components/ModuleCard'
import { VerdictStrip } from '@/components/VerdictStrip'
import { InvestorRead } from '@/components/InvestorRead'
import { SectionHeading } from '@/components/SectionHeading'
import { SignalBadge } from '@/components/SignalBadge'
import { insurers } from '@/data/mockData'
import { useActiveCompany } from '@/state/filters'

/**
 * Valuation section.
 *
 * P/GWP, P/B, P/E and the peer-comparison scatter all need a live or
 * snapshotted market-cap feed (shares outstanding × share price) plus
 * per-company quarterly book value. None of that is ingested yet, so the
 * section surfaces an explicit unavailable state rather than rendering
 * fake multiples on top of real GWP numbers.
 */
export function ValuationMarketView() {
  const company = useActiveCompany()
  const listed = company.id === 'niva-bupa' || company.id === 'star-health' || company.id === 'icici-lombard' || company.id === 'hdfc-life' || company.id === 'sbi-life'

  // Top-3 peers by valuation multiple within the active company's peer group,
  // excluding the focal company itself. P/GWP (x) — lower is cheaper.
  const topPeers = insurers
    .filter((i) => i.peerGroup === company.peerGroup && i.id !== company.id)
    .sort((a, b) => b.valuation - a.valuation)
    .slice(0, 3)
  const peerAvg =
    topPeers.length > 0 ? topPeers.reduce((s, p) => s + p.valuation, 0) / topPeers.length : 0
  const premiumPct = peerAvg > 0 ? ((company.valuation - peerAvg) / peerAvg) * 100 : 0
  const premiumTone: 'positive' | 'warning' | 'negative' =
    premiumPct < -5 ? 'positive' : premiumPct > 10 ? 'negative' : 'warning'
  const premiumLabel = premiumPct < -5 ? 'Cheap' : premiumPct > 10 ? 'Expensive' : 'In-line'

  const valueDrivers = [
    { label: 'Revenue growth (GWP YoY)', value: `${company.growth.toFixed(1)}%`, tone: company.growth >= 15 ? 'positive' : company.growth >= 8 ? 'navy' : 'warning' },
    { label: 'Net margin (PAT / GWP)', value: `${company.margin.toFixed(1)}%`, tone: company.margin > 0 ? 'positive' : company.margin >= -2 ? 'warning' : 'negative' },
    { label: 'Market share', value: `${company.marketShare.toFixed(1)}%`, tone: company.marketShareChange > 0 ? 'positive' : company.marketShareChange < 0 ? 'negative' : 'navy' },
  ] as const

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow="Valuation Verdict"
        verdict="Awaiting market-cap snapshot"
        tone="navy"
        badge="Pending"
        summary={
          listed
            ? `${company.shortName} is listed on the exchange. P/GWP, P/B and P/E will populate once ingest-ownership.ts (or a dedicated market-data fetcher) pulls market cap and shares outstanding from NSE / BSE.`
            : `${company.shortName} is unlisted — no public market valuation is available. Section reserved for future activation if the company lists.`
        }
        source="Unavailable"
        sourceProvenance={{
          source_name: listed ? 'Market data from NSE / BSE (pending fetcher implementation)' : 'Unlisted insurer — no public valuation',
          source_url: listed ? 'https://www.nseindia.com/get-quotes/equity' : '',
        }}
      />

      <section>
        <SectionHeading
          eyebrow="Valuation Lens"
          title="Multiple vs peers · what justifies it"
          note="P/GWP basis · mock data"
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card-surface relative overflow-hidden p-5">
            <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 blob-a bg-soft-blue/60" />
            <div className="relative flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Valuation multiple</p>
              <SignalBadge label={premiumLabel} tone={premiumTone} size="sm" />
            </div>
            <div className="relative mt-2 flex items-baseline gap-2">
              <span className="font-display text-[34px] leading-none text-navy-deep">
                {company.valuation.toFixed(1)}x
              </span>
              <span className="text-[12px] text-ink-secondary">P/GWP · {company.shortName}</span>
            </div>
            <p className="relative mt-1.5 text-[11.5px] text-ink-secondary">
              {peerAvg > 0 ? (
                <>
                  vs top-3 peer average{' '}
                  <span className="font-semibold text-navy-deep">{peerAvg.toFixed(1)}x</span> ·{' '}
                  <span className={premiumPct > 0 ? 'text-signal-negative' : 'text-signal-positive'}>
                    {premiumPct > 0 ? '+' : ''}
                    {premiumPct.toFixed(0)}%
                  </span>{' '}
                  premium
                </>
              ) : (
                'No peers available in this group'
              )}
            </p>
            <ul className="relative mt-4 space-y-2">
              {topPeers.map((p) => {
                const delta = p.valuation - company.valuation
                return (
                  <li key={p.id} className="flex items-center justify-between text-[12px]">
                    <span className="text-navy-deep">{p.shortName}</span>
                    <span className="flex items-baseline gap-2">
                      <span className="font-semibold text-navy-deep">{p.valuation.toFixed(1)}x</span>
                      <span
                        className={
                          delta > 0
                            ? 'text-[11px] text-signal-positive'
                            : delta < 0
                              ? 'text-[11px] text-signal-negative'
                              : 'text-[11px] text-ink-secondary'
                        }
                      >
                        {delta > 0 ? '+' : ''}
                        {delta.toFixed(1)}x
                      </span>
                    </span>
                  </li>
                )
              })}
              {topPeers.length === 0 && (
                <li className="text-[11.5px] text-ink-secondary">No peer comparables in this group.</li>
              )}
            </ul>
          </div>

          <div className="card-surface relative overflow-hidden p-5">
            <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 blob-c bg-champagne-soft/70" />
            <p className="relative text-[10px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Value drivers</p>
            <p className="relative mt-1 text-[12px] text-ink-secondary">
              Key metrics that justify the multiple
            </p>
            <div className="relative mt-4 space-y-3">
              {valueDrivers.map((d) => (
                <div
                  key={d.label}
                  className="flex items-center justify-between rounded-lg bg-ice/70 px-3 py-2.5"
                >
                  <span className="text-[12px] text-navy-deep">{d.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[18px] leading-none text-navy-deep">{d.value}</span>
                    <SignalBadge
                      label={d.tone === 'positive' ? 'Strong' : d.tone === 'navy' ? 'Stable' : d.tone === 'warning' ? 'Watch' : 'Weak'}
                      tone={d.tone}
                      size="sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <ModuleCard
        question="Is the stock pricing in too much optimism, or still offering upside?"
        title={`${company.shortName} · Valuation Compass`}
        icon="valuation"
      >
        <div
          className="flex flex-col items-center justify-center rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-8 text-center"
          style={{ height: 320 }}
        >
          <span className="blob-c mb-3 inline-flex h-12 w-12 items-center justify-center bg-soft-blue text-navy-primary">
            <Database className="h-5 w-5" />
          </span>
          <p className="text-[13px] font-semibold text-navy-deep">Valuation snapshot not yet ingested</p>
          <p className="mt-1.5 max-w-md text-[11.5px] leading-relaxed text-ink-secondary">
            {listed
              ? `Real-time market cap, P/GWP, P/B, P/E and the peer-comparison scatter need a market-data fetcher that pulls NSE / BSE quotes. Until that runs, valuation multiples are intentionally left blank rather than approximated.`
              : `${company.shortName} is not publicly traded — no market multiples to display.`}
          </p>
        </div>
      </ModuleCard>

      <InvestorRead
        title={`${company.shortName} · Valuation Investor Read`}
        signal="Pending"
        lines={[
          { label: 'Why', value: `Valuation multiples for ${company.shortName} not yet ingested.` },
          { label: 'Implication', value: 'Cannot compare multiples vs peer median without primary market-cap data.' },
          { label: 'Watch', value: 'Next ingest-ownership.ts / market-data fetcher run.' },
          { label: 'Read', value: 'Section will populate automatically once snapshot is wired.' },
        ]}
        source="Unavailable"
      />
    </div>
  )
}
