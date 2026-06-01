// ---------------------------------------------------------------------------
//  Quarterly extraction — pattern map + sanitiser for company quarterly
//  disclosures. Patterns are deliberately ANCHORED: the metric label must sit
//  immediately before the number (optionally through a ":" or "(net)") so that
//  prose mentions like "claims ratios threaten ..." or "commission to Ms. X"
//  fall through to null instead of capturing a stray figure. This was a real
//  trap observed in the Niva Bupa FY25 annual report text.
//
//  Anything a pattern can't extract stays null — an honest "pending", never a
//  guess. The UI renders null as a clear not-available marker.
// ---------------------------------------------------------------------------

export const QUARTERLY_PATTERNS: Record<string, RegExp> = {
  // ₹ Cr money lines — label then amount; allow "(IFRS)"/"(Ind AS)" basis tags.
  gwp: /Gross\s+Written\s+Premium(?:\s*\([^)]*\))?\s*[:-]?\s*(?:₹|Rs\.?)?\s*([\d,]+(?:\.\d+)?)/i,
  nwp: /Net\s+Written\s+Premium(?:\s*\([^)]*\))?\s*[:-]?\s*(?:₹|Rs\.?)?\s*([\d,]+(?:\.\d+)?)/i,
  nep: /Net\s+Earned\s+Premium(?:\s*\([^)]*\))?\s*[:-]?\s*(?:₹|Rs\.?)?\s*([\d,]+(?:\.\d+)?)/i,
  pat: /(?:Profit\s+After\s+Tax|Net\s+Profit)(?:\s*\([^)]*\))?\s*[:-]?\s*(?:₹|Rs\.?)?\s*([\d,]+(?:\.\d+)?)/i,
  revenue: /Total\s+(?:Revenue|Income)(?:\s*\([^)]*\))?\s*[:-]?\s*(?:₹|Rs\.?)?\s*([\d,]+(?:\.\d+)?)/i,
  // Ratios — label immediately before the % so prose can't match.
  combined_ratio: /Combined\s+Ratio(?:\s*\([^)]*\))?\s*[:-]?\s*([\d.]+)\s*%/i,
  claims_ratio: /(?:Incurred\s+)?(?:Claims?|Loss)\s+Ratio(?:\s*\([^)]*\))?\s*[:-]?\s*([\d.]+)\s*%/i,
  expense_ratio: /Expense\s+Ratio(?:\s*of\s*Management)?(?:\s*\([^)]*\))?\s*[:-]?\s*([\d.]+)\s*%/i,
  commission_ratio: /(?:Net\s+)?Commission\s+Ratio(?:\s*\([^)]*\))?\s*[:-]?\s*([\d.]+)\s*%/i,
  solvency_ratio: /Solvency(?:\s+Ratio)?(?:\s*\([^)]*\))?\s*[:-]?\s*([\d.]+)\s*(?:x|times)?/i,
  roe: /Return\s+on\s+Equity(?:\s*\([^)]*\))?\s*[:-]?\s*([\d.]+)\s*%/i,
}

/**
 * Plausibility sanitiser for a quarterly row. Mirrors the annual sanitiser but
 * tuned for standalone-quarter magnitudes. Out-of-band values are nulled
 * (treated as a misread) rather than trusted.
 */
export function sanitiseQuarterly(raw: Record<string, number | null>): Record<string, number | null> {
  const out: Record<string, number | null> = { ...raw }

  // Premium / PAT / revenue: a single quarter for one insurer sits well under
  // ₹40k Cr; anything bigger is almost certainly an industry total misread.
  for (const k of ['gwp', 'nwp', 'nep', 'revenue'] as const) {
    const v = out[k]
    if (v != null && (v < 1 || v > 40000)) out[k] = null
  }
  if (typeof out.pat === 'number' && Math.abs(out.pat) > 10000) out.pat = null

  // NWP ≤ GWP, NEP ≤ NWP (with 10% slack for rounding / basis differences).
  if (typeof out.gwp === 'number' && typeof out.nwp === 'number' && out.nwp > out.gwp * 1.1) out.nwp = null
  if (typeof out.nwp === 'number' && typeof out.nep === 'number' && out.nep > out.nwp * 1.1) out.nep = null

  // Combined ratio: normalise decimal (1.15 → 115) and bound 50–200%.
  if (typeof out.combined_ratio === 'number') {
    if (out.combined_ratio > 0 && out.combined_ratio < 5) out.combined_ratio *= 100
    if (out.combined_ratio < 50 || out.combined_ratio > 200) out.combined_ratio = null
  }
  // Component ratios: decimal → %, plausible 0–200%.
  for (const k of ['claims_ratio', 'expense_ratio', 'commission_ratio'] as const) {
    const v = out[k]
    if (v == null) continue
    if (v > 0 && v < 5) out[k] = v * 100
    const after = out[k]
    if (typeof after === 'number' && (after < 0 || after > 200)) out[k] = null
  }
  // Cross-check: claims + commission + expense should be in the combined-ratio
  // neighbourhood. If the component sum diverges from the reported combined
  // ratio by more than 15pp, one of the components is a misread — drop the
  // components (keep the reported combined ratio, which is directly stated).
  const { claims_ratio: cl, commission_ratio: co, expense_ratio: ex, combined_ratio: cr } = out
  if (typeof cl === 'number' && typeof co === 'number' && typeof ex === 'number' && typeof cr === 'number') {
    if (Math.abs(cl + co + ex - cr) > 15) {
      out.claims_ratio = null
      out.commission_ratio = null
      out.expense_ratio = null
    }
  }

  // Solvency 0.5–10x; ROE -100..100%.
  if (typeof out.solvency_ratio === 'number' && (out.solvency_ratio < 0.5 || out.solvency_ratio > 10)) out.solvency_ratio = null
  if (typeof out.roe === 'number' && (out.roe < -100 || out.roe > 100)) out.roe = null
  return out
}
