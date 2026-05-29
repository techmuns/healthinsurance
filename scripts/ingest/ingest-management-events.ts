// ---------------------------------------------------------------------------
//  Fetcher — Management / governance events.
//
//  Extracts appointment / resignation / board-change / KMP-change events from:
//    • Listed insurers: NSE / BSE corporate-announcement pages (the SEBI Reg-30
//      disclosures that name the director / KMP and the effective date).
//    • All insurers: the company IR / press-release landing page.
//
//  OFFLINE-FIRST, mirroring ingest-company-disclosures:
//    • Live (INGEST_OFFLINE=0): fetch the announcement / IR HTML, save it to
//      data/raw/announcements/<id>/, then scan the text for events.
//    • Offline: read the most-recent pre-staged HTML/JSON/text from
//      data/raw/announcements/<id>/. With nothing staged the fetcher returns
//      an empty-but-valid 'pending' result and never throws.
//
//  ManagementEventRow carries its own flat source_url / source_file /
//  fetched_at / confidence fields (per _schemas.ts); we populate those in
//  `values` and also attach a pipeline `provenance` block. Events we cannot
//  date are dropped rather than dated with a guess.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult, SnapshotRecord } from './types'
import type { ManagementEventType } from '../../src/data/snapshots/_schemas'
import { appendLog, nowIso, readSnapshot } from './util'
import { fetchOrLoadRaw } from './parsers'
import { extname } from 'node:path'
import * as cheerio from 'cheerio'

const SOURCE_ID = 'management_events_feed'
const PARSER_NAME = 'ingest-management-events'

interface CompanyMaster {
  data: Array<{
    company_id: string
    listed_status: 'listed' | 'unlisted'
    ticker: string | null
    exchange: 'NSE' | 'BSE' | null
    investor_relations_url: string | null
  }>
}

/** Best-effort live source URL: exchange announcements for listed names,
 *  else the IR landing page. */
function eventSourceUrl(c: CompanyMaster['data'][number]): string | null {
  if (c.listed_status === 'listed' && c.ticker) {
    if (c.exchange === 'BSE') {
      return `https://www.bseindia.com/corporates/ann.html?scrip=${encodeURIComponent(c.ticker)}`
    }
    return `https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=${encodeURIComponent(c.ticker)}`
  }
  return c.investor_relations_url
}

