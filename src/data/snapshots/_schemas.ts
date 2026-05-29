// ---------------------------------------------------------------------------
//  Snapshot schemas — TypeScript interfaces for every JSON file under
//  src/data/snapshots/. The data pipeline produces snapshots in these shapes;
//  the dashboard reads them through src/lib/dataLayer.ts.
//
//  Numerical values are nullable. Any missing metric MUST stay null; the
//  UI surfaces an "unavailable" state rather than a fabricated number.
// ---------------------------------------------------------------------------

export type SnapshotDataset = 'official' | 'mixed' | 'mock' | 'pending'
export type SnapshotConfidence = 'high' | 'medium' | 'low' | 'pending'
export type ParserStatus = 'ready' | 'pending' | 'blocked' | 'manual_fallback'

export interface SnapshotMeta {
  snapshot_id: string
  description: string
  schema_version: string
  dataset: SnapshotDataset
  last_updated: string | null
  last_successful_run: string | null
  upstream_sources: string[]
  parser_status: ParserStatus
  notes?: string
}

export interface ProvenanceEntry {
  source_name: string
  source_url: string
  source_file?: string
  source_period?: string
  fetched_at: string | null
  parsed_at: string | null
  parser_name?: string
  confidence: SnapshotConfidence
}

export interface SnapshotEnvelope<TRow> {
  _meta: SnapshotMeta
  data: TRow[]
}

// ─── company-master ────────────────────────────────────────────────────────

export type Segment = 'SAHI' | 'General' | 'Life'

export interface CompanyMasterRow {
  company_id: string
  display_name: string
  short_name: string
  legal_name: string
  segment: Segment
  peer_group: Segment
  listed_status: 'listed' | 'unlisted'
  ticker: string | null
  exchange: 'NSE' | 'BSE' | null
  company_website: string
  investor_relations_url: string | null
  financial_disclosure_url: string | null
  irdai_registration_number: string | null
  active_status: 'active' | 'inactive'
  last_checked_at: string | null
}

// ─── insurer-annual-snapshot ───────────────────────────────────────────────

export interface InsurerAnnualRow {
  company_id: string
  fiscal_year: string
  gwp: number | null
  // Revenue-Account "Gross Direct Premium" (the basis NWP/NEP are computed on).
  // Differs from headline `gwp` only when IRDAI's 1/n long-term-premium rule
  // applies (e.g. Niva Bupa FY25: gross_direct_premium 6,762 Cr vs gwp 7,407 Cr).
  // The Premium-Engine Flow chart uses this for a consistent GWP→NWP→NEP basis;
  // `gwp` stays the headline for market-share / growth views.
  gross_direct_premium?: number | null
  nwp: number | null
  nep: number | null
  pat: number | null
  revenue: number | null
  combined_ratio: number | null
  cisor: number | null
  claims_ratio: number | null
  expense_ratio: number | null
  commission_ratio: number | null
  solvency_ratio: number | null
  roe: number | null
  market_share: number | null
  retail_mix: number | null
  group_mix: number | null
  renewal_rate: number | null
  claims_settlement_ratio: number | null
  // Per-company summary fields that feed the Executive-Overview `Insurer`
  // universe. Nullable: a missing value renders as N/A, never zero.
  customer_retention: number | null
  /** GWP growth YoY (%). Derived from prior-year GWP where two years exist;
   *  otherwise carries the value cited in the company's own results release. */
  growth_yoy: number | null
  /** Segment market-share change YoY (pp). */
  market_share_change: number | null
  /** Price / GWP multiple (x). Listed insurers only; null for unlisted. */
  valuation_p_gwp: number | null
  branch_count: number | null
  employee_count: number | null
  distribution_summary: string | null
  provenance: ProvenanceEntry
}

// ─── insurer-quarterly-financials ──────────────────────────────────────────

export interface InsurerQuarterlyRow {
  company_id: string
  period_type: 'quarterly'
  quarter: string
  fiscal_year: string
  gwp: number | null
  nwp: number | null
  nep: number | null
  pat: number | null
  combined_ratio: number | null
  cisor: number | null
  claims_ratio: number | null
  expense_ratio: number | null
  commission_ratio: number | null
  solvency_ratio: number | null
  roe: number | null
  renewal_rate: number | null
  provenance: ProvenanceEntry
}

// ─── insurer-monthly-premium ───────────────────────────────────────────────

export interface InsurerMonthlyRow {
  company_id: string
  period_type: 'monthly'
  month: string
  fiscal_year: string
  gross_direct_premium: number | null
  health_premium: number | null
  retail_health_premium: number | null
  group_health_premium: number | null
  market_share: number | null
  growth_yoy: number | null
  growth_mom: number | null
  provenance: ProvenanceEntry
}

