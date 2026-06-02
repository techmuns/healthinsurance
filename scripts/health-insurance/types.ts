// ---------------------------------------------------------------------------
//  Shared types for the Indian Health Insurance Disclosure Scraper.
//
//  These are the durable contracts every module agrees on. The JSON shapes
//  written to data/<slug>.json, data/run-report.json, data/source-status.json
//  and data/extraction-review-queue.json are all expressed here so the schema
//  validator (quality/schema.ts) and the dashboard can rely on one source of
//  truth.
//
//  Design rule that pervades these types: a missing value is `null`, never 0.
//  Nothing in this pipeline coerces an absent metric to a number.
// ---------------------------------------------------------------------------

/** Provenance / quality tag attached to every metric observation. */
export type Tag =
  | 'confirmed' // value directly visible in an official source document
  | 'derived' // calculated from clearly-sourced values (must be labelled)
  | 'fallback' // sourced from a lawful public fallback, not the primary source
  | 'review_required' // extraction confidence low — needs a human look
  | 'blocked_source' // the source returned a hard block (401/403/captcha)
  | 'low_confidence' // pattern-only / ambiguous extraction

/** Where a document or metric came from. */
export type SourceType = 'company_ir' | 'exchange' | 'irdai' | 'fallback'

/** The 16 document categories every discovered document is classified into. */
export type DocumentType =
  | 'quarterly_result'
  | 'earnings_presentation'
  | 'investor_presentation'
  | 'press_release'
  | 'annual_report'
  | 'integrated_report'
  | 'esg_report'
  | 'corporate_governance_report'
  | 'earnings_call_transcript'
  | 'analyst_call_transcript'
  | 'investor_day_presentation'
  | 'stock_exchange_filing'
  | 'irdai_disclosure'
  | 'regulatory_circular'
  | 'industry_report'
  | 'unknown'

export type FileType = 'pdf' | 'html' | 'xlsx' | 'csv' | 'unknown'

export type PeriodType = 'quarter' | 'annual' | 'ttm' | 'unknown'

/** Lifecycle status of a discovered document. */
export type DocumentStatus =
  | 'downloaded'
  | 'skipped'
  | 'blocked'
  | 'failed'
  | 'review_required'

/** Reachability status of a source for the run report / source-status.json. */
export type SourceStatusValue = 'ok' | 'blocked' | 'failed' | 'skipped' | 'pending'

// ─── Configuration shapes (hard-coded, non-financial) ───────────────────────

export interface CompanyConfig {
  slug: string
  name: string
  aliases: string[]
  investorRelationsUrls: string[]
  disclosureUrls: string[]
  /** Exchange tickers / scrip codes for listed insurers (empty for unlisted). */
  exchangeIdentifiers: {
    nseSymbol?: string
    bseScripCode?: string
    isin?: string
  }
  /** Classification / allow-deny hints that tune document discovery. */
  documentRules: {
    /** Filename / anchor patterns to always keep (strings compiled to RegExp). */
    allow?: string[]
    /** Filename / anchor patterns to always drop (policy wording, KYC, etc.). */
    deny?: string[]
  }
  /** Directory under the raw cache that already holds this insurer's files. */
  rawDir: string
  /** IRDAI registration number, kept for cross-referencing regulatory data. */
  irdaiRegistration?: string
  /** Whether the insurer is a primary focal company for the dashboard. */
  focal: boolean
}

export interface SourceEndpoint {
  sourceType: SourceType
  /** Stable id for logs / source-status rows, e.g. "niva-bupa:company_ir". */
  id: string
  label: string
  url: string
}

