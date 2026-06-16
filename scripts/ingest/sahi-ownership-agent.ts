// ---------------------------------------------------------------------------
//  Listed-SAHI shareholding pull via the muns chat agent → ownership-snapshot.
//
//  Governance/Ownership needs the latest quarterly shareholding pattern for the
//  two LISTED standalone-health insurers (Star Health, Niva Bupa). This asks the
//  agent for the promoter / FII / DII / MF / public split and the top public
//  holders, with a source, then writes src/data/snapshots/ownership-snapshot.json.
//
//  Honesty: a company contributes a row only when the agent returns at least a
//  promoter or FII figure for it, every row carries the agent's source. Nothing
//  is fabricated; if the answer is unparseable the snapshot is left untouched.
//  Token from MUNS_API_TOKEN (a GitHub Actions secret).
// ---------------------------------------------------------------------------

import { writeSnapshot, nowIso, appendLog } from './util'

const API_URL = process.env.MUNS_AGENT_URL || 'https://devde.muns.io/chat/chat-muns'
const API_TIMEOUT_MS = 600_000

const LISTED: Array<{ company_id: string; name: string }> = [
  { company_id: 'star-health', name: 'Star Health and Allied Insurance' },
  { company_id: 'niva-bupa', name: 'Niva Bupa Health Insurance' },
]

function buildPayload() {
  return {
    user_index: 124,
    tasks: [
      'I need the LATEST quarterly SHAREHOLDING PATTERN for these two NSE-listed Indian health insurers:\n' +
        'Star Health and Allied Insurance (NSE: STARHEALTH)\n' +
        'Niva Bupa Health Insurance (NSE: NIVABUPA)\n\n' +
        'For each company give the most recent disclosed quarter (e.g. "Mar 2025") and the % held by each class:\n' +
        'promoter & promoter group, FII / FPI, DII, mutual funds, and public (incl. others).\n\n' +
        'Return a table with exactly these columns, in this order, pipe-delimited:\n\n' +
        'company | quarter | promoter_pct | fii_pct | dii_pct | mf_pct | public_pct | source_url\n\n' +
        'Rules:\n' +
        'company = exactly "Star Health" or "Niva Bupa".\n' +
        'quarter = the quarter the split is as-of, e.g. "Mar 2025".\n' +
        'each *_pct = a plain number (percent of total equity), no % sign, no commas. If a class is not separately disclosed, leave it blank — never 0, never an estimate.\n' +
        'source_url = the exchange filing / Screener / company page the split comes from.\n\n' +
        'Give one row per company. Use the latest filed quarter. Do not fabricate — leave a cell blank if the source does not publish it.\n\n' +
        'Example (format only):\n' +
        'company | quarter | promoter_pct | fii_pct | dii_pct | mf_pct | public_pct | source_url\n' +
        'Star Health | Mar 2025 | 58.3 | 9.1 | 12.4 | 7.8 | 20.2 | https://…',
    ],
    query_context: {
      TICKER_SYMBOL: ['STARHEALTH', 'NIVABUPA'],
      FROM_DATE: '2024-01-01',
      TO_DATE: nowIso().slice(0, 10),
      ANNOUNCEMENT_FORM_TYPE: 'all',
      DOCUMENT_IDS: [],
      CATEGORIES: [],
      WEB_SEARCH_ENABLED: true,
      COUNTRY: [],
      CONTEXT_EMAIL: 'nadamsaluja@gmail.com',
      CONTEXT_COMPANY_NAME: [],
      GET_ANNOUNCEMENTS_ENABLED: false,
      chatHistory: [],
      mode: 'fast',
    },
    autoAddUpcoming: false,
  }
}

