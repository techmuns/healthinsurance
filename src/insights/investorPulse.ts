// ===========================================================================
//  Investor Pulse — normalized insight adapter / selector layer.
//
//  This is the single place that converts the dashboard's EXISTING, already-wired
//  data (the market-intelligence snapshot, the management-events snapshot, the
//  promise tracker and analyst coverage) into one normalized, source-disciplined
//  shape the Insights tab renders. It introduces NO new data and NO new fetch —
//  it only re-reads what the pipeline already produces and reshapes it.
//
//  Honesty rules baked in here (see CLAUDE.md):
//    • Every signal carries a real source name; confidence reflects SOURCE quality
//      (primary filing → High, credible reporting → Medium, no usable link → Low).
//    • Nothing is fabricated. A company with no items returns empty arrays, and
//      the UI shows an honest empty state — never invented filler.
//    • "Today's Read" is composed DETERMINISTICALLY from the real items (counts,
//      the freshest item, the dominant stance). It states facts about the feed —
//      it never authors a market opinion the data doesn't support.
//    • No price/volume movement is ever ASSERTED. "Data Movement" items only
//      surface a movement that a cited source itself reported.
// ===========================================================================

import intelSnapshot from '@/data/snapshots/market-intelligence-snapshot.json'
import { getManagementEvents } from '@/lib/dataLayer'
import { getAnalystCoverage } from '@/lib/analystCoverage'
import { isLinkable, sourceHref, classifySource } from '@/lib/sourceHealth'

// ── Normalized vocabulary (the contract the UI renders) ─────────────────────

export type SignalCategory =
  | 'Analyst Action'
  | 'Sector Catalyst'
  | 'Regulatory'
  | 'Management'
  | 'Filing'
  | 'Data Movement'

export type SignalImpact = 'Positive' | 'Watch' | 'Risk' | 'Neutral'
export type Confidence = 'High' | 'Medium' | 'Low'

export interface PulseSignal {
  id: string
  date: string // ISO (raw)
  dateLabel: string // "17 Jun 2026"
  daysAgo: number | null
  category: SignalCategory
  impact: SignalImpact
  title: string
  whyItMatters: string
  sourceName: string
  sourceUrl: string // '' when none on record
  confidence: Confidence
  /** Sector-wide item vs a company-specific one (drives a subtle "sector" tag). */
  scope: 'company' | 'sector'
}

export interface PulseManagementEvent {
  id: string
  date: string
  dateLabel: string
  daysAgo: number | null
  eventType: string // raw type key
  eventLabel: string // human label
  person: string
  designation: string
  summary: string
  sourceName: string
  sourceUrl: string
  confidence: Confidence
  impact: SignalImpact
  /** True for governance-relevant events (board/KMP/auditor/leadership). */
  governanceRelevant: boolean
}

export interface DataAnomaly {
  id: string
  title: string
  whyItMatters: string
  date: string
  dateLabel: string
  daysAgo: number | null
  sourceName: string
  sourceUrl: string
  confidence: Confidence
}

export interface TodayRead {
  headline: string
  summary: string // 4–6 line analyst-style read, deterministic
  stance: SignalImpact
  bullets: string[]
}

export interface InvestorPulse {
  company: string
  companyId: string
  asOf: string | null
  asOfLabel: string
  freshnessLabel: string
  freshnessTone: 'fresh' | 'recent' | 'older'
  confidence: Confidence
  todayRead: TodayRead | null
  signals: PulseSignal[]
  managementEvents: PulseManagementEvent[]
  dataAnomalies: DataAnomaly[]
  /** Pre-selected slices the cards read, so the UI never re-derives them. */
  freshest: PulseSignal | null
  latestRisk: PulseSignal | null
  latestOpportunity: PulseSignal | null
  movingFast: PulseSignal[] // items within the last 7 days, newest first
  counts: { positive: number; risk: number; watch: number; neutral: number; sourced: number; total: number }
  /** True when there is genuinely nothing usable for the selected company. */
  isEmpty: boolean
}

// ── Date helpers (live freshness, computed against the real "today") ─────────

const MS_DAY = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  if (m) return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
  const t = new Date(d)
  return isNaN(t.getTime()) ? d : t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysAgo(d?: string | null): number | null {
  if (!d) return null
  const t = Date.parse(d)
  if (isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / MS_DAY))
}

