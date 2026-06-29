// ---------------------------------------------------------------------------
//  Fetcher — GI Council SEGMENTWISE REPORT, FULL-FISCAL-YEAR (annual) cut.
//
//  Source listing (the page Neha uses):
//    https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report-on-homepage/
//  Each "Segment wise report <Month> <Year>" XLSX is CUMULATIVE "for the period
//  up to <Month>". Only the MARCH editions (and the later "final segment YY-YY"
//  re-issues) cover a complete fiscal year, so ONLY those may fill an FY column.
//  Partial-year editions (April, July, December…) are never promoted to an FY
//  value — that would silently present 9 months as 12.
//
//  Every full-FY workbook has 4 sheets; we read 3:
//    • "Health Portfolio"      — per-insurer Health-Retail / Health-Group /
//      Health-Government / Overseas Medical / Grand Total, grouped into
//      General Insurers and Stand-alone Health Insurers, with printed
//      sub-totals and an Industry Total. Each data row is followed by a
//      "Previous Year" row — the report restates the prior FY alongside.
//    • "Segmentwise Report"    — per-insurer Fire / Marine / Motor / Health /
//      … / Grand Total. We take the Industry Total (+ its Previous Year).
//    • "Miscellaneous portfolio" — Crop Insurance column (Industry Total).
//
//  CANONICAL-VALUE RULE (matches industry-segment-premium.json, 2026-06-10):
//  for any fiscal year, the newest GIC statement wins — FY25 is taken from the
//  March-2026 report's "Previous Year" rows (GIC's latest, restated statement
//  of FY25), not from the FY25 report itself. Both are parsed; the older one
//  simply loses to the newer on merge order. Within one report period a
//  "final" edition outranks the provisional March edition.
//
//  What it emits:
//    • target 'industry-segment-premium'  (existing snapshot, gap-fill only —
//      the merge pin-guard keeps every already-trusted value untouched):
//      health / motor / fire / crop / marine / other / total per FY.
//      other = total − health − motor (identity over the same printed row).
//    • target 'gic-health-portfolio'      (new snapshot): per FY —
//      per-insurer health premium (retail / group / govt / overseas / total)
//      for the insurers the workbook tracks, plus carrier-type aggregates:
//      SAHI + GENERAL + INDUSTRY as printed; PSUs (sum of the 4 public-sector
//      general insurers), Private (= GENERAL − PSUs) and Others-retail
//      (= INDUSTRY retail − the 11 named insurers) derived by exact arithmetic
//      over rows printed in the SAME table — each tagged with its derivation.
//      Anything that can't be derived from complete printed rows stays null
//      with a warning. Missing is never zero.
//
//  REACHABILITY: gicouncil.in 403s datacenter IPs. A live run works from a
//  residential/in-region network or with INGEST_FETCH_PROXY; otherwise the
//  fetcher uses (a) files dropped into data/raw/gicouncil/segment-annual/
//  (any filename containing "march <year>" or "final segment yy-yy"), and
//  (b) the checksum-manifested official files already committed under
//  data/agent-pulls/. No file, no number — months without a source stay
//  an honest pending.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult, SnapshotRecord } from './types'
import type { XlsxRow } from './parsers'
import { toNumber } from './parsers'
import { Worker } from 'node:worker_threads'
import { createRequire } from 'node:module'
import { gicFetch } from './gic-fetch'
import { validateHealthPortfolioSum } from './validate-insurance-data'
import { appendLog, ensureDir, fileExists, isOfflineMode, nowIso, writeRaw, RAW_ROOT, PROCESSED_ROOT, REPO_ROOT } from './util'
import * as cheerio from 'cheerio'
import { createHash } from 'node:crypto'
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

const SOURCE_ID = 'gicouncil_segmentwise_annual'
const LISTING_URLS = [
  'https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report-on-homepage/',
  'https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report/',
]
const RAW_SUBDIR = 'gicouncil/segment-annual' // full-FY drops (any recognisable name)
const RAW_SUBDIR_MONTHLY = 'gicouncil/segment' // shared with the monthly fetcher (<YYYY-MM>.xlsx)
const MAX_LISTING_PAGES = 4

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

// Official full-FY files already pulled (muns agent, sha256 in the adjacent
// manifest.json files). Used when no newer staged/live file covers the FY.
interface CommittedSource { period: string; kind: 'march' | 'final'; path: string; url: string }
const COMMITTED_SOURCES: CommittedSource[] = [
  {
    period: '2024-03', kind: 'march',
    path: 'data/agent-pulls/gicouncil-segment/sources/segment_march_2024-16.xlsx',
    url: 'https://www.gicouncil.in/media/4418/segment_march_2024-16.xlsx',
  },
  {
    period: '2025-03', kind: 'final',
    path: 'data/agent-pulls/gicouncil-segment/sources/final-segment-24-25.xlsx',
    url: 'https://www.gicouncil.in/media/4513/final-segment-24-25.xlsx',
  },
  {
    period: '2026-03', kind: 'march',
    path: 'data/agent-pulls/industry-segment-history/sources/segment_march_2026-170426.xlsx',
    url: 'https://www.gicouncil.in/media/4638/segment_march_2026-170426.xlsx',
  },
]

// Insurers the Industry Growth sheet tracks (template ids). Matched
// case-insensitively as substrings of the workbook's name cell, within the
// carrier group the row sits in. Historical SAHI names are kept so older
// reports (FY18-FY23 drops) fill the back years automatically.
const SAHI_ALIASES: Record<string, string[]> = {
  'star-health': ['star health'],
  'care-health': ['care health', 'religare health'],
  'niva-bupa': ['niva bupa', 'max bupa'],
  'aditya-birla': ['aditya birla'],
  manipalcigna: ['manipalcigna', 'manipal cigna', 'cigna ttk'],
  'galaxy-health': ['galaxy health'],
  'narayana-health': ['narayana health'],
  'reliance-health': ['reliance health'],
  'hdfc-ergo': ['hdfc ergo health', 'apollo munich'], // the SAHI-era entity
}
const GENERAL_ALIASES: Record<string, string[]> = {
  'hdfc-ergo': ['hdfc ergo'],
  'new-india': ['new india'],
  'national-insurance': ['national insurance'],
  'icici-lombard': ['icici lombard'],
  'oriental-insurance': ['oriental insurance'],
  'united-india': ['united india'],
  'sbi-general': ['sbi general'],
  // Renamed to IndusInd General in the March-2026 edition (Hinduja/IndusInd
  // acquisition) — same legal entity; the as-printed name is kept on the row.
  'reliance-general': ['reliance general', 'indusind general'],
  'bajaj-general': ['bajaj allianz', 'bajaj general'],
}
// The 4 public-sector general insurers — the "PSUs" carrier row.
const PSU_IDS = ['national-insurance', 'new-india', 'oriental-insurance', 'united-india']
// The named rows of the template's "Retail health premium by insurer" section;
// its "Others" row = Industry retail − exactly these.
const RETAIL_NAMED_IDS = [
  'star-health', 'care-health', 'niva-bupa', 'hdfc-ergo', 'new-india', 'national-insurance',
  'icici-lombard', 'aditya-birla', 'oriental-insurance', 'united-india', 'manipalcigna',
]

// ── small helpers ──────────────────────────────────────────────────────────

const norm = (v: unknown): string => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const clean = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim()
const r2 = (v: number): number => Math.round(v * 100) / 100
// The report prints ₹ Cr to 2dp; workbook cells carry float dust beyond that.
const num2 = (v: unknown): number | null => {
  const n = toNumber(v)
  return n == null ? null : r2(n)
}

function fyOfPeriod(period: string): string {
  // '2026-03' → FY26 (the report "up to March 2026" covers FY26 in full).
  return `FY${period.slice(2, 4)}`
}
function prevFy(fy: string): string {
  return `FY${String(Number(fy.slice(2)) - 1).padStart(2, '0')}`
}

interface HealthFields {
  health_retail: number | null
  health_group: number | null
  health_govt: number | null
  overseas_medical: number | null
  health_total: number | null
}
const emptyHealth = (): HealthFields => ({
  health_retail: null, health_group: null, health_govt: null, overseas_medical: null, health_total: null,
})

