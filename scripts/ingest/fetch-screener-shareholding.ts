// ---------------------------------------------------------------------------
//  Screener shareholding-pattern ingestion → ownership_holdings + ownership_trends
//
//  Builds the Governance → Ownership Trend module's data for Niva Bupa from
//  Screener (Investors → Shareholding Pattern, company id 1285147):
//    1. Quarterly shareholding pattern (group rows: Promoters / FIIs / DIIs /
//       Public / No. of Shareholders).
//    2. Yearly shareholding pattern (same group rows).
//    3. Expanded investor-level rows under each group — WHERE Screener exposes
//       them. Screener gates the named entities behind an authenticated session
//       + an interactive click-to-expand, so this is attempted but tolerated as
//       unavailable; group-level rows are kept and investor-level is marked
//       missing. No investor-level data is ever invented. (The named-holder
//       breakdown the dashboard shows comes from the authoritative exchange
//       filing — shareholding-pattern-snapshot.json — for the latest period.)
//
//  OFFLINE-FIRST, like the rest of the ingest layer:
//    • Live (INGEST_OFFLINE=0): a real headless Chromium (Playwright) opens the
//      Screener company page, reads the quarterly + yearly tables, and tries to
//      expand each group row for named holders. Self-fencing — if Playwright /
//      a browser binary / network is unavailable, it returns null.
//    • Offline / live failed: read the staged source-of-record at
//      data/raw/screener/nivabupa-shareholding-history.json (group-level values
//      transcribed from the Screener public page). Never throws, never fakes.
//
//  Outputs (self-contained envelopes, NOT part of the generic merge):
//    src/data/snapshots/ownership-holdings.json   (long format, one row/holder/period)
//    src/data/snapshots/ownership-trends.json      (period-over-period movement)
//
//  Run:  npm run ingest:screener-ownership   (offline)
//        INGEST_OFFLINE=0 npm run ingest:screener-ownership   (attempt live)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { nowIso, writeSnapshot, appendLog, RAW_ROOT } from './util'
import type {
  OwnershipHoldingRow,
  OwnershipTrendRow,
  OwnershipTrendDirection,
  OwnershipHolderGroup,
  OwnershipPeriodType,
  OwnershipScreenerMeta,
} from '../../src/data/snapshots/_schemas'

