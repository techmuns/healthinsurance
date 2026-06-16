// ---------------------------------------------------------------------------
//  Life-industry components — auto-refresh agent (muns chat agent, web search).
//
//  Closes the last manual gap on the Industry page. The "Market Size by Segment"
//  and "PSU vs Private" ring cards compose from three ANNUAL figures that have no
//  monthly feed and used to be hand-seeded:
//    • life_total_premium — all-India life premium, first-year + renewal (IRDAI / Life Council)
//    • lic_total_premium  — LIC's own total premium = public-sector life (LIC results)
//    • public_gi_premium  — the four PSU general insurers combined (GI Council / IRDAI)
//  (the GI total is already swept every 3 days, so it needs no manual step.)
//
//  On each run this asks the muns agent for those three figures for the latest
//  COMPLETED fiscal year(s) — self-targeting (Indian FY ends 31 Mar), so it moves
//  to FY27, FY28… on its own with no code edit. It then merges ADD-ONLY into
//  life-industry-premium.json:
//    • a populated cell is NEVER overwritten (the audited FY25 seed is safe);
//    • only genuinely-missing fields get filled, each with its own source URL;
//    • anything the agent can't source stays null — missing is never zero, never
//      fabricated. A no-token / failed run preserves the file untouched.
//
//  Sanity-gated: a figure outside plausible bounds (or off-basis, e.g. a life
//  NEW-BUSINESS number mistaken for total premium) is rejected, not written.
//  Token: MUNS_API_TOKEN.  Scheduled every 6 months (life-industry-fetch.yml).
// ---------------------------------------------------------------------------

import { writeSnapshot, readSnapshot, nowIso, appendLog } from './util'

const SNAPSHOT_FILE = 'life-industry-premium.json'
const SEGMENT_FILE = 'industry-segment-premium.json'
const API_URL = process.env.MUNS_AGENT_URL || 'https://devde.muns.io/chat/chat-muns'
const API_TIMEOUT_MS = 600_000

type Metric = 'life_total_premium' | 'lic_total_premium' | 'public_gi_premium'
const METRICS: Metric[] = ['life_total_premium', 'lic_total_premium', 'public_gi_premium']

// Plausibility bounds in Rs crore. Generous, but enough to reject an off-basis
// read (e.g. life NEW-BUSINESS ~4.6 L cr mistaken for TOTAL premium ~8.9 L cr,
// or a single insurer mistaken for the public-sector aggregate).
const BOUNDS: Record<Metric, { min: number; max: number }> = {
  life_total_premium: { min: 600_000, max: 2_500_000 },
  lic_total_premium: { min: 350_000, max: 1_500_000 },
  public_gi_premium: { min: 60_000, max: 400_000 },
}

interface LifeRow {
  fiscal_year: string
  life_total_premium: number | null
  lic_total_premium: number | null
  public_gi_premium: number | null
  lic_share_of_life_total?: number | null
  basis?: string
  provenance?: Record<string, unknown>
}
interface Snapshot {
  _meta: Record<string, unknown>
  data: LifeRow[]
}

const fyNum = (fy: string) => Number(fy.replace(/^FY/, '')) || 0

/** Latest completed Indian fiscal year as FYxx (FY ends 31 Mar). */
export function latestCompletedFy(now = new Date()): number {
  const Y = now.getUTCFullYear()
  const M = now.getUTCMonth() + 1
  const endingYear = M >= 4 ? Y : Y - 1 // year of the most recent 31-March close
  return endingYear % 100
}

