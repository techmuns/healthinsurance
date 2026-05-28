// ---------------------------------------------------------------------------
//  Normalisers — convert parsed-but-raw records into snapshot row shapes.
//
//  These are pure functions. Fetchers parse upstream files; normalisers
//  map field names, units and labels so all rows are uniform before they
//  hit a snapshot.
// ---------------------------------------------------------------------------

import { normaliseFy, toCrore } from './util'

export interface RawAnnualInput {
  company_id: string
  fiscal_year?: string
  gwp?: string | number | null
  nwp?: string | number | null
  nep?: string | number | null
  pat?: string | number | null
  combined_ratio?: string | number | null
  claims_ratio?: string | number | null
  expense_ratio?: string | number | null
  commission_ratio?: string | number | null
  solvency_ratio?: string | number | null
  roe?: string | number | null
  market_share?: string | number | null
  retail_mix?: string | number | null
  renewal_rate?: string | number | null
  claims_settlement_ratio?: string | number | null
  scale?: 'inr' | 'lakh' | 'crore'
  source_url?: string
  source_file?: string
  source_period?: string
  parser_name?: string
  confidence?: 'high' | 'medium' | 'low' | 'pending'
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^0-9.\-]/g, '')) : Number(v)
  return isFinite(n) ? n : null
}

export function normaliseAnnualRow(input: RawAnnualInput) {
  const scale = input.scale ?? 'crore'
  return {
    company_id: input.company_id,
    fiscal_year: normaliseFy(input.fiscal_year ?? ''),
    gwp: input.gwp == null ? null : toCrore(input.gwp, scale),
    nwp: input.nwp == null ? null : toCrore(input.nwp, scale),
    nep: input.nep == null ? null : toCrore(input.nep, scale),
    pat: input.pat == null ? null : toCrore(input.pat, scale),
    revenue: null,
    combined_ratio: num(input.combined_ratio),
    cisor: null,
    claims_ratio: num(input.claims_ratio),
    expense_ratio: num(input.expense_ratio),
    commission_ratio: num(input.commission_ratio),
    solvency_ratio: num(input.solvency_ratio),
    roe: num(input.roe),
    market_share: num(input.market_share),
    retail_mix: num(input.retail_mix),
    group_mix: input.retail_mix == null ? null : 100 - (num(input.retail_mix) ?? 0),
    renewal_rate: num(input.renewal_rate),
    claims_settlement_ratio: num(input.claims_settlement_ratio),
    branch_count: null,
    employee_count: null,
    distribution_summary: null,
    provenance: {
      source_name: input.source_url ?? 'unknown',
      source_url: input.source_url ?? '',
      source_file: input.source_file ?? null,
      source_period: input.source_period ?? input.fiscal_year ?? null,
      fetched_at: new Date().toISOString(),
      parsed_at: new Date().toISOString(),
      parser_name: input.parser_name ?? 'normaliseAnnualRow',
      confidence: input.confidence ?? 'pending',
    },
  }
}
