// ---------------------------------------------------------------------------
//  Fetcher — Yahoo Finance daily price history (close + volume).
//
//  Why Yahoo: the official NSE security-archive endpoint WAF-blocks datacenter
//  IPs (every cloud runner gets a 403 block page), so the listing→Jul-2025
//  history is seeded from the workbook and Yahoo keeps it current. Yahoo's
//  public chart API (no login, no key) returns the real exchange close + traded
//  volume for NIVABUPA.NS and the other listed insurers, and is reachable from
//  CI — so this is what makes the Historical Stock Movement tab update itself as
//  time goes forward.
//
//  HONESTY: Yahoo carries price + volume only. "Deliverable quantity" / "% of
//  traded delivered" are an NSE-only field — Yahoo rows leave deliverable_qty
//  null (never 0). It is filled for the seeded history (from the workbook) and
//  will fill forward the day an official NSE delivery file is staged under
//  data/raw/exchanges/<id>/ (fetch-investing.ts picks it up).
//
//  Writes THROUGH price-history-store so it merges with (never clobbers) the
//  workbook seed and any NSE delivery data already present.
//
//    INGEST_OFFLINE=0 npm run ingest:price:yahoo     # live (CI)
//    npm run ingest:price:yahoo                       # offline: replay staged JSON
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult } from './types'
import { appendLog, detectAccessBlock, nowIso } from './util'
import { fetchOrLoadRaw } from './parsers'
import { loadPriceHistory, mergePriceRows, savePriceHistory, type PriceRow } from './price-history-store'

const SOURCE_ID = 'yahoo_price'
const PARSER_NAME = 'fetch-yahoo-price'

// Listed insurers in the Comps / stock-movement sheets and their Yahoo symbols
// (NSE listings carry the `.NS` suffix on Yahoo Finance).
const TICKERS: Array<{ company_id: string; yahoo: string }> = [
  { company_id: 'niva-bupa', yahoo: 'NIVABUPA.NS' },
  { company_id: 'star-health', yahoo: 'STARHEALTH.NS' },
  { company_id: 'icici-lombard', yahoo: 'ICICIGI.NS' },
  { company_id: 'godigit', yahoo: 'GODIGIT.NS' },
]

// 2 years of daily candles — comfortably covers every listing here and keeps the
// series current; the store merges so re-pulls are idempotent.
function yahooChartUrl(symbol: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`
}
function humanHistoryUrl(symbol: string): string {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`
}

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: { symbol?: string; currency?: string; gmtoffset?: number }
      timestamp?: number[]
      indicators?: { quote?: Array<{ close?: (number | null)[]; volume?: (number | null)[] }> }
    }>
    error?: unknown
  }
}

/** Parse Yahoo's chart payload → one PriceRow per session with a real close. */
export function parseYahooChart(
  buffer: Buffer,
  company_id: string,
  url: string,
  raw_file: string,
  fetched_at: string,
): PriceRow[] {
  const j = JSON.parse(buffer.toString('utf8')) as YahooChart
  const r = j.chart?.result?.[0]
  const ts = r?.timestamp ?? []
  const quote = r?.indicators?.quote?.[0] ?? {}
  const closes = quote.close ?? []
  const volumes = quote.volume ?? []
  const gmtoffset = r?.meta?.gmtoffset ?? 0 // seconds; shift to the exchange-local date
  const prov = (period: string) => ({
    source_name: 'Yahoo Finance — daily price history',
    source_url: humanHistoryUrl(r?.meta?.symbol ?? company_id),
    source_file: raw_file,
    source_period: period,
    fetched_at,
    parsed_at: nowIso(),
    parser_name: PARSER_NAME,
    confidence: 'high' as const,
  })
  const out: PriceRow[] = []
  for (let i = 0; i < ts.length; i++) {
    const close = closes[i]
    if (close === null || close === undefined || !Number.isFinite(close)) continue // holiday / gap row
    const date = new Date((ts[i] + gmtoffset) * 1000).toISOString().slice(0, 10)
    const vol = volumes[i]
    out.push({
      company_id,
      date,
      close: Number(close.toFixed(2)),
      traded_qty: vol === null || vol === undefined || !Number.isFinite(vol) ? null : Math.round(vol),
      deliverable_qty: null, // NSE-only field; Yahoo doesn't carry delivery
      provenance: prov(date),
    })
  }
  return out
}

export const fetchYahooPrice: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Daily price & volume (Yahoo Finance)',
  frequency: 'daily',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const date = fetched_at.slice(0, 10)
    const snap = await loadPriceHistory()
    const warnings: string[] = []
    let added = 0
    let enriched = 0
    let parsedTickers = 0
    let blocked = false

    for (const t of TICKERS) {
      const url = yahooChartUrl(t.yahoo)
      try {
        const { buffer, raw_file, mode } = await fetchOrLoadRaw(
          url,
          `yahoo/${t.company_id}`,
          `${t.company_id}-yahoo-${date}.json`,
          /\.json$/i,
        )
        const block = detectAccessBlock(buffer, url)
        if (block.blocked) {
          blocked = true
          warnings.push(`${t.company_id}: ${block.reason} (Yahoo). Retry from a non-datacenter IP or stage the JSON under data/raw/yahoo/${t.company_id}/.`)
          await appendLog('fetch-yahoo-price.log', { source: SOURCE_ID, company_id: t.company_id, status: 'blocked', reason: block.reason })
          continue
        }
        const rows = parseYahooChart(buffer, t.company_id, url, raw_file, fetched_at)
        if (!rows.length) {
          warnings.push(`${t.company_id}: Yahoo returned no daily candles (symbol ${t.yahoo}).`)
          await appendLog('fetch-yahoo-price.log', { source: SOURCE_ID, company_id: t.company_id, status: 'empty', mode })
          continue
        }
        const res = mergePriceRows(snap, rows)
        added += res.added
        enriched += res.enriched
        parsedTickers++
        await appendLog('fetch-yahoo-price.log', { source: SOURCE_ID, company_id: t.company_id, status: 'parsed', mode, rows: rows.length, added: res.added, enriched: res.enriched })
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        warnings.push(`${t.company_id}: ${reason}. Source: ${humanHistoryUrl(t.yahoo)}`)
        await appendLog('fetch-yahoo-price.log', { source: SOURCE_ID, company_id: t.company_id, status: 'pending', reason })
      }
    }

    if (parsedTickers > 0) {
      await savePriceHistory(snap, {
        last_successful_run: fetched_at,
        parser_status: 'ready',
        yahoo_last_run: fetched_at,
      })
    }

    const status = parsedTickers > 0 ? 'success' : blocked ? 'blocked' : 'pending'
    return {
      source_id: SOURCE_ID,
      status,
      raw_file: null,
      records: [],
      records_fetched: added + enriched,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

// Allow standalone invocation: `npm run ingest:price:yahoo`.
if (process.argv[1] && /fetch-yahoo-price\.(ts|js|mjs)$/.test(process.argv[1])) {
  fetchYahooPrice
    .run()
    .then((r) => {
      console.log(`fetch-yahoo-price · ${r.status} · ${r.records_fetched} rows added/enriched`)
      if (r.warnings?.length) for (const w of r.warnings) console.warn('  ! ' + w)
    })
    .catch((err) => {
      console.error('fetch-yahoo-price failed:', err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
}
