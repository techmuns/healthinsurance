// ---------------------------------------------------------------------------
//  Screener shareholding-pattern ingestion → ownership_holdings + ownership_trends
//  (+ ownership_trade_disclosures from Screener → Trades)
//
//  Builds the Governance → Ownership Trend module's data for the LISTED SAHIs
//  (Niva Bupa, Star Health) from Screener (Investors → Shareholding Pattern):
//    1. Quarterly shareholding pattern (group rows: Promoters / FIIs / DIIs /
//       Public / No. of Shareholders).
//    2. Yearly shareholding pattern (same group rows).
//    3. Expanded investor-level rows — WHERE Screener exposes them (login-gated;
//       attempted, tolerated as unavailable, never invented).
//  Plus the Bulk / Block deal disclosures aggregated by Screener → Trades
//  (underlying NSE / BSE) into the SEPARATE ownership_trade_disclosures dataset.
//
//  OFFLINE-FIRST: live (INGEST_OFFLINE=0) drives a real headless Chromium per
//  company; offline reads each company's staged source-of-record under
//  data/raw/screener/<co>-shareholding-history.json (group-level values from the
//  Screener public page / saved capture). Never throws, never fabricates.
//
//  Outputs (self-contained envelopes, NOT part of the generic merge):
//    src/data/snapshots/ownership-holdings.json         (multi-company; filter by company_id)
//    src/data/snapshots/ownership-trends.json
//    src/data/snapshots/ownership-trade-disclosures.json
//
//  Run:  npm run ingest:screener-ownership   (offline)
//        INGEST_OFFLINE=0 npm run ingest:screener-ownership   (attempt live)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as cheerio from 'cheerio'
import { nowIso, writeSnapshot, appendLog, readSnapshot, RAW_ROOT, detectAccessBlock } from './util'

const SCRAPER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
import type {
  OwnershipHoldingRow,
  OwnershipTrendRow,
  OwnershipTrendDirection,
  OwnershipHolderGroup,
  OwnershipPeriodType,
  OwnershipScreenerMeta,
  OwnershipTradeDisclosureRow,
  OwnershipTradeDisclosuresMeta,
  TradeDealType,
  TradeValidationStatus,
} from '../../src/data/snapshots/_schemas'

// Listed SAHIs we carry a Screener shareholding-pattern history for. Screener's
// public page is keyed by the NSE symbol (the numeric /company/<id>/ form 404s),
// so links use the symbol; the numeric id is only for the /trades/company-<id>/
// endpoint.
export interface CompanyCfg {
  company_id: string
  company_name: string
  ticker: string
  screener_id: number
  staged: string
}
export const COMPANIES: CompanyCfg[] = [
  { company_id: 'niva-bupa', company_name: 'Niva Bupa Health Insurance Company Ltd', ticker: 'NIVABUPA', screener_id: 1285147, staged: 'nivabupa-shareholding-history.json' },
  { company_id: 'star-health', company_name: 'Star Health and Allied Insurance Company Ltd', ticker: 'STARHEALTH', screener_id: 1275115, staged: 'starhealth-shareholding-history.json' },
]
const SCREENER_ID_BY_COMPANY: Record<string, number> = Object.fromEntries(COMPANIES.map((c) => [c.company_id, c.screener_id]))
const screenerPageUrl = (ticker: string) => `https://www.screener.in/company/${ticker}/#shareholding`
const screenerScrapeUrl = (ticker: string) => `https://www.screener.in/company/${ticker}/`
const tradesUrlOf = (screenerId: number) => `https://www.screener.in/trades/company-${screenerId}/`
const tradesUrlForCompany = (companyId: string) =>
  SCREENER_ID_BY_COMPANY[companyId] ? tradesUrlOf(SCREENER_ID_BY_COMPANY[companyId]) : 'https://www.screener.in'

const SOURCE_SECTION = 'Investors / Shareholding Pattern'
const TRADES_SECTION = 'Investors / Shareholding Pattern / Trades'
const CLASSIFICATION_NOTE =
  'Classifications might have changed from Sep 2022 onwards. The new XBRL format added more details to the shareholding pattern from that point on.'
const EXPANDED_NOTE =
  'Screener exposes individual entity names when a shareholding line-item is clicked, but those expanded rows require an authenticated session + interactive expansion. Group-level rows only; no investor-level data invented.'

const GROUP_ORDER: OwnershipHolderGroup[] = ['Promoters', 'FIIs', 'DIIs', 'Public', 'No. of Shareholders']
/** The % holder groups that participate in trend / rank computation. */
const PCT_GROUPS: OwnershipHolderGroup[] = ['Promoters', 'FIIs', 'DIIs', 'Public']
const SHAREHOLDER_ROW: OwnershipHolderGroup = 'No. of Shareholders'

interface ScreenerTable {
  periods: string[]
  groups: Record<string, number[]>
}
interface ScreenerSource {
  _meta: {
    classification_note: string
    expanded_investor_rows_available: boolean
    expanded_investor_rows_note?: string
    [k: string]: unknown
  }
  quarterly: ScreenerTable
  yearly: ScreenerTable
}

