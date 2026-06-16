// ---------------------------------------------------------------------------
//  Valuation fundamentals — auto-refresh agent (muns chat agent, web search).
//
//  Keeps the Valuation tab's reported financials current with NO manual work.
//  The tab reads each LISTED health insurer's latest full-year GWP / PAT / growth
//  / retail-health share from valuation-fundamentals-snapshot.json and derives
//  P/GWP and P/E live (market cap from the daily price feed ÷ these). Those
//  financials used to be hand-keyed; this agent refreshes them every quarter as
//  each company's result publishes (Indian listed insurers report within ~45 days
//  of quarter-end; the FULL-YEAR audited figure lands with Q4, ~May).
//
//  On each run it asks the agent for the latest COMPLETED fiscal year(s) and
//  merges ADD-ONLY: a populated cell is NEVER overwritten (the audited seed is
//  safe), only genuinely-missing fields fill, each gated against plausible bounds,
//  and anything unsourced stays null — never fabricated. A no-token / failed run
//  leaves the file untouched. Token: MUNS_API_TOKEN.
// ---------------------------------------------------------------------------

import { writeSnapshot, readSnapshot, nowIso, appendLog } from './util'

const SNAPSHOT_FILE = 'valuation-fundamentals-snapshot.json'
const API_URL = process.env.MUNS_AGENT_URL || 'https://devde.muns.io/chat/chat-muns'
const API_TIMEOUT_MS = 600_000

// company display name → id (the LISTED health insurers the tab values).
const COMPANIES: Record<string, string> = {
  'niva bupa': 'niva-bupa',
  'niva-bupa': 'niva-bupa',
  nivabupa: 'niva-bupa',
  'star health': 'star-health',
  'star-health': 'star-health',
  starhealth: 'star-health',
}

type Metric = 'gwp' | 'pat' | 'gwp_growth_yoy' | 'retail_share'
const METRICS: Metric[] = ['gwp', 'pat', 'gwp_growth_yoy', 'retail_share']
const BOUNDS: Record<Metric, { min: number; max: number }> = {
  gwp: { min: 1_000, max: 100_000 }, // Rs cr, full-year GWP
  pat: { min: 10, max: 15_000 }, // Rs cr, full-year PAT
  gwp_growth_yoy: { min: -50, max: 120 }, // %
  retail_share: { min: 0, max: 100 }, // %
}

interface FundRow {
  company_id: string
  fiscal_year: string
  gwp: number | null
  gwp_growth_yoy: number | null
  pat: number | null
  pat_growth_yoy: number | null
  retail_share: number | null
  retail_share_delta_bps: number | null
  provenance?: Record<string, unknown>
}
interface Snapshot {
  _meta: Record<string, unknown>
  data: FundRow[]
}

const fyNum = (fy: string) => Number(fy.replace(/^FY/, '')) || 0

/** Latest completed Indian fiscal year as FYxx (FY ends 31 Mar), evaluated in IST. */
export function latestCompletedFy(now = new Date()): number {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const Y = ist.getUTCFullYear()
  const M = ist.getUTCMonth() + 1
  return (M >= 4 ? Y : Y - 1) % 100
}

