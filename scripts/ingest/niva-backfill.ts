// ---------------------------------------------------------------------------
//  Niva Bupa automated one-by-one audit backfill (Niva Bupa ONLY).
//
//  Uses FY25 as the playbook: for each metric, reuse the SAME source family +
//  extraction method that filled FY25, applied to the already-downloaded
//  prior-year source files, with strict basis-matching. Real data only — a cell
//  is filled only when a value is extracted from a traceable source on a
//  matching basis; otherwise it is honestly marked (missing_in_source /
//  source_not_fetched / basis_mismatch / needs_review) and the run continues.
//
//  Safe extractors used here (both basis-aware, validated against FY25):
//    • parseRevenueAccount (NL-1)  → full-year NEP (year_to_date column).
//    • extractDisclosure           → year-end Solvency Margin Ratio.
//  Premium-written / PAT / annual loss-ratios are NOT emitted by the available
//  parsers on a full-year basis, so those gaps are marked honestly rather than
//  filled from a quarter-basis figure.
//
//  Outputs:
//    data/agent-pulls/niva-backfill/cleaned.json          (→ ingest:audit)
//    data/processed/niva-bupa-source-ledger.json          (per-cell evidence)
//
//  Run:  tsx scripts/ingest/niva-backfill.ts
//  Company is "niva-bupa" internally; all user-facing labels say "Niva Bupa".
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pdf from 'pdf-parse'
import { parseRevenueAccount } from './nl-form-parser'
import { extractDisclosure } from './disclosure-extract'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const SLUG = 'niva-bupa'
const DISPLAY = 'Niva Bupa'
const RAW = resolve(REPO, 'data/raw/companies/niva-bupa')
const YEARS = ['FY22', 'FY23', 'FY24', 'FY25', 'FY26']

// March (year-end) IRDAI public-disclosure file per fiscal year. The NL-1
// revenue account in each carries the full-year (YTD) figures + the prior year.
const DISCLOSURE: Record<string, string> = {
  FY22: 'niva-bupa-Website-Public-Disclosure-Mar-2022.pdf',
  FY23: 'niva-bupa-Public-Disclosure-Reports-March-2023.pdf',
  FY24: 'niva-bupa-Public-disclosure-Reports-March-2024.pdf',
  FY25: 'niva-bupa-Website-Public-Disclosures-Mar-2025.pdf',
  FY26: 'niva-bupa-Website-Public-Disclosures-Mar-2026.pdf',
}
const DISCLOSURE_URL: Record<string, string> = {
  FY22: 'https://transactions.nivabupa.com/pages/doc/pub-dis/quarterly-reports/Website-Public-Disclosure-Mar-2022.pdf',
  FY23: 'https://transactions.nivabupa.com/pages/doc/pub-dis/quarterly-reports/Public-Disclosure-Reports-March-2023.pdf',
  FY24: 'https://transactions.nivabupa.com/pages/doc/pub-dis/quarterly-reports/Public-disclosure-Reports-March-2024.pdf',
  FY25: 'https://transactions.nivabupa.com/pages/doc/pub-dis/quarterly-reports/Website-Public-Disclosures-Mar-2025.pdf',
  FY26: 'https://transactions.nivabupa.com/pages/doc/pub-dis/quarterly-reports/Website-Public-Disclosures-Mar-2026.pdf',
}

// Grid metrics already filled from the value store / GI Council / DRHP — read so
// the backfill only targets genuinely missing cells and never overrides them.
const storeIdx = JSON.parse(readFileSync(resolve(REPO, 'src/data/snapshots/extracted-data-audit.json'), 'utf8'))
  .values as Record<string, { normalized_value?: number | string | null; raw_value?: number | string | null }>
const overlay = (JSON.parse(readFileSync(resolve(REPO, 'src/data/snapshots/audit-overlay.json'), 'utf8')).data ?? {}) as Record<string, { value: number | null }>
// Mirror the grid's other sources so the ledger status is accurate (the grid
// also reads the DRHP share series and the dashboard annual snapshot).
const shareRows = (JSON.parse(readFileSync(resolve(REPO, 'src/data/snapshots/sahi-share-history.json'), 'utf8')).data as Array<Record<string, unknown>>)
const annualRows = (JSON.parse(readFileSync(resolve(REPO, 'src/data/snapshots/insurer-annual-snapshot.json'), 'utf8')).data as Array<Record<string, unknown>>)
const SHARE_FIELD: Record<string, string> = { sahi_segment_share: 'segment_share_pct', retail_health_market_share: 'retail_share_pct', overall_health_market_share: 'overall_share_pct' }
// Annual-snapshot fields the grid already reads — including the premium lines.
// gross_direct_premium / nwp / nep here are the audited annual-report (IRDAI
// 1/n) figures and are authoritative; the backfill must treat these cells as
// already filled and never overwrite them with a weaker disclosure pull.
const ANNUAL_FIELD: Record<string, string> = {
  settlement_ratio: 'claims_settlement_ratio', renewal_rate: 'renewal_rate', customer_retention: 'customer_retention',
  total_gwp: 'gwp', gross_direct_premium: 'gross_direct_premium', nwp: 'nwp', nep: 'nep',
  pat_igaap: 'pat', combined_ratio_igaap: 'combined_ratio', expense_ratio_igaap: 'expense_ratio', solvency_ratio: 'solvency_ratio',
}

