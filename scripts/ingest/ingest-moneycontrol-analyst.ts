// ---------------------------------------------------------------------------
//  Fetcher — Daily analyst coverage for the focal listed insurer (Niva Bupa),
//  aggregated from Moneycontrol's free, public feeds.
//
//  Produces the self-contained snapshot src/data/snapshots/street-analyst-
//  snapshot.json that powers the Street View page. It pulls from MULTIPLE
//  Moneycontrol feeds and merges them:
//    1. Broker Research cards (HTML)  → individual broker notes (rating, target,
//       date, research-PDF link as the source).
//    2. Estimates / price-forecast (JSON API) → full consensus: analyst count,
//       recommendation split, target high / low / average.
//    3. Price feed (JSON API) → live current price.
//
//  Every feed is OFFLINE-FIRST (staged to data/raw/moneycontrol/ so the next
//  offline run replays it) and BLOCK-TOLERANT: a failed/empty feed is skipped,
//  the prior snapshot is never blanked, and a missing field stays null — never
//  fabricated. Consensus prefers the JSON feed and falls back to deriving from
//  the broker notes, so the page degrades gracefully if one feed changes shape.
// ---------------------------------------------------------------------------

import * as cheerio from 'cheerio'
import type { Fetcher, FetchResult } from './types'
import type {
  StreetAnalystConsensus,
  StreetAnalystReportRow,
  StreetAnalystSnapshot,
  StreetMarket,
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
// Moneycontrol stock code (scId/did) + NSE symbol for Niva Bupa.
const SC_ID = process.env.MONEYCONTROL_SCID ?? 'NBH'

// Feed URLs (all overridable via env so they can be corrected from CI without a
// code change once the first live run stages the real responses).
const BROKER_URL =
  process.env.MONEYCONTROL_NIVA_URL ??
  'https://www.moneycontrol.com/india/stockpricequote/insurance/nivabupahealthinsurance/NBH'
const PRICE_URL =
  process.env.MONEYCONTROL_PRICE_URL ??
  `https://priceapi.moneycontrol.com/pricefeed/nse/equitycash/${SC_ID}`
// Candidate consensus / price-forecast JSON endpoints (the feeds behind the
// page's client-rendered "Consensus Recommendations" widget). We try each and
// keep the first that yields data; all responses are staged for refinement.
const FORECAST_URLS = (process.env.MONEYCONTROL_FORECAST_URL
  ? [process.env.MONEYCONTROL_FORECAST_URL]
  : [
      `https://api.moneycontrol.com/mcapi/v1/stock/estimates/price-forecast?scId=${SC_ID}&deviceType=W`,
      `https://api.moneycontrol.com/mcapi/v1/stock/estimates/analyst-rating?scId=${SC_ID}&deviceType=W`,
      `https://api.moneycontrol.com/mcapi/v1/stock/estimates/recommendation?scId=${SC_ID}&deviceType=W`,
    ])

// ─── rating vocabulary ───────────────────────────────────────────────────────
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

function toNum(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = parseFloat(String(v).replace(/[₹,\s%]/g, ''))
  return Number.isFinite(n) ? n : null
}

const isBuySide = (r: StreetRating | null) => r === 'Buy' || r === 'Add'
const isSell = (r: StreetRating | null) => r === 'Reduce' || r === 'Sell'

// ─── broker-note parsing (HTML) ──────────────────────────────────────────────

/**
 * Moneycontrol "Broker Research" cards. Each `.brrs_bx` block is one broker
 * note: broker name (`.brstk_name h3`), date (`.br_date`), a BUY/SELL/HOLD
 * button, a Target Price (a `<td>` "Target Price <strong>NN</strong>"), and a
 * link to the research PDF (`.download_report a`) used as the row's source.
 */
function parseBrokerResearch($: cheerio.CheerioAPI, sourceUrl: string): StreetAnalystReportRow[] {
  const out: StreetAnalystReportRow[] = []
  const seen = new Set<string>()

  $('.brrs_bx').each((_, el) => {
    const $el = $(el)
    const brokerage = $el.find('.brstk_name h3').first().text().trim()
    if (!brokerage) return

    const dateRaw = $el.find('.br_date').first().text().trim()
    const report_date = dateRaw && dateRaw !== '-' ? dateRaw : '—'

    const btn = $el.find('button[class*="button_"]').first()
    const ratingText = btn.text().trim() || (btn.attr('class') ?? '').replace(/^.*button_([a-z]+).*$/i, '$1')
    const rating = normaliseRating(ratingText)

    let target_price: number | null = null
    $el.find('td').each((__, td) => {
      const cell = $(td)
      if (/target\s*price/i.test(cell.text())) {
        target_price = toNum(cell.find('strong').first().text()) ?? toNum(cell.text())
      }
    })

    if (rating == null && target_price == null) return

    const href = $el.find('.download_report a[href]').first().attr('href')
    const source_url = href && /^https?:/i.test(href) ? href : sourceUrl
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
      source_url,
      confidence: 'secondary',
    })
  })

  // Fallback: a generic broker/rating/target table, should the DOM change.
  if (out.length === 0) return parseReportTablesFallback($, sourceUrl)
  return out
}

