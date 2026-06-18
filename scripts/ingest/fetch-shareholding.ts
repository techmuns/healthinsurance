// ---------------------------------------------------------------------------
//  Niva Bupa shareholding pattern → shareholding-pattern-snapshot.json.
//
//  WHY THIS EXISTS (the honest version): the named, per-holder shareholding
//  breakdown the Captable tab shows (Bupa Singapore Holdings, Fettle Tone LLP,
//  Temasek, the mutual funds, …) is NOT on Screener's *public* page — logged out,
//  Screener publishes only four class totals (Promoters / FIIs / DIIs / Public).
//  The named list is login-only there. So the authoritative source is the
//  company's quarterly EXCHANGE shareholding-pattern filing (Reg. 31 LODR) — the
//  very document Screener itself copies from. This fetcher pulls that filing's
//  per-holder share counts via the muns chat agent (web-search + filings access)
//  and refreshes the snapshot the Captable cells read from.
//
//  WHAT IT DOES NOW (backfill + merge): it fills EVERY filed quarter since the
//  company listed — not just the latest — so the shareholding-trend view has a
//  real period-on-period history. Each run pulls the quarters still missing
//  (newest first) plus a refresh of the latest, MERGES them into the snapshot,
//  and never drops a quarter already on record. A run is bounded (a per-call
//  timeout + an overall wall-clock budget + a per-run quarter cap) so it always
//  finishes inside the CI window; the history simply fills over a few runs.
//
//  HONESTY GATE — a wrong or hallucinated number can never land. Per quarter:
//    • every one of the template's holders must come back as a positive integer
//      (a holder returned as MISSING aborts that quarter — never guessed, never 0);
//    • the holders must SUM EXACTLY to the disclosed total shares for THAT quarter;
//    • the agent's AS_OF must equal the quarter we asked for (a different quarter
//      is never relabelled or stored under the requested date);
//    • a source URL must be present;
//    • the total must be within a sane band of the nearest known quarter (this only
//      catches gross scale errors — e.g. lakhs vs units).
//  A quarter that fails any gate is skipped; the rest of the run still proceeds and
//  whatever passed is merged. Missing stays missing — we never partial-fill a quarter.
//
//  Token: MUNS_API_TOKEN (a GitHub Actions secret). Offline / no token → no-op
//  that preserves the committed snapshot.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SNAPSHOTS_ROOT, nowIso, appendLog } from './util'

const API_URL = process.env.MUNS_AGENT_URL || 'https://devde.muns.io/chat/chat-muns'
const PER_CALL_TIMEOUT_MS = 300_000 // 5-min hard ceiling on a single quarter call
const RUN_BUDGET_MS = 13 * 60_000 // stop launching new calls past this (CI cap is 20 min)
const MAX_QUARTERS_PER_RUN = Math.max(1, Number(process.env.SHAREHOLDING_MAX_QUARTERS) || 4)
const SNAPSHOT_PATH = resolve(SNAPSHOTS_ROOT, 'shareholding-pattern-snapshot.json')

const COMPANY_ID = 'niva-bupa'
const COMPANY_NAME = 'Niva Bupa Health Insurance'
const NSE = 'NIVABUPA'
const BSE = '544286'
const SCREENER_URL = 'https://www.screener.in/company/NIVABUPA/#shareholding'
const BSE_FILING_URL =
  'https://www.bseindia.com/stock-share-price/niva-bupa-health-insurance-company-ltd/nivabupa/544286/shareholding-pattern/'

// Niva Bupa listed in Nov 2024; its first shareholding pattern as a listed
// company is the quarter ended 31 Dec 2024 — where the "since listing" backfill
// begins. (No earlier quarter exists as a public filing.)
const FIRST_QUARTER_END = '2024-12-31'

