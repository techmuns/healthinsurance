// ---------------------------------------------------------------------------
//  Niva Bupa FY25 financials pull via the muns chat agent.
//
//  1. Ask the muns chat agent for Niva Bupa's FY25 financials (19 line items),
//     each row carrying a source document URL.
//  2. Save the raw agent answer (JSON) under the dated folder.
//  3. Pull every source-document URL out of the answer and download the actual
//     files (annual report PDFs, etc.) into the `sources/` subfolder, deduped
//     via a manifest — the same shape as scripts/monthly-ingestion.ts.
//
//  The access token is read from MUNS_API_TOKEN (a GitHub Actions secret).
// ---------------------------------------------------------------------------

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, resolve, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')
const OUT_DIR = resolve(REPO_ROOT, 'data/agent-pulls/niva-fy25-financials')
const SOURCES_DIR = resolve(OUT_DIR, 'sources')
const MANIFEST_PATH = resolve(SOURCES_DIR, 'manifest.json')

const API_URL = 'https://devde.muns.io/chat/chat-muns'
const API_TIMEOUT_MS = 600_000 // the agent searches/reads filings live; give it room.
const DOWNLOAD_TIMEOUT_MS = 60_000 // per fetch attempt.

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Public fetch-relays, tried after a direct fetch fails. Each is a template
// with a {url} (URL-encoded target) / {raw} (raw target) placeholder. A custom
// INGEST_FETCH_PROXY / SCRAPERAPI_KEY is preferred when set.
const RELAYS: string[] = [
  'https://api.allorigins.win/raw?url={url}',
  'https://corsproxy.io/?url={url}',
  'https://thingproxy.freeboard.io/fetch/{raw}',
  'https://api.codetabs.com/v1/proxy/?quest={url}',
]

// Any http(s) URL in the answer, stopping at whitespace / markdown pipes /
// quotes / angle brackets / closing parens.
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
      'Pull the following financial data for Niva Bupa Health Insurance Ltd, for FY25 (the financial year ended 31 March 2025).\n\nReturn it as a table with exactly these columns, in this order:\n\ncompany | period | line_item | basis | value | unit | source_name | source_url | filing_date\n\nRules\n\nOne row per line item.\nperiod = FY25 for all rows.\nbasis = IGAAP, IFRS, or — (use the value shown for each line item below).\nvalue = the number only (no commas, no unit inside the cell). If a line item is not published, leave value blank — do not put 0 or an estimate.\nunit = exactly as specified per line below (INR_crore, %, or x).\nsource_name = the exact document (e.g. "Niva Bupa FY2024-25 Annual Report, p.XX").\nsource_url = direct link to that document.\nfiling_date = date of the source document, YYYY-MM-DD.\nThe 19 line items (line_item | basis | unit):\n\nRetail health GWP | IGAAP | INR_crore\nGroup + others GWP | IGAAP | INR_crore\nTotal GWP | IGAAP | INR_crore\nRetail market share (health) | IGAAP | %\nOverall health market share | IGAAP | %\nNet Written Premium (NWP) | IGAAP | INR_crore\nNet Earned Premium (NEP) | IGAAP | INR_crore\nProfit After Tax (PAT) | IGAAP | INR_crore\nClaims ratio | IGAAP | %\nExpense ratio | IGAAP | %\nCombined ratio | IGAAP | %\nEOM – expense of management | IGAAP | %\nProfit After Tax (PAT) | IFRS | INR_crore\nClaims ratio | IFRS | %\nExpense ratio | IFRS | %\nSolvency ratio | — | x\nNet worth (shareholders\' equity) | IGAAP | INR_crore\nInvestment AUM (total investments) | IGAAP | INR_crore\nInvestment yield (annualised) | IGAAP | %\nExample of the expected output (format only):\n\ncompany\tperiod\tline_item\tbasis\tvalue\tunit\tsource_name\tsource_url\tfiling_date\nNiva Bupa Health Insurance Ltd\tFY25\tTotal GWP\tIGAAP\t6762.23\tINR_crore\tNiva Bupa FY2024-25 Annual Report, p.XX\thttps://…\t2025-05-XX\nNiva Bupa Health Insurance Ltd\tFY25\tNet worth\tIGAAP\t\tINR_crore\t\t\t\nPeriod conventions for later requests: FY = year ended 31 March; Q4FY25 = Jan–Mar 2025; 9MFY25 = Apr–Dec 2024; H1FY25 = Apr–Sep 2024.',
    ],
    query_context: {
      TICKER_SYMBOL: [],
      FROM_DATE: '2024-06-09',
      TO_DATE: '2026-06-09',
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
      headers: {
        accept: '*/*',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildPayload()),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      throw new Error(`agent call failed: HTTP ${res.status} ${res.statusText}`)
    }
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/** The <ans>...</ans> section if present, else the whole response. */
function extractAnswer(text: string): string {
  const m = text.match(/<ans>([\s\S]*?)<\/ans>/)
  return m ? m[1] : text
}

