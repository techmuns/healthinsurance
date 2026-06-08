// ---------------------------------------------------------------------------
//  Source Automation & Fallback — data model (Phase 1: UI + mock statuses).
//
//  Automation-first by design: the dashboard expects every statutory cell to be
//  acquired from an OFFICIAL source automatically, and only falls back to a
//  human PDF upload when automation is blocked. This module models the source
//  *status ladder* per missing cell, the official source-priority ladder, and
//  the rule that statutory cells may only be filled by official sources.
//
//  IMPORTANT (provenance reality, traced 2026-06-08): company annual reports /
//  disclosures are NOT live-fetched by the app or this sandbox — they are
//  parsed from files already staged in the repo. Live fetching only works in
//  the GitHub Actions runner (Playwright + optional fetch-proxy secret). So the
//  `auto_fetch_*` states below describe what the Actions/cron layer would do;
//  the browser surfaces status and the upload fallback. No values are written
//  here — this is a read-only status/mock layer and does not touch the existing
//  Niva / Star / Care figures.
// ---------------------------------------------------------------------------

/** The source-status ladder — automation first, manual upload last. */
export type SourceState =
  | 'official_source_expected'
  | 'auto_fetch_attempted'
  | 'auto_fetch_success'
  | 'auto_fetch_blocked'
  | 'local_file_found'
  | 'local_file_not_staged'
  | 'parser_supported'
  | 'parser_not_supported'
  | 'needs_manual_upload'
  | 'uploaded_source_received'
  | 'extraction_review_pending'
  | 'approved_for_ingestion'
  | 'genuinely_not_printed'

/** Visual tone reused from SignalBadge; keeps colour-psychology consistent. */
export type StateTone = 'positive' | 'teal' | 'navy' | 'warning' | 'negative' | 'neutral'

export interface StateMeta {
  label: string
  tone: StateTone
  /** True when this state means "automation can't proceed; a human PDF upload unblocks it". */
  fallback: boolean
  note: string
}

export const STATE_META: Record<SourceState, StateMeta> = {
  official_source_expected: { label: 'Official source expected', tone: 'neutral', fallback: false,
    note: 'An official source is known to publish this cell; acquisition not yet attempted.' },
  auto_fetch_attempted: { label: 'Auto-fetch attempted', tone: 'navy', fallback: false,
    note: 'The Actions/cron layer attempted an official fetch; awaiting result.' },
  auto_fetch_success: { label: 'Fetched automatically', tone: 'positive', fallback: false,
    note: 'Official source fetched automatically — flows into ingestion, no upload needed.' },
  auto_fetch_blocked: { label: 'Auto-fetch blocked', tone: 'negative', fallback: true,
    note: 'Official source exists, but automated fetch is blocked (egress 403 / browser-gated). Upload the official PDF to continue.' },
  local_file_found: { label: 'Local file found', tone: 'teal', fallback: false,
    note: 'A staged official file for this period is already in the repo.' },
  local_file_not_staged: { label: 'Not staged locally', tone: 'warning', fallback: true,
    note: 'No staged file for this period yet; download the official PDF and stage it.' },
  parser_supported: { label: 'Parser ready', tone: 'positive', fallback: false,
    note: 'The existing parser/source-map layer can read this layout once the file is present.' },
  parser_not_supported: { label: 'Parser gap', tone: 'warning', fallback: true,
    note: 'File present, but the parser cannot read this layout yet (a parser change is required).' },
  needs_manual_upload: { label: 'Needs upload', tone: 'warning', fallback: true,
    note: 'Automation and local-file checks failed — manual official PDF upload is the fallback.' },
  uploaded_source_received: { label: 'Uploaded', tone: 'navy', fallback: false,
    note: 'An official PDF was uploaded; auto-detection in progress.' },
  extraction_review_pending: { label: 'Review pending', tone: 'navy', fallback: false,
    note: 'Candidate values extracted; awaiting human review before ingestion.' },
  approved_for_ingestion: { label: 'Approved', tone: 'positive', fallback: false,
    note: 'Reviewed and approved into the source-map / annual_report layer with full audit trail.' },
  genuinely_not_printed: { label: 'Not printed in source', tone: 'neutral', fallback: false,
    note: 'The metric is genuinely not printed in any available official source for this period.' },
}

/** Basis of a source → whether it may fill a statutory insurance cell. */
export type SourceBasis = 'statutory' | 'ifrs' | 'broker' | 'market_data'

