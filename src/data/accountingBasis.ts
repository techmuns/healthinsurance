// ---------------------------------------------------------------------------
// Accounting-basis profitability — IGAAP / Statutory vs IFRS
//
// The standalone-health (SAHI) profitability stack on BOTH accounting bases,
// because PAT, PAT margin, growth and the cost ratios can tell very different
// stories depending on the basis:
//   • Niva Bupa FY26: IGAAP PAT ₹131 Cr (−39% YoY) vs IFRS PAT ₹366 Cr (+80% YoY)
//
// Source: the insurers' own published accounts — statutory accounts / IRDAI
// statutory disclosures for IGAAP / Statutory, and the IFRS accounts (annual
// report / investor presentation) for IFRS. Surfaces tag each figure with the
// appropriate filing source (see `BASIS_SOURCE_LABEL`) — never a third-party or
// research label.
//
// This is intentionally a separate, hand-curated module — NOT one of the
// auto-ingested `src/data/snapshots/*` files — so the scheduled ingest pipeline
// never overwrites it. Missing cells are `null` (rendered as an honest "NA"),
// never coerced to 0 and never derived across bases.
//
// Premium ≠ profit: PAT / PAT margin / combined ratio here are PROFIT measures.
// ---------------------------------------------------------------------------

import type { TimePeriod } from './types'

export type AccountingBasis = 'igaap' | 'ifrs'

/** Periods carried in the basis dataset (annual FY + standalone Q4). */
export type BasisPeriod = 'FY23' | 'FY24' | 'FY25' | 'FY26' | 'Q4FY25' | 'Q4FY26'

export const ANNUAL_PERIODS: BasisPeriod[] = ['FY23', 'FY24', 'FY25', 'FY26']
export const Q4_PERIODS: BasisPeriod[] = ['Q4FY25', 'Q4FY26']

export const BASIS_OPTIONS: { value: AccountingBasis; label: string; full: string }[] = [
  { value: 'igaap', label: 'IGAAP / Statutory', full: 'IGAAP / Statutory' },
  { value: 'ifrs', label: 'IFRS', full: 'IFRS' },
]

export const BASIS_LABEL: Record<AccountingBasis, string> = {
  igaap: 'IGAAP / Statutory',
  ifrs: 'IFRS',
}

export const BASIS_FULL: Record<AccountingBasis, string> = {
  igaap: 'IGAAP / Statutory',
  ifrs: 'IFRS',
}

/**
 * Source label per accounting basis — the kind of filing a number comes from.
 * IGAAP/Statutory figures are the companies' statutory accounts / IRDAI statutory
 * disclosures; IFRS figures are the companies' IFRS accounts (annual report /
 * investor presentation). No third-party / research label is ever used.
 */
export const BASIS_SOURCE_LABEL: Record<AccountingBasis, string> = {
  igaap: 'Company filing',
  ifrs: 'Annual report',
}

/** Status word for a basis value: present => Official, missing => Not available. */
export function basisStatus(value: number | null | undefined): 'Official' | 'Not available' {
  return value == null ? 'Not available' : 'Official'
}

/** The standing data note shown alongside the basis lens. */
export const BASIS_EXPLAINER =
  'Check basis before comparing profit.'

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

// ROE on a basis is intentionally NOT derived here: there is no IFRS equity to
// compute IFRS ROE cleanly, and mixing IFRS PAT with statutory net worth would
// blend bases. IFRS ROE is surfaced as NA; IGAAP/Statutory ROE comes from the
// existing reported figures. Net worth is retained on the dataset for reference.

export function isAnnual(period: BasisPeriod): boolean {
  return ANNUAL_PERIODS.includes(period)
}

/** Pretty label for a basis period, e.g. "FY26", "Q4 FY26". */
export function periodLabel(period: BasisPeriod): string {
  return period.startsWith('Q4') ? `Q4 ${period.slice(2)}` : period
}

