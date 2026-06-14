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

// Canonical public-disclosures page per insurer — where IRDAI mandates each
// insurer publish its NL returns (the statutory source for NWP/NEP/EoM/net worth/
// investments). Passed in the agent's `urls` (the integrated document-reading
// path) so the AUTOMATED sweep opens and reads the source instead of only
// web-searching for it. Mirrors company-master financial_disclosure_url.
const DISCLOSURE_DOCS: Record<string, string> = {
  'niva-bupa': 'https://transactions.nivabupa.com/pages/investor-relations.aspx',
  'star-health': 'https://www.starhealth.in/investors/financial-information/',
  'care-health': 'https://cms.careinsurance.com/cms/public/public_disclosure',
  'aditya-birla': 'https://www.adityabirlacapital.com/healthinsurance/about-us/financials',
  manipalcigna: 'https://www.manipalcigna.com/disclosures/financial-disclosures',
}

const COMPANY_ID = (process.env.FETCH_COMPANY_ID || '').trim()
const PERIOD = (process.env.FETCH_PERIOD || 'FY25').trim()
// The period is free-text (it can carry steering hints), so it must NEVER reach a
// filesystem path verbatim — a '/' or '&' in it previously crashed the run with
// ENOENT. Slugify for any path use; the human-readable PERIOD stays for the query.
const PERIOD_SLUG = (PERIOD.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'period').slice(0, 60)
const COMPANY_NAME = COMPANIES[COMPANY_ID]

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')
const OUT_DIR = resolve(REPO_ROOT, 'data/agent-pulls/sahi-financials', COMPANY_ID || 'unknown')
const SOURCES_DIR = resolve(OUT_DIR, 'sources')
const MANIFEST_PATH = resolve(SOURCES_DIR, 'manifest.json')

const API_URL = process.env.MUNS_AGENT_URL || 'https://devde.muns.io/chat/chat-muns'
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

// Describe the requested period in plain terms + the right source/basis guidance.
// Annual (FY26) → full-year, year ended 31 Mar; interim (H1/9M/Q1-3/Q4) →
// the CUMULATIVE period-to-date figure that the interim deck reports.
function periodSpec(period: string): { kind: 'annual' | 'interim'; ended: string; phrase: string; guidance: string } {
  const yy = Number((period.match(/\d+/) || ['0'])[0]) // FY26 -> 26
  const endCal = 2000 + yy
  const m = /^(FY|H1|H2|9M|Q[1-4])/i.exec(period)
  const tag = (m ? m[1] : 'FY').toUpperCase()
  // End date of the cumulative window within the fiscal year (FY ends 31 Mar).
  const ENDS: Record<string, string> = {
    Q1: `30 June ${endCal - 1}`, H1: `30 September ${endCal - 1}`, Q2: `30 September ${endCal - 1}`,
    '9M': `31 December ${endCal - 1}`, Q3: `31 December ${endCal - 1}`, Q4: `31 March ${endCal}`, FY: `31 March ${endCal}`,
  }
  const NAMES: Record<string, string> = {
    Q1: 'first quarter (Q1, 3 months)', H1: 'first half (H1, 6 months)', Q2: 'first half (H1, 6 months)',
    '9M': 'nine months (9M)', Q3: 'nine months (9M)', Q4: 'full year', FY: 'full year',
  }
  const ended = ENDS[tag] ?? `31 March ${endCal}`
  if (tag === 'FY' || tag === 'Q4') {
    return { kind: 'annual', ended, phrase: `the full year ended ${ended}`,
      guidance: `use the company's FULL-YEAR source for ${period} — the Q4 / annual earnings presentation or the annual report for the year ended ${ended}. Do NOT use a part-year H1 / 9M / Q1-Q3 figure as the full-year value.` }
  }
  return { kind: 'interim', ended, phrase: `the ${NAMES[tag]} ended ${ended} (period-to-date / cumulative for ${period})`,
    guidance: `use the company's INTERIM investor presentation / results for ${period} (e.g. "Investor Presentation ${period}") for the headline GWP / PAT / ratios, AND the company's IRDAI quarterly public disclosures (the "NL" return set for ${period}) for the statutory line items the deck omits (NWP, NEP, Expense of Management, Net worth, Investments). Report the CUMULATIVE period-to-date figure (year-to-date within the fiscal year), NOT a single standalone quarter — except Q1, which is the first quarter alone. Premium / PAT must be the cumulative ${NAMES[tag]} value; ratios are the period's reported ratios.` }
}

