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
  /** Default-highlighted company on load (exactly one row sets this true). */
  is_focal?: boolean
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
  // ── Segment premiums (₹ Cr). Headline value is the PURE MONTHLY figure when
  //    `monthly_basis === 'monthly'`, or the cumulative "up to month" figure when
  //    `monthly_basis === 'up_to_month'` (first month with no predecessor YTD).
  //    Source: GI Council Segmentwise Report only. A missing column stays null
  //    (never coerced to 0). The matching `*_ytd` field always carries the raw
  //    cumulative value the report published, so the basis is auditable.
  health_premium: number | null
  retail_health_premium: number | null
  group_health_premium: number | null
  government_health_premium: number | null
  overseas_medical_premium: number | null
  motor_premium: number | null
  fire_premium: number | null
  crop_premium: number | null
  marine_premium: number | null
  other_premium: number | null
  // ── Cumulative ("for the period up to [month]") counterparts of each segment.
  health_premium_ytd: number | null
  retail_health_premium_ytd: number | null
  group_health_premium_ytd: number | null
  government_health_premium_ytd: number | null
  overseas_medical_premium_ytd: number | null
  motor_premium_ytd: number | null
  fire_premium_ytd: number | null
  crop_premium_ytd: number | null
  marine_premium_ytd: number | null
  other_premium_ytd: number | null
  /** Whether the headline segment fields are a true single-month delta
   *  (YTD − prior YTD) or a cumulative figure shown because no prior month
   *  exists yet. The UI must label 'up_to_month' rows honestly. */
  monthly_basis: 'monthly' | 'up_to_month'
  /** Human period label, e.g. "For the period up to May 2025". */
  source_period?: string
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
  // Health sub-splits for the INDUSTRY total — populated for monthly rows from
  // the GI Council Segmentwise Report. Optional so existing annual rows (which
  // carry only the top-level segments) stay valid.
  retail_health_premium?: number | null
  group_health_premium?: number | null
  government_health_premium?: number | null
  overseas_medical_premium?: number | null
  motor_premium: number | null
  fire_premium: number | null
  crop_premium: number | null
  marine_premium: number | null
  other_premium: number | null
  total_gi_premium: number | null
  health_share: number | null
  motor_share: number | null
  /** Present on monthly rows: whether segment figures are a true single-month
   *  delta or a cumulative "up to month" value. */
  monthly_basis?: 'monthly' | 'up_to_month'
  source_period?: string
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

// ─── irdai-nonlife-flash (IRDAI Non-Life Flash Figures) ─────────────────────
// Monthly industry-wide Gross Direct Premium WRITTEN (not earned / net /
// retained), Rs crore, PROVISIONAL & UNAUDITED. Source: the official IRDAI
// "Gross Direct Premium - Flash figures of Non-life Insurers" document family.
// Produced by scripts/ingest/ingest-irdai-nonlife-flash.ts into three files:
//   irdai-nonlife-flash-monthly.json  (full history)
//   irdai-nonlife-flash-latest.json   (newest report month)
//   irdai-nonlife-flash-sources.json  (captured source URLs per month)

export type IrdaiNonLifeInsurerGroup =
  | 'General Insurer'
  | 'Standalone Health'
  | 'Specialized PSU'
  | 'Total'
  | 'Unknown'

export interface IrdaiNonLifeFlashRow {
  source: 'IRDAI Non-Life Flash Figures'
  source_url: string
  downloaded_file_url?: string
  file_type: 'xlsx' | 'pdf'
  report_month: string
  report_year: number
  financial_year_current: string
  financial_year_previous: string
  insurer_name_original: string
  insurer_name_normalized: string
  insurer_group: IrdaiNonLifeInsurerGroup
  /** Gross Direct Premium for the report month — current FY (Rs crore). */
  premium_for_month_current_year: number | null
  /** Gross Direct Premium for the report month — previous FY (Rs crore). */
  premium_for_month_previous_year: number | null
  /** Cumulative ("up to the month") Gross Direct Premium — current FY. */
  premium_ytd_current_year: number | null
  /** Cumulative ("up to the month") Gross Direct Premium — previous FY. */
  premium_ytd_previous_year: number | null
  market_share_ytd_percent: number | null
  growth_yoy_percent: number | null
  unit: 'Rs crore'
  provisional: true
  unaudited: true
  fetched_at: string
}

export interface IrdaiNonLifeFlashSource {
  report_month: string
  report_year: number
  month_key: string
  source: 'IRDAI Non-Life Flash Figures'
  source_url: string
  downloaded_file_url: string | null
  file_type: 'xlsx' | 'pdf' | null
  status: 'official' | 'blocked' | 'pending'
  rows: number
  fetched_at: string
}

/** Self-contained envelope for the flash snapshots (not part of the merge). */
export interface IrdaiNonLifeFlashMeta {
  snapshot_id: string
  description: string
  schema_version: string
  source: 'IRDAI Non-Life Flash Figures'
  source_url: string
  dataset: SnapshotDataset
  last_updated: string | null
  last_successful_run?: string | null
  last_fetched_at?: string | null
  report_month?: string | null
  report_year?: number | null
  financial_year_current?: string | null
  financial_year_previous?: string | null
  unit: 'Rs crore'
  provisional: true
  unaudited: true
  parser_status: ParserStatus
  notes?: string
}

export interface IrdaiNonLifeFlashEnvelope<TRow> {
  _meta: IrdaiNonLifeFlashMeta
  data: TRow[]
}

// ─── street-analyst (Moneycontrol analyst coverage) ────────────────────────
// Daily-refreshed analyst coverage for the focal listed insurer (Niva Bupa):
// each covering broker's latest rating + target, plus the consensus. Source:
// Moneycontrol. Self-contained envelope (NOT part of the generic merge), and
// block-tolerant — a failed/empty fetch never blanks real data and never
// fabricates a number (missing stays null).

export type StreetRating = 'Buy' | 'Add' | 'Hold' | 'Equal-weight' | 'Reduce' | 'Sell'

export interface StreetAnalystReportRow {
  brokerage: string
  rating: StreetRating | null
  target_price: number | null
  report_date: string
  thesis: string | null
  /** Reference into valuationSources.ts (curated seed rows). */
  source_id?: string | null
  /** Direct source URL (dynamic rows scraped from Moneycontrol). */
  source_url?: string | null
  /** Validation status as rendered by the Street View confidence pill. */
  confidence: 'verified' | 'secondary' | 'pending'
}

export interface StreetAnalystConsensus {
  current_price: number | null
  consensus_target_price: number | null
  highest_target_price: number | null
  lowest_target_price: number | null
  analyst_count: number | null
  buy_count: number | null
  hold_count: number | null
  sell_count: number | null
  last_updated: string | null
}

export interface StreetAnalystMeta {
  snapshot_id: string
  description: string
  schema_version: string
  company_id: string
  company_name: string
  source: 'Moneycontrol'
  source_url: string
  dataset: SnapshotDataset
  last_updated: string | null
  last_successful_run?: string | null
  last_fetched_at?: string | null
  parser_status: ParserStatus
  notes?: string
}

export interface StreetAnalystSnapshot {
  _meta: StreetAnalystMeta
  consensus: StreetAnalystConsensus
  reports: StreetAnalystReportRow[]
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
