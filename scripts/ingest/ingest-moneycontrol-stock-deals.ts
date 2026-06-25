// ---------------------------------------------------------------------------
//  Fetcher — Bulk / block / large deals for the listed SAHIs from Moneycontrol
//  → Markets → Stock Deals → Large Deals (per stock code, e.g. NBH = Niva Bupa:
//  /markets/stock-deals/large-deals/NBH).
//
//  This is the SECOND source behind Screener Trades for the Bulk / Block Deal
//  Timeline. Screener frequently omits a company's block deals (Niva Bupa shows
//  0 block deals on Screener even when the exchanges have reported some); this
//  fetcher fills that gap. The two feeds are normalised into the shared
//  bulk/block-deal row shape and merged + de-duped by the DATA LAYER at read
//  time — this script only writes the Moneycontrol snapshot.
//
//  OFFLINE-FIRST: live (INGEST_OFFLINE=0) fetches the large-deals page (and an
//  optional JSON endpoint); offline replays the most-recent staged file under
//  data/raw/moneycontrol/deals/. You can also stage a normalised JSON array of
//  deals there to populate by hand without any live access.
//
//  BLOCK-TOLERANT + HONEST: www.moneycontrol.com is Akamai-fronted and 403s
//  datacenter IPs. A blocked / failed / empty fetch NEVER fabricates rows and
//  NEVER blanks previously-captured ones — it records status='blocked' (or
//  'no_records' when the page was readable but held no deals) so the UI can show
//  an honest "source requires manual review" instead of a false "0 found".
//  ADD-ONLY across runs, de-duped by date+client+side+qty+price.
// ---------------------------------------------------------------------------

import * as cheerio from 'cheerio'
import type { Fetcher, FetchResult } from './types'
import type {
  MoneycontrolDealStatus,
  MoneycontrolStockDealsEnvelope,
  OwnershipTradeDisclosureRow,
  TradeDealType,
} from '../../src/data/snapshots/_schemas'
import { appendLog, detectAccessBlock, isOfflineMode, nowIso, readSnapshot, writeSnapshot } from './util'
import { fetchOrLoadRaw, loadStagedRaw } from './parsers'

const SOURCE_ID = 'moneycontrol_stock_deals'
const SOURCE_NAME = 'Moneycontrol stock deals (bulk / block / large)'
const PARSER_NAME = 'ingest-moneycontrol-stock-deals'
const SNAPSHOT_FILE = 'moneycontrol-stock-deals.json'
const RAW_SUBDIR = 'moneycontrol/deals'

// Listed SAHIs we pull Moneycontrol large-deals for. Keyed by Moneycontrol's
// stock code (scId) — Niva Bupa = NBH. The large-deals page is per stock code.
interface CompanyCfg {
  company_id: string
  company_name: string
  sc_id: string
  /** Plausible traded-price band (Rs/share) — a sanity gate, never fabrication. */
  lo: number
  hi: number
}
export const COMPANIES: CompanyCfg[] = [
  { company_id: 'niva-bupa', company_name: 'Niva Bupa Health Insurance Company Limited', sc_id: 'NBH', lo: 40, hi: 200 },
]

/** Page URL for a stock code's large deals (env-overridable per the established
 *  convention, so a corrected URL/endpoint can be set from CI without a code
 *  change once the first live run stages the real response). */
function dealsPageUrl(scId: string): string {
  return process.env[`MONEYCONTROL_DEALS_URL_${scId}`] ?? `https://www.moneycontrol.com/markets/stock-deals/large-deals/${scId}`
}
/** Optional JSON endpoint candidates (the feed behind the page's deals table).
 *  Tried in live mode; the first that yields deals wins. Override with
 *  MONEYCONTROL_DEALS_API_<scId> to pin the exact endpoint once known. */
function dealsApiUrls(scId: string): string[] {
  const override = process.env[`MONEYCONTROL_DEALS_API_${scId}`]
  if (override) return [override]
  return [
    `https://api.moneycontrol.com/mcapi/v1/stock/stock-deals?scId=${scId}&deviceType=W`,
    `https://api.moneycontrol.com/mcapi/v1/stock/deals?scId=${scId}&deviceType=W`,
  ]
}

// ─── normalisation helpers (shared by the HTML and JSON parsers) ─────────────

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

/** Parse the many date shapes Moneycontrol / exchanges print into ISO yyyy-mm-dd.
 *  Returns null (never a guess) when nothing matches. */
