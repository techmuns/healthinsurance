// ---------------------------------------------------------------------------
//  Insurer quarterly premium — auto-refresh agent (muns chat agent, web search).
//
//  Fills the Premium Engine's QUARTERLY net / earned premium for the listed
//  health insurers (Niva Bupa, Star Health). Gross premium per quarter already
//  comes live from the GI Council quarterly health filing; this agent adds the
//  net written (NWP) and net earned (NEP) premium that the companies report each
//  quarter, into insurer-quarterly-financials.json.
//
//  ADD-ONLY: a populated cell is NEVER overwritten (the audited seed is safe),
//  only genuinely-missing nwp/nep fields fill, each gated against plausible
//  bounds; anything unsourced stays null — never fabricated. A no-token / failed
//  run leaves the file untouched. Token: MUNS_API_TOKEN.
// ---------------------------------------------------------------------------

import { writeSnapshot, readSnapshot, nowIso, appendLog } from './util'

const SNAPSHOT_FILE = 'insurer-quarterly-financials.json'
const API_URL = process.env.MUNS_AGENT_URL || 'https://devde.muns.io/chat/chat-muns'
const API_TIMEOUT_MS = 600_000

const COMPANIES: Record<string, string> = {
  nivabupa: 'niva-bupa',
  'niva bupa': 'niva-bupa',
  starhealth: 'star-health',
  'star health': 'star-health',
}
type Metric = 'nwp' | 'nep'
const METRICS: Metric[] = ['nwp', 'nep']
const BOUNDS = { min: 100, max: 12_000 } // Rs cr per quarter

interface QRow {
  company_id: string
  quarter: string
  fiscal_year: string
  gwp?: number | null
  nwp?: number | null
  nep?: number | null
  premium_provenance?: Record<string, unknown>
  [k: string]: unknown
}
interface Snapshot {
  _meta: Record<string, unknown>
  data: QRow[]
}

