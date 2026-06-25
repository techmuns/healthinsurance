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
  /** FY rows are 'annual'; intra-year rows (Q1/H1/9M, all up-to-period) are 'cumulative'. */
  period_type: 'annual' | 'quarterly' | 'cumulative'
  period: string
  fiscal_year: string
  // Premium shares (%) of the NL-36/NL-40 Total (A), up-to-period column.
  // Direct includes officers/employees + company-website online + direct-others
  // (the workbook basis), so online_share stays null rather than double-count.
  banca_share: number | null
  broker_share: number | null
  agent_share: number | null
  corporate_agent_share: number | null
  direct_share: number | null
  online_share: number | null
  others_share: number | null
  total_share?: number | null
  // Per-channel premium (INR cr) and policy counts, same column.
  banca_premium_cr?: number | null
  broker_premium_cr?: number | null
  agent_premium_cr?: number | null
  corporate_agent_premium_cr?: number | null
  direct_premium_cr?: number | null
  others_premium_cr?: number | null
  total_premium_cr?: number | null
  banca_policies?: number | null
  broker_policies?: number | null
  agent_policies?: number | null
  corporate_agent_policies?: number | null
  direct_policies?: number | null
  others_policies?: number | null
  total_policies?: number | null
  // Avg premium per policy (INR '000) = premium ÷ policies, per channel.
  banca_avg_premium?: number | null
  broker_avg_premium?: number | null
  agent_avg_premium?: number | null
  corporate_agent_avg_premium?: number | null
  direct_avg_premium?: number | null
  others_avg_premium?: number | null
  total_avg_premium?: number | null
  basis_note?: string | null
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

// ─── ownership-holdings / ownership-trends (Screener shareholding pattern) ───
// Long-format shareholding-pattern history for the Governance → Ownership Trend
// module. Source: Screener (Investors → Shareholding Pattern). Group-level rows
// (Promoters / FIIs / DIIs / Public / No. of Shareholders) always exist; named
// investor-level rows appear only when Screener exposes the entities behind a
// line-item AND the scrape could expand them (login-gated) — otherwise
// `expanded_investor_rows_available` is false and only group rows are present
// (never fabricated). Percentages are nullable; missing stays null, never 0.

export type OwnershipHolderGroup =
  | 'Promoters'
  | 'FIIs'
  | 'DIIs'
  | 'Public'
  | 'No. of Shareholders'
  | 'Other'

export type OwnershipPeriodType = 'quarterly' | 'yearly'

export type OwnershipValidationStatus = 'scraped' | 'missing_expanded_rows' | 'parse_warning'

export type OwnershipSourceConfidence = 'screener_public_page'

/** One holder/group value at one period — the normalized long-format row. */
export interface OwnershipHoldingRow {
  /** Dashboard join key (matches company-master). Ticker is NIVABUPA. */
  company_id: string
  company_name: string
  ticker?: string
  source_name: 'Screener'
  source_section: string
  /** Per-company Screener page URL (symbol form). */
  source_url: string
  period_type: OwnershipPeriodType
  /** Screener's own period label, e.g. "Dec 2024" / "Mar 2025". */
  period_label: string
  /** Normalized quarter-/year-end date (ISO, YYYY-MM-DD). */
  period_end_date: string
  /** Dashboard fiscal label derived from the period, e.g. "Q3 FY25" / "FY25". */
  fiscal_period: string
  holder_group: OwnershipHolderGroup
  /** Individual holder name when expanded; otherwise equals the group name. */
  holder_name: string
  /** Holding as a % of total — null for the "No. of Shareholders" row. */
  holding_pct: number | null
  /** Populated only on the "No. of Shareholders" row; null elsewhere. */
  shareholder_count: number | null
  is_group_row: boolean
  is_expanded_investor_row: boolean
  /** Exact label scraped from Screener (group label as shown). */
  raw_label: string
  classification_note: string
  scraped_at: string
  source_confidence: OwnershipSourceConfidence
  validation_status: OwnershipValidationStatus
}

