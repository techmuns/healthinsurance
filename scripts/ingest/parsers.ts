// ---------------------------------------------------------------------------
//  Shared parsing helpers — PDF, XLSX, HTML.
//
//  Each helper supports two execution modes:
//    1. Live network (GitHub Actions, INGEST_OFFLINE=0) — fetches the URL.
//    2. Offline / sandboxed — reads a pre-staged file from data/raw/<subdir>/.
//
//  This lets us populate snapshots either way: scheduled cron runs pull live,
//  while local debugging works by dropping PDFs / XLSX into the raw tree.
// ---------------------------------------------------------------------------

import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as cheerio from 'cheerio'
import * as XLSX from 'xlsx'
// pdf-parse ships a quirky CJS entry that tries to read a test PDF at import
// time. Pull from its inner module to bypass.
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { RAW_ROOT, ensureDir, fileExists, isOfflineMode, writeRaw } from './util'
import { browserGet } from './browser'
import { assertPublicUrl, isSafeHttpUrlSync } from './net-guard'

// Real desktop-Chrome User-Agent + a full browser fingerprint so IRDAI /
// CDN-fronted insurer sites stop returning 403 to the default Node fetch UA.
function browserHeaders(url: string): Record<string, string> {
  const u = new URL(url)
  // IRDAI's WAF accepts requests that look like they originated from a real
  // browsing session — Referer matching the site root + Sec-Fetch-* headers
  // are what their CDN inspects.
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    Referer: `${u.protocol}//${u.host}/`,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Fetch a URL with a real browser user-agent + retry/back-off on transient
 * failures (5xx, 429, network). Returns the body as a Buffer (works for
 * binary like PDF / XLSX) and the final URL after redirects.
 */
// Hard per-request deadline. Without it a single hung TCP connection stalls
// the whole ingest run until the workflow's job timeout kills everything —
// observed on the GIC chain (2026-06-11 run cancelled at the 25-min cap).
const FETCH_TIMEOUT_MS = 45_000
const MAX_REDIRECTS = 8

/**
 * Follow redirects MANUALLY so every hop — the initial URL and each 30x
 * `Location` — is validated with assertPublicUrl BEFORE the request is made.
 * `redirect: 'follow'` would connect to (and receive a response from) an
 * internal redirect target before we could check it; this closes that. GET-only;
 * browser headers are recomputed per hop so Referer tracks the current host.
 */
async function fetchFollowingSafely(url: string): Promise<{ res: Response; finalUrl: string }> {
  let current = url
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(current)
    const res = await fetch(current, {
      redirect: 'manual',
      headers: browserHeaders(current),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return { res, finalUrl: current } // 3xx without Location → treat as final
      if (hop >= MAX_REDIRECTS) throw new Error(`Too many redirects starting at ${url}`)
      current = new URL(loc, current).toString()
      continue
    }
    return { res, finalUrl: current }
  }
}

export async function fetchBuffer(url: string): Promise<{ buffer: Buffer; finalUrl: string }> {
  const maxAttempts = 3
  let lastErr: unknown = null
  let blocked = false // 401/403 — a WAF block a real browser may get past
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Each hop (initial + redirects) is SSRF-validated before the request, so
      // a poisoned link or 30x to an internal host is never connected to.
      const { res, finalUrl } = await fetchFollowingSafely(url)
      if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`)
        await sleep(1000 * Math.pow(2, i))
        continue
      }
      if (res.status === 401 || res.status === 403) {
        blocked = true
        lastErr = new Error(`HTTP ${res.status} for ${url}`)
        break
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`)
      }
      const ab = await res.arrayBuffer()
      return { buffer: Buffer.from(ab), finalUrl }
    } catch (err) {
      lastErr = err
      // Non-HTTP failure (DNS, network): brief back-off then retry.
      if (i < maxAttempts - 1) await sleep(1000 * Math.pow(2, i))
    }
  }
  // Plain fetch was WAF-blocked (typically IRDAI's 403). A real headless browser
  // carries JS + cookies + a browser TLS fingerprint and often gets through.
  // No-ops (returns null) when no browser is available, so behaviour is unchanged
  // wherever Playwright/Chromium isn't installed.
  if (blocked && !isOfflineMode()) {
    const binary = /\.(pdf|xlsx|xls|zip)(\?|$)/i.test(url)
    const buf = await browserGet(url, { binary }).catch(() => null)
    if (buf && buf.length) return { buffer: buf, finalUrl: url }
  }
  // Third tier: an optional fetch proxy for hosts that block datacenter IPs at
  // the network level. IRDAI and NSE return a standing 403 to GitHub Actions
  // even through headless Chrome (same datacenter IP), so the request has to
  // leave from a non-blocked / in-region IP. Set INGEST_FETCH_PROXY to a URL
  // template containing the literal `{url}` placeholder (the target is
  // URL-encoded into it) — vendor-neutral, so any proxy / scraping API that
  // returns the raw bytes works, e.g.:
  //   https://api.scraperapi.com/?api_key=KEY&country_code=in&url={url}
  // No-ops (unchanged behaviour) when the env var is unset.
  if (blocked && !isOfflineMode()) {
    const tmpl = process.env.INGEST_FETCH_PROXY
    if (tmpl && tmpl.includes('{url}')) {
      try {
        const res = await fetch(tmpl.replace('{url}', encodeURIComponent(url)), {
          redirect: 'follow',
          signal: AbortSignal.timeout(90_000), // relays are slower; still bounded
        })
        if (res.ok) {
          const ab = await res.arrayBuffer()
          if (ab.byteLength) return { buffer: Buffer.from(ab), finalUrl: url }
        }
        lastErr = new Error(`Proxy HTTP ${res.status} for ${url}`)
      } catch (err) {
        lastErr = err
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/** Fetch HTML and return a cheerio root. */
export async function fetchHtml(url: string): Promise<cheerio.CheerioAPI> {
  const { buffer } = await fetchBuffer(url)
  return cheerio.load(buffer.toString('utf8'))
}

/**
 * Find the latest matching link on a page. `matcher` runs on every <a>'s
 * resolved absolute URL — return true to accept. Returns the absolute URL of
 * the first matching link (callers can sort beforehand if needed).
 */
export function findLinks(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  matcher: (href: string, text: string) => boolean,
): string[] {
  const out: string[] = []
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim()
    if (!href) return
    const abs = href.startsWith('http') ? href : new URL(href, baseUrl).toString()
    // Drop links that point at non-HTTP(S) schemes or internal/private hosts so
    // a poisoned page can never get an internal URL queued for fetch + commit.
    if (!isSafeHttpUrlSync(abs)) return
    const text = $(el).text().trim()
    if (matcher(abs, text)) out.push(abs)
  })
  return out
}

/**
 * Fetch a URL (if online) OR load the most recent pre-staged file from
 * data/raw/<subdir>/ that matches `extPattern`. Always writes the fetched
 * buffer to raw before returning, so the next offline run can replay it.
 */
export async function fetchOrLoadRaw(
  url: string,
  subdir: string,
  filename: string,
  extPattern: RegExp,
): Promise<{ buffer: Buffer; raw_file: string; mode: 'live' | 'offline' }> {
  if (!isOfflineMode()) {
    const { buffer } = await fetchBuffer(url)
    const raw_file = await writeRaw(subdir, filename, buffer)
    return { buffer, raw_file, mode: 'live' }
  }
  // Offline: look for any pre-staged file in data/raw/<subdir>/.
  const dir = resolve(RAW_ROOT, subdir)
  await ensureDir(dir)
  if (!(await fileExists(dir))) throw new Error(`Offline mode and no raw dir at ${dir}`)
  const entries = await readdir(dir).catch(() => [] as string[])
  const matches = entries.filter((e) => extPattern.test(e))
  if (matches.length === 0) {
    throw new Error(`Offline mode and no pre-staged file matching ${extPattern} in ${dir}`)
  }
  // Pick the most recently named file (alpha-sorted desc — works for ISO date prefixes).
  matches.sort().reverse()
  const raw_file = resolve(dir, matches[0])
  const buffer = await readFile(raw_file)
  return { buffer, raw_file, mode: 'offline' }
}

/**
 * Load the most-recent manually-staged raw file from data/raw/<subdir>/, or
 * null when none is present.
 *
 * This is the fallback for sources that block automated/datacenter access at
 * the IP level (e.g. IRDAI's standing 403). Drop the official file into the raw
 * tree and the next normal run picks it up — no offline-mode toggle needed.
 */
export async function loadStagedRaw(
  subdir: string,
  extPattern: RegExp,
): Promise<{ buffer: Buffer; raw_file: string } | null> {
  const dir = resolve(RAW_ROOT, subdir)
  const entries = await readdir(dir).catch(() => [] as string[])
  const matches = entries.filter((e) => extPattern.test(e)).sort().reverse()
  if (matches.length === 0) return null
  const raw_file = resolve(dir, matches[0])
  const buffer = await readFile(raw_file)
  return { buffer, raw_file }
}

// ─── PDF extraction ────────────────────────────────────────────────────────

export interface PdfText {
  text: string
  numpages: number
}

export async function parsePdf(buffer: Buffer): Promise<PdfText> {
  const result = await (pdfParse as (b: Buffer) => Promise<{ text: string; numpages: number }>)(buffer)
  return { text: result.text, numpages: result.numpages }
}

/**
 * Extract numeric values from a PDF text by matching label patterns.
 * Returns a parsed-numbers map keyed by the pattern name. Numbers honor
 * Indian formatting (1,23,456.78) and strip ₹ / Rs / % suffixes.
 */
export function extractByPatterns(
  text: string,
  patterns: Record<string, RegExp>,
): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const [key, pattern] of Object.entries(patterns)) {
    const m = text.match(pattern)
    if (!m || !m[1]) {
      out[key] = null
      continue
    }
    const raw = m[1].replace(/[,₹\s]/g, '').replace(/%$/, '')
    const n = parseFloat(raw)
    out[key] = Number.isFinite(n) ? n : null
  }
  return out
}

// ─── XLSX extraction ───────────────────────────────────────────────────────

export type XlsxRow = (string | number | null | undefined)[]

export function parseXlsx(buffer: Buffer): { sheets: Record<string, XlsxRow[]> } {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheets: Record<string, XlsxRow[]> = {}
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    sheets[name] = XLSX.utils.sheet_to_json<XlsxRow>(sheet, { header: 1, blankrows: false, raw: true, defval: null })
  }
  return { sheets }
}

/**
 * Find the first row of a sheet whose first non-empty cell matches one of
 * the given alias strings (case-insensitive contains). Useful for finding a
 * named insurer row in an IRDAI monthly XLSX.
 */
export function findRowByAlias(rows: XlsxRow[], aliases: string[]): XlsxRow | null {
  const lower = aliases.map((a) => a.toLowerCase())
  for (const r of rows) {
    const first = r.find((c) => c != null && String(c).trim() !== '')
    if (!first) continue
    const s = String(first).toLowerCase()
    if (lower.some((a) => s.includes(a))) return r
  }
  return null
}

export function toNumber(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/[,₹\s]/g, '').replace(/%$/, '')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}
