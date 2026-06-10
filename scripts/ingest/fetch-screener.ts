// ---------------------------------------------------------------------------
//  Fetcher — Screener.in (BACKUP cross-check only).
//
//  Policy (Neha, 2026-06-05): official-first. Screener is NOT a core source.
//  It is used ONLY as a login-free, public BACKUP for metrics that have no
//  official equivalent on the dashboard — chiefly the 3-year average P/E used in
//  the 'Comps' sheet (the cell that was a Capital IQ CIQAVG formula). Every value
//  this adapter emits is tagged source:'backup', confidence:'low', so it can
//  never be mistaken for an official figure and is only used where the official
//  pipeline produced nothing.
//
//  Login-free: uses Screener's public company page only. No login, no export
//  endpoints, no paywalled data. If the page is a login wall / CAPTCHA, we record
//  a diagnostic and emit 'blocked' — never bypass.
//
//  Produces src/data/snapshots/screener-crosscheck-snapshot.json.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult } from './types'
import { appendLog, detectAccessBlock, nowIso, writeSnapshot } from './util'
import { fetchOrLoadRaw } from './parsers'

const SOURCE_ID = 'screener_crosscheck'
const PARSER_NAME = 'fetch-screener'

// Listed peers only (Screener has no pages for unlisted SAHIs).
const TARGETS: Array<{ company_id: string; symbol: string }> = [
  { company_id: 'niva-bupa', symbol: 'NIVABUPA' },
  { company_id: 'star-health', symbol: 'STARHEALTH' },
  { company_id: 'icici-lombard', symbol: 'ICICIGI' },
  { company_id: 'godigit', symbol: 'GODIGIT' },
]

interface CrossRow {
  company_id: string
  metric: string
  value: number | null
  period: string
  provenance: Record<string, unknown>
}

function screenerUrl(symbol: string): string {
  return `https://www.screener.in/company/${encodeURIComponent(symbol)}/consolidated/`
}

export const fetchScreener: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Screener.in cross-check (backup only — 3-yr avg P/E, ratios)',
  frequency: 'quarterly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const rows: CrossRow[] = []
    const warnings: string[] = []
    let blocked = false

    for (const t of TARGETS) {
      const url = screenerUrl(t.symbol)
      try {
        const { buffer, raw_file, mode } = await fetchOrLoadRaw(
          url,
          `screener/${t.company_id}`,
          `${t.company_id}-screener-${fetched_at.slice(0, 10)}.html`,
          /\.(html?|json)$/i,
        )
        const block = detectAccessBlock(buffer, url)
        if (block.blocked) {
          blocked = true
          warnings.push(`${t.company_id}: ${block.reason}. Screener is backup-only; official P/E history comes from NSE price + reported EPS.`)
          await appendLog('fetch-screener.log', { source: SOURCE_ID, company_id: t.company_id, status: 'blocked', reason: block.reason })
          continue
        }
        const parsed = parseScreener(buffer, t.company_id, url, raw_file, fetched_at)
        rows.push(...parsed)
        await appendLog('fetch-screener.log', { source: SOURCE_ID, company_id: t.company_id, status: 'parsed', mode, rows: parsed.length })
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        warnings.push(`${t.company_id}: ${reason} (Screener backup). Stage the public page under data/raw/screener/${t.company_id}/.`)
        await appendLog('fetch-screener.log', { source: SOURCE_ID, company_id: t.company_id, status: 'pending', reason })
      }
    }

    await writeSnapshot('screener-crosscheck-snapshot.json', {
      _meta: {
        snapshot_id: 'screener-crosscheck-snapshot',
        description: 'BACKUP-ONLY cross-check metrics from Screener public pages (3-yr avg P/E, headline ratios). Never a core/official source.',
        schema_version: '1.0.0',
        dataset: rows.length ? 'backup' : 'pending',
        source_policy: 'official-first; Screener used only where no official equivalent exists. All values confidence:low.',
        last_successful_run: rows.length ? fetched_at : null,
        parser_status: rows.length ? 'ready' : blocked ? 'blocked' : 'pending',
      },
      data: rows,
    })

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

/** Extract a small set of headline numbers from a Screener company page.
 *  Best-effort regex over the public HTML; backup-tier, so a miss is fine. */
export function parseScreener(
  buffer: Buffer,
  company_id: string,
  url: string,
  raw_file: string,
  fetched_at: string,
): CrossRow[] {
  const html = buffer.toString('utf8')
  const prov = {
    source_name: `Screener.in public page (${company_id}) — BACKUP`,
    source_url: url,
    source_file: raw_file,
    source_period: 'TTM',
    fetched_at,
    parsed_at: nowIso(),
    parser_name: PARSER_NAME,
    confidence: 'low' as const,
  }
  const out: CrossRow[] = []
  const add = (metric: string, value: number | null) => {
    if (value != null) out.push({ company_id, metric, value, period: 'TTM', provenance: prov })
  }
  // Screener renders "Stock P/E", "Price to book value", "ROE" in a ratios list,
  // plus "Market Cap" and "Current Price" at the top of the page.
  add('pe_ttm', labelledNumber(html, /stock p\/?e/i))
  add('price_to_book', labelledNumber(html, /price to book(?:\s*value)?/i))
  add('roe', labelledNumber(html, /\bROE\b/i))
  add('market_cap', labelledNumber(html, /market cap/i))
  add('current_price', labelledNumber(html, /current price/i))
  return out
}

/** Find the first number that follows a label within a short window. */
function labelledNumber(html: string, label: RegExp): number | null {
  const re = new RegExp(label.source + '[\\s\\S]{0,160}?([\\d]+(?:\\.\\d+)?)', label.flags)
  const m = html.match(re)
  if (!m || m[1] == null) return null
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : null
}
