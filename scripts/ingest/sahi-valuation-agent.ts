// ---------------------------------------------------------------------------
//  Listed-SAHI valuation multiples via the muns chat agent → valuation-snapshot.
//
//  The Analysis Builder's Valuation columns want P/E and P/B for the two LISTED
//  SAHIs (Star Health, Niva Bupa). Screener serves those numbers via JavaScript
//  the scraper can't capture, so we ask the muns agent for the current Stock
//  P/E, Price-to-Book, market cap and price, parse the table, derive Price/GWP
//  (market cap ÷ latest-FY GWP) and write valuation-snapshot.json.
//
//  Honesty: a company contributes a row only when the agent returns a P/E or P/B
//  for it; every row carries the agent's source. Nothing fabricated; if the
//  answer is unparseable the snapshot is left untouched. Token from
//  MUNS_API_TOKEN (a GitHub Actions secret).
// ---------------------------------------------------------------------------

import { writeSnapshot, readSnapshot, nowIso, appendLog } from './util'
import type { InsurerAnnualRow, SnapshotEnvelope } from '../../src/data/snapshots/_schemas'

const API_URL = 'https://devde.muns.io/chat/chat-muns'
const API_TIMEOUT_MS = 600_000

function buildPayload() {
  return {
    user_index: 124,
    tasks: [
      'I need the CURRENT market valuation multiples for these NSE-listed Indian insurers:\n' +
        'Star Health and Allied Insurance (NSE: STARHEALTH)\n' +
        'Niva Bupa Health Insurance (NSE: NIVABUPA)\n' +
        'ICICI Lombard General Insurance (NSE: ICICIGI)\n' +
        'Go Digit General Insurance (NSE: GODIGIT)\n\n' +
        'For each company give the latest: trailing Stock P/E (price/earnings), Price-to-Book (P/B), market capitalisation in ₹ crore, and the current share price in ₹.\n\n' +
        'Return a table with exactly these columns, in this order, pipe-delimited:\n\n' +
        'company | pe | pb | market_cap_cr | price | source_url\n\n' +
        'Rules:\n' +
        'company = exactly "Star Health", "Niva Bupa", "ICICI Lombard" or "Go Digit".\n' +
        'pe, pb = plain numbers (multiples), no "x". If a multiple is not available (e.g. negative earnings), leave it blank — never 0, never an estimate.\n' +
        'market_cap_cr = market capitalisation in ₹ crore, number only.\n' +
        'price = current share price in ₹, number only.\n' +
        'source_url = the page the figures come from (Screener / NSE / company).\n\n' +
        'One row per company, latest available. Do not fabricate — leave a cell blank if not published.\n\n' +
        'Example (format only):\n' +
        'company | pe | pb | market_cap_cr | price | source_url\n' +
        'Star Health | 38.5 | 4.1 | 35000 | 600 | https://…',
    ],
    query_context: {
      TICKER_SYMBOL: ['STARHEALTH', 'NIVABUPA'],
      FROM_DATE: '2025-01-01',
      TO_DATE: nowIso().slice(0, 10),
      ANNOUNCEMENT_FORM_TYPE: 'all',
      DOCUMENT_IDS: [],
      CATEGORIES: [],
      WEB_SEARCH_ENABLED: true,
      COUNTRY: [],
      CONTEXT_EMAIL: 'nadamsaluja@gmail.com',
      CONTEXT_COMPANY_NAME: [],
      GET_ANNOUNCEMENTS_ENABLED: false,
      chatHistory: [],
      mode: 'fast',
    },
    autoAddUpcoming: false,
  }
}

