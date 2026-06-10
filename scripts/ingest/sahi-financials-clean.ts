// ---------------------------------------------------------------------------
//  Clean a sahi-financials agent answer into audit-overlay extraction rows.
//
//  Reads the newest data/agent-pulls/sahi-financials/<id>/<id>-<period>-*.json,
//  parses the agent's markdown table, maps each (line_item, basis) to a grid
//  metric key, drops blanks, and writes cleaned-<period>.json — ready for
//  `npm run ingest:audit -- --from <that file>`.
//
//  Usage: tsx scripts/ingest/sahi-financials-clean.ts <company-id> [period]
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')

const companyId = (process.argv[2] || process.env.FETCH_COMPANY_ID || '').trim()
const period = (process.argv[3] || process.env.FETCH_PERIOD || 'FY25').trim()
if (!companyId) { console.error('usage: tsx sahi-financials-clean.ts <company-id> [period]'); process.exit(1) }

const DIR = resolve(REPO, 'data/agent-pulls/sahi-financials', companyId)
if (!existsSync(DIR)) { console.error(`no pulls for ${companyId} at ${DIR}`); process.exit(1) }

// (line_item, basis) → grid metric key. Keys normalised to lower-case.
const MAP: Record<string, string> = {
  'total gwp|igaap': 'total_gwp',
  'retail health gwp|igaap': 'retail_health_gwp',
  'retail health gwp|—': 'retail_health_gwp',
  'retail health gwp|-': 'retail_health_gwp',
  'net written premium (nwp)|igaap': 'nwp',
  'net earned premium (nep)|igaap': 'nep',
  'profit after tax (pat)|igaap': 'pat_igaap',
  'profit after tax (pat)|ifrs': 'pat_ifrs',
  'claims ratio|igaap': 'claims_ratio_igaap',
  'claims ratio|ifrs': 'claims_ratio_ifrs',
  'expense ratio|igaap': 'expense_ratio_igaap',
  'commission ratio|igaap': 'commission_ratio_igaap',
  'combined ratio|igaap': 'combined_ratio_igaap',
  'solvency ratio|—': 'solvency_ratio',
  'solvency ratio|-': 'solvency_ratio',
  'retail health market share|—': 'retail_health_market_share',
  'retail health market share|-': 'retail_health_market_share',
  'assets under management (aum)|—': 'investment_aum',
  'assets under management (aum)|-': 'investment_aum',
  'assets under management|—': 'investment_aum',
  'assets under management|-': 'investment_aum',
}
const UNIT: Record<string, string> = {
  total_gwp: 'INR_cr', retail_health_gwp: 'INR_cr', nwp: 'INR_cr', nep: 'INR_cr',
  pat_igaap: 'INR_cr', pat_ifrs: 'INR_cr', net_worth_ifrs: 'INR_cr', investment_aum: 'INR_cr',
  solvency_ratio: 'x',
}

function metricFor(lineItem: string, basis: string): { key: string; note?: string } | null {
  const li = lineItem.toLowerCase().trim()
  const b = basis.toLowerCase().trim()
  if (li.startsWith('net worth')) return { key: 'net_worth_ifrs', note: `Net worth on ${basis || 'reported'} basis.` }
  const k = MAP[`${li}|${b}`]
  return k ? { key: k } : null
}

// Newest answer file for this company+period.
const files = readdirSync(DIR).filter((f) => f.startsWith(`${companyId}-${period}-`) && f.endsWith('.json')).sort()
if (!files.length) { console.error(`no ${companyId}-${period}-*.json answer files`); process.exit(1) }
const raw = readFileSync(resolve(DIR, files[files.length - 1]), 'utf8')
const ansMatch = raw.match(/<ans>([\s\S]*?)<\/ans>/)
const ans = ansMatch ? ansMatch[1] : raw

interface CleanRow {
  company: string; year: string; metric: string; value: number; unit: string
  source_name: string; source_url: string | null; source_page: string | null
  confidence: string; priority: number; note: string
}
const out: CleanRow[] = []
for (const line of ans.split('\n')) {
  const c = line.split('|').map((x) => x.trim())
  if (c.length < 9) continue
  const [, , per, lineItem, basis, valueStr, , sourceName, sourceUrl, filingDate] = c
  if (!lineItem || lineItem === 'line_item' || lineItem.startsWith('---')) continue
  const v = Number(String(valueStr).replace(/,/g, ''))
  if (!valueStr || Number.isNaN(v)) continue // blank / non-numeric → skip (never a 0)
  const m = metricFor(lineItem, basis)
  if (!m) continue
  out.push({
    company: companyId,
    year: per || period,
    metric: m.key,
    value: v,
    unit: UNIT[m.key] ?? '%',
    source_name: sourceName || `${companyId} ${period} company filing`,
    source_url: sourceUrl && /^https?:/.test(sourceUrl) ? sourceUrl : null,
    source_page: null,
    confidence: 'high',
    priority: 1,
    note: `Company filing / quarterly investor presentation (${filingDate || period}). Fetched via munschat sahi-financials.${m.note ? ' ' + m.note : ''}`,
  })
}

const outPath = resolve(DIR, `cleaned-${period}.json`)
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8')
console.log(`Mapped ${out.length} value(s) for ${companyId} ${period}:`)
for (const r of out) console.log(`  ${r.metric.padEnd(24)} = ${r.value} ${r.unit}`)
console.log(`\nWrote ${outPath}\nIngest with: npm run ingest:audit -- --from ${outPath.replace(REPO + '/', '')}`)
