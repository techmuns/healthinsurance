// ---------------------------------------------------------------------------
// Accounting-basis profitability (IGAAP / statutory vs IFRS)
//
// PE-research input: the standalone-health (SAHI) profitability stack tracked by
// the PE research team on BOTH accounting bases, because PAT, PAT margin, growth
// and the cost ratios can tell very different stories depending on the basis.
//   • Niva Bupa FY26: IGAAP PAT ₹131 Cr (−39% YoY) vs IFRS PAT ₹366 Cr (+80% YoY)
//
// This is intentionally a separate, hand-curated module — NOT one of the
// auto-ingested `src/data/snapshots/*` files — so the scheduled ingest pipeline
// never overwrites research-desk input. Every figure here is sourced from the
// companies' own filings, compiled by the PE research team; surfaces that show
// it must tag it as "PE research" (see `BASIS_SOURCE`). Missing cells are `null`
// (rendered as an honest "NA"), never coerced to 0 or guessed.
//
// Premium ≠ profit: PAT / PAT margin / combined ratio here are PROFIT measures.
// ---------------------------------------------------------------------------

export type AccountingBasis = 'reported' | 'igaap' | 'ifrs'

/** Periods carried in the basis dataset (annual FY + standalone Q4). */
export type BasisPeriod = 'FY23' | 'FY24' | 'FY25' | 'FY26' | 'Q4FY25' | 'Q4FY26'

export const ANNUAL_PERIODS: BasisPeriod[] = ['FY23', 'FY24', 'FY25', 'FY26']
export const Q4_PERIODS: BasisPeriod[] = ['Q4FY25', 'Q4FY26']

export const BASIS_OPTIONS: { value: AccountingBasis; label: string; full: string }[] = [
  { value: 'reported', label: 'Reported', full: 'Reported / Default' },
  { value: 'igaap', label: 'IGAAP', full: 'IGAAP / Statutory' },
  { value: 'ifrs', label: 'IFRS', full: 'IFRS' },
]

export const BASIS_LABEL: Record<AccountingBasis, string> = {
  reported: 'Reported',
  igaap: 'IGAAP',
  ifrs: 'IFRS',
}

export const BASIS_FULL: Record<AccountingBasis, string> = {
  reported: 'Reported / Default',
  igaap: 'IGAAP / Statutory',
  ifrs: 'IFRS',
}

/** Where the basis numbers come from — surfaced on source tags. */
export const BASIS_SOURCE = {
  label: 'PE research',
  detail: 'PE research desk · compiled from company filings (statutory & IFRS accounts)',
} as const

/** The standing investor caution shown alongside the basis lens. */
export const BASIS_EXPLAINER =
  'PAT differs across IGAAP and IFRS because the accounting recognition basis differs. Always check the selected basis before comparing profitability, ROE, or valuation.'

/** A single period's profit stack on one accounting basis. `null` => NA. */
export interface BasisProfit {
  /** Profit after tax, ₹ Cr. */
  pat: number | null
  /** PAT as a % of GWP (the PE team's PAT-margin basis). */
  patMarginGwp: number | null
  /** Net incurred claims ratio, %. */
  claimsRatio: number | null
  /** Expense ratio, %. */
  expenseRatio: number | null
  /** Combined ratio, %. */
  combinedRatio: number | null
  /** Expense of management (reported), %. */
  eom: number | null
}

const NA: BasisProfit = { pat: null, patMarginGwp: null, claimsRatio: null, expenseRatio: null, combinedRatio: null, eom: null }
const na = (): BasisProfit => ({ ...NA })

type BasisTable = Record<BasisPeriod, BasisProfit>

// ── Niva Bupa ───────────────────────────────────────────────────────────────
const NIVA_IGAAP: BasisTable = {
  FY23: { pat: 13, patMarginGwp: 0.3, claimsRatio: 54.0, expenseRatio: 43.0, combinedRatio: 97.0, eom: 41.0 },
  FY24: { pat: 82, patMarginGwp: 1.5, claimsRatio: 59.0, expenseRatio: 39.8, combinedRatio: 98.8, eom: 39.3 },
  FY25: { pat: 214, patMarginGwp: 3.2, claimsRatio: 61.2, expenseRatio: 40.0, combinedRatio: 101.2, eom: 39.2 },
  FY26: { pat: 131, patMarginGwp: 1.5, claimsRatio: 68.1, expenseRatio: 35.3, combinedRatio: 103.4, eom: 33.7 },
  Q4FY25: { pat: 206, patMarginGwp: 9.5, claimsRatio: 56.4, expenseRatio: 36.4, combinedRatio: 92.8, eom: 36.3 },
  Q4FY26: { pat: 345, patMarginGwp: 11.7, claimsRatio: 56.8, expenseRatio: 29.4, combinedRatio: 86.1, eom: 28.5 },
}
const NIVA_IFRS: BasisTable = {
  FY23: { pat: 9, patMarginGwp: null, claimsRatio: null, expenseRatio: null, combinedRatio: null, eom: null },
  FY24: { pat: 106, patMarginGwp: 1.9, claimsRatio: 62.9, expenseRatio: 40.1, combinedRatio: 103.0, eom: null },
  FY25: { pat: 203, patMarginGwp: 3.0, claimsRatio: 63.8, expenseRatio: 39.2, combinedRatio: 103.0, eom: null },
  FY26: { pat: 366, patMarginGwp: 4.3, claimsRatio: 64.9, expenseRatio: 36.5, combinedRatio: 101.4, eom: null },
  Q4FY25: { pat: 83, patMarginGwp: 3.8, claimsRatio: null, expenseRatio: null, combinedRatio: 102.0, eom: null },
  Q4FY26: { pat: 158, patMarginGwp: 5.3, claimsRatio: null, expenseRatio: null, combinedRatio: 97.4, eom: null },
}