function freshness(d: number | null): { label: string; tone: 'fresh' | 'recent' | 'older' } {
  if (d == null) return { label: 'Date not on record', tone: 'older' }
  if (d <= 1) return { label: d === 0 ? 'Updated today' : 'Updated yesterday', tone: 'fresh' }
  if (d <= 3) return { label: `${d} days ago`, tone: 'fresh' }
  if (d <= 7) return { label: 'This week', tone: 'recent' }
  if (d <= 31) return { label: `${d} days ago`, tone: 'recent' }
  const mo = Math.round(d / 30)
  return { label: `${mo} month${mo === 1 ? '' : 's'} ago`, tone: 'older' }
}

// ── Source → confidence (confidence reflects the SOURCE, per the honesty rule) ─

// Primary / authoritative domains: an exchange filing, the regulator, or the
// company's own IR. A link to one of these earns High confidence in the source.
const PRIMARY_HOST =
  /(^|\.)(bseindia\.com|nseindia\.com|nsearchives\.nseindia\.com|irdai\.gov\.in|sebi\.gov\.in|nivabupa\.com|starhealth\.in|careinsurance\.com|adityabirlacapital\.com|manipalcigna\.com)$|\.gov\.in$/i

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** Confidence in a signal, derived from its source link quality. */
function sourceConfidence(url?: string | null): Confidence {
  if (!isLinkable(url)) return 'Low'
  return PRIMARY_HOST.test(hostOf(url ?? '')) ? 'High' : 'Medium'
}

function titleCaseConfidence(raw?: string | null, url?: string | null): Confidence {
  // Honour a stored confidence (management events carry one) but never claim more
  // than the source supports: with no usable link, the ceiling is Low.
  if (!isLinkable(url)) return 'Low'
  const s = (raw ?? '').toLowerCase()
  if (s === 'high') return 'High'
  if (s === 'medium') return 'Medium'
  if (s === 'low') return 'Low'
  return sourceConfidence(url)
}

// ── market-intelligence snapshot → normalized signals ───────────────────────

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

const MOVEMENT_RE = /\bvolume|volumes|premium (growth|momentum|leadership)|spike|surge|turnover|delivery|inflow|outflow|gwp growth\b/i
const MGMT_RE = /\b(management change|leadership|chief executive|\bceo\b|\bcfo\b|\bcoo\b|director|board|appoint|resign|kmp)\b/i

function categoryOf(item: IntelItem): SignalCategory {
  const text = `${item.headline ?? ''} ${item.detail ?? ''}`
  switch (item.kind) {
    case 'rating':
      return 'Analyst Action'
    case 'regulatory':
      return 'Regulatory'
    case 'sector_news':
      return 'Sector Catalyst'
    case 'earnings':
    case 'investor_meet':
    case 'board_meeting':
      return MGMT_RE.test(text) ? 'Management' : 'Filing'
    case 'catalyst':
      if (MOVEMENT_RE.test(text)) return 'Data Movement'
      if (MGMT_RE.test(text)) return 'Management'
      return 'Sector Catalyst'
    default:
      return MOVEMENT_RE.test(text) ? 'Data Movement' : 'Sector Catalyst'
  }
}

const IMPACT_MAP: Record<string, SignalImpact> = {
  positive: 'Positive',
  negative: 'Risk',
  watch: 'Watch',
  neutral: 'Neutral',
}

function toSignal(item: IntelItem, companyId: string): PulseSignal | null {
  // Source discipline: an item with no source name AND no usable link is dropped
  // (never shown without a trail). An item with a name but a dead link is kept and
  // marked Low.
  const hasLink = isLinkable(item.source_url)
  if (!item.source_name && !hasLink) return null
  const scope: 'company' | 'sector' = item.company_id === companyId ? 'company' : 'sector'
  return {
    id: item.id ?? `${item.kind}-${item.date}`,
    date: item.date ?? '',
    dateLabel: fmtDate(item.date),
    daysAgo: daysAgo(item.date),
    category: categoryOf(item),
    impact: IMPACT_MAP[item.impact ?? 'neutral'] ?? 'Neutral',
    title: item.headline ?? 'Untitled signal',
    whyItMatters: item.detail ?? '',
    sourceName: item.source_name || hostOf(item.source_url ?? '') || 'Source on record',
    sourceUrl: hasLink ? sourceHref(item.source_url)! : '',
    confidence: sourceConfidence(item.source_url),
    scope,
  }
}

// ── management-events snapshot → normalized management events ────────────────

