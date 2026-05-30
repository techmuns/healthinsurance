// ---------------------------------------------------------------------------
//  IRDAI Public-Disclosure (NL-form) extractor.
//
//  The insurer "Website Public Disclosure" PDFs follow IRDAI's mandated NL-form
//  layout. The analytical-ratios table prints FOUR columns per row with no
//  separating spaces once pdf-parse flattens them, e.g.:
//
//     11Combined Ratio** 111.72%114.13%101.30%103.47%
//                         └ current quarter (standalone)
//                                └ current YTD
//                                       └ prior-year quarter
//                                              └ prior-year YTD
//
//  We take the FIRST percentage after each ratio label = the standalone quarter.
//  Solvency prints as "Solvency Margin Ratio (No. of times) 2.85".
//
//  Validated against real Niva Bupa Sep-2025 (Q2 FY26) disclosure:
//    combined 111.72 · claims 71.2 · commission 19.3 · solvency 2.85.
//
//  Honesty: any metric not present in this form (e.g. a single expense-ratio
//  line, or net PAT — which lives in a separate schedule) stays null. Never a
//  guess. Values flow through the shared quarterly sanitiser afterwards.
// ---------------------------------------------------------------------------

import { sanitiseQuarterly } from './quarterly-extract'

/** First percentage that follows `label` — the standalone-quarter column. */
function firstPct(text: string, label: RegExp): number | null {
  const m = text.match(label)
  return m && m[1] != null ? parseFloat(m[1]) : null
}

/**
 * Returns true if the text looks like an IRDAI NL-form public disclosure
 * (rather than a compliance certificate / RTA / officer-detail filing, which
 * carry no financials and should be skipped).
 */
export function isPublicDisclosureForm(text: string): boolean {
  const head = text.slice(0, 8000)
  // Must carry the analytical ratios block AND premium schedules.
  return /Combined Ratio/i.test(text) && /(Net Earned Premium|Gross Direct Premium|NL-\d)/i.test(head)
}

export interface DisclosureValues {
  combined_ratio: number | null
  claims_ratio: number | null
  commission_ratio: number | null
  expense_ratio: number | null
  solvency_ratio: number | null
}

/**
 * Extract standalone-quarter ratios from an IRDAI NL-form public disclosure.
 * Returns null if the document isn't a public-disclosure form.
 */
export function extractDisclosure(text: string): Record<string, number | null> | null {
  if (!isPublicDisclosureForm(text)) return null

  const raw: DisclosureValues = {
    // First % after the label = current standalone quarter.
    combined_ratio: firstPct(text, /Combined Ratio\*{0,2}\s*([\d.]+)\s*%/i),
    // "Net Incurred Claims to Net Earned Premium" analytical line.
    claims_ratio:
      firstPct(text, /Net Incurred Claims[^%]{0,50}?([\d.]+)\s*%/i) ??
      firstPct(text, /Incurred Claims? Ratio\*{0,2}\s*([\d.]+)\s*%/i),
    // "Net Commission to Net Written Premium" analytical line.
    commission_ratio:
      firstPct(text, /Net Commission[^%]{0,50}?([\d.]+)\s*%/i) ??
      firstPct(text, /Commission Ratio\*{0,2}\s*([\d.]+)\s*%/i),
    // Some forms print a single expense-of-management ratio; many split it.
    expense_ratio: firstPct(text, /Expenses of Management(?:\s*to\s*Gross[^%]{0,40})?\*{0,2}\s*([\d.]+)\s*%/i),
    // "Solvency Margin Ratio (No. of times) 2.85" — the short label form.
    solvency_ratio: firstPct(text, /Solvency Margin Ratio \(No\.?\s*of\s*times\)\s*([\d.]+)/i),
  }
  // Run through the shared plausibility sanitiser (decimal→%, band checks,
  // component cross-check vs combined ratio).
  return sanitiseQuarterly(raw as unknown as Record<string, number | null>)
}