// ── Star Health ───────────────────────────────────────────────────────────--
const STAR_IGAAP: BasisTable = {
  FY23: { pat: 619, patMarginGwp: 4.8, claimsRatio: 65.0, expenseRatio: 30.3, combinedRatio: 95.3, eom: 30.2 },
  FY24: { pat: 845, patMarginGwp: 5.5, claimsRatio: 65.0, expenseRatio: 30.2, combinedRatio: 96.7, eom: 30.7 },
  FY25: { pat: 646, patMarginGwp: 3.9, claimsRatio: 70.3, expenseRatio: 30.8, combinedRatio: 101.1, eom: 31.1 },
  FY26: { pat: 557, patMarginGwp: 3.0, claimsRatio: 68.5, expenseRatio: 31.9, combinedRatio: 100.4, eom: 30.2 },
  Q4FY25: { pat: 1, patMarginGwp: 0.0, claimsRatio: 68.5, expenseRatio: 29.9, combinedRatio: 99.2, eom: 28.1 },
  Q4FY26: { pat: 111, patMarginGwp: 1.9, claimsRatio: 64.8, expenseRatio: 29.9, combinedRatio: 94.7, eom: 28.1 },
}
const STAR_IFRS: BasisTable = {
  FY23: na(),
  FY24: { pat: 1103, patMarginGwp: 7.2, claimsRatio: 66.5, expenseRatio: 30.7, combinedRatio: 97.2, eom: null },
  FY25: { pat: 787, patMarginGwp: 4.7, claimsRatio: 70.7, expenseRatio: 30.4, combinedRatio: 101.1, eom: null },
  FY26: { pat: 911, patMarginGwp: 4.9, claimsRatio: 68.7, expenseRatio: 30.1, combinedRatio: 98.8, eom: null },
  Q4FY25: { pat: 271, patMarginGwp: 5.3, claimsRatio: 69.2, expenseRatio: 29.2, combinedRatio: 98.4, eom: null },
  Q4FY26: { pat: -55, patMarginGwp: -0.9, claimsRatio: 65.2, expenseRatio: 30.5, combinedRatio: 95.7, eom: null },
}

// ── Care Health ───────────────────────────────────────────────────────────--
const CARE_IGAAP: BasisTable = {
  FY23: { pat: 246, patMarginGwp: 4.8, claimsRatio: 54.0, expenseRatio: 38.0, combinedRatio: 92.0, eom: 40.0 },
  FY24: { pat: 305, patMarginGwp: 4.4, claimsRatio: 58.0, expenseRatio: 37.0, combinedRatio: 95.0, eom: 37.0 },
  FY25: { pat: 155, patMarginGwp: 1.9, claimsRatio: 64.5, expenseRatio: 38.3, combinedRatio: 102.8, eom: 36.0 },
  FY26: { pat: 12, patMarginGwp: 0.1, claimsRatio: 69.6, expenseRatio: 37.1, combinedRatio: 106.7, eom: 36.0 },
  Q4FY25: { pat: 144, patMarginGwp: 6.2, claimsRatio: 59.0, expenseRatio: 37.7, combinedRatio: 96.7, eom: 35.0 },
  Q4FY26: { pat: 79, patMarginGwp: 2.5, claimsRatio: 59.4, expenseRatio: 40.5, combinedRatio: 99.9, eom: null },
}
const CARE_IFRS: BasisTable = {
  FY23: na(),
  FY24: na(),
  FY25: { pat: 290, patMarginGwp: 3.5, claimsRatio: 66.0, expenseRatio: 36.6, combinedRatio: 102.6, eom: null },
  FY26: { pat: 387, patMarginGwp: 3.9, claimsRatio: 65.0, expenseRatio: 36.5, combinedRatio: 101.5, eom: null },
  Q4FY25: na(),
  Q4FY26: na(),
}