export type OwnershipTrendDirection =
  | 'increase'
  | 'decrease'
  | 'no_change'
  | 'new_holder'
  | 'exited'
  | 'insufficient_history'

/** Period-over-period movement for one holder/group, derived from holdings. */
export interface OwnershipTrendRow {
  company_id: string
  period_type: OwnershipPeriodType
  /** Dashboard fiscal labels for the compared periods. */
  current_period: string
  previous_period: string | null
  /** Screener raw labels for the compared periods (audit trail). */
  current_period_label: string
  previous_period_label: string | null
  holder_group: OwnershipHolderGroup
  holder_name: string
  current_holding_pct: number | null
  previous_holding_pct: number | null
  change_pp: number | null
  trend_direction: OwnershipTrendDirection
  absolute_change_pp: number | null
  /** 1 = largest absolute move in this period (ties broken by holding size). */
  rank_by_change: number | null
  /** 1 = largest current holding in this period. */
  rank_by_current_holding: number | null
}

/** Shared meta for both Screener ownership snapshots (self-contained, not merged). */
export interface OwnershipScreenerMeta {
  snapshot_id: string
  description: string
  schema_version: string
  company_id: string
  company_name: string
  ticker?: string
  source_name: 'Screener'
  source_section: string
  source_url: string
  screener_company_id: number
  dataset: SnapshotDataset
  last_updated: string | null
  last_successful_run: string | null
  scraped_at: string | null
  classification_note: string
  /** True only when Screener exposed named investor rows during the scrape. */
  expanded_investor_rows_available: boolean
  expanded_investor_rows_note?: string
  parser_status: ParserStatus
  periods_quarterly: string[]
  periods_yearly: string[]
  validation_status: OwnershipValidationStatus
  notes?: string
}

export interface OwnershipHoldingsEnvelope {
  _meta: OwnershipScreenerMeta
  data: OwnershipHoldingRow[]
}

export interface OwnershipTrendsEnvelope {
  _meta: OwnershipScreenerMeta
  data: OwnershipTrendRow[]
}

// ─── ownership-trade-disclosures (Screener → Trades; bulk & block deals) ─────
// SEPARATE transaction-disclosure dataset for the Bulk / Block Deal Timeline.
// Aggregated by Screener (company page → Investors / Shareholding Pattern →
// Trades); the underlying disclosures are the NSE/BSE bulk & block deal filings.
// This is NOT part of ownership-holdings / ownership-trends — bulk/block deals
// are individual transactions, not the quarter-end shareholding position, and
// the two must never be merged.

export type TradeDealType = 'bulk' | 'block'
export type TradeValidationStatus = 'scraped' | 'no_records' | 'parse_warning' | 'pending'

/** Sources that can contribute a bulk/block deal row. Screener Trades is the
 *  primary aggregator; Moneycontrol Stock Deals is the direct fallback; 'Exchange'
 *  is the daily research agent (live web search of NSE / BSE / Moneycontrol) — the
 *  path that still works when a direct datacenter-IP fetch is blocked. All three
 *  are normalised into this one row shape and de-duped at read-time. */
export type TradeSourceName = 'Screener' | 'Moneycontrol' | 'Exchange'

