// ---------------------------------------------------------------------------
//  dataLayer — the dashboard's read API for official-source snapshots.
//
//  Sections eventually migrate from importing mock arrays in
//  src/data/mockData.ts to calling these helpers. Each helper returns an
//  envelope:
//
//    { value, dataset, lastUpdated, sourceUrl, confidence }
//
//  so the UI can decide how to render — including showing an EmptyState
//  when the snapshot doesn't carry the requested metric for the requested
//  period.
//
//  This layer is intentionally additive. Existing components keep working
//  against src/data/mockData.ts until they are migrated piece by piece.
// ---------------------------------------------------------------------------

import companyMaster from '@/data/snapshots/company-master.json'
import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'
import quarterlySnapshot from '@/data/snapshots/insurer-quarterly-financials.json'
import monthlySnapshot from '@/data/snapshots/insurer-monthly-premium.json'
import industrySegmentSnapshot from '@/data/snapshots/industry-segment-premium.json'
import gicHealthPortfolio from '@/data/snapshots/gic-health-portfolio.json'
import sahiPeerSnapshot from '@/data/snapshots/sahi-peer-comparison.json'
import distributionMixSnapshot from '@/data/snapshots/distribution-channel-mix.json'
import distributionReachSnapshot from '@/data/snapshots/distribution-reach-depth.json'
import valuationSnapshot from '@/data/snapshots/valuation-snapshot.json'
import ownershipSnapshot from '@/data/snapshots/ownership-snapshot.json'
import shareholdingPatternSnapshot from '@/data/snapshots/shareholding-pattern-snapshot.json'
import managementEventsSnapshot from '@/data/snapshots/management-events.json'
import bulkBlockDeals from '@/data/snapshots/bulk-block-deals-snapshot.json'
import tradeDisclosuresJson from '@/data/snapshots/ownership-trade-disclosures.json'
import moneycontrolStockDealsJson from '@/data/snapshots/moneycontrol-stock-deals.json'
import provenanceMap from '@/data/snapshots/data-provenance.json'
import { peerValuation } from '@/data/valuationData'
import irdaiFlashLatestJson from '@/data/snapshots/irdai-nonlife-flash-latest.json'
import irdaiFlashMonthlyJson from '@/data/snapshots/irdai-nonlife-flash-monthly.json'
import irdaiFlashSourcesJson from '@/data/snapshots/irdai-nonlife-flash-sources.json'
import type {
  IrdaiNonLifeFlashRow,
  IrdaiNonLifeFlashSource,
  IrdaiNonLifeFlashEnvelope,
  OwnershipTradeDisclosureRow,
  OwnershipTradeDisclosuresEnvelope,
  TradeValidationStatus,
  TradeSourceName,
  MoneycontrolStockDealsEnvelope,
  MoneycontrolDealStatus,
} from '@/data/snapshots/_schemas'
import type { TimePeriod, PeerGroup, Insurer, Signal } from '@/data/types'

type Dataset = 'official' | 'mixed' | 'mock' | 'pending'

export interface DataEnvelope<T> {
  value: T | null
  dataset: Dataset
  lastUpdated: string | null
  sourceUrl: string | null
  confidence: 'high' | 'medium' | 'low' | 'pending'
}

interface MetaBlock {
  _meta: {
    dataset: Dataset
    last_updated: string | null
    upstream_sources: string[]
  }
}

function envelope<T>(value: T | null, snap: MetaBlock, sourceUrl: string | null = null, confidence: DataEnvelope<T>['confidence'] = 'pending'): DataEnvelope<T> {
  return {
    value,
    dataset: value == null ? 'pending' : snap._meta.dataset,
    lastUpdated: snap._meta.last_updated,
    sourceUrl,
    confidence,
  }
}

function emptyEnvelope<T>(snap: MetaBlock): DataEnvelope<T> {
  return {
    value: null,
    dataset: 'pending',
    lastUpdated: snap._meta.last_updated,
    sourceUrl: null,
    confidence: 'pending',
  }
}

// ─── Company master ────────────────────────────────────────────────────────

export interface CompanyMasterEntry {
  company_id: string
  display_name: string
  short_name: string
  segment: 'SAHI' | 'General' | 'Life'
  peer_group: 'SAHI' | 'General' | 'Life'
  listed_status: 'listed' | 'unlisted'
  ticker: string | null
  investor_relations_url: string | null
  active_status?: 'active' | 'inactive'
  is_focal?: boolean
}

export function getCompanyMaster(): CompanyMasterEntry[] {
  return (companyMaster.data as CompanyMasterEntry[])
}

export function getSelectedPeerSet(peerGroup: PeerGroup): CompanyMasterEntry[] {
  const master = getCompanyMaster()
  if (peerGroup === 'All') return master
  return master.filter((c) => c.peer_group === peerGroup)
}

// ─── Per-company metric resolver ───────────────────────────────────────────

interface AnnualRow {
  company_id: string
  fiscal_year: string
  [k: string]: unknown
}

function findAnnualRow(companyId: string): AnnualRow | null {
  return (annualSnapshot.data as AnnualRow[]).find((r) => r.company_id === companyId) ?? null
}

interface QuarterlyRow extends AnnualRow {
  quarter: string
}
function findQuarterlyRow(companyId: string): QuarterlyRow | null {
  return (quarterlySnapshot.data as QuarterlyRow[]).find((r) => r.company_id === companyId) ?? null
}

interface MonthlyRow extends AnnualRow {
  month: string
}
function findMonthlyRow(companyId: string): MonthlyRow | null {
  return (monthlySnapshot.data as MonthlyRow[]).find((r) => r.company_id === companyId) ?? null
}

/**
 * One metric lookup with provenance. The returned envelope carries the
 * dataset / confidence so the UI can chip it correctly.
 */
