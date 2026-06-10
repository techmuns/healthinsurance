// ---------------------------------------------------------------------------
//  Fetcher — Market price / history (Historical Stock Movement + Comps).
//
//  OFFICIAL-FIRST (Neha, 2026-06-05): the source of truth for Indian equity
//  price, traded & deliverable quantity is NSE itself. Investing.com is only a
//  LOGIN-FREE public BACKUP, used where the official feed is unavailable, and
//  every backup value is tagged confidence:'low' / source:'backup'.
//
//  Login-free: this adapter never authenticates. If a page comes back as a
//  Cloudflare / CAPTCHA / login wall, we record a clear diagnostic and emit a
//  'blocked' result — we do NOT try to parse the wall as data, and we never
//  bypass it. The fix is to stage the official NSE CSV under
//  data/raw/exchanges/<id>/ (manual-upload fallback) or run from an IP NSE
//  serves; the next run replays it.
//
//  Produces src/data/snapshots/price-history-snapshot.json:
//    { data: [{ company_id, date, close, traded_qty, deliverable_qty, prov }],
//      market: [{ company_id, market_cap, fetched_at, prov }] }
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult } from './types'
import { appendLog, detectAccessBlock, nowIso } from './util'
import { fetchOrLoadRaw } from './parsers'
import { loadPriceHistory, mergePriceRows, savePriceHistory } from './price-history-store'

const SOURCE_ID = 'price_history'
const PARSER_NAME = 'fetch-investing'

// Listed insurers in the Comps / stock-movement sheets and their NSE symbols.
const TICKERS: Array<{ company_id: string; nse: string }> = [
  { company_id: 'niva-bupa', nse: 'NIVABUPA' },
  { company_id: 'star-health', nse: 'STARHEALTH' },
  { company_id: 'icici-lombard', nse: 'ICICIGI' },
  { company_id: 'godigit', nse: 'GODIGIT' },
]

interface PriceRow {
  company_id: string
  date: string
  close: number | null
  traded_qty: number | null
  deliverable_qty: number | null
  provenance: Record<string, unknown>
}

/** NSE security-wise historical price + delivery (WAF-protected; staged in CI). */
function nseHistoryUrl(symbol: string): string {
  return `https://www.nseindia.com/api/historical/securityArchives?symbol=${encodeURIComponent(symbol)}&dataType=priceVolumeDeliverable&series=EQ`
}
/** Public, login-free backup. */
function investingBackupUrl(symbol: string): string {
  return `https://www.investing.com/search/?q=${encodeURIComponent(symbol)}`
}

export const fetchInvesting: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Market price & delivery history (NSE-first; Investing.com backup)',
  frequency: 'daily',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const date = fetched_at.slice(0, 10)
    const rows: PriceRow[] = []
    const warnings: string[] = []
    let blocked = false

    for (const t of TICKERS) {
      const url = nseHistoryUrl(t.nse)
      try {
        const { buffer, raw_file, mode } = await fetchOrLoadRaw(
          url,
          `exchanges/${t.company_id}`,
          `${t.company_id}-pricevol-${date}.json`,
          /\.(json|csv|txt)$/i,
        )
        const block = detectAccessBlock(buffer, url)
        if (block.blocked) {
          blocked = true
          warnings.push(`${t.company_id}: ${block.reason} (NSE). Stage official CSV under data/raw/exchanges/${t.company_id}/ or set INGEST_FETCH_PROXY.`)
          await appendLog('fetch-investing.log', { source: SOURCE_ID, company_id: t.company_id, status: 'blocked', reason: block.reason })
          continue
        }
        const parsed = parsePriceVolume(buffer, t.company_id, url, raw_file, fetched_at)
        rows.push(...parsed)
        await appendLog('fetch-investing.log', { source: SOURCE_ID, company_id: t.company_id, status: 'parsed', mode, rows: parsed.length })
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        warnings.push(`${t.company_id}: ${reason}. Backup: ${investingBackupUrl(t.nse)} (public, login-free) or stage NSE CSV.`)
        await appendLog('fetch-investing.log', { source: SOURCE_ID, company_id: t.company_id, status: 'pending', reason })
      }
    }

    // Merge THROUGH the store so a blocked NSE pull (0 rows) never wipes the
    // seeded history or the Yahoo close/volume — NSE only contributes the
    // deliverable-quantity column it uniquely carries.
    if (rows.length) {
      const snap = await loadPriceHistory()
      mergePriceRows(snap, rows)
      await savePriceHistory(snap, {
        nse_last_run: fetched_at,
        nse_parser_status: 'ready',
      })
    }

    return {
      source_id: SOURCE_ID,
      status: rows.length ? 'success' : blocked ? 'blocked' : 'pending',
      raw_file: null,
      records: [],
      records_fetched: rows.length,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

/** Parse the NSE price-volume-deliverable payload (JSON or CSV). Defensive: any
 *  shape drift yields fewer rows, never a throw. */
export function parsePriceVolume(
  buffer: Buffer,
  company_id: string,
  url: string,
  raw_file: string,
  fetched_at: string,
): PriceRow[] {
  const text = buffer.toString('utf8').trim()
  const prov = (period: string) => ({
    source_name: `NSE security-wise price & delivery (${company_id})`,
    source_url: url,
    source_file: raw_file,
    source_period: period,
    fetched_at,
    parsed_at: nowIso(),
    parser_name: PARSER_NAME,
    confidence: 'high' as const,
  })
  const out: PriceRow[] = []
  // JSON form: { data: [{ CH_TIMESTAMP / mTIMESTAMP, CH_CLOSING_PRICE, ... }] }
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const j = JSON.parse(text)
      const arr: unknown[] = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : []
      for (const r of arr as Array<Record<string, unknown>>) {
        const date = isoDate(str(r.CH_TIMESTAMP ?? r.mTIMESTAMP ?? r.date))
        if (!date) continue
        out.push({
          company_id,
          date,
          close: num(r.CH_CLOSING_PRICE ?? r.close ?? r.CLOSE),
          traded_qty: num(r.CH_TOT_TRADED_QTY ?? r.totalTradedVolume ?? r.TOTTRDQTY),
          deliverable_qty: num(r.COP_DELIV_QTY ?? r.deliveryQuantity ?? r.DELIV_QTY),
          provenance: prov(date),
        })
      }
      return out
    } catch {
      /* fall through to CSV */
    }
  }
  // CSV form: header row then Date, ..., Close, ..., Traded Qty, Deliverable Qty.
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return out
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const idx = (re: RegExp) => header.findIndex((h) => re.test(h))
  const di = idx(/date/), ci = idx(/close/), ti = idx(/traded|ttl|total.*qty|volume/), pi = idx(/deliver/)
  for (const line of lines.slice(1)) {
    const cells = line.split(',')
    const date = isoDate((cells[di] ?? '').trim())
    if (!date) continue
    out.push({
      company_id,
      date,
      close: num(cells[ci]),
      traded_qty: num(cells[ti]),
      deliverable_qty: num(cells[pi]),
      provenance: prov(date),
    })
  }
  return out
}

function str(v: unknown): string {
  return v == null ? '' : String(v)
}
function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,₹\s]/g, ''))
  return Number.isFinite(n) ? n : null
}
function isoDate(s: string): string | null {
  if (!s) return null
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  // dd-MMM-yyyy
  const m = s.match(/(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})/)
  if (m) {
    const dd = new Date(`${m[2]} ${m[1]}, ${m[3]}`)
    if (!isNaN(dd.getTime())) return dd.toISOString().slice(0, 10)
  }
  return null
}