export const BASIS_META: Record<SourceBasis, { label: string; allowsStatutory: boolean; note: string }> = {
  statutory: { label: 'Statutory (IGAAP)', allowsStatutory: true,
    note: 'Official annual report / public disclosure / IRDAI form / exchange filing.' },
  ifrs: { label: 'IFRS (special-purpose)', allowsStatutory: false,
    note: 'Company IFRS disclosures — only for the clearly-labelled IFRS cells, never statutory.' },
  broker: { label: 'Broker / analyst', allowsStatutory: false,
    note: 'Broker reports may ONLY feed analyst/broker-view sections — blocked from statutory cells.' },
  market_data: { label: 'Market data', allowsStatutory: false,
    note: 'Exchange price / aggregator data — non-statutory; blocked from statutory cells.' },
}

/** A source may fill a statutory cell only if it is statutory-basis AND official. */
export function allowedForStatutory(basis: SourceBasis, official: boolean): boolean {
  return official && BASIS_META[basis].allowsStatutory
}

/** Statutory metrics this module prioritises (the SAHI statutory grid). */
export const PRIORITY_STATUTORY_METRICS = [
  'total_gwp', 'gross_direct_premium', 'nwp', 'nep', 'pat_igaap',
  'claims_ratio_igaap', 'expense_ratio_igaap', 'combined_ratio_igaap',
  'solvency_ratio', 'net_worth_igaap',
] as const

export const METRIC_LABEL: Record<string, string> = {
  total_gwp: 'Gross Written Premium', gross_direct_premium: 'Gross Direct Premium',
  nwp: 'Net Written Premium', nep: 'Net Earned Premium', pat_igaap: 'Profit After Tax (IGAAP)',
  claims_ratio_igaap: 'Claims Ratio', expense_ratio_igaap: 'Expense Ratio',
  combined_ratio_igaap: 'Combined Ratio', solvency_ratio: 'Solvency Ratio',
  net_worth_igaap: 'Net Worth (IGAAP)', pat_ifrs: 'PAT (IFRS)',
  claims_ratio_ifrs: 'Claims Ratio (IFRS)', expense_ratio_ifrs: 'Expense Ratio (IFRS)',
  net_worth_ifrs: 'Net Worth (IFRS)',
}

/** The official source-priority ladder — manual upload is rank 6 (last resort). */
export interface LadderStep { rank: number; label: string; note: string; automated: boolean }
export const SOURCE_PRIORITY_LADDER: LadderStep[] = [
  { rank: 1, label: 'Company IR / financial disclosures page', note: 'Official investor-relations / financials page.', automated: true },
  { rank: 2, label: 'IRDAI / BAP public disclosures', note: 'Regulator public-disclosure portal.', automated: true },
  { rank: 3, label: 'Exchange filings (NSE / BSE)', note: 'Listed insurers only — quarterly results.', automated: true },
  { rank: 4, label: 'Staged repo / local source files', note: 'Files already committed under data/raw/.', automated: true },
  { rank: 5, label: 'Curated source-map / annual_report layer', note: 'Hand-transcribed, page-cited statutory values.', automated: true },
  { rank: 6, label: 'Manual PDF upload (fallback)', note: 'Only when fetch is blocked, file not staged, page needs a human browser, or the parser needs a local file.', automated: false },
]

/** Supported upload document types and their source basis. */
export interface DocTypeOption { key: string; label: string; basis: SourceBasis; official: boolean }
export const SUPPORTED_DOC_TYPES: DocTypeOption[] = [
  { key: 'annual_report', label: 'Annual Report', basis: 'statutory', official: true },
  { key: 'public_disclosure', label: 'IRDAI / company Public Disclosure', basis: 'statutory', official: true },
  { key: 'exchange_result', label: 'Exchange result filing', basis: 'statutory', official: true },
  { key: 'investor_presentation', label: 'Investor Presentation (IFRS-tagged only)', basis: 'ifrs', official: true },
  { key: 'broker_report', label: 'Broker report (analyst sections only)', basis: 'broker', official: false },
]

// ---------------------------------------------------------------------------
//  Mock data — seeded with the REAL, currently-known blockers (Phase 1).
// ---------------------------------------------------------------------------

export interface SourceCellStatus {
  companyId: string
  company: string
  metric: string
  period: string
  basis: SourceBasis
  state: SourceState
  reachedRank: number
  officialSource?: { label: string; url?: string }
  note: string
}

