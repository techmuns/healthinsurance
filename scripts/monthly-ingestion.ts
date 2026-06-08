// ---------------------------------------------------------------------------
//  Monthly ingestion of IRDAI Non-Life downloadable Excel sheets.
//
//  1. Ask the muns chat agent to scrape https://irdai.gov.in/non-life and
//     return every downloadable Excel link.
//  2. Pull every IRDAI Excel download URL out of the agent's answer.
//  3. Download only the links we have NOT already saved (deduped via a
//     manifest), into the repo-root folder `non-life-monthly/`.
//
//  Getting the file bytes is the hard part: IRDAI returns 403 to requests from
//  GitHub's datacenter IPs (and to plain Node/headless-Chrome from the same
//  range), so a direct download cannot work from a GitHub runner. We therefore
//  fetch each file through a chain of public fetch-relays — each runs on its
//  own (non-blocked) IP, grabs the file from IRDAI, and hands us the bytes.
//  Every download is validated as a real .xlsx (ZIP "PK" magic) before saving,
//  so a relay's HTML error page is never written out as if it were data.
//  A custom relay can be supplied via INGEST_FETCH_PROXY (a URL template with a
//  {url} placeholder); it is tried first.
//
//  Dedup rule: we key on the full download URL. IRDAI bumps the version/
//  timestamp in the URL whenever a sheet is revised, so a revised sheet reads
//  as a *new* link and is saved as a new file; an unchanged link is skipped.
//
//  The access token is read from MUNS_API_TOKEN (a GitHub Actions secret).
// ---------------------------------------------------------------------------

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, resolve, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')
const OUT_DIR = resolve(REPO_ROOT, 'non-life-monthly')
const MANIFEST_PATH = resolve(OUT_DIR, 'manifest.json')

const API_URL = 'https://devde.muns.io/chat/chat-muns'
const TARGET_PAGE = 'https://irdai.gov.in/non-life'
const API_TIMEOUT_MS = 600_000 // the agent scrapes the page live; give it room.
const DOWNLOAD_TIMEOUT_MS = 60_000 // per relay attempt.

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Public fetch-relays, tried in order. Each is a template with a {url}
// placeholder. {url} = URL-encoded target, {raw} = raw target (some relays want
// the URL appended unencoded). A custom INGEST_FETCH_PROXY is prepended at runtime.
const RELAYS: string[] = [
  'https://api.allorigins.win/raw?url={url}',
  'https://corsproxy.io/?url={url}',
  'https://thingproxy.freeboard.io/fetch/{raw}',
  'https://api.codetabs.com/v1/proxy/?quest={url}',
]

// Any IRDAI document download URL, stopping at whitespace / markdown pipes /
// quotes / angle brackets / closing parens.
const URL_RE = /https:\/\/irdai\.gov\.in\/documents\/[^\s)|"'<>]+download=true/g

interface ManifestEntry {
  filename: string
  bytes: number
  fetched_at: string
}
interface Manifest {
  files: Record<string, ManifestEntry>
  updated_at?: string
}

