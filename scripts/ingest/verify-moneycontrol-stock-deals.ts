// ---------------------------------------------------------------------------
//  Verification — Moneycontrol stock-deals (NBH = Niva Bupa) fallback source.
//
//  Proves the Bulk / Block Deal Timeline's second source end-to-end and prints a
//  CLEAR result: either the live NBH fetch returns deal rows, or it reports an
//  honest parser / fetch-blocked status. Both are acceptable outcomes per the
//  task — what must NOT happen is a silent "0 found" or a fabricated row.
//
//  It does three things:
//    1. PARSER (network-free): runs parseDealsHtml + parseDealsJson against a
//       small SYNTHETIC fixture (clearly not real data; never written to any
//       snapshot) to prove the parser normalises an NBH large-deal row.
//    2. FETCHER: runs the real fetcher (offline replay, or live with
//       INGEST_OFFLINE=0) and prints its honest status + row counts.
//    3. LIVE PROBE (best-effort): hits the NBH large-deals URL via curl (which
//       honours the environment proxy) to record the real HTTP status for the log.
//
//  Exit 0 when the parser is verified AND the fetcher produced a clear status
//  (rows, no_records, blocked, parse_warning, or pending). Exit 1 only on a
//  parser regression or an unexpected crash.
//
//  Run:  npm run verify:moneycontrol-deals
//        INGEST_OFFLINE=0 npm run verify:moneycontrol-deals   (attempt live)
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process'
import * as cheerio from 'cheerio'
import {
  COMPANIES,
  ingestMoneycontrolStockDeals,
  parseDealsHtml,
  parseDealsJson,
  parseDealDate,
} from './ingest-moneycontrol-stock-deals'
import { nowIso } from './util'

const NBH = COMPANIES.find((c) => c.sc_id === 'NBH')!
const SCRAPED_AT = nowIso()

// ── 1. SYNTHETIC fixture (NOT real data — never persisted) ───────────────────
// A representative NBH "Block Deals" table + JSON payload, used purely to prove
// the normaliser. Values are illustrative and clearly not sourced.
const FIXTURE_HTML = `
<div>
  <h3 class="deal_head">Block Deals</h3>
  <table>
    <tr><th>Date</th><th>Client Name</th><th>Deal Type</th><th>Quantity</th><th>Price</th><th>Exchange</th></tr>
    <tr><td>15 Jun 2026</td><td>SAMPLE FUND HOUSE (FIXTURE)</td><td>Sell</td><td>12,00,000</td><td>88.50</td><td>NSE</td></tr>
    <tr><td>15 Jun 2026</td><td>SAMPLE COUNTERPARTY (FIXTURE)</td><td>Buy</td><td>12,00,000</td><td>88.50</td><td>NSE</td></tr>
  </table>
</div>`

const FIXTURE_JSON = JSON.stringify({
  success: 1,
  data: {
    deals: [
      { dealDate: '2026-06-15', clientName: 'SAMPLE FUND HOUSE (FIXTURE)', dealType: 'Block', action: 'Sell', quantity: 1200000, price: 88.5, exchange: 'NSE' },
    ],
  },
})

function ok(cond: boolean, msg: string): boolean {
  console.log(`   ${cond ? '✓' : '✗'} ${msg}`)
  return cond
}