function buildPayload(targetFys: string[]) {
  const list = targetFys.join(', ')
  return {
    user_index: 124,
    tasks: [
      `I track two LISTED Indian health insurers — Niva Bupa (NSE: NIVABUPA) and Star Health (NSE: STARHEALTH). For fiscal year(s) ${list} (Indian FY ends 31 March; FY26 = 1 Apr 2025–31 Mar 2026) give me their reported FULL-YEAR figures. Use only REAL, published, sourced numbers from the company's results / investor releases. If unsure or not yet published, LEAVE IT OUT — never guess.\n\n` +
        'Return ONLY a pipe-delimited table, no leading/trailing pipe, EXACTLY these columns:\n\n' +
        'company | fiscal_year | metric | value | source_url\n\n' +
        'company = "Niva Bupa" or "Star Health".\n' +
        'metric must be EXACTLY one of:\n' +
        '  gwp            = full-year Gross Written Premium, Rs CRORE (digits only).  Niva FY26 ref ≈ 9433, Star FY26 ref ≈ 20369.\n' +
        '  pat            = full-year Profit After Tax, Rs CRORE (IFRS / Ind AS where reported). Niva FY26 ref ≈ 366, Star FY26 ref ≈ 911.\n' +
        '  gwp_growth_yoy = full-year GWP growth vs the prior year, in PERCENT (e.g. 27.4).\n' +
        '  retail_share   = the insurer\'s retail-health market share, in PERCENT, if the company reports it (Niva only).\n\n' +
        'value = the number only (convert any "lakh crore"/"crore" wording to plain crore). source_url = the exact results/IR page URL.\n' +
        'One row per (company, fiscal_year, metric) you can source; omit the rest. Newest year first.',
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

async function callAgent(token: string, targetFys: string[]): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { accept: '*/*', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(targetFys)),
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

export function parseValue(raw: string): number | null {
  const s = raw.toLowerCase().trim()
  const m = s.match(/-?\d[\d,]*(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0].replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  if (/lakh\s*crore|trillion/.test(s)) return Math.round(n * 100_000)
  return n
}

export interface AgentFigure {
  companyId: string
  fy: string
  metric: Metric
  value: number
  url: string
}

export function parseFigures(answer: string, validFys: Set<string>): AgentFigure[] {
  const out: AgentFigure[] = []
  for (const line of answer.split('\n')) {
    if (!line.includes('|')) continue
    const cells = line.split('|').map(clean)
    while (cells.length && cells[0] === '') cells.shift()
    while (cells.length && cells[cells.length - 1] === '') cells.pop()
    if (cells.length < 4) continue
    if (/^company$/i.test(cells[0]) || /^-+$/.test(cells[1] ?? '')) continue
    const companyId = COMPANIES[clean(cells[0]).toLowerCase()]
    if (!companyId) continue
    const fy = clean(cells[1]).toUpperCase().replace(/\s+/g, '')
    if (!validFys.has(fy)) continue
    const metric = clean(cells[2]).toLowerCase() as Metric
    if (!METRICS.includes(metric)) continue
    const value = parseValue(clean(cells[3]))
    if (value == null) continue
    const url = clean(cells[4]).match(/https?:\/\/\S+/)?.[0] ?? ''
    out.push({ companyId, fy, metric, value, url })
  }
  return out
}

export function accept(fig: AgentFigure): { ok: boolean; why?: string } {
  const b = BOUNDS[fig.metric]
  if (fig.value < b.min || fig.value > b.max) return { ok: false, why: `out of bounds [${b.min}-${b.max}]` }
  if (!fig.url) return { ok: false, why: 'no source url' }
  return { ok: true }
}

export async function main(): Promise<number> {
  const fetched_at = nowIso()
  const today = fetched_at.slice(0, 10)
  const token = (process.env.MUNS_API_TOKEN || '').trim()

  const snap = await readSnapshot<Snapshot>(SNAPSHOT_FILE)
  const rows = snap.data ?? []
  const keyOf = (c: string, fy: string) => `${c}::${fy}`
  const byKey = new Map(rows.map((r) => [keyOf(r.company_id, r.fiscal_year), r]))

  const latest = latestCompletedFy()
  const targetFys = [`FY${latest}`, `FY${latest - 1}`]
  const validFys = new Set(targetFys)

  const prevSuccessRun: string | null = (snap._meta?.last_successful_run as string) ?? null
  let pullSucceeded = false
  let filled = 0
  const rejected: string[] = []

  if (!token) {
    console.warn('MUNS_API_TOKEN not set — preserving the existing file (no fresh pull this run).')
  } else {
    console.log(`Calling chat-muns agent for valuation fundamentals (${targetFys.join(', ')}) ...`)
    try {
      const figures = parseFigures(extractAnswer(await callAgent(token, targetFys)), validFys)
      pullSucceeded = true
      console.log(`Parsed ${figures.length} candidate figure(s).`)
      for (const fig of figures) {
        let row = byKey.get(keyOf(fig.companyId, fig.fy))
        if (row && row[fig.metric] != null) continue // ADD-ONLY — never overwrite
        const verdict = accept(fig)
        if (!verdict.ok) {
          rejected.push(`${fig.companyId} ${fig.fy} ${fig.metric}=${fig.value} (${verdict.why})`)
          continue
        }
        if (!row) {
          row = {
            company_id: fig.companyId,
            fiscal_year: fig.fy,
            gwp: null,
            gwp_growth_yoy: null,
            pat: null,
            pat_growth_yoy: null,
            retail_share: null,
            retail_share_delta_bps: null,
          }
          byKey.set(keyOf(fig.companyId, fig.fy), row)
          rows.push(row)
        }
        row[fig.metric] = fig.value
        const prov = (row.provenance ?? {}) as Record<string, unknown>
        row.provenance = {
          ...prov,
          source_name: (prov.source_name as string) ?? 'Auto-filled by the muns web agent from company results',
          field_sources: { ...((prov.field_sources as Record<string, string>) ?? {}), [fig.metric]: fig.url },
          auto_filled: [...new Set([...((prov.auto_filled as string[]) ?? []), fig.metric])],
          confidence: 'medium',
          agent_last_run: fetched_at,
        }
        filled += 1
        console.log(`  + ${fig.companyId} ${fig.fy} ${fig.metric} = ${fig.value}  (${fig.url})`)
      }
    } catch (err) {
      console.error(`agent pull failed (file preserved): ${err instanceof Error ? err.message : String(err)}`)
    }
    if (rejected.length) console.warn(`Rejected by sanity gate: ${rejected.join('; ')}`)
  }

  rows.sort((a, b) => a.company_id.localeCompare(b.company_id) || fyNum(b.fiscal_year) - fyNum(a.fiscal_year))
  snap.data = rows
  snap._meta = {
    ...snap._meta,
    last_updated: filled > 0 ? today : (snap._meta?.last_updated as string) ?? today,
    last_successful_run: pullSucceeded ? fetched_at : prevSuccessRun,
    agent_target_fys: targetFys,
  }

  await writeSnapshot(SNAPSHOT_FILE, snap)
  await appendLog('valuation-fundamentals-agent.log', { filled, rejected: rejected.length, target: targetFys, had_token: !!token })
  console.log(`valuation-fundamentals: ${filled} field(s) filled this run; ${rejected.length} rejected.`)
  return 0
}

import { pathToFileURL } from 'node:url'
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
