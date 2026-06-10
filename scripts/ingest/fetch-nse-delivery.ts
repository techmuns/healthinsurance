// ---------------------------------------------------------------------------
//  Fetcher — NSE security-wise delivery (the deliverable-quantity column).
//
//  Deliverable quantity / % delivered is an NSE-only field the price feeds
//  (muns / Yahoo) don't carry. NSE's *API* WAF-blocks CI, but its *archives*
//  host serves the daily "MTO" delivery file (Security-Wise Delivery Position)
//  as a static download that IS reachable from CI:
//    https://archives.nseindia.com/archives/equities/mto/MTO_DDMMYYYY.DAT
//  Format (record-type 20 rows): 20,SrNo,SYMBOL,SERIES,QtyTraded,DelivQty,Deliv%
//
//  This fills the deliverable column for every session a price feed left null —
//  backfilling the muns-filled gap on the first run and topping up each new day
//  after. Writes THROUGH price-history-store (fill-nulls), so it only ADDS the
//  delivery figure and never disturbs the price/volume already there.
//
//    INGEST_OFFLINE=0 npm run ingest:delivery:nse        # live (CI)
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult } from './types'
import { appendLog, isOfflineMode, nowIso } from './util'
import { loadPriceHistory, mergePriceRows, savePriceHistory, type PriceRow } from './price-history-store'

const SOURCE_ID = 'nse_delivery'
const PARSER_NAME = 'fetch-nse-delivery'

// company_id ↔ NSE symbol (the MTO file is keyed by symbol).
const SYMBOLS: Record<string, string> = {
  NIVABUPA: 'niva-bupa',
  STARHEALTH: 'star-health',
  ICICIGI: 'icici-lombard',
  GODIGIT: 'godigit',
}
const WANTED = new Set(Object.keys(SYMBOLS))
const SYMBOLS_REV = new Set(Object.values(SYMBOLS)) // company_ids we cover

// Cap dates filled per run (first run backfills the gap; later runs do ~1/day).
const MAX_DAYS = Number(process.env.NSE_DELIVERY_MAX_DAYS ?? 400)
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[, ]/g, ''))
  return Number.isFinite(n) ? n : null
}
/** ISO YYYY-MM-DD → DDMMYYYY (the MTO filename format). */
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`
const mtoUrl = (iso: string) => `https://archives.nseindia.com/archives/equities/mto/MTO_${ddmmyyyy(iso)}.DAT`
const bhavUrl = (iso: string) => `https://archives.nseindia.com/products/content/sec_bhavdata_full_${ddmmyyyy(iso)}.csv`

type Deliv = { traded: number | null; deliverable: number | null }

/** Parse an MTO file → { NSE symbol → { traded, deliverable } } (EQ series).
 *  Rows: 20,SrNo,SYMBOL,SERIES,QtyTraded,DeliverableQty,Deliv% */
export function parseMto(text: string): Map<string, Deliv> {
  const out = new Map<string, Deliv>()
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('20,')) continue // record-type 20 = a security row
    const p = line.split(',')
    const symbol = (p[2] ?? '').trim()
    const series = (p[3] ?? '').trim()
    if (series !== 'EQ' || !WANTED.has(symbol)) continue
    out.set(symbol, { traded: num(p[4]), deliverable: num(p[5]) })
  }
  return out
}

/** Parse the full bhavdata CSV (fallback when the MTO file has a gap).
 *  Header: SYMBOL, SERIES, …, TTL_TRD_QNTY(10), …, DELIV_QTY(13), DELIV_PER(14) */
export function parseBhavdata(text: string): Map<string, Deliv> {
  const out = new Map<string, Deliv>()
  for (const line of text.split(/\r?\n/)) {
    const p = line.split(',').map((s) => s.trim())
    if (p.length < 15) continue
    if (p[1] !== 'EQ' || !WANTED.has(p[0])) continue
    out.set(p[0], { traded: num(p[10]), deliverable: num(p[13]) })
  }
  return out
}