interface CompanyBasis {
  igaap: BasisTable
  ifrs: BasisTable
  /** Reported net worth (₹ Cr) per FY — basis-neutral here; used to derive ROE. */
  netWorth: Partial<Record<BasisPeriod, number>>
}

const PROFIT_BY_BASIS: Record<string, CompanyBasis> = {
  'niva-bupa': { igaap: NIVA_IGAAP, ifrs: NIVA_IFRS, netWorth: { FY23: 831, FY24: 2050, FY25: 3061, FY26: 3219 } },
  'star-health': { igaap: STAR_IGAAP, ifrs: STAR_IFRS, netWorth: { FY23: 5434, FY24: 6055, FY25: 6378, FY26: 7589 } },
  'care-health': { igaap: CARE_IGAAP, ifrs: CARE_IFRS, netWorth: { FY23: 1749, FY24: 2170, FY25: 2331, FY26: 2666 } },
}

// ── Resolvers ─────────────────────────────────────────────────────────────--

/** Whether the company is tracked on dual accounting bases at all. */
export function hasBasisData(companyId: string): boolean {
  return companyId in PROFIT_BY_BASIS
}

/** The companies tracked on dual bases (for honest "tracked for…" copy). */
export const BASIS_TRACKED_COMPANIES = ['Niva Bupa', 'Star Health', 'Care Health']

/** Profit stack for a company on a non-reported basis + period. `null` => untracked. */
export function getBasisProfit(companyId: string, basis: 'igaap' | 'ifrs', period: BasisPeriod): BasisProfit | null {
  const c = PROFIT_BY_BASIS[companyId]
  if (!c) return null
  return c[basis][period] ?? null
}

/** Annual PAT series (FY23→FY26) on a basis; entries are null where unreported. */
export function getBasisPatSeries(companyId: string, basis: 'igaap' | 'ifrs'): { label: string; pat: number | null }[] {
  const c = PROFIT_BY_BASIS[companyId]
  if (!c) return []
  return ANNUAL_PERIODS.map((p) => ({ label: p, pat: c[basis][p].pat }))
}

/** Latest annual period that has a reported PAT on the basis (FY26→FY23), else null. */
export function latestAnnualWithPat(companyId: string, basis: 'igaap' | 'ifrs'): BasisPeriod | null {
  const c = PROFIT_BY_BASIS[companyId]
  if (!c) return null
  for (let i = ANNUAL_PERIODS.length - 1; i >= 0; i--) {
    if (c[basis][ANNUAL_PERIODS[i]].pat != null) return ANNUAL_PERIODS[i]
  }
  return null
}

/** Prior comparable period for YoY growth (FY→prior FY, Q4→prior Q4). */
function priorPeriod(period: BasisPeriod): BasisPeriod | null {
  const map: Partial<Record<BasisPeriod, BasisPeriod>> = {
    FY24: 'FY23',
    FY25: 'FY24',
    FY26: 'FY25',
    Q4FY26: 'Q4FY25',
  }
  return map[period] ?? null
}

/** YoY PAT growth (%) on the basis for the period; null when either end is missing. */
export function getBasisPatGrowth(companyId: string, basis: 'igaap' | 'ifrs', period: BasisPeriod): number | null {
  const prev = priorPeriod(period)
  if (!prev) return null
  const cur = getBasisProfit(companyId, basis, period)?.pat
  const old = getBasisProfit(companyId, basis, prev)?.pat
  if (cur == null || old == null || old === 0) return null
  return ((cur - old) / Math.abs(old)) * 100
}

/** Reported net worth (₹ Cr) for the FY (basis-neutral); null when unavailable. */
export function getBasisNetWorth(companyId: string, period: BasisPeriod): number | null {
  return PROFIT_BY_BASIS[companyId]?.netWorth[period] ?? null
}

/**
 * Derived ROE (%) on a basis = PAT(basis) / net worth × 100, annual periods only.
 * Net worth is reported (statutory) and not basis-split, so this is an *indicative*
 * ROE on basis-specific PAT — callers must label it as derived. Null when missing.
 */
export function getBasisRoe(companyId: string, basis: 'igaap' | 'ifrs', period: BasisPeriod): number | null {
  if (!ANNUAL_PERIODS.includes(period)) return null
  const pat = getBasisProfit(companyId, basis, period)?.pat
  const nw = getBasisNetWorth(companyId, period)
  if (pat == null || nw == null || nw === 0) return null
  return (pat / nw) * 100
}

export function isAnnual(period: BasisPeriod): boolean {
  return ANNUAL_PERIODS.includes(period)
}

/** Pretty label for a basis period, e.g. "FY26", "Q4 FY26". */
export function periodLabel(period: BasisPeriod): string {
  return period.startsWith('Q4') ? `Q4 ${period.slice(2)}` : period
}
