// ---------------------------------------------------------------------------
//  SAHI per-company financials pull via the muns chat agent (one company at a
//  time). Generalises scripts/ingest/niva-fy25-financials.ts to any standalone
//  health insurer, driven by FETCH_COMPANY_ID (+ optional FETCH_PERIOD).
//
//  Asks the agent for the company's premium / profitability / ratio line items
//  for the requested fiscal year, each row carrying a source-document URL, then
//  saves the raw answer + downloads the source files. Token from MUNS_API_TOKEN.
//
//  Usage (env): FETCH_COMPANY_ID=star-health [FETCH_PERIOD=FY25] npx tsx \
//                 scripts/ingest/sahi-financials-agent.ts
// ---------------------------------------------------------------------------

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, resolve, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const COMPANIES: Record<string, string> = {
  'niva-bupa': 'Niva Bupa Health Insurance Ltd',
  'star-health': 'Star Health and Allied Insurance Ltd',
  'care-health': 'Care Health Insurance Ltd',
  'aditya-birla': 'Aditya Birla Health Insurance Co Ltd',
  manipalcigna: 'ManipalCigna Health Insurance Co Ltd',
}

const COMPANY_ID = (process.env.FETCH_COMPANY_ID || '').trim()
const PERIOD = (process.env.FETCH_PERIOD || 'FY25').trim()
const COMPANY_NAME = COMPANIES[COMPANY_ID]

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')
const OUT_DIR = resolve(REPO_ROOT, 'data/agent-pulls/sahi-financials', COMPANY_ID || 'unknown')
const SOURCES_DIR = resolve(OUT_DIR, 'sources')
const MANIFEST_PATH = resolve(SOURCES_DIR, 'manifest.json')

const API_URL = 'https://devde.muns.io/chat/chat-muns'
const API_TIMEOUT_MS = 600_000
const DOWNLOAD_TIMEOUT_MS = 60_000
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const RELAYS = [
  'https://api.allorigins.win/raw?url={url}',
  'https://corsproxy.io/?url={url}',
  'https://thingproxy.freeboard.io/fetch/{raw}',
  'https://api.codetabs.com/v1/proxy/?quest={url}',
]
const URL_RE = /https?:\/\/[^\s)|"'<>\]]+/g

interface ManifestEntry { filename: string; url: string; bytes: number; sha256: string; fetched_at: string }
interface Manifest { files: Record<string, ManifestEntry>; updated_at?: string }

const DOC_URL = (process.env.FETCH_DOC_URL || '').trim()

