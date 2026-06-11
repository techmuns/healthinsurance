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

function buildPayload(tuples: Tuple[]) {
  const lines = tuples
    .map((t) => `${COMPANY_NAMES[t.company_id] ?? t.company_id} | ${t.broker} | ${t.report_date}`)
    .join('\n')
  return {
    user_index: 124,
    tasks: [
      'These are dated Indian broker research reports on listed insurers. For EACH line (company | broker | report date), find THAT broker report (broker research note, Trendlyne / Moneycontrol / TradingView / broker PDF are all fine — public pages only) and return its TARGET PRICE (₹) and the SHARE PRICE AT the recommendation date (₹), plus the rating word (Buy/Add/Hold/etc.).\n\nReports to resolve:\n' +
        lines +
        '\n\nReturn ONE pipe-delimited row per input line, exactly these columns:\n\ncompany | broker | report_date | rating | target_price | price_at_reco | source_url\n\nRules:\ncompany = the NSE ticker I gave (STARHEALTH / NIVABUPA / ICICIGI / GODIGIT).\nreport_date = the date I gave, YYYY-MM-DD.\ntarget_price, price_at_reco = numbers in ₹, no commas, no symbol. price_at_reco = the market price on/around the report date (the price the broker quotes as CMP in that report, when stated).\nIf you cannot find that specific dated report, leave target_price and price_at_reco BLANK for that row — never 0, never another date’s report, never an estimate.\nsource_url = the exact public page the numbers come from. A row without a source_url is useless.\nNo other text.',
    ],
    query_context: {
      TICKER_SYMBOL: [], FROM_DATE: '2024-01-01', TO_DATE: new Date().toISOString().slice(0, 10),
      ANNOUNCEMENT_FORM_TYPE: 'all', DOCUMENT_IDS: [], CATEGORIES: [], WEB_SEARCH_ENABLED: true,
      COUNTRY: [], CONTEXT_EMAIL: 'nadamsaluja@gmail.com', CONTEXT_COMPANY_NAME: [],
      GET_ANNOUNCEMENTS_ENABLED: false, chatHistory: [], mode: 'fast',
    },
    autoAddUpcoming: false,
    urls: [],
  }
}

const TICKER_TO_ID: Record<string, string> = {
  STARHEALTH: 'star-health', NIVABUPA: 'niva-bupa', ICICIGI: 'icici-lombard', GODIGIT: 'godigit',
}

function parseRows(text: string, tuples: Tuple[]) {
  const valid = new Set(tuples.map((t) => `${t.company_id}|${t.broker.toLowerCase()}|${t.report_date}`))
  const out: Array<Record<string, string | number | null>> = []
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 7) continue
    const ticker = cells[0].toUpperCase().replace(/[^A-Z]/g, '')
    const company_id = TICKER_TO_ID[ticker]
    if (!company_id) continue
    const [, broker, report_date, rating, target, atReco, source_url] = cells
    if (!/^\d{4}-\d{2}-\d{2}$/.test(report_date)) continue
    if (!/^https?:\/\//.test(source_url ?? '')) continue
    // Only accept rows the template actually asked for (broker matched loosely).
    const match = [...valid].find((k) => k.startsWith(`${company_id}|`) && k.endsWith(`|${report_date}`)
      && (k.split('|')[1].includes(broker.toLowerCase().slice(0, 6)) || broker.toLowerCase().includes(k.split('|')[1].slice(0, 6))))
    if (!match) continue
    const num = (s: string) => {
      const n = parseFloat(String(s).replace(/[,₹\s]/g, ''))
      return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
    }
    out.push({
      company_id,
      broker: match.split('|') [1] === broker.toLowerCase() ? broker : tuples.find((t) => `${t.company_id}|${t.broker.toLowerCase()}|${t.report_date}` === match)!.broker,
      report_date,
      rating: rating || null,
      target_price: num(target),
      price_at_reco: num(atReco),
      source_url,
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
  console.log(`Template names ${tuples.length} dated broker reports; asking the agent...`)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS)
  let raw: string
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { accept: '*/*', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(tuples)),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`agent call failed: HTTP ${res.status}`)
    raw = await res.text()
  } finally {
    clearTimeout(timer)
  }

  await mkdir(OUT_DIR, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  await writeFile(resolve(OUT_DIR, `analyst-coverage-${stamp}.json`), raw, 'utf8')

  const ans = raw.match(/<ans>([\s\S]*?)<\/ans>/)?.[1] ?? raw
  const rows = parseRows(ans, tuples)
  console.log(`Parsed ${rows.length} valid dated rows (of ${tuples.length} asked).`)

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
      for (const f of ['rating', 'target_price', 'price_at_reco', 'source_url'] as const) {
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