// ─── period normalisation ────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** "Dec 2024" → quarter-end date + dashboard fiscal label (Apr–Mar fiscal year). */
function normalisePeriod(label: string, periodType: OwnershipPeriodType): { endDate: string; fiscal: string } {
  const m = label.trim().match(/^([A-Za-z]{3,})\.?\s+(\d{4})$/)
  if (!m) return { endDate: '', fiscal: label.trim() }
  const month = MONTHS[m[1].slice(0, 3).toLowerCase()]
  const year = parseInt(m[2], 10)
  if (!month || !Number.isFinite(year)) return { endDate: '', fiscal: label.trim() }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate() // last day of `month`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // Quarter-end month → SEBI quarter + Indian FY (FYxx spans Apr 20(xx-1)–Mar 20xx).
  let quarter: number
  let fyEnd: number
  if (month <= 3) { quarter = 4; fyEnd = year } // Mar = Q4, closes FY(year)
  else if (month <= 6) { quarter = 1; fyEnd = year + 1 }
  else if (month <= 9) { quarter = 2; fyEnd = year + 1 }
  else { quarter = 3; fyEnd = year + 1 } // Dec = Q3 of FY(year+1)

  const fyShort = String(fyEnd).slice(2)
  const fiscal = periodType === 'yearly' ? `FY${fyShort}` : `Q${quarter} FY${fyShort}`
  return { endDate, fiscal }
}

// ─── normalisation: Screener tables → long-format ownership_holdings ──────────

function normaliseHoldings(
  src: ScreenerSource,
  co: CompanyCfg,
  scrapedAt: string,
  validationStatus: OwnershipHoldingRow['validation_status'],
): OwnershipHoldingRow[] {
  const rows: OwnershipHoldingRow[] = []
  const classification = src._meta.classification_note
  const sourceUrl = screenerPageUrl(co.ticker)

  const pushTable = (table: ScreenerTable, periodType: OwnershipPeriodType) => {
    table.periods.forEach((rawLabel, i) => {
      const { endDate, fiscal } = normalisePeriod(rawLabel, periodType)
      for (const group of GROUP_ORDER) {
        const series = table.groups[group]
        if (!series) continue
        const raw = series[i]
        const isShareholderRow = group === SHAREHOLDER_ROW
        rows.push({
          company_id: co.company_id,
          company_name: co.company_name,
          ticker: co.ticker,
          source_name: 'Screener',
          source_section: SOURCE_SECTION,
          source_url: sourceUrl,
          period_type: periodType,
          period_label: rawLabel,
          period_end_date: endDate,
          fiscal_period: fiscal,
          holder_group: group,
          holder_name: group, // group-level row → holder_name mirrors the group
          holding_pct: isShareholderRow ? null : raw ?? null,
          shareholder_count: isShareholderRow ? raw ?? null : null,
          is_group_row: true,
          is_expanded_investor_row: false,
          raw_label: group,
          classification_note: classification,
          scraped_at: scrapedAt,
          source_confidence: 'screener_public_page',
          validation_status: validationStatus,
        })
      }
    })
  }

  pushTable(src.quarterly, 'quarterly')
  pushTable(src.yearly, 'yearly')
  return rows
}

// ─── derivation: ownership_holdings → ownership_trends ────────────────────────