function urlsIn(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of text.matchAll(URL_RE)) {
    // Trim trailing punctuation the regex may have swept up.
    const u = m[0].replace(/[.,;]+$/, '')
    // Skip the agent's own host and obvious placeholders.
    if (u.includes('devde.muns.io')) continue
    if (u.includes('…') || u.includes('XX')) continue
    if (!seen.has(u)) {
      seen.add(u)
      out.push(u)
    }
  }
  return out
}

/** Source-document URLs from the answer, preferring the curated <ans> block. */
function extractUrls(text: string): string[] {
  const fromAns = urlsIn(extractAnswer(text))
  return fromAns.length > 0 ? fromAns : urlsIn(text)
}

/** A clean, human-readable filename from a download URL. */
function deriveFilename(url: string): string {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    pathname = url
  }
  let name = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '')
  name = name.split('?')[0].replace(/[^\w\-. ]/g, '').replace(/\s+/g, ' ').trim()
  if (!name) {
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 10)
    name = `source-${hash}`
  }
  return name
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

/** If `name` is taken, suffix with -2, -3, ... */
async function uniqueName(name: string, used: Set<string>): Promise<string> {
  const ext = extname(name)
  const base = basename(name, ext)
  let candidate = name
  let i = 2
  while (used.has(candidate) || (await exists(resolve(SOURCES_DIR, candidate)))) {
    candidate = `${base}-${i}${ext}`
    i++
  }
  used.add(candidate)
  return candidate
}

async function loadManifest(): Promise<Manifest> {
  try {
    const data = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
    if (data && typeof data === 'object' && data.files) return data as Manifest
  } catch {
    /* no manifest yet — start fresh */
  }
  return { files: {} }
}

async function saveManifest(manifest: Manifest): Promise<void> {
  manifest.updated_at = new Date().toISOString()
  const ordered: Manifest = { files: {}, updated_at: manifest.updated_at }
  for (const k of Object.keys(manifest.files).sort()) ordered.files[k] = manifest.files[k]
  await writeFile(MANIFEST_PATH, JSON.stringify(ordered, null, 2) + '\n', 'utf8')
}

/** Reject tiny / HTML-error payloads so a relay's error page isn't saved as data. */
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
    const res = await fetch(target, {
      redirect: 'follow',
      headers: { 'User-Agent': BROWSER_UA, Accept: '*/*' },
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
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

/** Download a source document: direct fetch first, then each relay in turn. */
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

  console.log('Calling chat-muns agent for Niva Bupa FY25 financials ...')
  let raw: string
  try {
    raw = await callAgent(token)
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }

  // Save the raw answer (pretty-printed if it is JSON).
  const stamp = new Date().toISOString().slice(0, 10)
  const answerPath = resolve(OUT_DIR, `niva-fy25-financials-${stamp}.json`)
  let toWrite = raw
  try {
    toWrite = JSON.stringify(JSON.parse(raw), null, 2) + '\n'
  } catch {
    /* not JSON — store as-is */
  }
  await writeFile(answerPath, toWrite, 'utf8')
  console.log(`Saved answer: ${answerPath}`)

  // Pull and download the source documents.
  const urls = extractUrls(raw)
  console.log(`Found ${urls.length} source URL(s) in the answer.`)

  const manifest = await loadManifest()
  const known = manifest.files
  const usedNames = new Set<string>(Object.values(known).map((v) => v.filename).filter(Boolean))
  const knownHashes = new Map<string, string>()
  for (const v of Object.values(known)) if (v.sha256) knownHashes.set(v.sha256, v.filename)

  let newCount = 0
  let dupCount = 0
  let failures = 0

  for (const url of urls) {
    if (known[url]) {
      console.log(`  · already have ${url}`)
      continue
    }
    try {
      const buffer = await download(url)
      if (!buffer) throw new Error('all routes blocked or returned non-file')
      const sha256 = createHash('sha256').update(buffer).digest('hex')

      const existing = knownHashes.get(sha256)
      if (existing) {
        known[url] = { filename: existing, url, bytes: buffer.length, sha256, fetched_at: new Date().toISOString() }
        dupCount++
        console.log(`  = duplicate of ${existing} — link recorded, no copy saved`)
        continue
      }

      const name = await uniqueName(deriveFilename(url), usedNames)
      await writeFile(resolve(SOURCES_DIR, name), buffer)
      known[url] = { filename: name, url, bytes: buffer.length, sha256, fetched_at: new Date().toISOString() }
      knownHashes.set(sha256, name)
      newCount++
      console.log(`  + saved: ${name}  (${buffer.length.toLocaleString()} bytes)`)
    } catch (err) {
      failures++
      console.error(`  ! failed: ${url}  (${err instanceof Error ? err.message : String(err)})`)
    }
  }

  await saveManifest(manifest)

  console.log(
    `\nDone. Answer saved. ${newCount} new source file(s); ${dupCount} duplicate(s); ` +
      `${failures} failed. Total tracked: ${Object.keys(known).length}.`,
  )

  // The answer is always saved, so a failed download does not fail the run; we
  // only warn so the log is honest about what could not be fetched.
  if (failures > 0 && newCount === 0) {
    console.error('WARNING: no source documents could be downloaded this run.')
  }
  return 0
}

main().then((code) => {
  process.exitCode = code
})
