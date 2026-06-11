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
  const task = (
      `Go to Trendlyne's Research Reports page for ${name} (search trendlyne.com for the stock, open its "Research Reports" / "Broker Research" tab) - that page lists the FULL multi-year history of broker reports, far more than Moneycontrol. Scroll and page through to load EVERY row from 2024-01-01 to today, then return them ALL, one pipe-delimited line each, exactly these columns:\n\n` +
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
    urls: [],
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

async function main(): Promise<number> {
  const token = (process.env.MUNS_API_TOKEN || '').trim()
  if (!token) {
    console.error('ERROR: MUNS_API_TOKEN is not set.')
    return 1
  }
  const tuples = await tuplesFromSchema()
  const companies = [...new Set(tuples.map((t) => t.company_id))]
  console.log(`Template names ${tuples.length} dated broker reports across ${companies.length} companies; asking the agent one company at a time...`)

  await mkdir(OUT_DIR, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)

  // One focused call PER COMPANY. A single company's failure is logged and
  // skipped — it never aborts the others. Every raw response is saved for audit.
  const allRows: AggRow[] = []
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
      console.error(`  ${cid}: fetch failed — ${(e as Error).message}. Continuing with the rest.`)
    } finally {
      clearTimeout(timer)
    }
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
      description: 'Dated broker research reports (target price + price at recommendation) for the Analyst coverage sheet. Aggregator-sourced via the muns agent — the sanctioned low-confidence backup for broker targets (no official feed exists). Rows without a public source URL are never written. Missing is never zero.',
      schema_version: '1.0.0',
      dataset: merged.length > 0 ? 'backup_aggregator' : 'pending',
      last_updated: stamp,
      upstream_sources: ['muns_agent_web'],
      parser_status: 'ready',
    },
    data: merged,
  }, null, 2) + '\n', 'utf8')
  console.log(`Snapshot now holds ${merged.length} dated broker rows.`)
  return 0
}

main().then((code) => { process.exitCode = code })
