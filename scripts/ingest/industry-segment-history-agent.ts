// ---------------------------------------------------------------------------
//  Industry GI-segment premium HISTORY pull via the muns chat agent.
//
//  The "Industry Growth" audit sheet needs the all-industry gross direct premium
//  by segment (Health / Motor / Total non-life) for every fiscal year FY15..FY26
//  — the denominators for industry-share storytelling. The GI Council
//  segment-wise report geo-blocks our CI runner (HTTP 403), and the long annual
//  history lives in the IRDAI "Handbook on Indian Insurance Statistics" anyway,
//  so we ask the muns chat agent to fetch both server-side.
//
//  Same machinery as scripts/ingest/gicouncil-segment-agent.ts — only the query
//  differs (full-history, by-segment, one row per segment per year). Token from
//  MUNS_API_TOKEN (a GitHub Actions secret). The raw answer + any source files
//  land in data/agent-pulls/industry-segment-history/; ingestion into the audit
//  overlay is a separate, reviewed step (we never auto-fill unverified numbers).
// ---------------------------------------------------------------------------

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, resolve, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')
const OUT_DIR = resolve(REPO_ROOT, 'data/agent-pulls/industry-segment-history')
const SOURCES_DIR = resolve(OUT_DIR, 'sources')
const MANIFEST_PATH = resolve(SOURCES_DIR, 'manifest.json')

const API_URL = process.env.MUNS_AGENT_URL || 'https://devde.muns.io/chat/chat-muns'
const API_TIMEOUT_MS = 600_000
const DOWNLOAD_TIMEOUT_MS = 60_000

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const RELAYS: string[] = [
  'https://api.allorigins.win/raw?url={url}',
  'https://corsproxy.io/?url={url}',
  'https://thingproxy.freeboard.io/fetch/{raw}',
  'https://api.codetabs.com/v1/proxy/?quest={url}',
]

const URL_RE = /https?:\/\/[^\s)|"'<>\]]+/g

interface ManifestEntry { filename: string; url: string; bytes: number; sha256: string; fetched_at: string }
interface Manifest { files: Record<string, ManifestEntry>; updated_at?: string }

function buildPayload() {
  return {
    user_index: 124,
    tasks: [
      'Find and DOWNLOAD the GENERAL INSURANCE COUNCIL "Gross Direct Premium Underwritten — Segment-wise" report files (the Excel/XLSX files, the same kind as https://www.gicouncil.in/media/4638/segment_march_2026-170426.xlsx) for the FULL YEAR ending 31 March of each year: March 2015, March 2016, March 2017, March 2018, March 2019, March 2020, March 2021, March 2022, March 2023, March 2024.\n\n' +
        'These year-end (March) segment-wise reports live in the GI Council "Statistics → Industry Statistics → Segment-wise Report" area (https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report/) and its archive; each is an .xlsx whose URL looks like https://www.gicouncil.in/media/<id>/segment_march_<YYYY>-<n>.xlsx . Give me the DIRECT .xlsx download URL for every year you can find — that is the most important output, because I will parse the spreadsheets myself.\n\n' +
        'From each spreadsheet, also read the INDUSTRY TOTAL row (all insurers combined) and return a table with exactly these columns:\n\n' +
        'segment | period | value | unit | source_name | source_url | filing_date\n\n' +
        'Rules\n\n' +
        'One row per segment per fiscal year.\n' +
        'segment = exactly one of: "Health", "Motor", "Total" (Total = the whole non-life industry gross direct premium for that year, the Industry Total grand total).\n' +
        'period = FY15..FY24 (FY = year ended 31 March; e.g. the "March 2020" report is FY20). Give every year you find a file for.\n' +
        'value = number only, in ₹ crore, no commas. If a file is not found for a year, leave its rows blank — never 0, never an estimate.\n' +
        'unit = INR_crore for every row.\n' +
        'IMPORTANT: "Health" = the industry-total Health segment grand total (the GI Council "Health" column summed across all insurers); "Motor" = Motor Total; "Total" = the all-segments Grand Total. Do NOT use a single company.\n' +
        'source_name = "GI Council Segment-wise Report, Mar <YYYY>".\n' +
        'source_url = the DIRECT .xlsx URL.\n' +
        'filing_date = the report month-end, YYYY-03-31.\n\n' +
        'If the GI Council archive does not go back far enough for some early years, then for those years ONLY, fall back to the IRDAI "Handbook on Indian Insurance Statistics" segment-wise GDPI table and give those figures (say so in source_name). Open the actual files and read the figures; do not fabricate.\n\n' +
        'Example (format only):\n\n' +
        'segment\tperiod\tvalue\tunit\tsource_name\tsource_url\tfiling_date\n' +
        'Health\tFY20\t51637\tINR_crore\tGI Council Segment-wise Report, Mar 2020\thttps://www.gicouncil.in/media/.../segment_march_2020-...xlsx\t2020-03-31',
    ],
    query_context: {
      TICKER_SYMBOL: [],
      FROM_DATE: '2014-04-01',
      TO_DATE: '2026-06-10',
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
    urls: [],
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
function urlsIn(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of text.matchAll(URL_RE)) {
    const u = m[0].replace(/[.,;]+$/, '')
    if (u.includes('devde.muns.io')) continue
    if (u.includes('…') || u.includes('XX')) continue
    if (!seen.has(u)) { seen.add(u); out.push(u) }
  }
  return out
}
function extractUrls(text: string): string[] {
  const fromAns = urlsIn(extractAnswer(text))
  return fromAns.length > 0 ? fromAns : urlsIn(text)
}
function deriveFilename(url: string): string {
  let pathname: string
  try { pathname = new URL(url).pathname } catch { pathname = url }
  let name = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '')
  name = name.split('?')[0].replace(/[^\w\-. ]/g, '').replace(/\s+/g, ' ').trim()
  if (!name) name = `source-${createHash('sha1').update(url).digest('hex').slice(0, 10)}`
  return name
}
async function exists(p: string): Promise<boolean> { try { await access(p); return true } catch { return false } }
async function uniqueName(name: string, used: Set<string>): Promise<string> {
  const ext = extname(name)
  const base = basename(name, ext)
  let candidate = name
  let i = 2
  while (used.has(candidate) || (await exists(resolve(SOURCES_DIR, candidate)))) { candidate = `${base}-${i}${ext}`; i++ }
  used.add(candidate)
  return candidate
}
async function loadManifest(): Promise<Manifest> {
  try {
    const data = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
    if (data && typeof data === 'object' && data.files) return data as Manifest
  } catch { /* fresh */ }
  return { files: {} }
}
async function saveManifest(manifest: Manifest): Promise<void> {
  manifest.updated_at = new Date().toISOString()
  const ordered: Manifest = { files: {}, updated_at: manifest.updated_at }
  for (const k of Object.keys(manifest.files).sort()) ordered.files[k] = manifest.files[k]
  await writeFile(MANIFEST_PATH, JSON.stringify(ordered, null, 2) + '\n', 'utf8')
}
function looksLikeRealFile(buf: Buffer): boolean {
  if (buf.length < 512) return false
  const head = buf.slice(0, 64).toString('latin1').trim().toLowerCase()
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return false
  return true
}
async function fetchOnce(target: string): Promise<Buffer | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    const res = await fetch(target, { redirect: 'follow', headers: { 'User-Agent': BROWSER_UA, Accept: '*/*' }, signal: ctrl.signal })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch { return null } finally { clearTimeout(timer) }
}
function relayTemplates(): string[] {
  const key = (process.env.SCRAPERAPI_KEY || '').trim()
  const custom = (process.env.INGEST_FETCH_PROXY || '').trim()
  const templates: string[] = []
  if (key) templates.push(`https://api.scraperapi.com/?api_key=${key}&url={url}`)
  if (custom && (custom.includes('{url}') || custom.includes('{raw}'))) templates.push(custom)
  if (templates.length > 0) return templates
  return [...RELAYS]
}
async function download(url: string): Promise<Buffer | null> {
  const direct = await fetchOnce(url)
  if (direct && looksLikeRealFile(direct)) return direct
  const enc = encodeURIComponent(url)
  for (const tmpl of relayTemplates()) {
    const target = tmpl.replace('{url}', enc).replace('{raw}', url)
    const buf = await fetchOnce(target)
    if (buf && looksLikeRealFile(buf)) return buf
  }
  return null
}