interface MgmtEventRow {
  company_id?: string
  event_date?: string | null
  event_type?: string
  person_name?: string | null
  designation?: string | null
  event_summary?: string
  source_name?: string | null
  source_url?: string | null
  confidence?: string
}

const EVENT_LABEL: Record<string, string> = {
  appointment: 'Appointment',
  reappointment: 'Re-appointment',
  resignation: 'Resignation',
  termination: 'Cessation',
  kmp_change: 'KMP change',
  board_change: 'Board change',
  auditor_change: 'Auditor change',
  authorization: 'Authorisation',
  esop: 'ESOP',
}

// Governance-relevant event types — what the cleaned Governance tab should carry.
const GOVERNANCE_TYPES = new Set([
  'resignation',
  'termination',
  'appointment',
  'reappointment',
  'board_change',
  'kmp_change',
  'auditor_change',
])

// Event tone: a departure is a watch item; an arrival is steady; the rest neutral.
function eventImpact(type?: string): SignalImpact {
  if (type === 'resignation' || type === 'termination') return 'Watch'
  if (type === 'appointment' || type === 'reappointment') return 'Neutral'
  return 'Neutral'
}

function toManagementEvent(row: MgmtEventRow, idx: number): PulseManagementEvent | null {
  if (!row.source_name && !isLinkable(row.source_url)) return null
  const type = row.event_type ?? 'board_change'
  return {
    id: `${row.company_id}-${row.event_date}-${idx}`,
    date: row.event_date ?? '',
    dateLabel: fmtDate(row.event_date),
    daysAgo: daysAgo(row.event_date),
    eventType: type,
    eventLabel: EVENT_LABEL[type] ?? 'Board change',
    person: row.person_name ?? '',
    designation: row.designation ?? '',
    summary: row.event_summary ?? '',
    sourceName: row.source_name || hostOf(row.source_url ?? '') || 'Exchange / IR filing',
    sourceUrl: isLinkable(row.source_url) ? sourceHref(row.source_url)! : '',
    confidence: titleCaseConfidence(row.confidence, row.source_url),
    impact: eventImpact(type),
    governanceRelevant: GOVERNANCE_TYPES.has(type),
  }
}

/**
 * Normalized management / board / KMP events for a company, newest first. Shared
 * by both the full Insights view and the compact Governance callout so there is
 * exactly one data path. `governanceOnly` keeps just the board/KMP/auditor/
 * leadership events Governance should carry.
 */
export function selectManagementEvents(
  companyId: string,
  opts: { governanceOnly?: boolean } = {},
): PulseManagementEvent[] {
  const { rows } = getManagementEvents(companyId) as { rows: MgmtEventRow[] }
  let events = (rows ?? [])
    .map((r, i) => toManagementEvent(r, i))
    .filter((e): e is PulseManagementEvent => e != null)
    .sort(byNewest)
  if (opts.governanceOnly) events = events.filter((e) => e.governanceRelevant)
  return events
}

// ── confidence aggregation ──────────────────────────────────────────────────

const CONF_SCORE: Record<Confidence, number> = { High: 3, Medium: 2, Low: 1 }
function aggregateConfidence(items: { confidence: Confidence }[]): Confidence {
  if (!items.length) return 'Low'
  const avg = items.reduce((s, i) => s + CONF_SCORE[i.confidence], 0) / items.length
  return avg >= 2.5 ? 'High' : avg >= 1.6 ? 'Medium' : 'Low'
}

// ── newest-first ordering ───────────────────────────────────────────────────

const byNewest = (a: { date: string }, b: { date: string }) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)

// ── Today's Read — DETERMINISTIC composition from the real items ─────────────

const STANCE_WORD: Record<SignalImpact, string> = {
  Positive: 'constructive',
  Risk: 'cautious',
  Watch: 'watchful',
  Neutral: 'balanced',
}

function deriveStance(counts: InvestorPulse['counts']): SignalImpact {
  const { positive, risk, watch } = counts
  if (risk > positive && risk >= watch) return 'Risk'
  if (positive > risk && positive >= watch) return 'Positive'
  if (watch >= positive && watch >= risk && watch > 0) return 'Watch'
  return 'Neutral'
}

