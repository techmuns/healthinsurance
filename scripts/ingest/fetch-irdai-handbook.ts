// ---------------------------------------------------------------------------
//  IRDAI "Handbook on Indian Insurance Statistics" downloader — robust, for the
//  big segment-wise GDPI history PDFs that the agent's CORS relays corrupted.
//
//  Why this exists: the muns-agent download path routes large files through
//  small-payload CORS relays (allorigins / corsproxy / …) which TRUNCATE or
//  garble 10-15 MB PDFs (pdf-parse then dies with "Bad FCHECK in flate stream").
//  IRDAI also 403s the datacenter runner on a direct hit. So we stream each file
//  through ScraperAPI's India-IP PROXY mode (transparent byte passthrough, good
//  for binaries) and VALIDATE completeness before saving:
//    • Content-Length must match the bytes received (no truncation), and
//    • a .pdf must start with %PDF and parse with a sane page count.
//  A file that fails validation is NOT written — we never ingest a corrupt copy.
//
//  Output: data/raw/irdai/<edition>.pdf|.zip  (+ manifest.json).
//  Run:  SCRAPERAPI_KEY=... npx tsx scripts/ingest/fetch-irdai-handbook.ts
// ---------------------------------------------------------------------------

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { ProxyAgent, type Dispatcher } from 'undici'
// pdf-parse validates that a downloaded PDF is complete & readable.
import pdfParse from 'pdf-parse'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const OUT_DIR = resolve(REPO, 'data/raw/irdai')
const MANIFEST = resolve(OUT_DIR, 'manifest.json')

interface Target { edition: string; fy: string; ext: 'pdf' | 'zip'; url: string }

// IRDAI Handbook editions. Each edition reports its own FY plus the prior-year
// comparative, so together they cover the segment-wise GDPI history FY15-FY23.
const TARGETS: Target[] = [
  { edition: 'handbook-2014-15', fy: 'FY15', ext: 'pdf', url: 'https://irdai.gov.in/documents/37343/825690/HANDBOOK+ON+INDIAN+INSURANCE+STATISTICS+2014-15.pdf/441d1a66-6639-b339-2aeb-9c7381891d4a?version=2.2&t=1665049920830&download=true' },
  { edition: 'handbook-2015-16', fy: 'FY16', ext: 'pdf', url: 'https://irdai.gov.in/documents/37343/825690/HANDBOOK+ON+INDIAN+INSURANCE+STATISTICS+2015-16%2C+Mar+2017.pdf/b63e4f73-6dba-a167-77fd-b3a9a819fa3c?version=2.3&t=1665049918208&download=true' },
  { edition: 'handbook-2016-17', fy: 'FY17', ext: 'pdf', url: 'https://irdai.gov.in/documents/37343/825690/%E0%A4%AD%E0%A4%BE%E0%A4%B0%E0%A4%A4%E0%A5%80%E0%A4%AF+%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE+%E0%A4%B8%E0%A4%BE%E0%A4%82%E0%A4%96%E0%A5%8D%E0%A4%AF%E0%A4%BF%E0%A4%95%E0%A5%80+2016-17+%E0%A4%AA%E0%A4%B0+%E0%A4%AA%E0%A5%81%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A4%BF%E0%A4%95%E0%A4%BE+_+HANDBOOK+ON+INDIAN+INSURANCE+STATISTICS+2016-17.pdf/1dff63ad-6054-1be5-b98a-f420cf0e150d?version=2.4&t=1685004838497&download=true' },
  { edition: 'handbook-2018-19', fy: 'FY19', ext: 'pdf', url: 'https://irdai.gov.in/documents/37343/825690/HANDBOOK+ON+INDIAN+INSURANCE+STATISTICS+FY+2018-19.pdf/732d6395-68f3-75ae-b5c3-3be8cccada1b?version=2.7&t=1665049905447&download=true' },
  { edition: 'handbook-2019-20', fy: 'FY20', ext: 'pdf', url: 'https://irdai.gov.in/documents/37343/825690/HANDBOOK+ON+INDIAN+INSURANCE+STATISTICS+FY+2019-20.pdf/f8b208fa-5ab1-0b98-e620-1b60b9f747e5?version=2.1&t=1665049899966&download=true' },
  { edition: 'handbook-2020-21', fy: 'FY21', ext: 'zip', url: 'https://irdai.gov.in/documents/37343/825690/HANDBOOK+ON+INDIAN+INSURANCE+STATISTICS+F.Y.+2020-21.zip/03ba7334-01d7-1739-32cc-12e75a098022?version=1.1&t=1665049909969&download=true' },
  { edition: 'handbook-2021-22', fy: 'FY22', ext: 'zip', url: 'https://irdai.gov.in/documents/37343/825690/%E0%A4%AD%E0%A4%BE%E0%A4%B0%E0%A4%A4%E0%A5%80%E0%A4%AF+%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE+%E0%A4%B8%E0%A4%BE%E0%A4%82%E0%A4%96%E0%A5%8D%E0%A4%AF%E0%A4%BF%E0%A4%95%E0%A5%80+2021-22+%E0%A4%AA%E0%A4%B0+%E0%A4%AA%E0%A5%81%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A4%BF%E0%A4%95%E0%A4%BE+_+Handbook+on+Indian+Insurance+Statistics+2021-22.zip/1fb61ca6-d2d3-5100-6218-a2108b224762?version=1.2&t=1685004848159&download=true' },
  { edition: 'handbook-2022-23', fy: 'FY23', ext: 'zip', url: 'https://irdai.gov.in/documents/37343/825690/%E0%A4%AD%E0%A4%BE%E0%A4%B0%E0%A4%A4%E0%A5%80%E0%A4%AF+%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE+%E0%A4%B8%E0%A4%BE%E0%A4%82%E0%A4%96%E0%A5%8D%E0%A4%AF%E0%A4%BF%E0%A4%95%E0%A5%80+2022-23+%E0%A4%AA%E0%A4%B0+%E0%A4%AA%E0%A5%81%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A4%BF%E0%A4%95%E0%A4%BE+_+Handbook+on+Indian+Insurance+Statistics+2022-23.zip/665fa6b4-dc4e-e2f3-9b21-f1c5ba8f5a6b?version=2.0&t=1710157936828&download=true' },
]