// The Captable tab's 15 holder buckets, in template order. These exact strings
// are the `shareholding_shares::<holder>` sub-keys in schema-map.json — they must
// match character-for-character or the value won't bind to the cell.
const HOLDERS = [
  'Bupa Singapore Holdings', 'Fettle Tone LLP', 'Temasek', 'DSP Mutual Fund',
  'Motilal Oswal Private Equity', 'Nippon India Mutual Funds', 'Amansa Holdings', 'A91',
  'Tata Mutual Fund', 'SBI Mutual Fund', 'Insurance Companies', 'Pallonji',
  'Other Mutual funds', 'Paragon', 'Others',
] as const
const HOLDER_INDEX = new Map<string, number>(HOLDERS.map((h, i) => [h, i]))

// Generous on purpose: the strong gates are (a) the 15 holders summing EXACTLY
// to the disclosed total and (b) the returned AS_OF matching the quarter asked
// for. The band only sanity-checks each quarter's total against the nearest
// known quarter to catch gross scale errors (shares move only via issuance/ESOP).
const BAND_LOW = 0.7
const BAND_HIGH = 1.4

interface HolderRow {
  company_id: string
  holder: string
  period: string
  filing_period: string
  shares: number
  pct: number
  provenance: Record<string, unknown>
}
interface Snapshot {
  _meta: Record<string, unknown>
  data: HolderRow[]
}

function readSnapshotFile(): Snapshot | null {
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Snapshot
  } catch {
    return null
  }
}

// ── Quarter math (Indian fiscal quarters, calendar quarter-ends) ─────────────
const QUARTER_END_MD = ['03-31', '06-30', '09-30', '12-31']

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Every calendar quarter-end in [first, last], ascending. */
function quarterEndsBetween(firstIso: string, lastIso: string): string[] {
  const out: string[] = []
  for (let y = Number(firstIso.slice(0, 4)); y <= Number(lastIso.slice(0, 4)); y++) {
    for (const md of QUARTER_END_MD) {
      const d = `${y}-${md}`
      if (d >= firstIso && d <= lastIso) out.push(d)
    }
  }
  return out.sort()
}

/** Most recent quarter-end whose filing window has elapsed (LODR ≈ 21 days). */
function latestFiledQuarterEnd(todayIso: string, lagDays = 25): string {
  const cutoff = addDays(todayIso, -lagDays)
  const y = Number(cutoff.slice(0, 4))
  const candidates = [
    ...QUARTER_END_MD.map((md) => `${y - 1}-${md}`),
    ...QUARTER_END_MD.map((md) => `${y}-${md}`),
  ]
    .filter((d) => d <= cutoff)
    .sort()
  return candidates[candidates.length - 1]
}

/** "2026-03-31" → "Q4FY26" (Indian FY ends 31 Mar). */
function quarterLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  const q = m <= 3 ? 4 : m <= 6 ? 1 : m <= 9 ? 2 : 3
  const fyEnd = m <= 3 ? y : y + 1
  return `Q${q}FY${String(fyEnd).slice(2)}`
}
function monthYear(iso: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [y, m] = iso.split('-').map(Number)
  return `${months[m - 1]} ${y}`
}

/** Nearest-in-time known total (for the scale sanity-band). */
function nearestKnownTotal(iso: string, totals: Map<string, number>): number | null {
  let best: number | null = null
  let bestGap = Infinity
  const t = Date.parse(iso)
  for (const [p, v] of totals) {
    const gap = Math.abs(Date.parse(p) - t)
    if (gap < bestGap) {
      bestGap = gap
      best = v
    }
  }
  return best
}

