// ---------------------------------------------------------------------------
//  Bulk / Block deals — auto-refresh agent (muns chat agent, web search).
//
//  Keeps the Governance tab's Bulk / Block Deal Timeline current with NO manual
//  work. NSE & BSE publish bulk and block deals each trading day; this agent
//  pulls the latest deals for the LISTED insurers (Niva Bupa, Star Health) from
//  the authentic exchange disclosures (also surfaced on Screener) and appends
//  genuinely-new ones.
//
//  ADD-ONLY: a deal already on record (same date+client+side+quantity) is never
//  duplicated; out-of-bounds / unsourced rows are dropped, never fabricated. A
//  no-token / failed run leaves the file untouched. Token: MUNS_API_TOKEN.
// ---------------------------------------------------------------------------

import { writeSnapshot, readSnapshot, nowIso, appendLog } from './util'

const SNAPSHOT_FILE = 'bulk-block-deals-snapshot.json'
const API_URL = process.env.MUNS_AGENT_URL || 'https://devde.muns.io/chat/chat-muns'
const API_TIMEOUT_MS = 600_000

// ticker (as the agent will say it) → company_id, with a plausible price band (Rs)
const COMPANIES: Record<string, { id: string; lo: number; hi: number }> = {
  nivabupa: { id: 'niva-bupa', lo: 40, hi: 200 },
  'niva bupa': { id: 'niva-bupa', lo: 40, hi: 200 },
  starhealth: { id: 'star-health', lo: 250, hi: 900 },
  'star health': { id: 'star-health', lo: 250, hi: 900 },
}

interface Deal {
  company_id: string
  deal_kind: 'bulk' | 'block'
  date: string
  client: string
  side: 'buy' | 'sell'
  quantity: number
  price: number
}
interface Snapshot {
  _meta: Record<string, unknown>
  data: Deal[]
}

