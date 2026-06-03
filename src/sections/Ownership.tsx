import { ModuleCard } from '@/components/ModuleCard'
import { LockedPanel, LockedControl } from '@/components/LockedPanel'
import { VerdictStrip } from '@/components/VerdictStrip'
import { useActiveCompany } from '@/state/filters'
import { getCompanyMaster } from '@/lib/dataLayer'

/**
 * Ownership section.
 *
 * We don't yet pull shareholding-pattern data from NSE / BSE / company IR, so
 * the whole section is LOCKED (rather than rendering mock holder splits): the
 * View control is disabled and a premium lock panel stands in until
 * ingest-ownership.ts pulls the live PDFs.
 */
export function Ownership() {
  const company = useActiveCompany()
  // Listed status is data-driven from company-master — no hardcoded id list, so
  // newly added insurers carry the correct listed/unlisted copy automatically.
  const listed = getCompanyMaster().find((c) => c.company_id === company.id)?.listed_status === 'listed'

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow="Ownership Signal"
        verdict="Locked · awaiting filings ingestion"
        tone="navy"
        badge="Locked"
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
        controls={<LockedControl label="View" options={['Trend', 'Change', 'Table']} />}
      >
        {listed ? (
          <LockedPanel
            embedded
            height={280}
            title="Shareholding data locked"
            message={`${company.shortName} is listed — the next ingest-ownership.ts run pulls the quarterly shareholding-pattern PDF from NSE corporate filings and unlocks this section.`}
          />
        ) : (
          <LockedPanel
            embedded
            height={280}
            title="Not publicly disclosed"
            message={`${company.shortName} is unlisted — the quarterly shareholding pattern is not publicly disclosed for unlisted insurers.`}
            pill="Locked · not disclosed"
          />
        )}
      </ModuleCard>
    </div>
  )
}
