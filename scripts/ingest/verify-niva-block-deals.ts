// ---------------------------------------------------------------------------
//  Verification — Niva Bupa BLOCK DEALS (Screener Trades modal → Block Deals tab).
//
//  Proves the fix end-to-end:
//    1. PARSER (network-free): a row read from the Block Deals tab is classified
//       `block` even though its text never says "block", with action normalised
//       (B → buy, Sale → sell) and the date's day NOT mistaken for the quantity.
//    2. DATA LAYER: getTradeDisclosures('niva-bupa') surfaces the 15 Jun 2026
//       block rows with the right person / action / quantity / price / value, the
//       Screener source, and block_deal_count = 4 — and a Moneycontrol "no records"
//       result never suppresses them.
//
//  Exit 0 when every assertion holds; exit 1 on any regression.
//
//  Run:  npm run verify:niva-block-deals
// ---------------------------------------------------------------------------

import { parseScreenerTradeRow, normTradeSide, COMPANIES } from './fetch-screener-shareholding'
import { getTradeDisclosures } from '../../src/lib/dataLayer'

let failures = 0
const ok = (cond: boolean, msg: string) => { console.log(`   ${cond ? '✓' : '✗ FAIL —'} ${msg}`); if (!cond) failures++ }
const round2 = (n: number) => Math.round(n * 100) / 100

console.log('\n══════════════════════════════════════════════════════════════════')
console.log('  VERIFY — Niva Bupa block deals (Screener Trades modal → Block Deals tab)')
console.log('══════════════════════════════════════════════════════════════════')

// ── 1. PARSER: Block-tab classification + normalisation (network-free) ─────────
console.log('\n  1. Parser — Block Deals tab row → classified `block`, action normalised')
const niva = COMPANIES.find((c) => c.company_id === 'niva-bupa')!
// Cells exactly as Screener's Block Deals tab prints them: Name | Date | Type | Qty | Price.
const krishnan = parseScreenerTradeRow(['Krishnan Ramachandran', '15 Jun 2026', 'Sale', '40,00,000', '83.00'], 'Block Deals', niva)
const hsbc = parseScreenerTradeRow(['Hsbc Global Investment Funds Indian Equity', '15 Jun 2026', 'B', '21,35,355', '83.00'], 'Block Deals', niva)
ok(!!krishnan, 'parsed the "Sale" row')
ok(krishnan?.deal_kind === 'block', 'Block Deals tab → deal_kind="block" (even though the row text never says "block")')
ok(krishnan?.side === 'sell', 'action "Sale" normalised → sell')
ok(krishnan?.quantity === 4000000, `quantity 40,00,000 → 4000000 (got ${krishnan?.quantity}; date day NOT read as qty)`)
ok(krishnan?.price === 83, `price → 83 (got ${krishnan?.price})`)
ok(krishnan?.date === '2026-06-15', `date "15 Jun 2026" → 2026-06-15 (got ${krishnan?.date})`)
ok(round2((krishnan!.quantity * krishnan!.price) / 1e7) === 33.2, 'dealValueCr = 40,00,000 × 83 / 1e7 = 33.2 Cr')
ok(hsbc?.side === 'buy', 'action "B" normalised → buy')
ok(normTradeSide('B') === 'buy' && normTradeSide('Sale') === 'sell' && normTradeSide('S') === 'sell', 'normTradeSide: B→buy, Sale→sell, S→sell')

// ── 2. DATA LAYER: the dashboard view actually shows the 4 block deals ─────────
console.log('\n  2. Data layer — getTradeDisclosures("niva-bupa") surfaces the block deals')
const v = getTradeDisclosures('niva-bupa')
const block = v.deals.filter((d) => d.deal_type === 'block')
ok(v.summary.block_deal_count === 4, `block_deal_count = 4 (got ${v.summary.block_deal_count}) — no longer zero`)
ok(block.length === 4, `4 block rows on record (got ${block.length})`)

const kr = block.find((d) => (d.seller ?? '').toLowerCase().includes('krishnan'))
ok(!!kr, 'Krishnan Ramachandran block row present')
ok(kr?.date === '2026-06-15', `  date = 2026-06-15 (got ${kr?.date})`)
ok(kr?.seller === 'Krishnan Ramachandran' && kr?.buyer === null, '  action Sale → seller set, buyer null')
ok(kr?.quantity === 4000000 && kr?.price === 83, `  qty 4000000 @ ₹83 (got ${kr?.quantity} @ ${kr?.price})`)
ok(kr?.value_cr === 33.2, `  value = ₹33.2 Cr (got ₹${kr?.value_cr} Cr)`)
ok((kr?.sources ?? [kr?.source_name as string]).includes('Screener'), '  source = Screener Trades')
ok(kr?.source_tab === 'Block Deals', `  source_tab = "Block Deals" (got ${kr?.source_tab})`)

const hsbcBuys = block.filter((d) => (d.buyer ?? '').toLowerCase().startsWith('hsbc'))
ok(hsbcBuys.length === 3, `3 HSBC buy rows (got ${hsbcBuys.length})`)
ok(hsbcBuys.every((d) => d.buyer && !d.seller), '  all HSBC rows action B → buyer set, seller null')

// ── 3. A Moneycontrol "no records" must NOT erase Screener's block rows ────────
console.log('\n  3. Source priority — Moneycontrol "no records" never overrides Screener')
const mc = v.sources.find((s) => s.name === 'Moneycontrol')
ok(block.length > 0, 'block deals present regardless of the Moneycontrol direct status')
ok(v.moneycontrolChecked === true, 'Moneycontrol counted as checked (read or agent-confirmed)')
console.log(`     (Moneycontrol direct status: ${mc?.state ?? 'n/a'} · Screener block deals: ${block.length})`)

console.log('\n══════════════════════════════════════════════════════════════════')
console.log(`  RESULT: ${failures === 0 ? 'PASS — all assertions hold ✓' : `FAIL — ${failures} assertion(s) failed ✗`}`)
console.log('══════════════════════════════════════════════════════════════════\n')
process.exitCode = failures === 0 ? 0 : 1