// ── Premium (NEP) + statutory solvency — for underwriting profit & capital ────
// NEP is a premium measure (basis-neutral here); solvency is statutory/IRDAI and
// is shown on both bases but always labelled statutory.
const NEP: Record<string, Partial<Record<BasisPeriod, number>>> = {
  'niva-bupa': { FY23: 2663, FY24: 3811, FY25: 4894, FY26: 6068, Q4FY25: 1528, Q4FY26: 1972 },
  'star-health': { FY23: 11262, FY24: 12938, FY25: 14822, FY26: 16597, Q4FY25: 4250, Q4FY26: 4327 },
  'care-health': { FY23: 3932, FY24: 5329, FY25: 6347, FY26: 7256, Q4FY25: 1786, Q4FY26: 2133 },
}
const SOLVENCY: Record<string, Partial<Record<BasisPeriod, number>>> = {
  'niva-bupa': { FY23: 1.67, FY24: 2.55, FY25: 3.03, FY26: 2.49 },
  'star-health': { FY23: 2.21, FY24: 2.14, FY25: 2.21, FY26: 2.05, Q4FY25: 2.21, Q4FY26: 2.05 },
  'care-health': { FY23: 1.82, FY24: 1.74, FY25: 1.68, FY26: 1.68, Q4FY25: 1.68, Q4FY26: 1.68 },
}

/** Statutory net worth (₹ Cr) for a period; Q4FYxx maps to the FYxx year-end. */
function netWorthFor(companyId: string, p: BasisPeriod): number | null {
  const c = PROFIT_BY_BASIS[companyId]
  if (!c) return null
  return c.netWorth[(p.startsWith('Q4') ? p.slice(2) : p) as BasisPeriod] ?? null
}

/** Annual snapshot fallback (non-SAHI companies) — IGAAP/statutory only. */
export interface FallbackInput {
  roe: number | null
  solvency: number | null
  annual: { fy: string; pat: number | null; nep: number | null; gwp: number | null; combinedRatio: number | null; expenseRatio: number | null }[]
}

/**
 * The single resolved profitability state for the whole page. Every scalar is
 * `null` when not available in the selected basis/period (the UI then OMITS that
 * component rather than rendering a placeholder). Series carry one entry per
 * in-range period (nulls allowed; charts skip them).
 */
export interface ProfitView {
  basis: AccountingBasis
  period: TimePeriod
  /** Focal period label for point metrics, e.g. "FY25" / "Q4 FY26". */
  pointLabel: string | null
  pat: number | null
  patMargin: number | null
  patGrowth: number | null
  combinedRatio: number | null
  claimsRatio: number | null
  expenseRatio: number | null
  underwritingProfit: number | null
  solvency: number | null
  netWorth: number | null
  roe: number | null
  combinedSeries: { label: string; cr: number | null }[]
  patSeries: { label: string; pat: number | null }[]
  uwSeries: { label: string; uw: number | null }[]
  sourceLabel: string
  tracked: boolean
  /** Whether the selected basis/period has any usable data at all. */
  hasAny: boolean
  /** True when a statutory solvency is shown under the IFRS lens. */
  solvencyIsStatutory: boolean
}

function periodsFor(period: TimePeriod): BasisPeriod[] {
  if (period === 'Annual') return ANNUAL_PERIODS
  if (period === 'Quarterly') return Q4_PERIODS
  return [] // Monthly — no accounting-basis monthly data exists
}
const periodFy = (p: BasisPeriod): string => (p.startsWith('Q4') ? p.slice(2) : p)
const uwProfit = (nep: number | null, cr: number | null): number | null =>
  nep != null && cr != null ? Math.round(nep * (1 - cr / 100)) : null

/**
 * Resolve the canonical profitability view for (company · basis · period · FY
 * range). SAHI peers come from the dual-basis filing dataset; other insurers
 * fall back to the statutory annual snapshot (IGAAP only, IFRS → none). This is
 * the ONE source every section on the page reads from, so numbers can't diverge.
 */