const NAV_TIMEOUT_MS = 240_000
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const PDF_MAGIC = Buffer.from('%PDF-')
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]) // PK\x03\x04

function proxyDispatcher(): Dispatcher | undefined {
  const key = (process.env.SCRAPERAPI_KEY || process.env.SCRAPER_KEY || '').trim()
  if (!key) return undefined
  // ScraperAPI proxy mode: India IP, transparent byte passthrough (good for big binaries).
  return new ProxyAgent({ uri: `http://scraperapi.country_code=in:${key}@proxy-server.scraperapi.com:8001`, requestTls: { rejectUnauthorized: false } })
}

interface DLResult { buf: Buffer; declared: number | null }
async function download(url: string, dispatcher: Dispatcher | undefined): Promise<DLResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), NAV_TIMEOUT_MS)
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': BROWSER_UA, Accept: '*/*' }, signal: ctrl.signal, ...(dispatcher ? { dispatcher } : {}) } as RequestInit)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const cl = res.headers.get('content-length')
    const buf = Buffer.from(await res.arrayBuffer())
    return { buf, declared: cl ? Number(cl) : null }
  } finally { clearTimeout(timer) }
}

async function validate(t: Target, r: DLResult): Promise<string | null> {
  // null = OK; a string = the reason it's rejected.
  if (r.buf.length < 100_000) return `too small (${r.buf.length} bytes)`
  if (r.declared !== null && r.declared !== r.buf.length) return `truncated: got ${r.buf.length} of ${r.declared} bytes`
  if (t.ext === 'pdf') {
    if (!r.buf.subarray(0, 1024).includes(PDF_MAGIC)) return 'not a PDF (no %PDF header)'
    try {
      const parsed = await pdfParse(r.buf)
      if (!parsed.numpages || parsed.numpages < 20) return `parsed but only ${parsed.numpages} pages`
      if ((parsed.text || '').length < 5000) return `parsed but text too short (${(parsed.text || '').length} chars)`
    } catch (e) { return `pdf-parse failed: ${e instanceof Error ? e.message : String(e)}` }
  } else {
    if (!r.buf.subarray(0, 4).equals(ZIP_MAGIC)) return 'not a ZIP (no PK header)'
  }
  return null
}

async function loadManifest(): Promise<Record<string, unknown>> {
  if (!existsSync(MANIFEST)) return {}
  try { return JSON.parse(await readFile(MANIFEST, 'utf8')) } catch { return {} }
}

async function main(): Promise<number> {
  const filter = (process.env.EDITION || '').trim()
  const targets = filter ? TARGETS.filter((t) => t.edition === filter || t.fy === filter) : TARGETS
  const dispatcher = proxyDispatcher()
  console.log(`fetch-irdai-handbook: ${targets.length} target(s); route=${dispatcher ? 'ScraperAPI India proxy' : 'DIRECT (no SCRAPERAPI_KEY — likely 403)'}`)
  await mkdir(OUT_DIR, { recursive: true })
  const manifest = (await loadManifest()) as Record<string, { filename: string; bytes: number; sha256: string; pages?: number; fetched_at: string }>
  let ok = 0, fail = 0
  for (const t of targets) {
    const name = `${t.edition}.${t.ext}`
    try {
      console.log(`  ↓ ${t.fy} ${t.edition} …`)
      let r = await download(t.url, dispatcher)
      let why = await validate(t, r)
      if (why && dispatcher) {
        // one retry — transient proxy hiccups truncate occasionally
        console.log(`    retry (${why})`)
        r = await download(t.url, dispatcher)
        why = await validate(t, r)
      }
      if (why) { fail++; console.error(`    ✗ rejected: ${why} — NOT saved`); continue }
      await writeFile(resolve(OUT_DIR, name), r.buf)
      const sha256 = createHash('sha256').update(r.buf).digest('hex')
      let pages: number | undefined
      if (t.ext === 'pdf') { try { pages = (await pdfParse(r.buf)).numpages } catch { /* already validated */ } }
      manifest[t.url] = { filename: name, bytes: r.buf.length, sha256, pages, fetched_at: new Date().toISOString() }
      ok++
      console.log(`    ✓ saved ${name} (${r.buf.length.toLocaleString()} bytes${pages ? `, ${pages} pages` : ''})`)
    } catch (e) { fail++; console.error(`    ✗ ${t.edition}: ${e instanceof Error ? e.message : String(e)}`) }
  }
  await writeFile(MANIFEST, JSON.stringify({ updated_at: new Date().toISOString(), files: manifest }, null, 2) + '\n')
  console.log(`fetch-irdai-handbook: ${ok} saved, ${fail} failed.`)
  return 0 // "nothing valid" is not a hard failure for the scheduled run
}

main().then((c) => { process.exitCode = c }).catch((e) => { console.error('fetch-irdai-handbook error:', e); process.exitCode = 1 })
