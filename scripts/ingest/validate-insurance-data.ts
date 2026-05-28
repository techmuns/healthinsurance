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
  if (typeof gwp === 'number' && typeof nwp === 'number' && nwp > gwp) {
    return { level: 'error', message: `NWP (${nwp}) > GWP (${gwp}).` }
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
  if (typeof row.combined_ratio === 'number' && (row.combined_ratio < 50 || row.combined_ratio > 200)) {
    out.push({ level: 'warning', message: `Combined ratio ${row.combined_ratio}% is outside the plausible 50–200% band.` })
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