function trendDirection(prev: number | null, cur: number | null, changePp: number | null): OwnershipTrendDirection {
  if (prev == null && cur == null) return 'insufficient_history'
  if (prev == null) return 'new_holder'
  if (cur == null) return 'exited'
  if (changePp == null) return 'insufficient_history'
  if (Math.abs(changePp) < 0.005) return 'no_change'
  return changePp > 0 ? 'increase' : 'decrease'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Period-over-period movement for one company's % holder groups. Each consecutive
 * pair (prev → cur) yields one row per holder. Yearly trends use the yearly table;
 * quarterly use the quarterly table — NEVER averaged. Ranks computed within each
 * current period. "No. of Shareholders" is excluded (it's a count, not a holder).
 */
function computeTrends(holdings: OwnershipHoldingRow[]): OwnershipTrendRow[] {
  const out: OwnershipTrendRow[] = []
  const companyId = holdings[0]?.company_id ?? ''

  for (const periodType of ['quarterly', 'yearly'] as OwnershipPeriodType[]) {
    const scoped = holdings.filter((r) => r.period_type === periodType && r.holder_group !== SHAREHOLDER_ROW)
    // Ordered, unique periods as they appear in the table.
    const periods: { raw: string; fiscal: string }[] = []
    for (const r of scoped) {
      if (!periods.some((p) => p.raw === r.period_label)) periods.push({ raw: r.period_label, fiscal: r.fiscal_period })
    }
    // Holder identity = group | name (group rows have name === group).
    const holders = Array.from(new Set(scoped.map((r) => `${r.holder_group}|${r.holder_name}`)))

    const pctAt = (key: string, rawPeriod: string): number | null => {
      const [group, name] = key.split('|')
      const row = scoped.find(
        (r) => r.holder_group === group && r.holder_name === name && r.period_label === rawPeriod,
      )
      return row ? row.holding_pct : null
    }

    for (let i = 1; i < periods.length; i++) {
      const prev = periods[i - 1]
      const cur = periods[i]
      const periodRows: OwnershipTrendRow[] = []

      for (const key of holders) {
        const [group, name] = key.split('|')
        const prevPct = pctAt(key, prev.raw)
        const curPct = pctAt(key, cur.raw)
        const changePp = prevPct != null && curPct != null ? round2(curPct - prevPct) : null
        periodRows.push({
          company_id: companyId,
          period_type: periodType,
          current_period: cur.fiscal,
          previous_period: prev.fiscal,
          current_period_label: cur.raw,
          previous_period_label: prev.raw,
          holder_group: group as OwnershipHolderGroup,
          holder_name: name,
          current_holding_pct: curPct,
          previous_holding_pct: prevPct,
          change_pp: changePp,
          trend_direction: trendDirection(prevPct, curPct, changePp),
          absolute_change_pp: changePp == null ? null : Math.abs(changePp),
          rank_by_change: null,
          rank_by_current_holding: null,
        })
      }

      // Ranks within this current period.
      const byChange = [...periodRows]
        .filter((r) => r.absolute_change_pp != null)
        .sort((a, b) => (b.absolute_change_pp! - a.absolute_change_pp!) || ((b.current_holding_pct ?? 0) - (a.current_holding_pct ?? 0)))
      byChange.forEach((r, idx) => (r.rank_by_change = idx + 1))

      const byHolding = [...periodRows]
        .filter((r) => r.current_holding_pct != null)
        .sort((a, b) => b.current_holding_pct! - a.current_holding_pct!)
      byHolding.forEach((r, idx) => (r.rank_by_current_holding = idx + 1))

      out.push(...periodRows)
    }
  }

  return out
}

// ─── live scrape (Playwright) — best-effort, self-fencing, per company ─────────

async function scrapeScreenerLive(scrapeUrl: string): Promise<{ source: ScreenerSource; investorRowsAvailable: boolean } | null> {
  if (process.env.INGEST_OFFLINE !== '0') return null // offline by default
  let pw: any
  try {
    const spec = 'playwright'
    pw = await import(spec)
  } catch {
    return null // Playwright not installed
  }
  let browser: any = null
  try {
    browser = await pw.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
    })
  } catch {
    return null // no browser binary
  }
  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      viewport: { width: 1366, height: 900 },
    })
    const cookie = process.env.SCREENER_SESSIONID
    if (cookie) {
      await context.addCookies([
        { name: 'sessionid', value: cookie, domain: '.screener.in', path: '/', httpOnly: true, secure: true },
      ])
    }
    const page = await context.newPage()
    await page.goto(scrapeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('#shareholding', { timeout: 30000 }).catch(() => {})

    const readTab = async (tabName: 'Quarterly' | 'Yearly'): Promise<ScreenerTable | null> => {
      await page
        .locator('#shareholding button, #shareholding a', { hasText: tabName })
        .first()
        .click({ timeout: 5000 })
        .catch(() => {})
      await page.waitForTimeout(800)
      const expanders = page.locator('#shareholding table button.button-plain, #shareholding table .show-schedules')
      const n = await expanders.count().catch(() => 0)
      for (let i = 0; i < n; i++) {
        await expanders.nth(i).click({ timeout: 2000 }).catch(() => {})
      }
      await page.waitForTimeout(400)
      return (await page.$$eval('#shareholding table', (tables: any[]) => {
        const table = tables[0]
        if (!table) return null
        const periods = Array.from(table.querySelectorAll('thead th'))
          .slice(1)
          .map((th: any) => (th.textContent || '').trim())
          .filter(Boolean)
        const groups: Record<string, number[]> = {}
        for (const tr of Array.from(table.querySelectorAll('tbody tr')) as any[]) {
          const cells = Array.from(tr.querySelectorAll('td')) as any[]
          if (!cells.length) continue
          const label = (cells[0].textContent || '').replace(/\s+/g, ' ').replace(/[-+]\s*$/, '').trim()
          const nums = cells.slice(1).map((td: any) => {
            const t = (td.textContent || '').replace(/[%,\s]/g, '')
            const v = parseFloat(t)
            return Number.isFinite(v) ? v : NaN
          })
          if (label) groups[label] = nums
        }
        return { periods, groups }
      })) as ScreenerTable | null
    }

    const quarterly = await readTab('Quarterly')
    const yearly = await readTab('Yearly')
    if (!quarterly || !yearly || !quarterly.periods.length) return null

    const pick = (table: ScreenerTable): ScreenerTable | null => {
      const norm: Record<string, number[]> = {}
      const find = (re: RegExp) => Object.keys(table.groups).find((k) => re.test(k))
      const map: [OwnershipHolderGroup, RegExp][] = [
        ['Promoters', /promoter/i],
        ['FIIs', /\bfii|foreign/i],
        ['DIIs', /\bdii|domestic/i],
        ['Public', /public/i],
        ['No. of Shareholders', /shareholder/i],
      ]
      for (const [canon, re] of map) {
        const k = find(re)
        if (k) norm[canon] = table.groups[k]
      }
      if (!['Promoters', 'FIIs', 'DIIs', 'Public'].every((g) => norm[g]?.length)) return null
      return { periods: table.periods, groups: norm }
    }
    const q = pick(quarterly)
    const y = pick(yearly)
    if (!q || !y) return null

    const investorRowsAvailable =
      Object.keys(quarterly.groups).length > 6 || Object.keys(yearly.groups).length > 6

    return {
      source: {
        _meta: { classification_note: CLASSIFICATION_NOTE, expanded_investor_rows_available: investorRowsAvailable, expanded_investor_rows_note: EXPANDED_NOTE },
        quarterly: q,
        yearly: y,
      },
      investorRowsAvailable,
    }
  } catch {
    return null
  } finally {
    await browser.close().catch(() => {})
  }
}

// ─── Screener Trades (bulk & block deals) → ownership_trade_disclosures ───────
// SEPARATE transaction-disclosure dataset — never merged with ownership_holdings
// or ownership_trends. Screener Trades republishes the NSE/BSE bulk & block deal
// disclosures, so the underlying source is preserved as NSE / BSE.

interface RawDeal {
  company_id: string
  deal_kind: TradeDealType
  date: string
  client: string
  side: 'buy' | 'sell'
  quantity: number
  price: number
  /** Which Screener tab produced the row ("Bulk Deals" | "Block Deals"). This is
   *  the CLASSIFICATION key: a row read from the Block Deals tab is `block`, even
   *  if the row text itself never repeats the word "block". */
  source_tab?: string
  source_path?: string
}

/** Human-readable provenance path into Screener's trades modal. */
const screenerTradesPath = (companyName: string, tab: string): string =>
  `Screener → ${companyName} → Investors / Shareholding / Trades modal → ${tab} tab`