function buildPayload() {
  const ps = periodSpec(PERIOD)
  const docLine = DOC_URL
    ? `PRIMARY SOURCE — open and READ this exact document, and take the values from it: ${DOC_URL}\n` +
      `It is the ${ps.kind === 'annual' ? 'full-year statutory / financial-results' : 'interim / quarterly results'} document for ${PERIOD}. Extract the figures from this PDF.\n\n`
    : ''
  const task =
    docLine +
    `Pull the following financial data for ${COMPANY_NAME}, for ${PERIOD} — ${ps.phrase}.\n\n` +
    'Return it as a table with exactly these columns, in this order:\n\n' +
    'company | period | line_item | basis | value | unit | source_name | source_url | filing_date\n\n' +
    'Rules\n\nOne row per line item.\n' +
    `period = ${PERIOD} for all rows. These MUST be the figures for ${ps.phrase}.\n` +
    'basis = IGAAP, IFRS, or — (use the value shown for each line item below).\n' +
    'value = the number only (no commas, no unit inside the cell). If a line item is not published, leave value blank — do not put 0 or an estimate.\n' +
    'unit = exactly as specified per line below (INR_crore, %, or x).\n' +
    'source_name = the exact document (e.g. "<Company> FY24-25 Annual Report, p.XX" or "Investor Presentation Q4 FY26").\n' +
    'source_url = direct link to that document. filing_date = date of the source document, YYYY-MM-DD.\n' +
    `IMPORTANT: ${ps.guidance} ` +
    'For GWP, prefer the 1/n (statutory) basis where both are shown; if only the ex-1/n figure is given, leave the GWP value blank rather than mixing bases. ' +
    'Open the actual PDF and read the figures; if a figure is genuinely not published, leave value blank.\n\n' +
    // The interim investor decks carry headline GWP / PAT / ratios but routinely
    // OMIT the statutory line items (NWP, NEP, expense-of-management, net worth,
    // investments). Those live in the IRDAI quarterly PUBLIC DISCLOSURES — the
    // "NL" return set every insurer (listed or not) files each quarter on its own
    // site and on the IRDAI portal. Directing the agent there is what closes the
    // per-quarter line-item gaps the decks can't.
    'SOURCING THE STATUTORY LINE ITEMS — for Net Written Premium, Net Earned Premium, ' +
    'Expense of Management, Net worth and Investments/AUM, if the investor deck does not show them, ' +
    'read the company\'s IRDAI QUARTERLY PUBLIC DISCLOSURES (the "NL" return set) for this period: ' +
    'NL-1 (Revenue Account) carries Net Written Premium and Net Earned Premium; the expenses schedule / NL-2 carries Expense of Management; ' +
    'the Balance Sheet carries Net worth (shareholders\' funds) and Investments. ' +
    'Every insurer files these every quarter on its website and on the IRDAI portal — they are the STATUTORY IGAAP figures, ' +
    'so prefer them for the IGAAP cells over any IFRS-basis headline. Cite the exact NL disclosure PDF in source_url.\n\n' +
    'The line items (line_item | basis | unit):\n\n' +
    'Total GWP | IGAAP | INR_crore\nRetail health GWP | IGAAP | INR_crore\nNet Written Premium (NWP) | IGAAP | INR_crore\nNet Earned Premium (NEP) | IGAAP | INR_crore\n' +
    'Profit After Tax (PAT) | IGAAP | INR_crore\nProfit After Tax (PAT) | IFRS | INR_crore\n' +
    'Claims ratio | IGAAP | %\nClaims ratio | IFRS | %\nExpense ratio | IGAAP | %\nExpense of Management (EoM) ratio | IGAAP | %\nCommission ratio | IGAAP | %\nCombined ratio | IGAAP | %\n' +
    'Solvency ratio | — | x\nNet worth (shareholders\' equity) | IGAAP | INR_crore\n' +
    'Retail health market share | — | %\nAssets Under Management (AUM) | — | INR_crore\nInvestment yield | — | %\n\n' +
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
    // Integrated document-reading path: hand the agent the exact docs to open —
    // a manually-dispatched DOC_URL first, then the insurer's public-disclosures
    // page (NL returns). Deduped, non-empty. WEB_SEARCH stays on as a fallback.
    autoAddUpcoming: false, urls: [...new Set([DOC_URL, DISCLOSURE_DOCS[COMPANY_ID]].filter(Boolean))],
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
  const answerPath = resolve(OUT_DIR, `${COMPANY_ID}-${PERIOD_SLUG}-${stamp}.json`)
  // Guard: an empty / blank agent reply must NOT be written — a 0-byte file would
  // clobber a prior good pull and commit an empty artifact. Keep what we have.
  if (!raw || !raw.trim()) {
    console.error('WARNING: agent returned an empty answer — not writing (any prior pull is preserved).')
  } else {
    let toWrite = raw; try { toWrite = JSON.stringify(JSON.parse(raw), null, 2) + '\n' } catch { /* not JSON */ }
    await writeFile(answerPath, toWrite, 'utf8')
    console.log(`Saved answer: ${answerPath}`)
  }

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