function buildPayload(targetFys: string[]) {
  const list = targetFys.join(', ')
  return {
    user_index: 124,
    tasks: [
      `I need three ANNUAL Indian insurance figures for fiscal year(s) ${list} (Indian FY ends 31 March; e.g. FY26 = 1 Apr 2025–31 Mar 2026). Use only REAL, published, sourced numbers. If you are not certain of a figure or it is not yet published, LEAVE IT OUT — do NOT guess or estimate.\n\n` +
        'Return ONLY a pipe-delimited table, no leading or trailing pipe, with EXACTLY these columns in this order:\n\n' +
        'fiscal_year | metric | value_rs_crore | source_url\n\n' +
        'metric must be EXACTLY one of these three (mind the basis — this matters):\n' +
        '  life_total_premium = TOTAL life premium of ALL life insurers combined = first-year PLUS renewal premium (NOT new-business / first-year-only). FY25 reference ≈ 886000.\n' +
        '  lic_total_premium  = LIC of India TOTAL premium income (first-year + renewal). FY25 reference ≈ 488148.\n' +
        '  public_gi_premium  = combined gross direct premium of the FOUR public-sector general insurers (New India, National, Oriental, United India). FY25 reference ≈ 106000.\n\n' +
        'Rules:\n' +
        'value_rs_crore = the figure in Rs CRORE, digits only (e.g. 974000). Convert "lakh crore"/"trillion" to crore yourself.\n' +
        'source_url = the exact URL of the IRDAI / Life Insurance Council / GI Council / company-results page that states the figure.\n' +
        'Give one row per (fiscal_year, metric) you can source. Omit any row you cannot source from a real page. Newest year first.\n\n' +
        'Example (format only — use real current data):\n' +
        'fiscal_year | metric | value_rs_crore | source_url\n' +
        'FY26 | lic_total_premium | 535984 | https://licindia.in/...\n' +
        'FY26 | public_gi_premium | 104000 | https://www.gicouncil.in/...',
    ],
    query_context: {
      TICKER_SYMBOL: [],
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

function extractAnswer(text: string): string {
  const m = text.match(/<ans>([\s\S]*?)<\/ans>/)
  return m ? m[1] : text
}
const clean = (s: string | undefined) => (s ?? '').replace(/^["'\s]+|["'\s]+$/g, '').trim()

/** Parse a value cell to Rs crore, tolerating "lakh crore" / "trillion" wording. */
export function parseCrore(raw: string): number | null {
  const s = raw.toLowerCase().trim()
  // Capture one number that may carry Indian/US comma grouping (e.g. 9,74,000)
  // and/or a decimal, then strip the separators.
  const numMatch = s.match(/-?\d[\d,]*(?:\.\d+)?/)
  if (!numMatch) return null
  const n = Number(numMatch[0].replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  if (/lakh\s*crore|trillion/.test(s)) return Math.round(n * 100_000) // 1 lakh-cr = 1 trillion-INR = 100000 cr
  if (/lakh/.test(s)) return Math.round(n / 100) // 1 lakh = 0.01 crore (rare here)
  return Math.round(n)
}

export interface AgentFigure {
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
    if (cells.length < 3) continue
    if (/^fiscal_year$/i.test(cells[0]) || /^-+$/.test(cells[1] ?? '')) continue // header / divider
    const fy = clean(cells[0]).toUpperCase().replace(/\s+/g, '')
    if (!validFys.has(fy)) continue
    const metric = clean(cells[1]).toLowerCase() as Metric
    if (!METRICS.includes(metric)) continue
    const value = parseCrore(clean(cells[2]))
    if (value == null) continue
    const url = (clean(cells[3]).match(/https?:\/\/\S+/)?.[0]) ?? ''
    out.push({ fy, metric, value, url })
  }
  return out
}

/** Sanity gate: bounds + cross-checks against same-year facts already in hand. */
export function accept(fig: AgentFigure, ctx: { totalGi: Map<string, number>; licByFy: Map<string, number>; lifeByFy: Map<string, number> }): { ok: boolean; why?: string } {
  const b = BOUNDS[fig.metric]
  if (fig.value < b.min || fig.value > b.max) return { ok: false, why: `out of bounds [${b.min}-${b.max}]` }
  if (!fig.url) return { ok: false, why: 'no source url' }
  if (fig.metric === 'public_gi_premium') {
    const tg = ctx.totalGi.get(fig.fy)
    if (tg != null && (fig.value >= tg || fig.value < tg * 0.15)) return { ok: false, why: `public_gi implausible vs total GI ${tg}` }
  }
  if (fig.metric === 'lic_total_premium') {
    const lt = ctx.lifeByFy.get(fig.fy)
    if (lt != null && fig.value >= lt) return { ok: false, why: `LIC >= industry life total ${lt}` }
  }
  if (fig.metric === 'life_total_premium') {
    const lic = ctx.licByFy.get(fig.fy)
    if (lic != null && fig.value <= lic) return { ok: false, why: `life total <= LIC ${lic}` }
  }
  return { ok: true }
}

export async function main(): Promise<number> {
  const fetched_at = nowIso()
  const today = fetched_at.slice(0, 10)
  const token = (process.env.MUNS_API_TOKEN || '').trim()

  const snap = await readSnapshot<Snapshot>(SNAPSHOT_FILE)
  const rows = snap.data ?? []
  const byFy = new Map(rows.map((r) => [r.fiscal_year, r]))

  // Same-year facts for the sanity gate.
  const totalGi = new Map<string, number>()
  try {
    const seg = await readSnapshot<{ data: Array<{ period_type: string; fiscal_year: string; total_gi_premium: number | null }> }>(SEGMENT_FILE)
    for (const r of seg.data) if (r.period_type === 'annual' && r.total_gi_premium != null) totalGi.set(r.fiscal_year, r.total_gi_premium)
  } catch {
    /* segment snapshot absent — skip that cross-check */
  }
  const licByFy = new Map<string, number>()
  const lifeByFy = new Map<string, number>()
  for (const r of rows) {
    if (r.lic_total_premium != null) licByFy.set(r.fiscal_year, r.lic_total_premium)
    if (r.life_total_premium != null) lifeByFy.set(r.fiscal_year, r.life_total_premium)
  }

  const latest = latestCompletedFy()
  const targetFys = [`FY${latest}`, `FY${latest - 1}`]
  const validFys = new Set(targetFys)

  let prevSuccessRun: string | null = (snap._meta?.last_successful_run as string) ?? null
  let pullSucceeded = false
  let filled = 0
  const rejected: string[] = []

  if (!token) {
    console.warn('MUNS_API_TOKEN not set — preserving the existing file (no fresh pull this run).')
  } else {
    console.log(`Calling chat-muns agent for life-industry components (${targetFys.join(', ')}) ...`)
    try {
      const raw = await callAgent(token, targetFys)
      pullSucceeded = true
      const figures = parseFigures(extractAnswer(raw), validFys)
      console.log(`Parsed ${figures.length} candidate figure(s).`)
      for (const fig of figures) {
        // ADD-ONLY: never overwrite a populated cell (audited seed is safe).
        let row = byFy.get(fig.fy)
        if (row && row[fig.metric] != null) continue
        const verdict = accept(fig, { totalGi, licByFy, lifeByFy })
        if (!verdict.ok) {
          rejected.push(`${fig.fy} ${fig.metric}=${fig.value} (${verdict.why})`)
          continue
        }
        if (!row) {
          row = { fiscal_year: fig.fy, life_total_premium: null, lic_total_premium: null, public_gi_premium: null }
          byFy.set(fig.fy, row)
          rows.push(row)
        }
        row[fig.metric] = fig.value
        // keep cross-checks consistent for subsequent figures in the same run
        if (fig.metric === 'lic_total_premium') licByFy.set(fig.fy, fig.value)
        if (fig.metric === 'life_total_premium') lifeByFy.set(fig.fy, fig.value)
        const prov = (row.provenance ?? {}) as Record<string, unknown>
        const fieldSources = { ...((prov.field_sources as Record<string, string>) ?? {}) }
        fieldSources[fig.metric] = fig.url
        const autoFilled = new Set<string>([...((prov.auto_filled as string[]) ?? []), fig.metric])
        row.provenance = {
          ...prov,
          source_name: (prov.source_name as string) ?? 'Auto-filled by the muns web agent from official sources',
          field_sources: fieldSources,
          auto_filled: [...autoFilled],
          confidence: 'medium',
          agent_last_run: fetched_at,
        }
        filled += 1
        console.log(`  + ${fig.fy} ${fig.metric} = ${fig.value} cr  (${fig.url})`)
      }
    } catch (err) {
      console.error(`agent pull failed (file preserved): ${err instanceof Error ? err.message : String(err)}`)
    }
    if (rejected.length) console.warn(`Rejected by sanity gate: ${rejected.join('; ')}`)
  }

  rows.sort((a, b) => fyNum(b.fiscal_year) - fyNum(a.fiscal_year))
  snap.data = rows
  snap._meta = {
    ...snap._meta,
    last_updated: filled > 0 ? today : (snap._meta?.last_updated as string) ?? today,
    last_successful_run: pullSucceeded ? fetched_at : prevSuccessRun,
    agent_target_fys: targetFys,
  }

  await writeSnapshot(SNAPSHOT_FILE, snap)
  await appendLog('life-industry-agent.log', { filled, rejected: rejected.length, target: targetFys, had_token: !!token })
  console.log(`life-industry-premium: ${filled} field(s) filled this run; ${rejected.length} rejected; years now ${rows.map((r) => r.fiscal_year).join(', ')}.`)
  return 0
}

import { pathToFileURL } from 'node:url'
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