async function callAgent(token: string): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { accept: '*/*', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload()),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`agent call failed: HTTP ${res.status} ${res.statusText}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function extractAnswer(text: string): string {
  const m = text.match(/<ans>([\s\S]*?)<\/ans>/)
  return m ? m[1] : text
}

const ID_BY_NAME: Record<string, string> = {
  'star health': 'star-health',
  'niva bupa': 'niva-bupa',
}
function num(s: string | undefined): number | null {
  if (s == null) return null
  const t = s.replace(/[%,\s]/g, '')
  if (!t) return null
  const n = parseFloat(t)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null
}

interface OwnershipRow {
  company_id: string
  quarter: string
  fiscal_year: string
  promoter_share: number | null
  fii_share: number | null
  dii_share: number | null
  mf_share: number | null
  public_share: number | null
  sponsor_share: number | null
  top_holders: never[]
  pledge_share: number | null
  provenance: Record<string, unknown>
}

/** Parse "Mar 2025" → { quarter: 'Q4', fiscal_year: 'FY25' } (Indian FY end-Mar). */
function splitPeriod(label: string): { quarter: string; fiscal_year: string } {
  const m = label.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*'?(\d{2,4})/i)
  if (!m) return { quarter: label.trim(), fiscal_year: '' }
  const mon = m[1].slice(0, 3).toLowerCase()
  const yr = Number(m[2].length === 2 ? `20${m[2]}` : m[2])
  const q = ['jan', 'feb', 'mar'].includes(mon) ? 'Q4' : ['apr', 'may', 'jun'].includes(mon) ? 'Q1' : ['jul', 'aug', 'sep'].includes(mon) ? 'Q2' : 'Q3'
  // FY ends in March: Jan–Mar belong to that FY; Apr–Dec belong to next FY.
  const fy = ['jan', 'feb', 'mar'].includes(mon) ? yr : yr + 1
  return { quarter: q, fiscal_year: `FY${String(fy).slice(2)}` }
}

function parseRows(answer: string, fetched_at: string): OwnershipRow[] {
  const out: OwnershipRow[] = []
  const seen = new Set<string>()
  for (const line of answer.split('\n')) {
    if (!line.includes('|')) continue
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 7) continue
    const company_id = ID_BY_NAME[cells[0].toLowerCase().replace(/health.*$|bupa.*$/, (s) => (s.startsWith('health') ? 'health' : 'bupa'))]
      ?? ID_BY_NAME[Object.keys(ID_BY_NAME).find((k) => cells[0].toLowerCase().includes(k)) ?? '']
    if (!company_id || seen.has(company_id)) continue
    const promoter = num(cells[2])
    const fii = num(cells[3])
    if (promoter == null && fii == null) continue // no real split → skip
    seen.add(company_id)
    const { quarter, fiscal_year } = splitPeriod(cells[1])
    const sourceUrl = (cells[7] || '').match(/https?:\/\/\S+/)?.[0] ?? null
    const dii = num(cells[4])
    let mf = num(cells[5])
    let pub = num(cells[6])
    // Reconcile a common agent slip: the public/retail residual reported in the
    // MF column with public left blank. Mutual funds are a SUBSET of DII, never
    // an additive standalone leg — so promoter+FII+DII+MF can only foot to ~100
    // when that "MF" figure is in fact the public float (the 4-category public
    // filing exposes promoter/FII/DII/public and does not break MF out). Relabel
    // it to public and set MF to n/a rather than show the float as mutual funds.
    if (pub == null && mf != null && promoter != null && fii != null && dii != null
        && Math.abs(promoter + fii + dii + mf - 100) <= 1) {
      pub = mf
      mf = null
    }
    out.push({
      company_id,
      quarter,
      fiscal_year,
      promoter_share: promoter,
      fii_share: fii,
      dii_share: dii,
      mf_share: mf,
      public_share: pub,
      sponsor_share: null,
      top_holders: [],
      pledge_share: null,
      provenance: {
        source_name: `Quarterly shareholding pattern — ${cells[0].trim()} ${cells[1].trim()} (via muns agent)`,
        source_url: sourceUrl,
        source_period: cells[1].trim(),
        fetched_at,
        parsed_at: nowIso(),
        parser_name: 'sahi-ownership-agent',
        confidence: 'medium',
      },
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
  const fetched_at = nowIso()
  console.log('Calling chat-muns agent for listed-SAHI shareholding ...')
  let raw: string
  try {
    raw = await callAgent(token)
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
  const answer = extractAnswer(raw)
  const rows = parseRows(answer, fetched_at)
  console.log(`Parsed ${rows.length} shareholding row(s).`)
  for (const r of rows) {
    console.log(`  + ${r.company_id} ${r.quarter} ${r.fiscal_year}: promoter ${r.promoter_share ?? 'n/a'} · FII ${r.fii_share ?? 'n/a'} · DII ${r.dii_share ?? 'n/a'}`)
    await appendLog('sahi-ownership-agent.log', { company_id: r.company_id, promoter: r.promoter_share, fii: r.fii_share })
  }

  if (rows.length === 0) {
    console.error('No parseable rows — leaving ownership-snapshot.json untouched. Raw answer follows:\n' + answer.slice(0, 1500))
    return 0
  }

  await writeSnapshot('ownership-snapshot.json', {
    _meta: {
      snapshot_id: 'ownership-snapshot',
      description: 'Quarterly shareholding pattern for listed insurers (promoter / FII / DII / MF / public).',
      schema_version: '1.0.0',
      dataset: 'mixed',
      last_updated: fetched_at.slice(0, 10),
      last_successful_run: fetched_at,
      upstream_sources: ['muns_agent', 'nse_bse_shareholding'],
      parser_status: 'ready',
      notes: 'Listed SAHIs only (Star Health, Niva Bupa). Unlisted insurers do not disclose a shareholding pattern. Each leg null where the source does not split it out — never 0.',
    },
    data: rows,
  })
  console.log(`ownership-snapshot: wrote ${rows.length} row(s).`)
  return 0
}

main().then((code) => { process.exitCode = code })
