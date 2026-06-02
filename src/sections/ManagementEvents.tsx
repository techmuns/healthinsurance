import { Database } from 'lucide-react'
import { ModuleCard } from '@/components/ModuleCard'
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
          <div
            className="flex flex-col items-center justify-center rounded-xl2 border border-dashed border-soft-border bg-gradient-to-br from-white via-ice/80 to-soft-blue/50 px-8 text-center"
            style={{ height: 260 }}
          >
            <span className="blob-c mb-3 inline-flex h-12 w-12 items-center justify-center bg-soft-blue text-navy-primary">
              <Database className="h-5 w-5" />
            </span>
            <p className="text-[13px] font-semibold text-navy-deep">No promise-tracker entries wired for {company.shortName}</p>
            <p className="mt-1.5 max-w-md text-[11.5px] leading-relaxed text-ink-secondary">
              The promise tracker is currently populated only for Niva Bupa. Other insurers will appear once their guidance commitments are extracted from earnings-call transcripts.
            </p>
          </div>
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
      <div
        className="flex flex-col items-center justify-center rounded-xl2 border border-dashed border-soft-border bg-gradient-to-br from-white via-ice/80 to-soft-blue/50 px-8 text-center"
        style={{ height: 260 }}
      >
        <span className="blob-c mb-3 inline-flex h-12 w-12 items-center justify-center bg-soft-blue text-navy-primary">
          <Database className="h-5 w-5" />
        </span>
        <p className="text-[13px] font-semibold text-navy-deep">Event feed not yet ingested</p>
        <p className="mt-1.5 max-w-md text-[11.5px] leading-relaxed text-ink-secondary">
          KMP appointments, board changes, ESOP issues and other regulatory events for {companyName} will populate this feed once ingest-management-events.ts pulls NSE / BSE corporate filings + company-IR press releases.
        </p>
      </div>
    </ModuleCard>
  )
}