/** Generic fallback: scan tables for a broker/rating/target grid. */
function parseReportTablesFallback(
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
        const cells = $(row).find('td').map((___, c) => $(c).text().trim()).get()
        if (cells.length === 0) return
        const brokerage = cells[iBroker]?.trim()
        if (!brokerage) return
        const rating = iReco !== -1 ? normaliseRating(cells[iReco]) : null
        const target_price = iTarget !== -1 ? toNum(cells[iTarget]) : null
        if (rating == null && target_price == null) return
        const report_date = iDate !== -1 && cells[iDate] ? cells[iDate] : nowIso().slice(0, 10)
        const key = `${brokerage}::${report_date}::${target_price ?? ''}`
        if (seen.has(key)) return
        seen.add(key)
        out.push({ brokerage, rating, target_price, report_date, thesis: null, source_id: null, source_url: sourceUrl, confidence: 'secondary' })
      })
  })
  return out
}

// ─── consensus parsing (JSON feed) ───────────────────────────────────────────

/** Live market quote from Moneycontrol's pricefeed JSON (price + 52wk range). */
function parsePriceFeed(buffer: Buffer): StreetMarket | null {
  let j: unknown
  try {
    j = JSON.parse(buffer.toString('utf8'))
  } catch {
    return null
  }
  // pricefeed shape: { data: { pricecurrent, "52H", "52L", pricepercentchange, lastupd, ... } }
  const data = ((j as { data?: Record<string, unknown> })?.data ?? j) as Record<string, unknown>
  const pick = (...keys: string[]): number | null => {
    for (const k of keys) {
      const n = toNum(data?.[k])
      if (n != null) return n
    }
    return null
  }
  const current = pick('pricecurrent', 'lastprice', 'lastvalue', 'LTP')
  if (current == null || current <= 0) return null
  const lastupd = data?.lastupd
  return {
    current_price: current,
    week_high_52: pick('52H', '52WH', 'fiftytwoweekhigh'),
    week_low_52: pick('52L', '52WL', 'fiftytwoweeklow'),
    price_change_pct: pick('pricepercentchange', 'perchange', 'percentchange'),
    price_as_of: typeof lastupd === 'string' && lastupd.trim() ? lastupd.trim() : null,
  }
}

/**
 * Heuristic consensus reader for Moneycontrol's estimates/forecast JSON. The
 * exact shape is unknown until the first live run stages a real response, so we
 * walk the JSON and pick numbers under clearly-named keys: target high / low /
 * average, analyst count, and the recommendation split. Anything not clearly
 * matched stays null (then the consensus falls back to the broker notes).
 */