function alreadyFilled(metric: string, year: string): boolean {
  const s = storeIdx[`${SLUG}::${metric}::${year}`]
  const sv = s ? (typeof s.normalized_value === 'number' ? s.normalized_value : typeof s.raw_value === 'number' ? s.raw_value : null) : null
  if (sv != null) return true
  const o = overlay[`${SLUG}::${metric}::${year}`]
  if (o != null && o.value != null) return true
  if (SHARE_FIELD[metric]) {
    const row = shareRows.find((r) => r.company_id === SLUG)
    const v = row ? (row[SHARE_FIELD[metric]] as Record<string, unknown> | undefined)?.[year] : undefined
    if (typeof v === 'number') return true
  }
  if (ANNUAL_FIELD[metric]) {
    const row = annualRows.find((r) => r.company_id === SLUG && r.fiscal_year === year)
    if (row && typeof row[ANNUAL_FIELD[metric]] === 'number') return true
  }
  return false
}

async function pdfText(file: string): Promise<string | null> {
  const p = resolve(RAW, file)
  if (!existsSync(p)) return null
  try {
    const r = await (pdf as unknown as (b: Buffer) => Promise<{ text: string }>)(readFileSync(p))
    return r.text
  } catch {
    return null
  }
}

interface LedgerEntry {
  company: string
  fiscal_year: string
  metric_key: string
  metric_name: string
  attempted_sources: string[]
  selected_source: string | null
  selected_value: number | null
  unit: string
  source_url_or_file: string | null
  page_or_section: string | null
  extracted_snippet: string | null
  extraction_status: string
  reason_if_not_filled: string | null
  last_attempted_at: string
}

const METRIC_NAME: Record<string, string> = {
  nep: 'Net earned premium (NEP)', solvency_ratio: 'Solvency ratio',
  total_gwp: 'Total GWP', gross_direct_premium: 'Gross direct premium', nwp: 'Net written premium (NWP)',
  pat_igaap: 'PAT (IGAAP)', pat_ifrs: 'PAT (IFRS)', claims_ratio_igaap: 'Claims ratio (IGAAP)',
  claims_ratio_ifrs: 'Claims ratio (IFRS)', expense_ratio_igaap: 'Expense ratio', commission_ratio_igaap: 'Commission ratio',
  combined_ratio_igaap: 'Combined ratio', net_worth_ifrs: 'Net worth', sahi_segment_share: 'SAHI segment share',
  retail_health_market_share: 'Retail health share', overall_health_market_share: 'Overall health share',
  settlement_ratio: 'Claim settlement ratio', renewal_rate: 'Renewal rate', customer_retention: 'Customer retention',
}