export function parseDealDate(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  // ISO already.
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  // DD-MMM-YYYY or DD MMM YYYY (e.g. 15 Jun 2026, 15-Jun-2026).
  m = s.match(/(\d{1,2})[\s/-]+([A-Za-z]{3,})[\s/-]+(\d{2,4})/)
  if (m) {
    const mm = MONTHS[m[2].slice(0, 3).toLowerCase()]
    if (mm) {
      const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
      return `${yyyy}-${mm}-${m[1].padStart(2, '0')}`
    }
  }
  // MMM DD, YYYY (e.g. Jun 15, 2026).
  m = s.match(/([A-Za-z]{3,})[\s.]+(\d{1,2}),?\s+(\d{4})/)
  if (m) {
    const mm = MONTHS[m[1].slice(0, 3).toLowerCase()]
    if (mm) return `${m[3]}-${mm}-${m[2].padStart(2, '0')}`
  }
  // DD-MM-YYYY or DD/MM/YYYY (day-first, the Indian convention).
  m = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (m) {
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${yyyy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

export function toQty(raw: string | number | null | undefined): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null
  const m = String(raw).replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Math.round(Number(m[0]))
  return Number.isFinite(n) ? n : null
}
export function toPrice(raw: string | number | null | undefined): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const m = String(raw).replace(/[,₹\s]/g, '').match(/\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/** bulk / block from any label or section hint — never guessed. Returns null
 *  when neither word is present (the row is then skipped, not mislabelled). */
export function normDealKind(...hints: (string | null | undefined)[]): TradeDealType | null {
  const s = hints.filter(Boolean).join(' ').toLowerCase()
  if (/\bblock\b/.test(s)) return 'block'
  if (/\bbulk\b/.test(s)) return 'bulk'
  return null
}
/** buy / sell from an action/transaction label. */
export function normSide(...hints: (string | null | undefined)[]): 'buy' | 'sell' | null {
  const s = hints.filter(Boolean).join(' ').toLowerCase()
  if (/\b(sell|sale|sold|s)\b/.test(s) && !/\bpurchase\b/.test(s)) return 'sell'
  if (/\b(buy|bought|purchase|purchased|acquire|acquired|b)\b/.test(s)) return 'buy'
  if (/\bsell|sale|sold\b/.test(s)) return 'sell'
  return null
}
export function normExchange(...hints: (string | null | undefined)[]): string {
  const s = hints.filter(Boolean).join(' ').toLowerCase()
  const nse = /\bnse\b/.test(s)
  const bse = /\bbse\b/.test(s)
  if (nse && bse) return 'NSE / BSE'
  if (nse) return 'NSE'
  if (bse) return 'BSE'
  return 'NSE / BSE'
}

const qtyDisplay = (q: number | null): string => {
  if (q == null) return 'n/a'
  if (q >= 1e7) return `${(q / 1e7).toFixed(2)} Cr`
  if (q >= 1e5) return `${(q / 1e5).toFixed(1)} L`
  return q.toLocaleString('en-IN')
}
const valueCr = (q: number | null, p: number | null): number | null =>
  q != null && p != null ? Math.round((q * p) / 1e7 * 100) / 100 : null
const valueDisplay = (cr: number | null): string => {
  if (cr == null) return 'n/a'
  const a = Math.abs(cr)
  return `₹${a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2)} Cr`
}

interface RawDeal {
  date: string | null
  client: string | null
  kind: TradeDealType | null
  side: 'buy' | 'sell' | null
  quantity: number | null
  price: number | null
  exchange: string
  rawLabel: string
}

/** Turn a raw, signal-extracted deal into a normalised row — or null when a
 *  required field is missing / out of band. Nothing is invented. */
function toRow(co: CompanyCfg, d: RawDeal, sourceUrl: string, scrapedAt: string): OwnershipTradeDisclosureRow | null {
  if (!d.date || !d.client || !d.kind || !d.side) return null
  if (!d.quantity || d.quantity < 100) return null
  if (d.price == null || d.price < co.lo || d.price > co.hi) return null
  const client = d.client.replace(/\s+/g, ' ').trim()
  if (client.length < 2) return null
  const cr = valueCr(d.quantity, d.price)
  return {
    company_id: co.company_id,
    company_name: co.company_name,
    deal_type: d.kind,
    date: d.date,
    segment: d.kind === 'block' ? 'Block' : 'Bulk',
    buyer: d.side === 'buy' ? client : null,
    seller: d.side === 'sell' ? client : null,
    quantity: d.quantity,
    quantity_display: qtyDisplay(d.quantity),
    price: d.price,
    value_cr: cr,
    value_display: valueDisplay(cr),
    exchange_source: d.exchange,
    source_name: 'Moneycontrol',
    source_url: sourceUrl,
    underlying_source: 'NSE / BSE',
    scraped_at: scrapedAt,
    validation_status: 'scraped',
    source_deal_label: d.rawLabel || (d.kind === 'block' ? 'Block Deal' : 'Bulk Deal'),
  }
}

// ─── HTML parsing (generic, layout-tolerant) ─────────────────────────────────

const DATE_CELL = /\d{1,2}[\s/-]+(?:[A-Za-z]{3,}|\d{1,2})[\s/-]+\d{2,4}|\d{4}-\d{2}-\d{2}/

/** Parse Moneycontrol's large-deals tables. Each table is classified bulk/block
 *  from its own caption / nearest preceding heading (MC splits the two), and
 *  every data row is read by scanning its cells for the deal signals — so it
 *  survives column re-ordering. Header-named columns are used when present. */
export function parseDealsHtml($: cheerio.CheerioAPI, co: CompanyCfg, sourceUrl: string, scrapedAt: string): { rows: OwnershipTradeDisclosureRow[]; sawTable: boolean } {
  const rows: OwnershipTradeDisclosureRow[] = []
  let sawTable = false

  $('table').each((_, table) => {
    const $t = $(table)
    const dataRows = $t.find('tr').filter((__, tr) => $(tr).find('td').length >= 3)
    if (dataRows.length === 0) return
    sawTable = true

    // Section hint for bulk/block: the table's caption or the nearest heading
    // text before it.
    const caption = $t.find('caption').first().text()
    const prevHeading = $t.prevAll('h1,h2,h3,h4,.tbldata_hd,.PT10,.deal_head').first().text()
    const sectionKind = normDealKind(caption, prevHeading, $t.attr('id'), $t.attr('class'))

    // Optional header-named columns (used to pick the client column when several
    // text cells exist).
    const headerCells = $t.find('tr').first().find('th,td').map((__, c) => $(c).text().trim().toLowerCase()).get()
    const findCol = (re: RegExp) => headerCells.findIndex((h) => re.test(h))
    const iClient = findCol(/client|investor|party|entity|acquir|holder|name/)

    dataRows.each((__, tr) => {
      const cells = $(tr).find('td').map((___, c) => $(c).text().replace(/\s+/g, ' ').trim()).get()
      if (cells.length < 3) return
      const joined = cells.join(' | ')
      // Skip header-ish / total rows.
      if (/^\s*(date|client|deal\s*type|quantity)\b/i.test(cells[0] ?? '') || /\btotal\b/i.test(joined)) return

      const dateCell = cells.find((c) => DATE_CELL.test(c)) ?? null
      const date = parseDealDate(dateCell)

      // qty = integer-only cell (>=100, no decimal); price = a decimal cell.
      let quantity: number | null = null
      let price: number | null = null
      for (const c of cells) {
        const compact = c.replace(/[,₹\s]/g, '')
        if (/^\d+\.\d+$/.test(compact)) { if (price == null) price = toPrice(c) }
        else if (/^\d{3,}$/.test(compact)) { const q = toQty(c); if (q != null && (quantity == null || q > quantity)) quantity = q }
      }

      const side = normSide(joined)
      const kind = sectionKind ?? normDealKind(joined)
      const exchange = normExchange(joined)

      // Client = the header-named column if present, else the longest mostly-
      // alphabetic cell that isn't the date / a number / an action token.
      const isNoise = (c: string) =>
        !c || c === dateCell || /^\d/.test(c.replace(/[,₹.\s]/g, '')) ||
        /^(buy|sell|sale|purchase|bulk|block|nse|bse|n|b|s)$/i.test(c)
      let client: string | null = iClient >= 0 ? cells[iClient] ?? null : null
      if (!client || isNoise(client)) {
        client = cells
          .filter((c) => !isNoise(c) && /[A-Za-z]{3,}/.test(c))
          .sort((a, b) => b.length - a.length)[0] ?? null
      }

      const row = toRow(co, { date, client, kind, side, quantity, price, exchange, rawLabel: (sectionKind ? `${sectionKind} Deal` : '') }, sourceUrl, scrapedAt)
      if (row) rows.push(row)
    })
  })

  return { rows, sawTable }
}

// ─── JSON parsing (API feed or hand-staged normalised array) ─────────────────

function get(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of Object.keys(obj)) {
    const lk = k.toLowerCase().replace(/[_\s-]/g, '')
    if (keys.some((want) => lk === want || lk.includes(want))) return obj[k]
  }
  return undefined
}

/** Find the first array of deal-like objects anywhere in a JSON payload. */
function findDealArray(node: unknown, depth = 0): Record<string, unknown>[] | null {
  if (depth > 6 || node == null || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    const objs = node.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
    if (objs.length && objs.some((o) => get(o, 'date', 'dealdate', 'tradedate') != null && (get(o, 'client', 'name', 'party', 'investor') != null))) return objs
    for (const x of node) { const r = findDealArray(x, depth + 1); if (r) return r }
    return null
  }
  for (const v of Object.values(node as Record<string, unknown>)) {
    const r = findDealArray(v, depth + 1)
    if (r) return r
  }
  return null
}

export function parseDealsJson(buffer: Buffer, co: CompanyCfg, sourceUrl: string, scrapedAt: string): { rows: OwnershipTradeDisclosureRow[]; sawData: boolean } {
  let j: unknown
  try { j = JSON.parse(buffer.toString('utf8')) } catch { return { rows: [], sawData: false } }
  const arr = findDealArray(j)
  if (!arr) return { rows: [], sawData: false }
  const rows: OwnershipTradeDisclosureRow[] = []
  for (const o of arr) {
    const dealTypeVal = String(get(o, 'dealtype', 'type', 'segment', 'category') ?? '')
    const actionVal = String(get(o, 'action', 'buysell', 'transactiontype', 'side', 'transtype') ?? '')
    const row = toRow(co, {
      date: parseDealDate(String(get(o, 'date', 'dealdate', 'tradedate') ?? '')),
      client: (get(o, 'client', 'clientname', 'name', 'party', 'investor') as string | undefined)?.toString() ?? null,
      // Either field can carry the bulk/block tag or the buy/sell action.
      kind: normDealKind(dealTypeVal, actionVal),
      side: normSide(actionVal, dealTypeVal),
      quantity: toQty(get(o, 'quantity', 'qty', 'noofshares', 'shares', 'volume') as string | number | undefined),
      price: toPrice(get(o, 'price', 'avgprice', 'tradeprice', 'wap', 'rate', 'weightedaverageprice') as string | number | undefined),
      exchange: normExchange(String(get(o, 'exchange', 'exch', 'market') ?? '')),
      rawLabel: dealTypeVal,
    }, sourceUrl, scrapedAt)
    if (row) rows.push(row)
  }
  return { rows, sawData: true }
}

// ─── add-only de-dup (within the Moneycontrol snapshot, across runs) ─────────

export const keyOf = (d: OwnershipTradeDisclosureRow): string =>
  [d.company_id, d.deal_type, d.date, (d.buyer ?? d.seller ?? '').toLowerCase().replace(/\s+/g, ' ').trim(),
    d.buyer ? 'buy' : 'sell', d.quantity ?? '', d.price ?? ''].join('::')

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
function isBlockErr(msg: string): boolean {
  return /\b(401|403|429)\b/i.test(msg) || /access denied|forbidden|blocked|cloudflare|captcha/i.test(msg)
}

// ─── orchestration ───────────────────────────────────────────────────────────

export const ingestMoneycontrolStockDeals: Fetcher = {
  source_id: SOURCE_ID,
  name: SOURCE_NAME,
  frequency: 'daily',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const date = fetched_at.slice(0, 10)
    const warnings: string[] = []
    // Live (INGEST_OFFLINE=0): a fetch failure means we ATTEMPTED the source and
    // couldn't read it → 'blocked' (manual review). Offline with no staged file
    // means we never attempted → 'pending'. This keeps the status honest.
    const offline = isOfflineMode()

    // Existing rows are preserved (add-only) — a blocked run never blanks them.
    let existing: OwnershipTradeDisclosureRow[] = []
    let prevMeta: MoneycontrolStockDealsEnvelope['_meta'] | null = null
    try {
      const snap = await readSnapshot<MoneycontrolStockDealsEnvelope>(SNAPSHOT_FILE)
      existing = snap.data ?? []
      prevMeta = snap._meta
    } catch { /* first run — seed will be written below */ }

    const seen = new Set(existing.map(keyOf))
    const all = [...existing]
    let added = 0
    let anyReadable = false // we successfully READ a source (page/JSON), block or not
    let anyBlocked = false
    let sawAnyTable = false
    // The large-deals PAGE is the authoritative source. An empty API response is
    // NOT confirmation of "no deals"; only a readable PAGE confirms a clean zero,
    // and a blocked PAGE forces 'blocked' regardless of what the APIs returned.
    let pageReadable = false
    let pageBlocked = false

    for (const co of COMPANIES) {
      const pageUrl = dealsPageUrl(co.sc_id)

      // 1. A hand-staged normalised JSON (the simplest manual unblock) wins.
      try {
        const staged = await loadStagedRaw(RAW_SUBDIR, new RegExp(`${co.sc_id}.*\\.json$`, 'i'))
        if (staged) {
          const { rows, sawData } = parseDealsJson(staged.buffer, co, pageUrl, fetched_at)
          if (sawData) { anyReadable = true; addRows(rows) }
        }
      } catch (err) { warnings.push(`${co.sc_id} staged JSON: ${errMsg(err)}`) }

      // 2. Live JSON endpoint candidates (offline: a staged *.json in the subdir).
      for (const apiUrl of dealsApiUrls(co.sc_id)) {
        try {
          const { buffer, mode } = await fetchOrLoadRaw(apiUrl, RAW_SUBDIR, `${co.sc_id}-deals-${date}.json`, /\.json$/i)
          const blk = detectAccessBlock(buffer, apiUrl)
          if (blk.blocked) { anyBlocked = true; warnings.push(`${co.sc_id} API blocked: ${blk.reason}`); continue }
          const { rows, sawData } = parseDealsJson(buffer, co, pageUrl, fetched_at)
          await appendLog(`${PARSER_NAME}.log`, { source: 'api', scId: co.sc_id, mode, rows: rows.length })
          if (sawData) { anyReadable = true; if (rows.length) { addRows(rows); break } }
        } catch (err) {
          const msg = errMsg(err); anyBlocked = anyBlocked || (!offline) || isBlockErr(msg)
          warnings.push(`${co.sc_id} API ${apiUrl}: ${msg}`)
        }
      }

      // 3. The large-deals HTML page (offline: a staged *.html in the subdir).
      try {
        const { buffer, mode } = await fetchOrLoadRaw(pageUrl, RAW_SUBDIR, `${co.sc_id}-large-deals-${date}.html`, /\.html?$/i)
        const blk = detectAccessBlock(buffer, pageUrl)
        if (blk.blocked) {
          anyBlocked = true
          pageBlocked = true
          warnings.push(`${co.sc_id} page blocked: ${blk.reason}`)
        } else {
          const { rows, sawTable } = parseDealsHtml(cheerio.load(buffer.toString('utf8')), co, pageUrl, fetched_at)
          sawAnyTable = sawAnyTable || sawTable
          anyReadable = true
          pageReadable = true
          addRows(rows)
          await appendLog(`${PARSER_NAME}.log`, { source: 'html', scId: co.sc_id, mode, sawTable, rows: rows.length })
          if (sawTable && rows.length === 0) warnings.push(`${co.sc_id} page read but no deal rows parsed (DOM may have changed).`)
        }
      } catch (err) {
        const msg = errMsg(err); anyBlocked = anyBlocked || (!offline) || isBlockErr(msg)
        // A live page fetch that failed = the authoritative source was unreadable.
        pageBlocked = pageBlocked || (!offline) || isBlockErr(msg)
        warnings.push(`${co.sc_id} page ${pageUrl}: ${msg}`)
      }
    }

    function addRows(rows: OwnershipTradeDisclosureRow[]): void {
      for (const r of rows) {
        const k = keyOf(r)
        if (seen.has(k)) continue
        seen.add(k); all.push(r); added += 1
      }
    }

    all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.value_cr ?? 0) - (a.value_cr ?? 0)))

    // Honest status: rows on record → ready; readable but none parseable → either
    // no_records (a clean page) or parse_warning (a table we couldn't read);
    // nothing readable → blocked (couldn't reach the source at all) or pending.
    let status: MoneycontrolDealStatus
    let status_detail: string | null = null
    if (all.length > 0) {
      status = 'ready'
    } else if (pageBlocked) {
      // Authoritative page blocked → NEVER a confirmed zero, even if an API
      // endpoint returned an empty 200.
      status = 'blocked'
      status_detail = 'Moneycontrol large-deals page blocked (e.g. Akamai 403 from a datacenter IP) — source requires manual review. Set INGEST_FETCH_PROXY to an in-region relay, or stage the large-deals HTML/JSON under data/raw/moneycontrol/deals/.'
    } else if (pageReadable && sawAnyTable) {
      status = 'parse_warning'
      status_detail = 'Moneycontrol page was read but no deal rows could be parsed — the table layout may have changed; source requires manual review.'
    } else if (pageReadable) {
      status = 'no_records'
      status_detail = 'Moneycontrol large-deals page was read and reported no bulk/block/large deals for the configured stock code(s).'
    } else if (anyReadable) {
      // Only a staged file / API export was readable (page not attempted) — a
      // real Moneycontrol export with no rows.
      status = 'no_records'
      status_detail = 'A staged Moneycontrol export was read and reported no bulk/block/large deals for the configured stock code(s).'
    } else if (anyBlocked) {
      status = 'blocked'
      status_detail = 'Moneycontrol fetch blocked (e.g. Akamai 403 from a datacenter IP) or the parser could not read it — source requires manual review. Set INGEST_FETCH_PROXY to an in-region relay, or stage the large-deals HTML/JSON under data/raw/moneycontrol/deals/.'
    } else {
      status = 'pending'
      status_detail = 'Not fetched this run (offline with no staged file). Run with INGEST_OFFLINE=0 or stage a file under data/raw/moneycontrol/deals/.'
    }

    const envelope: MoneycontrolStockDealsEnvelope = {
      _meta: {
        snapshot_id: 'moneycontrol-stock-deals',
        description: prevMeta?.description ??
          'Bulk / block / large deals for the listed SAHIs from Moneycontrol → Markets → Stock Deals → Large Deals. Fallback / second source behind Screener Trades for the Bulk / Block Deal Timeline; merged + de-duped at read-time. Never fabricated.',
        schema_version: '1.0.0',
        source_name: 'Moneycontrol',
        source_section: 'Markets / Stock Deals / Large Deals',
        source_url: dealsPageUrl(COMPANIES[0].sc_id),
        underlying_source: 'NSE / BSE',
        dataset: 'official',
        last_updated: added > 0 ? date : prevMeta?.last_updated ?? null,
        last_successful_run: status === 'ready' || status === 'no_records' ? fetched_at : prevMeta?.last_successful_run ?? null,
        scraped_at: fetched_at,
        parser_status: status === 'ready' || status === 'no_records' ? 'ready' : status === 'blocked' ? 'blocked' : status === 'pending' ? 'pending' : 'manual_fallback',
        status,
        status_detail,
        symbols_checked: COMPANIES.map((c) => c.sc_id),
        notes: 'Niva Bupa stock code on Moneycontrol = NBH. www.moneycontrol.com is Akamai-fronted and 403s datacenter IPs; the API host (api.moneycontrol.com) is reachable but the exact stock-deals endpoint may need pinning via MONEYCONTROL_DEALS_API_NBH. Staging the large-deals HTML/JSON under data/raw/moneycontrol/deals/ populates it offline.',
      },
      data: all,
    }
    await writeSnapshot(SNAPSHOT_FILE, envelope)

    const onRecord = { bulk: all.filter((d) => d.deal_type === 'bulk').length, block: all.filter((d) => d.deal_type === 'block').length }
    await appendLog(`${PARSER_NAME}.log`, { event: 'run', status, added, total: all.length, bulk: onRecord.bulk, block: onRecord.block, blocked: anyBlocked, readable: anyReadable })

    const fetchStatus: FetchResult['status'] = status === 'ready' || status === 'no_records' ? 'success' : status === 'blocked' ? 'blocked' : 'pending'
    return {
      source_id: SOURCE_ID,
      status: fetchStatus,
      raw_file: null,
      records: [],
      records_fetched: added,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

// Allow `tsx scripts/ingest/ingest-moneycontrol-stock-deals.ts` to run standalone.
import { pathToFileURL } from 'node:url'
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestMoneycontrolStockDeals
    .run()
    .then((r) => {
      console.log(`moneycontrol-stock-deals: status=${r.status}, added=${r.records_fetched}` + (r.warnings ? `\n  warnings:\n   - ${r.warnings.join('\n   - ')}` : ''))
      process.exit(0)
    })
    .catch((err) => { console.error(err); process.exit(1) })
}
