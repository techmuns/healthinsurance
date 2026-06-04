// ---------------------------------------------------------------------------
//  Fetcher — Daily analyst coverage for the focal listed insurer (Niva Bupa),
//  scraped from Moneycontrol.
//
//  Produces the self-contained snapshot src/data/snapshots/street-analyst-
//  snapshot.json that powers the Street View page: each covering broker's
//  latest rating + target, plus the consensus (counts, average / high / low
//  target). This is NOT routed through the generic merge gate — like the IRDAI
//  Non-Life Flash fetcher, it writes its own envelope directly.
//
//  Source policy (identical to the rest of the pipeline):
//    • OFFLINE-FIRST: live (INGEST_OFFLINE=0) fetches the Moneycontrol page and
//      stages the HTML to data/raw/moneycontrol/; offline replays the newest
//      staged HTML.
//    • BLOCK-TOLERANT: Moneycontrol can 403 a datacenter IP (like NSE/IRDAI).
//      On a block / empty parse / error we KEEP the prior snapshot (never blank
//      real data) and never fabricate a number — a missing field stays null.
//      Set the INGEST_FETCH_PROXY repo secret to fetch through an in-region IP.
// ---------------------------------------------------------------------------

import * as cheerio from 'cheerio'
import type { Fetcher, FetchResult } from './types'
import type {
  StreetAnalystConsensus,
  StreetAnalystReportRow,
  StreetAnalystSnapshot,
  StreetRating,
} from '../../src/data/snapshots/_schemas'
import { appendLog, nowIso, readSnapshot, writeSnapshot } from './util'
import { fetchOrLoadRaw } from './parsers'

const SOURCE_ID = 'moneycontrol_analyst'
const SOURCE_NAME = 'Moneycontrol analyst coverage (Niva Bupa)'
const PARSER_NAME = 'ingest-moneycontrol-analyst'
const SNAPSHOT_FILE = 'street-analyst-snapshot.json'

const COMPANY_ID = 'niva-bupa'
const COMPANY_NAME = 'Niva Bupa'

// Moneycontrol stock page for Niva Bupa. The recommendations / forecast data is
// rendered on (or linked from) this quote page. Overridable via env so the
// exact slug/code can be corrected from CI without a code change once the first
// live run stages the real HTML to data/raw/moneycontrol/.
const DEFAULT_URL =
  process.env.MONEYCONTROL_NIVA_URL ??
  'https://www.moneycontrol.com/india/stockpricequote/insurance/nivabupahealthinsurance/NBH'

// ─── rating vocabulary ───────────────────────────────────────────────────────
// Map Moneycontrol's varied broker-call wording onto our six-rating scale.
function normaliseRating(raw: string | null | undefined): StreetRating | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  if (/(strong\s*buy|^buy|outperform|overweight|accumulate\b)/.test(s)) return 'Buy'
  if (/\badd\b/.test(s)) return 'Add'
  if (/(equal[\s-]*weight|in[\s-]*line|market\s*perform)/.test(s)) return 'Equal-weight'
  if (/(hold|neutral)/.test(s)) return 'Hold'
  if (/(reduce|underweight|underperform)/.test(s)) return 'Reduce'
  if (/\bsell\b/.test(s)) return 'Sell'
  return null
}

function toNum(v: string | null | undefined): number | null {
  if (v == null) return null
  const n = parseFloat(String(v).replace(/[₹,\s%]/g, ''))
  return Number.isFinite(n) ? n : null
}

const isBuySide = (r: StreetRating | null) => r === 'Buy' || r === 'Add'
const isSell = (r: StreetRating | null) => r === 'Reduce' || r === 'Sell'

// ─── parsing ─────────────────────────────────────────────────────────────────
// Moneycontrol's DOM changes over time, so the parser is deliberately defensive
// and multi-strategy: it scans every table on the page for a broker-research /
// recommendations shape (a header row mentioning broker + rating/reco + target),
// and reads the consensus from a recommendations summary block. Anything it
// can't confidently read is left null/empty (which keeps the prior snapshot),
// never guessed.

interface Parsed {
  reports: StreetAnalystReportRow[]
  consensus: Partial<StreetAnalystConsensus>
}

function parsePage(html: string, sourceUrl: string): Parsed {
  const $ = cheerio.load(html)
  const reports = parseReportTables($, sourceUrl)
  const consensus = parseConsensus($, reports)
  return { reports, consensus }
}