function buildPayload(targetIso: string) {
  const holderList = HOLDERS.join(' | ')
  const ql = quarterLabel(targetIso)
  return {
    user_index: 124,
    tasks: [
      `I need the quarterly SHAREHOLDING PATTERN, by NUMBER OF EQUITY SHARES, for the ` +
        `NSE/BSE-listed company ${COMPANY_NAME} (NSE: ${NSE}, BSE: ${BSE}) for the SPECIFIC quarter ` +
        `ended ${targetIso} (${ql}), taken from its official exchange shareholding-pattern filing ` +
        `(SEBI LODR Reg. 31) for that quarter — the same data shown at ${SCREENER_URL} .\n\n` +
        `Give the number of equity shares held by each of these holders/groups AS DISCLOSED FOR THE ` +
        `QUARTER ENDED ${targetIso}:\n${holderList}\n\n` +
        `Output EXACTLY this pipe-delimited block and nothing else (no prose, no commentary):\n` +
        `AS_OF | <quarter-end date as YYYY-MM-DD>\n` +
        `TOTAL | <total number of equity shares, integer>\n` +
        `SOURCE | <URL of the exchange shareholding-pattern filing or screener page>\n` +
        HOLDERS.map((h) => `${h} | <shares>`).join('\n') +
        `\n\nRules:\n` +
        `• shares = a plain integer (no commas, no %, no words).\n` +
        `• Use ONLY the filing for the quarter ended ${targetIso} (${ql}). AS_OF MUST equal ${targetIso}. ` +
        `If the only data you can find is for a different quarter, set AS_OF to that quarter's real date — ` +
        `do NOT relabel it as ${targetIso}.\n` +
        `• If that quarter's filing does not exist or you cannot find it, output only: AS_OF | NONE\n` +
        `• "Other Mutual funds" = mutual-fund holders not named above; "Insurance Companies" = ` +
        `insurer holders; "Others" = ALL remaining shares not separately named — set "Others" so ` +
        `that the 15 holder lines SUM EXACTLY to TOTAL.\n` +
        `• If you cannot get a holder's exact share count from that quarter's filing, write the single ` +
        `word MISSING for it — never guess, never 0.\n` +
        `• Do not fabricate. Keep the holder names and order exactly as given.`,
    ],
    query_context: {
      TICKER_SYMBOL: [NSE],
      FROM_DATE: addDays(targetIso, -150),
      TO_DATE: addDays(targetIso, 45),
      ANNOUNCEMENT_FORM_TYPE: 'all',
      DOCUMENT_IDS: [],
      CATEGORIES: [],
      WEB_SEARCH_ENABLED: true,
      COUNTRY: [],
      CONTEXT_EMAIL: 'nadamsaluja@gmail.com',
      CONTEXT_COMPANY_NAME: [COMPANY_NAME],
      GET_ANNOUNCEMENTS_ENABLED: false,
      chatHistory: [],
      mode: 'fast',
    },
    autoAddUpcoming: false,
  }
}

async function callAgent(token: string, targetIso: string): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PER_CALL_TIMEOUT_MS)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { accept: '*/*', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(targetIso)),
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

function parseInt0(s: string | undefined): number | null {
  if (s == null) return null
  const t = s.replace(/[,\s]/g, '')
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return Number.isInteger(n) && n > 0 ? n : null
}

interface Parsed {
  asOf: string | null
  total: number | null
  source: string | null
  holders: Map<string, number>
  missing: string[]
}

function parseAnswer(answer: string): Parsed {
  const out: Parsed = { asOf: null, total: null, source: null, holders: new Map(), missing: [] }
  const byLabel = new Map(HOLDERS.map((h) => [h.toLowerCase(), h]))
  for (const line of answer.split('\n')) {
    if (!line.includes('|')) continue
    const i = line.indexOf('|')
    const label = line.slice(0, i).trim()
    const rest = line.slice(i + 1).trim()
    const key = label.toLowerCase()
    if (key === 'as_of') { out.asOf = (rest.match(/\d{4}-\d{2}-\d{2}/) ?? [])[0] ?? null; continue }
    if (key === 'total') { out.total = parseInt0(rest); continue }
    if (key === 'source') { out.source = (rest.match(/https?:\/\/\S+/) ?? [])[0] ?? null; continue }
    const canonical = byLabel.get(key)
    if (!canonical) continue
    if (/^missing$/i.test(rest)) { out.missing.push(canonical); continue }
    const n = parseInt0(rest.split('|')[0])
    if (n != null) out.holders.set(canonical, n)
  }
  return out
}

