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
import generated from '@/data/insights.generated.json'
import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'
import peerSnapshot from '@/data/snapshots/sahi-peer-comparison.json'
import type { Insight, InsightCategory, InsightsFile } from '@/insights/types'
import { getManagementEvents } from '@/lib/dataLayer'
import { getAnalystCoverage } from '@/lib/analystCoverage'
import { getPromises } from '@/lib/promiseTracker'
import { getEarningsBridge, earningsQuality, BRIDGE_SOURCE, BRIDGE_SOURCE_URL } from '@/data/earningsBridge'
import { isLinkable, sourceHref, classifySource } from '@/lib/sourceHealth'

const INSIGHTS_FILE = generated as unknown as InsightsFile

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

// ── Lens layer (the internal Insights analysis lenses) ──────────────────────

export type LensKey =
  | 'overviewPulse'
  | 'underwritingProfitability'
  | 'investmentPerformance'
  | 'growthLevers'
  | 'expenseManagement'
  | 'competitivePositioning'
  | 'forwardLookingStrategy'
  | 'riskRegulatoryChanges'

/** A single source-backed metric read shown in a lens's metric strip. */
export interface MetricRead {
  label: string
  value: string // formatted; null metrics are omitted, never shown as a fake 0
  period: string
  tone: SignalImpact
  note?: string
  sourceName: string
  sourceUrl: string
}

export interface SourceRef {
  name: string
  url: string
}

/** The normalized brief for one analysis lens (buy-side framing). */
export interface InsightLens {
  key: LensKey
  title: string
  purpose: string
  oneLineRead: string
  stance: SignalImpact
  confidence: Confidence
  keyInsights: string[]
  missedSignals: string[]
  investorImplication: string
  watchNext: string[]
  sourceRefs: SourceRef[]
  /** ids of deep-dive insights (insights.generated.json) rendered as flip cards. */
  insightIds: string[]
  metrics: MetricRead[]
  relatedSignals: PulseSignal[]
  /** False → the lens shows an honest "not enough verified data yet" state. */
  available: boolean
}

// Display order + copy for the lens chips (Overview first, then the deep lenses).
export const LENS_META: Record<LensKey, { title: string; purpose: string }> = {
  overviewPulse: { title: 'Overview Pulse', purpose: 'What changed, what matters, and what needs attention today.' },
  underwritingProfitability: { title: 'Underwriting Profitability', purpose: 'Is the premium growth profitable, or bought at a loss?' },
  growthLevers: { title: 'Growth Levers', purpose: 'Where premium growth actually comes from — and is it durable.' },
  competitivePositioning: { title: 'Competitive Positioning', purpose: 'How the company stands against its peers.' },
  expenseManagement: { title: 'Expense Management', purpose: 'Cost discipline and whether scale is improving margins.' },
  investmentPerformance: { title: 'Investment Performance', purpose: 'How the float is invested, and how much profit leans on it.' },
  forwardLookingStrategy: { title: 'Forward-Looking Strategy', purpose: 'Management plan, execution credibility and future catalysts.' },
  riskRegulatoryChanges: { title: 'Risk & Regulatory Changes', purpose: 'Regulation, sector risk and the company-specific exposure.' },
}
export const LENS_ORDER: LensKey[] = [
  'overviewPulse',
  'underwritingProfitability',
  'growthLevers',
  'competitivePositioning',
  'expenseManagement',
  'investmentPerformance',
  'forwardLookingStrategy',
  'riskRegulatoryChanges',
]
/** The deep analytical lenses (everything except the Overview digest). */
export const ANALYTICAL_LENSES: LensKey[] = LENS_ORDER.filter((k) => k !== 'overviewPulse')