// ─── industry-segment-premium ──────────────────────────────────────────────

export interface IndustrySegmentRow {
  period_type: 'monthly' | 'annual'
  period: string
  fiscal_year: string
  health_premium: number | null
  motor_premium: number | null
  fire_premium: number | null
  crop_premium: number | null
  marine_premium: number | null
  other_premium: number | null
  total_gi_premium: number | null
  health_share: number | null
  motor_share: number | null
  provenance: ProvenanceEntry
}

// ─── sahi-peer-comparison ──────────────────────────────────────────────────

export interface SahiPeerRow {
  company_id: string
  fiscal_year: string
  gwp: number | null
  growth: number | null
  health_market_share: number | null
  retail_health_market_share: number | null
  pat: number | null
  combined_ratio: number | null
  claims_ratio: number | null
  expense_ratio: number | null
  solvency_ratio: number | null
  distribution_concentration: number | null
  provenance: ProvenanceEntry
}

// ─── distribution-channel-mix ──────────────────────────────────────────────

export interface DistributionMixRow {
  company_id: string
  period_type: 'annual' | 'quarterly'
  period: string
  fiscal_year: string
  banca_share: number | null
  broker_share: number | null
  agent_share: number | null
  corporate_agent_share: number | null
  direct_share: number | null
  online_share: number | null
  others_share: number | null
  largest_channel: string | null
  channel_concentration_score: number | null
  agency_dependence_score: number | null
  provenance: ProvenanceEntry
}

// ─── distribution-reach-depth ──────────────────────────────────────────────

export interface ReachDepthRow {
  company_id: string
  period_type: 'annual'
  period: string
  fiscal_year: string
  region: 'North' | 'South' | 'East' | 'West' | 'Central' | null
  state: string | null
  city: string | null
  city_tier: 'Tier 1' | 'Tier 2' | 'Tier 3' | null
  premium: number | null
  policy_count: number | null
  average_premium: number | null
  branch_count: number | null
  hospital_network_count: number | null
  provenance: ProvenanceEntry
}

// ─── valuation-snapshot ────────────────────────────────────────────────────

export interface ValuationRow {
  company_id: string
  date: string
  market_cap: number | null
  share_price: number | null
  shares_outstanding: number | null
  price_to_book: number | null
  price_to_earnings: number | null
  price_to_gwp: number | null
  price_to_nep: number | null
  analyst_target_price: number | null
  provenance: ProvenanceEntry
}

// ─── ownership-snapshot ────────────────────────────────────────────────────

export interface OwnershipHolder {
  name: string
  type: 'Promoter' | 'FII' | 'DII' | 'MF' | 'PE' | 'Public' | 'Other'
  share: number | null
  change: number | null
}

export interface OwnershipRow {
  company_id: string
  quarter: string
  fiscal_year: string
  promoter_share: number | null
  fii_share: number | null
  dii_share: number | null
  mf_share: number | null
  public_share: number | null
  sponsor_share: number | null
  top_holders: OwnershipHolder[]
  pledge_share: number | null
  provenance: ProvenanceEntry
}

// ─── management-events ─────────────────────────────────────────────────────

export type ManagementEventType =
  | 'appointment'
  | 'resignation'
  | 'reappointment'
  | 'termination'
  | 'authorization'
  | 'board_change'
  | 'kmp_change'
  | 'esop'
  | 'other'

export interface ManagementEventRow {
  company_id: string
  event_date: string
  event_type: ManagementEventType
  person_name: string | null
  designation: string | null
  event_summary: string
  source_url: string
  source_file: string | null
  fetched_at: string | null
  confidence: SnapshotConfidence
}

// ─── data-health ───────────────────────────────────────────────────────────

export interface DataHealthSourceStatus {
  source_id: string
  status: 'success' | 'failed' | 'pending' | 'blocked'
  last_attempt_at: string | null
  last_success_at: string | null
  error?: string
  records_fetched: number | null
}

export interface DataHealthReport {
  last_successful_run: string | null
  last_failed_run: string | null
  sources_checked: number
  sources_success: number
  sources_failed: number
  metrics_updated: string[]
  metrics_missing: string[]
  stale_metrics: string[]
  blocked_sources: string[]
  parser_warnings: string[]
  next_expected_update: string | null
  per_source: DataHealthSourceStatus[]
}

// ─── data-provenance ───────────────────────────────────────────────────────

export interface ProvenanceKey {
  metric_id: string
  company_id?: string
  period?: string
}

export interface ProvenanceMap {
  /** Keyed as `metric_id::company_id::period`. */
  [key: string]: ProvenanceEntry
}