interface IndustrySegments {
  fire: number | null
  marine: number | null
  motor: number | null
  health: number | null
  crop: number | null
  pa: number | null // Personal Accident (Segmentwise "P.A." column)
  total: number | null
}

interface InsurerRow {
  company_id: string | null // null = present in the file but not template-tracked
  insurer_name: string
  carrier_group: 'general' | 'sahi'
  current: HealthFields
  previous: HealthFields
}

interface FileParse {
  insurers: InsurerRow[]
  aggregates: {
    GENERAL: { current: HealthFields; previous: HealthFields } | null
    SAHI: { current: HealthFields; previous: HealthFields } | null
    INDUSTRY: { current: HealthFields; previous: HealthFields } | null
  }
  segments: { current: IndustrySegments; previous: IndustrySegments }
  warnings: string[]
}

// ── source-file classification & resolution ────────────────────────────────

interface SourceFile {
  period: string // YYYY-03 — the "up to March <year>" period
  kind: 'march' | 'final'
  buffer: Buffer
  source_url: string
  raw_file: string // repo-relative path of the file actually parsed
}

/** Classify a filename / link text as a full-FY edition (march or final) or a
 *  partial-year month ('YYYY-MM', never used for FY columns) or null. */
export function classifySegmentFile(s: string): { period: string; kind: 'march' | 'final' } | { monthly: string } | null {
  const t = s.toLowerCase()
  const fin = t.match(/final[\s_-]*segment[\s_-]*(\d{2})[\s_-]*-?[\s_-]*(\d{2})/)
  if (fin) return { period: `20${fin[2]}-03`, kind: 'final' }
  for (let m = 0; m < 12; m++) {
    const re = new RegExp(`segment[\\s_-]*(?:wise[\\s_-]*report[\\s_-]*)?${MONTH_NAMES[m]}[\\s_-]*(\\d{4})`)
    const hit = t.match(re)
    if (hit) {
      const period = `${hit[1]}-${String(m + 1).padStart(2, '0')}`
      return m === 2 ? { period, kind: 'march' } : { monthly: period }
    }
  }
  return null
}

/** Discover segment-report links on the listing page(s), following simple
 *  numbered pagination. Fetches go through every gic-fetch route (direct →
 *  relays → Internet Archive); if the listing still can't be read, the muns
 *  chat agent (MUNS_API_TOKEN) is asked to enumerate the links server-side. */
async function discoverListing(warnings: string[]): Promise<Array<{ url: string; text: string }>> {
  const seen = new Set<string>()
  const out: Array<{ url: string; text: string }> = []
  for (const base of LISTING_URLS) {
    const queue = [base]
    const visited = new Set<string>()
    while (queue.length > 0 && visited.size < MAX_LISTING_PAGES) {
      const pageUrl = queue.shift()!
      if (visited.has(pageUrl)) continue
      visited.add(pageUrl)
      let $: cheerio.CheerioAPI
      try {
        const got = await gicFetch(pageUrl, 'listing')
        warnings.push(...got.warnings.map((w) => `listing (${got.via}): ${w}`))
        $ = cheerio.load(got.buffer.toString('utf8'))
      } catch (err) {
        warnings.push(`listing fetch failed on every route (${pageUrl}): ${err instanceof Error ? err.message : String(err)}`)
        break // same host — the next page would fail the same way
      }
      const fileLinks = new Set<string>()
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')?.trim()
        const text = clean($(el).text())
        if (!href) return
        const abs = href.startsWith('http') ? href : new URL(href, pageUrl).toString()
        if (/\.(xlsx|xls)(\?|$)/i.test(abs) && /segment/i.test(`${abs} ${text}`)) fileLinks.add(abs)
        if (fileLinks.has(abs) && !seen.has(abs)) {
          seen.add(abs)
          out.push({ url: abs, text })
        }
        // numbered pager / rel=next links on the same listing path
        const isPager = /^\d+$/.test(text) || /next|»/i.test(text) || $(el).attr('rel') === 'next'
        if (isPager && abs.startsWith(base.split('?')[0].replace(/\/$/, '')) && !visited.has(abs)) queue.push(abs)
      })
    }
    if (out.length > 0) break // first listing URL that works is enough
  }
  if (out.length === 0) {
    const agentLinks = await agentDiscoverLinks(warnings)
    out.push(...agentLinks.filter((l) => !seen.has(l.url)))
  }
  return out
}

/** Last-resort discovery: ask the muns chat agent (which fetches gicouncil.in
 *  server-side, from a non-blocked network) to enumerate the report links.
 *  No-ops without MUNS_API_TOKEN. The agent only supplies URLs — the files
 *  themselves are still downloaded and checksummed by this fetcher. */
async function agentDiscoverLinks(warnings: string[]): Promise<Array<{ url: string; text: string }>> {
  const token = (process.env.MUNS_API_TOKEN || '').trim()
  if (!token) return []
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 300_000)
    const res = await fetch(process.env.MUNS_AGENT_URL || 'https://devde.muns.io/chat/chat-muns', {
      method: 'POST',
      headers: { accept: '*/*', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_index: 124,
        tasks: [
          `Open ${LISTING_URLS[0]} (General Insurance Council — Segmentwise report list, including its older pages) and return EVERY report download link on it. One line per link, format exactly: <report title> | <absolute .xlsx/.xls URL>. Include all months and all years visible. Do not summarise, do not skip any, no other text.`,
        ],
        query_context: {
          TICKER_SYMBOL: [], FROM_DATE: '2015-04-01', TO_DATE: new Date().toISOString().slice(0, 10),
          ANNOUNCEMENT_FORM_TYPE: 'all', DOCUMENT_IDS: [], CATEGORIES: [], WEB_SEARCH_ENABLED: true,
          COUNTRY: [], CONTEXT_EMAIL: 'nadamsaluja@gmail.com', CONTEXT_COMPANY_NAME: [],
          GET_ANNOUNCEMENTS_ENABLED: false, chatHistory: [], mode: 'fast',
        },
        autoAddUpcoming: false,
        urls: [],
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const out: Array<{ url: string; text: string }> = []
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/(.*?)\|?\s*(https?:\/\/[^\s)|"'<>\]]+\.(?:xlsx|xls))/i)
      if (m && /gicouncil\.in/i.test(m[2])) out.push({ url: m[2], text: clean(m[1]).slice(0, 120) })
    }
    if (out.length > 0) warnings.push(`listing discovered via muns agent (${out.length} links) — direct + relay + archive routes were all blocked`)
    else warnings.push('muns agent returned no usable gicouncil links')
    return out
  } catch (err) {
    warnings.push(`muns agent discovery failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

async function sha256(buf: Buffer): Promise<string> {
  return createHash('sha256').update(buf).digest('hex')
}

interface ManifestEntry { filename: string; url: string; bytes: number; sha256: string; fetched_at: string; via?: string }

/** Scan every data/agent-pulls/<pull>/sources/manifest.json for gicouncil
 *  segment workbooks the muns-agent workflows already downloaded (checksummed).
 *  Full-FY editions feed this fetcher directly; monthly editions are staged
 *  into data/raw/gicouncil/segment/<YYYY-MM>.xlsx for the monthly pipeline,
 *  so one agent pull feeds BOTH pipelines with no extra steps. */
async function scanAgentPulls(warnings: string[]): Promise<CommittedSource[]> {
  const out: CommittedSource[] = []
  const root = resolve(REPO_ROOT, 'data', 'agent-pulls')
  for (const pull of (await readdir(root).catch(() => [] as string[]))) {
    const manifestPath = resolve(root, pull, 'sources', 'manifest.json')
    if (!(await fileExists(manifestPath))) continue
    let files: Record<string, ManifestEntry>
    try {
      files = JSON.parse(await readFile(manifestPath, 'utf8')).files ?? {}
    } catch {
      continue
    }
    for (const [url, e] of Object.entries(files)) {
      if (!/gicouncil\.in/i.test(url) || !e?.filename || !/\.(xlsx|xls)$/i.test(e.filename)) continue
      const cls = classifySegmentFile(`${e.filename} ${url}`)
      if (!cls) continue
      const path = `data/agent-pulls/${pull}/sources/${e.filename}`
      if (!(await fileExists(resolve(REPO_ROOT, path)))) continue
      if ('period' in cls) {
        out.push({ period: cls.period, kind: cls.kind, path, url })
      } else {
        // Monthly edition — stage for the monthly fetcher if not already there.
        const monthlyPath = resolve(RAW_ROOT, RAW_SUBDIR_MONTHLY, `${cls.monthly}.xlsx`)
        if (!(await fileExists(monthlyPath))) {
          try {
            await writeRaw(RAW_SUBDIR_MONTHLY, `${cls.monthly}.xlsx`, await readFile(resolve(REPO_ROOT, path)))
          } catch (err) {
            warnings.push(`could not stage monthly ${e.filename}: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
      }
    }
  }
  return out
}