export const ingestManagementEvents: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Management events feed',
  frequency: 'event_based',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const master = await readSnapshot<CompanyMaster>('company-master.json')

    const records: SnapshotRecord[] = []
    const warnings: string[] = []

    for (const c of master.data) {
      const url = eventSourceUrl(c)
      if (!url) {
        warnings.push(`${c.company_id}: no IR / announcement URL in company-master.`)
        continue
      }
      const filename = `${c.company_id}-ann-${new Date().toISOString().slice(0, 10)}.html`
      try {
        const { buffer, raw_file, mode } = await fetchOrLoadRaw(
          url,
          `announcements/${c.company_id}`,
          filename,
          /\.(html?|json|txt|csv|dat)$/i,
        )

        const events = extractEvents(buffer, raw_file)
        if (events.length === 0) {
          warnings.push(`${c.company_id}: ${raw_file.split('/').pop()} parsed but no datable management events found.`)
          continue
        }

        for (const ev of events) {
          records.push({
            target: 'management-events',
            keys: {
              company_id: c.company_id,
              event_date: ev.event_date,
              // Slug keeps multiple same-day events distinct in the merge.
              event_key: slug(`${ev.event_type}-${ev.person_name ?? ev.event_summary}`),
            },
            values: {
              event_type: ev.event_type,
              person_name: ev.person_name,
              designation: ev.designation,
              event_summary: ev.event_summary,
              source_url: url,
              source_file: raw_file,
              fetched_at,
              confidence: 'medium',
            },
            provenance: {
              source_name: `${c.company_id} ${c.listed_status === 'listed' ? 'exchange announcement' : 'IR press release'}`,
              source_url: url,
              source_file: raw_file,
              source_period: ev.event_date,
              fetched_at,
              parsed_at: nowIso(),
              parser_name: PARSER_NAME,
              confidence: 'medium',
            },
          })
        }
        await appendLog('ingest-management-events.log', {
          source: SOURCE_ID,
          company_id: c.company_id,
          status: 'parsed',
          mode,
          events: events.length,
        })
      } catch (err) {
        const error = errMsg(err)
        warnings.push(`${c.company_id}: ${error}`)
        await appendLog('ingest-management-events.log', {
          source: SOURCE_ID,
          company_id: c.company_id,
          status: 'error',
          error,
        })
      }
    }

    return {
      source_id: SOURCE_ID,
      status: records.length > 0 ? 'success' : 'pending',
      raw_file: null,
      records,
      records_fetched: records.length,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

// ─── Event extraction ────────────────────────────────────────────────────────

interface ParsedEvent {
  event_date: string
  event_type: ManagementEventType
  person_name: string | null
  designation: string | null
  event_summary: string
}

/** Decode a staged announcement artefact to text. HTML is stripped to its
 *  visible text via cheerio; JSON is kept raw (NSE returns JSON arrays). */
export function extractEvents(buffer: Buffer, rawFile: string): ParsedEvent[] {
  const ext = extname(rawFile).toLowerCase()
  const raw = buffer.toString('utf8')
  let text: string
  if (ext === '.json') {
    text = jsonToLines(raw)
  } else if (ext === '.html' || ext === '.htm') {
    const $ = cheerio.load(raw)
    $('script, style, noscript').remove()
    // Keep some structure: each block-ish element on its own line.
    text = $('body').length ? $('body').text() : $.root().text()
  } else {
    text = raw
  }
  return extractEventsFromText(text)
}

function jsonToLines(raw: string): string {
  try {
    const data = JSON.parse(raw)
    const rows = Array.isArray(data) ? data : Array.isArray((data as any)?.data) ? (data as any).data : [data]
    return rows
      .map((r: unknown) =>
        typeof r === 'string' ? r : Object.values(r as Record<string, unknown>).map((v) => String(v ?? '')).join(' | '),
      )
      .join('\n')
  } catch {
    return raw
  }
}

// Keyword → event_type. Order matters: more specific first.
const EVENT_RULES: Array<{ type: ManagementEventType; re: RegExp }> = [
  { type: 'reappointment', re: /\bre-?appoint(?:ed|ment)?\b/i },
  { type: 'appointment', re: /\bappoint(?:ed|ment|s)?\b|\binduct(?:ed|ion)\b|\belevat(?:ed|ion)\b/i },
  { type: 'resignation', re: /\bresign(?:ed|ation|s)?\b|\bstep(?:ped|ping)?\s+down\b|\bdemit(?:ted|s)?\s+office\b/i },
  { type: 'termination', re: /\bterminat(?:ed|ion)\b|\bremov(?:ed|al)\b|\bcease[ds]?\s+to\b|\bvacat(?:ed|ion)\b/i },
  { type: 'kmp_change', re: /\bKey\s+Managerial\s+Personnel\b|\bKMP\b|\bcompany\s+secretary\b|\bchief\s+(?:financial|executive|risk|investment|operating)\s+officer\b|\bCFO\b|\bCEO\b|\bCRO\b|\bMD\s*&?\s*CEO\b/i },
  { type: 'board_change', re: /\bboard\s+of\s+directors?\b|\bdirector\b|\bchairman\b|\bchairperson\b|\bnon-?executive\b|\bindependent\s+director\b/i },
  { type: 'authorization', re: /\bauthoris(?:ed|ation)\b|\bauthoriz(?:ed|ation)\b/i },
  { type: 'esop', re: /\bESOP\b|\bemployee\s+stock\b|\bstock\s+option\b/i },
]

const DESIGNATION_RE =
  /\b(Managing Director(?:\s*&?\s*CEO)?|MD\s*&?\s*CEO|Chief Executive Officer|Chief Financial Officer|Chief Risk Officer|Chief Investment Officer|Chief Operating Officer|Company Secretary|Whole[\s-]?time Director|Independent Director|Non[\s-]?Executive Director|Executive Director|Chairman|Chairperson|Director|Appointed Actuary)\b/i

const DATE_PATTERNS: RegExp[] = [
  /(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})/i,
  /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i,
  /(\d{4})-(\d{2})-(\d{2})/,
  /(\d{1,2})[/.](\d{1,2})[/.](\d{4})/,
]