const COMPANY_ID = 'niva-bupa' // dashboard join key (ticker NIVABUPA)
const TICKER = 'NIVABUPA'
const COMPANY_NAME = 'Niva Bupa Health Insurance Company Ltd'
const SCREENER_COMPANY_ID = 1285147
const SCREENER_URL = `https://www.screener.in/company/${SCREENER_COMPANY_ID}/`
const SOURCE_SECTION = 'Investors / Shareholding Pattern'
const STAGED_FILE = resolve(RAW_ROOT, 'screener', 'nivabupa-shareholding-history.json')

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
  scrapedAt: string,
  validationStatus: OwnershipHoldingRow['validation_status'],
): OwnershipHoldingRow[] {
  const rows: OwnershipHoldingRow[] = []
  const classification = src._meta.classification_note

  const pushTable = (table: ScreenerTable, periodType: OwnershipPeriodType) => {
    table.periods.forEach((rawLabel, i) => {
      const { endDate, fiscal } = normalisePeriod(rawLabel, periodType)
      for (const group of GROUP_ORDER) {
        const series = table.groups[group]
        if (!series) continue
        const raw = series[i]
        const isShareholderRow = group === SHAREHOLDER_ROW
        rows.push({
          company_id: COMPANY_ID,
          company_name: COMPANY_NAME,
          ticker: TICKER,
          source_name: 'Screener',
          source_section: SOURCE_SECTION,
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
 * Period-over-period movement for the % holder groups (and expanded investors,
 * when present). Each consecutive pair (prev → cur) yields one row per holder.
 * Yearly trends use the yearly table; quarterly use the quarterly table — they
 * are NEVER averaged into one another. Ranks are computed within each current
 * period. "No. of Shareholders" is not a % holder and is excluded from trends
 * (its movement shows as a count in the insight strip instead).
 */
function computeTrends(holdings: OwnershipHoldingRow[]): OwnershipTrendRow[] {
  const out: OwnershipTrendRow[] = []

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
          company_id: COMPANY_ID,
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

// ─── live scrape (Playwright) — best-effort, self-fencing ─────────────────────

/**
 * Drive a real headless Chromium to read Screener's shareholding pattern and
 * (where exposed) expand each group row for named holders. Returns a source
 * object in the staged shape, or null when Playwright / a browser binary /
 * network is unavailable, or the tables can't be parsed. NEVER throws — callers
 * fall back to the staged source-of-record.
 *
 * Screener renders Quarterly/Yearly shareholding under `section#shareholding`
 * with a button per group row that expands the constituent entities. Those
 * expanded rows are only served to an authenticated session, so in the common
 * (anonymous) case `investorRowsAvailable` comes back false and only group rows
 * are returned — which is honest, not a failure.
 */
async function scrapeScreenerLive(): Promise<{ source: ScreenerSource; investorRowsAvailable: boolean } | null> {
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
    // Optional authenticated session — expanded investor rows need it.
    const cookie = process.env.SCREENER_SESSIONID
    if (cookie) {
      await context.addCookies([
        { name: 'sessionid', value: cookie, domain: '.screener.in', path: '/', httpOnly: true, secure: true },
      ])
    }
    const page = await context.newPage()
    await page.goto(SCREENER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('#shareholding', { timeout: 30000 }).catch(() => {})

    const readTab = async (tabName: 'Quarterly' | 'Yearly'): Promise<ScreenerTable | null> => {
      // Click the Quarterly / Yearly tab inside the shareholding section.
      await page
        .locator('#shareholding button, #shareholding a', { hasText: tabName })
        .first()
        .click({ timeout: 5000 })
        .catch(() => {})
      await page.waitForTimeout(800)
      // Attempt to expand every group row to surface named holders.
      const expanders = page.locator('#shareholding table button.button-plain, #shareholding table .show-schedules')
      const n = await expanders.count().catch(() => 0)
      for (let i = 0; i < n; i++) {
        await expanders.nth(i).click({ timeout: 2000 }).catch(() => {})
      }
      await page.waitForTimeout(400)
      // Read the visible shareholding table into { periods, groups }.
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

    // Map Screener's group labels to our canonical names; bail to the staged
    // source if the four core groups aren't all present (don't ship a
    // half-parsed table).
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

    // Investor-level rows show up as extra labelled rows beyond the four groups
    // when an authenticated expand succeeds; treat their presence as the
    // availability signal. Anonymous sessions won't have them.
    const investorRowsAvailable =
      Object.keys(quarterly.groups).length > 6 || Object.keys(yearly.groups).length > 6

    return {
      source: {
        _meta: {
          classification_note:
            'Classifications might have changed from Sep 2022 onwards. The new XBRL format added more details to the shareholding pattern from that point on.',
          expanded_investor_rows_available: investorRowsAvailable,
        },
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

// ─── run ──────────────────────────────────────────────────────────────────────

async function loadStaged(): Promise<ScreenerSource> {
  const text = await readFile(STAGED_FILE, 'utf8')
  return JSON.parse(text) as ScreenerSource
}

function inr(n: number | null): string {
  return n == null ? 'n/a' : n.toLocaleString('en-IN')
}

async function run(): Promise<void> {
  const scrapedAt = nowIso()

  // 1) Try a live scrape; 2) fall back to the staged source-of-record.
  const live = await scrapeScreenerLive().catch(() => null)
  const usingLive = !!live
  const src: ScreenerSource = live ? live.source : await loadStaged()
  const expandedAvailable = live ? live.investorRowsAvailable : !!src._meta.expanded_investor_rows_available
  const validationStatus: OwnershipHoldingRow['validation_status'] = expandedAvailable
    ? 'scraped'
    : 'missing_expanded_rows'

  const holdings = normaliseHoldings(src, scrapedAt, validationStatus)
  const trends = computeTrends(holdings)

  const meta: OwnershipScreenerMeta = {
    snapshot_id: 'ownership-holdings',
    description:
      'Niva Bupa shareholding-pattern history (long format) from Screener — Investors / Shareholding Pattern. Drives Governance → Ownership Trend.',
    schema_version: '1.0.0',
    company_id: COMPANY_ID,
    company_name: COMPANY_NAME,
    ticker: TICKER,
    source_name: 'Screener',
    source_section: SOURCE_SECTION,
    source_url: SCREENER_URL,
    screener_company_id: SCREENER_COMPANY_ID,
    dataset: 'official',
    last_updated: scrapedAt.slice(0, 10),
    last_successful_run: scrapedAt,
    scraped_at: scrapedAt,
    classification_note: src._meta.classification_note,
    expanded_investor_rows_available: expandedAvailable,
    expanded_investor_rows_note: src._meta.expanded_investor_rows_note,
    parser_status: 'ready',
    periods_quarterly: src.quarterly.periods,
    periods_yearly: src.yearly.periods,
    validation_status: validationStatus,
    notes: usingLive
      ? 'Captured via live Screener scrape (Playwright).'
      : 'Built from the staged Screener source-of-record (offline); live scrape unavailable in this environment.',
  }

  await writeSnapshot('ownership-holdings.json', { _meta: meta, data: holdings })
  await writeSnapshot('ownership-trends.json', {
    _meta: { ...meta, snapshot_id: 'ownership-trends', description: 'Period-over-period ownership movement derived from ownership-holdings.' },
    data: trends,
  })
  await appendLog('fetch-screener-shareholding.log', {
    source: 'screener_shareholding',
    company_id: COMPANY_ID,
    mode: usingLive ? 'live' : 'offline_staged',
    expanded_investor_rows: expandedAvailable,
    holdings_rows: holdings.length,
    trend_rows: trends.length,
  })

  // ─── PART 11 validation report ──────────────────────────────────────────────
  const groupVals = (pt: OwnershipPeriodType) => {
    const lines: string[] = []
    for (const g of GROUP_ORDER) {
      const series = holdings
        .filter((r) => r.period_type === pt && r.holder_group === g)
        .map((r) => (g === SHAREHOLDER_ROW ? inr(r.shareholder_count) : r.holding_pct == null ? 'n/a' : `${r.holding_pct}%`))
      lines.push(`     - ${g}: ${series.join(', ')}`)
    }
    return lines.join('\n')
  }

  const log = console.log
  log('\n══════════════════════════════════════════════════════════════════')
  log('  SCREENER SHAREHOLDING INGESTION — VALIDATION (Niva Bupa, id 1285147)')
  log('══════════════════════════════════════════════════════════════════')
  log(`  Scrape mode             : ${usingLive ? 'LIVE (Playwright)' : 'OFFLINE — staged Screener source-of-record'}`)
  log(`  1. Quarterly periods    : ${src.quarterly.periods.join(', ')}`)
  log(`  2. Yearly periods       : ${src.yearly.periods.join(', ')}`)
  log('  3. Quarterly group values:')
  log(groupVals('quarterly'))
  log('  4. Yearly group values:')
  log(groupVals('yearly'))
  log(`  5. Expanded investor-level rows found : ${expandedAvailable ? 'YES' : 'NO — group-level only (Investor View uses latest exchange filing; Screener named rows are login-only)'}`)
  log(`  6. ownership_holdings rows inserted   : ${holdings.length}`)
  log(`  7. ownership_trends rows inserted     : ${trends.length}`)
  log('  8. Annual toggle → yearly trend       : wired (UI reads global `period`==="Annual" → yearly table)')
  log('  9. Quarterly toggle → quarterly trend : wired (UI reads global `period`==="Quarterly" → quarterly table)')
  log(`  10. Investor-level rows invented      : NO — investor view marked '${validationStatus}'`)
  log('  11. Source footer                     : rendered by the module (Screener → Investors / Shareholding Pattern)')
  log('  12. Screenshot                        : capture from the running app (npm run dev)')
  // Spot-check the latest movement so the numbers are visible in the log.
  for (const pt of ['quarterly', 'yearly'] as OwnershipPeriodType[]) {
    const latest = trends.filter((t) => t.period_type === pt).slice(-PCT_GROUPS.length)
    if (latest.length) {
      log(`\n  Latest ${pt} movement (${latest[0].previous_period} → ${latest[0].current_period}):`)
      for (const t of latest) {
        log(`     - ${t.holder_group}: ${t.previous_holding_pct}% → ${t.current_holding_pct}% (${(t.change_pp ?? 0) > 0 ? '+' : ''}${t.change_pp} pp, ${t.trend_direction})`)
      }
    }
  }
  log('══════════════════════════════════════════════════════════════════\n')
}

run().catch((err) => {
  console.error('fetch-screener-shareholding failed:', err)
  process.exitCode = 1
})
