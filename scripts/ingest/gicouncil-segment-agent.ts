// ---------------------------------------------------------------------------
//  GI Council segment-wise health-premium pull via the muns chat agent.
//
//  The GI Council "Gross Direct Premium Underwritten — Segment-wise" report
//  (gicouncil.in) geo-blocks our CI runner (HTTP 403), so we ask the muns chat
//  agent to fetch it server-side instead. We request each SAHI's HEALTH-segment
//  gross direct premium (₹ cr) for FY24/FY25/FY26 plus the all-industry total
//  health GDPI (the denominator for overall-health share), every row carrying a
//  source URL. The raw answer is saved; from it we later compute and ingest the
//  SAHI segment / overall-health share into the audit overlay (audit-fill.ts).
//
//  Same machinery as scripts/ingest/niva-fy25-financials.ts. Token from
//  MUNS_API_TOKEN (a GitHub Actions secret).
// ---------------------------------------------------------------------------

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, resolve, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')
const OUT_DIR = resolve(REPO_ROOT, 'data/agent-pulls/gicouncil-segment')
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

interface ManifestEntry {
  filename: string
  url: string
  bytes: number
  sha256: string
  fetched_at: string
}
interface Manifest {
  files: Record<string, ManifestEntry>
  updated_at?: string
}

function buildPayload() {
  return {
    user_index: 124,
    tasks: [
      // Task 1 — enumerate EVERY report file currently listed, so the runner
      // can download any new month/edition (the downloads + checksums happen
      // here, not at the agent). scripts/ingest/ingest-gicouncil-segment-annual.ts
      // auto-stages whatever lands in the sources manifest.
      'Open https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report-on-homepage/ (General Insurance Council — Segmentwise report list, including older pagination pages) and list EVERY report download link on it. One line per link, format exactly: <report title> | <absolute .xlsx/.xls URL>. Include all months and years visible. Do not summarise and do not skip any.',
      'From the GENERAL INSURANCE COUNCIL of India "Gross Direct Premium Underwritten — Segment-wise" report (source: https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report/), pull the HEALTH segment gross direct premium for each standalone health insurer, plus the all-industry total health premium.\n\nReturn a table with exactly these columns, in this order:\n\ncompany | period | line_item | value | unit | source_name | source_url | filing_date\n\nRules\n\nOne row per company per period.\nperiod = FY24, FY25, and FY26 (FY = year ended 31 March). If FY26 full-year is not yet published, give the latest available cumulative (e.g. up to the most recent month) and put that month in source_name.\nline_item = "Health GDPI" for each insurer row, and "Industry total Health GDPI" for the all-industry row.\nvalue = number only, ₹ crore, no commas, no unit inside the cell. If a figure is not published for a period, leave value blank — never 0, never an estimate.\nunit = INR_crore for every row.\nsource_name = the exact GI Council report + month/edition (e.g. "GI Council Segment-wise Report, Mar 2025 (FY25 cumulative)").\nsource_url = direct link to the GI Council report file (xlsx/pdf) if available, else the GI Council statistics page.\nfiling_date = the report month-end date, YYYY-MM-DD.\n\nCompanies (use these exact names):\nStar Health and Allied Insurance\nCare Health Insurance\nNiva Bupa Health Insurance\nAditya Birla Health Insurance\nManipalCigna Health Insurance\n\nAlso include one row: company = "All India (industry)", line_item = "Industry total Health GDPI", for FY24/FY25/FY26.\n\nUse ONLY the GI Council segment-wise report as the source for these health-premium figures (not company press releases). If the GI Council figure for a given insurer/period genuinely is not in the report, leave it blank.\n\nExample of the expected output (format only):\n\ncompany\tperiod\tline_item\tvalue\tunit\tsource_name\tsource_url\tfiling_date\nStar Health and Allied Insurance\tFY25\tHealth GDPI\t15890\tINR_crore\tGI Council Segment-wise Report, Mar 2025\thttps://…\t2025-03-31\nAll India (industry)\tFY25\tIndustry total Health GDPI\t122800\tINR_crore\tGI Council Segment-wise Report, Mar 2025\thttps://…\t2025-03-31',
    ],
    query_context: {
      TICKER_SYMBOL: [],
      FROM_DATE: '2023-04-01',
      TO_DATE: new Date().toISOString().slice(0, 10),
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

  console.log('Calling chat-muns agent for GI Council segment-wise health premium ...')
  let raw: string
  try { raw = await callAgent(token) } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const answerPath = resolve(OUT_DIR, `gicouncil-segment-${stamp}.json`)
  let toWrite = raw
  try { toWrite = JSON.stringify(JSON.parse(raw), null, 2) + '\n' } catch { /* not JSON */ }
  await writeFile(answerPath, toWrite, 'utf8')
  console.log(`Saved answer: ${answerPath}`)

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