export function getCompanyMetric(
  companyId: string,
  metricId: string,
  period: TimePeriod,
): DataEnvelope<number | string> {
  const row =
    period === 'Annual'
      ? findAnnualRow(companyId)
      : period === 'Quarterly'
        ? findQuarterlyRow(companyId)
        : findMonthlyRow(companyId)
  const snap =
    period === 'Annual'
      ? (annualSnapshot as MetaBlock)
      : period === 'Quarterly'
        ? (quarterlySnapshot as MetaBlock)
        : (monthlySnapshot as MetaBlock)
  if (!row) return emptyEnvelope<number | string>(snap)
  const raw = (row as Record<string, unknown>)[metricKeyFor(metricId)] as number | string | null | undefined
  const provenance = lookupProvenance(metricId, companyId, period)
  return envelope(
    raw ?? null,
    snap,
    provenance?.source_url ?? null,
    provenance?.confidence ?? 'pending',
  )
}

function metricKeyFor(metricId: string): string {
  // Map dotted metric_id → snapshot column name.
  switch (metricId) {
    case 'company.gwp': return 'gwp'
    case 'company.nwp': return 'nwp'
    case 'company.nep': return 'nep'
    case 'company.pat': return 'pat'
    case 'company.combined_ratio': return 'combined_ratio'
    case 'company.claims_ratio': return 'claims_ratio'
    case 'company.expense_ratio': return 'expense_ratio'
    case 'company.commission_ratio': return 'commission_ratio'
    case 'company.solvency_ratio': return 'solvency_ratio'
    case 'company.roe': return 'roe'
    case 'company.market_share': return 'market_share'
    case 'company.retail_mix': return 'retail_mix'
    case 'company.renewal_rate': return 'renewal_rate'
    case 'company.claims_settlement_ratio': return 'claims_settlement_ratio'
    default: return metricId.split('.').pop() ?? metricId
  }
}

// ─── Per-section bundles (thin convenience wrappers) ───────────────────────

export function getMarketEngineData(period: TimePeriod) {
  void period
  return {
    industrySegmentPremium: industrySegmentSnapshot.data,
    sahiPeerComparison: sahiPeerSnapshot.data,
    meta: (industrySegmentSnapshot as MetaBlock)._meta,
  }
}

export function getPremiumEngineData(companyId: string, period: TimePeriod) {
  const row =
    period === 'Annual'
      ? findAnnualRow(companyId)
      : period === 'Quarterly'
        ? findQuarterlyRow(companyId)
        : findMonthlyRow(companyId)
  return {
    row,
    meta:
      period === 'Annual'
        ? (annualSnapshot as MetaBlock)._meta
        : period === 'Quarterly'
          ? (quarterlySnapshot as MetaBlock)._meta
          : (monthlySnapshot as MetaBlock)._meta,
  }
}

export function getDistributionData(companyId: string, period: TimePeriod) {
  void period
  const rows = (distributionMixSnapshot.data as Array<{ company_id: string }>).filter(
    (r) => r.company_id === companyId,
  )
  const reach = (distributionReachSnapshot.data as Array<{ company_id: string }>).filter(
    (r) => r.company_id === companyId,
  )
  return {
    mix: rows,
    reach,
    meta: (distributionMixSnapshot as MetaBlock)._meta,
    reachMeta: (distributionReachSnapshot as MetaBlock)._meta,
  }
}

export function getProfitabilityData(companyId: string, period: TimePeriod) {
  // Profitability is just the snapshot row filtered by period — same as
  // Premium Engine, but the UI cares about the ratio columns specifically.
  return getPremiumEngineData(companyId, period)
}

export function getValuationData(companyId: string) {
  const row = (valuationSnapshot.data as Array<{ company_id: string }>).find((r) => r.company_id === companyId) ?? null
  return { row, meta: (valuationSnapshot as MetaBlock)._meta }
}

// ─── Named-holder shareholding (per-holder stakes from the detailed filing) ──
interface ShareholdingPatternRow {
  company_id: string
  holder: string
  period?: string
  filing_period?: string
  shares: number | null
  pct: number | null
}

/** Classify a named holder into a holder-class label for the cap-table view. */
function inferHolderType(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('bupa')) return 'Promoter'
  if (n.includes('mutual fund')) return 'MF'
  if (n.includes('temasek')) return 'FII / Sovereign'
  if (n.includes('insurance compan')) return 'Insurer (DII)'
  if (n.includes('private equity')) return 'PE'
  if (/(llp|holdings|a91|amansa|paragon|pallonji|fettle)/.test(n)) return 'PE / Investor'
  return 'Public / Other'
}

export interface NamedHolder {
  name: string
  type: string
  share: number | null
  change: number | null
}

/** Named holders for a listed insurer from the latest shareholding-pattern
 *  filing, largest first. `change` is null — a single filing carries no
 *  quarter-on-quarter movement (never fabricated). */
export function getNamedHolders(companyId: string): NamedHolder[] {
  const rows = ((shareholdingPatternSnapshot as { data?: ShareholdingPatternRow[] }).data ?? []).filter(
    (r) => r.company_id === companyId && r.pct != null,
  )
  if (!rows.length) return []
  // The snapshot can now carry several filed quarters; the named-holder list
  // shows the LATEST filed quarter only — never blended across periods.
  const latest = rows.reduce((p, r) => ((r.period ?? '') > p ? r.period ?? '' : p), '')
  return rows
    .filter((r) => (r.period ?? '') === latest)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
    .map((r) => ({ name: r.holder, type: inferHolderType(r.holder), share: r.pct, change: null }))
}

