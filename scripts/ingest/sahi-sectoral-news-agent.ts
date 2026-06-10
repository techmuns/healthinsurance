// ---------------------------------------------------------------------------
//  Key Sectoral News — auto-refresh agent (muns chat agent, web search).
//
//  Keeps the "Key Sectoral News" tab current with NO manual work. On each run:
//    1. Re-establishes the permanent seed floor (the 31 portfolio-pack items) so
//       history can never be lost, preserving any items accrued on earlier runs.
//    2. Asks the muns agent for the LATEST Indian health-insurance sector updates,
//       bucketed into the five dashboard themes (GST / General / Competition /
//       Regulatory / Profitability), each with a source link.
//    3. Merges genuinely-new items in (de-duped by subject+date hash), assigning
//       the next tracking number, and writes sectoral-news-snapshot.json.
//
//  The UI merges seed + snapshot by id, so a re-reported seed item collapses
//  rather than double-listing. AI-gathered items are tagged origin:'agent' and
//  clearly labelled in the UI — web-sourced, not audited. Token: MUNS_API_TOKEN.
// ---------------------------------------------------------------------------

import { writeSnapshot, readSnapshot, nowIso, appendLog } from './util'
import {
  sectoralNews,
  makeSectoralId,
  SECTORAL_CATEGORY_ORDER,
  type SectoralCategory,
  type SectoralNewsItem,
  type SectoralNewsSnapshot,
} from '../../src/data/sectoralNews'

const SNAPSHOT_FILE = 'sectoral-news-snapshot.json'
const API_URL = 'https://devde.muns.io/chat/chat-muns'
const API_TIMEOUT_MS = 600_000

const CATEGORY_SET = new Set<string>(SECTORAL_CATEGORY_ORDER.map((c) => c.toLowerCase()))