function buildPayload() {
  const fyEndYear = 2000 + Number((PERIOD.match(/\d+/) || ['0'])[0]) // FY26 -> 2026
  const docLine = DOC_URL
    ? `PRIMARY SOURCE — open and READ this exact document, and take the values from it: ${DOC_URL}\n` +
      'It is the full-year statutory / financial-results document for this fiscal year. Extract the figures from this PDF.\n\n'
    : ''
  const task =
    docLine +
    `Pull the following FULL-YEAR financial data for ${COMPANY_NAME}, for the financial year ${PERIOD} (the full year ended 31 March ${fyEndYear}).\n\n` +
    'Return it as a table with exactly these columns, in this order:\n\n' +
    'company | period | line_item | basis | value | unit | source_name | source_url | filing_date\n\n' +
    'Rules\n\nOne row per line item.\n' +
    `period = ${PERIOD} for all rows. These MUST be FULL-YEAR (annual) figures for the year ended 31 March ${fyEndYear}.\n` +
    'basis = IGAAP, IFRS, or — (use the value shown for each line item below).\n' +
    'value = the number only (no commas, no unit inside the cell). If a line item is not published, leave value blank — do not put 0 or an estimate.\n' +
    'unit = exactly as specified per line below (INR_crore, %, or x).\n' +
    'source_name = the exact document (e.g. "<Company> FY24-25 Annual Report, p.XX" or "Investor Presentation Q4 FY26").\n' +
    'source_url = direct link to that document. filing_date = date of the source document, YYYY-MM-DD.\n' +
    `IMPORTANT: use the company's FULL-YEAR source for ${PERIOD} — the Q4 / annual earnings presentation (e.g. "Earnings Presentation Q4 ${PERIOD}") or the annual report for the year ended 31 March ${fyEndYear}. ` +
    'Do NOT use interim H1 / 9M / Q1 / Q2 / Q3 presentations — those are part-year and must not be used as the full-year value. ' +
    'Open the actual PDF and read the figures; if the full-year figure is genuinely not published yet, leave value blank.\n\n' +
    'The line items (line_item | basis | unit):\n\n' +
    'Total GWP | IGAAP | INR_crore\nNet Written Premium (NWP) | IGAAP | INR_crore\nNet Earned Premium (NEP) | IGAAP | INR_crore\n' +
    'Profit After Tax (PAT) | IGAAP | INR_crore\nProfit After Tax (PAT) | IFRS | INR_crore\n' +
    'Claims ratio | IGAAP | %\nClaims ratio | IFRS | %\nExpense ratio | IGAAP | %\nCommission ratio | IGAAP | %\nCombined ratio | IGAAP | %\n' +
    'Solvency ratio | — | x\nNet worth (shareholders\' equity) | IGAAP | INR_crore\n\n' +
    `Example row:\n${COMPANY_NAME}\t${PERIOD}\tTotal GWP\tIGAAP\t12345\tINR_crore\t<Company> FY24-25 Annual Report, p.XX\thttps://…\t2025-05-XX`
  return {
    user_index: 124,
    tasks: [task],
    query_context: {
      TICKER_SYMBOL: [], FROM_DATE: '2024-06-09', TO_DATE: '2026-06-09', ANNOUNCEMENT_FORM_TYPE: 'all',
      DOCUMENT_IDS: [], CATEGORIES: [], WEB_SEARCH_ENABLED: true, COUNTRY: [],
      CONTEXT_EMAIL: 'nadamsaluja@gmail.com', CONTEXT_COMPANY_NAME: [], GET_ANNOUNCEMENTS_ENABLED: false,
      chatHistory: [], mode: 'fast',
    },
    autoAddUpcoming: false, urls: DOC_URL ? [DOC_URL] : [],
  }
}

async function callAgent(token: string): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { accept: '*/*', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload()), signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`agent call failed: HTTP ${res.status} ${res.statusText}`)
    return await res.text()
  } finally { clearTimeout(timer) }
}