export const MOCK_CELL_STATUS: SourceCellStatus[] = [
  // Aditya Birla — official subsidiaries' audited report exists; sandbox egress blocked.
  { companyId: 'aditya-birla', company: 'Aditya Birla Health', metric: 'total_gwp', period: 'FY25', basis: 'statutory',
    state: 'auto_fetch_blocked', reachedRank: 1, officialSource: { label: 'grasim.com subsidiaries financial report FY25', url: 'https://www.grasim.com/Upload/PDF/aditya-birla-capital-subsidiaries-financial-report-2024-25.pdf' },
    note: 'Official report confirmed; fetch returns 403 from the sandbox egress allowlist.' },
  { companyId: 'aditya-birla', company: 'Aditya Birla Health', metric: 'pat_igaap', period: 'FY25', basis: 'statutory',
    state: 'auto_fetch_blocked', reachedRank: 1, officialSource: { label: 'ABCL subsidiary financials page', url: 'https://www.adityabirlacapital.com/investor-relations/financial-reports-for-other-subsidiary-companies' },
    note: 'Official source exists; automated fetch blocked.' },
  { companyId: 'aditya-birla', company: 'Aditya Birla Health', metric: 'combined_ratio_igaap', period: 'FY24', basis: 'statutory',
    state: 'auto_fetch_blocked', reachedRank: 2, officialSource: { label: 'IRDAI BAP public disclosures' },
    note: 'Annexure-3 ratios exist in the annual report; fetch blocked, not staged.' },

  // ManipalCigna — disclosures page is browser-gated; nothing staged.
  { companyId: 'manipalcigna', company: 'ManipalCigna Health', metric: 'nep', period: 'FY25', basis: 'statutory',
    state: 'auto_fetch_blocked', reachedRank: 1, officialSource: { label: 'manipalcigna.com financial-disclosures', url: 'https://www.manipalcigna.com/disclosures/financial-disclosures' },
    note: 'FY25 report behind an interactive selector; sandbox fetch returns 403.' },
  { companyId: 'manipalcigna', company: 'ManipalCigna Health', metric: 'solvency_ratio', period: 'FY25', basis: 'statutory',
    state: 'needs_manual_upload', reachedRank: 4, officialSource: { label: 'manipalcigna.com public-disclosures' },
    note: 'Automation + local-file checks failed — manual upload is the fallback.' },

  // Star — listed; recent-quarter disclosures fetch-blocked + parser gaps.
  { companyId: 'star-health', company: 'Star Health', metric: 'claims_ratio_igaap', period: 'FY26', basis: 'statutory',
    state: 'auto_fetch_blocked', reachedRank: 1, officialSource: { label: 'starhealth.in public disclosures', url: 'https://www.starhealth.in/investors/financial-information/' },
    note: 'FY26 year-end public disclosure (NL-20) not staged; fetch blocked.' },
  { companyId: 'star-health', company: 'Star Health', metric: 'expense_ratio_igaap', period: 'FY26', basis: 'statutory',
    state: 'parser_not_supported', reachedRank: 4, officialSource: { label: 'NL-20 analytical ratios' },
    note: 'NL-20 prints 2–3 expense bases; parser excludes expense pending a basis decision.' },
  { companyId: 'star-health', company: 'Star Health', metric: 'pat_igaap', period: 'Q4FY26', basis: 'statutory',
    state: 'auto_fetch_blocked', reachedRank: 3, officialSource: { label: 'NSE/BSE quarterly results' },
    note: 'PAT not in IRDAI disclosures; lives in exchange filings (listed) — fetch blocked.' },

  // Care — files ARE staged, but the parser cannot read Care's NL-1 layout yet.
  { companyId: 'care-health', company: 'Care Health', metric: 'nep', period: 'Q4FY25', basis: 'statutory',
    state: 'parser_not_supported', reachedRank: 4, officialSource: { label: 'staged Care public disclosure (NL-1)' },
    note: 'NL-1 revenue account is staged & printed, but the parser blocks Care’s lakh/Indian-comma layout.' },
  { companyId: 'care-health', company: 'Care Health', metric: 'claims_ratio_igaap', period: 'FY23', basis: 'statutory',
    state: 'local_file_not_staged', reachedRank: 4, officialSource: { label: 'Care FY23 year-end public disclosure' },
    note: 'Only Q1–Q3 FY23 staged; the year-end (Mar-2023) disclosure is not staged.' },
  { companyId: 'care-health', company: 'Care Health', metric: 'pat_igaap', period: 'FY25', basis: 'statutory',
    state: 'genuinely_not_printed', reachedRank: 5, officialSource: { label: 'NL-2 P&L (blank in public disclosures)' },
    note: 'PAT is not printed in public disclosures; needs the Care annual report (fetch blocked).' },

  // Already-resolved examples (the real Star AR / Niva fills) — automation/curation succeeded.
  { companyId: 'star-health', company: 'Star Health', metric: 'total_gwp', period: 'FY25', basis: 'statutory',
    state: 'approved_for_ingestion', reachedRank: 5, officialSource: { label: 'Star FY25 Annual Report p.238 (Annexure 2)' },
    note: 'Hand-transcribed into the annual_report layer; audited statutory, page-cited.' },
  { companyId: 'niva-bupa', company: 'Niva Bupa', metric: 'nep', period: 'FY25', basis: 'statutory',
    state: 'approved_for_ingestion', reachedRank: 4, officialSource: { label: 'Niva NL-1 public disclosure' },
    note: 'Parsed from a staged official disclosure; statutory, column-verified.' },
]