function buildPayload() {
  return {
    user_index: 124,
    tasks: [
      'For the two listed Indian health insurers Niva Bupa (NSE: NIVABUPA) and Star Health (NSE: STARHEALTH), give me their reported QUARTERLY premium for the last ~8 quarters (FY25 Q1 through the latest filed quarter). I need two measures per quarter from the company results / IRDAI quarterly Revenue Account (NL forms): NWP = Net Written Premium, and NEP = Net Earned Premium (premium earned, net). Use ONLY real published figures — if a quarter is not yet filed, LEAVE IT OUT, never guess.\n\n' +
        'Return ONLY a pipe-delimited table, no leading/trailing pipe, EXACTLY these columns:\n\n' +
        'company | fiscal_year | quarter | metric | value\n\n' +
        'company = "NIVABUPA" or "STARHEALTH".\n' +
        'fiscal_year = "FY26" etc. (Indian FY ends 31 March).\n' +
        'quarter = "Q1" | "Q2" | "Q3" | "Q4".\n' +
        'metric = "nwp" or "nep".\n' +
        'value = Rs CRORE for that single quarter (digits only). Niva ref: Q4 FY26 NEP ≈ 1972.\n' +
        'One row per (company, fiscal_year, quarter, metric). Newest first.',
    ],
    query_context: {
      TICKER_SYMBOL: ['NIVABUPA', 'STARHEALTH'],
      ANNOUNCEMENT_FORM_TYPE: 'all',
      DOCUMENT_IDS: [],
      CATEGORIES: [],
      WEB_SEARCH_ENABLED: true,
      COUNTRY: [],
      CONTEXT_EMAIL: 'nadamsaluja@gmail.com',
      CONTEXT_COMPANY_NAME: [],
      GET_ANNOUNCEMENTS_ENABLED: true,
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

const extractAnswer = (t: string) => t.match(/<ans>([\s\S]*?)<\/ans>/)?.[1] ?? t
const clean = (s: string | undefined) => (s ?? '').replace(/^["'\s]+|["'\s]+$/g, '').trim()
const numOf = (s: string): number | null => {
  const m = s.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  const n = m ? Number(m[0]) : NaN
  return Number.isFinite(n) ? n : null
}

export interface QFigure {
  companyId: string
  fy: string
  quarter: string
  metric: Metric
  value: number
}

export function parseFigures(answer: string): QFigure[] {
  const out: QFigure[] = []
  for (const line of answer.split('\n')) {
    if (!line.includes('|')) continue
    const cells = line.split('|').map(clean)
    while (cells.length && cells[0] === '') cells.shift()
    while (cells.length && cells[cells.length - 1] === '') cells.pop()
    if (cells.length < 5) continue
    if (/^company$/i.test(cells[0]) || /^-+$/.test(cells[1] ?? '')) continue
    const companyId = COMPANIES[clean(cells[0]).toLowerCase()]
    if (!companyId) continue
    const fy = clean(cells[1]).toUpperCase().replace(/\s+/g, '')
    if (!/^FY\d{2}$/.test(fy)) continue
    const quarter = clean(cells[2]).toUpperCase().replace(/\s+/g, '')
    if (!/^Q[1-4]$/.test(quarter)) continue
    const metric = clean(cells[3]).toLowerCase() as Metric
    if (!METRICS.includes(metric)) continue
    const value = numOf(cells[4])
    if (value == null || value < BOUNDS.min || value > BOUNDS.max) continue
    out.push({ companyId, fy, quarter, metric, value })
  }
  return out
}

export async function main(): Promise<number> {
  const fetched_at = nowIso()
  const today = fetched_at.slice(0, 10)
  const token = (process.env.MUNS_API_TOKEN || '').trim()

  const snap = await readSnapshot<Snapshot>(SNAPSHOT_FILE)
  const rows = snap.data ?? []
  const keyOf = (c: string, fy: string, q: string) => `${c}::${fy}::${q}`
  const byKey = new Map(rows.map((r) => [keyOf(r.company_id, r.fiscal_year, r.quarter), r]))

  const prevSuccessRun = (snap._meta?.last_successful_run as string) ?? null
  let filled = 0
  let pullSucceeded = false

  if (!token) {
    console.warn('MUNS_API_TOKEN not set — preserving the existing file (no fresh pull this run).')
  } else {
    console.log('Calling chat-muns agent for quarterly net/earned premium ...')
    try {
      const figures = parseFigures(extractAnswer(await callAgent(token)))
      pullSucceeded = true
      console.log(`Parsed ${figures.length} candidate figure(s).`)
      for (const f of figures) {
        let row = byKey.get(keyOf(f.companyId, f.fy, f.quarter))
        if (row && row[f.metric] != null) continue // ADD-ONLY — never overwrite
        if (!row) {
          row = { company_id: f.companyId, fiscal_year: f.fy, quarter: f.quarter, period_type: 'quarterly', gwp: null, nwp: null, nep: null }
          byKey.set(keyOf(f.companyId, f.fy, f.quarter), row)
          rows.push(row)
        }
        row[f.metric] = f.value
        const prov = (row.premium_provenance ?? {}) as Record<string, unknown>
        row.premium_provenance = {
          ...prov,
          source_name: (prov.source_name as string) ?? 'Auto-filled by the muns web agent from company quarterly results',
          auto_filled: [...new Set([...((prov.auto_filled as string[]) ?? []), f.metric])],
          confidence: 'medium',
          agent_last_run: fetched_at,
        }
        filled += 1
        console.log(`  + ${f.companyId} ${f.fy} ${f.quarter} ${f.metric} = ${f.value}`)
      }
    } catch (err) {
      console.error(`agent pull failed (file preserved): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  snap.data = rows
  snap._meta = {
    ...snap._meta,
    last_updated: filled > 0 ? today : (snap._meta?.last_updated as string) ?? today,
    last_successful_run: pullSucceeded ? fetched_at : prevSuccessRun,
  }
  await writeSnapshot(SNAPSHOT_FILE, snap)
  await appendLog('insurer-quarterly-premium-agent.log', { filled, had_token: !!token })
  console.log(`insurer-quarterly-premium: ${filled} field(s) filled this run.`)
  return 0
}

import { pathToFileURL } from 'node:url'
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
