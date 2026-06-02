// ---------------------------------------------------------------------------
//  Period parser.
//
//  Resolves { period, periodType, fiscalYear, quarter } from a document's
//  filename, title and leading text. Indian insurers report on an Apr–Mar
//  fiscal year, so a "quarter ended June 2025" is Q1 of FY2026.
//
//  Honesty rule: when the period genuinely can't be read, we return
//  periodType 'unknown' and a null fiscalYear rather than guessing FY26 just
//  because today's date makes it convenient.
// ---------------------------------------------------------------------------

import { canonicalFiscalYear, fiscalYearForMonth } from '../utils/dates.js'

export interface ParsedPeriod {
  period: string
  periodType: 'quarter' | 'annual' | 'ttm' | 'unknown'
  fiscalYear: string | null
  quarter: string | null
}

const MONTHS = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'

// Apr–Mar fiscal year → terminal quarter for a calendar month.
function quarterForMonth(month: string): 'Q1' | 'Q2' | 'Q3' | 'Q4' | null {
  const m = month.slice(0, 3).toLowerCase()
  if (['apr', 'may', 'jun'].includes(m)) return 'Q1'
  if (['jul', 'aug', 'sep'].includes(m)) return 'Q2'
  if (['oct', 'nov', 'dec'].includes(m)) return 'Q3'
  if (['jan', 'feb', 'mar'].includes(m)) return 'Q4'
  return null
}

/**
 * Parse a period from the most reliable signals first: the filename/title,
 * then the document's leading text.
 */
export function parsePeriod(filenameOrTitle: string, leadingText = ''): ParsedPeriod {
  const hay = `${filenameOrTitle} ${leadingText.slice(0, 1500)}`
  const fyFromName = canonicalFiscalYear(filenameOrTitle) ?? canonicalFiscalYear(hay)

  // 1. Explicit "Q1 FY26" / "Q3 FY2025" style.
  const explicitQ = hay.match(/\bQ([1-4])\s*[-]?\s*FY\s*(20\d{2}|\d{2})/i)
  if (explicitQ) {
    const fy = canonicalFiscalYear(`FY${explicitQ[2]}`)
    const quarter = `Q${explicitQ[1]}`
    return { period: `${quarter}${fy ?? ''}`.trim(), periodType: 'quarter', fiscalYear: fy, quarter }
  }

  // 2. "quarter ended <Month> <Year>" / "for the quarter ended ...".
  const qEnded = hay.match(new RegExp(`quarter\\s+ended[^A-Za-z0-9]{0,6}${MONTHS}[^0-9]{0,6}(20\\d{2})`, 'i'))
  if (qEnded) {
    const quarter = quarterForMonth(qEnded[1])
    const fy = fiscalYearForMonth(qEnded[1], +qEnded[2])
    if (quarter && fy) return { period: `${quarter}${fy}`, periodType: 'quarter', fiscalYear: fy, quarter }
  }

  // 3. Cumulative periods — half-year (H1→Q2) and nine-month (9M→Q3).
  const half = hay.match(new RegExp(`(?:half[\\s-]*year|h1)[^A-Za-z0-9]{0,12}(?:ended[^A-Za-z0-9]{0,6}${MONTHS}[^0-9]{0,6})?(20\\d{2})`, 'i'))
  if (/\bH1\b|half[\s-]*year/i.test(hay) && half) {
    const fy = half[1] ? fiscalYearForMonth(half[1], +half[2]) : canonicalFiscalYear(`FY${half[2]}`)
    if (fy) return { period: `H1${fy}`, periodType: 'quarter', fiscalYear: fy, quarter: 'Q2' }
  }
  if (/\b9\s*M\b|nine[\s-]*month/i.test(hay) && fyFromName) {
    return { period: `9M${fyFromName}`, periodType: 'quarter', fiscalYear: fyFromName, quarter: 'Q3' }
  }

  // 4. Annual report / integrated report → full year.
  if (/annual\s+report|integrated\s+report|\bAR\b/i.test(filenameOrTitle) && fyFromName) {
    return { period: fyFromName, periodType: 'annual', fiscalYear: fyFromName, quarter: null }
  }

  // 5. Trailing twelve months.
  if (/\b(TTM|LTM|trailing\s+twelve)\b/i.test(hay) && fyFromName) {
    return { period: `TTM${fyFromName}`, periodType: 'ttm', fiscalYear: fyFromName, quarter: null }
  }

  // 6. A bare month+year (public-disclosure forms: "Website Public Disclosure Dec 2025").
  const monthYear = hay.match(new RegExp(`${MONTHS}[\\s,'-]*?(20\\d{2})`, 'i'))
  if (monthYear) {
    const quarter = quarterForMonth(monthYear[1])
    const fy = fiscalYearForMonth(monthYear[1], +monthYear[2])
    if (quarter && fy) return { period: `${quarter}${fy}`, periodType: 'quarter', fiscalYear: fy, quarter }
  }

  // 6b. A bare quarter token alongside a fiscal year (IRDAI NL/L-form dumps name
  //     folders "Qtr 1 12-13"). Only trust it when a fiscal year is also legible.
  const bareQ = filenameOrTitle.match(/\bQ(?:tr|uarter)?\s*[-_]?\s*([1-4])\b/i)
  if (bareQ && fyFromName) {
    const quarter = `Q${bareQ[1]}`
    return { period: `${quarter}${fyFromName}`, periodType: 'quarter', fiscalYear: fyFromName, quarter }
  }

  // 7. Only a fiscal year is legible → treat as annual.
  if (fyFromName) return { period: fyFromName, periodType: 'annual', fiscalYear: fyFromName, quarter: null }

  // 8. Nothing legible — honest unknown.
  return { period: 'unknown', periodType: 'unknown', fiscalYear: null, quarter: null }
}