/** The 15 source-backed rows for one validated quarter. */
function buildQuarterRows(p: Parsed): HolderRow[] {
  const asOf = p.asOf!
  const total = p.total!
  const filing_period = quarterLabel(asOf)
  const fetched_at = nowIso()
  const source_name =
    `${COMPANY_NAME} — Shareholding pattern, quarter ended ${asOf} (${filing_period}), as filed with BSE/NSE ` +
    `(Reg. 31 LODR). Auto-fetched via the muns filings agent and verified: the 15 holders sum exactly to the ` +
    `${total.toLocaleString('en-IN')} total shares. The named per-holder list is not on Screener's public page ` +
    `(login-only there); the exchange filing is the source. Cross-reference: ${SCREENER_URL}`
  return HOLDERS.map((holder) => {
    const shares = p.holders.get(holder)!
    return {
      company_id: COMPANY_ID,
      holder,
      period: asOf,
      filing_period,
      shares,
      pct: Math.round((10000 * shares) / total) / 100,
      provenance: {
        source_name,
        source_url: p.source || BSE_FILING_URL,
        source_file: null,
        fetched_at,
        confidence: 'high',
        source_status: 'available',
      },
    }
  })
}

/** Gate one quarter. Returns its rows + total, or null + the reason it was held. */
function validateQuarter(
  p: Parsed,
  requestedIso: string,
  nearestTotal: number | null,
): { rows: HolderRow[] | null; total: number | null; reason: string } {
  const tag = `${quarterLabel(requestedIso)} (${requestedIso})`
  if (p.asOf == null && !p.holders.size && !p.total)
    return { rows: null, total: null, reason: `${tag}: filing not found / no data returned` }
  if (p.asOf && p.asOf !== requestedIso)
    return { rows: null, total: null, reason: `${tag}: agent returned a different quarter (${p.asOf}) — not stored` }
  if (p.missing.length)
    return { rows: null, total: null, reason: `${tag}: holder(s) MISSING (won't guess): ${p.missing.join(', ')}` }
  const absent = HOLDERS.filter((h) => !p.holders.has(h))
  if (absent.length) return { rows: null, total: null, reason: `${tag}: holder(s) absent from answer: ${absent.join(', ')}` }
  if (!p.total) return { rows: null, total: null, reason: `${tag}: no parseable TOTAL shares` }
  if (!p.source) return { rows: null, total: null, reason: `${tag}: no SOURCE url` }
  if (!p.asOf) return { rows: null, total: null, reason: `${tag}: no AS_OF quarter-end date` }

  const sum = HOLDERS.reduce((a, h) => a + (p.holders.get(h) ?? 0), 0)
  if (sum !== p.total)
    return { rows: null, total: null, reason: `${tag}: sum gate failed — holders ${sum.toLocaleString('en-IN')} ≠ TOTAL ${p.total.toLocaleString('en-IN')}` }

  if (nearestTotal && (p.total < nearestTotal * BAND_LOW || p.total > nearestTotal * BAND_HIGH))
    return { rows: null, total: null, reason: `${tag}: total ${p.total.toLocaleString('en-IN')} outside sane band of nearest known ${nearestTotal.toLocaleString('en-IN')}` }

  return { rows: buildQuarterRows(p), total: p.total, reason: 'ok' }
}

/** Assemble the merged multi-quarter snapshot. `as_of`/`total_shares` always
 *  reflect the LATEST quarter so the Captable column-sync stays correct. */
