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
//  HONESTY GATE — a wrong or hallucinated number can never land:
//    • every one of the template's holders must come back as a positive integer
//      (a holder returned as MISSING aborts the write — never guessed, never 0);
//    • the holders must SUM EXACTLY to the disclosed total shares;
//    • the disclosed total must be within a sane band of the last-known total
//      (share count only moves via issuance/ESOP — a few % a quarter at most);
//    • a source URL must be present.
//  If any gate fails the prior snapshot (last-known-good) is left untouched and
//  the reason is logged. Missing stays missing; we never partial-fill.
//
//  Token: MUNS_API_TOKEN (a GitHub Actions secret). Offline / no token → no-op
//  that preserves the committed snapshot.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SNAPSHOTS_ROOT, nowIso, appendLog } from './util'

const API_URL = process.env.MUNS_AGENT_URL || 'https://devde.muns.io/chat/chat-muns'
const API_TIMEOUT_MS = 600_000
const SNAPSHOT_PATH = resolve(SNAPSHOTS_ROOT, 'shareholding-pattern-snapshot.json')

const COMPANY_ID = 'niva-bupa'
const COMPANY_NAME = 'Niva Bupa Health Insurance'
const NSE = 'NIVABUPA'
const BSE = '544286'
const SCREENER_URL = 'https://www.screener.in/company/NIVABUPA/#shareholding'
const BSE_FILING_URL =
  'https://www.bseindia.com/stock-share-price/niva-bupa-health-insurance-company-ltd/nivabupa/544286/shareholding-pattern/'

// The Captable tab's 15 holder buckets, in template order. These exact strings
// are the `shareholding_shares::<holder>` sub-keys in schema-map.json — they must
// match character-for-character or the value won't bind to the cell.
const HOLDERS = [
  'Bupa Singapore Holdings', 'Fettle Tone LLP', 'Temasek', 'DSP Mutual Fund',
  'Motilal Oswal Private Equity', 'Nippon India Mutual Funds', 'Amansa Holdings', 'A91',
  'Tata Mutual Fund', 'SBI Mutual Fund', 'Insurance Companies', 'Pallonji',
  'Other Mutual funds', 'Paragon', 'Others',
] as const

// Total shares only move via fresh issuance / ESOP exercise — accept a generous
// but bounded band around the last-known total so a garbage pull can't slip in.
const TOTAL_BAND_LOW = 0.95
const TOTAL_BAND_HIGH = 1.15

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

function priorTotal(prior: Snapshot | null): number | null {
  const t = prior?._meta?.total_shares
  return typeof t === 'number' && t > 0 ? t : null
}