/** Scan tables for a broker-research grid (broker · rating · target · date). */
function parseReportTables(
  $: cheerio.CheerioAPI,
  sourceUrl: string,
): StreetAnalystReportRow[] {
  const out: StreetAnalystReportRow[] = []
  const seen = new Set<string>()

  $('table').each((_, table) => {
    const headers = $(table)
      .find('tr')
      .first()
      .find('th, td')
      .map((__, c) => $(c).text().trim().toLowerCase())
      .get()
    if (headers.length < 2) return
    const findCol = (re: RegExp) => headers.findIndex((h) => re.test(h))
    const iBroker = findCol(/broker|research\s*house|analyst/)
    const iReco = findCol(/reco|rating|call|recommendation/)
    const iTarget = findCol(/target|tp\b|price\s*target/)
    if (iBroker === -1 || (iReco === -1 && iTarget === -1)) return
    const iDate = findCol(/date|as\s*on|reported/)

    $(table)
      .find('tr')
      .slice(1)
      .each((__, row) => {
        const cells = $(row)
          .find('td')
          .map((___, c) => $(c).text().trim())
          .get()
        if (cells.length === 0) return
        const brokerage = cells[iBroker]?.trim()
        if (!brokerage) return
        const rating = iReco !== -1 ? normaliseRating(cells[iReco]) : null
        const target_price = iTarget !== -1 ? toNum(cells[iTarget]) : null
        // Skip rows that carry neither a rating nor a target — not a real call.
        if (rating == null && target_price == null) return
        const report_date = iDate !== -1 && cells[iDate] ? cells[iDate] : nowIso().slice(0, 10)
        const key = `${brokerage}::${report_date}::${target_price ?? ''}`
        if (seen.has(key)) return
        seen.add(key)
        out.push({
          brokerage,
          rating,
          target_price,
          report_date,
          thesis: null,
          source_id: null,
          source_url: sourceUrl,
          confidence: 'secondary',
        })
      })
  })
  return out
}

/** Read the consensus summary (counts + avg/high/low target + price). Falls
 *  back to deriving counts/targets from the parsed broker rows when present. */
function parseConsensus(
  $: cheerio.CheerioAPI,
  reports: StreetAnalystReportRow[],
): Partial<StreetAnalystConsensus> {
  const bodyText = $('body').text().replace(/\s+/g, ' ')

  const numAfter = (label: RegExp): number | null => {
    const re = new RegExp(label.source + '[^0-9₹.\\-]{0,24}?([\\d,]+(?:\\.\\d+)?)', 'i')
    const m = bodyText.match(re)
    return m ? toNum(m[1]) : null
  }

  const targets = reports.map((r) => r.target_price).filter((t): t is number => t != null)
  const derivedAvg = targets.length ? Math.round((targets.reduce((a, b) => a + b, 0) / targets.length) * 10) / 10 : null

  const buyFromRows = reports.filter((r) => isBuySide(r.rating)).length
  const sellFromRows = reports.filter((r) => isSell(r.rating)).length
  const holdFromRows = reports.filter((r) => r.rating === 'Hold' || r.rating === 'Equal-weight').length

  return {
    current_price: numAfter(/last\s*price|current\s*price|ltp\b/),
    consensus_target_price: numAfter(/consensus\s*target|average\s*target|target\s*price/) ?? derivedAvg,
    highest_target_price: numAfter(/high(?:est)?\s*target|max\s*target/) ?? (targets.length ? Math.max(...targets) : null),
    lowest_target_price: numAfter(/low(?:est)?\s*target|min\s*target/) ?? (targets.length ? Math.min(...targets) : null),
    analyst_count: numAfter(/no\.?\s*of\s*analysts|analysts\s*covering|brokerages?\b/) ?? (reports.length || null),
    buy_count: numAfter(/\bbuy\b/) ?? (reports.length ? buyFromRows : null),
    hold_count: numAfter(/\bhold\b/) ?? (reports.length ? holdFromRows : null),
    sell_count: numAfter(/\bsell\b/) ?? (reports.length ? sellFromRows : null),
    last_updated: nowIso().slice(0, 10),
  }
}

// ─── snapshot writing (block-tolerant) ───────────────────────────────────────

function hasRealReports(snap: StreetAnalystSnapshot | null): boolean {
  return !!snap && Array.isArray(snap.reports) && snap.reports.length > 0 && snap._meta?.dataset !== 'pending'
}

async function readExisting(): Promise<StreetAnalystSnapshot | null> {
  try {
    return await readSnapshot<StreetAnalystSnapshot>(SNAPSHOT_FILE)
  } catch {
    return null
  }
}

// ─── orchestration ───────────────────────────────────────────────────────────

