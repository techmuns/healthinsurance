// ---------------------------------------------------------------------------
//  Per-company analyst coverage + market quote — real, source-backed only.
//
//  Lets Street View / Valuation react to the selected company instead of being
//  hardwired to the focal name. Two real sources feed this:
//   • valuation-snapshot.json — daily price / market cap / multiples for the
//     listed insurers (Niva, Star, ICICI Lombard, Go Digit).
//   • analyst-coverage-snapshot.json — dated broker reports (rating + target +
//     price-at-reco + source URL) for the covered names (Niva, Star, ICICI).
//  Niva Bupa keeps its richer daily Moneycontrol consensus (valuationData).
//
//  A company with no coverage / no market quote returns null so the UI renders
//  an honest "not tracked yet" state — never a fabricated number.
// ---------------------------------------------------------------------------

import valuationSnapshot from '@/data/snapshots/valuation-snapshot.json'
import analystCoverageSnapshot from '@/data/snapshots/analyst-coverage-snapshot.json'
import {
  analystConsensus as nivaConsensus,
  analystReports as nivaReports,
  FOCAL_VALUATION_ID,
  type AnalystConsensus,
  type AnalystReport,
  type Rating,
} from '@/data/valuationData'

// ── Market quote (listed insurers) ──────────────────────────────────────────
interface ValuationRow {
  company_id: string
  date?: string | null
  market_cap?: number | null
  share_price?: number | null
  price_to_book?: number | null
  price_to_earnings?: number | null
  price_to_gwp?: number | null
}
const VAL_ROWS = (valuationSnapshot.data as ValuationRow[]) ?? []
const VAL_META = (valuationSnapshot as { _meta: { last_updated?: string | null } })._meta

export interface MarketQuote {
  price: number | null
  marketCap: number | null
  pGwp: number | null
  pe: number | null
  pb: number | null
  asOf: string | null
}

/** Daily market quote for a listed insurer, or null when not listed/covered. */
export function getMarketQuote(companyId: string): MarketQuote | null {
  const r = VAL_ROWS.find((x) => x.company_id === companyId)
  if (!r) return null
  return {
    price: r.share_price ?? null,
    marketCap: r.market_cap ?? null,
    pGwp: r.price_to_gwp ?? null,
    pe: r.price_to_earnings ?? null,
    pb: r.price_to_book ?? null,
    asOf: r.date ?? VAL_META?.last_updated ?? null,
  }
}

// ── Analyst coverage (broker reports → consensus) ───────────────────────────
interface CoverageRow {
  company_id: string
  broker: string
  report_date: string
  rating: string | null
  target_price: number | null
  price_at_reco: number | null
  source_url: string | null
}
const COVERAGE_ROWS = (analystCoverageSnapshot as { data?: CoverageRow[] }).data ?? []

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtReportDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

/** Normalise an aggregator rating word to the dashboard's rating vocabulary. */
function normRating(raw: string | null): Rating | null {
  if (!raw) return null
  const s = raw.toLowerCase()
  if (/sell|reduce|underperform|underweight/.test(s)) return 'Sell'
  if (/buy|accumulate|outperform|overweight/.test(s)) return 'Buy'
  if (/add/.test(s)) return 'Add'
  if (/hold|neutral|equal/.test(s)) return 'Hold'
  return 'Hold'
}

function ratingBucket(r: Rating | null): 'buy' | 'hold' | 'sell' | null {
  if (r == null) return null
  if (r === 'Buy' || r === 'Add') return 'buy'
  if (r === 'Sell' || r === 'Reduce') return 'sell'
  return 'hold'
}

export interface CoverageBundle {
  consensus: AnalystConsensus
  reports: AnalystReport[]
}

/** Every dated broker call we hold for a company → AnalystReport[], newest
 *  first. Same source the audit's Broker-coverage table reads, so Street View
 *  can show all of them (not just one row per broker). */
function mapCalls(rows: CoverageRow[]): AnalystReport[] {
  return [...rows]
    .sort((a, b) => (a.report_date < b.report_date ? 1 : -1))
    .map((r) => ({
      brokerage: r.broker,
      rating: normRating(r.rating),
      targetPrice: r.target_price ?? null,
      reportDate: fmtReportDate(r.report_date),
      thesis: '',
      sourceId: '',
      sourceUrl: r.source_url ?? undefined,
      confidence: 'secondary',
    }))
}

/** Build consensus + per-broker latest reports from the dated coverage rows. */
function buildFromCoverage(rows: CoverageRow[], quote: MarketQuote | null): CoverageBundle | null {
  if (!rows.length) return null
  // Newest first, then keep each broker's most recent note.
  const newestFirst = [...rows].sort((a, b) => (a.report_date < b.report_date ? 1 : -1))
  const latestByBroker = new Map<string, CoverageRow>()
  for (const r of newestFirst) if (!latestByBroker.has(r.broker)) latestByBroker.set(r.broker, r)
  const latest = [...latestByBroker.values()]

  const targets = latest.map((r) => r.target_price).filter((t): t is number => typeof t === 'number')
  const avg = targets.length ? Math.round(targets.reduce((a, b) => a + b, 0) / targets.length) : null
  let buy = 0
  let hold = 0
  let sell = 0
  for (const r of latest) {
    const b = ratingBucket(normRating(r.rating))
    if (b === 'buy') buy++
    else if (b === 'sell') sell++
    else if (b === 'hold') hold++
  }
  const ratingLabel: Rating = buy >= hold && buy >= sell ? 'Buy' : sell > buy && sell > hold ? 'Sell' : 'Hold'

  const consensus: AnalystConsensus = {
    currentPrice: quote?.price ?? null,
    consensusTargetPrice: avg,
    highestTargetPrice: targets.length ? Math.max(...targets) : null,
    lowestTargetPrice: targets.length ? Math.min(...targets) : null,
    analystCount: latest.length,
    buyCount: buy,
    holdCount: hold,
    sellCount: sell,
    ratingLabel,
    lastUpdated: fmtReportDate(newestFirst[0].report_date),
  }

  return { consensus, reports: mapCalls(rows) }
}

/**
 * Analyst coverage for a company: the richer daily Moneycontrol consensus for
 * the focal name, the dated aggregator reports for the other covered insurers,
 * or null when no citable coverage exists (→ honest "not tracked" state).
 */
export function getAnalystCoverage(companyId: string): CoverageBundle | null {
  if (companyId === FOCAL_VALUATION_ID) {
    // Keep Niva's curated daily Moneycontrol consensus for the headline numbers,
    // but list ALL the dated broker calls we hold (the same coverage the audit
    // shows) — falling back to the curated reports only if none are on record.
    const calls = COVERAGE_ROWS.filter((r) => r.company_id === companyId)
    return { consensus: nivaConsensus, reports: calls.length ? mapCalls(calls) : nivaReports }
  }
  return buildFromCoverage(
    COVERAGE_ROWS.filter((r) => r.company_id === companyId),
    getMarketQuote(companyId),
  )
}

/** True when a company has any source-backed analyst coverage. */
export function hasAnalystCoverage(companyId: string): boolean {
  return companyId === FOCAL_VALUATION_ID || COVERAGE_ROWS.some((r) => r.company_id === companyId)
}
