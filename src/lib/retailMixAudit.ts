// ---------------------------------------------------------------------------
//  Retail Mix — derived-metric audit & validation (single source of truth).
//
//  Retail Mix is NOT a hand-entered cell: it is DERIVED, with one formula, from
//  the GI Council Segment-wise Report's Health Portfolio table:
//
//      Retail Mix % = Retail Health Premium ÷ Total Health Premium
//      Total Health Premium = Retail + Group + Government + Overseas-Medical
//
//  Every surface that shows Retail Mix — the Product Mix chart, the peer grid,
//  the Analysis Builder, company copy, the promise tracker and the export model
//  — reads this same derivation (via `retailMixSeriesForCompany` /
//  `latestRetailMixPct` in dataLayer). This module makes that derivation VISIBLE
//  and VALIDATED for the Data Audit surface: per company it shows the source
//  values, the formula, the calculated value, the dashboard locations it maps
//  to, the source document, and a verified / mismatch / missing status.
//
//  Root-cause note: the peer grid used to read a separate hand-entered
//  `retail_mix` field from the annual-disclosure snapshot (Star Health 67%),
//  which disagreed with the chart's GI-Council derivation (~96%). The grid now
//  reads the SAME derivation, so the two agree by construction; this audit
//  guards that they never silently diverge again.
// ---------------------------------------------------------------------------

import gicHealthPortfolio from '@/data/snapshots/gic-health-portfolio.json'
import { getInsurers, retailMixSeriesForCompany, RETAIL_MIX_SOURCE } from '@/lib/dataLayer'

/** The single, canonical Retail Mix formula — shown verbatim in the audit. */
export const RETAIL_MIX_FORMULA =
  'Retail Mix % = Retail Health Premium ÷ Total Health Premium  ·  Total Health = Retail + Group + Govt + Overseas-Medical'

/** Where the derived Retail Mix value is read on the dashboard. */
export const RETAIL_MIX_CONSUMERS = [
  'Product Mix chart (Market & Distribution)',
  'Peer Positioning scorecard — Retail Mix column',
  'Analysis Builder — Retail Mix metric',
  'Promise Tracker — retail-led commitment',
  'Peer export model',
] as const

/** Tolerance: components must reconstruct the printed total to within this many
 *  ₹ Cr (rounding/units), and the chart vs grid retail % within this many pp. */
const PREM_SUM_TOL_CR = 1
const PCT_MATCH_TOL_PP = 1

interface RawGicRow {
  fiscal_year: string
  entity: string
  insurer_name?: string
  health_retail: number | null
  health_group: number | null
  health_govt: number | null
  overseas_medical: number | null
  health_total: number | null
  period_label?: string
  provenance?: {
    source_name?: string
    source_url?: string
    source_period?: string
    confidence?: string
  }
}

const RAW_ROWS = (gicHealthPortfolio.data as RawGicRow[]) ?? []
const fyNum = (fy: string) => Number(String(fy).replace(/^FY/, '')) || 0

/** Newest GI-Council row for an entity's latest reported FY (a later edition's
 *  restated comparative supersedes an earlier one — last write per FY wins,
 *  matching `retailMixSeriesForCompany`). null when the entity has no usable
 *  health split on record. */
function latestRawRow(entity: string): RawGicRow | null {
  const byFy = new Map<string, RawGicRow>()
  for (const r of RAW_ROWS) {
    if (r.entity !== entity) continue
    if (typeof r.health_retail !== 'number' || typeof r.health_total !== 'number' || r.health_total <= 0) continue
    byFy.set(r.fiscal_year, r) // last occurrence wins
  }
  let best: RawGicRow | null = null
  for (const r of byFy.values()) {
    if (!best || fyNum(r.fiscal_year) > fyNum(best.fiscal_year)) best = r
  }
  return best
}

export type RetailMixAuditStatus = 'verified' | 'mismatch' | 'missing'

export interface RetailMixAuditRow {
  companyId: string
  company: string
  peerGroup: string
  fy: string | null
  /** Source values (₹ Cr) straight from the GI Council health-portfolio table. */
  retailPrem: number | null
  groupPrem: number | null // group + govt + overseas-medical (all non-retail health)
  totalPrem: number | null
  /** Derived. */
  retailPct: number | null
  groupPct: number | null
  formula: string
  /** Mapped consumers, read live so a regression shows up as a mismatch. */
  chartPct: number | null // Product Mix chart (series latest point)
  gridPct: number | null // peer grid (insurer.retailMix; 0 sentinel → null)
  /** Validation. */
  componentsSumToTotal: boolean
  pctSumTo100: boolean
  chartGridMatch: boolean
  status: RetailMixAuditStatus
  issues: string[]
  /** Source citation. */
  source: { name: string; url: string; period: string | null; confidence: string }
}

/** Build the full per-company Retail Mix audit — the workings + validation that
 *  the Data Audit surface renders, and that the validation check asserts on. */
