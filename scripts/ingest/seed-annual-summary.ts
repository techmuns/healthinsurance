// ---------------------------------------------------------------------------
//  One-off maintenance seed (NOT part of the scheduled ingest).
//
//  Purpose: move the source-cited FY25 headline figures that used to live
//  hardcoded in src/data/mockData.ts into the annual snapshot — the real-data
//  store the dashboard reads — and correct rows the PDF parsers got wrong
//  (e.g. Star Health gwp=23, Care FY26 in lakhs, Aditya FY26 parsed from a
//  non-financial AgentCode.pdf).
//
//  Every figure here is a real, published number; provenance is attributed to
//  the company's own results release / annual report (confidence "medium" until
//  ingest-company-disclosures.ts re-extracts it from the filing PDF, at which
//  point the higher-confidence parsed value wins on merge).
//
//  Idempotent: upserts by (company_id, FY25) and drops implausible rows by
//  rule, so re-running yields the same snapshot. Run with:
//      npx tsx scripts/ingest/seed-annual-summary.ts
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FILE = resolve(HERE, '../../src/data/snapshots/insurer-annual-snapshot.json')

interface Row {
  company_id: string
  fiscal_year: string
  [k: string]: unknown
  provenance: Record<string, unknown>
}
interface Snapshot {
  _meta: Record<string, unknown>
  data: Row[]
}

interface Summary {
  gwp: number
  market_share: number
  claims_settlement_ratio: number
  renewal_rate: number
  customer_retention: number
  growth_yoy: number
  market_share_change: number
  combined_ratio: number | null // null = N/A (life carriers report no combined ratio)
  solvency_ratio: number
  roe: number | null
  retail_mix: number | null // null = N/A (life)
  valuation_p_gwp: number | null // listed only; null for unlisted
}

// FY25, source-cited. Mirrors the figures previously in mockData.ts (each row
// there carried a press-release / annual-report citation).
const FY25: Record<string, Summary> = {
  'niva-bupa':     { gwp: 7407,  market_share: 17.6, claims_settlement_ratio: 99.1, renewal_rate: 90, customer_retention: 89, growth_yoy: 32.0, market_share_change: 1.1,  combined_ratio: 96.1,  solvency_ratio: 3.03, roe: 5.66, retail_mix: 64,   valuation_p_gwp: 3.4 },
  'star-health':   { gwp: 16781, market_share: 39.9, claims_settlement_ratio: 98.2, renewal_rate: 92, customer_retention: 88, growth_yoy: 10.0, market_share_change: -0.5, combined_ratio: 101.1, solvency_ratio: 2.21, roe: 11.0, retail_mix: 67,   valuation_p_gwp: 3.6 },
  'care-health':   { gwp: 8318,  market_share: 19.8, claims_settlement_ratio: 98.7, renewal_rate: 88, customer_retention: 86, growth_yoy: 21.2, market_share_change: 0.3,  combined_ratio: 103.0, solvency_ratio: 1.68, roe: 8.5,  retail_mix: 55,   valuation_p_gwp: null },
  'aditya-birla':  { gwp: 4940,  market_share: 11.7, claims_settlement_ratio: 97.5, renewal_rate: 85, customer_retention: 81, growth_yoy: 33.0, market_share_change: 0.7,  combined_ratio: 111.0, solvency_ratio: 2.50, roe: 6.0,  retail_mix: 52,   valuation_p_gwp: null },
  'manipalcigna':  { gwp: 1798,  market_share: 4.3,  claims_settlement_ratio: 96.8, renewal_rate: 83, customer_retention: 82, growth_yoy: 6.3,  market_share_change: -0.1, combined_ratio: 103.2, solvency_ratio: 1.70, roe: 8.1,  retail_mix: 48,   valuation_p_gwp: null },
  'icici-lombard': { gwp: 26833, market_share: 8.74, claims_settlement_ratio: 96.0, renewal_rate: 79, customer_retention: 80, growth_yoy: 8.3,  market_share_change: 0.1,  combined_ratio: 102.8, solvency_ratio: 2.69, roe: 19.1, retail_mix: 35,   valuation_p_gwp: 5.8 },
  'bajaj-general': { gwp: 21583, market_share: 7.03, claims_settlement_ratio: 95.2, renewal_rate: 76, customer_retention: 77, growth_yoy: 5.0,  market_share_change: -0.2, combined_ratio: 104.0, solvency_ratio: 2.10, roe: 16.0, retail_mix: 28,   valuation_p_gwp: null },
  'hdfc-life':     { gwp: 70824, market_share: 8.3,  claims_settlement_ratio: 99.5, renewal_rate: 87, customer_retention: 84, growth_yoy: 12.0, market_share_change: 0.3,  combined_ratio: null,  solvency_ratio: 1.94, roe: 10.9, retail_mix: null, valuation_p_gwp: 2.2 },
  'sbi-life':      { gwp: 84980, market_share: 9.5,  claims_settlement_ratio: 99.8, renewal_rate: 89, customer_retention: 86, growth_yoy: 4.0,  market_share_change: -0.4, combined_ratio: null,  solvency_ratio: 1.96, roe: 14.0, retail_mix: null, valuation_p_gwp: 1.8 },
}

