// ---------------------------------------------------------------------------
//  Rendered-page fetcher — for investor pages whose document lists are built by
//  JavaScript AFTER load (so the raw-HTML fetchers see an empty shell). This one
//  opens each page in a real headless browser, lets the JS run, then discovers
//  and downloads the document links (PDF / ashx) itself — so NEW filings each
//  period are picked up automatically, with no manual link-pasting.
//
//  Routes through ScraperAPI's India IP in proxy mode (SCRAPER_KEY) so the
//  insurer sites don't 403 the datacenter runner. Per-page failures are logged
//  and skipped — one blocked page never fails the whole run.
//
//  Output: new PDFs land in data/raw/companies/<id>/ (the same place the audit
//  parsers read), with a manifest at data/raw/rendered/manifest.json.
//
//  Run:  COMPANY=star-health npx tsx scripts/ingest/fetch-rendered.ts   (blank = all)
// ---------------------------------------------------------------------------

import { chromium, type Browser, type BrowserContext } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')

interface Target {
  company_id: string
  /** JS-rendered investor pages whose document links we want to discover. */
  pages: string[]
  /** Only keep discovered links whose URL or link-text matches this. */
  keep?: RegExp
}

// JS-locked investor pages, by company. Extend freely — the engine is generic.
const TARGETS: Target[] = [
  {
    company_id: 'star-health',
    pages: [
      'https://www.starhealth.in/investors/financial-information-debt-and-equity/',
      'https://www.starhealth.in/investors/financial-information/',
    ],
    keep: /ind[\s-]?as|financial|disclosure|statement|annual|revenue|balance/i,
  },
]

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const NAV_TIMEOUT_MS = 60_000
const PDF_MAGIC = Buffer.from('%PDF-')

function looksLikePdf(buf: Buffer): boolean {
  return buf.length > 1024 && buf.subarray(0, 1024).includes(PDF_MAGIC)
}

/** Proxy config for ScraperAPI's India-IP proxy mode, when SCRAPER_KEY is set. */
function proxyConfig(): { server: string; username: string; password: string } | undefined {
  const key = (process.env.SCRAPERAPI_KEY || process.env.SCRAPER_KEY || '').trim()
  if (!key) return undefined
  return { server: 'http://proxy-server.scraperapi.com:8001', username: 'scraperapi.country_code=in', password: key }
}

function deriveFilename(company: string, url: string): string {
  const base = decodeURIComponent(url.split('?')[0].split('/').pop() || 'document.pdf')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const named = /\.pdf$/i.test(base) ? base : `${base}.pdf`
  return named.startsWith(company) ? named : `${company}-${named}`
}

interface ManifestEntry { company_id: string; url: string; filename: string; bytes: number; sha256: string; discovered_at: string }
async function loadManifest(p: string): Promise<Record<string, ManifestEntry>> {
  if (!existsSync(p)) return {}
  try { return JSON.parse(await readFile(p, 'utf8')).files ?? {} } catch { return {} }
}

interface Discovered { href: string; text: string }
interface PageScan { title: string; bodyLen: number; allLinks: Discovered[]; apiHits: string[] }
// SPA data calls worth surfacing — the document list usually arrives via one of
// these, with the real PDF URLs inside the JSON response.
const API_RX = /\/(api|wp-json|graphql|getdocuments?|documentlist|disclosure|financial|filings?|attachments?)\b|\.json(\?|$)|\.ashx|\.pdf/i
// A link looks like a document if its URL or text points at a file/download —
// not just a ".pdf" suffix (many sites use /download?id=, .ashx, viewers, etc.).
const DOC_RX = /\.(pdf|ashx|xlsx?)(\?|#|$)|\/(download|document|getfile|attachment|viewfile|filedownload)/i
const DOC_TEXT_RX = /\.pdf|download|financial statement|ind[\s-]?as|disclosure|annual report|balance sheet|revenue account/i

async function scanPage(ctx: BrowserContext, url: string): Promise<PageScan> {
  const page = await ctx.newPage()
  const apiHits = new Set<string>()
  // Watch the data calls the SPA makes — the document list (with real PDF URLs)
  // usually arrives via one of these responses.
  page.on('response', (resp) => { const u = resp.url(); if (API_RX.test(u) && !/\.(js|css|woff2?|png|jpg|svg|gif)(\?|$)/i.test(u)) apiHits.add(`${resp.status()} ${u}`) })
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })
    await page.waitForTimeout(6000)
    // SPAs often lazy-load the document table on scroll / after data arrives.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
    await page.waitForTimeout(6000)
    await page.waitForSelector('a[href*=".pdf"], a[href*="download"], a[href*=".ashx"]', { timeout: 6000 }).catch(() => {})
    const allLinks: Discovered[] = await page.$$eval('a[href]', (as) =>
      as.map((a) => ({ href: (a as HTMLAnchorElement).href, text: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100) })),
    )
    const title = await page.title().catch(() => '')
    const bodyLen = (await page.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0)) as number
    return { title, bodyLen, allLinks, apiHits: [...apiHits] }
  } finally {
    await page.close().catch(() => {})
  }
}

