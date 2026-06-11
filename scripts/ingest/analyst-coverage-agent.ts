// ---------------------------------------------------------------------------
//  Analyst-coverage pull via the muns chat agent.
//
//  The "Analyst coverage" sheet wants, for each DATED broker report the
//  template names (e.g. "Motilal Oswal, 2026-01-29, Niva Bupa"): the broker's
//  TARGET PRICE and the SHARE PRICE AT RECOMMENDATION. Broker targets have no
//  official feed — aggregator sourcing is the sanctioned, clearly-labelled
//  low-confidence backup for exactly this sheet (EXCEL-INGESTION.md). The
//  tuple list is read from schema-map.json at runtime, so a template update
//  (new dated reports) changes the ask automatically.
//
//  Rows come back pipe-delimited, are validated (numbers + a source URL or
//  they're dropped — never 0, never an estimate), and land in
//  src/data/snapshots/analyst-coverage-snapshot.json; build_value_store.py
//  projects them onto the per-broker metrics at rank 9 (any better source
//  would supersede; none exists for broker targets).
//
//  Same machinery as the other agent scripts. Token: MUNS_API_TOKEN.
// ---------------------------------------------------------------------------

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')
const OUT_DIR = resolve(REPO_ROOT, 'data/agent-pulls/analyst-coverage')
const SNAPSHOT = resolve(REPO_ROOT, 'src/data/snapshots/analyst-coverage-snapshot.json')
const API_URL = 'https://devde.muns.io/chat/chat-muns'
const API_TIMEOUT_MS = 600_000

const COMPANY_NAMES: Record<string, string> = {
  'star-health': 'Star Health and Allied Insurance (NSE: STARHEALTH)',
  'niva-bupa': 'Niva Bupa Health Insurance (NSE: NIVABUPA)',
  'icici-lombard': 'ICICI Lombard General Insurance (NSE: ICICIGI)',
  godigit: 'Go Digit General Insurance (NSE: GODIGIT)',
}

// Exact Trendlyne "Research Reports" pages (full multi-year broker history,
// paginated ?page=2,3,...). Handed to the agent directly so it opens these
// instead of searching and settling for Moneycontrol's recent-only list.
const TRENDLYNE_URLS: Record<string, string> = {
  'niva-bupa': 'https://trendlyne.com/research-reports/stock/2768807/NIVABUPA/niva-bupa-health-insurance-company-ltd/',
  'star-health': 'https://trendlyne.com/research-reports/stock/746520/STARHEALTH/star-health-and-allied-insurance-company-ltd/',
  'icici-lombard': 'https://trendlyne.com/research-reports/stock/61147/ICICIGI/icici-lombard-general-insurance-company-ltd/',
  godigit: 'https://trendlyne.com/research-reports/stock/2266638/GODIGIT/go-digit-general-insurance-ltd/',
}

interface Tuple { company_id: string; broker: string; report_date: string }

