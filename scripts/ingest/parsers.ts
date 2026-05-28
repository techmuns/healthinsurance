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
import { extname, resolve } from 'node:path'
import * as cheerio from 'cheerio'
import * as XLSX from 'xlsx'
// pdf-parse ships a quirky CJS entry that tries to read a test PDF at import
// time. Pull from its inner module to bypass.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { RAW_ROOT, ensureDir, fileExists, isOfflineMode, writeRaw } from './util'

/**
 * Fetch a URL with a browser-ish user-agent. Returns the body as a Buffer
 * (works for binary like PDF / XLSX) and the final URL after redirects.
 */
export async function fetchBuffer(url: string): Promise<{ buffer: Buffer; finalUrl: string }> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; InsuranceDataIngest/1.0; +https://github.com/techmuns/HealthInsurance)',
      Accept: '*/*',
    },
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`)
  }
  const ab = await res.arrayBuffer()
  return { buffer: Buffer.from(ab), finalUrl: res.url }
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