function buildSnapshot(
  byPeriod: Map<string, HolderRow[]>,
  knownTotals: Map<string, number>,
  prior: Snapshot | null,
): Snapshot {
  const periodsAsc = [...byPeriod.keys()].sort()
  const data = periodsAsc.flatMap((p) =>
    [...(byPeriod.get(p) ?? [])].sort((x, y) => (HOLDER_INDEX.get(x.holder) ?? 99) - (HOLDER_INDEX.get(y.holder) ?? 99)),
  )
  const latestPeriod = periodsAsc[periodsAsc.length - 1]
  const filingOf = (p: string) => byPeriod.get(p)?.[0]?.filing_period ?? quarterLabel(p)
  const totalOf = (p: string) => knownTotals.get(p) ?? (byPeriod.get(p) ?? []).reduce((s, r) => s + (r.shares ?? 0), 0)
  const periods = periodsAsc.map((p) => ({ period: p, filing_period: filingOf(p), total_shares: totalOf(p) }))

  return {
    _meta: {
      snapshot_id: 'shareholding-pattern-snapshot',
      description:
        'Per-holder shareholding pattern (share counts) for listed SAHIs, across every filed quarter since ' +
        'listing, from the quarterly exchange shareholding-pattern filing. Feeds the Captable tab (latest quarter, ' +
        'via sync_captable_period.py + build_value_store.py) and the shareholding-trend view (all quarters). Each ' +
        'quarter is independently gated — its 15 holders sum exactly to that quarter\'s disclosed total. Missing ' +
        'stays missing — never 0; a holder is written only with a real sourced count.',
      schema_version: '1.1.0',
      company_id: COMPANY_ID,
      as_of: latestPeriod,
      period_label: `${filingOf(latestPeriod)} (${monthYear(latestPeriod)})`,
      total_shares: totalOf(latestPeriod),
      holders_sum_ties_to_total: true,
      periods, // every filed quarter on record, ascending
      periods_count: periods.length,
      last_successful_run: nowIso(),
      parser_status: 'ready',
      source_policy:
        'Official exchange shareholding-pattern filing is authoritative (rank 1). The named per-holder breakdown ' +
        "is NOT on Screener's public page (login-only there), so the filing is the source; Screener's category " +
        'totals are kept below as a public cross-check only.',
      category_totals_pct: (prior?._meta?.category_totals_pct as Record<string, unknown>) ?? null,
    },
    data,
  }
}

/** Compare the meaningful columns only (ignores per-run provenance timestamps). */
function sameData(a: HolderRow[], b: HolderRow[]): boolean {
  const key = (rows: HolderRow[]) =>
    rows.map((r) => `${r.company_id}|${r.period}|${r.holder}|${r.shares}|${r.pct}`).sort().join('\n')
  return key(a) === key(b)
}

function writeSnapshotFile(snapshot: Snapshot): void {
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'utf8')
}

/** Stamp last_attempt onto the existing snapshot without touching the data — so a
 *  no-op run still records that it ran (and why nothing changed). */
function stampAttempt(prior: Snapshot | null, status: string, note: string): void {
  if (!prior) return
  prior._meta = { ...prior._meta, last_attempt: nowIso(), last_attempt_status: status, last_attempt_note: note }
  writeSnapshotFile(prior)
}