async function main(): Promise<number> {
  const filter = (process.env.COMPANY || '').trim()
  const targets = filter ? TARGETS.filter((t) => t.company_id === filter) : TARGETS
  if (!targets.length) { console.error(`No targets for COMPANY="${filter}". Known: ${TARGETS.map((t) => t.company_id).join(', ')}`); return 1 }

  const proxy = proxyConfig()
  console.log(`fetch-rendered: ${targets.length} company target(s); proxy=${proxy ? 'ScraperAPI India IP' : 'direct (no SCRAPER_KEY)'}`)

  const manifestPath = resolve(REPO, 'data/raw/rendered/manifest.json')
  await mkdir(dirname(manifestPath), { recursive: true })
  const manifest = await loadManifest(manifestPath)

  let browser: Browser | null = null
  let newCount = 0, seen = 0, failures = 0
  try {
    browser = await chromium.launch({ headless: true, proxy })
    const ctx = await browser.newContext({ userAgent: BROWSER_UA, ignoreHTTPSErrors: true })

    for (const t of targets) {
      const destDir = resolve(REPO, 'data/raw/companies', t.company_id)
      await mkdir(destDir, { recursive: true })
      const allLinks: Discovered[] = []
      for (const url of t.pages) {
        try {
          const scan = await scanPage(ctx, url)
          console.log(`    page: "${scan.title}" | body ${scan.bodyLen} chars | ${scan.allLinks.length} total links — ${url}`)
          if (scan.apiHits.length) { console.log('      [network] data calls the app made:'); for (const h of scan.apiHits.slice(0, 25)) console.log(`        ${h.slice(0, 150)}`) }
          allLinks.push(...scan.allLinks)
        } catch (e) { failures++; console.error(`  ! render failed: ${url} (${e instanceof Error ? e.message : String(e)})`) }
      }
      // Keep links that look like documents (URL or text), then apply the
      // company relevance filter.
      const docLinks = allLinks.filter((l) => DOC_RX.test(l.href) || DOC_TEXT_RX.test(l.text))
      const uniq = new Map<string, string>()
      for (const l of docLinks) if (!t.keep || t.keep.test(l.href) || t.keep.test(l.text)) uniq.set(l.href, l.text)
      console.log(`  ${t.company_id}: ${uniq.size} relevant document link(s) discovered (of ${docLinks.length} doc-like, ${allLinks.length} total)`)
      if (uniq.size === 0) {
        // Diagnostic dump so we can SEE what the rendered page exposes and refine.
        console.log('    [diagnostic] sample of rendered links:')
        for (const l of allLinks.slice(0, 40)) console.log(`      ${l.href.slice(0, 110)}  «${l.text}»`)
      }

      for (const [href, text] of uniq) {
        seen++
        if (manifest[href]) { console.log(`    · already have ${href}`); continue }
        try {
          const res = await ctx.request.get(href, { timeout: NAV_TIMEOUT_MS, headers: { 'User-Agent': BROWSER_UA } })
          if (!res.ok()) throw new Error(`HTTP ${res.status()}`)
          const buf = Buffer.from(await res.body())
          if (!looksLikePdf(buf)) throw new Error('not a PDF')
          const filename = deriveFilename(t.company_id, href)
          await writeFile(resolve(destDir, filename), buf)
          manifest[href] = { company_id: t.company_id, url: href, filename, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), discovered_at: new Date().toISOString() }
          newCount++
          console.log(`    + saved: ${filename} (${buf.length.toLocaleString()} bytes) — "${text}"`)
        } catch (e) { failures++; console.error(`    ! download failed: ${href} (${e instanceof Error ? e.message : String(e)})`) }
      }
    }
  } finally {
    await browser?.close().catch(() => {})
  }

  await writeFile(manifestPath, JSON.stringify({ updated_at: new Date().toISOString(), files: manifest }, null, 2) + '\n')
  console.log(`fetch-rendered: discovered ${seen}, downloaded ${newCount} new, ${failures} failure(s).`)
  // "Nothing new" is a normal, successful outcome (don't fail the scheduled run).
  return 0
}

main().then((c) => { process.exitCode = c }).catch((e) => { console.error('fetch-rendered error:', e); process.exitCode = 1 })