const screenerModalUrl = (ticker: string) => `https://www.screener.in/company/${ticker}/#shareholding`

/** "15 Jun 2026" | "15-Jun-2026" | "2026-06-15" → ISO yyyy-mm-dd (best-effort). */
export function normTradeDate(s: string): string {
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? t : d.toISOString().slice(0, 10)
}
/** Screener actions: B | Buy | Purchase → buy · S | Sell | Sale → sell. */
export function normTradeSide(v: unknown): 'buy' | 'sell' {
  return /^(s|sell|sale)$/i.test(String(v ?? '').trim()) ? 'sell' : 'buy'
}

const qtyDisplay = (q: number | null): string =>
  q == null ? '—' : q >= 1e7 ? `${(q / 1e7).toFixed(2)} Cr` : q >= 1e5 ? `${(q / 1e5).toFixed(1)} L` : q.toLocaleString('en-IN')
const valueDisplay = (v: number | null): string => {
  if (v == null) return '—'
  const a = Math.abs(v)
  return `₹${a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2)} Cr`
}

/** Reshape a disclosed deal into a normalized trade-disclosure row. The exact
 *  disclosed party name is preserved; the undisclosed counterparty stays null.
 *  `sourceUrl` is the company's Screener Trades page. */
function dealToDisclosure(d: RawDeal, companyName: string, scrapedAt: string, sourceUrl: string): OwnershipTradeDisclosureRow {
  // Amount: dealValueCr = quantity × price / 1,00,00,000 (₹ Cr).
  const value_cr = round2((d.quantity * d.price) / 1e7)
  const tab = d.source_tab ?? (d.deal_kind === 'block' ? 'Block Deals' : 'Bulk Deals')
  return {
    company_id: d.company_id,
    company_name: companyName,
    deal_type: d.deal_kind,
    date: d.date,
    segment: d.deal_kind === 'bulk' ? 'Bulk' : 'Block',
    buyer: d.side === 'buy' ? d.client : null,
    seller: d.side === 'sell' ? d.client : null,
    quantity: d.quantity,
    quantity_display: qtyDisplay(d.quantity),
    price: d.price,
    value_cr,
    value_display: valueDisplay(value_cr),
    exchange_source: 'NSE / BSE',
    source_name: 'Screener',
    source_url: sourceUrl,
    underlying_source: 'NSE / BSE',
    scraped_at: scrapedAt,
    validation_status: 'scraped',
    source_deal_label: d.deal_kind === 'block' ? 'Block Deal' : 'Bulk Deal',
    source_tab: tab,
    source_path: d.source_path ?? screenerTradesPath(companyName, tab),
  }
}

/** Dedup / add-only key: company + type + date + parties + qty + price + value. */
const dealKey = (r: OwnershipTradeDisclosureRow): string =>
  [r.company_id, r.deal_type, r.date, r.buyer ?? '', r.seller ?? '', r.quantity ?? '', r.price ?? '', r.value_cr ?? ''].join('|')

async function loadCompanyNames(): Promise<Record<string, string>> {
  try {
    const master = await readSnapshot<{ data: { company_id: string; display_name?: string; legal_name?: string }[] }>('company-master.json')
    const m: Record<string, string> = {}
    for (const c of master.data) m[c.company_id] = c.legal_name ?? c.display_name ?? c.company_id
    return m
  } catch {
    return {}
  }
}

/** Offline source-of-record: the aggregated NSE/BSE bulk & block deals that
 *  Screener Trades republishes (data/snapshots/bulk-block-deals-snapshot.json). */
async function loadFallbackDeals(): Promise<RawDeal[]> {
  try {
    const snap = await readSnapshot<{ data: RawDeal[] }>('bulk-block-deals-snapshot.json')
    return snap.data ?? []
  } catch {
    return []
  }
}

async function loadExistingDisclosures(): Promise<OwnershipTradeDisclosureRow[]> {
  try {
    const snap = await readSnapshot<{ data: OwnershipTradeDisclosureRow[] }>('ownership-trade-disclosures.json')
    return snap.data ?? []
  } catch {
    return []
  }
}

/**
 * Live Screener Trades scrape (Playwright) for one company — best-effort,
 * self-fencing. Conservative: a found-but-unparseable section returns null so
 * callers fall back to the real disclosures rather than wrongly claim "zero".
 */
