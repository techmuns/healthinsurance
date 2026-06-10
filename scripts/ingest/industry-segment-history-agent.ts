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

const API_URL = 'https://devde.muns.io/chat/chat-muns'
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
      'I need the ALL-INDIA general-insurance (non-life) industry GROSS DIRECT PREMIUM by segment, for every Indian fiscal year from FY15 (year ended 31 March 2015) through FY26 (year ended 31 March 2026).\n\n' +
        'Authoritative sources, in order of preference:\n' +
        '1. IRDAI "Handbook on Indian Insurance Statistics" (latest editions) — it tabulates segment-wise gross direct premium for the whole non-life industry, year by year.\n' +
        '2. General Insurance Council "Gross Direct Premium Underwritten — Segment-wise" report (https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report/) — for the most recent year(s).\n' +
        '3. IRDAI Annual Report segment tables.\n\n' +
        'Return a table with exactly these columns, in this order:\n\n' +
        'segment | period | value | unit | source_name | source_url | filing_date\n\n' +
        'Rules\n\n' +
        'One row per segment per fiscal year.\n' +
        'segment = exactly one of: "Health", "Motor", "Total" (Total = the whole non-life industry gross direct premium for that year).\n' +
        'period = FY15, FY16, FY17, FY18, FY19, FY20, FY21, FY22, FY23, FY24, FY25, FY26 (FY = year ended 31 March). Give every year you can find.\n' +
        'If FY26 full-year is not yet published, give the latest available cumulative and put the cut-off month in source_name; otherwise leave it blank.\n' +
        'value = number only, in ₹ crore, no commas, no unit inside the cell. If a year/segment is genuinely not published, leave value blank — never 0, never an estimate.\n' +
        'unit = INR_crore for every row.\n' +
        'IMPORTANT basis: "Health" must be the standalone HEALTH segment gross direct premium for the WHOLE industry (all general + standalone-health insurers combined), the same basis IRDAI/GI Council uses — NOT a single company, and NOT including personal accident or overseas travel unless the source itself bundles them (say so in source_name if it does).\n' +
        'source_name = the exact publication + edition/table (e.g. "IRDAI Handbook on Indian Insurance Statistics 2023-24, Table: Segment-wise GDPI" or "GI Council Segment-wise Report, Mar 2025").\n' +
        'source_url = direct link to that document (xlsx/pdf) if available, else the publication page.\n' +
        'filing_date = the report/edition date, YYYY-MM-DD.\n\n' +
        'Open the actual documents and read the figures. Do not fabricate; leave blanks where the source does not publish a number.\n\n' +
        'Example of the expected output (format only):\n\n' +
        'segment\tperiod\tvalue\tunit\tsource_name\tsource_url\tfiling_date\n' +
        'Health\tFY24\t116551\tINR_crore\tIRDAI Handbook on Indian Insurance Statistics 2023-24\thttps://…\t2024-12-31\n' +
        'Total\tFY24\t289668\tINR_crore\tIRDAI Handbook on Indian Insurance Statistics 2023-24\thttps://…\t2024-12-31',
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