export function resolveProfitView(
  companyId: string,
  basis: AccountingBasis,
  period: TimePeriod,
  inRange: (fy: string) => boolean,
  fallback: FallbackInput,
): ProfitView {
  const sourceLabel = BASIS_SOURCE_LABEL[basis]
  const tracked = hasBasisData(companyId)
  const isIfrs = basis === 'ifrs'
  const base: ProfitView = {
    basis, period, pointLabel: null, pat: null, patMargin: null, patGrowth: null,
    combinedRatio: null, claimsRatio: null, expenseRatio: null, underwritingProfit: null,
    solvency: null, netWorth: null, roe: null, combinedSeries: [], patSeries: [], uwSeries: [],
    sourceLabel, tracked, hasAny: false, solvencyIsStatutory: isIfrs,
  }

  if (tracked) {
    const periods = periodsFor(period).filter((p) => inRange(periodFy(p)))
    const withData = periods.filter((p) => {
      const b = getBasisProfit(companyId, basis, p)
      return b != null && (b.pat != null || b.combinedRatio != null || b.patMarginGwp != null)
    })
    if (withData.length === 0) return { ...base, solvency: SOLVENCY[companyId]?.[periods[periods.length - 1] as BasisPeriod] ?? null }
    const point = withData[withData.length - 1]
    const bp = getBasisProfit(companyId, basis, point)
    const nep = NEP[companyId]?.[point] ?? null
    const netWorth = netWorthFor(companyId, point)
    const combined = bp?.combinedRatio ?? null
    const pat = bp?.pat ?? null
    return {
      ...base,
      pointLabel: periodLabel(point),
      pat,
      patMargin: bp?.patMarginGwp ?? null,
      patGrowth: getBasisPatGrowth(companyId, basis, point),
      combinedRatio: combined,
      claimsRatio: bp?.claimsRatio ?? null,
      expenseRatio: bp?.expenseRatio ?? null,
      underwritingProfit: isIfrs ? null : uwProfit(nep, combined),
      solvency: SOLVENCY[companyId]?.[point] ?? null,
      netWorth,
      roe: isIfrs ? null : pat != null && netWorth != null && netWorth !== 0 ? (pat / netWorth) * 100 : null,
      combinedSeries: periods.map((p) => ({ label: periodLabel(p), cr: getBasisProfit(companyId, basis, p)?.combinedRatio ?? null })),
      patSeries: periods.map((p) => ({ label: periodLabel(p), pat: getBasisProfit(companyId, basis, p)?.pat ?? null })),
      uwSeries: periods.map((p) => ({ label: periodLabel(p), uw: isIfrs ? null : uwProfit(NEP[companyId]?.[p] ?? null, getBasisProfit(companyId, basis, p)?.combinedRatio ?? null) })),
      hasAny: true,
    }
  }

  // Non-SAHI fallback: IGAAP/Statutory from the annual snapshot; IFRS → none.
  if (isIfrs || period !== 'Annual') return { ...base, solvency: fallback.solvency }
  const annual = fallback.annual.filter((a) => inRange(a.fy))
  const withPat = annual.filter((a) => a.pat != null)
  const point = (withPat.length ? withPat : annual)[(withPat.length ? withPat : annual).length - 1]
  if (!point) return { ...base, solvency: fallback.solvency }
  const idx = annual.findIndex((a) => a.fy === point.fy)
  const prev = idx > 0 ? annual[idx - 1] : null
  const pat = point.pat
  return {
    ...base,
    pointLabel: point.fy,
    pat,
    patMargin: pat != null && point.gwp != null && point.gwp > 0 ? (pat / point.gwp) * 100 : null,
    patGrowth: pat != null && prev?.pat != null && prev.pat !== 0 ? ((pat - prev.pat) / Math.abs(prev.pat)) * 100 : null,
    combinedRatio: point.combinedRatio,
    claimsRatio: null,
    expenseRatio: point.expenseRatio,
    underwritingProfit: uwProfit(point.nep, point.combinedRatio),
    solvency: fallback.solvency,
    netWorth: null,
    roe: fallback.roe,
    combinedSeries: annual.map((a) => ({ label: a.fy, cr: a.combinedRatio })),
    patSeries: annual.map((a) => ({ label: a.fy, pat: a.pat })),
    uwSeries: annual.map((a) => ({ label: a.fy, uw: uwProfit(a.nep, a.combinedRatio) })),
    hasAny: point.pat != null || point.combinedRatio != null,
  }
}