async function fetchText(url: string, tries = 3): Promise<{ status: number; text: string }> {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/plain,text/csv,*/*', Referer: 'https://www.nseindia.com/' } })
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`)
      return { status: r.status, text: await r.text() }
    } catch (e) {
      lastErr = e
      await sleep(400 * (i + 1))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export const fetchNseDelivery: Fetcher = {
  source_id: SOURCE_ID,
  name: 'NSE security-wise delivery (MTO file)',
  frequency: 'daily',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    if (isOfflineMode()) {
      return { source_id: SOURCE_ID, status: 'pending', raw_file: null, records: [], records_fetched: 0, fetched_at, warnings: ['offline: NSE delivery needs INGEST_OFFLINE=0 (runs in CI).'] }
    }

    const snap = await loadPriceHistory()
    // Sessions still missing a delivery figure (one MTO file covers all symbols).
    const need = new Set<string>()
    for (const r of snap.data) {
      if (SYMBOLS_REV.has(r.company_id) && r.deliverable_qty == null) need.add(r.date)
    }
    const dates = [...need].sort().reverse().slice(0, MAX_DAYS) // newest-first, capped

    const incoming: PriceRow[] = []
    const warnings: string[] = []
    let days = 0
    let noFile = 0 // dates with no NSE settlement file at all (likely non-trading)
    for (const date of dates) {
      try {
        // Primary: the small MTO delivery file. Fallback: the full bhavdata CSV
        // (covers the odd day NSE doesn't publish an MTO).
        let map: Map<string, Deliv> | null = null
        let src = mtoUrl(date)
        const mto = await fetchText(src)
        if (mto.status === 200) map = parseMto(mto.text)
        if (!map || map.size === 0) {
          src = bhavUrl(date)
          const bhav = await fetchText(src)
          if (bhav.status === 200) map = parseBhavdata(bhav.text)
        }
        if (!map || map.size === 0) {
          noFile++
          if (warnings.length < 5) warnings.push(`${date}: no NSE settlement file (MTO + bhavdata both absent — likely a non-trading day)`)
          await sleep(80)
          continue
        }
        for (const [symbol, v] of map) {
          if (v.deliverable == null) continue
          incoming.push({
            company_id: SYMBOLS[symbol],
            date,
            close: null,
            traded_qty: v.traded,
            deliverable_qty: v.deliverable,
            provenance: {
              source_name: 'NSE security-wise delivery',
              source_url: src,
              source_file: src,
              source_period: date,
              fetched_at,
              parsed_at: nowIso(),
              parser_name: PARSER_NAME,
              confidence: 'high',
            },
          })
        }
        days++
      } catch (e) {
        if (warnings.length < 5) warnings.push(`${date}: ${e instanceof Error ? e.message : String(e)}`)
      }
      await sleep(80) // be gentle on the archives host
    }

    let added = 0
    let enriched = 0
    if (incoming.length) {
      const res = mergePriceRows(snap, incoming)
      added = res.added
      enriched = res.enriched
      await savePriceHistory(snap, { nse_delivery_last_run: fetched_at })
      await appendLog('fetch-nse-delivery.log', { source: SOURCE_ID, days, rows: incoming.length, enriched, noFile })
    }

    return {
      source_id: SOURCE_ID,
      status: days > 0 ? 'success' : 'pending',
      raw_file: null,
      records: [],
      records_fetched: enriched + added,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

// Standalone: `npm run ingest:delivery:nse`.
if (process.argv[1] && /fetch-nse-delivery\.(ts|js|mjs)$/.test(process.argv[1])) {
  fetchNseDelivery
    .run()
    .then((r) => {
      console.log(`fetch-nse-delivery · ${r.status} · ${r.records_fetched} delivery figures filled`)
      if (r.warnings?.length) for (const w of r.warnings) console.warn('  ! ' + w)
    })
    .catch((err) => {
      console.error('fetch-nse-delivery failed:', err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
}
