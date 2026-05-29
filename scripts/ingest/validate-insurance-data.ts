// ---------------------------------------------------------------------------
//  Validators — guard against bad data before it reaches a snapshot.
//
//  Each validator returns a list of validation issues. The caller decides
//  what to do (typically: drop the row, keep prior snapshot value, log).
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  metric_id?: string
  row_key?: string
  level: 'error' | 'warning'
  message: string
}

export function validateChannelMixSum(row: {
  banca_share?: number | null
  broker_share?: number | null
  agent_share?: number | null
  corporate_agent_share?: number | null
  direct_share?: number | null
  online_share?: number | null
  others_share?: number | null
}): ValidationIssue | null {
  const parts = [
    row.banca_share,
    row.broker_share,
    row.agent_share,
    row.corporate_agent_share,
    row.direct_share,
    row.online_share,
    row.others_share,
  ].filter((v): v is number => typeof v === 'number')
  if (parts.length === 0) return null
  const sum = parts.reduce((s, v) => s + v, 0)
  if (Math.abs(sum - 100) > 0.6) {
    return { level: 'error', message: `Channel mix sums to ${sum.toFixed(2)}%, expected ~100%.` }
  }
  return null
}

export function validatePremiumFlow(row: {
  gwp?: number | null
  nwp?: number | null
  nep?: number | null
}): ValidationIssue | null {
  const { gwp, nwp, nep } = row
  if (gwp == null && nwp == null && nep == null) return null
  // Premium figures must be positive.
  for (const [name, v] of [['GWP', gwp], ['NWP', nwp], ['NEP', nep]] as const) {
    if (typeof v === 'number' && v <= 0) {
      return { level: 'error', message: `${name} (${v}) must be positive.` }
    }
  }
  // GWP ≥ NWP ≥ NEP. (Catches e.g. Star gwp=23 alongside nep=14822.)
  if (typeof gwp === 'number' && typeof nwp === 'number' && nwp > gwp) {
    return { level: 'error', message: `NWP (${nwp}) > GWP (${gwp}).` }
  }
  if (typeof gwp === 'number' && typeof nep === 'number' && nep > gwp) {
    return { level: 'error', message: `NEP (${nep}) > GWP (${gwp}).` }
  }
  if (typeof nwp === 'number' && typeof nep === 'number' && nep > nwp + 0.001) {
    return { level: 'error', message: `NEP (${nep}) > NWP (${nwp}).` }
  }
  return null
}

export function validateRatios(row: {
  combined_ratio?: number | null
  claims_ratio?: number | null
  expense_ratio?: number | null
  solvency_ratio?: number | null
  market_share?: number | null
  roe?: number | null
}): ValidationIssue[] {
  const out: ValidationIssue[] = []
  if (typeof row.combined_ratio === 'number') {
    if (row.combined_ratio < 50 || row.combined_ratio > 250) {
      // e.g. 1.15 (stored as a fraction) or 11500 (a unit error).
      out.push({ level: 'error', message: `Combined ratio ${row.combined_ratio} is implausible (expected a percentage ~80–150%).` })
    } else if (row.combined_ratio > 150) {
      out.push({ level: 'warning', message: `Combined ratio ${row.combined_ratio}% is unusually high.` })
    }
  }
  if (typeof row.claims_ratio === 'number' && (row.claims_ratio < 0 || row.claims_ratio > 200)) {
    out.push({ level: 'warning', message: `Claims ratio ${row.claims_ratio}% is implausible.` })
  }
  if (typeof row.expense_ratio === 'number' && (row.expense_ratio < 0 || row.expense_ratio > 100)) {
    out.push({ level: 'warning', message: `Expense ratio ${row.expense_ratio}% is implausible.` })
  }
  if (typeof row.solvency_ratio === 'number' && row.solvency_ratio < 0) {
    out.push({ level: 'error', message: `Solvency ratio cannot be negative.` })
  }
  if (typeof row.market_share === 'number' && (row.market_share < 0 || row.market_share > 100)) {
    out.push({ level: 'error', message: `Market share ${row.market_share}% is outside [0, 100].` })
  }
  if (typeof row.roe === 'number' && (row.roe < -100 || row.roe > 100)) {
    out.push({ level: 'warning', message: `ROE ${row.roe}% is implausible.` })
  }
  return out
}

export function validateFiscalYear(fy: string): ValidationIssue | null {
  if (!/^FY\d{2,4}$/.test(fy)) {
    return { level: 'error', message: `Fiscal year "${fy}" does not match FYxx pattern. Run normaliseFy first.` }
  }
  // Recency guard: a parser that pulls "2005" (→ FY05) out of a recent filing is
  // mis-reading the period. These insurers' disclosures are all post-2015.
  const digits = Number(fy.slice(2))
  const year = digits < 100 ? 2000 + digits : digits
  if (year < 2015 || year > 2031) {
    return { level: 'error', message: `Fiscal year "${fy}" (→ ${year}) is outside the expected 2015–2031 window — likely a mis-parse.` }
  }
  return null
}

/**
 * Run all relevant validators on an annual snapshot row. Returns the issues
 * so the caller can choose to drop / keep-prior-value / warn.
 */
export function validateAnnualRow(row: Record<string, unknown>): ValidationIssue[] {
  const out: ValidationIssue[] = []
  const fyIssue = validateFiscalYear(String(row.fiscal_year))
  if (fyIssue) out.push(fyIssue)
  const premiumIssue = validatePremiumFlow(row as never)
  if (premiumIssue) out.push(premiumIssue)
  out.push(...validateRatios(row as never))
  return out
}

/** Run channel-mix validator on a distribution row. */
export function validateDistributionRow(row: Record<string, unknown>): ValidationIssue[] {
  const out: ValidationIssue[] = []
  const sumIssue = validateChannelMixSum(row as never)
  if (sumIssue) out.push(sumIssue)
  return out
}

/**
 * Source files that are not financial disclosures — if a parser pulled numbers
 * from one of these, the values are noise. Used by snapshot-merge as a gate.
 */
export const SUSPECT_SOURCE_FILE = /AgentCode|CitizenCharter|complain|Grievance|AgentList|brochure|policy-?wording/i

/** Dispatch the right validators for a snapshot target. */
export function validateByTarget(target: string, row: Record<string, unknown>): ValidationIssue[] {
  switch (target) {
    case 'insurer-annual-snapshot':
    case 'insurer-quarterly-financials':
      return validateAnnualRow(row)
    case 'distribution-channel-mix':
      return validateDistributionRow(row)
    default:
      return []
  }
}
