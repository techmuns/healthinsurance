import { Database } from 'lucide-react'
import { ModuleCard } from '@/components/ModuleCard'
import { VerdictStrip } from '@/components/VerdictStrip'
import { InvestorRead } from '@/components/InvestorRead'
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