// ── No-loss migration map ───────────────────────────────────────────────────
// Every existing deep-dive insight is routed to exactly one lens. An explicit
// per-id map handles cases where same-category insights belong in different
// lenses (e.g. the two "quality" insights split between Underwriting and Growth);
// a category fallback guarantees any FUTURE insight still lands somewhere. No
// insight is ever dropped — it is reassigned.
const LENS_BY_INSIGHT_ID: Record<string, LensKey> = {
  'care-solvency-runway': 'riskRegulatoryChanges',
  'segment-underwriting-loss': 'underwritingProfitability',
  'niva-pb-roe-dislocation': 'competitivePositioning',
  'niva-retail-mix-drift': 'growthLevers',
  'aditya-growth-quality': 'growthLevers',
  'manipal-cr-outlier': 'underwritingProfitability',
  'niva-credibility-thin-coverage': 'forwardLookingStrategy',
}
const LENS_BY_CATEGORY: Record<InsightCategory, LensKey> = {
  growth: 'growthLevers',
  quality: 'underwritingProfitability',
  earnings_quality: 'underwritingProfitability',
  valuation: 'competitivePositioning',
  capital: 'riskRegulatoryChanges',
  management: 'forwardLookingStrategy',
  regulatory: 'riskRegulatoryChanges',
  market_structure: 'competitivePositioning',
}
/** The lens a deep-dive insight belongs to (id override, else category). */
export function lensForInsight(ins: Insight): LensKey {
  return LENS_BY_INSIGHT_ID[ins.id] ?? LENS_BY_CATEGORY[ins.category]
}

// Curated-market-intelligence signals also feed the relevant deep lens.
const SIGNAL_LENS: Record<SignalCategory, LensKey> = {
  'Analyst Action': 'competitivePositioning',
  'Sector Catalyst': 'riskRegulatoryChanges',
  Regulatory: 'riskRegulatoryChanges',
  Management: 'forwardLookingStrategy',
  Filing: 'forwardLookingStrategy',
  'Data Movement': 'growthLevers',
}

