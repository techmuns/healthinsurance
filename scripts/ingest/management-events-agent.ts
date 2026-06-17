// ---------------------------------------------------------------------------
//  Management / governance events via the muns chat agent → management-events.
//
//  Populates the SAHI Analysis → "Board & leadership changes" feed: appointments,
//  re-appointments, resignations, board-of-directors changes and KMP changes
//  (MD & CEO / CFO / CRO / Company Secretary / Appointed Actuary) for the five
//  standalone health insurers. Web-sourced via the agent (the same route the
//  bulk-deals / sector-news / market-intelligence feeds already use, because
//  direct exchange access is WAF-blocked from CI), every item carrying a source.
//
//  Real, sourced items only — a row is kept ONLY if it has a backing source_url
//  (unattributed items are dropped, never guessed). Medium confidence, clearly
//  labelled. 0 parseable items → the snapshot is left untouched (honest 'pending',
//  never fabricated). Token from MUNS_API_TOKEN, endpoint MUNS_AGENT_URL.
// ---------------------------------------------------------------------------

import { writeSnapshot, nowIso, appendLog } from './util'

const API_URL = process.env.MUNS_AGENT_URL || 'https://devde.muns.io/chat/chat-muns'
const API_TIMEOUT_MS = 600_000

function buildPayload() {
  return {
    user_index: 124,
    tasks: [
      "I'm an investor tracking the Indian STANDALONE HEALTH INSURERS — Niva Bupa (NSE: NIVABUPA), Star Health (NSE: STARHEALTH), Care Health, Aditya Birla Health Insurance and ManipalCigna Health Insurance. Give me the recent and upcoming MANAGEMENT / GOVERNANCE changes at these companies that an investor should know.\n\n" +
        'Include, where available:\n' +
        '- Appointments, re-appointments, resignations and cessations of Directors, Chairman/Chairperson, MD & CEO, and Key Managerial Personnel (CEO, CFO, CRO, CIO, COO, Company Secretary, Appointed Actuary).\n' +
        '- Board-of-directors changes (new / departing directors, independent-director changes).\n\n' +
        'Return a table with exactly these columns, in this order, pipe-delimited:\n\n' +
        'company | date | event_type | person | designation | summary | source_url\n\n' +
        'Rules:\n' +
        'company = exactly one of: Niva Bupa, Star Health, Care Health, Aditya Birla, ManipalCigna.\n' +
        'date = the effective / announcement date as YYYY-MM-DD (best estimate if a window; leave blank if truly unknown).\n' +
        'event_type = one of: appointment, reappointment, resignation, termination, kmp_change, board_change.\n' +
        "person = the individual's full name (blank if the change is not person-specific).\n" +
        'designation = their role, e.g. MD & CEO, Chief Financial Officer, Independent Director, Chairman, Company Secretary, Appointed Actuary.\n' +
        'summary = one short sentence describing the change.\n' +
        'source_url = the link backing the item (exchange filing / company investor-relations page / credible news).\n\n' +
        'Give the most relevant, current items (roughly the last 18 months, plus anything upcoming), most material first. Use REAL, sourced items only — do NOT invent appointments, people or dates. Leave a cell blank rather than guess, and DROP any item you cannot attribute to a real source_url.\n\n' +
        'Example (format only):\n' +
        'company | date | event_type | person | designation | summary | source_url\n' +
        'Niva Bupa | 2025-08-12 | appointment | A. Sharma | Chief Financial Officer | Board approved the appointment of A. Sharma as CFO with effect from 12 Aug 2025. | https://…',
    ],
    query_context: {
      TICKER_SYMBOL: ['NIVABUPA', 'STARHEALTH'],
      FROM_DATE: '2024-06-01',
      TO_DATE: '2026-12-31',
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

const EVENT_TYPES = new Set(['appointment', 'reappointment', 'resignation', 'termination', 'kmp_change', 'board_change', 'authorization', 'esop'])

/** Map a free-text company label to a SAHI company_id, or null for non-SAHI. */
function companyId(s: string): string | null {
  const t = s.toLowerCase()
  if (t.includes('niva')) return 'niva-bupa'
  if (t.includes('star')) return 'star-health'
  if (t.includes('care') || t.includes('religare')) return 'care-health'
  if (t.includes('aditya')) return 'aditya-birla'
  if (t.includes('manipal')) return 'manipalcigna'
  return null
}

function clean(s: string | undefined): string {
  return (s ?? '').replace(/^["'\s]+|["'\s]+$/g, '').trim()
}

interface MgmtEventRow {
  company_id: string
  event_date: string | null
  event_type: string
  person_name: string | null
  designation: string | null
  event_summary: string
  source_name: string | null
  source_url: string
  confidence: 'medium'
  fetched_at: string
}

function parseRows(answer: string, fetched_at: string): MgmtEventRow[] {
  const out: MgmtEventRow[] = []
  const seen = new Set<string>()
  for (const line of answer.split('\n')) {
    if (!line.includes('|')) continue
    const c = line.split('|').map(clean)
    if (c.length < 7) continue
    if (/^company$/i.test(c[0]) || /^-+$/.test(c[1] ?? '')) continue // header / divider
    const id = companyId(c[0])
    if (!id) continue // keep only the five SAHIs
    // Attribution is mandatory — drop anything without a real source link.
    const source_url = (c[6] || '').match(/https?:\/\/\S+/)?.[0] ?? null
    if (!source_url) continue
    const summary = clean(c[5])
    const person = clean(c[3])
    if (!summary && !person) continue
    const event_type = EVENT_TYPES.has((c[2] || '').toLowerCase()) ? c[2].toLowerCase() : 'board_change'
    const dateRaw = clean(c[1])
    const event_date = /\d{4}-\d{2}-\d{2}/.test(dateRaw) ? dateRaw.match(/\d{4}-\d{2}-\d{2}/)![0] : null
    const dedupe = `${id}|${event_date ?? ''}|${event_type}|${person}|${summary.slice(0, 50)}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    out.push({
      company_id: id,
      event_date,
      event_type,
      person_name: person || null,
      designation: clean(c[4]) || null,
      event_summary: summary || `${event_type.replace('_', ' ')}${person ? ` — ${person}` : ''}`,
      source_name: source_url ? new URL(source_url).hostname.replace(/^www\./, '') : null,
      source_url,
      confidence: 'medium',
      fetched_at,
    })
  }
  return out
}

async function main(): Promise<number> {
  const token = (process.env.MUNS_API_TOKEN || '').trim()
  if (!token) { console.error('ERROR: MUNS_API_TOKEN is not set.'); return 1 }
  const fetched_at = nowIso()
  const today = fetched_at.slice(0, 10)

  console.log('Calling chat-muns agent for SAHI management / governance events ...')
  let raw: string
  try { raw = await callAgent(token) } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`); return 1
  }
  const rows = parseRows(extractAnswer(raw), fetched_at)
  console.log(`Parsed ${rows.length} management event(s).`)
  for (const r of rows) console.log(`  + ${r.event_date ?? '—'} ${r.company_id} · ${r.event_type} · ${r.person_name ?? '—'} (${r.designation ?? '—'})`)
  await appendLog('management-events-agent.log', { count: rows.length })

  if (rows.length === 0) {
    console.error('No parseable, attributed events — leaving management-events.json untouched (honest pending). Raw answer:\n' + extractAnswer(raw).slice(0, 1200))
    return 0
  }

  // Newest first (undated last) so the feed reads as a timeline.
  rows.sort((a, b) => String(b.event_date ?? '').localeCompare(String(a.event_date ?? '')))

  await writeSnapshot('management-events.json', {
    _meta: {
      snapshot_id: 'management-events',
      description: 'Management / governance events (appointments, resignations, board & KMP changes) for the SAHI health insurers — web-sourced via the muns agent, each item source-linked. Medium confidence; verify against the underlying filing.',
      schema_version: '1.1.0',
      dataset: 'ai_generated',
      last_updated: today,
      last_successful_run: fetched_at,
      upstream_sources: ['muns_agent_web'],
      parser_status: 'ready',
      generated_by: 'AI (muns agent, web search)',
      notes: 'Real, sourced board / leadership changes the agent found across exchange filings, IR pages and credible news. Unattributed items are dropped. Verify before acting.',
    },
    data: rows,
  })
  console.log(`management-events.json: wrote ${rows.length} event(s) for ${new Set(rows.map((r) => r.company_id)).size} insurer(s).`)
  return 0
}

main().then((code) => { process.exitCode = code })