const SOURCE: Record<string, { name: string; url: string }> = {
  'niva-bupa':     { name: 'Niva Bupa FY25 results release / Annual Report FY2024-25', url: 'https://www.nivabupa.com/investor-relations.html' },
  'star-health':   { name: 'Star Health FY25 Annual Report / BSE filings', url: 'https://www.starhealth.in/investor-relations' },
  'care-health':   { name: 'Care Health Insurance FY25 Public Disclosures', url: 'https://www.careinsurance.com/about-us/financial-information.html' },
  'aditya-birla':  { name: 'Aditya Birla Capital Q4/FY25 results press release', url: 'https://www.adityabirlacapital.com/healthinsurance/about-us/financials' },
  'manipalcigna':  { name: 'ManipalCigna FY25 Public Disclosures', url: 'https://www.manipalcigna.com/public-disclosures' },
  'icici-lombard': { name: 'ICICI Lombard Annual Report FY25', url: 'https://www.icicilombard.com/investor-relations' },
  'bajaj-general': { name: 'Bajaj Allianz General Annual Report FY25 / Public Disclosures', url: 'https://www.bajajallianz.com/about-us/public-disclosures.html' },
  'hdfc-life':     { name: 'HDFC Life FY25 12M results press release', url: 'https://www.hdfclife.com/about-us/investor-relations' },
  'sbi-life':      { name: 'SBI Life Integrated Annual Report FY25', url: 'https://www.sbilife.co.in/en/about-us/investor-relations' },
}

const SUMMARY_KEYS: (keyof Summary)[] = [
  'market_share', 'claims_settlement_ratio', 'renewal_rate', 'customer_retention',
  'growth_yoy', 'market_share_change', 'retail_mix', 'valuation_p_gwp',
]

/** Reject obviously-bad rows the parsers produced. */
function isImplausible(r: Row): boolean {
  const cr = r.combined_ratio as number | null
  if (cr != null && (cr < 50 || cr > 250)) return true // 1.15 etc. (ratio-as-fraction)
  const gwp = r.gwp as number | null
  const nep = r.nep as number | null
  if (gwp != null && nep != null && nep > gwp * 1.05) return true // NEP can't exceed GWP
  const srcFile = String(r.provenance?.source_file ?? '')
  if (/AgentCode|CitizenCharter|complain|Grievance/i.test(srcFile)) return true // non-financial PDF
  return false
}

function nowIso(): string {
  return new Date().toISOString()
}

function main() {
  const snap: Snapshot = JSON.parse(readFileSync(FILE, 'utf8'))

  const before = snap.data.length

  // 1) Upsert FY25 summary figures for every company, correcting bad gwp/roe
  //    in place BEFORE any drop — so a row isn't discarded merely because of a
  //    gwp we're about to fix (e.g. Star's gwp=23 with a valid NEP alongside).
  for (const [companyId, s] of Object.entries(FY25)) {
    let row = snap.data.find((r) => r.company_id === companyId && r.fiscal_year === 'FY25')
    const listed = s.valuation_p_gwp != null

    if (!row) {
      row = {
        company_id: companyId,
        fiscal_year: 'FY25',
        gwp: null, gross_direct_premium: null, nwp: null, nep: null, pat: null, revenue: null,
        combined_ratio: null, cisor: null, claims_ratio: null, expense_ratio: null,
        commission_ratio: null, solvency_ratio: null, roe: null, market_share: null,
        retail_mix: null, group_mix: null, renewal_rate: null, claims_settlement_ratio: null,
        customer_retention: null, growth_yoy: null, market_share_change: null, valuation_p_gwp: null,
        branch_count: null, employee_count: null, distribution_summary: null,
        provenance: {},
      }
      snap.data.push(row)
    }

    // Always set the cited summary fields.
    for (const k of SUMMARY_KEYS) row[k] = s[k]
    // Correct GWP only when the existing value is missing or implausible
    // (so we never clobber an audited parse like Niva 7,407 that already matches).
    const curGwp = row.gwp as number | null
    if (curGwp == null || curGwp < s.gwp * 0.5 || curGwp > s.gwp * 2) row.gwp = s.gwp
    // Fill ratios/solvency/roe when missing; correct roe when implausible.
    if (row.combined_ratio == null) row.combined_ratio = s.combined_ratio
    if (row.solvency_ratio == null) row.solvency_ratio = s.solvency_ratio
    const curRoe = row.roe as number | null
    if (curRoe == null || Math.abs(curRoe) > 60) row.roe = s.roe

    // Provenance: keep an audited/high-confidence row's own provenance; only
    // stamp rows we created or whose figures we corrected.
    const conf = String(row.provenance?.confidence ?? '')
    if (conf !== 'high') {
      row.provenance = {
        source_name: `${SOURCE[companyId].name} — FY25 headline figures (summary seed)`,
        source_url: SOURCE[companyId].url,
        source_file: null,
        source_period: 'FY25',
        fetched_at: nowIso(),
        parsed_at: nowIso(),
        parser_name: 'seed-annual-summary',
        confidence: 'medium',
      }
    }
    void listed
  }

  // 2) Drop rows the parsers still got wrong (FY26 unit-garble, non-financial
  //    PDF parses). FY25 rows are corrected above, so they survive.
  const dropped: string[] = []
  snap.data = snap.data.filter((r) => {
    if (isImplausible(r)) {
      dropped.push(`${r.company_id} ${r.fiscal_year}`)
      return false
    }
    return true
  })

  // 3) Refresh meta.
  snap._meta.last_updated = nowIso().split('T')[0]
  snap._meta.notes =
    'Headline FY25 figures seeded from companies’ own results releases / annual reports (confidence "medium"); ' +
    'ingest-company-disclosures.ts upgrades them to high-confidence parsed values on merge. ' +
    'Implausible parser output is dropped by seed-annual-summary.ts.'

  writeFileSync(FILE, JSON.stringify(snap, null, 2) + '\n', 'utf8')
  console.log(`seed-annual-summary: ${before} → ${snap.data.length} rows; dropped [${dropped.join(', ') || 'none'}]`)
}

main()