/** Gather every available full-FY file: staged drops, committed agent pulls,
 *  and (live mode) fresh downloads from the listing page. One file per
 *  (period, kind); staged drops outrank committed copies of the same edition. */
async function resolveSources(warnings: string[]): Promise<SourceFile[]> {
  const byEdition = new Map<string, SourceFile>() // `${period}:${kind}`
  const put = (f: SourceFile, overwrite: boolean) => {
    const k = `${f.period}:${f.kind}`
    if (overwrite || !byEdition.has(k)) byEdition.set(k, f)
  }

  // 1. Committed official pulls — the hardcoded seeds plus whatever any
  //    muns-agent workflow has downloaded since (lowest precedence: same
  //    bytes as a staged/live copy of the same edition, just older).
  for (const c of [...COMMITTED_SOURCES, ...(await scanAgentPulls(warnings))]) {
    const abs = resolve(REPO_ROOT, c.path)
    if (!(await fileExists(abs))) continue
    put({ period: c.period, kind: c.kind, buffer: await readFile(abs), source_url: c.url, raw_file: c.path }, false)
  }

  // 2. Staged drops in data/raw/gicouncil/segment-annual/ (manual fallback).
  const stagedDir = resolve(RAW_ROOT, RAW_SUBDIR)
  for (const name of (await readdir(stagedDir).catch(() => [] as string[]))) {
    if (!/\.(xlsx|xls)$/i.test(name) || name.startsWith('~')) continue
    const cls = classifySegmentFile(name)
    if (!cls || !('period' in cls)) {
      if (cls === null) warnings.push(`staged file not recognised as a segment report (skipped): ${name}`)
      continue // monthly editions never fill FY columns
    }
    const abs = resolve(stagedDir, name)
    put({
      period: cls.period, kind: cls.kind, buffer: await readFile(abs),
      source_url: LISTING_URLS[0], raw_file: relative(REPO_ROOT, abs),
    }, true)
  }

  // 3. Live discovery + download (needs a non-datacenter egress or the proxy).
  if (!isOfflineMode()) {
    const links = await discoverListing(warnings)
    const manifestPath = resolve(stagedDir, 'manifest.json')
    const manifest: { files: Record<string, ManifestEntry> } = await readFile(manifestPath, 'utf8')
      .then((t) => JSON.parse(t))
      .catch(() => ({ files: {} }))
    for (const { url, text } of links) {
      const cls = classifySegmentFile(`${url} ${text}`)
      if (!cls) continue
      try {
        if ('monthly' in cls) {
          // Bonus: stage partial-year editions for the MONTHLY fetcher (only;
          // they are structurally barred from the annual path).
          const monthlyPath = resolve(RAW_ROOT, RAW_SUBDIR_MONTHLY, `${cls.monthly}.xlsx`)
          if (!(await fileExists(monthlyPath))) {
            const got = await gicFetch(url, 'xlsx')
            await writeRaw(RAW_SUBDIR_MONTHLY, `${cls.monthly}.xlsx`, got.buffer)
          }
          continue
        }
        const filename = `${fyOfPeriod(cls.period)}-${cls.kind}.xlsx`
        if (manifest.files[url] && byEdition.has(`${cls.period}:${cls.kind}`)) continue // already have this edition
        const got = await gicFetch(url, 'xlsx')
        const raw = await writeRaw(RAW_SUBDIR, filename, got.buffer)
        manifest.files[url] = {
          filename, url, bytes: got.buffer.length, sha256: await sha256(got.buffer), fetched_at: nowIso(), via: got.via,
        }
        put({ period: cls.period, kind: cls.kind, buffer: got.buffer, source_url: url, raw_file: relative(REPO_ROOT, raw) }, true)
      } catch (err) {
        warnings.push(`download failed on every route (${url}): ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (Object.keys(manifest.files).length > 0) {
      await ensureDir(stagedDir)
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    }
  }

  // Newest period first; within a period the final edition outranks provisional.
  return [...byEdition.values()].sort((a, b) =>
    a.period === b.period ? (a.kind === 'final' ? -1 : 1) : (a.period < b.period ? 1 : -1))
}

// ── sheet parsing ───────────────────────────────────────────────────────────

// Old GIC editions (2018-2021) are 20× larger workbooks, and at least one
// (2018-05) HANGS SheetJS outright — even listing its sheet names never
// returns. SheetJS is synchronous, so the only reliable guard is to parse in
// a WORKER THREAD with a hard deadline: on timeout the worker is terminated,
// the file is recorded in a durable quarantine list (skipped by every future
// run, surfaced as a warning — its cells stay honestly pending), and the
// pipeline moves on. The worker also parses ONLY the three sheets we read,
// capped at 200 rows × 40 columns (the real tables are < 100 rows).
const SHEET_RES_SRC: Record<string, string> = {
  health: 'health\\s*portfolio',
  segmentwise: 'segment\\s*wise|segmentwise',
  misc: 'miscellaneous',
}
const PARSE_TIMEOUT_MS = 20_000
const QUARANTINE_PATH = () => resolve(RAW_ROOT, 'gicouncil', 'parse-quarantine.json')

const WORKER_SRC = `
const { parentPort, workerData } = require('node:worker_threads')
const { readFileSync } = require('node:fs')
const XLSX = require(workerData.xlsxPath)
parentPort.on('message', (job) => {
  try {
    const buf = job.bytes ? Buffer.from(job.bytes) : readFileSync(job.filePath)
    const names = (XLSX.read(buf, { type: 'buffer', bookSheets: true }).SheetNames) || []
    const wanted = {}
    for (const [key, re] of Object.entries(job.sheetRes)) {
      const hit = names.find((n) => new RegExp(re, 'i').test(n))
      if (hit && !(hit in wanted)) wanted[hit] = key
    }
    const out = {}
    if (Object.keys(wanted).length > 0) {
      const wb = XLSX.read(buf, { type: 'buffer', sheets: Object.keys(wanted), sheetRows: 200 })
      for (const [name, key] of Object.entries(wanted)) {
        const sheet = wb.Sheets[name]
        if (!sheet) continue
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, raw: true, defval: null })
        out[key] = rows.map((r) => (r.length > 40 ? r.slice(0, 40) : r))
      }
    }
    parentPort.postMessage({ id: job.id, ok: true, sheets: out })
  } catch (err) {
    parentPort.postMessage({ id: job.id, ok: false, error: String((err && err.message) || err) })
  }
})
`

let parseWorker: import('node:worker_threads').Worker | null = null
let jobSeq = 0
const jobWaiters = new Map<number, { resolve: (v: { ok: boolean; sheets?: Record<string, XlsxRow[]>; error?: string }) => void }>()

function ensureWorker(): import('node:worker_threads').Worker {
  if (parseWorker) return parseWorker
  const xlsxPath = createRequire(import.meta.url).resolve('xlsx')
  parseWorker = new Worker(WORKER_SRC, { eval: true, workerData: { xlsxPath } })
  parseWorker.unref()
  parseWorker.on('message', (msg: { id: number; ok: boolean; sheets?: Record<string, XlsxRow[]>; error?: string }) => {
    jobWaiters.get(msg.id)?.resolve(msg)
    jobWaiters.delete(msg.id)
  })
  parseWorker.on('error', () => {
    for (const [, w] of jobWaiters) w.resolve({ ok: false, error: 'parse worker crashed' })
    jobWaiters.clear()
    parseWorker = null
  })
  return parseWorker
}

async function stopParseWorker(): Promise<void> {
  if (parseWorker) {
    await parseWorker.terminate().catch(() => undefined)
    parseWorker = null
  }
}

async function loadQuarantine(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(QUARANTINE_PATH(), 'utf8'))
  } catch {
    return {}
  }
}

async function quarantineFile(rawFile: string, reason: string): Promise<void> {
  const q = await loadQuarantine()
  q[rawFile] = `${reason} @ ${nowIso()}`
  await ensureDir(resolve(RAW_ROOT, 'gicouncil'))
  await writeFile(QUARANTINE_PATH(), JSON.stringify(q, null, 2) + '\n', 'utf8')
}

/** Read the three GIC sheets in the worker, hard-capped at PARSE_TIMEOUT_MS.
 *  Returns null on timeout/crash (the caller records the quarantine). */
async function readGicSheets(src: { filePath?: string; bytes?: Buffer }): Promise<Record<string, XlsxRow[]> | null> {
  const worker = ensureWorker()
  const id = ++jobSeq
  const result = await new Promise<{ ok: boolean; sheets?: Record<string, XlsxRow[]>; error?: string }>((resolveJob) => {
    const timer = setTimeout(async () => {
      jobWaiters.delete(id)
      await stopParseWorker() // the only way to stop a wedged synchronous parse
      resolveJob({ ok: false, error: `parse exceeded ${PARSE_TIMEOUT_MS / 1000}s (pathological workbook)` })
    }, PARSE_TIMEOUT_MS)
    jobWaiters.set(id, {
      resolve: (v) => {
        clearTimeout(timer)
        resolveJob(v)
      },
    })
    worker.postMessage({ id, filePath: src.filePath, bytes: src.bytes, sheetRes: SHEET_RES_SRC })
  })
  if (!result.ok) throw new Error(result.error ?? 'parse failed')
  return result.sheets ?? {}
}

/** Locate the header row + column index per normalised alias. */
function headerCols(rows: XlsxRow[], wanted: Record<string, string[]>): { headerIdx: number; col: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const col: Record<string, number> = {}
    rows[i].forEach((cell, j) => {
      const c = norm(cell)
      if (!c) return
      for (const [key, aliases] of Object.entries(wanted)) {
        if (col[key] == null && aliases.some((a) => c === a || c.startsWith(a))) col[key] = j
      }
    })
    if (Object.keys(col).length >= Math.min(3, Object.keys(wanted).length)) return { headerIdx: i, col }
  }
  return null
}

const isPrevRow = (name: string): boolean => /^previous year/i.test(name)
const isNoiseRow = (name: string): boolean =>
  /%|market share|growth/i.test(name) || name.length > 90 || /irdai has/i.test(name)

function readHealth(row: XlsxRow, col: Record<string, number>): HealthFields {
  const pick = (k: string): number | null => (col[k] == null ? null : num2(row[col[k]]))
  return {
    health_retail: pick('retail'),
    health_group: pick('group'),
    health_govt: pick('govt'),
    overseas_medical: pick('overseas'),
    health_total: pick('total'),
  }
}

/** Parse the "Health Portfolio" sheet: per-insurer rows (current + the
 *  interleaved "Previous Year" restatement) within their carrier group, plus
 *  the printed GENERAL / SAHI / INDUSTRY aggregates. */
function parseHealthPortfolio(rows: XlsxRow[], warnings: string[]): Pick<FileParse, 'insurers' | 'aggregates'> | null {
  const hdr = headerCols(rows, {
    retail: ['healthretail'],
    group: ['healthgroup'],
    govt: ['healthgovernment', 'healthgovt'],
    overseas: ['overseasmedical', 'overseasmediclaim'],
    total: ['grandtotal'],
  })
  if (!hdr || hdr.col.retail == null || hdr.col.total == null) {
    warnings.push('Health Portfolio: header row not found — format changed?')
    return null
  }
  const { headerIdx, col } = hdr

  const insurers: InsurerRow[] = []
  const aggregates: FileParse['aggregates'] = { GENERAL: null, SAHI: null, INDUSTRY: null }
  let group: 'general' | 'sahi' | 'specialised' | null = null
  let untracked = 0

  // Pending row waiting for its "Previous Year" line.
  let pending: { apply: (prev: HealthFields) => void } | null = null

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const name = clean(row[0])
    if (!name) continue

    if (isPrevRow(name)) {
      pending?.apply(readHealth(row, col))
      pending = null
      continue
    }
    pending = null

    if (/^general insurers$/i.test(name)) { group = 'general'; continue }
    if (/stand-?alone health insurers/i.test(name)) { group = 'sahi'; continue }
    if (/^specialised insurers/i.test(name)) { group = 'specialised'; continue }
    if (isNoiseRow(name)) continue

    const values = readHealth(row, col)
    const hasNumbers = Object.values(values).some((v) => v != null)
    if (!hasNumbers) continue

    if (/general insurers sub ?total/i.test(name)) {
      aggregates.GENERAL = { current: values, previous: emptyHealth() }
      pending = { apply: (p) => { aggregates.GENERAL!.previous = p } }
      continue
    }
    if (/stand-?alone health sub ?total/i.test(name)) {
      aggregates.SAHI = { current: values, previous: emptyHealth() }
      pending = { apply: (p) => { aggregates.SAHI!.previous = p } }
      continue
    }
    if (/^industry total/i.test(name)) {
      aggregates.INDUSTRY = { current: values, previous: emptyHealth() }
      pending = { apply: (p) => { aggregates.INDUSTRY!.previous = p } }
      continue
    }
    if (/sub ?total/i.test(name)) continue // specialised etc.

    if (group !== 'general' && group !== 'sahi') continue
    const aliases = group === 'sahi' ? SAHI_ALIASES : GENERAL_ALIASES
    const lname = name.toLowerCase()
    let companyId: string | null = null
    for (const [id, names] of Object.entries(aliases)) {
      if (names.some((a) => lname.includes(a))) { companyId = id; break }
    }
    if (!companyId) untracked++
    const rec: InsurerRow = {
      company_id: companyId, insurer_name: name.slice(0, 80), carrier_group: group,
      current: values, previous: emptyHealth(),
    }
    insurers.push(rec)
    pending = { apply: (p) => { rec.previous = p } }
  }

  if (!aggregates.INDUSTRY) warnings.push('Health Portfolio: Industry Total row not found.')
  if (untracked > 0 && insurers.length === untracked) warnings.push('Health Portfolio: no tracked insurer matched — alias table stale?')
  return { insurers, aggregates }
}

/** Industry Total (+ Previous Year) of a one-table sheet, given column aliases. */
function industryTotalsOf(
  rows: XlsxRow[], wanted: Record<string, string[]>, sheetLabel: string, warnings: string[],
): { current: Record<string, number | null>; previous: Record<string, number | null> } | null {
  const hdr = headerCols(rows, wanted)
  if (!hdr) {
    warnings.push(`${sheetLabel}: header row not found — format changed?`)
    return null
  }
  const read = (row: XlsxRow): Record<string, number | null> =>
    Object.fromEntries(Object.keys(wanted).map((k) => [k, hdr.col[k] == null ? null : num2(row[hdr.col[k]])]))
  for (let i = hdr.headerIdx + 1; i < rows.length; i++) {
    const name = clean(rows[i][0])
    if (!/^industry total/i.test(name)) continue
    const next = rows[i + 1] && isPrevRow(clean(rows[i + 1][0])) ? rows[i + 1] : null
    if (!next) warnings.push(`${sheetLabel}: Industry Total has no Previous Year row.`)
    return { current: read(rows[i]), previous: next ? read(next) : Object.fromEntries(Object.keys(wanted).map((k) => [k, null])) }
  }
  warnings.push(`${sheetLabel}: Industry Total row not found.`)
  return null
}

let quarantineCache: Record<string, string> | null = null

/** Remove a staged GIC copy so the next live run re-downloads fresh bytes.
 *  Only ever touches files under the gicouncil raw tree. */
async function dropBadCopy(key: string, warnings: string[], why: string): Promise<void> {
  if (!key.startsWith('data/raw/gicouncil/')) return
  try {
    await unlink(resolve(REPO_ROOT, key))
    warnings.push(`${why} — removed ${key}; the next live run re-downloads it.`)
  } catch { /* already gone */ }
}

async function parseWorkbook(buffer: Buffer, key: string, warnings: string[]): Promise<FileParse | null> {
  quarantineCache = quarantineCache ?? (await loadQuarantine())
  // Quarantine is keyed file+content, so a freshly re-downloaded copy (new
  // bytes) gets a new attempt while the same bad bytes stay skipped.
  const qKey = `${key}@${createHash('sha256').update(buffer).digest('hex').slice(0, 12)}`
  if (quarantineCache[qKey]) {
    warnings.push(`skipped (quarantined pathological workbook): ${key} — ${quarantineCache[qKey]}`)
    return null
  }
  let sheets: Record<string, XlsxRow[]>
  try {
    sheets = (await readGicSheets({ bytes: buffer })) ?? {}
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    if (/compressed size|central directory|corrupt|invalid zip|unsupported/i.test(reason)) {
      // A truncated/garbage relay response that still carried the ZIP magic.
      await dropBadCopy(key, warnings, `corrupt download (${reason})`)
    } else if (/exceeded|crashed/.test(reason)) {
      await quarantineFile(qKey, reason)
      quarantineCache[qKey] = reason
      warnings.push(`QUARANTINED ${key}: ${reason} — its periods stay honestly pending.`)
      await dropBadCopy(key, warnings, 'pathological copy') // a fresh download gets one new chance
    } else {
      warnings.push(`parse failed (${key}): ${reason}`)
    }
    return null
  }
  const hp = sheets.health ?? null
  const sw = sheets.segmentwise ?? null
  const misc = sheets.misc ?? null
  if (!hp || !sw) {
    warnings.push('expected sheets ("Health Portfolio" + "Segmentwise Report") not found — not a full-FY segment workbook?')
    return null
  }

  const portfolio = parseHealthPortfolio(hp, warnings)
  if (!portfolio) return null

  const swTotals = industryTotalsOf(sw, {
    fire: ['fire'], marine: ['marinetotal'], motor: ['motortotal'],
    health: ['health'], pa: ['pa', 'personalaccident'], total: ['grandtotal'],
  }, 'Segmentwise Report', warnings)
  const miscTotals = misc
    ? industryTotalsOf(misc, { crop: ['cropinsurance'] }, 'Miscellaneous portfolio', warnings)
    : null

  const seg = (which: 'current' | 'previous'): IndustrySegments => ({
    fire: swTotals?.[which].fire ?? null,
    marine: swTotals?.[which].marine ?? null,
    motor: swTotals?.[which].motor ?? null,
    health: swTotals?.[which].health ?? null,
    crop: miscTotals?.[which].crop ?? null,
    pa: swTotals?.[which].pa ?? null,
    total: swTotals?.[which].total ?? null,
  })
  const segments = { current: seg('current'), previous: seg('previous') }

  // Cross-foot: the Segmentwise health column must equal the Health Portfolio
  // Industry Total (same statement, two sheets).
  const hpTotal = portfolio.aggregates.INDUSTRY?.current.health_total
  if (hpTotal != null && segments.current.health != null && Math.abs(hpTotal - segments.current.health) > Math.max(1, hpTotal * 0.001)) {
    warnings.push(`health cross-check failed: Health Portfolio ${hpTotal} vs Segmentwise ${segments.current.health}.`)
  }
  return { ...portfolio, segments, warnings: [] }
}

// ── derive carrier-type aggregates (exact arithmetic over printed rows) ─────

interface EntityValues extends HealthFields {
  entity: string
  carrier_group: 'general' | 'sahi' | 'aggregate'
  insurer_name: string | null
  derivation: string | null
}

function sumFields(rows: HealthFields[]): HealthFields {
  const out = emptyHealth()
  for (const k of Object.keys(out) as (keyof HealthFields)[]) {
    const vals = rows.map((r) => r[k])
    out[k] = vals.some((v) => v == null) ? null : r2((vals as number[]).reduce((a, b) => a + b, 0))
  }
  return out
}
function subFields(a: HealthFields, b: HealthFields): HealthFields {
  const out = emptyHealth()
  for (const k of Object.keys(out) as (keyof HealthFields)[]) {
    out[k] = a[k] == null || b[k] == null ? null : r2(a[k]! - b[k]!)
  }
  return out
}

/** One fiscal year's entity table out of a parsed file (current or previous columns). */
function entitiesForYear(parse: FileParse, which: 'current' | 'previous', fy: string, warnings: string[]): EntityValues[] {
  const out: EntityValues[] = []
  const pick = (r: { current: HealthFields; previous: HealthFields }) => r[which]

  // Tracked insurer rows. A company can legitimately be absent (not yet
  // licensed / merged away) — absent means NO row, never a zero.
  const byId = new Map<string, InsurerRow[]>()
  for (const r of parse.insurers) {
    if (!r.company_id) continue
    const rows = byId.get(`${r.company_id}:${r.carrier_group}`) ?? []
    rows.push(r)
    byId.set(`${r.company_id}:${r.carrier_group}`, rows)
  }
  for (const [key, rows] of byId) {
    const [id, grp] = key.split(':')
    if (rows.length > 1) warnings.push(`${fy}: ${id} matched ${rows.length} rows in the ${grp} block — using the first.`)
    const v = pick(rows[0])
    if (Object.values(v).every((x) => x == null)) continue
    out.push({ entity: id, carrier_group: grp as 'general' | 'sahi', insurer_name: rows[0].insurer_name, derivation: null, ...v })
  }

  const agg = parse.aggregates
  const printed = (
    entity: string, src: { current: HealthFields; previous: HealthFields } | null, label: string,
  ): HealthFields | null => {
    if (!src) return null
    const v = pick(src)
    if (Object.values(v).every((x) => x == null)) return null
    out.push({ entity, carrier_group: 'aggregate', insurer_name: label, derivation: null, ...v })
    return v
  }
  const general = printed('GENERAL', agg.GENERAL, 'General Insurers Sub Total (as printed)')
  printed('SAHI', agg.SAHI, 'Stand-alone Health sub Total (as printed)')
  const industry = printed('INDUSTRY', agg.INDUSTRY, 'Industry Total (as printed)')

  // PSUs = the 4 public-sector general insurers, summed from their printed rows.
  const psuRows = PSU_IDS
    .map((id) => parse.insurers.find((r) => r.company_id === id && r.carrier_group === 'general'))
    .filter((r): r is InsurerRow => r != null)
  if (psuRows.length === 4) {
    const psu = sumFields(psuRows.map(pick))
    if (psu.health_total != null) {
      out.push({
        entity: 'PSUs', carrier_group: 'aggregate', insurer_name: 'Public-sector general insurers',
        derivation: 'sum of the printed National + New India + Oriental + United India rows', ...psu,
      })
      // Private general insurers = printed General Insurers Sub Total − PSUs.
      if (general) {
        const priv = subFields(general, psu)
        if (priv.health_total != null) {
          out.push({
            entity: 'Private', carrier_group: 'aggregate', insurer_name: 'Private general insurers',
            derivation: 'printed General Insurers Sub Total − the 4 public-sector insurers', ...priv,
          })
        }
      }
    } else {
      warnings.push(`${fy}: a PSU row has a blank health total — PSUs/Private left null (not under-reported).`)
    }
  } else {
    warnings.push(`${fy}: found ${psuRows.length}/4 PSU rows — PSUs/Private left null.`)
  }

  // Others (retail) = Industry retail − the 11 named insurers. Only emitted when
  // every named row is present AND the sheet's own rows re-add to the printed
  // Industry Total (so a mis-parsed row can't inflate "Others").
  if (industry?.health_retail != null) {
    const named = RETAIL_NAMED_IDS.map((id) =>
      parse.insurers.find((r) => r.company_id === id && (id !== 'hdfc-ergo' ? true : r.carrier_group === 'general'))
      ?? parse.insurers.find((r) => r.company_id === id))
    const present = named.filter((r): r is InsurerRow => r != null)
    const allRows = parse.insurers.map((r) => pick(r).health_retail)
    const coverage = allRows.some((v) => v == null) ? null : r2((allRows as number[]).reduce((a, b) => a + b, 0))
    const tol = Math.max(1, industry.health_retail * 0.002)
    if (present.length === RETAIL_NAMED_IDS.length || which === 'previous' || present.length >= 9) {
      const namedVals = present.map((r) => pick(r).health_retail)
      if (!namedVals.some((v) => v == null) && coverage != null && Math.abs(coverage - industry.health_retail) <= tol) {
        const namedSum = (namedVals as number[]).reduce((a, b) => a + b, 0)
        out.push({
          entity: 'Others', carrier_group: 'aggregate', insurer_name: 'All other insurers (retail health)',
          derivation: `printed Industry Total retail − the ${present.length} named insurer rows`,
          ...emptyHealth(), health_retail: r2(industry.health_retail - namedSum),
        })
      } else if (coverage == null || Math.abs(coverage - (industry.health_retail ?? 0)) > tol) {
        warnings.push(`${fy}: insurer retail rows do not re-add to the printed Industry Total — "Others" left null.`)
      }
    } else {
      warnings.push(`${fy}: only ${present.length}/${RETAIL_NAMED_IDS.length} named retail rows found — "Others" left null.`)
    }
  }
  return out
}

// ── quarter-end cumulative statements (the FY26 GWP tab's H1/9M inputs) ─────
//
// Besides the March/full-FY editions, the June / September / December editions
// are quarter-end cumulatives: "up to September 2025" IS H1 FY26 as printed —
// no delta arithmetic. Each file also restates the same period of the PRIOR
// year in its "Previous Year" rows (Sep-2025 file ⇒ H1 FY26 + H1 FY25), and
// the newest statement of a period wins, exactly like the FY columns.

const QUARTER_END: Record<string, { label: (fy: string) => string; monthName: string }> = {
  '06': { label: (fy) => `Q1${fy}`, monthName: 'June' },
  '09': { label: (fy) => `H1${fy}`, monthName: 'September' },
  '12': { label: (fy) => `9M${fy}`, monthName: 'December' },
}

interface QuarterFile { period: string; buffer: Buffer; source_url: string; raw_file: string }

/** Quarter-end editions available locally: the monthly drop dir (which the
 *  live run + agent pulls keep stocked) — June/September/December only. */
async function resolveQuarterEndFiles(): Promise<QuarterFile[]> {
  const out: QuarterFile[] = []
  const dir = resolve(RAW_ROOT, RAW_SUBDIR_MONTHLY)
  for (const name of (await readdir(dir).catch(() => [] as string[]))) {
    const m = name.match(/^(\d{4})-(06|09|12)\.xlsx$/)
    if (!m) continue
    const abs = resolve(dir, name)
    out.push({
      period: `${m[1]}-${m[2]}`, buffer: await readFile(abs),
      source_url: LISTING_URLS[0], raw_file: relative(REPO_ROOT, abs),
    })
  }
  return out
}

/** FY a calendar quarter-end belongs to: Jun/Sep/Dec YYYY → FY(YYYY+1). */
function fyOfQuarterEnd(period: string): string {
  return `FY${String(Number(period.slice(2, 4)) + 1).padStart(2, '0')}`
}

interface QuarterStatement {
  period: string // e.g. 'H1FY26'
  recency: string
  file: QuarterFile
  basis: 'current-year columns' | 'prior-year comparative columns'
  entities: EntityValues[]
  periodLabel: string
}

async function quarterStatementsOf(files: QuarterFile[], warnings: string[]): Promise<QuarterStatement[]> {
  const statements: QuarterStatement[] = []
  for (const file of files) {
    const mm = file.period.slice(5, 7)
    const q = QUARTER_END[mm]
    if (!q) continue
    const fileWarnings: string[] = []
    const parse = await parseWorkbook(file.buffer, file.raw_file, fileWarnings)
    warnings.push(...fileWarnings.map((w) => `${file.raw_file}: ${w}`))
    if (!parse) continue
    const fy = fyOfQuarterEnd(file.period)
    const label = `For the period up to ${q.monthName} ${file.period.slice(0, 4)} (provisional & unaudited)`
    statements.push({
      period: q.label(fy), recency: file.period, file, basis: 'current-year columns',
      entities: entitiesForYear(parse, 'current', q.label(fy), warnings), periodLabel: label,
    })
    statements.push({
      period: q.label(prevFy(fy)), recency: file.period, file, basis: 'prior-year comparative columns',
      entities: entitiesForYear(parse, 'previous', q.label(prevFy(fy)), warnings), periodLabel: label,
    })
  }
  // Newest statement of each cumulative period wins; drop the older ones.
  statements.sort((a, b) => (a.recency > b.recency ? -1 : 1))
  const seen = new Set<string>()
  const kept: QuarterStatement[] = []
  for (const st of statements) {
    if (seen.has(st.period)) continue
    seen.add(st.period)
    kept.push(st)
  }
  return kept
}

// ── single-month statements (the Q1'26 GWP tab's monthly inputs) ────────────
//
// The monthly editions are cumulative; a single month is the difference of
// two adjacent printed cumulatives within the same fiscal year (April IS its
// own month — the FY starts there). Computed per insurer per field from the
// latest-statement YTD table; a negative difference (restatement between
// editions) is set null with a warning, never smoothed. Emitted for every
// month available so future quarter tabs fill without code changes.

const MONTH_LABEL = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']
const FULL_MONTH = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March']

/** Fiscal-month index 0..11 (Apr=0) and FY label for a calendar YYYY-MM. */
function fiscalOf(period: string): { fy: string; fm: number } {
  const [yyyy, mm] = period.split('-').map(Number)
  const fm = (mm + 8) % 12
  const fyEnd = mm >= 4 ? yyyy + 1 : yyyy
  return { fy: `FY${String(fyEnd).slice(2)}`, fm }
}

interface MonthlyPoint {
  recency: string
  file: string
  url: string
  values: HealthFields
  insurer_name: string
}

async function monthlyStatements(
  files: Array<{ period: string; buffer: Buffer; source_url: string; raw_file: string }>,
  warnings: string[],
): Promise<Array<{ period: string; periodLabel: string; file: string; url: string; entities: EntityValues[]; derivation: string | null }>> {
  // YTD table: `${fy}|${fm}|${entity}|${group}` → latest statement of that point.
  const ytd = new Map<string, MonthlyPoint>()
  const put = (key: string, p: MonthlyPoint) => {
    const cur = ytd.get(key)
    if (!cur || p.recency > cur.recency) ytd.set(key, p)
  }
  for (const file of files) {
    const fileWarnings: string[] = []
    const tf = Date.now()
    const parse = await parseWorkbook(file.buffer, file.raw_file, fileWarnings)
    if (Date.now() - tf > 1500) console.error(`[gic-annual] slow parse ${file.raw_file}: ${((Date.now() - tf) / 1000).toFixed(1)}s`)
    warnings.push(...fileWarnings.map((w) => `${file.raw_file}: ${w}`))
    if (!parse) continue
    const { fy, fm } = fiscalOf(file.period)
    const prevYearFy = prevFy(fy)
    for (const which of ['current', 'previous'] as const) {
      const rowFy = which === 'current' ? fy : prevYearFy
      for (const e of entitiesForYear(parse, which, `${MONTH_LABEL[fm]}-${rowFy}`, warnings)) {
        put(`${rowFy}|${fm}|${e.entity}|${e.carrier_group}`, {
          recency: file.period, file: file.raw_file, url: file.source_url,
          insurer_name: e.insurer_name ?? e.entity,
          values: {
            health_retail: e.health_retail, health_group: e.health_group,
            health_govt: e.health_govt, overseas_medical: e.overseas_medical,
            health_total: e.health_total,
          },
        })
      }
    }
  }

  // Adjacent YTD differences → single months (April = its own YTD).
  const byPeriod = new Map<string, { periodLabel: string; entities: EntityValues[]; file: string; url: string; derivation: string | null }>()
  for (const [key, point] of ytd) {
    const [fy, fmStr, entity, group] = key.split('|')
    const fm = Number(fmStr)
    const prev = fm === 0 ? null : ytd.get(`${fy}|${fm - 1}|${entity}|${group}`)
    if (fm > 0 && !prev) continue // no predecessor edition staged — honest pending
    const single = emptyHealth()
    let negative = false
    for (const f of Object.keys(single) as (keyof HealthFields)[]) {
      const cur = point.values[f]
      const before = fm === 0 ? 0 : prev!.values[f]
      if (cur == null || before == null) { single[f] = null; continue }
      const d = r2(cur - before)
      if (d < 0) { single[f] = null; negative = true; continue }
      single[f] = d
    }
    if (negative) warnings.push(`${MONTH_LABEL[fm]}-${fy} ${entity}: a cumulative fell vs the prior month (restatement between editions) — that field left null, not smoothed.`)
    if (Object.values(single).every((v) => v == null)) continue
    const periodKey = `${MONTH_LABEL[fm]}-${fy}`
    const bucket = byPeriod.get(periodKey) ?? {
      periodLabel: `${FULL_MONTH[fm]} 20${fm >= 9 ? fy.slice(2) : String(Number(fy.slice(2)) - 1).padStart(2, '0')} (single month, from the printed cumulatives)`,
      entities: [], file: point.file, url: point.url,
      derivation: fm === 0 ? null : `single month = printed YTD(${MONTH_LABEL[fm]}) − printed YTD(${MONTH_LABEL[fm - 1]})`,
    }
    bucket.entities.push({
      entity, carrier_group: group as EntityValues['carrier_group'],
      insurer_name: point.insurer_name, derivation: bucket.derivation, ...single,
    })
    byPeriod.set(periodKey, bucket)
  }
  return [...byPeriod.entries()].map(([period, b]) => ({ period, ...b }))
}

/** Every monthly edition available locally (the live run keeps this stocked). */
async function resolveAllMonthFiles(): Promise<Array<{ period: string; buffer: Buffer; source_url: string; raw_file: string }>> {
  const out: Array<{ period: string; buffer: Buffer; source_url: string; raw_file: string }> = []
  const dir = resolve(RAW_ROOT, RAW_SUBDIR_MONTHLY)
  for (const name of (await readdir(dir).catch(() => [] as string[]))) {
    const m = name.match(/^(\d{4})-(\d{2})\.xlsx$/)
    if (!m) continue
    const abs = resolve(dir, name)
    out.push({
      period: `${m[1]}-${m[2]}`, buffer: await readFile(abs),
      source_url: LISTING_URLS[0], raw_file: relative(REPO_ROOT, abs),
    })
  }
  return out
}

// ── orchestration ───────────────────────────────────────────────────────────

interface YearStatement {
  fy: string
  recency: string // sortable: file period + edition; newest statement wins
  file: SourceFile
  basis: 'current-year columns' | 'prior-year comparative columns'
  entities: EntityValues[]
  segments: IndustrySegments
  periodLabel: string
}

export const ingestGicouncilSegmentAnnual: Fetcher = {
  source_id: SOURCE_ID,
  name: 'GI Council Segmentwise Report — full fiscal years (health portfolio + carrier mix)',
  // The new March edition appears in April and the "final" re-issue mid-year:
  // checking on the monthly cadence picks both up promptly; no-ops in between.
  frequency: 'monthly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const t0 = Date.now()
    const mark = (label: string) => console.error(`[gic-annual] ${label} +${((Date.now() - t0) / 1000).toFixed(1)}s`)
    const warnings: string[] = []
    const files = await resolveSources(warnings)
    mark(`resolved ${files.length} full-FY files`)

    const statements: YearStatement[] = []
    for (const file of files) {
      const fileWarnings: string[] = []
      const parse = await parseWorkbook(file.buffer, file.raw_file, fileWarnings)
      warnings.push(...fileWarnings.map((w) => `${file.raw_file}: ${w}`))
      if (!parse) continue

      const fy = fyOfPeriod(file.period)
      const editionRank = file.kind === 'final' ? 'F' : 'P'
      const label = `upto March ${file.period.slice(0, 4)} (${fy}, ${file.kind === 'final' ? 'final' : 'provisional & unaudited'})`
      statements.push({
        fy, recency: `${file.period}${editionRank}`, file, basis: 'current-year columns',
        entities: entitiesForYear(parse, 'current', fy, warnings),
        segments: parse.segments.current, periodLabel: label,
      })
      statements.push({
        fy: prevFy(fy), recency: `${file.period}${editionRank}`, file, basis: 'prior-year comparative columns',
        entities: entitiesForYear(parse, 'previous', prevFy(fy), warnings),
        segments: parse.segments.previous, periodLabel: label,
      })
    }

    // The NEWEST GIC statement of each FY is canonical (restatements win).
    // Older statements are kept only where they contribute a field the newer
    // ones don't carry (e.g. a column dropped from a later edition), and are
    // emitted BEFORE the newer so the merge lands on the newest value. This
    // also makes reruns no-ops instead of re-playing superseded numbers.
    const byFy = new Map<string, YearStatement[]>()
    for (const st of statements) {
      byFy.set(st.fy, [...(byFy.get(st.fy) ?? []), st])
    }
    const kept: YearStatement[] = []
    for (const sts of byFy.values()) {
      sts.sort((a, b) => (a.recency > b.recency ? -1 : a.recency < b.recency ? 1 : a.basis === 'current-year columns' ? -1 : 1))
      const covered = new Set<string>()
      for (const st of sts) {
        let contributes = false
        const fieldKeys = (st: YearStatement): string[] => [
          ...Object.entries(st.segments).filter(([, v]) => v != null).map(([k]) => `seg:${k}`),
          ...st.entities.flatMap((e) =>
            (Object.keys(emptyHealth()) as (keyof HealthFields)[])
              .filter((k) => e[k] != null)
              .map((k) => `${e.entity}:${e.carrier_group}:${k}`)),
        ]
        for (const key of fieldKeys(st)) {
          if (!covered.has(key)) {
            covered.add(key)
            contributes = true
          }
        }
        if (contributes) kept.push(st)
      }
    }
    kept.sort((a, b) => (a.recency < b.recency ? -1 : a.recency > b.recency ? 1 : a.basis === 'prior-year comparative columns' ? -1 : 1))

    const records: SnapshotRecord[] = []
    for (const st of kept) {
      const provenance = {
        source_name: `GI Council Segment-wise Report (${st.periodLabel}) — ${st.basis}`,
        source_url: st.file.source_url,
        source_file: st.file.raw_file,
        source_period: st.fy,
        fetched_at,
        parsed_at: nowIso(),
        parser_name: 'ingest-gicouncil-segment-annual',
        confidence: 'high' as const,
      }

      // 1. Industry segment totals (gap-fill of the existing snapshot).
      const s = st.segments
      const other = s.total != null && s.health != null && s.motor != null ? r2(s.total - s.health - s.motor) : null
      if (Object.values(s).some((v) => v != null)) {
        records.push({
          target: 'industry-segment-premium',
          keys: { period: st.fy },
          values: {
            period_type: 'annual', fiscal_year: st.fy,
            health_premium: s.health, motor_premium: s.motor, fire_premium: s.fire,
            crop_premium: s.crop, marine_premium: s.marine, pa_premium: s.pa, other_premium: other,
            total_gi_premium: s.total,
            health_share: s.total && s.health != null ? Math.round((s.health / s.total) * 1000) / 10 : null,
            motor_share: s.total && s.motor != null ? Math.round((s.motor / s.total) * 1000) / 10 : null,
          },
          provenance,
        })
      }

      // 2. Health-portfolio entities (per-insurer + carrier-type aggregates).
      for (const e of st.entities) {
        // Source integrity: components must reconstruct the printed total, so the
        // derived Retail Mix (retail ÷ total) rests on a self-consistent basis.
        // Aggregates derived by arithmetic (PSUs/Private/Others) can legitimately
        // round differently, so only warn on as-printed per-insurer rows.
        if (!e.derivation) {
          const issue = validateHealthPortfolioSum(e)
          if (issue) warnings.push(`gic-health-portfolio ${st.fy} ${e.entity}: ${issue.message}`)
        }
        records.push({
          target: 'gic-health-portfolio',
          keys: { fiscal_year: st.fy, entity: e.entity, carrier_group: e.carrier_group },
          values: {
            insurer_name: e.insurer_name,
            health_retail: e.health_retail, health_group: e.health_group,
            health_govt: e.health_govt, overseas_medical: e.overseas_medical,
            health_total: e.health_total,
            basis: e.derivation ? `derived: ${e.derivation}` : 'as printed in the report',
            source_basis: st.basis,
            period_label: `For the period up to March 20${st.fy.slice(2)}`,
          },
          provenance,
        })
      }
    }

    mark(`annual statements done (${statements.length})`)
    // Quarter-end cumulatives (H1 / 9M / Q1 YTD) → gic-health-quarterly.
    const quarterStatements = await quarterStatementsOf(await resolveQuarterEndFiles(), warnings)
    mark(`quarter statements done (${quarterStatements.length})`)
    for (const st of quarterStatements) {
      const provenance = {
        source_name: `GI Council Segment-wise Report (${st.periodLabel}) — ${st.basis}`,
        source_url: st.file.source_url,
        source_file: st.file.raw_file,
        source_period: st.period,
        fetched_at,
        parsed_at: nowIso(),
        parser_name: 'ingest-gicouncil-segment-annual',
        confidence: 'high' as const,
      }
      for (const e of st.entities) {
        records.push({
          target: 'gic-health-quarterly',
          keys: { period: st.period, entity: e.entity, carrier_group: e.carrier_group },
          values: {
            insurer_name: e.insurer_name,
            health_retail: e.health_retail, health_group: e.health_group,
            health_govt: e.health_govt, overseas_medical: e.overseas_medical,
            health_total: e.health_total,
            basis: e.derivation ? `derived: ${e.derivation}` : 'as printed in the report',
            source_basis: st.basis,
            period_label: st.periodLabel,
          },
          provenance,
        })
      }
    }

    // Single-month values (May-FY26 etc.) → gic-health-monthly.
    const monthFiles = await resolveAllMonthFiles()
    mark(`loaded ${monthFiles.length} monthly files`)
    const monthStatements = await monthlyStatements(monthFiles, warnings)
    mark(`monthly statements done (${monthStatements.length})`)
    for (const st of monthStatements) {
      const provenance = {
        source_name: `GI Council Segment-wise Report — ${st.periodLabel}`,
        source_url: st.url,
        source_file: st.file,
        source_period: st.period,
        fetched_at,
        parsed_at: nowIso(),
        parser_name: 'ingest-gicouncil-segment-annual',
        confidence: 'high' as const,
      }
      for (const e of st.entities) {
        records.push({
          target: 'gic-health-monthly',
          keys: { period: st.period, entity: e.entity, carrier_group: e.carrier_group },
          values: {
            insurer_name: e.insurer_name,
            health_retail: e.health_retail, health_group: e.health_group,
            health_govt: e.health_govt, overseas_medical: e.overseas_medical,
            health_total: e.health_total,
            basis: e.derivation ? `derived: ${e.derivation}` : 'as printed (April = its own cumulative)',
            period_label: st.periodLabel,
          },
          provenance,
        })
      }
    }

    // Standalone quarters — Q2 = H1 − Q1 and Q4 = FY − 9M, exact arithmetic
    // over the printed cumulatives above. These feed the GWP tab's standalone
    // columns (incl. auto-appended future FY groups, which are plain inputs).
    const cumEnt = new Map<string, Map<string, EntityValues>>()
    for (const st of quarterStatements) {
      cumEnt.set(st.period, new Map(st.entities.map((e) => [`${e.entity}|${e.carrier_group}`, e])))
    }
    const fyEnt = new Map<string, { entities: Map<string, EntityValues>; file: string; url: string }>()
    for (const st of kept) { // kept is oldest→newest; the newest statement wins
      fyEnt.set(st.fy, {
        entities: new Map(st.entities.map((e) => [`${e.entity}|${e.carrier_group}`, e])),
        file: st.file.raw_file, url: st.file.source_url,
      })
    }
    const fySeen = new Set<string>([...cumEnt.keys()].map((p) => p.slice(-4)).concat([...fyEnt.keys()]))
    for (const fy of fySeen) {
      const jobs = [
        { out: `Q2${fy}`, hi: cumEnt.get(`H1${fy}`), lo: cumEnt.get(`Q1${fy}`), src: null as { file: string; url: string } | null,
          basis: 'derived: standalone Q2 = printed H1 cumulative − printed Q1 cumulative', label: `Q2 ${fy} (standalone, from printed cumulatives)` },
        { out: `Q4${fy}`, hi: fyEnt.get(fy)?.entities, lo: cumEnt.get(`9M${fy}`), src: fyEnt.get(fy) ?? null,
          basis: 'derived: standalone Q4 = printed full-year − printed 9M cumulative', label: `Q4 ${fy} (standalone, from printed cumulatives)` },
      ]
      for (const job of jobs) {
        if (!job.hi || !job.lo) continue
        const provenance = {
          source_name: `GI Council Segment-wise Report — ${job.label}`,
          source_url: job.src?.url ?? LISTING_URLS[0],
          source_file: job.src?.file ?? null,
          source_period: job.out,
          fetched_at, parsed_at: nowIso(),
          parser_name: 'ingest-gicouncil-segment-annual',
          confidence: 'high' as const,
        }
        for (const [key, hiVal] of job.hi) {
          const loVal = job.lo.get(key)
          if (!loVal) continue
          const diff = subFields(hiVal, loVal)
          let negative = false
          for (const f of Object.keys(diff) as (keyof HealthFields)[]) {
            if (diff[f] != null && diff[f]! < 0) { diff[f] = null; negative = true }
          }
          if (negative) warnings.push(`${job.out} ${key.split('|')[0]}: cumulative fell across the period (restatement) — field left null, not smoothed.`)
          if (Object.values(diff).every((v) => v == null)) continue
          const [entity, carrier_group] = key.split('|')
          records.push({
            target: 'gic-health-quarterly',
            keys: { period: job.out, entity, carrier_group },
            values: {
              insurer_name: hiVal.insurer_name,
              health_retail: diff.health_retail, health_group: diff.health_group,
              health_govt: diff.health_govt, overseas_medical: diff.overseas_medical,
              health_total: diff.health_total,
              basis: job.basis,
              period_label: job.label,
            },
            provenance,
          })
        }
      }
    }

    // Honest processed sidecar — which file "won" each FY, for review.
    const winners: Record<string, { file: string; basis: string }> = {}
    for (const st of kept) winners[st.fy] = { file: st.file.raw_file, basis: st.basis }
    for (const st of quarterStatements) winners[st.period] = { file: st.file.raw_file, basis: st.basis }
    await ensureDir(PROCESSED_ROOT)
    await writeFile(resolve(PROCESSED_ROOT, 'gic-segment-annual.json'), JSON.stringify({
      _meta: {
        snapshot_id: 'gic-segment-annual',
        description: 'Full-FY statements extracted from GI Council Segment-wise Reports. For each FY the newest GIC statement wins (a later report\'s restated prior-year columns supersede the year\'s own earlier edition).',
        source_listing: LISTING_URLS[0],
        last_run_at: fetched_at,
        files_used: files.map((f) => ({ period: f.period, kind: f.kind, file: f.raw_file, url: f.source_url })),
        canonical_statement_per_fy: winners,
        warnings: warnings.slice(0, 50),
      },
    }, null, 2) + '\n', 'utf8')

    await stopParseWorker()
    await appendLog('ingest-gicouncil-segment-annual.log', {
      source: SOURCE_ID, files: files.length, statements: statements.length,
      records: records.length, offline: isOfflineMode(),
    })

    return {
      source_id: SOURCE_ID,
      status: records.length > 0 ? 'success' : 'pending',
      raw_file: files[0]?.raw_file ?? null,
      records,
      records_fetched: records.length,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}