export function getOwnershipData(companyId: string) {
  const base =
    (ownershipSnapshot.data as Array<{ company_id: string; top_holders?: unknown[] }>).find(
      (r) => r.company_id === companyId,
    ) ?? null
  // Surface the per-named-holder stakes from the detailed shareholding-pattern
  // filing when the ownership snapshot itself doesn't carry them.
  let row = base
  if (base && (!base.top_holders || base.top_holders.length === 0)) {
    const named = getNamedHolders(companyId)
    if (named.length) row = { ...base, top_holders: named }
  }
  return { row, meta: (ownershipSnapshot as MetaBlock)._meta }
}

export function getManagementEvents(companyId: string) {
  const rows = (managementEventsSnapshot.data as Array<{ company_id: string }>).filter((r) => r.company_id === companyId)
  return { rows, meta: (managementEventsSnapshot as MetaBlock)._meta }
}

// ─── Bulk / block deals (exchange-reported large trades) ────────────────────
export interface BulkBlockDeal {
  company_id: string
  deal_kind: 'bulk' | 'block'
  date: string
  client: string
  side: 'buy' | 'sell'
  quantity: number
  price: number
}

/** Exchange-reported bulk & block deals for a listed insurer, newest first.
 *  Never fabricated — an insurer with no deal on record returns []. */
export function getBulkBlockDeals(companyId: string): {
  deals: BulkBlockDeal[]
  sourceName: string
  sourceUrl: string
  lastUpdated: string | null
} {
  const all = (bulkBlockDeals as { data?: BulkBlockDeal[] }).data ?? []
  const deals = all
    .filter((d) => d.company_id === companyId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.quantity - a.quantity))
  const m = (bulkBlockDeals as { _meta?: { source?: { source_name?: string; source_url?: string; aggregator_url?: string }; last_updated?: string } })._meta
  return {
    deals,
    sourceName: m?.source?.source_name ?? 'NSE / BSE bulk & block deals',
    // Link to the aggregator page that reliably opens and shows these deals
    // (the exchange's own get-quote URL blocks direct navigation).
    sourceUrl: m?.source?.aggregator_url ?? m?.source?.source_url ?? 'https://www.screener.in',
    lastUpdated: m?.last_updated ?? null,
  }
}

// ─── Ownership trade disclosures (Screener → Trades · underlying NSE / BSE) ──
// SEPARATE transaction-disclosure dataset for the Bulk / Block Deal Timeline —
// never merged with ownership-holdings / ownership-trends.

export interface TradeDisclosureSummary {
  bulk_deal_count: number
  block_deal_count: number
  total_bought_value_cr: number
  total_sold_value_cr: number
  net_flow_value_cr: number
  net_flow_direction: 'net_bought' | 'net_sold' | 'neutral'
  unique_buyers: number
  unique_sellers: number
  largest_buyer: { name: string; value_cr: number } | null
  largest_seller: { name: string; value_cr: number } | null
  largest_trade_value_cr: number
}

const r2 = (n: number): number => Math.round(n * 100) / 100

/** Task-3 summary metrics over a set of trade-disclosure rows. A row counts to
 *  "bought" when only the buyer is disclosed, to "sold" when only the seller is;
 *  a fully-matched row counts both parties but its value once (never double). */
export function summarizeTradeDisclosures(rows: OwnershipTradeDisclosureRow[]): TradeDisclosureSummary {
  let bought = 0
  let sold = 0
  let largestTrade = 0
  const buyers = new Map<string, number>()
  const sellers = new Map<string, number>()
  for (const r of rows) {
    const v = r.value_cr ?? 0
    if (v > largestTrade) largestTrade = v
    const hasBuyer = !!r.buyer
    const hasSeller = !!r.seller
    if (hasBuyer && !hasSeller) {
      bought += v
      buyers.set(r.buyer!, (buyers.get(r.buyer!) ?? 0) + v)
    } else if (hasSeller && !hasBuyer) {
      sold += v
      sellers.set(r.seller!, (sellers.get(r.seller!) ?? 0) + v)
    } else if (hasBuyer && hasSeller) {
      buyers.set(r.buyer!, (buyers.get(r.buyer!) ?? 0) + v)
      sellers.set(r.seller!, (sellers.get(r.seller!) ?? 0) + v)
    }
  }
  const net = r2(bought - sold)
  const top = (m: Map<string, number>): { name: string; value_cr: number } | null => {
    let name: string | null = null
    let max = -1
    for (const [k, val] of m) if (val > max) { max = val; name = k }
    return name ? { name, value_cr: r2(max) } : null
  }
  return {
    bulk_deal_count: rows.filter((r) => r.deal_type === 'bulk').length,
    block_deal_count: rows.filter((r) => r.deal_type === 'block').length,
    total_bought_value_cr: r2(bought),
    total_sold_value_cr: r2(sold),
    net_flow_value_cr: net,
    net_flow_direction: net > 0.01 ? 'net_bought' : net < -0.01 ? 'net_sold' : 'neutral',
    unique_buyers: buyers.size,
    unique_sellers: sellers.size,
    largest_buyer: top(buyers),
    largest_seller: top(sellers),
    largest_trade_value_cr: r2(largestTrade),
  }
}

/** Resolved outcome of one configured deal source, for the timeline footer. */
export type TradeSourceState = 'ok' | 'no_records' | 'blocked' | 'parse_warning' | 'pending'
export interface TradeSourceStatus {
  name: TradeSourceName
  /** Display label, e.g. "Screener Trades" / "Moneycontrol Stock Deals". */
  label: string
  state: TradeSourceState
  /** Merged rows this source contributed for the company. */
  count: number
  url: string
  checkedAt: string | null
  /** Human note shown when blocked / parse_warning. */
  detail?: string | null
}