async function main() {
  const now = new Date().toISOString()
  const ledger: LedgerEntry[] = []
  const fills: Array<Record<string, unknown>> = []

  // ── Extract basis-tagged full-year NEP + year-end solvency from each file ──
  const nepByYear: Record<string, { value: number; file: string; fy: string; basis: string }> = {}
  const solvByYear: Record<string, { value: number; file: string }> = {}
  // Full-year PAT (1/n IRDAI revenue-account basis) from the P&L "Profit/(Loss)
  // after tax" row. Columns are [Q4 standalone, YTD full-year, prior Q4, prior
  // YTD]; we take the YTD (full-year) column. Self-validated against the known
  // FY25 store PAT (≈214) — if FY25 doesn't reconcile we trust NONE of it.
  const patByYear: Record<string, { value: number; file: string }> = {}
  const readLakhs = (s: string, n: number): number[] =>
    [...s.matchAll(/\(?\d[\d,]*(?:\.\d+)?\)?/g)]
      .map((m) => { const neg = m[0].includes('('); const v = parseFloat(m[0].replace(/[(),]/g, '')); return Number.isNaN(v) ? null : (neg ? -v : v) })
      .filter((v): v is number => v != null)
      .slice(0, n)
  for (const fy of YEARS) {
    const text = await pdfText(DISCLOSURE[fy])
    if (!text) continue
    const ra = parseRevenueAccount(text)
    if (ra.found) {
      for (const v of ra.values) {
        // Keep only full-year (year_to_date) NEP, tagged with its own period.
        if (v.metric === 'nep' && v.column_basis === 'year_to_date' && v.period && /^FY\d\d$/.test(v.period)) {
          // Prefer the disclosure whose OWN year matches (current_ytd) over a prior-year column.
          const better = v.column_kind === 'current_ytd'
          if (!nepByYear[v.period] || better) nepByYear[v.period] = { value: v.normalized_crore, file: DISCLOSURE[fy], fy, basis: v.column_basis }
        }
      }
    }
    const disc = extractDisclosure(text)
    if (disc && disc.solvency_ratio != null) solvByYear[fy] = { value: disc.solvency_ratio, file: DISCLOSURE[fy] }
    // PAT: full-year YTD = 2nd column after the P&L label (Rs. Lakhs → Cr ÷100).
    const pi = text.search(/Profit\s*\/?\s*\(Loss\)\s*after\s*tax/i)
    if (pi >= 0) {
      const nums = readLakhs(text.slice(pi + 28, pi + 220), 4)
      if (nums.length >= 2 && Math.abs(nums[1] * 0.01) < 5000) patByYear[fy] = { value: +(nums[1] * 0.01).toFixed(2), file: DISCLOSURE[fy] }
    }
    // NOTE: a disclosure "Gross Direct Premium" extractor was trialled here but
    // read systematically ~2% below the audited annual-report 1/n figures
    // (e.g. FY25 6,616 vs the authoritative 6,762) — wrong column/sub-line — so
    // it was removed. gross_direct_premium / NWP are already carried on the
    // correct 1/n basis by the annual snapshot; the backfill leaves them alone.
  }
  // Self-validation gate: only trust the PAT column if FY25 reconciles to ~214.
  const patReliable = patByYear.FY25 != null && Math.abs(patByYear.FY25.value - 214) <= 6
  if (!patReliable) for (const k of Object.keys(patByYear)) delete patByYear[k]

  function record(metric: string, year: string, opts: Partial<LedgerEntry> & { extraction_status: string }) {
    ledger.push({
      company: DISPLAY, fiscal_year: year, metric_key: metric, metric_name: METRIC_NAME[metric] ?? metric,
      attempted_sources: opts.attempted_sources ?? [], selected_source: opts.selected_source ?? null,
      selected_value: opts.selected_value ?? null, unit: opts.unit ?? '', source_url_or_file: opts.source_url_or_file ?? null,
      page_or_section: opts.page_or_section ?? null, extracted_snippet: opts.extracted_snippet ?? null,
      extraction_status: opts.extraction_status, reason_if_not_filled: opts.reason_if_not_filled ?? null, last_attempted_at: now,
    })
  }

  // ── Walk every Niva metric × year and decide an honest status ──────────────
  const ALL_METRICS = Object.keys(METRIC_NAME)
  let newFills = 0
  for (const year of YEARS) {
    for (const metric of ALL_METRICS) {
      if (alreadyFilled(metric, year)) { record(metric, year, { extraction_status: 'filled', selected_source: 'existing (value store / GI Council / DRHP)', reason_if_not_filled: null }); continue }

      // Backfill the two safe, basis-matched extractors.
      if (metric === 'nep' && nepByYear[year]) {
        const c = nepByYear[year]
        record(metric, year, { extraction_status: 'filled', selected_source: 'IRDAI public disclosure — NL-1 Revenue Account (full-year, year_to_date)',
          selected_value: c.value, unit: 'INR_cr', source_url_or_file: DISCLOSURE_URL[c.fy], page_or_section: 'NL-1 Revenue Account · Premiums earned (Net)',
          extracted_snippet: `Premiums earned (Net), full-year ${year} = ${c.value} Cr`, attempted_sources: ['irdai_public_disclosure'] })
        fills.push({ company: SLUG, year, metric, value: c.value, unit: 'INR_cr', priority: 2, confidence: 'high',
          source_name: `Niva Bupa IRDAI Public Disclosure (year ended Mar ${c.fy.slice(2)}) — NL-1 Revenue Account, Premiums earned (Net), full year`,
          source_url: DISCLOSURE_URL[c.fy], source_file: `data/raw/companies/niva-bupa/${c.file}`, source_page: 'NL-1 Revenue Account',
          note: 'Full-year (year-to-date) NEP parsed from the IRDAI NL-1 revenue account — basis matches the FY25 NEP cell.' })
        newFills++; continue
      }
      if (metric === 'solvency_ratio' && solvByYear[year]) {
        const c = solvByYear[year]
        record(metric, year, { extraction_status: 'filled', selected_source: 'IRDAI public disclosure — Solvency Margin Ratio (year-end)',
          selected_value: c.value, unit: 'x', source_url_or_file: DISCLOSURE_URL[year], page_or_section: 'Solvency Margin Ratio (No. of times)',
          extracted_snippet: `Solvency Margin Ratio (No. of times) = ${c.value}`, attempted_sources: ['irdai_public_disclosure'] })
        fills.push({ company: SLUG, year, metric, value: c.value, unit: 'x', priority: 2, confidence: 'high',
          source_name: `Niva Bupa IRDAI Public Disclosure (year ended Mar ${year.slice(2)}) — Solvency Margin Ratio`,
          source_url: DISCLOSURE_URL[year], source_file: `data/raw/companies/niva-bupa/${c.file}`, source_page: 'Solvency Margin Ratio',
          note: 'Year-end solvency margin (point value) from the IRDAI disclosure — basis matches the FY25 solvency cell.' })
        newFills++; continue
      }

      if (metric === 'pat_igaap' && patByYear[year]) {
        const c = patByYear[year]
        record(metric, year, { extraction_status: 'filled', selected_source: 'IRDAI public disclosure — P&L Profit/(Loss) after tax (full-year, 1/n basis)',
          selected_value: c.value, unit: 'INR_cr', source_url_or_file: DISCLOSURE_URL[year], page_or_section: 'Profit & Loss · Profit/(Loss) after tax (YTD column)',
          extracted_snippet: `Profit/(Loss) after tax, full-year ${year} = ${c.value} Cr`, attempted_sources: ['irdai_public_disclosure'] })
        fills.push({ company: SLUG, year, metric, value: c.value, unit: 'INR_cr', priority: 2, confidence: 'high',
          source_name: `Niva Bupa IRDAI Public Disclosure (year ended Mar ${year.slice(2)}) — Profit/(Loss) after tax, full year (1/n basis)`,
          source_url: DISCLOSURE_URL[year], source_file: `data/raw/companies/niva-bupa/${c.file}`, source_page: 'P&L · Profit/(Loss) after tax (YTD)',
          note: 'Full-year PAT (IRDAI 1/n revenue-account basis), YTD column — method self-validated against the FY25 store value (≈214).' })
        newFills++; continue
      }

      // Not safely fillable from in-repo sources on a matching basis → honest mark.
      const hasDisc = existsSync(resolve(RAW, DISCLOSURE[year] ?? ''))
      if (['claims_ratio_igaap', 'combined_ratio_igaap', 'commission_ratio_igaap', 'expense_ratio_igaap'].includes(metric)) {
        record(metric, year, { extraction_status: hasDisc ? 'basis_mismatch' : 'source_not_fetched', attempted_sources: ['irdai_public_disclosure'],
          reason_if_not_filled: hasDisc ? 'Disclosure carries the standalone-quarter ratio, not the full-year ratio that the FY25 cell uses — basis would mismatch; needs the annual report full-year ratio.' : 'No annual-report / full-year-ratio source for this year in the repo.' })
      } else if (['total_gwp', 'gross_direct_premium', 'nwp', 'pat_ifrs', 'net_worth_ifrs'].includes(metric)) {
        record(metric, year, { extraction_status: hasDisc ? 'missing_in_source' : 'source_not_fetched', attempted_sources: ['irdai_public_disclosure', 'annual_report'],
          reason_if_not_filled: hasDisc ? 'Source present but the available NL-1/disclosure parser does not emit this line on a full-year basis; needs an annual-report table parse.' : 'Annual report / disclosure for this year not downloaded in the repo.' })
      } else {
        record(metric, year, { extraction_status: 'missing_in_source', reason_if_not_filled: 'No traceable source for this metric/year among the downloaded files.' })
      }
    }
  }

  // ── Write ledger + cleaned fills ───────────────────────────────────────────
  const ledgerPath = resolve(REPO, 'data/processed/niva-bupa-source-ledger.json')
  writeFileSync(ledgerPath, JSON.stringify({ _meta: { company: DISPLAY, generated_at: now, note: 'Per-cell backfill evidence for Niva Bupa. Real data only; honest status per cell.' }, data: ledger }, null, 2) + '\n')
  const outDir = resolve(REPO, 'data/agent-pulls/niva-backfill')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, 'cleaned.json'), JSON.stringify(fills, null, 2) + '\n')

  const byStatus: Record<string, number> = {}
  for (const e of ledger) byStatus[e.extraction_status] = (byStatus[e.extraction_status] ?? 0) + 1
  console.log(`Niva Bupa backfill — ${ledger.length} cells assessed (${YEARS.length} years × ${ALL_METRICS.length} metrics)`)
  console.log('status:', JSON.stringify(byStatus))
  console.log(`new safe fills this run: ${newFills}`)
  console.log(`ledger → ${ledgerPath}`)
  console.log(`fills  → ${resolve(outDir, 'cleaned.json')}  (ingest: npm run ingest:audit -- --from data/agent-pulls/niva-backfill/cleaned.json)`)
}

main()