async function main(): Promise<number> {
  const token = (process.env.MUNS_API_TOKEN || '').trim()
  if (!token) {
    console.error('ERROR: MUNS_API_TOKEN is not set. Add it as a GitHub Actions secret.')
    return 1
  }
  await mkdir(SOURCES_DIR, { recursive: true })

  console.log('Calling chat-muns agent for industry GI-segment premium history (FY15..FY26) ...')
  let raw: string
  try { raw = await callAgent(token) } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const answerPath = resolve(OUT_DIR, `industry-segment-history-${stamp}.json`)
  // An empty/blank reply must not clobber a prior good pull.
  if (!raw || !raw.trim()) {
    console.error('WARNING: agent returned an empty answer — not writing (any prior pull is preserved).')
  } else {
    let toWrite = raw
    try { toWrite = JSON.stringify(JSON.parse(raw), null, 2) + '\n' } catch { /* not JSON */ }
    await writeFile(answerPath, toWrite, 'utf8')
    console.log(`Saved answer: ${answerPath}`)
  }

  const urls = extractUrls(raw)
  console.log(`Found ${urls.length} source URL(s) in the answer.`)
  const manifest = await loadManifest()
  const known = manifest.files
  const usedNames = new Set<string>(Object.values(known).map((v) => v.filename).filter(Boolean))
  const knownHashes = new Map<string, string>()
  for (const v of Object.values(known)) if (v.sha256) knownHashes.set(v.sha256, v.filename)

  let newCount = 0, dupCount = 0, failures = 0
  for (const url of urls) {
    if (known[url]) { console.log(`  · already have ${url}`); continue }
    try {
      const buffer = await download(url)
      if (!buffer) throw new Error('all routes blocked or returned non-file')
      const sha256 = createHash('sha256').update(buffer).digest('hex')
      const existing = knownHashes.get(sha256)
      if (existing) {
        known[url] = { filename: existing, url, bytes: buffer.length, sha256, fetched_at: new Date().toISOString() }
        dupCount++; console.log(`  = duplicate of ${existing}`); continue
      }
      const name = await uniqueName(deriveFilename(url), usedNames)
      await writeFile(resolve(SOURCES_DIR, name), buffer)
      known[url] = { filename: name, url, bytes: buffer.length, sha256, fetched_at: new Date().toISOString() }
      knownHashes.set(sha256, name); newCount++
      console.log(`  + saved: ${name}  (${buffer.length.toLocaleString()} bytes)`)
    } catch (err) {
      failures++; console.error(`  ! failed: ${url}  (${err instanceof Error ? err.message : String(err)})`)
    }
  }
  await saveManifest(manifest)
  console.log(`\nDone. Answer saved. ${newCount} new source file(s); ${dupCount} duplicate(s); ${failures} failed.`)
  if (failures > 0 && newCount === 0) console.error('WARNING: no source documents could be downloaded this run (answer still saved).')
  return 0
}

main().then((code) => { process.exitCode = code })
