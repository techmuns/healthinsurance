import { useState } from 'react'
import { ModuleCard } from '@/components/ModuleCard'
import { DataEmptyState } from '@/components/DataEmptyState'
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
        sourceFrequency="Quarterly"
        sourceStatus="pending"
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
        {listed ? (
          <DataEmptyState
            kind="pending"
            height={280}
            title="Shareholding data pending"
            body={`${company.shortName} is listed — the next ingest-ownership.ts run pulls the quarterly shareholding-pattern PDF from NSE corporate filings and populates this section.`}
          />
        ) : (
          <DataEmptyState
            kind="not-disclosed"
            height={280}
            body={`${company.shortName} is unlisted — the quarterly shareholding pattern is not publicly disclosed for unlisted insurers.`}
          />
        )}
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
