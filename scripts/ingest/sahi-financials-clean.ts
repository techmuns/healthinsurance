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
  'expense of management (eom) ratio|igaap': 'eom_igaap',
  'expense of management ratio|igaap': 'eom_igaap',
  'expense of management (eom) ratio|—': 'eom_igaap',
  'expense of management (eom) ratio|-': 'eom_igaap',
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
  'investment yield|—': 'investment_yield',
  'investment yield|-': 'investment_yield',
  'investment yield|igaap': 'investment_yield',
}
const UNIT: Record<string, string> = {
  total_gwp: 'INR_cr', retail_health_gwp: 'INR_cr', nwp: 'INR_cr', nep: 'INR_cr',
  pat_igaap: 'INR_cr', pat_ifrs: 'INR_cr', net_worth_ifrs: 'INR_cr', investment_aum: 'INR_cr',
  net_worth: 'INR_cr', net_worth_igaap: 'INR_cr',
  solvency_ratio: 'x',
}

function metricFor(lineItem: string, basis: string): { key: string; note?: string } | null {
  const li = lineItem.toLowerCase().trim()
  const b = basis.toLowerCase().trim()
  // Statutory (IGAAP / NL-return) net worth → the SAHI grid's net_worth cell;
  // net_worth_ifrs only when the source explicitly states the IFRS/Ind-AS basis
  // (keeps the two bases from crossing — basis discipline).
  if (li.startsWith('net worth')) return { key: b === 'ifrs' ? 'net_worth_ifrs' : 'net_worth' }
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

// --- sanity gate (Neha, 2026-06-15): a misread must never fill a blank cell.
// Out-of-band values are dropped; identity violations (claims > combined, or the
// NEP ≤ NWP ≤ GWP chain) drop the offending value. Nothing is "corrected"
// silently — the impossible read is simply withheld, the rest keep their proof.
const BAND: Record<string, [number, number]> = {
  claims_ratio_igaap: [0, 200], claims_ratio_ifrs: [0, 200],
  expense_ratio_igaap: [0, 120], expense_ratio_ifrs: [0, 120], eom_igaap: [0, 120],
  commission_ratio_igaap: [0, 60], combined_ratio_igaap: [0, 260],
  solvency_ratio: [0.3, 15], investment_yield: [-5, 40], retail_health_market_share: [0, 100],
  total_gwp: [0, 1_000_000], retail_health_gwp: [0, 1_000_000], nwp: [0, 1_000_000], nep: [0, 1_000_000],
  net_worth: [-1_000_000, 1_000_000], net_worth_ifrs: [-1_000_000, 1_000_000], net_worth_igaap: [-1_000_000, 1_000_000],
  investment_aum: [0, 5_000_000], pat_igaap: [-200_000, 200_000], pat_ifrs: [-200_000, 200_000],
}
function sane(rows: CleanRow[]): CleanRow[] {
  const drop = new Set<CleanRow>()
  for (const r of rows) {
    const b = BAND[r.metric]
    if (b && (r.value < b[0] || r.value > b[1])) { console.warn(`  drop out-of-band: ${r.metric}=${r.value}`); drop.add(r) }
  }
  const get = (k: string) => { const r = rows.find((x) => x.metric === k && !drop.has(x)); return r ? r.value : null }
  const dropM = (k: string, why: string) => { const r = rows.find((x) => x.metric === k); if (r && !drop.has(r)) { console.warn(`  drop ${why}: ${k}=${r.value}`); drop.add(r) } }
  const cl = get('claims_ratio_igaap'), comb = get('combined_ratio_igaap')
  if (cl != null && comb != null && cl > comb + 1.5) dropM('claims_ratio_igaap', `claims exceeds combined ${comb}`)
  const gwp = get('total_gwp'), nwp = get('nwp'), nep = get('nep')
  if (nwp != null && gwp != null && nwp > gwp * 1.02) dropM('nwp', `nwp exceeds gwp ${gwp}`)
  if (nep != null && nwp != null && nep > nwp * 1.02) dropM('nep', `nep exceeds nwp ${nwp}`)
  return rows.filter((r) => !drop.has(r))
}
const cleaned = sane(out)

const outPath = resolve(DIR, `cleaned-${period}.json`)
writeFileSync(outPath, JSON.stringify(cleaned, null, 2) + '\n', 'utf8')
console.log(`Mapped ${cleaned.length} value(s) for ${companyId} ${period} (of ${out.length} read):`)
for (const r of cleaned) console.log(`  ${r.metric.padEnd(24)} = ${r.value} ${r.unit}`)
console.log(`\nWrote ${outPath}\nIngest with: npm run ingest:audit -- --from ${outPath.replace(REPO + '/', '')}`)
