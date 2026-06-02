import { useState } from 'react'
import { Database } from 'lucide-react'
import { ModuleCard } from '@/components/ModuleCard'
import { VerdictStrip } from '@/components/VerdictStrip'
import { InvestorRead } from '@/components/InvestorRead'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useActiveCompany } from '@/state/filters'
import { getCompanyMaster } from '@/lib/dataLayer'

type View = 'Trend' | 'Change' | 'Table'

/**
 * Ownership section.
 *
 * We don't yet pull shareholding-pattern data from NSE / BSE / company IR.
 * Rather than render mock holder splits, the section surfaces an explicit
 * unavailable state until ingest-ownership.ts pulls the live PDFs.
 */
export function Ownership() {
  const [view, setView] = useState<View>('Trend')
  const company = useActiveCompany()
  // Listed status is data-driven from company-master — no hardcoded id list, so
  // newly added insurers carry the correct listed/unlisted copy automatically.
  const listed = getCompanyMaster().find((c) => c.company_id === company.id)?.listed_status === 'listed'

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow="Ownership Signal"
        verdict="Awaiting filings ingestion"
        tone="navy"
        badge="Pending"
        summary={`Shareholding pattern for ${company.shortName} not yet ingested. Quarterly shareholding PDFs will populate this section once ingest-ownership.ts runs against NSE / BSE / company-IR filings.`}
        source="Unavailable"
        sourceProvenance={{
          source_name: 'Shareholding pattern PDFs not yet ingested',
          source_url: 'https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern',
        }}
      />

      <ModuleCard
        question="Who owns the company, and are serious investors increasing or reducing exposure?"
        title={`${company.shortName} · Ownership Trend`}
        icon="ownership"
        controls={
          <SegmentedControl<View> label="View" options={['Trend', 'Change', 'Table'] as View[]} value={view} onChange={setView} size="sm" />
        }
      >
        <UnavailableSection companyName={company.shortName} listed={listed} />
      </ModuleCard>

      <InvestorRead
        title={`${company.shortName} · Ownership Investor Read`}
        signal="Pending"
        lines={[
          { label: 'Why', value: `No ingested shareholding data for ${company.shortName} yet.` },
          { label: 'Implication', value: 'Cannot read promoter / FII / DII / MF trends without primary filings.' },
          { label: 'Watch', value: 'ingest-ownership.ts scheduled run (post-quarter shareholding-pattern release).' },
          { label: 'Read', value: 'Section will populate automatically once snapshot is wired.' },
        ]}
        source="Unavailable"
      />
    </div>
  )
}

function UnavailableSection({ companyName, listed }: { companyName: string; listed: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl2 border border-dashed border-soft-border bg-ice/60 px-8 text-center"
      style={{ height: 280 }}
    >
      <span className="blob-c mb-3 inline-flex h-12 w-12 items-center justify-center bg-soft-blue text-navy-primary">
        <Database className="h-5 w-5" />
      </span>
      <p className="text-[13px] font-semibold text-navy-deep">Shareholding data not yet ingested</p>
      <p className="mt-1.5 max-w-md text-[11.5px] leading-relaxed text-ink-secondary">
        {listed
          ? `${companyName} is listed. The next ingest-ownership.ts run will pull the quarterly shareholding-pattern PDF from NSE corporate filings and populate this section.`
          : `${companyName} is unlisted — quarterly shareholding pattern is not publicly disclosed for unlisted insurers. Section reserved for future activation.`}
      </p>
    </div>
  )
}