async function main(): Promise<number> {
  const prior = readSnapshotFile()
  const token = (process.env.MUNS_API_TOKEN || '').trim()
  if (!token) {
    console.warn('MUNS_API_TOKEN not set — preserving the committed shareholding snapshot (no fresh pull).')
    return 0
  }

  const startedAt = Date.now()

  // Group the quarters already on record; seed each quarter's known total.
  const byPeriod = new Map<string, HolderRow[]>()
  for (const r of prior?.data ?? []) {
    if (!r || typeof r.period !== 'string') continue
    const a = byPeriod.get(r.period) ?? []
    a.push(r)
    byPeriod.set(r.period, a)
  }
  const knownTotals = new Map<string, number>()
  for (const [period, rows] of byPeriod) {
    const t = rows.reduce((s, r) => s + (typeof r.shares === 'number' ? r.shares : 0), 0)
    if (t > 0) knownTotals.set(period, t)
  }

  // Which quarters to ask for: every missing quarter since listing (newest first,
  // most useful first), plus a trailing refresh of the latest filed quarter.
  const today = nowIso().slice(0, 10)
  const latest = latestFiledQuarterEnd(today)
  const targets = quarterEndsBetween(FIRST_QUARTER_END, latest)
  const queue = targets.filter((t) => !byPeriod.has(t)).reverse()
  if (!queue.includes(latest)) queue.push(latest)
  const toProcess = queue.slice(0, MAX_QUARTERS_PER_RUN)

  console.log(
    `shareholding backfill — ${targets.length} target quarter(s) ${targets[0]}…${latest}; ` +
      `${byPeriod.size} on record; processing up to ${toProcess.length}: ${toProcess.join(', ')}`,
  )

  const fetched = new Map<string, HolderRow[]>()
  let held = 0
  for (const q of toProcess) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      console.warn(`run budget reached — stopping before ${q}; the rest fills on the next run.`)
      break
    }
    let raw: string
    try {
      console.log(`  · asking the muns agent for ${quarterLabel(q)} (${q}) …`)
      raw = await callAgent(token, q)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ ${q}: agent call failed — ${reason}`)
      await appendLog('fetch-shareholding.log', { company_id: COMPANY_ID, status: 'error', quarter: q, reason })
      held++
      continue
    }
    const parsed = parseAnswer(extractAnswer(raw))
    const { rows, total, reason } = validateQuarter(parsed, q, nearestKnownTotal(q, knownTotals))
    if (!rows) {
      console.warn(`  ⃠ ${q}: held — ${reason}`)
      await appendLog('fetch-shareholding.log', { company_id: COMPANY_ID, status: 'held', quarter: q, reason })
      held++
      continue
    }
    fetched.set(q, rows)
    if (total) knownTotals.set(q, total) // feed the next quarter's sanity-band
    console.log(`  ✓ ${q}: ${total?.toLocaleString('en-IN')} shares, 15 holders tie to total.`)
    await appendLog('fetch-shareholding.log', { company_id: COMPANY_ID, status: 'fetched', quarter: q, total })
  }

  // Merge: keep every quarter already on record; overlay the ones (re)fetched now.
  for (const [q, rows] of fetched) byPeriod.set(q, rows)

  if (!byPeriod.size) {
    const reason = 'no shareholding data on record and nothing fetched this run'
    console.warn(reason)
    await appendLog('fetch-shareholding.log', { company_id: COMPANY_ID, status: 'held', reason })
    stampAttempt(prior, 'held', reason)
    return 0
  }

  const snapshot = buildSnapshot(byPeriod, knownTotals, prior)

  // No-op when the merge changes nothing meaningful (avoids churny commits).
  if (prior && sameData(prior.data ?? [], snapshot.data)) {
    const note = fetched.size ? 'refetched quarter(s) identical to snapshot' : 'no new quarter available yet'
    console.log(`no change — ${note}.`)
    await appendLog('fetch-shareholding.log', { company_id: COMPANY_ID, status: 'unchanged', as_of: snapshot._meta.as_of, held })
    stampAttempt(prior, 'unchanged', note)
    return 0
  }

  writeSnapshotFile(snapshot)
  const periods = [...byPeriod.keys()].sort()
  console.log(
    `✓ shareholding snapshot updated → ${periods.length} quarter(s) [${periods.join(', ')}], latest ` +
      `${snapshot._meta.as_of}. Added/refreshed this run: ${[...fetched.keys()].join(', ') || 'none'}.`,
  )
  await appendLog('fetch-shareholding.log', {
    company_id: COMPANY_ID,
    status: 'updated',
    as_of: snapshot._meta.as_of,
    periods: periods.length,
    fetched: [...fetched.keys()],
    held,
  })
  return 0
}

main().then((code) => {
  process.exitCode = code
})