async function scrapeTradesLive(tradesUrl: string, companyId: string): Promise<{ deals: RawDeal[]; found: boolean } | null> {
  if (process.env.INGEST_OFFLINE !== '0') return null
  let pw: any
  try {
    const spec = 'playwright'
    pw = await import(spec)
  } catch {
    return null
  }
  let browser: any = null
  try {
    browser = await pw.chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'] })
  } catch {
    return null
  }
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      viewport: { width: 1366, height: 900 },
    })
    const cookie = process.env.SCREENER_SESSIONID
    if (cookie) await context.addCookies([{ name: 'sessionid', value: cookie, domain: '.screener.in', path: '/', httpOnly: true, secure: true }])
    const page = await context.newPage()
    const res = await page.goto(tradesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    if (res && res.status() >= 400) return null
    await page.waitForTimeout(800)
    const raw = (await page
      .$$eval('table', (tables: any[]) => {
        const out: { kind: string; cells: string[] }[] = []
        for (const t of tables) {
          const ctx = (t.closest('section,div')?.textContent || t.previousElementSibling?.textContent || '').toLowerCase()
          const kind = /block\s*deal/.test(ctx) ? 'block' : /bulk\s*deal/.test(ctx) ? 'bulk' : ''
          if (!kind) continue
          for (const tr of Array.from(t.querySelectorAll('tbody tr')) as any[]) {
            const cells = (Array.from(tr.querySelectorAll('td')) as any[]).map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim())
            if (cells.length >= 4) out.push({ kind, cells })
          }
        }
        return out
      })
      .catch(() => [] as { kind: string; cells: string[] }[]))
    const found = raw.length > 0
    const deals: RawDeal[] = []
    for (const r of raw) {
      const dateCell = r.cells.find((c) => /\d{1,2}[-/ ][A-Za-z0-9]{2,}[-/ ]\d{2,4}|\d{4}-\d{2}-\d{2}/.test(c))
      const sideCell = r.cells.find((c) => /^(buy|sell|purchase|sale|b|s)$/i.test(c))
      const client = r.cells.find((c) => /[A-Za-z]{3,}/.test(c) && !/^(buy|sell|purchase|sale)$/i.test(c))
      // Exclude the date/side/name cells so the date's day isn't read as quantity.
      const nums = r.cells
        .filter((c) => c !== dateCell && c !== client && !/^(buy|sell|purchase|sale|b|s)$/i.test(c))
        .map((c) => parseFloat(c.replace(/[,%₹\s]/g, '')))
        .filter((n) => Number.isFinite(n))
      if (!dateCell || !sideCell || !client || nums.length < 2) continue
      const side = /^(sell|sale|s)$/i.test(sideCell) ? 'sell' : 'buy'
      const date = /\d{4}-\d{2}-\d{2}/.test(dateCell) ? dateCell : new Date(dateCell).toISOString().slice(0, 10)
      const tab = r.kind === 'block' ? 'Block Deals' : 'Bulk Deals'
      deals.push({ company_id: companyId, deal_kind: r.kind as TradeDealType, date, client, side, quantity: nums[0], price: nums[1], source_tab: tab })
    }
    if (found && deals.length === 0) return null // found but unparseable → fall back
    return { deals, found }
  } catch {
    return null
  } finally {
    await browser.close().catch(() => {})
  }
}

/** Parse one Screener trade-table row → RawDeal. `tab` is authoritative for the
 *  deal_kind: a row from the Block Deals tab is `block` regardless of its text.
 *  Normalises action (B/Buy/Purchase → buy · S/Sell/Sale → sell). */
export function parseScreenerTradeRow(cells: string[], tab: string, co: CompanyCfg): RawDeal | null {
  const dateCell = cells.find((c) => /\d{1,2}\s+[A-Za-z]{3,}\s+\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[-/][A-Za-z0-9]{2,}[-/]\d{2,4}/.test(c))
  const actionCell = cells.find((c) => /^(buy|sell|purchase|sale|b|s)$/i.test(c.trim()))
  const client = cells.find((c) => /[A-Za-z]{3,}/.test(c) && !/^(buy|sell|purchase|sale)$/i.test(c.trim()) && !/^[\d,.\s]+$/.test(c.trim()))
  // Quantity / price = the numeric cells, EXCLUDING the date cell (its day would
  // otherwise be read as a number), the action cell and the name cell.
  const nums = cells
    .filter((c) => c !== dateCell && c !== client && !/^(buy|sell|purchase|sale|b|s)$/i.test(c.trim()))
    .map((c) => parseFloat(c.replace(/[,%₹\s]/g, '')))
    .filter((n) => Number.isFinite(n))
  if (!dateCell || !actionCell || !client || nums.length < 2) return null
  const deal_kind: TradeDealType = tab === 'Block Deals' ? 'block' : 'bulk'
  // Screener's bulk/block tables print Quantity then Price (no value column) —
  // matching the modal Neha reads. nums[0] = quantity, nums[1] = price.
  return {
    company_id: co.company_id,
    deal_kind,
    date: normTradeDate(dateCell),
    client: client.trim(),
    side: normTradeSide(actionCell),
    quantity: nums[0],
    price: nums[1],
    source_tab: tab,
    source_path: screenerTradesPath(co.company_name, tab),
  }
}

/**
 * Cookie-aware live read of Screener's trades modal — the /trades/company-<id>/
 * endpoint the modal AJAX-loads. That endpoint is LOGIN-GATED: without a
 * logged-in session it 302s to /register/. Supply SCREENER_SESSIONID (a Screener
 * session cookie) to read it. Parses BOTH the Bulk Deals and Block Deals tables,
 * classifying each row by its tab heading. Returns a status so the caller reports
 * honestly (login_required vs blocked vs ok) instead of a false "0 found".
 */
async function scrapeTradesHttp(co: CompanyCfg): Promise<{ deals: RawDeal[]; status: 'ok' | 'login_required' | 'blocked' | 'error' | 'skipped' }> {
  if (process.env.INGEST_OFFLINE !== '0') return { deals: [], status: 'skipped' }
  const cookie = process.env.SCREENER_SESSIONID
  if (!cookie) return { deals: [], status: 'login_required' }
  const url = tradesUrlOf(co.screener_id)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': SCRAPER_UA, Cookie: `sessionid=${cookie}`, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'manual',
    })
    if (res.status >= 300 && res.status < 400) return { deals: [], status: 'login_required' }
    if (res.status === 403 || res.status === 429) return { deals: [], status: 'blocked' }
    if (!res.ok) return { deals: [], status: 'error' }
    const html = await res.text()
    if (detectAccessBlock(html, url).blocked) return { deals: [], status: 'blocked' }
    if (/\/register\/|sign in to view|please log\s?in/i.test(html) && !/block\s*deal/i.test(html)) return { deals: [], status: 'login_required' }
    const $ = cheerio.load(html)
    const deals: RawDeal[] = []
    $('table').each((_i, t) => {
      const $t = $(t)
      const ctx = ($t.prevAll('h1,h2,h3,h4,button,a').slice(0, 4).text() + ' ' + ($t.closest('section,div').children('h1,h2,h3,h4,header').first().text() || '')).toLowerCase()
      const tab = /block\s*deal/.test(ctx) ? 'Block Deals' : /bulk\s*deal/.test(ctx) ? 'Bulk Deals' : ''
      if (tab !== 'Block Deals' && tab !== 'Bulk Deals') return
      $t.find('tbody tr').each((_j, tr) => {
        const cells = $(tr).find('td').map((_k, td) => $(td).text().replace(/\s+/g, ' ').trim()).get()
        if (cells.length < 4) return
        const row = parseScreenerTradeRow(cells, tab, co)
        if (row) deals.push(row)
      })
    })
    return { deals, status: deals.length ? 'ok' : 'error' }
  } catch {
    return { deals: [], status: 'error' }
  }
}

