// ---------------------------------------------------------------------------
//  Fetcher — Daily valuation snapshot for listed insurers.
//
//  Pulls the live market quote (share price, market cap, shares outstanding)
//  from NSE / BSE for each listed insurer, then derives Price/GWP against the
//  latest-FY Gross Written Premium from insurer-annual-snapshot.json.
//
//  Price/GWP is a *premium*-based multiple (market_cap ÷ GWP). GWP is a premium
//  metric, NOT profit — Price/GWP must never be read as a profitability gauge.
//  Price/Book and Price/Earnings are emitted only when the quote actually
//  carries them, otherwise null (the validation gate / UI render "unavailable",
//  never a fabricated 0).
//
//  OFFLINE-FIRST, mirroring ingest-company-disclosures:
//    • Live (INGEST_OFFLINE=0): fetch the NSE/BSE quote, saved to
//      data/raw/exchanges/<id>/. NSE's quote API is WAF-protected and often
//      403s; that is tolerated per-company and the next offline run replays
//      whatever downloaded.
//    • Offline: read the most-recent pre-staged quote (JSON / CSV / text) from
//      data/raw/exchanges/<id>/. With nothing staged the fetcher returns an
//      empty-but-valid 'pending' result and never throws.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult, SnapshotRecord } from './types'
import type { InsurerAnnualRow, SnapshotEnvelope } from '../../src/data/snapshots/_schemas'
import { appendLog, nowIso, readSnapshot } from './util'
import { fetchOrLoadRaw } from './parsers'
import { extname } from 'node:path'

const SOURCE_ID = 'valuation_daily'
const PARSER_NAME = 'ingest-valuation'

interface CompanyMaster {
  data: Array<{
    company_id: string
    listed_status: 'listed' | 'unlisted'
    ticker: string | null
    exchange: 'NSE' | 'BSE' | null
  }>
}

/** Best-effort live quote URL for a ticker (NSE preferred, else BSE). */
function quoteUrl(ticker: string, exchange: 'NSE' | 'BSE' | null): string {
  if (exchange === 'BSE') {
    return `https://api.bseindia.com/BseIndiaAPI/api/getScripHeaderData/w?Debtflag=&scripcode=${encodeURIComponent(ticker)}&seriesid=`
  }
  return `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(ticker)}`
}