/** Mock extraction candidates — what an uploaded Aditya Birla FY25 report would yield. */
export interface ExtractionCandidate {
  metric: string
  period: string
  rawValue: string
  normalizedValue: number | null
  unit: string
  basis: SourceBasis
  official: boolean
  sourcePage: number
  exactLabel: string
  confidence: 'high' | 'medium' | 'low'
  currentValue: number | null
  conflict: 'none' | 'matches' | 'supersedes' | 'conflict' | 'blocked_non_statutory'
}

export const MOCK_EXTRACTION: { docLabel: string; company: string; period: string; docType: string; basis: SourceBasis; official: boolean; confidence: number; rows: ExtractionCandidate[] } = {
  docLabel: 'aditya-birla-Annual-Report-FY25.pdf',
  company: 'Aditya Birla Health', period: 'FY25', docType: 'Annual Report', basis: 'statutory', official: true, confidence: 0.94,
  rows: [
    { metric: 'total_gwp', period: 'FY25', rawValue: '37,010 lakhs', normalizedValue: 3701, unit: 'INR_cr', basis: 'statutory', official: true, sourcePage: 12, exactLabel: 'Gross Written Premium', confidence: 'high', currentValue: null, conflict: 'none' },
    { metric: 'nwp', period: 'FY25', rawValue: '34,180 lakhs', normalizedValue: 3418, unit: 'INR_cr', basis: 'statutory', official: true, sourcePage: 12, exactLabel: 'Net premium income', confidence: 'high', currentValue: null, conflict: 'none' },
    { metric: 'combined_ratio_igaap', period: 'FY25', rawValue: '108.4%', normalizedValue: 1.084, unit: 'ratio', basis: 'statutory', official: true, sourcePage: 41, exactLabel: 'Combined ratio (Annexure 3 #10)', confidence: 'high', currentValue: null, conflict: 'none' },
    { metric: 'solvency_ratio', period: 'FY25', rawValue: '1.62', normalizedValue: 1.62, unit: 'x', basis: 'statutory', official: true, sourcePage: 40, exactLabel: 'Solvency Ratio', confidence: 'medium', currentValue: null, conflict: 'none' },
    // A broker-sourced ratio is BLOCKED from the statutory cell (rule demo).
    { metric: 'combined_ratio_igaap', period: 'FY25', rawValue: '107%', normalizedValue: 1.07, unit: 'ratio', basis: 'broker', official: false, sourcePage: 3, exactLabel: 'Est. combined ratio (broker note)', confidence: 'low', currentValue: null, conflict: 'blocked_non_statutory' },
  ],
}

/** Mock audit trail — approved values entering the source-map / annual_report layer. */
export interface AuditRow {
  company: string; metric: string; period: string; value: number
  sourceFile: string; page: number; exactLabel: string; basis: SourceBasis; layer: string; approvedAt: string
}
export const MOCK_AUDIT: AuditRow[] = [
  { company: 'Star Health', metric: 'total_gwp', period: 'FY25', value: 16781.36, sourceFile: 'star-health-AR…2024_2025.pdf', page: 238, exactLabel: 'Gross Written premium', basis: 'statutory', layer: 'annual_report', approvedAt: '2026-06-08' },
  { company: 'Star Health', metric: 'pat_igaap', period: 'FY25', value: 645.86, sourceFile: 'star-health-AR…2024_2025.pdf', page: 238, exactLabel: 'Profit / (Loss) after tax', basis: 'statutory', layer: 'annual_report', approvedAt: '2026-06-08' },
  { company: 'Niva Bupa', metric: 'nep', period: 'FY25', value: 4894.46, sourceFile: 'niva-bupa-Website-Public-Disclosures-Mar-2025.pdf', page: 2, exactLabel: 'Premiums earned (Net)', basis: 'statutory', layer: 'company_filing', approvedAt: '2026-06-08' },
]
