// ---------------------------------------------------------------------------
//  Fetcher — muns market-data API (PRIMARY daily price/volume source).
//
//  fastapi.muns.io/market_data is muns' own India-capable stock-data service.
//  It doesn't return the full series inline — it saves a CSV server-side and
//  returns a TRUNCATED "Sample Data Preview" (a couple of head + tail rows, with
//  "…" in the middle). For a SMALL window (≤4 trading days) nothing is truncated,
//  so we walk the requested range in tiny windows and stitch the rows together.
//  That fills the gap on the first run AND advances the series every day after —
//  the automation keeps the Historical Stock Movement tab current on its own.
//
//  Reachable from CI (the sandbox can't egress). Writes THROUGH price-history-
//  store, so it merges with — never clobbers — the workbook seed / Yahoo / NSE.
//  A field the preview doesn't carry (deliverable quantity) stays null, never 0.
//
//    INGEST_OFFLINE=0 npm run ingest:price:muns       # live (CI)
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult } from './types'
import { appendLog, isOfflineMode, nowIso } from './util'
import { loadPriceHistory, mergePriceRows, savePriceHistory, type PriceRow } from './price-history-store'

const SOURCE_ID = 'muns_market_data'
const PARSER_NAME = 'fetch-muns-market-data'
const API_BASE = 'https://fastapi.muns.io/market_data'

// Listed insurers and their NSE tickers (country=India handles the exchange).
const TICKERS: Array<{ company_id: string; ticker: string }> = [
  { company_id: 'niva-bupa', ticker: 'NIVABUPA' },
  { company_id: 'star-health', ticker: 'STARHEALTH' },
  { company_id: 'icici-lombard', ticker: 'ICICIGI' },
  { company_id: 'godigit', ticker: 'GODIGIT' },
]

// A 4-calendar-day window spans at most 4 trading days, so the preview shows
// every row (no "…"). The walk steps by this much.
const WINDOW_DAYS = Number(process.env.MUNS_WINDOW_DAYS ?? 4)
// Safety cap on windows per ticker per run (≈ how far back one run will backfill).
const MAX_WINDOWS = Number(process.env.MUNS_MAX_WINDOWS ?? 160)
// Earliest date to ever request when a ticker has no stored history yet.
const FLOOR_START = process.env.MUNS_START ?? '2024-11-01'
// For peers that aren't the focal insurer and have no history yet, only keep
// recent data current (full backfill isn't needed for the Comps sheet).
const PEER_LOOKBACK_DAYS = 35
const FOCAL = 'niva-bupa'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const isoOf = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => isoOf(new Date(Date.parse(iso + 'T00:00:00Z') + n * 86_400_000))

type Rec = Record<string, unknown>

/** Parse the API's "Sample Data Preview" table (pipe-delimited rows under a
 *  Date/Open/High/Low/Close/Volume header). Also tolerant of a CSV/JSON body. */
export function parseMunsBody(text: string): Rec[] {
  const t = text.trim()
  // JSON (in case the endpoint ever returns it directly).
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const j = JSON.parse(t)
      if (Array.isArray(j)) return j as Rec[]
      for (const k of ['data', 'result', 'records', 'history', 'prices']) {
        if (Array.isArray((j as Rec)[k])) return (j as Rec)[k] as Rec[]
      }
    } catch { /* fall through */ }
  }
  // Table form (preview or CSV): locate the header row, then read data rows.
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const hi = lines.findIndex((l) => /date/i.test(l) && /close/i.test(l))
  if (hi < 0) return []
  const headers = lines[hi].split(/[|,]/).map((h) => h.trim().toLowerCase())
  const out: Rec[] = []
  for (const line of lines.slice(hi + 1)) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(line)) continue // skip "…", dashes, footnotes
    const cells = line.includes('|') ? line.split('|') : line.split(',')
    const rec: Rec = {}
    headers.forEach((h, i) => (rec[h] = (cells[i] ?? '').trim()))
    out.push(rec)
  }
  return out
}