// Deterministic category → stance (mirrors the flip card's tone semantics).
const CATEGORY_STANCE: Record<InsightCategory, SignalImpact> = {
  capital: 'Risk',
  earnings_quality: 'Risk',
  valuation: 'Watch',
  growth: 'Positive',
  quality: 'Watch',
  management: 'Neutral',
  regulatory: 'Watch',
  market_structure: 'Neutral',
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
  /** The deep analysis lenses, keyed by lens id (Overview excluded — it is the digest). */
  lenses: Record<Exclude<LensKey, 'overviewPulse'>, InsightLens>
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

// ── Lens builders — real, source-backed metric reads + synthesized briefs ────
//
//  Metric reads come straight from the wired snapshots (sahi-peer-comparison FY25
//  for the headline ratios with their provenance, the insurer-annual-snapshot for
//  the series fields). Null fields are simply OMITTED — never shown as a fake 0.
//  The lens "brief" fields (oneLineRead, missed signals, implication, watch-next)
//  are synthesized DETERMINISTICALLY from the curated insights already mapped into
//  the lens — no model prose, no fabrication.

interface Provenance {
  source_name?: string | null
  source_url?: string | null
  confidence?: string | null
}
interface PeerRow {
  company_id: string
  fiscal_year?: string
  gwp?: number | null
  growth?: number | null
  health_market_share?: number | null
  retail_health_market_share?: number | null
  pat?: number | null
  combined_ratio?: number | null
  claims_ratio?: number | null
  expense_ratio?: number | null
  solvency_ratio?: number | null
  distribution_concentration?: number | null
  provenance?: Provenance
}
interface AnnualRow {
  company_id: string
  fiscal_year: string
  gwp?: number | null
  nwp?: number | null
  nep?: number | null
  combined_ratio?: number | null
  claims_ratio?: number | null
  expense_ratio?: number | null
  commission_ratio?: number | null
  solvency_ratio?: number | null
  roe?: number | null
  market_share?: number | null
  retail_mix?: number | null
  group_mix?: number | null
  growth_yoy?: number | null
  market_share_change?: number | null
  provenance?: Provenance
}

const round1 = (v: number) => Math.round(v * 10) / 10
const fmtPct = (v: number) => `${round1(v)}%`
const fmtX = (v: number) => `${Math.round(v * 100) / 100}x`
const fmtCr = (v: number) => `${v < 0 ? '-' : ''}₹${Math.abs(v).toLocaleString('en-IN')} Cr`
// Provenance source_name fields can be long prose ("Niva Bupa FY24-25 Annual
// Report — Schedule 1 …"). Keep just the clean head for a compact source chip.
function shortenSource(name?: string | null): string {
  if (!name) return 'Dashboard snapshot'
  const head = name.split(/\s[—–-]\s|\s*\(/)[0].trim()
  return head.length > 64 ? `${head.slice(0, 61)}…` : head || 'Dashboard snapshot'
}
const refOf = (p?: Provenance): SourceRef => ({ name: shortenSource(p?.source_name), url: p?.source_url || '' })
function firstSentence(s: string): string {
  const m = s.match(/^.*?[.!?](\s|$)/)
  return (m ? m[0] : s).trim()
}
function dedupeRefs(refs: SourceRef[]): SourceRef[] {
  const seen = new Set<string>()
  const out: SourceRef[] = []
  for (const r of refs) {
    const k = `${r.name}|${r.url}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

const combinedTone = (v: number): SignalImpact => (v < 100 ? 'Positive' : v <= 104 ? 'Watch' : 'Risk')
const expenseTone = (v: number): SignalImpact => (v < 33 ? 'Positive' : v <= 40 ? 'Watch' : 'Risk')
const growthTone = (v: number): SignalImpact => (v >= 20 ? 'Positive' : v >= 8 ? 'Neutral' : 'Watch')
const solvencyTone = (v: number): SignalImpact => (v >= 1.8 ? 'Positive' : v >= 1.5 ? 'Watch' : 'Risk')

/** First annual row (newest fiscal year) carrying a non-null value for `field`. */
function annualPick(rows: AnnualRow[], field: keyof AnnualRow): { value: number; period: string; src: SourceRef } | null {
  for (const r of rows) {
    const v = r[field]
    if (typeof v === 'number') return { value: v, period: r.fiscal_year, src: refOf(r.provenance) }
  }
  return null
}

function metricsForLens(
  key: Exclude<LensKey, 'overviewPulse'>,
  companyId: string,
  peerRow: PeerRow | undefined,
  annualRows: AnnualRow[],
  peerAll: PeerRow[],
): MetricRead[] {
  const out: MetricRead[] = []
  const peerSrc = refOf(peerRow?.provenance)
  const M = (label: string, value: string, period: string, tone: SignalImpact, src: SourceRef, note?: string): MetricRead => ({
    label,
    value,
    period,
    tone,
    note,
    sourceName: src.name,
    sourceUrl: src.url,
  })

  if (key === 'underwritingProfitability') {
    const cr = peerRow?.combined_ratio != null ? { value: peerRow.combined_ratio, period: peerRow.fiscal_year ?? 'FY25', src: peerSrc } : annualPick(annualRows, 'combined_ratio')
    if (cr) out.push(M('Combined ratio', fmtPct(cr.value), cr.period, combinedTone(cr.value), cr.src, cr.value > 100 ? 'Above the 100% break-even' : 'Below the 100% break-even'))
    const claims = peerRow?.claims_ratio != null ? { value: peerRow.claims_ratio, period: peerRow.fiscal_year ?? 'FY25', src: peerSrc } : annualPick(annualRows, 'claims_ratio')
    if (claims) out.push(M('Claims ratio', fmtPct(claims.value), claims.period, 'Neutral', claims.src, 'Premium paid back as claims'))
    const exp = peerRow?.expense_ratio != null ? { value: peerRow.expense_ratio, period: peerRow.fiscal_year ?? 'FY25', src: peerSrc } : annualPick(annualRows, 'expense_ratio')
    if (exp) out.push(M('Expense ratio', fmtPct(exp.value), exp.period, expenseTone(exp.value), exp.src))
  }

  if (key === 'expenseManagement') {
    const exp = peerRow?.expense_ratio != null ? { value: peerRow.expense_ratio, period: peerRow.fiscal_year ?? 'FY25', src: peerSrc } : annualPick(annualRows, 'expense_ratio')
    if (exp) out.push(M('Expense ratio', fmtPct(exp.value), exp.period, expenseTone(exp.value), exp.src))
    const comm = annualPick(annualRows, 'commission_ratio')
    if (comm) out.push(M('Commission ratio', fmtPct(comm.value), comm.period, 'Neutral', comm.src, 'Pay-out to distribution'))
  }

  if (key === 'growthLevers') {
    const gwp = annualPick(annualRows, 'gwp')
    if (gwp) out.push(M('Gross written premium', fmtCr(gwp.value), gwp.period, 'Neutral', gwp.src))
    const growth = peerRow?.growth != null ? { value: peerRow.growth, period: peerRow.fiscal_year ?? 'FY25', src: peerSrc } : annualPick(annualRows, 'growth_yoy')
    if (growth) out.push(M('GWP growth (YoY)', fmtPct(growth.value), growth.period, growthTone(growth.value), growth.src))
    const retail = annualPick(annualRows, 'retail_mix')
    const group = annualPick(annualRows, 'group_mix')
    if (retail) out.push(M('Retail mix', fmtPct(retail.value), retail.period, 'Neutral', retail.src, group ? `Group ${fmtPct(group.value)}` : 'Share of GWP from retail'))
    const ms = peerRow?.health_market_share != null ? { value: peerRow.health_market_share, period: peerRow.fiscal_year ?? 'FY25', src: peerSrc } : annualPick(annualRows, 'market_share')
    if (ms) out.push(M('Health market share', fmtPct(ms.value), ms.period, 'Neutral', ms.src))
  }

  if (key === 'competitivePositioning') {
    if (peerRow?.health_market_share != null) {
      const ranked = peerAll.filter((r) => r.health_market_share != null).sort((a, b) => (b.health_market_share ?? 0) - (a.health_market_share ?? 0))
      const rank = ranked.findIndex((r) => r.company_id === companyId) + 1
      out.push(M('Health market share', fmtPct(peerRow.health_market_share), peerRow.fiscal_year ?? 'FY25', 'Neutral', peerSrc, rank ? `#${rank} of ${ranked.length} SAHIs` : undefined))
    }
    if (peerRow?.growth != null) {
      const growths = peerAll.map((r) => r.growth).filter((g): g is number => typeof g === 'number').sort((a, b) => a - b)
      const median = growths.length ? growths[Math.floor(growths.length / 2)] : null
      out.push(M('GWP growth (YoY)', fmtPct(peerRow.growth), peerRow.fiscal_year ?? 'FY25', growthTone(peerRow.growth), peerSrc, median != null ? `Peer median ${fmtPct(median)}` : undefined))
    }
    if (peerRow?.combined_ratio != null) out.push(M('Combined ratio', fmtPct(peerRow.combined_ratio), peerRow.fiscal_year ?? 'FY25', combinedTone(peerRow.combined_ratio), peerSrc))
  }

  if (key === 'riskRegulatoryChanges') {
    const solv = peerRow?.solvency_ratio != null ? { value: peerRow.solvency_ratio, period: peerRow.fiscal_year ?? 'FY25', src: peerSrc } : annualPick(annualRows, 'solvency_ratio')
    if (solv) out.push(M('Solvency ratio', fmtX(solv.value), solv.period, solvencyTone(solv.value), solv.src, 'Regulatory floor 1.5x'))
  }

  if (key === 'forwardLookingStrategy') {
    const promises = getPromises(companyId)
    if (promises.length) {
      const delivered = promises.filter((p) => p.status === 'Delivered').length
      out.push(
        M(
          'Guidance delivered',
          `${delivered}/${promises.length}`,
          'FY25',
          delivered * 2 >= promises.length ? 'Positive' : 'Watch',
          { name: promises[0].source ?? 'Earnings-call guidance', url: promises[0].sourceUrl ?? '' },
          'Management targets met vs the audited actual',
        ),
      )
    }
  }

  if (key === 'investmentPerformance') {
    // Real, audited investment figures come from the earnings bridge (Revenue A/c
    // + P&L). Per-company yield / asset-mix are not disclosed, so we surface
    // investment income and its share of profit only — never a fabricated yield.
    // Companies without a bridge fall through to the honest empty state.
    const bridge = getEarningsBridge(companyId)
    if (bridge.length) {
      const yr = bridge[0]
      const b = yr.igaap
      const eq = earningsQuality(b)
      const bridgeSrc: SourceRef = { name: BRIDGE_SOURCE, url: BRIDGE_SOURCE_URL }
      out.push(M('Investment income', fmtCr(b.investmentIncome), yr.fy, 'Neutral', bridgeSrc, 'From the Revenue A/c + P&L'))
      if (b.pat) {
        const pctOfPat = Math.round((b.investmentIncome / b.pat) * 100)
        out.push(M('Investment income vs PAT', `${pctOfPat}%`, yr.fy, eq.investmentLed ? 'Watch' : 'Positive', bridgeSrc, eq.investmentLed ? 'Profit is investment-income-led' : 'Core-led profit'))
      }
      out.push(M('Underwriting result', fmtCr(b.underwritingResult), yr.fy, b.underwritingResult < 0 ? 'Watch' : 'Positive', bridgeSrc, b.underwritingResult < 0 ? 'Core book loses money before investment income' : 'Core book profitable'))
    }
  }
  return out
}

// Stance + implication when a lens is metric-only (no curated insight to lead it).
function metricStance(metrics: MetricRead[]): SignalImpact {
  if (metrics.some((m) => m.tone === 'Risk')) return 'Risk'
  if (metrics.some((m) => m.tone === 'Watch')) return 'Watch'
  if (metrics.some((m) => m.tone === 'Positive')) return 'Positive'
  return 'Neutral'
}
function metricImplication(key: Exclude<LensKey, 'overviewPulse'>, metrics: MetricRead[]): string {
  const cr = metrics.find((m) => m.label === 'Combined ratio')
  const exp = metrics.find((m) => m.label === 'Expense ratio')
  const solv = metrics.find((m) => m.label === 'Solvency ratio')
  if (key === 'underwritingProfitability' && cr) {
    return cr.tone === 'Risk' || cr.value.startsWith('1')
      ? 'Premium is still written at an underwriting loss — near-term profit leans on investment income and scale, not the core book.'
      : 'Underwriting is at or near breakeven, so margin gains can come from the core book rather than markets.'
  }
  if (key === 'expenseManagement' && exp) {
    return exp.tone === 'Risk'
      ? 'The cost base is heavy relative to premium — operating leverage has to show up as the book scales, or margins stay pressured.'
      : 'Cost discipline looks reasonable; watch whether scale keeps pulling the expense ratio down.'
  }
  if (key === 'riskRegulatoryChanges' && solv) {
    return solv.tone === 'Risk' || solv.tone === 'Watch'
      ? 'Solvency sits close enough to the floor that a capital raise or slower growth is a live possibility.'
      : 'Capital looks comfortably above the regulatory floor, leaving room to fund growth.'
  }
  if (key === 'investmentPerformance' && metrics.length) {
    const uw = metrics.find((m) => m.label === 'Underwriting result')
    const inv = metrics.find((m) => m.label === 'Investment income vs PAT')
    return uw && uw.tone === 'Watch' && inv
      ? 'Profit quality is thin — the core underwriting book loses money, so reported profit rests on investment income, which is sensitive to market yields and a weaker signal of franchise strength.'
      : 'Investment income supplements a profitable core book rather than carrying it.'
  }
  return ''
}

function buildLens(
  key: Exclude<LensKey, 'overviewPulse'>,
  companyId: string,
  allInsights: Insight[],
  signals: PulseSignal[],
  peerRow: PeerRow | undefined,
  annualRows: AnnualRow[],
  peerAll: PeerRow[],
): InsightLens {
  const meta = LENS_META[key]
  const lensInsights = allInsights
    .filter((i) => lensForInsight(i) === key && i.affectedInsurers.includes(companyId))
    .sort((a, b) => a.rank - b.rank)
  const metrics = metricsForLens(key, companyId, peerRow, annualRows, peerAll)
  const relatedSignals = signals.filter((s) => SIGNAL_LENS[s.category] === key)

  const keyInsights: string[] = lensInsights.map((i) => i.shortHeadline)
  if (keyInsights.length < 2) for (const m of metrics.slice(0, 2)) keyInsights.push(`${m.label}: ${m.value} (${m.period})`)

  const missedSignals = lensInsights.map((i) => i.whatConsensusMisses).filter(Boolean).slice(0, 3)

  const watchRaw: string[] = []
  for (const ins of lensInsights) {
    if (ins.watch?.items?.length) for (const w of ins.watch.items) watchRaw.push(`${w.trigger} — ${w.condition}`)
    else if (ins.falsifier) watchRaw.push(`Thesis flips if: ${ins.falsifier}`)
  }
  const watchNext = [...new Set(watchRaw)].slice(0, 4)

  const investorImplication = lensInsights[0]?.application?.framing || lensInsights[0]?.thesis || metricImplication(key, metrics)
  const stance = lensInsights[0] ? CATEGORY_STANCE[lensInsights[0].category] : metricStance(metrics)
  // Source-linked metrics → High confidence in the numbers; unsourced metrics →
  // Medium; nothing → Low. Curated insights always lead at High.
  const confidence: Confidence = lensInsights.length ? 'High' : metrics.some((m) => m.sourceUrl) ? 'High' : metrics.length ? 'Medium' : 'Low'
  const oneLineRead = lensInsights[0]
    ? firstSentence(lensInsights[0].summary)
    : metrics[0]
      ? `${metrics[0].label} at ${metrics[0].value} (${metrics[0].period}).`
      : meta.purpose

  const sourceRefs = dedupeRefs([
    ...metrics.map((m) => ({ name: m.sourceName, url: m.sourceUrl })),
    ...(lensInsights.length ? [{ name: `${lensInsights.length} curated source-backed insight${lensInsights.length === 1 ? '' : 's'}`, url: '' }] : []),
  ])

  return {
    key,
    title: meta.title,
    purpose: meta.purpose,
    oneLineRead,
    stance,
    confidence,
    keyInsights: keyInsights.slice(0, 5),
    missedSignals,
    investorImplication,
    watchNext,
    sourceRefs,
    insightIds: lensInsights.map((i) => i.id),
    metrics,
    relatedSignals,
    available: lensInsights.length > 0 || metrics.length > 0 || relatedSignals.length > 0,
  }
}

function buildLenses(companyId: string, signals: PulseSignal[]): Record<Exclude<LensKey, 'overviewPulse'>, InsightLens> {
  const allInsights = INSIGHTS_FILE.insights
  const peerAll = (peerSnapshot.data as PeerRow[]) ?? []
  const peerRow = peerAll.find((r) => r.company_id === companyId)
  const annualRows = ((annualSnapshot.data as AnnualRow[]) ?? [])
    .filter((r) => r.company_id === companyId)
    .sort((a, b) => (a.fiscal_year < b.fiscal_year ? 1 : a.fiscal_year > b.fiscal_year ? -1 : 0))
  const out = {} as Record<Exclude<LensKey, 'overviewPulse'>, InsightLens>
  for (const key of ANALYTICAL_LENSES as Exclude<LensKey, 'overviewPulse'>[]) {
    out[key] = buildLens(key, companyId, allInsights, signals, peerRow, annualRows, peerAll)
  }
  return out
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
    lenses: buildLenses(companyId, signals),
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