/**
 * Scan free text line-by-line for management events. A line becomes an event
 * only if it (a) matches an event keyword AND (b) carries a parseable date.
 * Person name + designation are best-effort. Undatable matches are dropped.
 */
export function extractEventsFromText(text: string): ParsedEvent[] {
  const out: ParsedEvent[] = []
  const seen = new Set<string>()
  // Split on newlines / semicolons / bullets only. We deliberately do NOT
  // split on "." because Indian filings are dense with honorific and acronym
  // periods (Mr., Ltd., MD & CEO.) — splitting there shears names apart.
  const lines = text
    .split(/\r?\n|;|•|•/)
    .map((l) => normaliseSpace(l))
    .filter((l) => l.length >= 12 && l.length <= 800)

  for (const line of lines) {
    const rule = EVENT_RULES.find((r) => r.re.test(line))
    if (!rule) continue
    const event_date = parseDate(line)
    if (!event_date) continue

    const designation = line.match(DESIGNATION_RE)?.[0] ?? null
    const person_name = extractPersonName(line)
    const summary = line.length > 280 ? line.slice(0, 277).trimEnd() + '…' : line

    const dedupe = `${event_date}|${rule.type}|${person_name ?? ''}|${summary.slice(0, 60)}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)

    out.push({
      event_date,
      event_type: rule.type,
      person_name,
      designation: designation ? normaliseSpace(designation) : null,
      event_summary: summary,
    })
    if (out.length >= 50) break
  }
  return out
}

/** Heuristic name grab: a Title-Case run, often prefixed by Mr./Ms./Dr. */
function extractPersonName(line: string): string | null {
  const honor = line.match(/\b(?:Mr\.?|Ms\.?|Mrs\.?|Dr\.?|Shri|Smt\.?)\s+([A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+){0,3})/)
  if (honor) return normaliseSpace(honor[1])
  // "appointment of <Name> as", "resignation of <Name>"
  const ofName = line.match(
    /\b(?:appointment|resignation|re-?appointment|cessation)\s+of\s+([A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+){1,3})\b/i,
  )
  if (ofName) return normaliseSpace(ofName[1])
  return null
}

function parseDate(line: string): string | null {
  for (const re of DATE_PATTERNS) {
    const m = line.match(re)
    if (!m) continue
    let y: number, mo: number, d: number
    if (re.source.startsWith('(\\d{4})')) {
      y = +m[1]; mo = +m[2]; d = +m[3]
    } else if (/^\(\\d\{1,2\}\)\[\/\.\]/.test(re.source)) {
      d = +m[1]; mo = +m[2]; y = +m[3]
    } else if (re.source.startsWith('(\\d{1,2})')) {
      d = +m[1]; mo = monthNum(m[2]); y = +m[3]
    } else {
      mo = monthNum(m[1]); d = +m[2]; y = +m[3]
    }
    if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) continue
    if (y < 2000 || y > 2100) continue
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}

function monthNum(s: string): number {
  const map: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  }
  return map[s.toLowerCase().slice(0, 3)] ?? 0
}

function normaliseSpace(s: string): string {
  return s.replace(/\s{2,}/g, ' ').trim()
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