function buildPayload() {
  // The scrape window rolls with the run date so a recurring job always asks
  // over a current 2-year window.
  const today = new Date()
  const from = new Date(today)
  from.setFullYear(from.getFullYear() - 2)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return {
    user_index: 124,
    tasks: [
      'scrape and gimme a link of all downoadable excel sheets on ' +
        'https://irdai.gov.in/non-life',
    ],
    query_context: {
      TICKER_SYMBOL: [],
      FROM_DATE: iso(from),
      TO_DATE: iso(today),
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

/** The <ans>...</ans> section (the curated, deduped list) if present, else all. */
function extractAnswer(text: string): string {
  const m = text.match(/<ans>([\s\S]*?)<\/ans>/)
  return m ? m[1] : text
}

function urlsIn(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of text.matchAll(URL_RE)) {
    const u = m[0]
    if (!seen.has(u)) {
      seen.add(u)
      out.push(u)
    }
  }
  return out
}

/**
 * All IRDAI Excel download URLs from the response, de-duplicated, order
 * preserved. Prefer the curated <ans> list; if that has none (the agent
 * sometimes answers without a clean table), fall back to scanning the whole
 * response — the same links also appear in the <sources> block.
 */
function extractUrls(text: string): string[] {
  const fromAns = urlsIn(extractAnswer(text))
  return fromAns.length > 0 ? fromAns : urlsIn(text)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Call the agent until it returns at least one link. The agent is an LLM and
 * occasionally answers without actually scraping, so we retry a few times
 * before giving up.
 */
async function getLinks(token: string, attempts = 3): Promise<string[]> {
  let urls: string[] = []
  for (let i = 1; i <= attempts; i++) {
    console.log(`Calling agent to scrape ${TARGET_PAGE} (attempt ${i}/${attempts}) ...`)
    const raw = await callAgent(token)
    urls = extractUrls(raw)
    if (urls.length > 0) {
      console.log(`Found ${urls.length} distinct download link(s).`)
      return urls
    }
    // Diagnostic: show how the agent answered when it gave us nothing.
    const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 600)
    console.error(`  no links in response (${raw.length} chars). Head: ${snippet}`)
    if (i < attempts) await sleep(5000)
  }
  return urls
}

/**
 * Build a clean, human-readable .xlsx filename from a download URL. The path
 * segment before the document UUID holds the original filename (URL-encoded,
 * often a Hindi title + ' _ ' + the English title). We decode it, keep up to
 * the first '.xlsx', prefer the English title after ' _ ', and sanitise.
 */
function deriveFilename(url: string): string {
  const parts = new URL(url).pathname.split('/')
  const uuid = parts[parts.length - 1] || ''
  const enc = parts[parts.length - 2] || ''

  let name: string
  try {
    name = decodeURIComponent(enc.replace(/\+/g, ' ')).trim()
  } catch {
    name = enc.replace(/\+/g, ' ').trim()
  }

  const xlsxIdx = name.toLowerCase().indexOf('.xlsx')
  if (xlsxIdx !== -1) name = name.slice(0, xlsxIdx + 5)
  if (name.includes(' _ ')) name = name.split(' _ ').pop()!.trim()

  // Keep word chars, spaces, dash, dot; collapse whitespace.
  name = name.replace(/[^\w\-. ]/g, '').replace(/\s+/g, ' ').trim()

  if (!name.toLowerCase().endsWith('.xlsx')) {
    name = name ? `${name}.xlsx` : `irdai-nonlife-${uuid}.xlsx`
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
  while (used.has(candidate) || (await exists(resolve(OUT_DIR, candidate)))) {
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
    /* no manifest yet / unreadable — start fresh */
  }
  return { files: {} }
}

async function saveManifest(manifest: Manifest): Promise<void> {
  manifest.updated_at = new Date().toISOString()
  // Stable key order so diffs stay readable.
  const ordered: Manifest = { files: {}, updated_at: manifest.updated_at }
  for (const k of Object.keys(manifest.files).sort()) ordered.files[k] = manifest.files[k]
  await writeFile(MANIFEST_PATH, JSON.stringify(ordered, null, 2) + '\n', 'utf8')
}

/** True when the bytes look like a real .xlsx (ZIP container, "PK\x03\x04"). */
function looksLikeXlsx(buf: Buffer): boolean {
  return buf.length > 200 && buf[0] === 0x50 && buf[1] === 0x4b
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

/**
 * Build the ordered list of relay templates to try. A configured "premium"
 * relay (a ScraperAPI key, or a custom INGEST_FETCH_PROXY template) reliably
 * gets past IRDAI's WAF, so when one is present we use only it and skip the
 * built-in public relays (which IRDAI blocks and which just waste time + the
 * free quota). With nothing configured, we fall back to the public relays as a
 * best effort.
 */
function relayTemplates(): { templates: string[]; premium: boolean } {
  const key = (process.env.SCRAPERAPI_KEY || '').trim()
  const custom = (process.env.INGEST_FETCH_PROXY || '').trim()
  const templates: string[] = []
  if (key) {
    // ScraperAPI fetches from an approved (India) IP and returns raw bytes.
    templates.push(`https://api.scraperapi.com/?api_key=${key}&country_code=in&url={url}`)
  }
  if (custom && (custom.includes('{url}') || custom.includes('{raw}'))) templates.push(custom)
  if (templates.length > 0) return { templates, premium: true }
  return { templates: [...RELAYS], premium: false }
}

/**
 * Download an IRDAI .xlsx. Tries a direct fetch first (works from any IP IRDAI
 * doesn't block), then each relay in turn. Returns the validated bytes, or null
 * if every route failed / returned something that isn't a real spreadsheet.
 */
async function downloadXlsx(url: string): Promise<Buffer | null> {
  const enc = encodeURIComponent(url)
  const { templates } = relayTemplates()

  // Direct attempt first.
  const direct = await fetchOnce(url)
  if (direct && looksLikeXlsx(direct)) return direct

  for (const tmpl of templates) {
    const target = tmpl.replace('{url}', enc).replace('{raw}', url)
    const buf = await fetchOnce(target)
    if (buf && looksLikeXlsx(buf)) {
      const via = new URL(tmpl.replace('{url}', '').replace('{raw}', '')).host
      console.log(`    (via ${via})`)
      return buf
    }
  }
  return null
}

async function main(): Promise<number> {
  const token = (process.env.MUNS_API_TOKEN || '').trim()
  if (!token) {
    console.error(
      'ERROR: MUNS_API_TOKEN is not set. Add it as a GitHub Actions secret named MUNS_API_TOKEN.',
    )
    return 1
  }

  await mkdir(OUT_DIR, { recursive: true })
  const manifest = await loadManifest()
  const known = manifest.files

  let urls: string[]
  try {
    urls = await getLinks(token)
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }

  if (urls.length === 0) {
    console.error(
      'ERROR: the agent returned no IRDAI Excel download links after several ' +
        'attempts. Nothing downloaded. Existing files left untouched.',
    )
    return 1
  }

  const usedNames = new Set<string>(
    Object.values(known).map((v) => v.filename).filter(Boolean),
  )
  let newCount = 0
  let failures = 0

  for (const url of urls) {
    if (known[url]) continue // already have this exact link — skip.
    const name = await uniqueName(deriveFilename(url), usedNames)
    const dest = resolve(OUT_DIR, name)
    try {
      const buffer = await downloadXlsx(url)
      if (!buffer) throw new Error('all routes blocked or returned non-xlsx')
      await writeFile(dest, buffer)
      known[url] = {
        filename: name,
        bytes: buffer.length,
        fetched_at: new Date().toISOString(),
      }
      newCount++
      console.log(`  + saved: ${name}  (${buffer.length.toLocaleString()} bytes)`)
    } catch (err) {
      failures++
      usedNames.delete(name)
      console.error(`  ! failed: ${name}  (${err instanceof Error ? err.message : String(err)})`)
    }
  }

  await saveManifest(manifest)

  console.log(
    `\nDone. ${newCount} new file(s) saved; ${urls.length - newCount} already had / skipped. ` +
      `Total tracked: ${Object.keys(known).length}.`,
  )

  // Loud failure: links were found but NONE could be downloaded — every direct
  // attempt + every public relay was blocked or returned a non-xlsx. Fail the
  // run so it doesn't look green while doing nothing. The fix is a working
  // relay: set INGEST_FETCH_PROXY to a relay URL template with a {url} placeholder.
  if (newCount === 0 && failures > 0) {
    const hasKey = !!(process.env.SCRAPERAPI_KEY || process.env.INGEST_FETCH_PROXY || '').trim()
    console.error(
      hasKey
        ? '\nERROR: found links but downloaded nothing — the configured relay ' +
            '(SCRAPERAPI_KEY / INGEST_FETCH_PROXY) did not return valid .xlsx files. ' +
            'Check the key is valid and has quota.'
        : '\nERROR: found links but downloaded nothing — IRDAI blocks direct + public ' +
            'relays from GitHub IPs. Add a free SCRAPERAPI_KEY repo secret ' +
            '(scraperapi.com) and the monthly job will download every file automatically.',
    )
    return 1
  }
  return 0
}

main().then((code) => {
  process.exitCode = code
})