async function callAgent(token: string): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { accept: '*/*', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload()),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`agent call failed: HTTP ${res.status} ${res.statusText}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function extractAnswer(text: string): string {
  const m = text.match(/<ans>([\s\S]*?)<\/ans>/)
  return m ? m[1] : text
}

const ID_BY_NAME: Record<string, string> = { 'star health': 'star-health', 'niva bupa': 'niva-bupa', 'icici lombard': 'icici-lombard', 'go digit': 'godigit' }
function num(s: string | undefined, max: number): number | null {
  if (s == null) return null
  const t = s.replace(/[x₹,\s]/gi, '')
  if (!t) return null
  const n = parseFloat(t)
  return Number.isFinite(n) && n > 0 && n <= max ? n : null
}

async function loadLatestGwp(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  try {
    const snap = await readSnapshot<SnapshotEnvelope<InsurerAnnualRow>>('insurer-annual-snapshot.json')
    const latestFy = new Map<string, string>()
    for (const row of snap.data) {
      if (typeof row.gwp !== 'number') continue
      const prev = latestFy.get(row.company_id)
      if (!prev || row.fiscal_year > prev) { latestFy.set(row.company_id, row.fiscal_year); out.set(row.company_id, row.gwp) }
    }
  } catch { /* no GWP */ }
  return out
}

async function main(): Promise<number> {
  const token = (process.env.MUNS_API_TOKEN || '').trim()
  if (!token) { console.error('ERROR: MUNS_API_TOKEN is not set.'); return 1 }
  const fetched_at = nowIso()
  const date = fetched_at.slice(0, 10)
  const gwpByCompany = await loadLatestGwp()

  console.log('Calling chat-muns agent for listed-SAHI valuation multiples ...')
  let raw: string
  try { raw = await callAgent(token) } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`); return 1
  }
  const answer = extractAnswer(raw)

  const rows = []
  const seen = new Set<string>()
  for (const line of answer.split('\n')) {
    if (!line.includes('|')) continue
    const c = line.split('|').map((x) => x.trim())
    if (c.length < 5) continue
    const company_id = ID_BY_NAME[Object.keys(ID_BY_NAME).find((k) => c[0].toLowerCase().includes(k)) ?? '']
    if (!company_id || seen.has(company_id)) continue
    const pe = num(c[1], 1000)
    const pb = num(c[2], 100)
    if (pe == null && pb == null) continue
    seen.add(company_id)
    const market_cap = num(c[3], 5_000_000)
    const price = num(c[4], 200000)
    const sourceUrl = (c[5] || '').match(/https?:\/\/\S+/)?.[0] ?? null
    const gwp = gwpByCompany.get(company_id) ?? null
    const price_to_gwp = market_cap != null && gwp != null && gwp > 0 ? Math.round((market_cap / gwp) * 100) / 100 : null
    rows.push({
      company_id,
      date,
      market_cap,
      share_price: price,
      shares_outstanding: null,
      price_to_book: pb,
      price_to_earnings: pe,
      price_to_gwp,
      price_to_nep: null,
      analyst_target_price: null,
      provenance: {
        source_name: `${c[0].trim()} valuation multiples (via muns agent)`,
        source_url: sourceUrl,
        source_period: 'TTM',
        fetched_at,
        parsed_at: nowIso(),
        parser_name: 'sahi-valuation-agent',
        confidence: 'medium',
      },
    })
    console.log(`  + ${company_id}: P/E ${pe ?? 'n/a'} · P/B ${pb ?? 'n/a'} · mcap ${market_cap ?? 'n/a'} · P/GWP ${price_to_gwp ?? 'n/a'}`)
    await appendLog('sahi-valuation-agent.log', { company_id, pe, pb, market_cap, price_to_gwp })
  }

  if (rows.length === 0) {
    console.error('No parseable valuation rows — leaving valuation-snapshot.json untouched. Raw answer:\n' + answer.slice(0, 1500))
    return 0
  }

  await writeSnapshot('valuation-snapshot.json', {
    _meta: {
      snapshot_id: 'valuation-snapshot',
      description: 'Daily valuation snapshot for listed insurers — price, market cap, P/GWP, P/B, P/E.',
      schema_version: '1.0.0',
      dataset: 'mixed',
      last_updated: date,
      last_successful_run: fetched_at,
      upstream_sources: ['muns_agent', 'nse_bse_quotes'],
      parser_status: 'ready',
      notes: 'Listed-insurer only (Star Health, Niva Bupa). Unlisted SAHIs have no market price → null (n/a). P/E and P/B via the muns agent; P/GWP = market cap ÷ latest-FY GWP.',
    },
    data: rows,
  })
  console.log(`valuation-snapshot: wrote ${rows.length} row(s).`)
  return 0
}

main().then((code) => { process.exitCode = code })