function parseForecastJson(buffer: Buffer): Partial<StreetAnalystConsensus> | null {
  let j: unknown
  try {
    j = JSON.parse(buffer.toString('utf8'))
  } catch {
    return null
  }
  let avg: number | null = null
  let high: number | null = null
  let low: number | null = null
  let count: number | null = null
  let buy: number | null = null
  let outperform: number | null = null
  let hold: number | null = null
  let underperform: number | null = null
  let sell: number | null = null
  const looseTargets: number[] = []

  const set = (cur: number | null, n: number) => (cur == null ? n : cur)
  const add = (cur: number | null, n: number) => (cur ?? 0) + n

  const visit = (node: unknown): void => {
    if (node == null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const key = k.toLowerCase()
      const num = toNum(v)
      if (num != null) {
        if (/(avg|average|mean|consensus)/.test(key) && /target|price/.test(key)) avg = set(avg, num)
        else if (/(high|max|upper)/.test(key) && /target|price/.test(key)) high = set(high, num)
        else if (/(low|min|lower)/.test(key) && /target|price/.test(key)) low = set(low, num)
        else if (/target/.test(key) && /price/.test(key)) looseTargets.push(num)
        else if (/(numberofanalyst|analystcount|noofanalyst|totalanalyst|coveredby|brokercount)/.test(key.replace(/[_\s-]/g, ''))) count = set(count, num)
        else if (/strongbuy|^buy$|buycount|buyreco/.test(key.replace(/[_\s-]/g, ''))) buy = add(buy, num)
        else if (/outperform/.test(key)) outperform = add(outperform, num)
        else if (/hold|neutral/.test(key)) hold = add(hold, num)
        else if (/underperform/.test(key)) underperform = add(underperform, num)
        else if (/strongsell|^sell$|sellcount/.test(key.replace(/[_\s-]/g, ''))) sell = add(sell, num)
      }
      if (v && typeof v === 'object') visit(v)
    }
  }
  visit(j)

  const buyTot = buy != null || outperform != null ? (buy ?? 0) + (outperform ?? 0) : null
  const sellTot = sell != null || underperform != null ? (sell ?? 0) + (underperform ?? 0) : null
  const anyTarget = avg ?? high ?? low ?? (looseTargets.length ? 1 : null)
  const anyCounts = count ?? buyTot ?? hold ?? sellTot
  if (anyTarget == null && anyCounts == null) return null

  return {
    consensus_target_price: avg ?? (looseTargets.length ? round1(mean(looseTargets)) : null),
    highest_target_price: high ?? (looseTargets.length ? Math.max(...looseTargets) : null),
    lowest_target_price: low ?? (looseTargets.length ? Math.min(...looseTargets) : null),
    analyst_count: count,
    buy_count: buyTot,
    hold_count: hold,
    sell_count: sellTot,
  }
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
const round1 = (n: number) => Math.round(n * 10) / 10

/** Consensus derived from the broker notes — one latest note per broker. */
function deriveConsensus(reports: StreetAnalystReportRow[]): Partial<StreetAnalystConsensus> {
  const latestByBroker = reports.filter(
    (r, i) => reports.findIndex((x) => x.brokerage === r.brokerage) === i,
  )
  const targets = latestByBroker.map((r) => r.target_price).filter((t): t is number => t != null)
  const n = latestByBroker.length || null
  return {
    consensus_target_price: targets.length ? round1(mean(targets)) : null,
    highest_target_price: targets.length ? Math.max(...targets) : null,
    lowest_target_price: targets.length ? Math.min(...targets) : null,
    analyst_count: n,
    buy_count: n ? latestByBroker.filter((r) => isBuySide(r.rating)).length : null,
    hold_count: n ? latestByBroker.filter((r) => r.rating === 'Hold' || r.rating === 'Equal-weight').length : null,
    sell_count: n ? latestByBroker.filter((r) => isSell(r.rating)).length : null,
  }
}

/** First non-null across the inputs (in priority order). */
function firstNum(...vals: Array<number | null | undefined>): number | null {
  for (const v of vals) if (v != null) return v
  return null
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
    const date = fetched_at.slice(0, 10)
    const warnings: string[] = []
    const upstream: string[] = []
    const existing = await readExisting()
    let blocked = false

    // 1. Broker Research cards (HTML).
    let reports: StreetAnalystReportRow[] = []
    try {
      const { buffer, mode } = await fetchOrLoadRaw(BROKER_URL, 'moneycontrol', `niva-broker-${date}.html`, /\.html?$/i)
      reports = parseBrokerResearch(cheerio.load(buffer.toString('utf8')), BROKER_URL)
      if (reports.length) upstream.push('Moneycontrol Broker Research')
      else warnings.push('Broker Research page fetched but no broker cards matched (DOM may have changed).')
      await appendLog(`${PARSER_NAME}.log`, { source: 'broker_research', mode, reports: reports.length })
    } catch (err) {
      const msg = errMsg(err)
      blocked = blocked || isBlock(msg)
      warnings.push(`Broker Research fetch failed: ${msg}`)
    }

    // 2. Consensus / price-forecast (JSON API). Try candidates; keep first hit.
    let apiConsensus: Partial<StreetAnalystConsensus> | null = null
    for (let i = 0; i < FORECAST_URLS.length; i++) {
      try {
        const { buffer, mode } = await fetchOrLoadRaw(FORECAST_URLS[i], 'moneycontrol/forecast', `niva-forecast${i}-${date}.json`, /\.json$/i)
        const parsed = parseForecastJson(buffer)
        await appendLog(`${PARSER_NAME}.log`, { source: 'forecast', endpoint: i, mode, got: !!parsed })
        if (parsed) {
          apiConsensus = parsed
          upstream.push('Moneycontrol Estimates')
          break
        }
      } catch (err) {
        const msg = errMsg(err)
        blocked = blocked || isBlock(msg)
        warnings.push(`Forecast endpoint ${i} failed: ${msg}`)
      }
    }

    // 3. Live market quote (JSON pricefeed) — current price + 52-week range.
    let market: StreetMarket | null = null
    try {
      const { buffer, mode } = await fetchOrLoadRaw(PRICE_URL, 'moneycontrol/price', `niva-price-${date}.json`, /\.json$/i)
      market = parsePriceFeed(buffer)
      if (market) {
        if (!market.price_as_of) market.price_as_of = date
        upstream.push('Moneycontrol Price')
      }
      await appendLog(`${PARSER_NAME}.log`, { source: 'price', mode, price: market?.current_price ?? null })
    } catch (err) {
      const msg = errMsg(err)
      blocked = blocked || isBlock(msg)
      warnings.push(`Price fetch failed: ${msg}`)
    }

    const derived = deriveConsensus(reports)
    const gotData = reports.length > 0 || apiConsensus != null || market != null

    if (gotData) {
      // Merge: JSON consensus wins, broker-note derivation fills gaps, prior
      // snapshot is the final fallback so a single missing field never nulls a
      // previously-known number.
      const consensus: StreetAnalystConsensus = {
        current_price: firstNum(market?.current_price, existing?.consensus.current_price),
        consensus_target_price: firstNum(apiConsensus?.consensus_target_price, derived.consensus_target_price, existing?.consensus.consensus_target_price),
        highest_target_price: firstNum(apiConsensus?.highest_target_price, derived.highest_target_price, existing?.consensus.highest_target_price),
        lowest_target_price: firstNum(apiConsensus?.lowest_target_price, derived.lowest_target_price, existing?.consensus.lowest_target_price),
        analyst_count: firstNum(apiConsensus?.analyst_count, derived.analyst_count, existing?.consensus.analyst_count),
        buy_count: firstNum(apiConsensus?.buy_count, derived.buy_count, existing?.consensus.buy_count),
        hold_count: firstNum(apiConsensus?.hold_count, derived.hold_count, existing?.consensus.hold_count),
        sell_count: firstNum(apiConsensus?.sell_count, derived.sell_count, existing?.consensus.sell_count),
        last_updated: date,
      }
      // Keep prior reports if this run got consensus but no fresh broker cards.
      const finalReports = reports.length > 0 ? reports : existing?.reports ?? []
      await writeSnapshot(SNAPSHOT_FILE, {
        _meta: {
          snapshot_id: 'street-analyst',
          description: 'Daily analyst coverage (broker ratings + targets + consensus) for Niva Bupa, aggregated from Moneycontrol feeds.',
          schema_version: '1.0.0',
          company_id: COMPANY_ID,
          company_name: COMPANY_NAME,
          source: 'Moneycontrol',
          source_url: BROKER_URL,
          upstream_sources: upstream,
          dataset: 'official',
          last_updated: date,
          last_successful_run: fetched_at,
          last_fetched_at: fetched_at,
          parser_status: 'ready',
          notes: `Live Moneycontrol pull from: ${upstream.join(', ') || 'n/a'}. Missing fields stay null (never fabricated).`,
        },
        consensus,
        market: market ?? existing?.market,
        reports: finalReports,
      } satisfies StreetAnalystSnapshot)
    } else if (existing && hasRealReports(existing)) {
      await writeSnapshot(SNAPSHOT_FILE, {
        ...existing,
        _meta: {
          ...existing._meta,
          last_fetched_at: fetched_at,
          parser_status: blocked ? 'blocked' : existing._meta.parser_status,
          notes: blocked
            ? 'Moneycontrol feeds blocked this run (datacenter IP). Kept prior coverage. Set INGEST_FETCH_PROXY to fetch via an in-region IP.'
            : existing._meta.notes,
        },
      } satisfies StreetAnalystSnapshot)
    }
    // else: no data and no prior real data → leave the curated seed untouched.

    const status: FetchResult['status'] = gotData ? 'success' : blocked ? 'blocked' : 'pending'
    return {
      source_id: SOURCE_ID,
      status,
      raw_file: null,
      records: [],
      records_fetched: reports.length,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
function isBlock(msg: string): boolean {
  return /\b(401|403)\b/.test(msg) || /offline/i.test(msg)
}