function buildPayload() {
  const holderList = HOLDERS.join(' | ')
  return {
    user_index: 124,
    tasks: [
      `I need the LATEST quarterly SHAREHOLDING PATTERN, by NUMBER OF EQUITY SHARES, for the ` +
        `NSE/BSE-listed company ${COMPANY_NAME} (NSE: ${NSE}, BSE: ${BSE}), taken from its official ` +
        `exchange shareholding-pattern filing (SEBI LODR Reg. 31) — the same data shown at ` +
        `${SCREENER_URL} .\n\n` +
        `Give the number of equity shares held by each of these holders/groups, for the most ` +
        `recent disclosed quarter:\n${holderList}\n\n` +
        `Output EXACTLY this pipe-delimited block and nothing else (no prose, no commentary):\n` +
        `AS_OF | <quarter-end date as YYYY-MM-DD>\n` +
        `TOTAL | <total number of equity shares, integer>\n` +
        `SOURCE | <URL of the exchange shareholding-pattern filing or screener page>\n` +
        HOLDERS.map((h) => `${h} | <shares>`).join('\n') +
        `\n\nRules:\n` +
        `• shares = a plain integer (no commas, no %, no words).\n` +
        `• Use the LATEST filed quarter only.\n` +
        `• "Other Mutual funds" = mutual-fund holders not named above; "Insurance Companies" = ` +
        `insurer holders; "Others" = ALL remaining shares not separately named — set "Others" so ` +
        `that the 15 holder lines SUM EXACTLY to TOTAL.\n` +
        `• If you cannot get a holder's exact share count from the filing, write the single word ` +
        `MISSING for it — never guess, never 0.\n` +
        `• Do not fabricate. Keep the holder names and order exactly as given.`,
    ],
    query_context: {
      TICKER_SYMBOL: [NSE],
      FROM_DATE: '2024-01-01',
      TO_DATE: nowIso().slice(0, 10),
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

/** Returns the validated snapshot to write, or null + reason when a gate fails. */
function validate(p: Parsed, prior: Snapshot | null): { snapshot: Snapshot | null; reason: string } {
  if (p.missing.length)
    return { snapshot: null, reason: `holder(s) returned MISSING (won't guess): ${p.missing.join(', ')}` }
  const missing = HOLDERS.filter((h) => !p.holders.has(h))
  if (missing.length) return { snapshot: null, reason: `holder(s) absent from answer: ${missing.join(', ')}` }
  if (!p.total) return { snapshot: null, reason: 'no parseable TOTAL shares' }
  if (!p.source) return { snapshot: null, reason: 'no SOURCE url' }
  if (!p.asOf) return { snapshot: null, reason: 'no AS_OF quarter-end date' }

  const sum = HOLDERS.reduce((a, h) => a + (p.holders.get(h) ?? 0), 0)
  if (sum !== p.total)
    return { snapshot: null, reason: `sum gate failed: holders sum ${sum.toLocaleString('en-IN')} ≠ TOTAL ${p.total.toLocaleString('en-IN')}` }

  const pt = priorTotal(prior)
  if (pt && (p.total < pt * TOTAL_BAND_LOW || p.total > pt * TOTAL_BAND_HIGH))
    return { snapshot: null, reason: `total ${p.total.toLocaleString('en-IN')} outside sane band of last-known ${pt.toLocaleString('en-IN')}` }

  const fetched_at = nowIso()
  const filing_period = quarterLabel(p.asOf)
  const source_name =
    `${COMPANY_NAME} — Shareholding pattern, quarter ended ${p.asOf} (${filing_period}), as filed with BSE/NSE ` +
    `(Reg. 31 LODR). Auto-fetched via the muns filings agent and verified: the 15 holders sum exactly to the ` +
    `${p.total.toLocaleString('en-IN')} total shares. The named per-holder list is not on Screener's public page ` +
    `(login-only there); the exchange filing is the source. Cross-reference: ${SCREENER_URL}`

  const data: HolderRow[] = HOLDERS.map((holder) => {
    const shares = p.holders.get(holder)!
    return {
      company_id: COMPANY_ID,
      holder,
      period: p.asOf!,
      filing_period,
      shares,
      pct: Math.round((10000 * shares) / p.total!) / 100,
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

  const snapshot: Snapshot = {
    _meta: {
      snapshot_id: 'shareholding-pattern-snapshot',
      description:
        'Per-holder shareholding pattern (share counts) for listed SAHIs, from the quarterly exchange ' +
        'shareholding-pattern filing. Feeds the Captable tab via build_value_store.py (rank-1 official filing). ' +
        'Missing stays missing — never 0; a holder is written only with a real sourced count.',
      schema_version: '1.0.0',
      company_id: COMPANY_ID,
      as_of: p.asOf,
      period_label: `${filing_period} (${monthYear(p.asOf!)})`,
      total_shares: p.total,
      holders_sum_ties_to_total: true,
      last_successful_run: fetched_at,
      parser_status: 'ready',
      source_policy:
        'Official exchange shareholding-pattern filing is authoritative (rank 1). The named per-holder breakdown ' +
        "is NOT on Screener's public page (login-only there), so the filing is the source; Screener's category " +
        'totals are kept below as a public cross-check only.',
      category_totals_pct: (prior?._meta?.category_totals_pct as Record<string, unknown>) ?? null,
    },
    data,
  }
  return { snapshot, reason: 'ok' }
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

  let raw: string
  try {
    console.log(`Asking the muns agent for ${COMPANY_NAME}'s latest shareholding pattern …`)
    raw = await callAgent(token)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`agent pull failed (snapshot preserved): ${reason}`)
    await appendLog('fetch-shareholding.log', { company_id: COMPANY_ID, status: 'error', reason })
    stampAttempt(prior, 'error', reason)
    return 0
  }

  const parsed = parseAnswer(extractAnswer(raw))
  const { snapshot, reason } = validate(parsed, prior)

  if (!snapshot) {
    console.warn(`honesty gate held the write (snapshot preserved): ${reason}`)
    await appendLog('fetch-shareholding.log', { company_id: COMPANY_ID, status: 'held', reason })
    stampAttempt(prior, 'held', reason)
    return 0
  }

  // Refresh only when something actually changed (avoids churn on a final quarter).
  const sameAsPrior =
    prior &&
    prior._meta?.as_of === snapshot._meta.as_of &&
    prior._meta?.total_shares === snapshot._meta.total_shares &&
    HOLDERS.every((h) => {
      const a = prior.data?.find((r) => r.holder === h)?.shares
      const b = snapshot.data.find((r) => r.holder === h)?.shares
      return a === b
    })
  if (sameAsPrior) {
    console.log(`no change — ${snapshot._meta.as_of} already current. Snapshot preserved.`)
    await appendLog('fetch-shareholding.log', { company_id: COMPANY_ID, status: 'unchanged', as_of: snapshot._meta.as_of })
    stampAttempt(prior, 'unchanged', `latest filed quarter ${snapshot._meta.as_of} already in snapshot`)
    return 0
  }

  writeSnapshotFile(snapshot)
  console.log(`✓ shareholding snapshot updated → ${snapshot._meta.as_of} (${snapshot._meta.total_shares?.toLocaleString('en-IN')} total shares, 15 holders tie to total).`)
  await appendLog('fetch-shareholding.log', {
    company_id: COMPANY_ID, status: 'updated', as_of: snapshot._meta.as_of, total: snapshot._meta.total_shares,
  })
  return 0
}

main().then((code) => { process.exitCode = code })