function extractAnswer(t: string): string { const m = t.match(/<ans>([\s\S]*?)<\/ans>/); return m ? m[1] : t }
function urlsIn(text: string): string[] {
  const seen = new Set<string>(); const out: string[] = []
  for (const m of text.matchAll(URL_RE)) {
    const u = m[0].replace(/[.,;]+$/, '')
    if (u.includes('devde.muns.io') || u.includes('…') || u.includes('XX')) continue
    if (!seen.has(u)) { seen.add(u); out.push(u) }
  }
  return out
}
function extractUrls(t: string): string[] { const a = urlsIn(extractAnswer(t)); return a.length ? a : urlsIn(t) }
function deriveFilename(url: string): string {
  let p: string; try { p = new URL(url).pathname } catch { p = url }
  let n = decodeURIComponent(p.split('/').filter(Boolean).pop() || '').split('?')[0].replace(/[^\w\-. ]/g, '').replace(/\s+/g, ' ').trim()
  if (!n) n = `source-${createHash('sha1').update(url).digest('hex').slice(0, 10)}`
  return n
}
async function exists(p: string): Promise<boolean> { try { await access(p); return true } catch { return false } }
async function uniqueName(name: string, used: Set<string>): Promise<string> {
  const ext = extname(name), base = basename(name, ext); let c = name, i = 2
  while (used.has(c) || (await exists(resolve(SOURCES_DIR, c)))) { c = `${base}-${i}${ext}`; i++ }
  used.add(c); return c
}
async function loadManifest(): Promise<Manifest> {
  try { const d = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')); if (d?.files) return d as Manifest } catch { /* fresh */ }
  return { files: {} }
}
async function saveManifest(m: Manifest): Promise<void> {
  m.updated_at = new Date().toISOString()
  const o: Manifest = { files: {}, updated_at: m.updated_at }
  for (const k of Object.keys(m.files).sort()) o.files[k] = m.files[k]
  await writeFile(MANIFEST_PATH, JSON.stringify(o, null, 2) + '\n', 'utf8')
}
function looksLikeRealFile(buf: Buffer): boolean {
  if (buf.length < 512) return false
  const h = buf.slice(0, 64).toString('latin1').trim().toLowerCase()
  return !(h.startsWith('<!doctype html') || h.startsWith('<html'))
}
async function fetchOnce(target: string): Promise<Buffer | null> {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    const res = await fetch(target, { redirect: 'follow', headers: { 'User-Agent': BROWSER_UA, Accept: '*/*' }, signal: ctrl.signal })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch { return null } finally { clearTimeout(timer) }
}
function relayTemplates(): string[] {
  const key = (process.env.SCRAPERAPI_KEY || '').trim(), custom = (process.env.INGEST_FETCH_PROXY || '').trim()
  const t: string[] = []
  if (key) t.push(`https://api.scraperapi.com/?api_key=${key}&url={url}`)
  if (custom && (custom.includes('{url}') || custom.includes('{raw}'))) t.push(custom)
  return t.length ? t : [...RELAYS]
}
async function download(url: string): Promise<Buffer | null> {
  const d = await fetchOnce(url); if (d && looksLikeRealFile(d)) return d
  const enc = encodeURIComponent(url)
  for (const tmpl of relayTemplates()) {
    const buf = await fetchOnce(tmpl.replace('{url}', enc).replace('{raw}', url))
    if (buf && looksLikeRealFile(buf)) return buf
  }
  return null
}

async function main(): Promise<number> {
  if (!COMPANY_NAME) { console.error(`ERROR: FETCH_COMPANY_ID must be one of: ${Object.keys(COMPANIES).join(', ')}`); return 1 }
  const token = (process.env.MUNS_API_TOKEN || '').trim()
  if (!token) { console.error('ERROR: MUNS_API_TOKEN is not set.'); return 1 }
  await mkdir(SOURCES_DIR, { recursive: true })

  console.log(`Calling chat-muns for ${COMPANY_NAME} ${PERIOD} financials ...`)
  let raw: string
  try { raw = await callAgent(token) } catch (e) { console.error(`ERROR: ${e instanceof Error ? e.message : String(e)}`); return 1 }

  const stamp = new Date().toISOString().slice(0, 10)
  const answerPath = resolve(OUT_DIR, `${COMPANY_ID}-${PERIOD}-${stamp}.json`)
  let toWrite = raw; try { toWrite = JSON.stringify(JSON.parse(raw), null, 2) + '\n' } catch { /* not JSON */ }
  await writeFile(answerPath, toWrite, 'utf8')
  console.log(`Saved answer: ${answerPath}`)

  // Always download the explicit DOC_URL (if given) so we have the source PDF to
  // parse locally, independent of whether the agent extracted from it.
  const urls = [...(DOC_URL ? [DOC_URL] : []), ...extractUrls(raw)]
  console.log(`Found ${urls.length} source URL(s).`)
  const manifest = await loadManifest()
  const known = manifest.files
  const usedNames = new Set<string>(Object.values(known).map((v) => v.filename).filter(Boolean))
  const knownHashes = new Map<string, string>()
  for (const v of Object.values(known)) if (v.sha256) knownHashes.set(v.sha256, v.filename)
  let newCount = 0, dupCount = 0, failures = 0
  for (const url of urls) {
    if (known[url]) { console.log(`  · already have ${url}`); continue }
    try {
      const buffer = await download(url); if (!buffer) throw new Error('all routes blocked')
      const sha256 = createHash('sha256').update(buffer).digest('hex')
      const existing = knownHashes.get(sha256)
      if (existing) { known[url] = { filename: existing, url, bytes: buffer.length, sha256, fetched_at: new Date().toISOString() }; dupCount++; continue }
      const name = await uniqueName(deriveFilename(url), usedNames)
      await writeFile(resolve(SOURCES_DIR, name), buffer)
      known[url] = { filename: name, url, bytes: buffer.length, sha256, fetched_at: new Date().toISOString() }
      knownHashes.set(sha256, name); newCount++; console.log(`  + saved: ${name} (${buffer.length.toLocaleString()} bytes)`)
    } catch (e) { failures++; console.error(`  ! failed: ${url} (${e instanceof Error ? e.message : String(e)})`) }
  }
  await saveManifest(manifest)
  console.log(`\nDone. ${newCount} new file(s); ${dupCount} dup(s); ${failures} failed.`)
  return 0
}

main().then((c) => { process.exitCode = c })
