// ---------------------------------------------------------------------------
//  Fetcher — muns market-data API (PRIMARY daily price/volume source).
//
//  fastapi.muns.io/market_data is muns' own historical stock-data service with
//  first-class India support (country=India). It is the primary source for the
//  Historical Stock Movement + Comps sheets: reachable from CI, controlled by
//  us, and able to backfill the full listing→today series in one call. Yahoo
//  Finance stays wired as a backup; the workbook seeds the listing→Jul-2025
//  deliverable column that exchange-only sources block.
//
//  The parser is shape-tolerant on purpose (FastAPI + pandas can serialise a
//  frame several ways) — it accepts a record list, a {data|result|market_data}
//  wrapper, or pandas 'columns'/'split' orients, and reads Date / Close / Volume
//  (and Deliverable, if the API carries it) under their common aliases.
//
//  HONESTY: a field the API doesn't return stays null (never 0). Writes THROUGH
//  price-history-store so it merges with — never clobbers — the seed and Yahoo.
//
//    INGEST_OFFLINE=0 npm run ingest:price:muns      # live (CI)
//    npm run ingest:price:muns                        # offline: replay staged JSON
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult } from './types'
import { appendLog, detectAccessBlock, nowIso } from './util'
import { fetchOrLoadRaw } from './parsers'
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

// Niva Bupa listed 2024-11-14; start a touch earlier so every insurer's history
// is covered. Overridable via env for ad-hoc backfills.
const START = process.env.MUNS_START ?? '2024-11-01'

function apiUrl(ticker: string, end: string): string {
  const p = new URLSearchParams({ ticker, start: START, end, country: 'India' })
  return `${API_BASE}?${p.toString()}`
}

// ── shape-tolerant normalisation ────────────────────────────────────────────
type Rec = Record<string, unknown>

/** Coerce any of the plausible response shapes into an array of record objects. */
export function toRecords(parsed: unknown): Rec[] {
  if (Array.isArray(parsed)) return parsed as Rec[]
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Rec
    // pandas 'split' orient: { columns: [...], index: [...], data: [[...]] } —
    // check BEFORE the generic wrapper so its array-of-arrays `data` isn't
    // mistaken for a record list.
    if (Array.isArray(o.columns) && Array.isArray(o.data)) {
      const cols = o.columns as string[]
      const idx = (o.index as unknown[]) ?? []
      return (o.data as unknown[][]).map((row, i) => {
        const rec: Rec = {}
        cols.forEach((c, j) => (rec[c] = row[j]))
        if (idx[i] !== undefined && rec.Date === undefined && rec.date === undefined) rec.Date = idx[i]
        return rec
      })
    }
    // Common wrappers — only when the wrapped value is a list of record objects.
    for (const k of ['data', 'result', 'results', 'market_data', 'records', 'history', 'prices']) {
      const v = o[k]
      if (Array.isArray(v) && (v.length === 0 || (typeof v[0] === 'object' && !Array.isArray(v[0])))) return v as Rec[]
    }
    // pandas 'columns' orient: { "Close": {idx: val,...}, "Volume": {...}, ... }
    const colKeys = Object.keys(o).filter((k) => o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]))
    if (colKeys.length && colKeys.length === Object.keys(o).length) {
      const rowIds = Object.keys(o[colKeys[0]] as Rec)
      const dateCol = colKeys.find((k) => /date|time/i.test(k))
      return rowIds.map((id) => {
        const rec: Rec = {}
        for (const c of colKeys) rec[c] = (o[c] as Rec)[id]
        // When the row id IS the date (typical for a DatetimeIndex), keep it.
        if (!dateCol && rec.Date === undefined) rec.Date = id
        return rec
      })
    }
  }
  return []
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

/** Robust date → ISO (YYYY-MM-DD): ISO strings, epoch ms/s, "dd-MMM-yyyy". */
export function isoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') {
    const ms = v > 1e12 ? v : v > 1e9 ? v * 1000 : null // ms vs s epoch
    if (ms !== null) return new Date(ms).toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  // All-digit string → epoch (ms or s), e.g. a pandas DatetimeIndex serialised as keys.
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    const ms = n > 1e12 ? n : n > 1e9 ? n * 1000 : null
    if (ms !== null) return new Date(ms).toISOString().slice(0, 10)
  }
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  const m = s.match(/(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})/)
  if (m) {
    const dd = new Date(`${m[2]} ${m[1]}, ${m[3]}`)
    if (!Number.isNaN(dd.getTime())) return dd.toISOString().slice(0, 10)
  }
  return null
}