export const ingestValuation: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Daily valuation snapshot (listed insurers)',
  frequency: 'daily',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const master = await readSnapshot<CompanyMaster>('company-master.json')
    const listed = master.data.filter((c) => c.listed_status === 'listed' && c.ticker)

    // Latest-FY GWP per company, for the Price/GWP multiple.
    const gwpByCompany = await loadLatestGwp()

    const records: SnapshotRecord[] = []
    const warnings: string[] = []
    const date = fetched_at.slice(0, 10)

    for (const c of listed) {
      const url = quoteUrl(c.ticker!, c.exchange)
      const filename = `${c.company_id}-quote-${date}.json`
      try {
        const { buffer, raw_file, mode } = await fetchOrLoadRaw(
          url,
          `exchanges/${c.company_id}`,
          filename,
          /\.(json|csv|txt|dat)$/i,
        )

        const quote = parseQuote(buffer, raw_file)
        if (
          quote.share_price == null &&
          quote.market_cap == null &&
          quote.shares_outstanding == null
        ) {
          warnings.push(`${c.company_id}: quote ${raw_file.split('/').pop()} parsed but no price/market-cap fields matched.`)
          continue
        }

        // Derive any missing leg of price × shares = market cap.
        let { share_price, market_cap, shares_outstanding } = quote
        if (market_cap == null && share_price != null && shares_outstanding != null) {
          // shares_outstanding in absolute shares, price in ₹ → market cap in ₹ → crore.
          market_cap = (share_price * shares_outstanding) / 1e7
        }

        const gwp = gwpByCompany.get(c.company_id) ?? null
        const price_to_gwp =
          market_cap != null && gwp != null && gwp > 0
            ? Math.round((market_cap / gwp) * 100) / 100
            : null

        records.push({
          target: 'valuation-snapshot',
          keys: { company_id: c.company_id, date },
          values: {
            share_price,
            market_cap,
            shares_outstanding,
            price_to_gwp,
            price_to_book: quote.price_to_book,
            price_to_earnings: quote.price_to_earnings,
          },
          provenance: {
            source_name: `${c.exchange ?? 'NSE'} quote ${c.ticker} (${date})`,
            source_url: url,
            source_file: raw_file,
            source_period: date,
            fetched_at,
            parsed_at: nowIso(),
            parser_name: PARSER_NAME,
            confidence: 'medium',
          },
        })
        await appendLog('ingest-valuation.log', {
          source: SOURCE_ID,
          company_id: c.company_id,
          status: 'parsed',
          mode,
          share_price,
          market_cap,
          price_to_gwp,
        })
      } catch (err) {
        const error = errMsg(err)
        warnings.push(`${c.company_id}: ${error}`)
        await appendLog('ingest-valuation.log', {
          source: SOURCE_ID,
          company_id: c.company_id,
          status: 'error',
          error,
        })
      }
    }

    return {
      source_id: SOURCE_ID,
      status: records.length > 0 ? 'success' : 'pending',
      raw_file: null,
      records,
      records_fetched: records.length,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

// ─── GWP lookup ──────────────────────────────────────────────────────────────

/** Latest-FY GWP (₹ crore) per company from insurer-annual-snapshot.json. */
async function loadLatestGwp(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  try {
    const snap = await readSnapshot<SnapshotEnvelope<InsurerAnnualRow>>('insurer-annual-snapshot.json')
    const latestFy = new Map<string, string>()
    for (const row of snap.data) {
      if (typeof row.gwp !== 'number') continue
      const prev = latestFy.get(row.company_id)
      // FY labels sort lexically in chronological order (FY22 < FY25).
      if (!prev || row.fiscal_year > prev) {
        latestFy.set(row.company_id, row.fiscal_year)
        out.set(row.company_id, row.gwp)
      }
    }
  } catch {
    // Snapshot unreadable → no Price/GWP; ratio stays null per row.
  }
  return out
}

// ─── Quote parsing ───────────────────────────────────────────────────────────

interface ParsedQuote {
  share_price: number | null
  market_cap: number | null
  shares_outstanding: number | null
  price_to_book: number | null
  price_to_earnings: number | null
}

/** Decode a staged quote artefact (NSE/BSE JSON, or a generic text dump). */
export function parseQuote(buffer: Buffer, rawFile: string): ParsedQuote {
  const ext = extname(rawFile).toLowerCase()
  const raw = buffer.toString('utf8')
  if (ext === '.json' || isJsonish(raw)) {
    try {
      return parseQuoteJson(JSON.parse(raw))
    } catch {
      /* fall through to text scan */
    }
  }
  return parseQuoteText(raw)
}

function isJsonish(s: string): boolean {
  const t = s.trimStart()
  return t.startsWith('{') || t.startsWith('[')
}

/**
 * Map NSE / BSE quote JSON to our fields. NSE quote-equity nests price under
 * priceInfo and market cap under securityInfo / tradeInfo; BSE uses different
 * keys. We probe a list of likely paths and keep the first plausible hit, so a
 * schema drift on one field doesn't void the whole row.
 */
function parseQuoteJson(j: unknown): ParsedQuote {
  const share_price = firstNumberAt(j, [
    'priceInfo.lastPrice',
    'priceInfo.close',
    'lastPrice',
    'CurrRate.LTP',
    'LTP',
    'currentPrice',
  ])
  // NSE returns "Total Market Cap" in ₹ lakh under tradeInfo; normalise to crore.
  const mcapLakh = firstNumberAt(j, [
    'marketDeptOrderBook.tradeInfo.totalMarketCap',
    'securityInfo.totalMarketCap',
    'tradeInfo.totalMarketCap',
  ])
  const mcapCrore = firstNumberAt(j, ['marketCapFull', 'MktCapFull', 'marketCap', 'Mcap'])
  const market_cap = mcapCrore != null ? mcapCrore : mcapLakh != null ? mcapLakh / 100 : null
  const shares_outstanding = firstNumberAt(j, [
    'securityInfo.issuedSize',
    'issuedSize',
    'totalSharesOutstanding',
    'FaceVal.issuedSize',
  ])
  const price_to_earnings = firstNumberAt(j, [
    'metadata.pdSymbolPe',
    'priceInfo.pdSymbolPe',
    'pdSymbolPe',
    'pe',
    'PE',
  ])
  const price_to_book = firstNumberAt(j, ['pb', 'PB', 'priceToBook'])
  return clampQuote({ share_price, market_cap, shares_outstanding, price_to_book, price_to_earnings })
}

/** Generic text/CSV fallback: scan for "Last Price 612.30", "Market Cap …". */
function parseQuoteText(text: string): ParsedQuote {
  const share_price =
    numAfter(text, /(?:last\s*price|ltp|close\s*price)/i) ?? numAfter(text, /\bprice\b/i)
  // Market cap may be stated in Cr / Crore.
  let market_cap = numAfter(text, /market\s*cap(?:itali[sz]ation)?/i)
  const shares_outstanding = numAfter(text, /(?:issued\s*size|shares?\s*outstanding|no\.?\s*of\s*shares)/i)
  const price_to_earnings = numAfter(text, /\bP\/?E\b|price[\s/-]*earnings/i)
  const price_to_book = numAfter(text, /\bP\/?B\b|price[\s/-]*book/i)
  // If market cap was quoted in absolute rupees (huge), bring to crore.
  if (market_cap != null && market_cap > 1e7) market_cap = market_cap / 1e7
  return clampQuote({ share_price, market_cap, shares_outstanding, price_to_book, price_to_earnings })
}

/** Drop implausible numbers so a misread can't poison the snapshot. The merge
 *  gate has no valuation-specific validator, so we self-guard here. */
function clampQuote(q: ParsedQuote): ParsedQuote {
  const out = { ...q }
  if (out.share_price != null && (out.share_price <= 0 || out.share_price > 200000)) out.share_price = null
  if (out.market_cap != null && (out.market_cap <= 0 || out.market_cap > 5_000_000)) out.market_cap = null
  if (out.shares_outstanding != null && out.shares_outstanding <= 0) out.shares_outstanding = null
  if (out.price_to_earnings != null && (out.price_to_earnings <= 0 || out.price_to_earnings > 1000))
    out.price_to_earnings = null
  if (out.price_to_book != null && (out.price_to_book <= 0 || out.price_to_book > 100)) out.price_to_book = null
  return out
}

// ─── small JSON probing helpers ──────────────────────────────────────────────

function firstNumberAt(obj: unknown, paths: string[]): number | null {
  for (const p of paths) {
    const v = getPath(obj, p)
    const n = coerceNum(v)
    if (n != null) return n
  }
  return null
}

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

function coerceNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[,₹\s]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function numAfter(text: string, label: RegExp): number | null {
  const re = new RegExp(label.source + '[^0-9\\-]{0,30}?([\\d,]+(?:\\.\\d+)?)', label.flags)
  const m = text.match(re)
  if (!m || m[1] == null) return null
  const n = parseFloat(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