function buildPayload() {
  const today = new Date()
  const iso = (offsetDays: number) => {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() + offsetDays)
    return d.toISOString().slice(0, 10)
  }
  const themes = SECTORAL_CATEGORY_ORDER.join(' | ')
  return {
    user_index: 124,
    tasks: [
      "I track the Indian HEALTH-INSURANCE sector (the standalone health insurers Niva Bupa, Star Health, Care Health, Aditya Birla Health, ManipalCigna; plus the wider general-insurance and regulatory backdrop). Give me the LATEST sector updates — news from roughly the last 90 days that an investor in these names should know.\n\n" +
        'Bucket each update into exactly ONE of these five themes:\n' +
        `  ${themes}\n` +
        'Theme meaning:\n' +
        '  - GST = tax on insurance premiums (rates, exemptions, GST Council).\n' +
        '  - General = market trends shaping demand/claims (penetration, health trends, big-picture).\n' +
        '  - Competition / Peers = new entrants, JVs, M&A, products, leadership moves among insurers/hospitals.\n' +
        '  - Regulatory = IRDAI / government rule changes (FDI, licences, accounting, claims/pricing rules).\n' +
        '  - Profitability = costs and margins (medical inflation, hospital pricing, loss/combined ratios).\n\n' +
        'Return a table with EXACTLY these columns, in this order, pipe-delimited, NO leading or trailing pipe:\n\n' +
        'category | date | subject | summary | reference\n\n' +
        'Rules:\n' +
        'category = one of the five themes above, spelled exactly.\n' +
        'date = the news date as YYYY-MM-DD (best estimate of the month if only a month is known).\n' +
        'subject = one short headline.\n' +
        'summary = 1–3 plain sentences on what happened and why it matters.\n' +
        'reference = the URL of the original article backing the item.\n\n' +
        'Give 8–15 of the most relevant, most recent items, newest first. Use real, sourced items only — do NOT invent news. If you are unsure of a field, leave it blank rather than guess. Skip anything older than ~4 months.\n\n' +
        'Example (format only):\n' +
        'category | date | subject | summary | reference\n' +
        'Regulatory | 2026-05-12 | IRDAI tweaks health policy wording norms | New standardised wordings aim to cut claim disputes; insurers must refile products, a near-term compliance cost. | https://…',
    ],
    query_context: {
      TICKER_SYMBOL: ['NIVABUPA', 'STARHEALTH'],
      FROM_DATE: iso(-150),
      TO_DATE: iso(15),
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

function extractAnswer(text: string): string {
  const m = text.match(/<ans>([\s\S]*?)<\/ans>/)
  return m ? m[1] : text
}

function clean(s: string | undefined): string {
  return (s ?? '').replace(/^["'\s]+|["'\s]+$/g, '').trim()
}

/** Map a free-text theme to one of the five canonical categories. */
export function normCategory(raw: string): SectoralCategory {
  const t = raw.toLowerCase().trim()
  if (CATEGORY_SET.has(t)) return SECTORAL_CATEGORY_ORDER.find((c) => c.toLowerCase() === t)!
  if (t.includes('gst') || t.includes('tax')) return 'GST'
  if (t.includes('profit') || t.includes('margin') || t.includes('loss ratio') || t.includes('combined ratio')) return 'Profitability'
  if (t.includes('regulat') || t.includes('irdai') || t.includes('fdi') || t.includes('govern') || t.includes('rule') || t.includes('policy')) return 'Regulatory'
  if (t.includes('compet') || t.includes('peer') || t.includes('m&a') || t.includes('launch') || t.includes('appoint') || t.includes('entrant')) return 'Competition / Peers'
  return 'General'
}

/** Accept YYYY-MM-DD; promote a bare YYYY-MM to the first of the month. */
export function parseDate(raw: string): string | null {
  const full = raw.match(/\d{4}-\d{2}-\d{2}/)
  if (full) return full[0]
  const ym = raw.match(/(\d{4})-(\d{2})\b/)
  if (ym) return `${ym[1]}-${ym[2]}-01`
  return null
}

interface ParsedItem {
  category: SectoralCategory
  date: string
  subject: string
  summary: string
  reference: string
}

export function parseItems(answer: string): ParsedItem[] {
  const out: ParsedItem[] = []
  for (const line of answer.split('\n')) {
    if (!line.includes('|')) continue
    const cells = line.split('|').map(clean)
    while (cells.length && cells[0] === '') cells.shift()
    while (cells.length && cells[cells.length - 1] === '') cells.pop()
    if (cells.length < 4) continue
    if (/^category$/i.test(cells[0]) || /^-+$/.test(cells[1] ?? '')) continue // header / divider
    const subject = clean(cells[2])
    if (!subject || subject.length < 6) continue
    const date = parseDate(clean(cells[1]))
    if (!date) continue // a timeline item without a date is not useful — skip honestly
    const reference = (clean(cells[4]).match(/https?:\/\/\S+/)?.[0]) ?? ''
    out.push({
      category: normCategory(clean(cells[0])),
      date,
      subject,
      summary: clean(cells[3]),
      reference,
    })
  }
  return out
}

/** Seed floor + anything accrued on earlier runs, keyed by stable id. */
async function loadBase(): Promise<Map<string, SectoralNewsItem>> {
  const map = new Map<string, SectoralNewsItem>()
  // 1) Permanent seed floor.
  for (const s of sectoralNews) {
    const id = makeSectoralId(s.subject, s.date)
    map.set(id, { ...s, id, origin: 'seed', added_at: s.added_at ?? s.date })
  }
  // 2) Overlay the existing snapshot (preserves prior agent items + their sn).
  try {
    const snap = await readSnapshot<SectoralNewsSnapshot>(SNAPSHOT_FILE)
    for (const it of snap.data ?? []) {
      const id = it.id ?? makeSectoralId(it.subject, it.date)
      map.set(id, { ...it, id })
    }
  } catch {
    /* first run — no snapshot yet */
  }
  return map
}

export async function main(): Promise<number> {
  const fetched_at = nowIso()
  const today = fetched_at.slice(0, 10)
  const token = (process.env.MUNS_API_TOKEN || '').trim()

  const map = await loadBase()
  // Preserve the last genuinely-successful refresh time across a failed / no-token run.
  let prevSuccessRun: string | null = null
  try {
    prevSuccessRun = (await readSnapshot<SectoralNewsSnapshot>(SNAPSHOT_FILE))._meta?.last_successful_run ?? null
  } catch {
    /* no snapshot yet */
  }
  const seenSubjects = new Set<string>([...map.values()].map((i) => i.subject.toLowerCase().replace(/\s+/g, ' ').trim()))
  let maxSn = Math.max(0, ...[...map.values()].map((i) => i.sn))
  let added = 0
  let pullSucceeded = false

  if (!token) {
    console.warn('MUNS_API_TOKEN not set — writing the seed snapshot only (no fresh pull this run).')
  } else {
    console.log('Calling chat-muns agent for the latest sectoral updates ...')
    try {
      const raw = await callAgent(token)
      pullSucceeded = true
      const items = parseItems(extractAnswer(raw))
      console.log(`Parsed ${items.length} candidate update(s) from the agent.`)
      for (const it of items) {
        const id = makeSectoralId(it.subject, it.date)
        const subjKey = it.subject.toLowerCase().replace(/\s+/g, ' ').trim()
        if (map.has(id) || seenSubjects.has(subjKey)) continue // already in the feed
        maxSn += 1
        map.set(id, { sn: maxSn, ...it, id, origin: 'agent', added_at: today })
        seenSubjects.add(subjKey)
        added += 1
        console.log(`  + [${it.category}] ${it.date} ${it.subject}`)
      }
    } catch (err) {
      // A failed pull must never wipe the feed — we still write the preserved base.
      console.error(`agent pull failed (feed preserved): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const data = [...map.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.sn - a.sn))
  const seed_count = data.filter((d) => d.origin === 'seed').length
  const agent_count = data.filter((d) => d.origin === 'agent').length
  // Content-change date = newest added_at (NOT "today"), so a no-op run stays a no-op.
  const last_updated = data.reduce((m, d) => (d.added_at && d.added_at > m ? d.added_at : m), '') || today

  await writeSnapshot(SNAPSHOT_FILE, {
    _meta: {
      snapshot_id: 'sectoral-news-snapshot',
      description:
        'Key Sectoral News feed — a permanent seed of 31 curated portfolio-pack updates, kept current by a scheduled muns web-search agent. Each item links its source. Seed items are curated; agent items are AI-gathered (web), clearly labelled and not audited.',
      schema_version: '1.0.0',
      last_updated,
      last_successful_run: pullSucceeded ? fetched_at : prevSuccessRun,
      seed_count,
      agent_count,
      generated_by: 'Seed: investor portfolio pack. Updates: AI (muns agent, web search).',
      notes: 'Seed floor can never be lost. Agent items are de-duped by subject+date and verified-before-acting.',
    } satisfies SectoralNewsSnapshot['_meta'],
    data,
  })

  await appendLog('sahi-sectoral-news-agent.log', { added, total: data.length, seed_count, agent_count, had_token: !!token })
  console.log(`sectoral-news-snapshot: ${data.length} item(s) total (${seed_count} seed + ${agent_count} agent); ${added} new this run.`)
  return 0
}

// Run only when invoked directly (workflow / npm script) — not when a test
// imports the helpers above.
import { pathToFileURL } from 'node:url'
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => {
    process.exitCode = code
  })
}