/** Minimal CSV → records (header row + rows), tolerant of simple quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else q = false
      } else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}
function parseCsv(text: string): Rec[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2 || !lines[0].includes(',')) return []
  const headers = splitCsvLine(lines[0])
  const out: Rec[] = []
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line)
    if (cells.length < 2) continue
    const rec: Rec = {}
    headers.forEach((h, i) => (rec[h] = cells[i]))
    out.push(rec)
  }
  return out
}

export function parseMunsMarketData(
  buffer: Buffer,
  company_id: string,
  url: string,
  raw_file: string,
  fetched_at: string,
): PriceRow[] {
  const text = buffer.toString('utf8').trim()
  let records: Rec[] = []
  try {
    records = toRecords(JSON.parse(text))
  } catch {
    records = parseCsv(text) // some endpoints return CSV instead of JSON
  }
  if (!records.length) {
    // Surface what the endpoint actually returned so the contract is visible in
    // the CI log (e.g. a "File created…" message, an HTML page, or empty body).
    throw new Error(
      `unparseable response (${text.length}B): ${JSON.stringify(text.slice(0, 240))}`,
    )
  }
  const prov = (period: string) => ({
    source_name: 'muns market-data API — NSE daily history',
    source_url: url,
    source_file: raw_file,
    source_period: period,
    fetched_at,
    parsed_at: nowIso(),
    parser_name: PARSER_NAME,
    confidence: 'high' as const,
  })
  const out: PriceRow[] = []
  const seen = new Set<string>()
  for (const rec of records) {
    const date = isoDate(pick(rec, ['date', 'datetime', 'timestamp', 'index']))
    if (!date || seen.has(date)) continue
    const close = num(pick(rec, ['close', 'adjclose', 'closeprice', 'lastprice'])) // prefer raw close; adjclose as fallback alias
    if (close === null) continue
    seen.add(date)
    out.push({
      company_id,
      date,
      close: Number(close.toFixed(2)),
      traded_qty: num(pick(rec, ['volume', 'totaltradedquantity', 'tradedquantity', 'totalquantity', 'qty'])),
      // The API may carry NSE delivery; capture it when present, else null.
      deliverable_qty: num(pick(rec, ['deliverablequantity', 'deliverablevolume', 'delivqty', 'deliverableqty', 'deliverable'])),
      provenance: prov(date),
    })
  }
  return out
}

export const fetchMunsMarketData: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Daily price & volume (muns market-data API)',
  frequency: 'daily',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const end = fetched_at.slice(0, 10)
    const snap = await loadPriceHistory()
    const warnings: string[] = []
    let added = 0
    let enriched = 0
    let parsedTickers = 0
    let blocked = false

    for (const t of TICKERS) {
      const url = apiUrl(t.ticker, end)
      try {
        const { buffer, raw_file, mode } = await fetchOrLoadRaw(
          url,
          `muns-market/${t.company_id}`,
          `${t.company_id}-muns-${end}.json`,
          /\.json$/i,
        )
        const block = detectAccessBlock(buffer, url)
        if (block.blocked) {
          blocked = true
          warnings.push(`${t.company_id}: ${block.reason} (muns API). Check the endpoint or stage the JSON under data/raw/muns-market/${t.company_id}/.`)
          await appendLog('fetch-muns-market-data.log', { source: SOURCE_ID, company_id: t.company_id, status: 'blocked', reason: block.reason })
          continue
        }
        const rows = parseMunsMarketData(buffer, t.company_id, url, raw_file, fetched_at)
        if (!rows.length) {
          warnings.push(`${t.company_id}: muns API returned no parseable rows (ticker ${t.ticker}). Response shape may have changed.`)
          await appendLog('fetch-muns-market-data.log', { source: SOURCE_ID, company_id: t.company_id, status: 'empty', mode })
          continue
        }
        const res = mergePriceRows(snap, rows)
        added += res.added
        enriched += res.enriched
        parsedTickers++
        await appendLog('fetch-muns-market-data.log', { source: SOURCE_ID, company_id: t.company_id, status: 'parsed', mode, rows: rows.length, added: res.added, enriched: res.enriched })
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        warnings.push(`${t.company_id}: ${reason}. Endpoint: ${API_BASE}`)
        await appendLog('fetch-muns-market-data.log', { source: SOURCE_ID, company_id: t.company_id, status: 'pending', reason })
      }
    }

    if (parsedTickers > 0) {
      await savePriceHistory(snap, {
        last_successful_run: fetched_at,
        parser_status: 'ready',
        muns_last_run: fetched_at,
      })
    }

    return {
      source_id: SOURCE_ID,
      status: parsedTickers > 0 ? 'success' : blocked ? 'blocked' : 'pending',
      raw_file: null,
      records: [],
      records_fetched: added + enriched,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

// Allow standalone invocation: `npm run ingest:price:muns`.
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