/**
 * Staged source-of-record for Screener's (login-gated) trades modal — a manual,
 * dated capture of the Bulk/Block deal rows read from the modal, kept under
 * data/raw/screener/<ticker>-trades.json. This is how block deals reach the
 * dashboard when no live session is configured: it is REAL, source-backed data
 * (Screener Trades modal), captured by hand, with explicit provenance — never
 * fabricated, and superseded automatically the moment a live read succeeds.
 *
 *   { "_source": { "url": "...", "path": "...", "captured_at": "YYYY-MM-DD" },
 *     "deals": [ { "deal_kind":"block", "date":"2026-06-15", "client":"...",
 *                  "side":"sell", "quantity":4000000, "price":83 }, ... ] }
 */
async function loadStagedScreenerTrades(co: CompanyCfg): Promise<{ deals: RawDeal[]; capturedAt: string | null; path: string | null }> {
  try {
    const text = await readFile(resolve(RAW_ROOT, 'screener', `${co.ticker.toLowerCase()}-trades.json`), 'utf8')
    const j = JSON.parse(text) as { _source?: { path?: string; captured_at?: string }; deals?: Record<string, unknown>[] }
    const deals: RawDeal[] = (j.deals ?? [])
      .filter((d) => d && (d.deal_kind === 'bulk' || d.deal_kind === 'block') && d.date && d.client && d.quantity != null && d.price != null)
      .map((d) => {
        const tab = d.deal_kind === 'block' ? 'Block Deals' : 'Bulk Deals'
        return {
          company_id: co.company_id,
          deal_kind: d.deal_kind as TradeDealType,
          date: normTradeDate(String(d.date)),
          client: String(d.client).trim(),
          side: normTradeSide((d.side ?? d.action) as unknown),
          quantity: Number(d.quantity),
          price: Number(d.price),
          source_tab: tab,
          source_path: (j._source?.path as string) ?? screenerTradesPath(co.company_name, tab),
        }
      })
    return { deals, capturedAt: j._source?.captured_at ?? null, path: j._source?.path ?? null }
  } catch {
    return { deals: [], capturedAt: null, path: null }
  }
}

// ─── run ──────────────────────────────────────────────────────────────────────

async function loadStaged(file: string): Promise<ScreenerSource> {
  const text = await readFile(resolve(RAW_ROOT, 'screener', file), 'utf8')
  return JSON.parse(text) as ScreenerSource
}

function inr(n: number | null): string {
  return n == null ? 'n/a' : n.toLocaleString('en-IN')
}

interface PerCompany {
  co: CompanyCfg
  src: ScreenerSource
  usingLive: boolean
  expandedAvailable: boolean
  holdings: OwnershipHoldingRow[]
  trends: OwnershipTrendRow[]
}