export interface TradeDisclosuresView {
  deals: OwnershipTradeDisclosureRow[]
  summary: TradeDisclosureSummary
  sourceName: string
  sourceUrl: string
  underlyingSource: string
  lastUpdated: string | null
  scrapedAt: string | null
  tradesSectionFound: boolean
  validationStatus: TradeValidationStatus
  // ── multi-source (Screener Trades + Moneycontrol Stock Deals) ──
  /** Every configured source and its resolved state — drives the status chips. */
  sources: TradeSourceStatus[]
  /** True when Moneycontrol contributed at least one merged row for the company. */
  moneycontrolUsed: boolean
  /** Dynamic line after the company name in the card header. */
  headerLabel: string
  /** True once every configured source has resolved (ok / no_records / blocked /
   *  parse_warning) — i.e. NOT still 'pending'. The empty "0 found" state is only
   *  honest once this is true: we have actually checked every source. */
  allSourcesChecked: boolean
  /** True once Moneycontrol has ACTUALLY been consulted — either the daily agent
   *  completed a run with its Moneycontrol instruction, or the direct fetch
   *  succeeded. A block-deal zero is only "confirmed" when this is true; until
   *  then the UI shows "needs review", never a false zero. */
  moneycontrolChecked: boolean
}

// Dedup identity per the task: company + date + client + action + qty + price +
// exchange. deal_type is intentionally NOT in the key — the same trade reported
// as a "bulk" by one source and a "block" by another is still ONE trade; we keep
// the richer row and union provenance rather than double-count it.
const tradeDedupeKey = (d: OwnershipTradeDisclosureRow): string =>
  [
    d.company_id,
    d.date,
    (d.buyer ?? d.seller ?? '').toLowerCase().replace(/\s+/g, ' ').trim(),
    d.buyer ? 'buy' : 'sell',
    d.quantity ?? '',
    d.price ?? '',
    (d.exchange_source ?? '').toLowerCase().replace(/[\s/]/g, ''),
  ].join('::')

// "Richer" = more populated, decision-grade fields. On a dedupe collision we keep
// the richer row as the base and union the source provenance onto it.
const tradeRichness = (d: OwnershipTradeDisclosureRow): number =>
  [d.quantity, d.price, d.value_cr, d.buyer ?? d.seller].filter((v) => v != null && v !== '').length +
  (d.exchange_source && d.exchange_source !== 'NSE / BSE' ? 1 : 0)

const maxIsoDate = (a: string | null | undefined, b: string | null | undefined): string | null => {
  const x = a ?? null
  const y = b ?? null
  if (!x) return y
  if (!y) return x
  return x >= y ? x : y
}

function mcStateFrom(status: MoneycontrolDealStatus, count: number): TradeSourceState {
  switch (status) {
    case 'ready': return count > 0 ? 'ok' : 'no_records'
    case 'no_records': return 'no_records'
    case 'blocked': return 'blocked'
    case 'parse_warning': return 'parse_warning'
    default: return 'pending'
  }
}

// ─── daily research agent (muns) → 'Exchange' rows ──────────────────────────
// The muns agent pulls exchange-reported bulk/block deals (NSE / BSE, and — once
// pointed at it — Moneycontrol's NBH large deals) via live web search, so it
// reaches deal data even when a direct datacenter-IP fetch is 403-blocked. Its
// snapshot (bulk-block-deals-snapshot.json) is normalised here into the shared
// row shape and merged as the 'Exchange' source. Add-only + sanity-gated upstream;
// nothing fabricated.
interface AgentDeal { company_id: string; deal_kind: 'bulk' | 'block'; date: string; client: string; side: 'buy' | 'sell'; quantity: number; price: number }
const AGENT_COMPANY_NAME: Record<string, string> = {
  'niva-bupa': 'Niva Bupa Health Insurance Company Limited',
  'star-health': 'Star Health and Allied Insurance Company Limited',
}
const agentQtyDisplay = (q: number | null): string =>
  q == null ? 'n/a' : q >= 1e7 ? `${(q / 1e7).toFixed(2)} Cr` : q >= 1e5 ? `${(q / 1e5).toFixed(1)} L` : q.toLocaleString('en-IN')
const agentValDisplay = (cr: number | null): string => {
  if (cr == null) return 'n/a'
  const a = Math.abs(cr)
  return `₹${a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2)} Cr`
}
function normalizeAgentRows(companyId: string): OwnershipTradeDisclosureRow[] {
  const env = bulkBlockDeals as { _meta?: { last_successful_run?: string; last_updated?: string }; data?: AgentDeal[] }
  const at = env._meta?.last_successful_run ?? env._meta?.last_updated ?? ''
  return (env.data ?? [])
    .filter((d) => d.company_id === companyId)
    .map((d) => {
      const cr = d.quantity != null && d.price != null ? Math.round((d.quantity * d.price) / 1e7 * 100) / 100 : null
      return {
        company_id: d.company_id,
        company_name: AGENT_COMPANY_NAME[d.company_id] ?? d.company_id,
        deal_type: d.deal_kind,
        date: d.date,
        segment: d.deal_kind === 'block' ? 'Block' : 'Bulk',
        buyer: d.side === 'buy' ? d.client : null,
        seller: d.side === 'sell' ? d.client : null,
        quantity: d.quantity ?? null,
        quantity_display: agentQtyDisplay(d.quantity ?? null),
        price: d.price ?? null,
        value_cr: cr,
        value_display: agentValDisplay(cr),
        exchange_source: 'NSE / BSE',
        source_name: 'Exchange',
        source_url: 'https://www.moneycontrol.com/markets/stock-deals/large-deals/NBH',
        underlying_source: 'NSE / BSE',
        scraped_at: at,
        validation_status: 'scraped',
        source_deal_label: d.deal_kind === 'block' ? 'Block Deal' : 'Bulk Deal',
      } satisfies OwnershipTradeDisclosureRow
    })
}