export interface MetricDef {
  /** camelCase key used in the company JSON `metrics` map. */
  key: string
  label: string
  unit: string | null
  category:
    | 'premium'
    | 'profitability'
    | 'claims'
    | 'efficiency'
    | 'capital'
    | 'distribution'
    | 'operating'
  /** LABEL locator regex sources (string form), best first. Value parsing is
   *  handled centrally by the extractor with unit-cue rules. */
  patterns: string[]
  /** Optional regex (string) matched against the text immediately BEFORE the
   *  label; when it matches, the occurrence is skipped. Stops e.g. "Net Worth"
   *  matching inside "Return on Average Net Worth". */
  denyContext?: string
  /** Plausibility band — values outside are rejected as misreads. */
  min: number
  max: number
  /** Currency for monetary metrics; null for ratios / counts. */
  currency?: 'INR' | null
}

// ─── Output record shapes ───────────────────────────────────────────────────

/** A discovered document — catalogued whether or not extraction succeeds. */
export interface DocumentRecord {
  title: string
  company: string
  slug: string
  publishedDate: string | null
  period: string | null
  sourceUrl: string
  finalUrl: string | null
  localPath: string | null
  documentType: DocumentType
  sourceType: SourceType
  fileType: FileType
  downloadedAt: string | null
  hash: string | null
  status: DocumentStatus
  /** Optional fallback provenance, present only on fallback-tagged records. */
  fallback?: FallbackTag
}

export interface FallbackTag {
  tag: 'fallback'
  originalSource: string
  fallbackSource: string
  reason: string
}

/** A single metric observation — the atomic unit of the time series. */
export interface MetricObservation {
  metric: string
  label: string
  period: string
  periodType: PeriodType
  fiscalYear: string | null
  quarter: string | null
  value: number | null
  unit: string | null
  currency: 'INR' | null
  company: string
  slug: string
  source: string
  sourceUrl: string
  documentTitle: string
  documentType: DocumentType
  pageNumber: number | null
  extractedText: string
  confidence: number
  tag: Tag
  extractedAt: string
  /** Extraction method, kept for auditability and confidence re-scoring. */
  method: 'table' | 'text_pattern' | 'derived'
}

export interface SourceStatusRecord {
  company: string
  slug: string
  source: SourceType
  id: string
  url: string
  status: SourceStatusValue
  httpStatus: number | null
  error: string | null
  checkedAt: string
}

export interface ReviewItem {
  slug: string
  company: string
  reason:
    | 'low_confidence'
    | 'unknown_document'
    | 'metric_conflict'
    | 'blocked_source'
    | 'unclassified_period'
  detail: string
  metric?: string
  period?: string
  values?: Array<{ value: number | null; sourceUrl: string; source: string }>
  documentTitle?: string
  sourceUrl?: string
  createdAt: string
}

/** The full company artifact written to data/<slug>.json. */
export interface CompanyData {
  company: string
  slug: string
  lastUpdated: string
  documents: {
    quarterlyResults: DocumentRecord[]
    annualReports: DocumentRecord[]
    transcripts: DocumentRecord[]
    stockExchangeFilings: DocumentRecord[]
    irdaiDisclosures: DocumentRecord[]
    otherDisclosures: DocumentRecord[]
  }
  /** Metric key → historical observations (never overwritten, only merged). */
  metrics: Record<string, MetricObservation[]>
  sourceStatus: SourceStatusRecord[]
  reviewQueue: ReviewItem[]
}

export interface RunReportSource {
  company: string
  source: string
  url: string
  status: SourceStatusValue
  count: number
  error: string | null
}

export interface RunReport {
  runStartedAt: string
  runFinishedAt: string
  ok: boolean
  companiesProcessed: number
  documentsDiscovered: number
  documentsDownloaded: number
  metricsExtracted: number
  sources: RunReportSource[]
  blockedSources: RunReportSource[]
  failedSources: RunReportSource[]
  /** Total review items this run (full list lives in extraction-review-queue.json). */
  reviewRequiredCount: number
  /** A bounded sample of review items; the full set is in the review queue file. */
  reviewRequired: ReviewItem[]
}

/** Uniform wrapper every source/category returns so one failure never aborts. */
export type ScrapeOutcome =
  | { ok: true; count: number; url: string; tag: Tag }
  | { ok: false; url: string; status: number | null; error: string; tag: Tag }