function buildPayload() {
  return {
    user_index: 124,
    tasks: [
      'List the most recent EXCHANGE-REPORTED bulk deals AND block deals for these two listed Indian health insurers: Niva Bupa (NSE: NIVABUPA) and Star Health (NSE: STARHEALTH). Use ONLY the official NSE / BSE bulk & block deal disclosures (also shown on screener.in). Cover roughly the last 6 months. If there are none, return nothing — never invent a deal.\n\n' +
        'IMPORTANT: bulk deals and block deals are published in SEPARATE tables (both on NSE/BSE and on screener.in). Check BOTH tables and return EVERY row from EACH. Block deals are easy to miss — do NOT omit them: if a company has block deals, include every one, tagged deal_kind="block".\n\n' +
        'Return ONLY a pipe-delimited table, no leading/trailing pipe, EXACTLY these columns:\n\n' +
        'company | deal_kind | date | client | side | quantity | price\n\n' +
        'company  = "NIVABUPA" or "STARHEALTH".\n' +
        'deal_kind = "bulk" or "block" — tag rows from the block-deals table as "block" and rows from the bulk-deals table as "bulk".\n' +
        'date     = the deal date as YYYY-MM-DD.\n' +
        'client   = the client / entity name exactly as the exchange prints it.\n' +
        'side     = "buy" or "sell".\n' +
        'quantity = number of SHARES (digits only, no commas).\n' +
        'price    = traded price in Rs per share (number).\n' +
        'One row per deal. Newest first.',
    ],
    query_context: {
      TICKER_SYMBOL: ['NIVABUPA', 'STARHEALTH'],
      ANNOUNCEMENT_FORM_TYPE: 'all',
      DOCUMENT_IDS: [],
      CATEGORIES: [],
      WEB_SEARCH_ENABLED: true,
      COUNTRY: [],
      CONTEXT_EMAIL: 'nadamsaluja@gmail.com',
      CONTEXT_COMPANY_NAME: [],
      GET_ANNOUNCEMENTS_ENABLED: true,
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

const extractAnswer = (t: string) => t.match(/<ans>([\s\S]*?)<\/ans>/)?.[1] ?? t
const clean = (s: string | undefined) => (s ?? '').replace(/^["'\s]+|["'\s]+$/g, '').trim()
const numOf = (s: string): number | null => {
  const m = s.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  const n = m ? Number(m[0]) : NaN
  return Number.isFinite(n) ? n : null
}
// Identity for ADD-ONLY de-dup. deal_kind is part of the key so a BLOCK deal is
// never silently dropped as a "duplicate" of a BULK deal that happens to share
// the same date/client/side/quantity — the two segments are kept distinct.
export const keyOf = (d: Deal) => `${d.company_id}::${d.deal_kind}::${d.date}::${d.client.toLowerCase().replace(/\s+/g, ' ').trim()}::${d.side}::${d.quantity}`

export function parseDeals(answer: string): Deal[] {
  const out: Deal[] = []
  for (const line of answer.split('\n')) {
    if (!line.includes('|')) continue
    const cells = line.split('|').map(clean)
    while (cells.length && cells[0] === '') cells.shift()
    while (cells.length && cells[cells.length - 1] === '') cells.pop()
    if (cells.length < 7) continue
    if (/^company$/i.test(cells[0]) || /^-+$/.test(cells[1] ?? '')) continue
    const co = COMPANIES[clean(cells[0]).toLowerCase()]
    if (!co) continue
    const deal_kind = /block/i.test(cells[1]) ? 'block' : 'bulk'
    const date = clean(cells[2]).match(/\d{4}-\d{2}-\d{2}/)?.[0]
    if (!date) continue
    const client = clean(cells[3])
    if (!client || client.length < 2) continue
    const side = /sell|^s$/i.test(cells[4]) ? 'sell' : /buy|^b$/i.test(cells[4]) ? 'buy' : null
    if (!side) continue
    const quantity = numOf(cells[5])
    const price = numOf(cells[6])
    if (quantity == null || price == null) continue
    // Sanity gate: real share counts + a plausible price band per company.
    if (quantity < 1_000 || quantity > 1_000_000_000) continue
    if (price < co.lo || price > co.hi) continue
    out.push({ company_id: co.id, deal_kind, date, client, side, quantity, price })
  }
  return out
}

export async function main(): Promise<number> {
  const fetched_at = nowIso()
  const today = fetched_at.slice(0, 10)
  const token = (process.env.MUNS_API_TOKEN || '').trim()

  const snap = await readSnapshot<Snapshot>(SNAPSHOT_FILE)
  const deals = snap.data ?? []
  const seen = new Set(deals.map(keyOf))
  const prevSuccessRun = (snap._meta?.last_successful_run as string) ?? null
  let added = 0
  let pullSucceeded = false

  if (!token) {
    console.warn('MUNS_API_TOKEN not set — preserving the existing deals (no fresh pull this run).')
  } else {
    console.log('Calling chat-muns agent for the latest bulk / block deals ...')
    try {
      const parsed = parseDeals(extractAnswer(await callAgent(token)))
      pullSucceeded = true
      console.log(`Parsed ${parsed.length} candidate deal(s).`)
      for (const d of parsed) {
        const k = keyOf(d)
        if (seen.has(k)) continue // ADD-ONLY — never duplicate an existing deal
        seen.add(k)
        deals.push(d)
        added += 1
        console.log(`  + ${d.company_id} ${d.date} ${d.client} ${d.side} ${d.quantity} @ ${d.price}`)
      }
    } catch (err) {
      console.error(`agent pull failed (deals preserved): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  deals.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.quantity - a.quantity))
  snap.data = deals
  snap._meta = {
    ...snap._meta,
    last_updated: added > 0 ? today : (snap._meta?.last_updated as string) ?? today,
    last_successful_run: pullSucceeded ? fetched_at : prevSuccessRun,
  }

  await writeSnapshot(SNAPSHOT_FILE, snap)
  // Per-segment counts so a run that captures no block deals is visible at a glance.
  const onRecord = { bulk: deals.filter((d) => d.deal_kind === 'bulk').length, block: deals.filter((d) => d.deal_kind === 'block').length }
  await appendLog('bulk-block-deals-agent.log', { added, total: deals.length, bulk: onRecord.bulk, block: onRecord.block, had_token: !!token })
  console.log(`bulk-block-deals: ${added} new deal(s) this run; ${deals.length} on record (${onRecord.bulk} bulk, ${onRecord.block} block).`)
  return 0
}

import { pathToFileURL } from 'node:url'
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