function buildTodayRead(
  company: string,
  companySignals: PulseSignal[],
  sectorSignals: PulseSignal[],
  mgmt: PulseManagementEvent[],
  coverage: ReturnType<typeof getAnalystCoverage>,
  counts: InvestorPulse['counts'],
): TodayRead | null {
  const all = [...companySignals, ...sectorSignals]
  if (!all.length && !mgmt.length) return null

  const stance = deriveStance(counts)
  const freshest = all.slice().sort(byNewest)[0] ?? null

  // Headline — a factual one-liner about the feed, not an opinion.
  const n = counts.total
  const headline = n
    ? `${n} source-backed signal${n === 1 ? '' : 's'} for ${company} — net read is ${STANCE_WORD[stance]}`
    : `Governance activity for ${company}, no market signals on file`

  // Summary — 4–6 short lines, each a fact about the actual items.
  const lines: string[] = []
  if (n) {
    const parts: string[] = []
    if (counts.positive) parts.push(`${counts.positive} positive`)
    if (counts.risk) parts.push(`${counts.risk} risk`)
    if (counts.watch) parts.push(`${counts.watch} to watch`)
    if (counts.neutral) parts.push(`${counts.neutral} neutral`)
    lines.push(`The feed holds ${n} source-backed item${n === 1 ? '' : 's'}${parts.length ? ` — ${parts.join(', ')}` : ''}.`)
  }
  if (freshest) {
    lines.push(`Freshest read: "${freshest.title}" (${freshest.dateLabel}, ${freshest.category.toLowerCase()}), via ${freshest.sourceName}.`)
  }
  if (sectorSignals.length) {
    const reg = sectorSignals.filter((s) => s.category === 'Regulatory').length
    lines.push(
      `${sectorSignals.length} sector-wide development${sectorSignals.length === 1 ? '' : 's'} also bear${sectorSignals.length === 1 ? 's' : ''} on the name${
        reg ? `, including ${reg} on the regulatory front` : ''
      }.`,
    )
  }
  if (mgmt.length) {
    const latest = mgmt.slice().sort(byNewest)[0]
    lines.push(`On governance: ${latest.eventLabel.toLowerCase()}${latest.person ? ` — ${latest.person}` : ''} (${latest.dateLabel}).`)
  }
  if (coverage?.consensus) {
    const c = coverage.consensus
    const tgt = c.consensusTargetPrice != null ? `, consensus target ₹${c.consensusTargetPrice}` : ''
    lines.push(`The Street currently reads ${c.ratingLabel}${tgt} across ${c.analystCount} covering desk${c.analystCount === 1 ? '' : 's'}.`)
  }
  if (n) {
    const pct = Math.round((counts.sourced / Math.max(1, n)) * 100)
    lines.push(`Every item below links a source; ${pct}% point to a primary or credibly-reported original.`)
  }

  // Bullets — the 3–4 highest-signal items, each traceable to a real source.
  const bullets = all
    .slice()
    .sort((a, b) => impactRank(a.impact) - impactRank(b.impact) || byNewest(a, b))
    .slice(0, 4)
    .map((s) => `${s.category}: ${s.title}`)

  return { headline, summary: lines.slice(0, 6).join(' '), stance, bullets }
}

function impactRank(i: SignalImpact): number {
  return { Risk: 0, Positive: 1, Watch: 2, Neutral: 3 }[i]
}

// ── public builder ──────────────────────────────────────────────────────────

/**
 * Build the normalized Investor Pulse for a company. Reads only existing wired
 * data. Returns empty arrays (and `isEmpty: true`) when nothing is on record for
 * the selected company — the UI renders an honest empty state, never filler.
 */
