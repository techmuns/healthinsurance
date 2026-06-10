import { Sparkles, ExternalLink, CalendarClock, Newspaper } from 'lucide-react'
import { ModuleCard } from '@/components/ModuleCard'
import { DataEmptyState } from '@/components/DataEmptyState'
import { PromiseTracker } from '@/components/PromiseTracker'
import { VerdictStrip } from '@/components/VerdictStrip'
import { promiseTracker } from '@/data/mockData'
import { useActiveCompany } from '@/state/filters'
import intelSnapshot from '@/data/snapshots/market-intelligence-snapshot.json'

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

      <MarketIntelligence companyId={company.id} companyName={company.shortName} />
    </div>
  )
}

// ── AI Market Intelligence ───────────────────────────────────────────────────
// An AI-generated feed of what could move the share: upcoming investor/analyst
// meets, board & earnings dates, sector & regulatory news, and catalysts.
// Web-sourced via the muns agent; every item links its source. Clearly labelled
// AI-generated intelligence — NOT audited data.

interface IntelItem {
  id?: string
  company_id?: string
  date?: string | null
  kind?: string
  horizon?: 'upcoming' | 'recent'
  headline?: string
  detail?: string
  impact?: 'positive' | 'negative' | 'watch' | 'neutral'
  source_name?: string
  source_url?: string | null
}

const IMPACT: Record<string, { dot: string; bg: string; fg: string; label: string }> = {
  positive: { dot: '#168E8E', bg: 'rgba(22,142,142,0.12)', fg: '#0E6F6D', label: 'Tailwind' },
  negative: { dot: '#C0584F', bg: 'rgba(192,88,79,0.12)', fg: '#A8443B', label: 'Headwind' },
  watch: { dot: '#B68B3A', bg: 'rgba(182,139,58,0.16)', fg: '#8A6516', label: 'Watch' },
  neutral: { dot: '#8C97A8', bg: 'rgba(140,151,168,0.14)', fg: '#5B6573', label: 'Neutral' },
}

const KIND_LABEL: Record<string, string> = {
  investor_meet: 'Investor meet',
  earnings: 'Earnings',
  board_meeting: 'Board meeting',
  regulatory: 'Regulatory',
  sector_news: 'Sector news',
  catalyst: 'Catalyst',
  rating: 'Analyst action',
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const t = new Date(d)
  if (isNaN(t.getTime())) return d
  return t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function MarketIntelligence({ companyId, companyName }: { companyId: string; companyName: string }) {
  const meta = (intelSnapshot as { _meta: { last_updated?: string | null; dataset?: string } })._meta
  const all = (intelSnapshot.data as IntelItem[]) ?? []
  // Sector-wide items (no company / 'sector' / 'all') plus this company's items.
  const items = all.filter((i) => !i.company_id || i.company_id === companyId || i.company_id === 'sector' || i.company_id === 'all')

  const order = (i: IntelItem) => (i.horizon === 'upcoming' ? 0 : 1)
  const impactRank = (i: IntelItem) => ({ negative: 0, positive: 1, watch: 2, neutral: 3 }[i.impact ?? 'neutral'] ?? 3)
  const sorted = [...items].sort((a, b) => order(a) - order(b) || impactRank(a) - impactRank(b))

  return (
    <ModuleCard
      question="What could move the share now — meets, sector news and catalysts, ranked by impact?"
      title="AI Market Intelligence"
      icon="events"
    >
      {/* AI provenance banner — this is generated intelligence, not audited data. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#EAD9B6]/70 bg-gradient-to-r from-[#FBF6EA] to-white px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-champagne-deep">
          <Sparkles className="h-3.5 w-3.5" /> AI-generated · {companyName} &amp; sector · verify before acting
        </span>
        <span className="text-[10px] text-ink-secondary">
          {meta.dataset === 'pending' || !meta.last_updated ? 'Awaiting first generation' : `Generated ${fmtDate(meta.last_updated)}`}
        </span>
      </div>

      {sorted.length === 0 ? (
        <DataEmptyState
          kind="pending"
          height={220}
          title="Intelligence is being generated"
          body={`The AI scan for ${companyName} — upcoming investor meets, board & earnings dates, sector and regulatory news, and share catalysts — runs via the muns agent and will populate here. Every item links its source.`}
        />
      ) : (
        <div className="space-y-2">
          {sorted.map((i, idx) => {
            const imp = IMPACT[i.impact ?? 'neutral'] ?? IMPACT.neutral
            const upcoming = i.horizon === 'upcoming'
            return (
              <div key={i.id ?? idx} className="rounded-xl border border-soft-border bg-white p-3 transition-colors hover:border-navy-primary/30">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-ink-secondary">
                    {upcoming ? <CalendarClock className="h-3.5 w-3.5 text-navy-primary" /> : <Newspaper className="h-3.5 w-3.5 text-ink-secondary" />}
                    {fmtDate(i.date)}
                  </span>
                  {upcoming && <span className="rounded-full bg-soft-blue px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-navy-primary">Upcoming</span>}
                  <span className="rounded-full bg-ice px-1.5 py-0.5 text-[9.5px] font-semibold text-ink-secondary">{KIND_LABEL[i.kind ?? ''] ?? 'Update'}</span>
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-semibold" style={{ background: imp.bg, color: imp.fg }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: imp.dot }} />{imp.label}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] font-semibold leading-snug text-navy-deep">{i.headline}</p>
                {i.detail && <p className="mt-0.5 text-[11.5px] leading-snug text-ink-secondary">{i.detail}</p>}
                {i.source_url && (
                  <a href={i.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium text-navy-primary hover:underline">
                    {i.source_name || 'Source'}<ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </ModuleCard>
  )
}