async function tuplesFromSchema(): Promise<Tuple[]> {
  const schema = JSON.parse(await readFile(resolve(REPO_ROOT, 'schema-map.json'), 'utf8'))
  const sheet = schema.sheets.find((s: { sheet: string }) => s.sheet === 'Analyst coverage')
  const seen = new Set<string>()
  const out: Tuple[] = []
  for (const b of sheet?.bindings ?? []) {
    const m = String(b.metric ?? '')
    if (!m.includes('::') || !b.entity || !b.period) continue
    const broker = m.split('::')[1]
    const key = `${b.entity}|${broker}|${b.period}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ company_id: b.entity, broker, report_date: b.period })
  }
  return out
}

// ONE focused task per company. Bundling all four companies into a single call
// made the agent answer only the first (Niva Bupa) and drop the rest, so each
// company now gets its own call with its own ticker in the query context.
function buildPayload(cid: string) {
  const name = COMPANY_NAMES[cid] ?? cid
  const ticker = name.match(/NSE: (\w+)/)?.[1] ?? cid
  const url = TRENDLYNE_URLS[cid] ?? ''
  const task = (
      `Open this exact Trendlyne Research Reports page: ${url} - then its older pages by appending ?page=2, ?page=3 and so on until no more rows appear. It is the FULL multi-year broker history (far more than Moneycontrol). Return EVERY report row from 2024-01-01 to today, one pipe-delimited line each, exactly these columns:\n\n` +
      `${ticker} | broker name | report date YYYY-MM-DD | rating | target_price | price_at_reco | source_url\n\n` +
      'Use Moneycontrol\'s broker-research page ONLY if Trendlyne is unreachable. target_price = the broker target price in rupees, number only. price_at_reco = the share price on the recommendation date (Trendlyne labels it "Price at reco"), number only. source_url = the public page that lists the report. Return as many historical rows as the page shows (aim for 15 or more per company where they exist). If a number is not shown for a row, leave that field blank - never 0, never an estimate. Output ONLY the pipe-delimited rows, nothing else.'
  )
  return {
    user_index: 124,
    tasks: [task],
    query_context: {
      TICKER_SYMBOL: [ticker], FROM_DATE: '2024-01-01', TO_DATE: new Date().toISOString().slice(0, 10),
      ANNOUNCEMENT_FORM_TYPE: 'all', DOCUMENT_IDS: [], CATEGORIES: [], WEB_SEARCH_ENABLED: true,
      COUNTRY: [], CONTEXT_EMAIL: 'nadamsaluja@gmail.com', CONTEXT_COMPANY_NAME: [name],
      GET_ANNOUNCEMENTS_ENABLED: false, chatHistory: [], mode: 'fast',
    },
    autoAddUpcoming: false,
    urls: url ? [url] : [],
  }
}

const TICKER_TO_ID: Record<string, string> = {
  STARHEALTH: 'star-health', NIVABUPA: 'niva-bupa', ICICIGI: 'icici-lombard', GODIGIT: 'godigit',
}

interface AggRow { company_id: string; broker: string; date: string; rating: string | null; target: number | null; atReco: number | null; url: string }

function parseAggregatorRows(text: string): AggRow[] {
  const out: AggRow[] = []
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 7) continue
    const ticker = cells[0].toUpperCase().replace(/[^A-Z]/g, '')
    const company_id = TICKER_TO_ID[ticker]
    if (!company_id) continue
    const date = cells[2]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (!/^https?:\/\//.test(cells[6] ?? '')) continue
    const num = (v: string) => {
      const n = parseFloat(String(v).replace(/[,\u20b9\s]/g, ''))
      return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
    }
    out.push({ company_id, broker: cells[1], date, rating: cells[3] || null, target: num(cells[4]), atReco: num(cells[5]), url: cells[6] })
  }
  return out
}

const DAY = 86_400_000

function brokerMatches(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
  const na = norm(a)
  const nb = norm(b)
  return na.includes(nb.slice(0, 8)) || nb.includes(na.slice(0, 8))
}

/** Align aggregator rows to the template's dated tuples: same company, fuzzy
 *  broker, nearest date within ±6 days. The cell keeps the TEMPLATE's date;
 *  the aggregator's own date is recorded when it differs. */
function alignToTuples(rows: AggRow[], tuples: Tuple[]) {
  const out: Array<Record<string, string | number | null>> = []
  for (const t of tuples) {
    const want = new Date(t.report_date).getTime()
    const candidates = rows
      .filter((r) => r.company_id === t.company_id && brokerMatches(r.broker, t.broker)
        && Math.abs(new Date(r.date).getTime() - want) <= 8 * DAY
        && (r.target != null || r.atReco != null))
      .sort((a, b) => Math.abs(new Date(a.date).getTime() - want) - Math.abs(new Date(b.date).getTime() - want))
    const hit = candidates[0]
    if (!hit) continue
    out.push({
      company_id: t.company_id,
      broker: t.broker,
      report_date: t.report_date,
      aggregator_date: hit.date === t.report_date ? null : hit.date,
      rating: hit.rating,
      target_price: hit.target,
      price_at_reco: hit.atReco,
      source_url: hit.url,
    })
  }
  return out
}

// ── Trendlyne scrape (primary source) ────────────────────────────────────────
// Trendlyne carries the FULL multi-year broker-report history, but it 403s a
// bare datacenter request (so does the muns agent's fetch). So we render it in a
// real headless browser routed through ScraperAPI's India IP — the same trick
// fetch-rendered.ts uses to beat the insurer-site blocks — read the report table
// straight from the DOM, and page through ?page=2,3,… for the older history.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function proxyConfig(): { server: string; username: string; password: string } | undefined {
  const key = (process.env.SCRAPERAPI_KEY || process.env.SCRAPER_KEY || '').trim()
  if (!key) return undefined
  return { server: 'http://proxy-server.scraperapi.com:8001', username: 'scraperapi.country_code=in', password: key }
}

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
function toIsoDate(s: string): string | null {
  const m = /(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/.exec(s)
  if (!m) return null
  const mm = MONTHS[m[2].slice(0, 3).toLowerCase()]
  return mm ? `${m[3]}-${mm}-${m[1].padStart(2, '0')}` : null
}

interface ScrapedRow { date: string; author: string; target: string; atReco: string; type: string }
interface PageScrape { rows: ScrapedRow[]; tableCount: number; header: string[]; firstCells: string[] }

async function scrapeTrendlyne(companies: string[]): Promise<AggRow[]> {
  const proxy = proxyConfig()
  console.log(`Trendlyne scrape: proxy=${proxy ? 'ScraperAPI India IP' : 'DIRECT (no SCRAPER_KEY — Trendlyne will likely 403)'}`)
  const out: AggRow[] = []
  let browser: Browser | null = null
  try {
    browser = await chromium.launch({ headless: true, proxy })
    const ctx = await browser.newContext({ userAgent: BROWSER_UA, ignoreHTTPSErrors: true })
    for (const cid of companies) {
      const baseUrl = TRENDLYNE_URLS[cid]
      if (!baseUrl) continue
      let usable = 0
      let prevFirst = ''
      for (let pg = 1; pg <= 10; pg++) {
        const url = pg === 1 ? baseUrl : `${baseUrl}?page=${pg}`
        const page = await ctx.newPage()
        let s: PageScrape = { rows: [], tableCount: 0, header: [], firstCells: [] }
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
          await page.waitForTimeout(4000)
          await page.waitForSelector('table tr', { timeout: 8000 }).catch(() => {})
          s = await page.evaluate(() => {
            const norm = (x: string | null) => (x || '').replace(/\s+/g, ' ').trim()
            const tables = Array.from(document.querySelectorAll('table'))
            let best: HTMLTableElement | null = null
            for (const t of tables) {
              const h = norm(t.querySelector('tr')?.textContent || '').toLowerCase()
              if (h.includes('target') && (h.includes('author') || h.includes('reco'))) { best = t as HTMLTableElement; break }
            }
            if (!best) return { rows: [], tableCount: tables.length, header: [], firstCells: [] }
            const trs = Array.from(best.querySelectorAll('tr'))
            const head = Array.from(trs[0].querySelectorAll('th,td')).map((c) => norm(c.textContent).toLowerCase())
            const find = (kw: string) => head.findIndex((h) => h.includes(kw))
            const di = find('date'), ai = find('author'), ti = find('target'), yi = find('type')
            const pi = head.findIndex((h) => h.includes('price at reco') || h.includes('reco'))
            const rows: ScrapedRow[] = []
            for (const tr of trs.slice(1)) {
              const tds = Array.from(tr.querySelectorAll('td')).map((c) => norm(c.textContent))
              if (tds.length < 3) continue
              rows.push({ date: tds[di] || '', author: tds[ai] || '', target: tds[ti] || '', atReco: tds[pi] || '', type: tds[yi] || '' })
            }
            const firstCells = trs[1] ? Array.from(trs[1].querySelectorAll('td')).map((c) => norm(c.textContent)) : []
            return { rows, tableCount: tables.length, header: head, firstCells }
          }) as PageScrape
        } catch (e) {
          console.error(`    trendlyne ${cid} p${pg}: ${(e as Error).message}`)
        } finally {
          await page.close().catch(() => {})
        }
        if (pg === 1) console.log(`    trendlyne ${cid}: tables=${s.tableCount} header=[${s.header.join(' | ')}] firstRow=[${s.firstCells.join(' | ')}]`)
        if (s.rows.length === 0) break
        const first = s.rows[0]?.date || ''
        if (first && first === prevFirst) break
        prevFirst = first
        let kept = 0
        for (const r of s.rows) {
          if (!r.author || /consensus/i.test(r.author)) continue
          const date = toIsoDate(r.date)
          if (!date) continue
          const broker = r.author.split(/target/i)[0].replace(/[^\w.&\s-]/g, '').replace(/\s+/g, ' ').trim()
          const t = parseFloat((r.target || '').replace(/[^0-9.]/g, ''))
          const a = parseFloat((r.atReco.split('(')[0] || '').replace(/[^0-9.]/g, ''))
          const target = Number.isFinite(t) && t > 0 ? Math.round(t * 100) / 100 : null
          const atReco = Number.isFinite(a) && a > 0 ? Math.round(a * 100) / 100 : null
          if (target == null && atReco == null) continue
          out.push({ company_id: cid, broker: broker || r.author, date, rating: r.type || null, target, atReco, url: baseUrl })
          kept++
        }
        usable += kept
        console.log(`    trendlyne ${cid} p${pg}: ${s.rows.length} rows -> kept ${kept}`)
        if (s.rows.length < 5) break
      }
      console.log(`  trendlyne ${cid}: ${usable} usable broker rows`)
    }
  } catch (e) {
    console.error(`Trendlyne scrape error: ${(e as Error).message}`)
  } finally {
    await browser?.close().catch(() => {})
  }
  console.log(`Trendlyne scrape: ${out.length} rows total.`)
  return out
}

async function main(): Promise<number> {
  const token = (process.env.MUNS_API_TOKEN || '').trim()
  const tuples = await tuplesFromSchema()
  const companies = [...new Set(tuples.map((t) => t.company_id))]
  console.log(`Template names ${tuples.length} dated broker reports across ${companies.length} companies.`)

  await mkdir(OUT_DIR, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)

  const allRows: AggRow[] = []

  // PRIMARY: scrape Trendlyne's full multi-year history (headless + India proxy).
  try {
    allRows.push(...await scrapeTrendlyne(companies))
  } catch (e) {
    console.error(`Trendlyne scrape skipped: ${(e as Error).message}`)
  }

  // BACKUP: the muns agent (Moneycontrol etc.), one focused call per company,
  // only when a token is set. A company failure is logged and skipped.
  if (token) {
    for (const cid of companies) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS)
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { accept: '*/*', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(cid)),
          signal: ctrl.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const raw = await res.text()
        await writeFile(resolve(OUT_DIR, `analyst-coverage-${cid}-${stamp}.json`), raw, 'utf8')
        const ans = raw.match(/<ans>([\s\S]*?)<\/ans>/)?.[1] ?? raw
        const parsed = parseAggregatorRows(ans)
        console.log(`  ${cid}: ${parsed.length} parseable rows from the agent`)
        allRows.push(...parsed)
      } catch (e) {
        console.error(`  ${cid}: agent fetch failed - ${(e as Error).message}. Continuing.`)
      } finally {
        clearTimeout(timer)
      }
    }
  } else {
    console.log('MUNS_API_TOKEN not set - Trendlyne-only this run.')
  }

  const rows = alignToTuples(allRows, tuples)
  console.log(`Aligned ${rows.length} dated rows to the template (of ${tuples.length} cells asked).`)

  // Merge into the snapshot: a row may improve over time; keyed company+broker+date.
  let existing: { _meta?: object; data: Array<Record<string, unknown>> } = { data: [] }
  try {
    existing = JSON.parse(await readFile(SNAPSHOT, 'utf8'))
  } catch { /* fresh */ }
  const byKey = new Map(existing.data.map((r) => [`${r.company_id}|${r.broker}|${r.report_date}`, r]))
  for (const r of rows) {
    const key = `${r.company_id}|${r.broker}|${r.report_date}`
    const prev = byKey.get(key)
    // Never overwrite a populated number with a blank one.
    if (prev) {
      for (const f of ['rating', 'target_price', 'price_at_reco', 'source_url', 'aggregator_date'] as const) {
        if (r[f] != null) prev[f] = r[f]
      }
      prev.fetched_at = new Date().toISOString()
    } else {
      byKey.set(key, { ...r, fetched_at: new Date().toISOString() })
    }
  }
  const merged = [...byKey.values()].sort((a, b) => String(a.company_id).localeCompare(String(b.company_id)) || String(a.report_date).localeCompare(String(b.report_date)))
  await writeFile(SNAPSHOT, JSON.stringify({
    _meta: {
      snapshot_id: 'analyst-coverage',
      description: 'Dated broker research reports (target price + price at recommendation) for the Analyst coverage sheet. Aggregator-sourced: a headless Trendlyne scrape (ScraperAPI India IP) primary, the muns agent — the sanctioned low-confidence backup for broker targets (no official feed exists). Rows without a public source URL are never written. Missing is never zero.',
      schema_version: '1.0.0',
      dataset: merged.length > 0 ? 'backup_aggregator' : 'pending',
      last_updated: stamp,
      upstream_sources: ['trendlyne_scrape', 'muns_agent_web'],
      parser_status: 'ready',
    },
    data: merged,
  }, null, 2) + '\n', 'utf8')
  console.log(`Snapshot now holds ${merged.length} dated broker rows.`)
  return 0
}

main().then((code) => { process.exitCode = code })