/** Bulk & block deal disclosures for a company (newest first), MERGED across
 *  every configured source — Screener Trades (primary) + Moneycontrol Stock Deals
 *  (fallback, fills Screener's gaps, esp. block deals) — de-duped by
 *  company+date+client+action+qty+price+exchange, with the Task-3 summary and an
 *  honest per-source status. Screener returning zero is NEVER treated as final:
 *  the empty "0 found" state is only valid once `allSourcesChecked` is true and
 *  no source produced a row. Nothing is fabricated. */
export function getTradeDisclosures(companyId: string): TradeDisclosuresView {
  const scrEnv = tradeDisclosuresJson as unknown as OwnershipTradeDisclosuresEnvelope
  const scrMeta = scrEnv._meta
  const scrRows = (scrEnv.data ?? []).filter((d) => d.company_id === companyId)

  const mcEnv = moneycontrolStockDealsJson as unknown as MoneycontrolStockDealsEnvelope
  const mcMeta = mcEnv._meta
  const mcRows = (mcEnv.data ?? []).filter((d) => d.company_id === companyId)

  // Merge: Screener first (primary), then Moneycontrol (fallback). On collision,
  // keep the richer row + union source provenance — never double-count.
  const merged = new Map<string, OwnershipTradeDisclosureRow>()
  const addRow = (row: OwnershipTradeDisclosureRow, src: TradeSourceName): void => {
    const k = tradeDedupeKey(row)
    const existing = merged.get(k)
    if (!existing) {
      merged.set(k, { ...row, sources: [src] })
      return
    }
    const prevSources = existing.sources ?? [existing.source_name]
    const base = tradeRichness(row) > tradeRichness(existing) ? { ...row } : { ...existing }
    merged.set(k, { ...base, sources: Array.from(new Set([...prevSources, src])) })
  }
  const agentMeta = (bulkBlockDeals as { _meta?: { last_successful_run?: string | null; last_updated?: string | null; moneycontrol_checked?: boolean } })._meta ?? {}
  const agentRows = normalizeAgentRows(companyId)

  for (const r of scrRows) addRow(r, 'Screener')
  for (const r of mcRows) addRow(r, 'Moneycontrol')
  for (const r of agentRows) addRow(r, 'Exchange')

  const deals = [...merged.values()].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : (b.value_cr ?? 0) - (a.value_cr ?? 0),
  )

  const countFor = (src: TradeSourceName): number =>
    deals.filter((d) => (d.sources ?? [d.source_name]).includes(src)).length
  const scrCount = countFor('Screener')
  const mcCount = countFor('Moneycontrol')
  const exCount = countFor('Exchange')

  // Screener per-company state: a global 'scraped' run with rows = ok; with no
  // rows = a confirmed clean zero (no_records); anything else still pending.
  const scrState: TradeSourceState =
    scrMeta.validation_status === 'scraped'
      ? (scrCount > 0 ? 'ok' : 'no_records')
      : scrMeta.validation_status === 'no_records'
        ? 'no_records'
        : scrMeta.validation_status === 'parse_warning'
          ? 'parse_warning'
          : 'pending'
  const mcState = mcStateFrom(mcMeta.status, mcCount)
  // The daily agent has run successfully iff it stamped a last_successful_run.
  const exState: TradeSourceState = agentMeta.last_successful_run ? (exCount > 0 ? 'ok' : 'no_records') : 'pending'

  // A "fallback" is any source beyond Screener Trades. The header credits them
  // only when they actually contributed a row.
  const fallbackUsed = mcCount > 0 || exCount > 0
  const scrUrl = scrRows[0]?.source_url ?? scrMeta.source_url
  const sources: TradeSourceStatus[] = [
    { name: 'Screener', label: 'Screener Trades', state: scrState, count: scrCount, url: scrUrl, checkedAt: scrMeta.last_updated ?? scrMeta.scraped_at ?? null },
    { name: 'Exchange', label: 'Daily agent · NSE / BSE / Moneycontrol', state: exState, count: exCount, url: 'https://www.moneycontrol.com/markets/stock-deals/large-deals/NBH', checkedAt: agentMeta.last_updated ?? agentMeta.last_successful_run ?? null, detail: exState === 'pending' ? 'The daily research agent has not completed a run yet.' : null },
    { name: 'Moneycontrol', label: 'Moneycontrol Stock Deals (direct)', state: mcState, count: mcCount, url: mcMeta.source_url, checkedAt: mcMeta.scraped_at ?? mcMeta.last_updated ?? null, detail: mcMeta.status_detail ?? null },
  ]

  const headerLabel = fallbackUsed
    ? 'bulk / block deals aggregated from the Screener Trades modal, Moneycontrol & exchange feeds · underlying NSE / BSE'
    : 'bulk / block deals from the Screener Trades modal · underlying NSE / BSE'

  // Zero is only "confirmed" once every configured source has resolved.
  const allSourcesChecked = scrState !== 'pending' && mcState !== 'pending' && exState !== 'pending'
  // Moneycontrol counts as actually-checked only when the daily agent completed a
  // run carrying its Moneycontrol instruction, OR the direct fetch read the page.
  const moneycontrolChecked = !!agentMeta.moneycontrol_checked || mcState === 'ok' || mcState === 'no_records'

  return {
    deals,
    summary: summarizeTradeDisclosures(deals),
    sourceName: fallbackUsed ? 'Moneycontrol + Exchange + Screener' : scrMeta.source_name,
    sourceUrl: scrUrl,
    underlyingSource: scrMeta.underlying_source,
    lastUpdated: fallbackUsed ? maxIsoDate(maxIsoDate(scrMeta.last_updated, mcMeta.last_updated), agentMeta.last_updated) : scrMeta.last_updated ?? null,
    scrapedAt: maxIsoDate(maxIsoDate(scrMeta.scraped_at, mcMeta.scraped_at), agentMeta.last_successful_run ?? agentMeta.last_updated),
    tradesSectionFound: !!scrMeta.trades_section_found,
    validationStatus: scrMeta.validation_status,
    sources,
    moneycontrolUsed: fallbackUsed,
    headerLabel,
    allSourcesChecked,
    moneycontrolChecked,
  }
}