function pick(rec: Rec, aliases: string[]): unknown {
  for (const a of aliases) {
    for (const key of Object.keys(rec)) {
      if (key.toLowerCase().replace(/[\s_.%]/g, '') === a) return rec[key]
    }
  }
  return undefined
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[, ₹]/g, ''))
  return Number.isFinite(n) ? n : null
}
function isoDate(v: unknown): string | null {
  const s = String(v ?? '').trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** One preview/CSV/JSON body → PriceRow[] for a company. */
export function rowsFromBody(text: string, company_id: string, url: string, fetched_at: string): PriceRow[] {
  const prov = (period: string) => ({
    source_name: 'muns market-data API — NSE daily history',
    source_url: API_BASE,
    source_file: url,
    source_period: period,
    fetched_at,
    parsed_at: nowIso(),
    parser_name: PARSER_NAME,
    confidence: 'high' as const,
  })
  const out: PriceRow[] = []
  const seen = new Set<string>()
  for (const rec of parseMunsBody(text)) {
    const date = isoDate(pick(rec, ['date', 'datetime', 'timestamp', 'index']))
    if (!date || seen.has(date)) continue
    const close = num(pick(rec, ['close', 'adjclose', 'closeprice']))
    if (close === null) continue
    seen.add(date)
    out.push({
      company_id,
      date,
      close: Number(close.toFixed(2)),
      traded_qty: num(pick(rec, ['volume', 'totaltradedquantity', 'tradedquantity', 'totalquantity'])),
      deliverable_qty: num(pick(rec, ['deliverablequantity', 'deliverablevolume', 'delivqty', 'deliverable'])),
      provenance: prov(date),
    })
  }
  return out
}

function apiUrl(ticker: string, start: string, end: string): string {
  const p = new URLSearchParams({ ticker, start, end, country: 'India' })
  return `${API_BASE}?${p.toString()}`
}

async function fetchText(url: string, tries = 3): Promise<string> {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json, text/plain, */*' } })
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`)
      return await r.text()
    } catch (e) {
      lastErr = e
      await sleep(400 * (i + 1))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/** Walk [start, today] in WINDOW_DAYS windows, collecting every preview row. */
async function walkTicker(company_id: string, ticker: string, start: string, today: string, fetched_at: string): Promise<{ rows: PriceRow[]; windows: number; sampleErr?: string }> {
  const rows: PriceRow[] = []
  let cursor = start
  let windows = 0
  let sampleErr: string | undefined
  while (cursor <= today && windows < MAX_WINDOWS) {
    const end = addDays(cursor, WINDOW_DAYS)
    const url = apiUrl(ticker, cursor, end > today ? addDays(today, 1) : end)
    try {
      const text = await fetchText(url)
      const parsed = rowsFromBody(text, company_id, url, fetched_at)
      if (!parsed.length && !sampleErr) sampleErr = `no rows parsed; head=${JSON.stringify(text.slice(0, 160))}`
      rows.push(...parsed)
    } catch (e) {
      if (!sampleErr) sampleErr = e instanceof Error ? e.message : String(e)
    }
    windows++
    cursor = addDays(cursor, WINDOW_DAYS)
    await sleep(120) // be gentle on the API
  }
  return { rows, windows, sampleErr }
}

export const fetchMunsMarketData: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Daily price & volume (muns market-data API)',
  frequency: 'daily',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const today = fetched_at.slice(0, 10)
    if (isOfflineMode()) {
      return { source_id: SOURCE_ID, status: 'pending', raw_file: null, records: [], records_fetched: 0, fetched_at, warnings: ['offline: muns API walk needs INGEST_OFFLINE=0 (runs in CI).'] }
    }

    const snap = await loadPriceHistory()
    const latestByCompany = new Map<string, string>()
    for (const r of snap.data) {
      const cur = latestByCompany.get(r.company_id)
      if (!cur || r.date > cur) latestByCompany.set(r.company_id, r.date)
    }

    const warnings: string[] = []
    let added = 0
    let enriched = 0
    let okTickers = 0

    for (const t of TICKERS) {
      // Start from a few days before the last stored session (overlap = self-heal),
      // or a sensible floor when this ticker has no history yet.
      const stored = latestByCompany.get(t.company_id)
      const start = stored
        ? addDays(stored, -3)
        : t.company_id === FOCAL
          ? FLOOR_START
          : addDays(today, -PEER_LOOKBACK_DAYS)
      const { rows, windows, sampleErr } = await walkTicker(t.company_id, t.ticker, start, today, fetched_at)
      if (rows.length) {
        const res = mergePriceRows(snap, rows)
        added += res.added
        enriched += res.enriched
        okTickers++
        await appendLog('fetch-muns-market-data.log', { source: SOURCE_ID, company_id: t.company_id, status: 'parsed', windows, rows: rows.length, added: res.added, enriched: res.enriched })
      } else {
        warnings.push(`${t.company_id}: no rows over ${windows} windows from ${start}. ${sampleErr ?? ''}`)
        await appendLog('fetch-muns-market-data.log', { source: SOURCE_ID, company_id: t.company_id, status: 'empty', windows, sampleErr })
      }
    }

    if (okTickers > 0) {
      await savePriceHistory(snap, { last_successful_run: fetched_at, parser_status: 'ready', muns_last_run: fetched_at })
    }

    return {
      source_id: SOURCE_ID,
      status: okTickers > 0 ? 'success' : 'pending',
      raw_file: null,
      records: [],
      records_fetched: added + enriched,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

// Standalone: `npm run ingest:price:muns`.
if (process.argv[1] && /fetch-muns-market-data\.(ts|js|mjs)$/.test(process.argv[1])) {
  fetchMunsMarketData
    .run()
    .then((r) => {
      console.log(`fetch-muns-market-data · ${r.status} · ${r.records_fetched} rows added/enriched`)
      if (r.warnings?.length) for (const w of r.warnings) console.warn('  ! ' + w)
    })
    .catch((err) => {
      console.error('fetch-muns-market-data failed:', err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
}
