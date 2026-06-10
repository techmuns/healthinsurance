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
import sahiPeerSnapshot from '@/data/snapshots/sahi-peer-comparison.json'
import distributionMixSnapshot from '@/data/snapshots/distribution-channel-mix.json'
import distributionReachSnapshot from '@/data/snapshots/distribution-reach-depth.json'
import valuationSnapshot from '@/data/snapshots/valuation-snapshot.json'
import ownershipSnapshot from '@/data/snapshots/ownership-snapshot.json'
import managementEventsSnapshot from '@/data/snapshots/management-events.json'
import provenanceMap from '@/data/snapshots/data-provenance.json'
import irdaiFlashLatestJson from '@/data/snapshots/irdai-nonlife-flash-latest.json'
import irdaiFlashMonthlyJson from '@/data/snapshots/irdai-nonlife-flash-monthly.json'
import irdaiFlashSourcesJson from '@/data/snapshots/irdai-nonlife-flash-sources.json'
import type {
  IrdaiNonLifeFlashRow,
  IrdaiNonLifeFlashSource,
  IrdaiNonLifeFlashEnvelope,
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

export function getOwnershipData(companyId: string) {
  const row = (ownershipSnapshot.data as Array<{ company_id: string }>).find((r) => r.company_id === companyId) ?? null
  return { row, meta: (ownershipSnapshot as MetaBlock)._meta }
}

export function getManagementEvents(companyId: string) {
  const rows = (managementEventsSnapshot.data as Array<{ company_id: string }>).filter((r) => r.company_id === companyId)
  return { rows, meta: (managementEventsSnapshot as MetaBlock)._meta }
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

// Real fetched P/GWP per company from the live valuation feed (listed insurers).
// Prefer this over the annual snapshot's stored multiple so the scorecard /
// builder reflect the latest market price, not a stale figure.
function realPriceToGwp(companyId: string): number | null {
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
// Their records stay in company-master for SAHI industry-level context. (Neha,
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

/** Dashboard freshness, derived from the annual snapshot meta + coverage. */
export function getDataFreshness(): {
  lastUpdated: string
  coverage: string
  quality: string
  periodCoverage: string
} {
  const annual = annualSnapshot.data as InsurerAnnualLike[]
  const fys = [...new Set(annual.map((r) => r.fiscal_year))].sort((a, b) => fyNum(a) - fyNum(b))
  const meta = (annualSnapshot as MetaBlock)._meta
  return {
    lastUpdated: meta.last_updated ?? '—',
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