export const ingestMoneycontrolAnalyst: Fetcher = {
  source_id: SOURCE_ID,
  name: SOURCE_NAME,
  frequency: 'daily',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const warnings: string[] = []
    const existing = await readExisting()

    let parsed: Parsed | null = null
    let blocked = false
    let sourceUrl = DEFAULT_URL
    try {
      const { buffer, raw_file, mode } = await fetchOrLoadRaw(
        DEFAULT_URL,
        'moneycontrol',
        `niva-analyst-${fetched_at.slice(0, 10)}.html`,
        /\.html?$/i,
      )
      sourceUrl = DEFAULT_URL
      parsed = parsePage(buffer.toString('utf8'), sourceUrl)
      await appendLog(`${PARSER_NAME}.log`, {
        source: SOURCE_ID,
        status: 'parsed',
        mode,
        raw_file: raw_file.split('/').pop(),
        reports: parsed.reports.length,
      })
      if (parsed.reports.length === 0) {
        warnings.push('Moneycontrol page fetched but no broker-recommendation rows matched the parser — DOM may have changed; kept prior snapshot.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      blocked = /\b(401|403)\b/.test(msg) || /offline/i.test(msg)
      warnings.push(`Moneycontrol fetch failed: ${msg}`)
      await appendLog(`${PARSER_NAME}.log`, { source: SOURCE_ID, status: blocked ? 'blocked' : 'error', error: msg })
    }

    const gotData = !!parsed && parsed.reports.length > 0

    if (gotData) {
      // Live authoritative pull → write fresh coverage (each row carries its MC
      // source URL). Consensus merges parsed values over the prior ones so a
      // single missing field never nulls a previously-known number.
      const consensus: StreetAnalystConsensus = {
        current_price: pick(parsed!.consensus.current_price, existing?.consensus.current_price),
        consensus_target_price: pick(parsed!.consensus.consensus_target_price, existing?.consensus.consensus_target_price),
        highest_target_price: pick(parsed!.consensus.highest_target_price, existing?.consensus.highest_target_price),
        lowest_target_price: pick(parsed!.consensus.lowest_target_price, existing?.consensus.lowest_target_price),
        analyst_count: pick(parsed!.consensus.analyst_count, existing?.consensus.analyst_count),
        buy_count: pick(parsed!.consensus.buy_count, existing?.consensus.buy_count),
        hold_count: pick(parsed!.consensus.hold_count, existing?.consensus.hold_count),
        sell_count: pick(parsed!.consensus.sell_count, existing?.consensus.sell_count),
        last_updated: parsed!.consensus.last_updated ?? fetched_at.slice(0, 10),
      }
      await writeSnapshot(SNAPSHOT_FILE, {
        _meta: {
          snapshot_id: 'street-analyst',
          description:
            'Daily analyst coverage (broker ratings + targets + consensus) for Niva Bupa. Source: Moneycontrol.',
          schema_version: '1.0.0',
          company_id: COMPANY_ID,
          company_name: COMPANY_NAME,
          source: 'Moneycontrol',
          source_url: sourceUrl,
          dataset: 'official',
          last_updated: fetched_at.slice(0, 10),
          last_successful_run: fetched_at,
          last_fetched_at: fetched_at,
          parser_status: 'ready',
          notes: 'Live Moneycontrol pull. Each row carries its source URL; missing fields stay null (never fabricated).',
        },
        consensus,
        reports: parsed!.reports,
      } satisfies StreetAnalystSnapshot)
    } else if (existing && hasRealReports(existing)) {
      // No new data (block / DOM change) but we already hold real coverage →
      // keep it, only refreshing the fetch-attempt metadata. Never blanks data.
      await writeSnapshot(SNAPSHOT_FILE, {
        ...existing,
        _meta: {
          ...existing._meta,
          last_fetched_at: fetched_at,
          parser_status: blocked ? 'blocked' : existing._meta.parser_status,
          notes: blocked
            ? 'Moneycontrol blocked this run (datacenter IP 403). Kept prior coverage. Set INGEST_FETCH_PROXY to fetch via an in-region IP.'
            : existing._meta.notes,
        },
      } satisfies StreetAnalystSnapshot)
    }
    // else: no data and no prior real data → leave the seed file untouched
    // (the curated seed is itself real, source-backed coverage).

    const status: FetchResult['status'] = gotData ? 'success' : blocked ? 'blocked' : 'pending'
    return {
      source_id: SOURCE_ID,
      status,
      raw_file: null,
      records: [],
      records_fetched: gotData ? parsed!.reports.length : 0,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

/** First non-null of the two (parsed wins; falls back to prior). */
function pick(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a != null) return a
  if (b != null) return b
  return null
}
