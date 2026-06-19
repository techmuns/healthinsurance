import { Sparkles, ExternalLink, CalendarClock, Newspaper } from 'lucide-react'
import { ModuleCard } from '@/components/ModuleCard'
import { DataEmptyState } from '@/components/DataEmptyState'
import { PromiseTracker } from '@/components/PromiseTracker'
import { VerdictStrip, type VerdictTone } from '@/components/VerdictStrip'
import { getPromises } from '@/lib/promiseTracker'
import { getManagementEvents } from '@/lib/dataLayer'
import { classifySource, sourceHref, isLinkable } from '@/lib/sourceHealth'
import { useActiveCompany } from '@/state/filters'
import intelSnapshot from '@/data/snapshots/market-intelligence-snapshot.json'

/**
 * Management & Events section. Two real, source-backed blocks: the Promise
 * Tracker (management's public guidance vs the audited FY25 outcome) and a live
 * AI Market Intelligence feed (events, regulatory shifts and catalysts, each
 * source-linked). Structured board / KMP-change events join automatically once
 * the exchange / IR feed returns parseable records.
 */
export function ManagementEvents() {
  const company = useActiveCompany()
  const promises = getPromises(company.id)
  const delivered = promises.filter((p) => p.status === 'Delivered').length
  const missed = promises.filter((p) => p.status === 'Missed').length
  const total = promises.length
  // Live intelligence in view for this company (its own items + sector-wide).
  const intelCount = (intelSnapshot.data as Array<{ company_id?: string }>).filter(
    (i) => !i.company_id || i.company_id === company.id || i.company_id === 'sector' || i.company_id === 'all',
  ).length

  // Answer-first verdict from the AUDITED promise record (the intelligence feed is
  // AI-generated, so it colours the summary but never the verdict).
  const onTrack = total > 0 && missed === 0 && delivered * 2 >= total
  const verdict = total === 0 ? 'Live intelligence' : missed > 0 ? 'Watch the misses' : onTrack ? 'Largely on track' : 'In progress'
  const tone: VerdictTone = total === 0 ? 'navy' : missed > 0 ? 'warning' : onTrack ? 'teal' : 'navy'
  const badge = total === 0 ? `${intelCount} live` : `${delivered}/${total} delivered`
  const stats = total === 0
    ? [{ label: 'Live signals', value: String(intelCount) }]
    : [{ label: 'Promises delivered', value: `${delivered}/${total}` }, { label: 'Live signals', value: String(intelCount) }]
  const summary = total === 0
    ? `A live scan of the events, regulatory shifts and catalysts that could move ${company.shortName} and the sector — each item source-linked. Guidance tracking turns on once ${company.shortName}'s commitments are on record. The intelligence feed is AI-generated; verify before acting.`
    : `We hold ${company.shortName} to its word — public guidance against the audited FY25 outcome — next to a live scan of the events, regulatory shifts and catalysts that could move the stock. Guidance is audited; the intelligence feed is AI-generated and source-linked.`

  return (
    <div className="space-y-6">
      <VerdictStrip
        eyebrow="Governance Signal"
        verdict={verdict}
        tone={tone}
        badge={badge}
        summary={summary}
        stats={stats}
        source={total > 0 ? 'Company filing' : 'Mixed: IRDAI + Company filing'}
        sourceFrequency="Event-based"
        sourceStatus="available"
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

      {/* Board & leadership changes — hidden until the scheduled exchange/IR feed
          returns real, datable events; then it appears automatically. */}
      <BoardEvents companyId={company.id} />

      <MarketIntelligence companyId={company.id} companyName={company.shortName} />
    </div>
  )
}

// ── Board & leadership changes (exchange / IR event feed) ────────────────────
// Appointment / resignation / board / KMP-change events parsed from NSE-BSE
// announcements + IR press releases. Real and source-linked, or absent — never
// a fabricated or "pending" placeholder (the section reads complete without it).

interface MgmtEventRow {
  event_date?: string | null
  event_type?: string
  person_name?: string | null
  designation?: string | null
  event_summary?: string
  source_url?: string | null
  confidence?: string
}

const EVENT_META: Record<string, { label: string; dot: string; bg: string; fg: string }> = {
  appointment: { label: 'Appointment', dot: '#168E8E', bg: 'rgba(22,142,142,0.12)', fg: '#0E6F6D' },
  reappointment: { label: 'Re-appointment', dot: '#168E8E', bg: 'rgba(22,142,142,0.12)', fg: '#0E6F6D' },
  resignation: { label: 'Resignation', dot: '#C0584F', bg: 'rgba(192,88,79,0.12)', fg: '#A8443B' },
  termination: { label: 'Cessation', dot: '#C0584F', bg: 'rgba(192,88,79,0.12)', fg: '#A8443B' },
  kmp_change: { label: 'KMP change', dot: '#27457E', bg: 'rgba(39,69,126,0.10)', fg: '#27457E' },
  board_change: { label: 'Board change', dot: '#27457E', bg: 'rgba(39,69,126,0.10)', fg: '#27457E' },
  authorization: { label: 'Authorisation', dot: '#8C97A8', bg: 'rgba(140,151,168,0.14)', fg: '#5B6573' },
  esop: { label: 'ESOP', dot: '#B68B3A', bg: 'rgba(182,139,58,0.16)', fg: '#8A6516' },
}

function BoardEvents({ companyId }: { companyId: string }) {
  const { rows } = getManagementEvents(companyId) as { rows: MgmtEventRow[] }
  if (!rows || rows.length === 0) return null // honest absence — no placeholder
  const sorted = [...rows].sort((a, b) => String(b.event_date ?? '').localeCompare(String(a.event_date ?? '')))

  return (
    <ModuleCard question="Who's joining, leaving or changing roles at the top?" title="Board & leadership changes" icon="events">
      <div className="space-y-2">
        {sorted.map((e, idx) => {
          const meta = EVENT_META[e.event_type ?? ''] ?? EVENT_META.board_change
          return (
            <div key={idx} className="rounded-xl border border-soft-border bg-white p-3 transition-colors hover:border-navy-primary/30">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-ink-secondary">
                  <CalendarClock className="h-3.5 w-3.5 text-navy-primary" />{fmtDate(e.event_date)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-semibold" style={{ background: meta.bg, color: meta.fg }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />{meta.label}
                </span>
                {e.confidence && e.confidence !== 'high' && <span className="rounded-full bg-ice px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-secondary">{e.confidence} confidence</span>}
              </div>
              {(e.person_name || e.designation) && (
                <p className="mt-1.5 text-[13px] font-semibold leading-snug text-navy-deep">
                  {e.person_name}{e.person_name && e.designation ? ' · ' : ''}{e.designation && <span className="font-normal text-ink-secondary">{e.designation}</span>}
                </p>
              )}
              {e.event_summary && <p className="mt-0.5 text-[11.5px] leading-snug text-ink-secondary">{e.event_summary}</p>}
              {isLinkable(e.source_url) && (
                <a href={sourceHref(e.source_url)!} target="_blank" rel="noreferrer" title={classifySource(e.source_url).hint} className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium text-navy-primary hover:underline">
                  Exchange / IR filing<ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )
        })}
      </div>
    </ModuleCard>
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
                {isLinkable(i.source_url) && (
                  <a href={sourceHref(i.source_url)!} target="_blank" rel="noreferrer" title={classifySource(i.source_url).hint} className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium text-navy-primary hover:underline">
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