export function buildRetailMixAudit(): RetailMixAuditRow[] {
  const insurers = getInsurers()
  const gridById = new Map(insurers.map((i) => [i.id, i.retailMix]))

  return insurers
    .map((i): RetailMixAuditRow => {
      const raw = latestRawRow(i.id)
      const series = retailMixSeriesForCompany(i.id)
      const chartLatest = series.length ? series[series.length - 1] : null
      const chartPct = chartLatest?.retailPct ?? null
      const gridRaw = gridById.get(i.id) ?? 0
      const gridPct = gridRaw === 0 ? null : gridRaw

      const issues: string[] = []

      if (!raw) {
        // No GI-Council health split on record → honest N/A everywhere.
        const consistent = chartPct == null && gridPct == null
        if (!consistent) issues.push('No GI-Council source row, but a value is being shown — investigate.')
        return {
          companyId: i.id,
          company: i.shortName,
          peerGroup: i.peerGroup,
          fy: null,
          retailPrem: null,
          groupPrem: null,
          totalPrem: null,
          retailPct: null,
          groupPct: null,
          formula: RETAIL_MIX_FORMULA,
          chartPct,
          gridPct,
          componentsSumToTotal: true,
          pctSumTo100: true,
          chartGridMatch: consistent,
          status: consistent ? 'missing' : 'mismatch',
          issues,
          source: { name: RETAIL_MIX_SOURCE.provenance.source_name, url: RETAIL_MIX_SOURCE.provenance.source_url, period: null, confidence: RETAIL_MIX_SOURCE.confidence },
        }
      }

      const retailPrem = raw.health_retail as number
      const totalPrem = raw.health_total as number
      const groupPrem = Math.max(0, totalPrem - retailPrem) // group + govt + overseas-medical
      const components = (raw.health_retail ?? 0) + (raw.health_group ?? 0) + (raw.health_govt ?? 0) + (raw.overseas_medical ?? 0)
      const retailPct = Math.round((retailPrem / totalPrem) * 100)
      const groupPct = Math.max(0, 100 - retailPct)

      const componentsSumToTotal = Math.abs(components - totalPrem) <= PREM_SUM_TOL_CR
      const pctSumTo100 = Math.abs(retailPct + groupPct - 100) <= PCT_MATCH_TOL_PP
      // The chart reads `series` and the grid reads `insurer.retailMix`; both
      // must equal the freshly-derived retailPct, and each other.
      const chartGridMatch =
        chartPct != null &&
        gridPct != null &&
        Math.abs(chartPct - retailPct) <= PCT_MATCH_TOL_PP &&
        Math.abs(gridPct - retailPct) <= PCT_MATCH_TOL_PP &&
        Math.abs(chartPct - gridPct) <= PCT_MATCH_TOL_PP

      if (!componentsSumToTotal)
        issues.push(`Source components (${components.toFixed(1)}) ≠ printed total (${totalPrem.toFixed(1)}) ₹Cr.`)
      if (!pctSumTo100) issues.push(`Retail % + Group % = ${retailPct + groupPct}, expected 100.`)
      if (chartPct == null) issues.push('Product Mix chart shows no value for this company.')
      else if (gridPct == null) issues.push('Peer grid shows no value while the chart does.')
      else if (!chartGridMatch) issues.push(`Chart ${chartPct}% vs peer grid ${gridPct}% differ by > ${PCT_MATCH_TOL_PP}pp.`)

      const status: RetailMixAuditStatus = componentsSumToTotal && pctSumTo100 && chartGridMatch ? 'verified' : 'mismatch'

      return {
        companyId: i.id,
        company: i.shortName,
        peerGroup: i.peerGroup,
        fy: raw.fiscal_year,
        retailPrem,
        groupPrem,
        totalPrem,
        retailPct,
        groupPct,
        formula: RETAIL_MIX_FORMULA,
        chartPct,
        gridPct,
        componentsSumToTotal,
        pctSumTo100,
        chartGridMatch,
        status,
        issues,
        source: {
          name: raw.provenance?.source_name ?? RETAIL_MIX_SOURCE.provenance.source_name,
          url: raw.provenance?.source_url ?? RETAIL_MIX_SOURCE.provenance.source_url,
          period: raw.provenance?.source_period ?? raw.fiscal_year,
          confidence: raw.provenance?.confidence ?? RETAIL_MIX_SOURCE.confidence,
        },
      }
    })
    .sort((a, b) => (b.retailPct ?? -1) - (a.retailPct ?? -1))
}

/** Hard validation for the pipeline / tests: returns one message per real
 *  problem (a chart↔grid divergence > 1pp, a non-100% split, or components that
 *  don't reconstruct the printed total). Empty array = the whole dashboard is
 *  internally consistent on Retail Mix. */
export function retailMixValidationErrors(): string[] {
  const errs: string[] = []
  for (const r of buildRetailMixAudit()) {
    if (r.status === 'mismatch') errs.push(`${r.company} (${r.fy ?? 'no FY'}): ${r.issues.join(' ')}`)
  }
  return errs
}

/** Roll-up counts for the audit header chips. */
export function retailMixAuditSummary(): { verified: number; mismatch: number; missing: number; total: number } {
  const rows = buildRetailMixAudit()
  return {
    verified: rows.filter((r) => r.status === 'verified').length,
    mismatch: rows.filter((r) => r.status === 'mismatch').length,
    missing: rows.filter((r) => r.status === 'missing').length,
    total: rows.length,
  }
}