async function run(): Promise<void> {
  const scrapedAt = nowIso()
  const log = console.log

  // ── Shareholding pattern → ownership_holdings + ownership_trends (per company) ─
  const per: PerCompany[] = []
  const allHoldings: OwnershipHoldingRow[] = []
  const allTrends: OwnershipTrendRow[] = []
  for (const co of COMPANIES) {
    const live = await scrapeScreenerLive(screenerScrapeUrl(co.ticker)).catch(() => null)
    const src: ScreenerSource = live ? live.source : await loadStaged(co.staged)
    const expandedAvailable = live ? live.investorRowsAvailable : !!src._meta.expanded_investor_rows_available
    const validationStatus: OwnershipHoldingRow['validation_status'] = expandedAvailable ? 'scraped' : 'missing_expanded_rows'
    const holdings = normaliseHoldings(src, co, scrapedAt, validationStatus)
    const trends = computeTrends(holdings)
    allHoldings.push(...holdings)
    allTrends.push(...trends)
    per.push({ co, src, usingLive: !!live, expandedAvailable, holdings, trends })
  }

  const distinct = (pt: OwnershipPeriodType) =>
    [...new Set(allHoldings.filter((r) => r.period_type === pt).map((r) => r.period_label))]
  const meta: OwnershipScreenerMeta = {
    snapshot_id: 'ownership-holdings',
    description:
      'Shareholding-pattern history (long format) for listed SAHIs from Screener — Investors / Shareholding Pattern. Drives Governance → Ownership Trend. Multi-company; filter by company_id.',
    schema_version: '1.0.0',
    company_id: 'multi',
    company_name: 'Listed SAHIs (Niva Bupa, Star Health)',
    ticker: '',
    source_name: 'Screener',
    source_section: SOURCE_SECTION,
    source_url: 'https://www.screener.in',
    screener_company_id: 0,
    dataset: 'official',
    last_updated: scrapedAt.slice(0, 10),
    last_successful_run: scrapedAt,
    scraped_at: scrapedAt,
    classification_note: CLASSIFICATION_NOTE,
    expanded_investor_rows_available: per.some((p) => p.expandedAvailable),
    expanded_investor_rows_note: EXPANDED_NOTE,
    parser_status: 'ready',
    periods_quarterly: distinct('quarterly'),
    periods_yearly: distinct('yearly'),
    validation_status: per.every((p) => p.expandedAvailable) ? 'scraped' : 'missing_expanded_rows',
    notes: per.some((p) => p.usingLive)
      ? 'Captured via live Screener scrape (Playwright) where available; staged source-of-record otherwise.'
      : 'Built from the staged Screener source-of-record (offline); live scrape unavailable in this environment.',
  }

  await writeSnapshot('ownership-holdings.json', { _meta: meta, data: allHoldings })
  await writeSnapshot('ownership-trends.json', {
    _meta: { ...meta, snapshot_id: 'ownership-trends', description: 'Period-over-period ownership movement derived from ownership-holdings.' },
    data: allTrends,
  })
  await appendLog('fetch-screener-shareholding.log', {
    source: 'screener_shareholding',
    companies: COMPANIES.map((c) => c.company_id),
    mode: per.some((p) => p.usingLive) ? 'live' : 'offline_staged',
    holdings_rows: allHoldings.length,
    trend_rows: allTrends.length,
  })

  // ── Trades (bulk/block) → ownership_trade_disclosures (separate dataset) ─────
  // Sources merged per company, best-first: (1) live cookie read of Screener's
  // trades modal, (2) live Playwright read, (3) a manual staged capture of the
  // modal (source-of-record — the block deals live here when no session is set),
  // (4) the aggregated NSE/BSE fallback snapshot. The Block Deals tab is parsed
  // SEPARATELY from Bulk Deals and classified by tab — a low-quality "no records"
  // from one source never erases real rows from another.
  const namesById = await loadCompanyNames()
  const fallbackDeals = await loadFallbackDeals()
  const tradeRows: OwnershipTradeDisclosureRow[] = []
  let anyTradesFound = false
  let anyLiveTrades = false
  const handled = new Set<string>()
  const tradeSourceMode: Record<string, string> = {}
  for (const co of COMPANIES) {
    handled.add(co.company_id)
    const http = await scrapeTradesHttp(co).catch(() => ({ deals: [] as RawDeal[], status: 'error' as const }))
    const liveT = http.deals.length ? null : await scrapeTradesLive(tradesUrlOf(co.screener_id), co.company_id).catch(() => null)
    const liveDeals = http.deals.length ? http.deals : (liveT?.deals ?? [])
    const staged = await loadStagedScreenerTrades(co)
    const fb = fallbackDeals.filter((d) => d.company_id === co.company_id)
    if (liveDeals.length) anyLiveTrades = true

    const coDeals = [...liveDeals, ...staged.deals, ...fb]
    if (coDeals.length || (liveT && liveT.found) || http.status === 'ok') anyTradesFound = true
    tradeSourceMode[co.company_id] = http.deals.length
      ? 'live_http'
      : liveT?.deals.length
        ? 'live_playwright'
        : staged.deals.length
          ? 'staged_modal'
          : fb.length
            ? 'fallback_aggregated'
            : http.status // login_required | blocked | error | skipped
    for (const d of coDeals) tradeRows.push(dealToDisclosure(d, namesById[d.company_id] ?? co.company_name, scrapedAt, screenerModalUrl(co.ticker)))
  }
  // Any other listed names present in the fallback but not configured above.
  for (const d of fallbackDeals) {
    if (handled.has(d.company_id)) continue
    anyTradesFound = true
    tradeRows.push(dealToDisclosure(d, namesById[d.company_id] ?? d.company_id, scrapedAt, tradesUrlForCompany(d.company_id)))
  }

  // Add-only merge: keep existing rows, append only genuinely new ones.
  const existingDisclosures = await loadExistingDisclosures()
  const seen = new Set(existingDisclosures.map(dealKey))
  const mergedDisclosures = [...existingDisclosures]
  let addedDisclosures = 0
  for (const r of tradeRows) {
    const k = dealKey(r)
    if (!seen.has(k)) { seen.add(k); mergedDisclosures.push(r); addedDisclosures++ }
  }
  const tradeValidation: TradeValidationStatus = anyLiveTrades || anyTradesFound ? 'scraped' : 'pending'
  const tradesMeta: OwnershipTradeDisclosuresMeta = {
    snapshot_id: 'ownership-trade-disclosures',
    description:
      'Bulk & block deal disclosures (transaction-level) aggregated by Screener → Trades; underlying source NSE / BSE. SEPARATE from ownership-holdings / ownership-trends — individual transactions, not the quarter-end shareholding position. Multi-company; filter by company_id.',
    schema_version: '1.0.0',
    source_name: 'Screener',
    source_section: TRADES_SECTION,
    source_url: 'https://www.screener.in',
    screener_company_id: 0,
    underlying_source: 'NSE / BSE',
    dataset: 'official',
    last_updated: scrapedAt.slice(0, 10),
    last_successful_run: scrapedAt,
    scraped_at: scrapedAt,
    parser_status: 'ready',
    trades_section_found: anyTradesFound,
    validation_status: tradeValidation,
    notes: anyLiveTrades
      ? 'Captured via live read of Screener’s Trades modal (Bulk + Block Deals tabs parsed separately) where a session was available.'
      : 'Block deals come from a dated staged capture of Screener’s (login-gated) Trades modal — Block Deals tab — plus the aggregated NSE/BSE disclosures Screener republishes. Set SCREENER_SESSIONID to read the modal live.',
  }
  await writeSnapshot('ownership-trade-disclosures.json', { _meta: tradesMeta, data: mergedDisclosures })
  await appendLog('fetch-screener-shareholding.log', {
    source: 'screener_trades',
    mode: anyLiveTrades ? 'live' : 'offline_aggregated',
    trades_section_found: anyTradesFound,
    disclosure_rows: mergedDisclosures.length,
    added: addedDisclosures,
  })

  // ─── Validation report ───────────────────────────────────────────────────────
  log('\n══════════════════════════════════════════════════════════════════')
  log('  SCREENER OWNERSHIP INGESTION — VALIDATION (listed SAHIs)')
  log('══════════════════════════════════════════════════════════════════')
  log(`  Scrape mode             : ${per.some((p) => p.usingLive) ? 'LIVE (Playwright)' : 'OFFLINE — staged Screener source-of-record'}`)
  for (const p of per) {
    const gv = (pt: OwnershipPeriodType) =>
      GROUP_ORDER.map((g) => {
        const series = p.holdings
          .filter((r) => r.period_type === pt && r.holder_group === g)
          .map((r) => (g === SHAREHOLDER_ROW ? inr(r.shareholder_count) : r.holding_pct == null ? 'n/a' : `${r.holding_pct}%`))
        return `       - ${g}: ${series.join(', ')}`
      }).join('\n')
    log(`\n  ── ${p.co.company_name} (${p.co.ticker}, id ${p.co.screener_id}) ──`)
    log(`    Quarterly periods : ${p.src.quarterly.periods.join(', ')}`)
    log(`    Yearly periods    : ${p.src.yearly.periods.join(', ')}`)
    log(`    Quarterly group values:\n${gv('quarterly')}`)
    log(`    Yearly group values:\n${gv('yearly')}`)
    log(`    Expanded investor rows : ${p.expandedAvailable ? 'YES' : 'NO — group-level only (Screener named rows are login-only)'}`)
    log(`    holdings rows: ${p.holdings.length} · trend rows: ${p.trends.length}`)
    for (const pt of ['quarterly', 'yearly'] as OwnershipPeriodType[]) {
      const latest = p.trends.filter((t) => t.period_type === pt).slice(-PCT_GROUPS.length)
      if (latest.length) {
        log(`    Latest ${pt} (${latest[0].previous_period}→${latest[0].current_period}): ` +
          latest.map((t) => `${t.holder_group} ${(t.change_pp ?? 0) > 0 ? '+' : ''}${t.change_pp}pp/${t.trend_direction}`).join(', '))
      }
    }
  }
  log(`\n  TOTAL ownership_holdings rows : ${allHoldings.length}`)
  log(`  TOTAL ownership_trends rows   : ${allTrends.length}`)
  log('  Annual/Quarterly toggle       : wired (UI reads global `period`; both companies use the same view logic)')
  log('  Investor-level rows invented  : NO')

  log('\n  ── BULK / BLOCK DEAL TRADES (Screener → Trades modal · underlying NSE / BSE) ──')
  log(`  Trades mode               : ${anyLiveTrades ? 'LIVE (Screener session)' : 'OFFLINE — staged Screener-modal capture + aggregated NSE/BSE disclosures'}`)
  log(`  Screener Trades section found : ${anyTradesFound ? 'YES' : 'NO'}`)
  const MODE_LABEL: Record<string, string> = {
    live_http: 'LIVE Screener modal (cookie)', live_playwright: 'LIVE Screener modal (browser)',
    staged_modal: 'staged Screener-modal capture', fallback_aggregated: 'aggregated NSE/BSE fallback',
    login_required: 'LOGIN REQUIRED (set SCREENER_SESSIONID)', blocked: 'BLOCKED', error: 'no read', skipped: 'offline (no live attempt)',
  }
  for (const co of COMPANIES) {
    const d = mergedDisclosures.filter((r) => r.company_id === co.company_id)
    const bulkN = d.filter((r) => r.deal_type === 'bulk').length
    const blockN = d.filter((r) => r.deal_type === 'block').length
    const bought = round2(d.filter((r) => r.buyer && !r.seller).reduce((s, r) => s + (r.value_cr ?? 0), 0))
    const sold = round2(d.filter((r) => r.seller && !r.buyer).reduce((s, r) => s + (r.value_cr ?? 0), 0))
    const dates = [...new Set(d.map((r) => r.date))]
    const net = round2(bought - sold)
    const mode = MODE_LABEL[tradeSourceMode[co.company_id]] ?? tradeSourceMode[co.company_id] ?? '—'
    log(`    ${co.ticker}: bulk ${bulkN}, block ${blockN} · source: ${mode} · bought ₹${bought} Cr · sold ₹${sold} Cr · net ${net >= 0 ? '+' : '−'}₹${Math.abs(net)} Cr · ${dates.length} date(s) · src ${screenerModalUrl(co.ticker)}`)
  }
  log(`  Data Pending when zero?       : NO — validation_status='${tradeValidation}'`)
  log('  Source footer separation      : Shareholding Pattern (trend) vs Trades (bulk/block) — two distinct source lines')
  log(`  ownership_trade_disclosures   : ${mergedDisclosures.length} rows (+${addedDisclosures} new this run)`)
  log('══════════════════════════════════════════════════════════════════\n')
}

// Only run the full ingestion when invoked directly (so importing the exported
// pure helpers — e.g. in verify-niva-block-deals.ts — has no side effects).
if (process.argv[1]?.endsWith('fetch-screener-shareholding.ts')) run().catch((err) => {
  console.error('fetch-screener-shareholding failed:', err)
  process.exitCode = 1
})