export interface OwnershipTradeDisclosureRow {
  company_id: string
  company_name: string
  deal_type: TradeDealType
  date: string
  /** Display label for the deal segment, e.g. "Bulk" / "Block". */
  segment: string
  /** Exact buyer name from the disclosure; null when only the sell side is disclosed. */
  buyer: string | null
  /** Exact seller name from the disclosure; null when only the buy side is disclosed. */
  seller: string | null
  quantity: number | null
  quantity_display: string
  price: number | null
  value_cr: number | null
  value_display: string
  /** NSE | BSE | "NSE / BSE" when the aggregator doesn't split it. */
  exchange_source: string
  source_name: TradeSourceName
  source_url: string
  underlying_source: string
  scraped_at: string
  validation_status: TradeValidationStatus
  /** Raw deal-type label exactly as the source printed it (e.g. "Bulk Deal",
   *  "Block Deal", "Large Deal") — kept for provenance, never shown as a number. */
  source_deal_label?: string
  /** Every source that independently reported this same deal — populated at
   *  read-time when Screener + Moneycontrol rows are merged + de-duped. */
  sources?: TradeSourceName[]
}

export interface OwnershipTradeDisclosuresMeta {
  snapshot_id: string
  description: string
  schema_version: string
  source_name: 'Screener'
  source_section: string
  source_url: string
  screener_company_id?: number
  underlying_source: string
  dataset: SnapshotDataset
  last_updated: string | null
  last_successful_run: string | null
  scraped_at: string | null
  parser_status: ParserStatus
  /** Whether the Screener Trades section was located during the scrape. */
  trades_section_found: boolean
  /** Per-deal-type confirmation so the UI can show "0 found" vs "Data pending". */
  validation_status: TradeValidationStatus
  notes?: string
}

export interface OwnershipTradeDisclosuresEnvelope {
  _meta: OwnershipTradeDisclosuresMeta
  data: OwnershipTradeDisclosureRow[]
}

// ─── moneycontrol-stock-deals (fallback source for bulk/block/large deals) ───
// Moneycontrol → Markets → Stock Deals → Large Deals, per stock code (e.g. NBH
// for Niva Bupa: /markets/stock-deals/large-deals/NBH). This is the SECOND
// source behind Screener Trades for the Bulk / Block Deal Timeline: when
// Screener returns zero / incomplete rows (block deals are the usual gap),
// Moneycontrol fills it. Rows reuse OwnershipTradeDisclosureRow with
// source_name 'Moneycontrol'; the data layer merges + de-dupes the two feeds.
// A blocked / failed fetch is recorded honestly (status='blocked') and NEVER
// fabricated — an empty data array means "checked, nothing parseable", which
// the UI distinguishes from "not yet checked".
export type MoneycontrolDealStatus = 'ready' | 'no_records' | 'blocked' | 'parse_warning' | 'pending'

export interface MoneycontrolStockDealsMeta {
  snapshot_id: string
  description: string
  schema_version: string
  source_name: 'Moneycontrol'
  source_section: string
  /** Large-deals page pattern, e.g. https://www.moneycontrol.com/markets/stock-deals/large-deals/NBH */
  source_url: string
  underlying_source: string
  dataset: SnapshotDataset
  last_updated: string | null
  last_successful_run: string | null
  scraped_at: string | null
  parser_status: ParserStatus
  /** Outcome of the most recent Moneycontrol stock-deals fetch. */
  status: MoneycontrolDealStatus
  /** Human-readable detail when status is 'blocked' / 'parse_warning'. */
  status_detail?: string | null
  /** Stock codes / symbols checked this run (e.g. ["NBH"]). */
  symbols_checked?: string[]
  notes?: string
}

export interface MoneycontrolStockDealsEnvelope {
  _meta: MoneycontrolStockDealsMeta
  data: OwnershipTradeDisclosureRow[]
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

/** Live market quote for the focal name, from Moneycontrol's pricefeed. */
export interface StreetMarket {
  current_price: number | null
  week_high_52: number | null
  week_low_52: number | null
  price_change_pct: number | null
  price_as_of: string | null
}

export interface StreetAnalystMeta {
  snapshot_id: string
  description: string
  schema_version: string
  company_id: string
  company_name: string
  /** Primary source label (kept for back-compat). */
  source: string
  source_url: string
  /** Every upstream feed that contributed to this snapshot, for transparency. */
  upstream_sources?: string[]
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
  market?: StreetMarket
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