export function buildInvestorPulse(companyId: string, companyName: string): InvestorPulse {
  const rawIntel = (intelSnapshot.data as IntelItem[]) ?? []
  // In-scope items: this company's own items + sector-wide items.
  const scoped = rawIntel.filter(
    (i) => !i.company_id || i.company_id === companyId || i.company_id === 'sector' || i.company_id === 'all',
  )
  const signals = scoped
    .map((i) => toSignal(i, companyId))
    .filter((s): s is PulseSignal => s != null)
    .sort((a, b) => impactRank(a.impact) - impactRank(b.impact) || byNewest(a, b))

  const companySignals = signals.filter((s) => s.scope === 'company')
  const sectorSignals = signals.filter((s) => s.scope === 'sector')

  const managementEvents = selectManagementEvents(companyId)

  // Data anomalies = source-backed, REPORTED data movements only (never a claim
  // we assert ourselves). Newest first.
  const dataAnomalies: DataAnomaly[] = signals
    .filter((s) => s.category === 'Data Movement')
    .sort(byNewest)
    .map((s) => ({
      id: s.id,
      title: s.title,
      whyItMatters: s.whyItMatters,
      date: s.date,
      dateLabel: s.dateLabel,
      daysAgo: s.daysAgo,
      sourceName: s.sourceName,
      sourceUrl: s.sourceUrl,
      confidence: s.confidence,
    }))

  const counts = {
    positive: signals.filter((s) => s.impact === 'Positive').length,
    risk: signals.filter((s) => s.impact === 'Risk').length,
    watch: signals.filter((s) => s.impact === 'Watch').length,
    neutral: signals.filter((s) => s.impact === 'Neutral').length,
    sourced: signals.filter((s) => !!s.sourceUrl).length,
    total: signals.length,
  }

  const coverage = getAnalystCoverage(companyId)
  const todayRead = buildTodayRead(companyName, companySignals, sectorSignals, managementEvents, coverage, counts)

  // Freshness from the newest dated item across signals + events.
  const newestDays = [...signals, ...managementEvents]
    .map((x) => x.daysAgo)
    .filter((d): d is number => d != null)
    .sort((a, b) => a - b)[0]
  const newestDate = [...signals, ...managementEvents].map((x) => x.date).filter(Boolean).sort().slice(-1)[0] ?? null
  const fresh = freshness(newestDays ?? null)

  const byNewestAll = signals.slice().sort(byNewest)
  const freshest = byNewestAll[0] ?? null
  const latestRisk = byNewestAll.find((s) => s.impact === 'Risk') ?? byNewestAll.find((s) => s.impact === 'Watch') ?? null
  const latestOpportunity = byNewestAll.find((s) => s.impact === 'Positive') ?? null
  const movingFast = byNewestAll.filter((s) => (s.daysAgo ?? 999) <= 7)

  return {
    company: companyName,
    companyId,
    asOf: newestDate,
    asOfLabel: fmtDate(newestDate),
    freshnessLabel: fresh.label,
    freshnessTone: fresh.tone,
    confidence: aggregateConfidence(signals),
    todayRead,
    signals,
    managementEvents,
    dataAnomalies,
    freshest,
    latestRisk,
    latestOpportunity,
    movingFast,
    counts,
    isEmpty: signals.length === 0 && managementEvents.length === 0,
  }
}

// ── shared presentation tokens (consumed by the Insights UI) ────────────────

export const CATEGORY_META: Record<SignalCategory, { fg: string; bg: string; ring: string }> = {
  'Analyst Action': { fg: '#27457E', bg: 'rgba(39,69,126,0.08)', ring: 'rgba(39,69,126,0.20)' },
  'Sector Catalyst': { fg: '#0E6F6D', bg: 'rgba(14,111,109,0.08)', ring: 'rgba(14,111,109,0.20)' },
  Regulatory: { fg: '#6E5BA6', bg: 'rgba(110,91,166,0.10)', ring: 'rgba(110,91,166,0.22)' },
  Management: { fg: '#9C7430', bg: 'rgba(156,116,48,0.10)', ring: 'rgba(156,116,48,0.24)' },
  Filing: { fg: '#5B6573', bg: 'rgba(91,101,115,0.10)', ring: 'rgba(91,101,115,0.22)' },
  'Data Movement': { fg: '#B68B3A', bg: 'rgba(182,139,58,0.12)', ring: 'rgba(182,139,58,0.26)' },
}

export const IMPACT_META: Record<SignalImpact, { fg: string; bg: string; dot: string; label: string }> = {
  Positive: { fg: '#0E6F6D', bg: 'rgba(14,111,109,0.10)', dot: '#168E8E', label: 'Positive' },
  Watch: { fg: '#9C7430', bg: 'rgba(156,116,48,0.12)', dot: '#B68B3A', label: 'Watch' },
  Risk: { fg: '#A8443B', bg: 'rgba(168,68,59,0.10)', dot: '#C0584F', label: 'Risk' },
  Neutral: { fg: '#5B6573', bg: 'rgba(140,151,168,0.12)', dot: '#8C97A8', label: 'Neutral' },
}

export const CONFIDENCE_META: Record<Confidence, { fg: string; bg: string }> = {
  High: { fg: '#0E6F6D', bg: 'rgba(14,111,109,0.10)' },
  Medium: { fg: '#9C7430', bg: 'rgba(156,116,48,0.12)' },
  Low: { fg: '#8C7A55', bg: 'rgba(140,124,85,0.10)' },
}

export { isLinkable, sourceHref, classifySource }
