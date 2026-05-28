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
import type { TimePeriod, PeerGroup } from '@/data/types'

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
