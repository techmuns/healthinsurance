// ---------------------------------------------------------------------------
//  Promise Tracker — REAL, source-backed: management's public guidance vs the
//  audited outcome. No fabricated "current" values.
//
//  • The ACTUAL ("Current") for each promise resolves LIVE from the audited
//    insurer-annual-snapshot (latest fiscal year present), so it is real and
//    advances on its own — never hand-typed.
//  • The PROMISE / TARGET / DATE are management's own stated guidance, each with
//    a citable source URL (earnings-call transcript / investor disclosures).
//  • STATUS is computed from the real actual vs the stated target.
//
//  Currently wired for Niva Bupa (the focal listed name, whose guidance is on
//  record). Other insurers return [] → the UI shows an honest "not connected".
// ---------------------------------------------------------------------------

import annualSnapshot from '@/data/snapshots/insurer-annual-snapshot.json'

export type PromiseCategory = 'Growth' | 'Profitability' | 'Distribution' | 'Capital' | 'Valuation' | 'Regulation'
export type PromiseStatus = 'Delivered' | 'On Track' | 'Delayed' | 'Missed' | 'Not Measurable'

export interface PromiseItem {
  company: string
  category: PromiseCategory
  promise: string
  date: string
  metric: string
  target: string
  current: string
  status: PromiseStatus
  source: string
  /** Real citable source for the guidance. */
  sourceUrl: string
  /** Fiscal year the audited actual is read from. */
  actualFy: string | null
}

type AnnualKey = 'growth_yoy' | 'roe' | 'combined_ratio' | 'retail_mix' | 'solvency_ratio'

interface PromiseDef {
  category: PromiseCategory
  promise: string
  date: string
  metric: string
  /** Snapshot field the audited actual is read from (null = qualitative). */
  metricKey: AnnualKey | null
  unit: '%' | 'x'
  target: string
  targetValue: number | null
  targetDir: 'higher' | 'lower' | null
  /** A multi-year (e.g. FY29) target — judged "On Track" while it progresses. */
  longTerm?: boolean
  source: string
  sourceUrl: string
}

const NIVA_CALL_Q4FY25 =
  'https://transactions.nivabupa.com/pages/doc/investor-relations/Earnings-Calls/2024-2025/Earnings-Call-Transcript-Q4-FY-2025.pdf'
const NIVA_IR = 'https://transactions.nivabupa.com/pages/investor-relations.aspx'

// Niva Bupa's on-record commitments. Actuals are NOT stored here — they resolve
// live from the audited snapshot below.
const NIVA_PROMISES: PromiseDef[] = [
  {
    category: 'Growth', promise: 'Grow GWP well ahead of the market', date: 'Q4 FY25 call', metric: 'GWP growth',
    metricKey: 'growth_yoy', unit: '%', target: '≥ 20% YoY', targetValue: 20, targetDir: 'higher',
    source: 'Q4 FY25 earnings call', sourceUrl: NIVA_CALL_Q4FY25,
  },
  {
    category: 'Profitability', promise: 'Lift ROE to mid–high teens by FY29', date: 'Q4 FY25 call', metric: 'ROE',
    metricKey: 'roe', unit: '%', target: '~17% by FY29', targetValue: 17, targetDir: 'higher', longTerm: true,
    source: 'Q4 FY25 earnings call', sourceUrl: NIVA_CALL_Q4FY25,
  },
  {
    category: 'Profitability', promise: 'Bring the combined ratio back down after the 1/N transition', date: 'Q4 FY25 call', metric: 'Combined ratio',
    metricKey: 'combined_ratio', unit: '%', target: 'toward ~96%', targetValue: 96, targetDir: 'lower',
    source: 'Q4 FY25 earnings call', sourceUrl: NIVA_CALL_Q4FY25,
  },
  {
    category: 'Growth', promise: 'Keep the book retail-led (retail the majority of GWP)', date: 'FY25 disclosures', metric: 'Retail mix',
    metricKey: 'retail_mix', unit: '%', target: '> 50% retail', targetValue: 50, targetDir: 'higher',
    source: 'Niva Bupa investor disclosures', sourceUrl: NIVA_IR,
  },
  {
    category: 'Capital', promise: 'Stay well-capitalised, comfortably above the regulatory floor', date: 'Q4 FY25 call', metric: 'Solvency',
    metricKey: 'solvency_ratio', unit: 'x', target: '> 1.5x floor', targetValue: 1.5, targetDir: 'higher',
    source: 'Q4 FY25 earnings call', sourceUrl: NIVA_CALL_Q4FY25,
  },
]

const PROMISES_BY_COMPANY: Record<string, PromiseDef[]> = {
  'niva-bupa': NIVA_PROMISES,
}

const fyNum = (fy: string) => Number(String(fy).replace(/^FY/, '')) || 0
function latestAnnualRow(companyId: string): Record<string, unknown> | null {
  const rows = (annualSnapshot.data as Array<Record<string, unknown>>)
    .filter((r) => r.company_id === companyId)
    .sort((a, b) => fyNum(String(b.fiscal_year)) - fyNum(String(a.fiscal_year)))
  return rows[0] ?? null
}
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const fmt = (v: number, unit: '%' | 'x') => (unit === 'x' ? `${v.toFixed(2)}x` : `${v.toFixed(1)}%`)

function statusFor(def: PromiseDef, actual: number | null): PromiseStatus {
  if (actual == null || def.targetValue == null || def.targetDir == null) return 'Not Measurable'
  if (def.longTerm) return 'On Track' // multi-year target — progressing, not a pass/fail yet
  if (def.targetDir === 'higher') {
    if (actual >= def.targetValue) return 'Delivered'
    return actual >= def.targetValue * 0.9 ? 'On Track' : 'Delayed'
  }
  // lower-is-better
  if (actual <= def.targetValue) return 'Delivered'
  return actual <= def.targetValue * 1.05 ? 'On Track' : 'Delayed'
}

/** Real, source-backed promise rows for a company (actuals from the audited snapshot). */
export function getPromises(companyId: string): PromiseItem[] {
  const defs = PROMISES_BY_COMPANY[companyId]
  if (!defs) return []
  const row = latestAnnualRow(companyId)
  const fy = row ? String(row.fiscal_year) : null
  return defs.map((def) => {
    const actual = def.metricKey && row ? num(row[def.metricKey]) : null
    return {
      company: companyId,
      category: def.category,
      promise: def.promise,
      date: def.date,
      metric: def.metric,
      target: def.target,
      current: actual != null ? fmt(actual, def.unit) : 'Data pending',
      status: statusFor(def, actual),
      source: def.source,
      sourceUrl: def.sourceUrl,
      actualFy: actual != null ? fy : null,
    }
  })
}