// ─── Provenance ────────────────────────────────────────────────────────────

interface ProvenanceEntry {
  source_name: string
  source_url: string
  source_file?: string | null
  fetched_at: string | null
  confidence: 'high' | 'medium' | 'low' | 'pending'
}

export function lookupProvenance(
  metricId: string,
  companyId: string,
  period: TimePeriod,
): ProvenanceEntry | null {
  const key = `${metricId}::${companyId}::${period}`
  const entries = (provenanceMap as { entries: Record<string, ProvenanceEntry> }).entries
  return entries[key] ?? null
}

export function getDataProvenance(metricId: string, companyId: string, period: TimePeriod) {
  return lookupProvenance(metricId, companyId, period)
}

// ─── Executive-Overview Insurer universe (built from snapshots) ─────────────
// The dashboard's canonical company model. Built from company-master (identity)
// + the latest annual snapshot row per company (financials). Derived fields
// (growth, margin, signal, takeaway, share-change) recompute automatically as
// new annual rows are ingested — no UI edit required for new data/companies.

interface InsurerAnnualLike {
  company_id: string
  fiscal_year: string
  gwp: number | null
  combined_ratio: number | null
  solvency_ratio: number | null
  roe: number | null
  market_share: number | null
  retail_mix: number | null
  renewal_rate: number | null
  claims_settlement_ratio: number | null
  customer_retention?: number | null
  growth_yoy?: number | null
  market_share_change?: number | null
  valuation_p_gwp?: number | null
}

function fyNum(fy: string): number {
  const m = /FY(\d{2,4})/.exec(fy)
  return m ? Number(m[1]) : 0
}

/** Annual rows for a company, newest fiscal year first. */
function annualRowsFor(companyId: string): InsurerAnnualLike[] {
  return (annualSnapshot.data as InsurerAnnualLike[])
    .filter((r) => r.company_id === companyId)
    .sort((a, b) => fyNum(b.fiscal_year) - fyNum(a.fiscal_year))
}

function deriveSignal(combinedRatio: number, growth: number, roe: number): Signal {
  if (combinedRatio > 0) {
    if (combinedRatio < 100) return growth >= 10 ? 'Strong' : 'Improving'
    if (combinedRatio <= 103) return 'Watch'
    return growth >= 20 ? 'Watch' : 'Weak'
  }
  // Life carriers report no combined ratio — lean on ROE.
  return roe >= 10 ? 'Improving' : 'Watch'
}

