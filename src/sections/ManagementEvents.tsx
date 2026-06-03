import { ModuleCard } from '@/components/ModuleCard'
import { DataEmptyState } from '@/components/DataEmptyState'
import { PromiseTracker } from '@/components/PromiseTracker'
import { VerdictStrip } from '@/components/VerdictStrip'
import { InvestorRead } from '@/components/InvestorRead'
import { promiseTracker } from '@/data/mockData'
import { useActiveCompany } from '@/state/filters'

/**
 * Management Events section.
 *
 * Event-feed + commentary blocks have been removed pending the ingest-
 * management-events.ts pull (NSE / BSE filings + company press releases).
 * Promise Tracker remains because the items are anchored to specific
 * audited Niva Bupa FY25 metrics and the comparison is meaningful.
 */
export function ManagementEvents() {
  const company = useActiveCompany()
  const promises = promiseTracker.filter((p) => p.company === company.id)

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow="Governance Signal"
        verdict="Promise tracker only"
        tone="navy"
        badge="Partial"
        summary={`Promise tracker compares ${company.shortName}'s public guidance to its FY25 audited disclosures. Event feed and management commentary blocks are pending the ingest-management-events.ts ingestion run.`}
        source={promises.length > 0 ? 'Company filing' : 'Unavailable'}
        sourceFrequency="Event-based"
        sourceStatus={promises.length > 0 ? 'available' : 'pending'}
        sourceProvenance={{
          source_name: 'Guidance from earnings calls + audited FY25 metrics from company press releases',
          source_url: 'https://transactions.nivabupa.com/pages/doc/investor-relations/Earnings-Calls/2024-2025/Earnings-Call-Transcript-Q4-FY-2025.pdf',
        }}
      />

      <ModuleCard
        question="What did management promise, and what actually happened?"
        title="Promise Tracker"
        icon="commentary"
      >
        {promises.length > 0 ? (
          <PromiseTracker items={promises} companyName={company.shortName} />
        ) : (
          <DataEmptyState
            kind="pending"
            height={260}
            title={`Promise tracker not connected for ${company.shortName}`}
            body="Populated for Niva Bupa today. Other insurers appear once their guidance commitments are extracted from earnings-call transcripts."
          />
        )}
      </ModuleCard>

      <EventFeedUnavailable companyName={company.shortName} />

      <InvestorRead
        title={`${company.shortName} · Management Investor Read`}
        signal="Pending"
        lines={[
          { label: 'Why', value: `Event feed for ${company.shortName} not yet ingested from NSE / BSE / company-IR press releases.` },
          { label: 'Implication', value: 'Cannot rank events by investor impact without primary feed.' },
          { label: 'Watch', value: 'ingest-management-events.ts scheduled run.' },
          { label: 'Read', value: 'Section will populate automatically once snapshot is wired.' },
        ]}
        source="Unavailable"
      />
    </div>
  )
}

function EventFeedUnavailable({ companyName }: { companyName: string }) {
  return (
    <ModuleCard
      question="What events matter now — ranked by investor impact, not recency?"
      title="Insurance Event Feed"
      icon="events"
    >
      <DataEmptyState
        kind="pending"
        height={260}
        title="Event feed not yet ingested"
        body={`KMP appointments, board changes, ESOP issues and other regulatory events for ${companyName} populate this feed once ingest-management-events.ts pulls NSE / BSE corporate filings + company-IR press releases.`}
      />
    </ModuleCard>
  )
}
