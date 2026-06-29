import { ModuleCard } from '@/components/ModuleCard'
import { DataEmptyState } from '@/components/DataEmptyState'
import { PromiseTracker } from '@/components/PromiseTracker'
import { VerdictStrip, type VerdictTone } from '@/components/VerdictStrip'
import { ManagementEventIntelligence } from '@/components/ManagementEventIntelligence'
import { getPromises } from '@/lib/promiseTracker'
import { selectManagementEvents } from '@/insights/investorPulse'
import { useActiveCompany } from '@/state/filters'

/**
 * Governance — Management Events tab. Focused strictly on governance now:
 *   • the Promise Tracker (management's public guidance vs the audited outcome)
 *   • board / KMP / leadership changes (the compact, governance-relevant view of
 *     the SHARED Management Event Intelligence component — the full version lives
 *     in Insights).
 *
 * The market-intelligence / news / catalyst / analyst feed that used to sit here
 * has MOVED to the Insights tab ("Curated Market Intelligence"). Governance no
 * longer carries the full intelligence feed — it stays clean and governance-only.
 */
export function ManagementEvents() {
  const company = useActiveCompany()
  const promises = getPromises(company.id)
  const delivered = promises.filter((p) => p.status === 'Delivered').length
  const missed = promises.filter((p) => p.status === 'Missed').length
  const total = promises.length
  const govEvents = selectManagementEvents(company.id, { governanceOnly: true }).length

  const onTrack = total > 0 && missed === 0 && delivered * 2 >= total
  const verdict = total === 0 ? 'Governance watch' : missed > 0 ? 'Watch the misses' : onTrack ? 'Largely on track' : 'In progress'
  const tone: VerdictTone = total === 0 ? 'navy' : missed > 0 ? 'warning' : onTrack ? 'teal' : 'navy'
  const badge = total === 0 ? `${govEvents} event${govEvents === 1 ? '' : 's'}` : `${delivered}/${total} delivered`
  const stats =
    total === 0
      ? [{ label: 'Board / KMP events', value: String(govEvents) }]
      : [
          { label: 'Promises delivered', value: `${delivered}/${total}` },
          { label: 'Board / KMP events', value: String(govEvents) },
        ]
  const summary =
    total === 0
      ? `Governance view for ${company.shortName}: board, KMP and leadership changes on record, each source-linked. Guidance tracking turns on once ${company.shortName}'s public commitments are extracted. Market news, analyst actions and catalysts now live in Insights → Curated Market Intelligence.`
      : `We hold ${company.shortName} to its word — public guidance against the audited FY25 outcome — alongside the board, KMP and leadership changes on record. Guidance is audited; governance events are source-linked. Market news, analyst actions and catalysts now live in Insights → Curated Market Intelligence.`

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow="Governance Signal"
        verdict={verdict}
        tone={tone}
        badge={badge}
        summary={summary}
        stats={stats}
        source={total > 0 ? 'Company filing' : 'Exchange / IR filings'}
        sourceFrequency="Event-based"
        sourceStatus="available"
        sourceProvenance={{
          source_name:
            'Guidance from earnings calls + audited FY25 metrics from company press releases; board / KMP changes from exchange & IR filings',
          source_url:
            'https://transactions.nivabupa.com/pages/doc/investor-relations/Earnings-Calls/2024-2025/Earnings-Call-Transcript-Q4-FY-2025.pdf',
        }}
      />

      <ModuleCard question="What did management promise, and what actually happened?" title="Promise Tracker" icon="commentary">
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

      {/* Board / KMP / leadership changes — compact, governance-relevant view of
          the SHARED component. The full "Management & Event Intelligence" block
          lives in Insights; this stays lean and governance-only. */}
      <ManagementEventIntelligence variant="compact" governanceOnly companyId={company.id} companyName={company.shortName} />
    </div>
  )
}