function deriveTakeaway(i: Insurer): string {
  const g = `GWP ${i.growth > 0 ? '+' : ''}${i.growth.toFixed(0)}% YoY`
  return i.combinedRatio > 0
    ? `Combined ratio ${i.combinedRatio.toFixed(1)}%, ${g}.`
    : `ROE ${i.roe.toFixed(1)}%, ${g}.`
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

// Curated FY26-basis P/GWP (market cap ÷ latest full-year GWP), hand-verified
// for the listed SAHIs in valuationData.ts. We prefer this over the daily feed
// so the scorecard's P/GWP is shown on the SAME basis as the Valuation tab —
// e.g. Niva Bupa 1.65x (FY26), not the feed's 2.26x (older FY25 direct-premium
// base). Companies without a curated figure fall back to the daily feed.
// (Standing decision, 2026-06-15: standardise on the FY26 latest-year basis.)
const CURATED_PRICE_TO_GWP: Record<string, number> = Object.fromEntries(
  peerValuation.filter((r) => r.pGwp != null).map((r) => [r.companyId, r.pGwp as number]),
)

// Real fetched P/GWP per company. Prefer the curated latest-year (FY26) basis
// where verified, else the live valuation feed (listed insurers) — so the
// scorecard/builder reflect a current, consistent multiple, not a stale one.
function realPriceToGwp(companyId: string): number | null {
  if (companyId in CURATED_PRICE_TO_GWP) return CURATED_PRICE_TO_GWP[companyId]
  const row = (valuationSnapshot.data as Array<{ company_id: string; price_to_gwp: number | null }>).find(
    (r) => r.company_id === companyId,
  )
  return row?.price_to_gwp ?? null
}

function buildInsurer(c: CompanyMasterEntry): Insurer {
  const rows = annualRowsFor(c.company_id)
  const latest = rows[0] ?? null
  const prior = rows.find((r, idx) => idx > 0 && r.gwp != null) ?? null

  const gwp = latest?.gwp ?? 0
  const combinedRatio = latest?.combined_ratio ?? 0 // 0 = N/A (life)
  const roe = latest?.roe ?? 0
  const marketShare = latest?.market_share ?? 0

  // Prefer a true YoY derivation when two years exist (auto-updates on ingest),
  // else fall back to the value cited on the latest row.
  const growth = round1(
    latest?.gwp != null && prior?.gwp ? (latest.gwp / prior.gwp - 1) * 100 : latest?.growth_yoy ?? 0,
  )
  // Use the reported YoY pp change directly: historical market_share rows in the
  // snapshot can be on a different basis (overall-health vs segment pool), so
  // deriving latest-minus-prior would mix bases.
  const marketShareChange = round1(latest?.market_share_change ?? 0)

  const insurer: Insurer = {
    id: c.company_id,
    name: c.display_name,
    shortName: c.short_name,
    ticker: c.ticker ?? '',
    peerGroup: c.peer_group,
    marketShare,
    premiumCollection: gwp,
    settlementRatio: latest?.claims_settlement_ratio ?? 0,
    renewalRate: latest?.renewal_rate ?? 0,
    customerRetention: latest?.customer_retention ?? 0,
    growth,
    margin: combinedRatio > 0 ? round1(100 - combinedRatio) : 0,
    combinedRatio,
    solvency: latest?.solvency_ratio ?? 0,
    roe,
    valuation: realPriceToGwp(c.company_id) ?? latest?.valuation_p_gwp ?? 0, // real feed first; 0 = N/A (unlisted)
    marketShareChange,
    retailMix: latest?.retail_mix ?? 0,
    signal: 'Watch',
    takeaway: '',
  }
  insurer.signal = deriveSignal(combinedRatio, growth, roe)
  insurer.takeaway = deriveTakeaway(insurer)
  return insurer
}

// Standalone-health minnows with negligible market share and no meaningful
// financials. They are EXCLUDED from the deep analysis (peer scorecard, company
// selector, company-specific views) so they don't clutter it with empty rows.
// Their records stay in company-master for SAHI industry-level context. (owner,
// 2026-06-10 — "very low market share, don't extend deep analysis to them".)
const DEEP_ANALYSIS_EXCLUDE = new Set(['galaxy-health', 'narayana-health', 'reliance-health'])

/** The canonical insurer universe for the deep analysis, in company-master
 *  order — the negligible-share SAHI minnows are dropped (see above). */
export function getInsurers(): Insurer[] {
  return getCompanyMaster()
    .filter((c) => c.active_status !== 'inactive')
    .filter((c) => !DEEP_ANALYSIS_EXCLUDE.has(c.company_id))
    .map(buildInsurer)
}

/** Focal company id — data-driven via company-master `is_focal`, else first. */
export function getFocalCompanyId(): string {
  const master = getCompanyMaster()
  return master.find((c) => c.is_focal)?.company_id ?? master[0]?.company_id ?? 'niva-bupa'
}

// Retail-vs-group HEALTH mix per insurer, from the GI Council health portfolio
// (retail health premium ÷ total health premium). This is the correct basis for
// "share of health GWP" and is reported across many fiscal years (FY18→FY26), so
// the product-mix view is genuinely multi-year — not frozen on one year.
interface GicHealthPortfolioRow { fiscal_year: string; entity: string; health_retail: number | null; health_total: number | null }
const GIC_HEALTH_ROWS = (gicHealthPortfolio.data as GicHealthPortfolioRow[]) ?? []
const hasHealthMix = (r: GicHealthPortfolioRow): boolean =>
  typeof r.health_retail === 'number' && typeof r.health_total === 'number' && r.health_total > 0

/** One fiscal year's retail-vs-group health split for a single insurer. */
export interface RetailMixPoint {
  fy: string
  /** retail ÷ total health premium, whole %. */
  retailPct: number
  /** the complement (group + govt + overseas-medical), whole %. */
  groupPct: number
  retailPrem: number
  groupPrem: number
  totalPrem: number
}

/** Retail-vs-group HEALTH split for ONE insurer across every fiscal year it
 *  reports, oldest→newest. Where a year is printed twice (e.g. a restated
 *  prior-year comparative from a later GIC edition) the newest row wins, matching
 *  the rest of the pipeline. Years the source never reported are simply absent —
 *  the caller renders an honest n/a, never a zero. */
export function retailMixSeriesForCompany(companyId: string): RetailMixPoint[] {
  const byFy = new Map<string, RetailMixPoint>()
  for (const r of GIC_HEALTH_ROWS) {
    if (r.entity !== companyId || !hasHealthMix(r)) continue
    const totalPrem = r.health_total as number
    const retailPrem = r.health_retail as number
    const retailPct = Math.round((retailPrem / totalPrem) * 100)
    byFy.set(r.fiscal_year, {
      fy: r.fiscal_year,
      retailPct,
      groupPct: Math.max(0, 100 - retailPct),
      retailPrem,
      groupPrem: Math.max(0, totalPrem - retailPrem),
      totalPrem,
    })
  }
  return [...byFy.values()].sort((a, b) => fyNum(a.fy) - fyNum(b.fy))
}

/** Source descriptor for the retail/group split (GI Council Health Portfolio). */
export const RETAIL_MIX_SOURCE = {
  source: 'GI Council' as const,
  confidence: 'high' as const,
  provenance: {
    source_name: 'GI Council Segment-wise Report — Health Portfolio (retail vs group health premium)',
    source_url: 'https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report/',
    fetched_at: (gicHealthPortfolio as { _meta?: { last_updated?: string } })._meta?.last_updated ?? '',
  },
}

/** Latest annual fiscal-year label actually present in the snapshot (e.g. "FY25").
 *  Period labels must reflect the real underlying data — never a hardcoded year. */
export function getLatestAnnualFyLabel(): string {
  const fys = (annualSnapshot.data as Array<{ fiscal_year: string }>).map((r) => fyNum(r.fiscal_year))
  const max = fys.length ? Math.max(...fys) : 0
  return max ? `FY${max}` : 'FY25'
}

/** Dashboard freshness — the latest ingestion date across the snapshots the
 *  overview actually renders (company annuals + the GI Council industry feeds),
 *  so the "Updated" badge moves whenever any of them is refreshed. */
export function getDataFreshness(): {
  lastUpdated: string
  coverage: string
  quality: string
  periodCoverage: string
} {
  const annual = annualSnapshot.data as InsurerAnnualLike[]
  const fys = [...new Set(annual.map((r) => r.fiscal_year))].sort((a, b) => fyNum(a) - fyNum(b))
  const meta = (annualSnapshot as MetaBlock)._meta
  const lastUpdated =
    [meta.last_updated, (industrySegmentSnapshot as MetaBlock)._meta?.last_updated]
      .filter((d): d is string => !!d)
      .sort()
      .pop() ?? '—'
  return {
    lastUpdated,
    coverage: fys.length ? `${fys[0]} – ${fys[fys.length - 1]}` : 'n/a',
    quality: meta.dataset === 'official' ? 'Official' : 'Mixed',
    periodCoverage: 'Annual',
  }
}

// ─── IRDAI Non-Life Flash Figures (monthly GI premium) ──────────────────────
// Self-contained snapshots written by ingest-irdai-nonlife-flash.ts. Gross
// Direct Premium WRITTEN, Rs crore, provisional & unaudited. The dashboard
// reads these for the monthly / YTD industry premium view and matches the
// selected company to a flash row by normalized name.

const flashLatest = irdaiFlashLatestJson as unknown as IrdaiNonLifeFlashEnvelope<IrdaiNonLifeFlashRow>
const flashMonthly = irdaiFlashMonthlyJson as unknown as IrdaiNonLifeFlashEnvelope<IrdaiNonLifeFlashRow>
const flashSources = irdaiFlashSourcesJson as unknown as IrdaiNonLifeFlashEnvelope<IrdaiNonLifeFlashSource>

// company_id → name fragments that appear in the IRDAI normalized/original name.
// Life insurers are intentionally absent (they don't appear in the non-life flash).
const FLASH_COMPANY_ALIASES: Record<string, string[]> = {
  'niva-bupa': ['niva bupa', 'max bupa'],
  'star-health': ['star health'],
  'care-health': ['care health', 'religare'],
  'aditya-birla': ['aditya birla'],
  manipalcigna: ['manipalcigna', 'manipal cigna'],
  'icici-lombard': ['icici lombard'],
  'bajaj-general': ['bajaj allianz'],
}

export interface IrdaiNonLifeFlashView {
  /** True only when a real (non-pending) report has been ingested. */
  available: boolean
  dataset: Dataset
  lastUpdated: string | null
  lastFetchedAt: string | null
  /** Best source link: the downloaded file URL when known, else the IRDAI page. */
  sourceUrl: string | null
  sourceName: 'IRDAI Non-Life Flash Figures'
  reportMonth: string | null
  reportYear: number | null
  /** "April 2025" — for captions / source tags. */
  reportLabel: string | null
  fyCurrent: string | null
  fyPrevious: string | null
  unit: 'Rs crore'
  rows: IrdaiNonLifeFlashRow[]
  grandTotal: IrdaiNonLifeFlashRow | null
  generalTotal: IrdaiNonLifeFlashRow | null
  standaloneTotal: IrdaiNonLifeFlashRow | null
  specializedTotal: IrdaiNonLifeFlashRow | null
}

function flashTotalRow(rows: IrdaiNonLifeFlashRow[], re: RegExp): IrdaiNonLifeFlashRow | null {
  return rows.find((r) => r.insurer_group === 'Total' && re.test(r.insurer_name_original)) ?? null
}

/** Latest month of IRDAI Non-Life Flash Figures, shaped for the dashboard. */
export function getIrdaiNonLifeFlashLatest(): IrdaiNonLifeFlashView {
  const meta = flashLatest._meta
  const rows = flashLatest.data ?? []
  const grandTotal = rows.find((r) => /grand\s*total/i.test(r.insurer_name_original)) ?? null
  const available = rows.length > 0 && meta.dataset !== 'pending'
  const reportMonth = meta.report_month ?? grandTotal?.report_month ?? null
  const reportYear = meta.report_year ?? grandTotal?.report_year ?? null
  return {
    available,
    dataset: meta.dataset,
    lastUpdated: meta.last_updated ?? null,
    lastFetchedAt: meta.last_fetched_at ?? null,
    sourceUrl: grandTotal?.source_url ?? meta.source_url ?? null,
    sourceName: 'IRDAI Non-Life Flash Figures',
    reportMonth,
    reportYear,
    reportLabel: reportMonth && reportYear ? `${reportMonth} ${reportYear}` : null,
    fyCurrent: meta.financial_year_current ?? grandTotal?.financial_year_current ?? null,
    fyPrevious: meta.financial_year_previous ?? grandTotal?.financial_year_previous ?? null,
    unit: 'Rs crore',
    rows,
    grandTotal,
    generalTotal: flashTotalRow(rows, /general\s+insurers/i),
    standaloneTotal: flashTotalRow(rows, /stand[\s-]*alone/i),
    specializedTotal: flashTotalRow(rows, /special/i),
  }
}

/** Match the selected company to its IRDAI flash row (null = not in this report). */
export function getIrdaiNonLifeFlashForCompany(
  companyId: string,
  view: IrdaiNonLifeFlashView = getIrdaiNonLifeFlashLatest(),
): IrdaiNonLifeFlashRow | null {
  const aliases = FLASH_COMPANY_ALIASES[companyId]
  if (!aliases || !view.available) return null
  return (
    view.rows.find(
      (r) =>
        r.insurer_group !== 'Total' &&
        aliases.some(
          (a) =>
            r.insurer_name_normalized.toLowerCase().includes(a) ||
            r.insurer_name_original.toLowerCase().includes(a),
        ),
    ) ?? null
  )
}

/** Full monthly history (all ingested months) for charts / drill-downs. */
export function getIrdaiNonLifeFlashHistory(): IrdaiNonLifeFlashRow[] {
  return flashMonthly.data ?? []
}

/** Captured source URLs per report month (provenance / audit trail). */
export function getIrdaiNonLifeFlashSources(): IrdaiNonLifeFlashSource[] {
  return flashSources.data ?? []
}