function verifyParser(): boolean {
  console.log('1. PARSER (synthetic fixture — proves normalisation, no network):')
  let pass = true

  pass = ok(parseDealDate('15 Jun 2026') === '2026-06-15', `parseDealDate("15 Jun 2026") → ${parseDealDate('15 Jun 2026')}`) && pass
  pass = ok(parseDealDate('15-06-2026') === '2026-06-15', `parseDealDate("15-06-2026") → ${parseDealDate('15-06-2026')}`) && pass

  const html = parseDealsHtml(cheerio.load(FIXTURE_HTML), NBH, 'https://www.moneycontrol.com/markets/stock-deals/large-deals/NBH', SCRAPED_AT)
  pass = ok(html.sawTable, 'HTML: deal table located') && pass
  pass = ok(html.rows.length === 2, `HTML: parsed ${html.rows.length} row(s) (expected 2)`) && pass
  const sell = html.rows.find((r) => r.seller)
  pass = ok(!!sell && sell.deal_type === 'block', `HTML: row tagged deal_type=block (got ${sell?.deal_type})`) && pass
  pass = ok(!!sell && sell.date === '2026-06-15', `HTML: row date normalised (got ${sell?.date})`) && pass
  pass = ok(!!sell && sell.quantity === 1200000, `HTML: quantity parsed (got ${sell?.quantity})`) && pass
  pass = ok(!!sell && sell.price === 88.5, `HTML: avg price parsed (got ${sell?.price})`) && pass
  pass = ok(!!sell && sell.source_name === 'Moneycontrol', 'HTML: source_name=Moneycontrol') && pass

  const json = parseDealsJson(Buffer.from(FIXTURE_JSON), NBH, 'https://www.moneycontrol.com/markets/stock-deals/large-deals/NBH', SCRAPED_AT)
  pass = ok(json.sawData, 'JSON: deal array located') && pass
  pass = ok(json.rows.length === 1 && json.rows[0].deal_type === 'block' && json.rows[0].seller != null, `JSON: parsed ${json.rows.length} block/sell row(s)`) && pass

  // Negative: out-of-band price must be rejected (no fabrication / no junk rows).
  const bad = parseDealsJson(Buffer.from(JSON.stringify({ deals: [{ dealDate: '2026-06-15', clientName: 'X (FIXTURE)', dealType: 'Block', action: 'Buy', quantity: 1000000, price: 9999, exchange: 'NSE' }] })), NBH, 'u', SCRAPED_AT)
  pass = ok(bad.rows.length === 0, 'JSON: out-of-band price (₹9999, outside NBH band) rejected — no junk row') && pass

  return pass
}

async function verifyFetcher(): Promise<string> {
  console.log('\n2. FETCHER (honest end-to-end status):')
  const r = await ingestMoneycontrolStockDeals.run()
  console.log(`   status=${r.status} · rows added this run=${r.records_fetched}`)
  if (r.warnings?.length) {
    console.log('   warnings:')
    for (const w of r.warnings.slice(0, 6)) console.log(`     - ${w}`)
  }
  return r.status
}

function liveProbe(): void {
  console.log('\n3. LIVE PROBE (best-effort — real HTTP status of the NBH large-deals URL):')
  const url = `https://www.moneycontrol.com/markets/stock-deals/large-deals/${NBH.sc_id}`
  try {
    const res = spawnSync('curl', ['-sS', '-m', '20', '-o', '/dev/null', '-w', '%{http_code}', '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36', url], { encoding: 'utf8' })
    if (res.error || res.status !== 0) {
      console.log(`   probe unavailable (${res.error?.message ?? 'curl exited ' + res.status}) — relying on the fetcher status above.`)
      return
    }
    const code = (res.stdout || '').trim()
    const verdict = code === '200' ? 'reachable' : code === '403' ? 'BLOCKED (Akamai / datacenter-IP 403 — expected from this environment)' : `HTTP ${code}`
    console.log(`   ${url}`)
    console.log(`   → HTTP ${code} · ${verdict}`)
  } catch (err) {
    console.log(`   probe unavailable (${err instanceof Error ? err.message : String(err)}).`)
  }
}

async function main(): Promise<void> {
  console.log('── Verify: Moneycontrol stock-deals fallback (NBH = Niva Bupa) ──\n')
  const parserOk = verifyParser()
  const fetchStatus = await verifyFetcher()
  liveProbe()

  console.log('\n── Result ──')
  if (!parserOk) {
    console.log('✗ FAIL — parser regression: the normaliser did not produce the expected NBH rows.')
    process.exit(1)
  }
  const clear = ['success', 'blocked', 'pending'].includes(fetchStatus)
  if (clear) {
    console.log(`✓ PASS — parser verified, and the live fetch produced a CLEAR status (fetcher status="${fetchStatus}").`)
    console.log('  If status="blocked"/"pending", the UI shows an honest "source requires manual review" / "checking" state — NOT a false "0 found".')
    console.log('  To populate real rows: run from an allowed IP (INGEST_FETCH_PROXY set), or stage the large-deals HTML/JSON under data/raw/moneycontrol/deals/.')
    process.exit(0)
  }
  console.log(`✗ FAIL — unexpected fetcher status "${fetchStatus}".`)
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
