// ---------------------------------------------------------------------------
//  Fetcher — IRDAI NON-LIFE FLASH FIGURES (monthly Gross Direct Premium).
//
//  Document family (official IRDAI website ONLY):
//    "Gross Direct Premium - Flash figures of Non-life Insurers -
//     For and Up to the Month of [Month] [Year]"
//    table title: "GROSS DIRECT PREMIUM UNDERWRITTEN FOR AND UPTO THE MONTH
//     OF [MONTH], [YEAR] (Provisional & Unaudited) (Rs. in Crore)".
//
//  This is the industry-wide monthly non-life premium table: per-insurer +
//  category totals (General Insurers / Stand-alone Health / Specialized PSU)
//  and a GRAND TOTAL = the whole non-life / general-insurance industry.
//
//  Source basis (critical, never mislabel):
//    • Gross DIRECT premium WRITTEN — not earned, not net, not retained.
//    • Unit Rs crore. Figures are PROVISIONAL & UNAUDITED.
//
//  Per-month metrics extracted (current-FY + previous-FY for each):
//    premium_for_month_*  ← column group "For the Month of [Month]"
//    premium_ytd_*        ← column group "Up to the Month of [Month]"
//    market_share_ytd_percent / growth_yoy_percent (optional, if present)
//
//  Prefer .xlsx; use the PDF only when no XLSX exists for a month.
//  Do NOT use broker / news / aggregator sites or manual fabrication.
//
//  REACHABILITY: IRDAI's WAF returns a standing 403 to datacenter IPs (the
//  GitHub Actions runner). When that happens this fetcher logs the exact
//  "blocked" line, KEEPS the previous valid snapshot untouched, and never
//  overwrites real data with empty JSON. A month is also populated by dropping
//  the official file into data/raw/irdai/nonlife-flash/<YYYY-MM>.{xlsx,pdf} —
//  the next normal run parses it. Until a source is reachable each month stays
//  an honest "pending" (never fabricated).
//
//  This module is ADDITIVE: it writes its own three snapshot files and returns
//  records:[] so it cannot disturb the existing IRDAI/company merge flows.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult } from './types'
import type { XlsxRow } from './parsers'
import { fetchHtml, fetchBuffer, findLinks, parsePdf, parseXlsx, toNumber } from './parsers'
import {
  appendLog,
  fileExists,
  isOfflineMode,
  nowIso,
  readSnapshot,
  writeRaw,
  writeSnapshot,
  RAW_ROOT,
} from './util'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SOURCE_ID = 'irdai_nonlife_flash'
const SOURCE_NAME = 'IRDAI Non-Life Flash Figures'
// The official IRDAI page that hosts the monthly non-life flash-figures files.
const SOURCE_URL = 'https://irdai.gov.in/non-life'
const RAW_SUBDIR = 'irdai/nonlife-flash'
const EXACT_BLOCK_LOG =
  'IRDAI source blocked GitHub Actions request with 403. Non-Life Flash Figures snapshot not updated.'

// Output snapshot files (src/data/snapshots/).
const FILE_MONTHLY = 'irdai-nonlife-flash-monthly.json'
const FILE_LATEST = 'irdai-nonlife-flash-latest.json'
const FILE_SOURCES = 'irdai-nonlife-flash-sources.json'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Optional exact per-month URL overrides, keyed YYYY-MM. Empty by default —
// live discovery + staged files cover the rest. Fill as exact links are known.
const MONTH_URLS: Record<string, string> = {}

// ── Output schema (mirrored in src/data/snapshots/_schemas.ts for the UI) ────

type InsurerGroup =
  | 'General Insurer'
  | 'Standalone Health'
  | 'Specialized PSU'
  | 'Total'
  | 'Unknown'

interface IrdaiNonLifeFlashRow {
  source: typeof SOURCE_NAME
  source_url: string
  downloaded_file_url?: string
  file_type: 'xlsx' | 'pdf'
  report_month: string
  report_year: number
  financial_year_current: string
  financial_year_previous: string
  insurer_name_original: string
  insurer_name_normalized: string
  insurer_group: InsurerGroup
  premium_for_month_current_year: number | null
  premium_for_month_previous_year: number | null
  premium_ytd_current_year: number | null
  premium_ytd_previous_year: number | null
  market_share_ytd_percent: number | null
  growth_yoy_percent: number | null
  unit: 'Rs crore'
  provisional: true
  unaudited: true
  fetched_at: string
}

interface FlashSource {
  report_month: string
  report_year: number
  month_key: string // YYYY-MM
  source: typeof SOURCE_NAME
  source_url: string
  downloaded_file_url: string | null
  file_type: 'xlsx' | 'pdf' | null
  status: 'official' | 'blocked' | 'pending'
  rows: number
  fetched_at: string
}

// A single parsed month, ready to merge into the snapshots.
interface ParsedMonth {
  month_key: string // YYYY-MM
  report_month: string
  report_year: number
  rows: IrdaiNonLifeFlashRow[]
  source_url: string
  downloaded_file_url: string | null
  file_type: 'xlsx' | 'pdf'
  grand_total_found: boolean
  warnings: string[]
}

// ── name normalisation ──────────────────────────────────────────────────────

// Known IRDAI-name → canonical short-name remaps (rebrands / common variants).
const NAME_REMAP: { test: RegExp; to: string }[] = [
  { test: /max\s*bupa/i, to: 'Niva Bupa' },
  { test: /niva\s*bupa/i, to: 'Niva Bupa' },
  { test: /religare\s*health/i, to: 'Care Health' },
  { test: /care\s*health/i, to: 'Care Health' },
  { test: /star\s*health/i, to: 'Star Health' },
  { test: /aditya\s*birla/i, to: 'Aditya Birla Health' },
  { test: /manipal\s*cigna/i, to: 'ManipalCigna Health' },
  { test: /icici\s*lombard/i, to: 'ICICI Lombard' },
  { test: /bajaj\s*allianz/i, to: 'Bajaj Allianz General' },
]

/** Normalise an IRDAI insurer name to a clean, stable display form. The
 *  original IRDAI string is always kept alongside (insurer_name_original). */
function normalizeInsurerName(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').replace(/[*#†]+\s*$/, '').trim()
  for (const r of NAME_REMAP) if (r.test.test(trimmed)) return r.to
  // Strip a leading serial number ("1 ", "12. ") and corporate boilerplate.
  let s = trimmed.replace(/^\d+[.)]?\s+/, '')
  s = s
    .replace(/\(.*?\)/g, ' ')
    .replace(/&/g, ' ')
    .replace(/\b(company|co\.?|limited|ltd\.?|pvt\.?|private|india|insurance|general|assurance|of|the|and|for)\b/gi, ' ')
    .replace(/[.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) s = trimmed
  // Title-case while preserving short all-caps tokens (PSU, AIC, ECGC, SBI…).
  return s
    .split(' ')
    .map((w) => (w.length <= 4 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
}

// ── month window ────────────────────────────────────────────────────────────

/** Report months to attempt: Apr 2025 → the previous full calendar month. */
function monthsToAttempt(): string[] {
  const out: string[] = []
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth() - 1, 1) // last full month
  const cur = new Date(2025, 3, 1) // 2025-04
  while (cur <= end) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

// ── FY helpers ──────────────────────────────────────────────────────────────

interface Fy {
  start: number
  canonical: string // "YYYY-YY"
}

/** Parse an FY label like "2025-26" / "2025 - 2026" → { start, canonical }. */
function parseFy(label: string): Fy | null {
  const m = String(label).match(/(20\d{2})\s*[-–—]\s*(\d{2,4})/)
  if (!m) return null
  const start = Number(m[1])
  const endRaw = m[2]
  const end2 = endRaw.length === 4 ? endRaw.slice(2) : endRaw.padStart(2, '0')
  return { start, canonical: `${start}-${end2}` }
}

/** Indian FY for a YYYY-MM report month (Apr → Mar). */
function fyForMonth(monthKey: string): { current: string; previous: string } {
  const [yyyy, mm] = monthKey.split('-').map(Number)
  const startYear = mm >= 4 ? yyyy : yyyy - 1
  const fy = (s: number) => `${s}-${String((s + 1) % 100).padStart(2, '0')}`
  return { current: fy(startYear), previous: fy(startYear - 1) }
}

// ── scale / unit detection ──────────────────────────────────────────────────

/** Normalise reported values to ₹ crore. IRDAI flash is Rs. in Crore (=1). */
function scaleFactor(blob: string): number {
  const t = blob.toLowerCase()
  if (/in\s*'?0{3}\b|in\s*thousand/.test(t)) return 1e-4 // ₹'000 → ₹ Cr
  if (/in\s*lakh/.test(t)) return 1e-2 // ₹ lakh → ₹ Cr
  return 1 // Rs. in Crore (the IRDAI flash default)
}

// ── header / column detection ───────────────────────────────────────────────

interface ColMap {
  forMonthCY: number | null
  forMonthPY: number | null
  ytdCY: number | null
  ytdPY: number | null
  marketShare: number | null
  growth: number | null
  nameCol: number
  fyCurrent: string
  fyPrevious: string
  headerRowIdx: number
}

const FY_CELL = /(20\d{2})\s*[-–—]\s*(\d{2,4})/

/** Forward-fill a header row's labels rightward (handles merged group cells). */
function forwardFill(row: XlsxRow): string[] {
  const out: string[] = []
  let last = ''
  for (let j = 0; j < row.length; j++) {
    const v = String(row[j] ?? '').trim()
    if (v) last = v
    out[j] = last.toLowerCase()
  }
  return out
}

/**
 * Detect the FY/group header and map the four premium columns. Tries a
 * label-based match first (group "for the month" vs "up to the month" + FY
 * label), then falls back to FY-pair ordering (first CY/PY pair = for-month,
 * second = up-to-month) for the standard IRDAI layout.
 */
function detectColumns(rows: XlsxRow[]): ColMap | null {
  // 1. FY row = the row with the most FY-pattern cells (need ≥ 2).
  let fyRowIdx = -1
  let best = 0
  const fyByCol = new Map<number, string>()
  for (let i = 0; i < rows.length; i++) {
    const cols: Array<[number, string]> = []
    rows[i].forEach((c, j) => {
      const s = String(c ?? '')
      if (FY_CELL.test(s)) {
        const fy = parseFy(s)
        if (fy) cols.push([j, fy.canonical])
      }
    })
    if (cols.length > best) {
      best = cols.length
      fyRowIdx = i
      fyByCol.clear()
      for (const [j, fy] of cols) fyByCol.set(j, fy)
    }
  }
  if (fyRowIdx === -1 || best < 2) return null

  // 2. current vs previous FY (current = larger start year).
  const distinct = [...new Set([...fyByCol.values()])]
    .map((c) => parseFy(c)!)
    .sort((a, b) => b.start - a.start)
  const fyCurrent = distinct[0]?.canonical ?? ''
  const fyPrevious = distinct[1]?.canonical ?? ''

  // 3. group row = nearest row above the FY row carrying group words
  //    (for the month / up to / market share / growth), forward-filled.
  let groupFill: string[] = []
  for (let i = fyRowIdx; i >= Math.max(0, fyRowIdx - 3); i--) {
    const blob = rows[i].map((c) => String(c ?? '')).join(' ').toLowerCase()
    if (/(for the month|up\s*to|upto|market\s*share|growth)/.test(blob) && i !== fyRowIdx) {
      groupFill = forwardFill(rows[i])
      break
    }
  }
  // The FY row itself may also carry "for the month / upto" tokens in merged cells.
  const fyRowFill = forwardFill(rows[fyRowIdx])
  const groupAt = (j: number): string => `${groupFill[j] ?? ''} ${fyRowFill[j] ?? ''}`.trim()

  // 4. assign the four columns — label-based.
  const fyCols = [...fyByCol.entries()].sort((a, b) => a[0] - b[0])
  let forMonthCY: number | null = null
  let forMonthPY: number | null = null
  let ytdCY: number | null = null
  let ytdPY: number | null = null
  for (const [j, fy] of fyCols) {
    const g = groupAt(j)
    const isYtd = /(up\s*to|upto|cumulat|progress)/.test(g)
    const isMonth = /month/.test(g) && !isYtd
    const isCY = fy === fyCurrent
    if (isYtd) {
      if (isCY && ytdCY == null) ytdCY = j
      else if (!isCY && ytdPY == null) ytdPY = j
    } else if (isMonth) {
      if (isCY && forMonthCY == null) forMonthCY = j
      else if (!isCY && forMonthPY == null) forMonthPY = j
    }
  }

  // 5. positional fallback for any column still unresolved: split FY columns
  //    into current/previous in reading order — first pair = for-month, second
  //    pair = up-to-month (IRDAI's standard column order).
  const curCols = fyCols.filter(([, fy]) => fy === fyCurrent).map(([j]) => j)
  const prevCols = fyCols.filter(([, fy]) => fy === fyPrevious).map(([j]) => j)
  if (forMonthCY == null) forMonthCY = curCols[0] ?? null
  if (ytdCY == null) ytdCY = curCols[1] ?? null
  if (forMonthPY == null) forMonthPY = prevCols[0] ?? null
  if (ytdPY == null) ytdPY = prevCols[1] ?? null

  // 6. optional market-share / growth columns (prefer current-FY / YTD share).
  let marketShare: number | null = null
  let growth: number | null = null
  for (const [j] of fyCols.length ? fyCols : []) {
    const g = groupAt(j)
    if (marketShare == null && /market\s*share/.test(g)) marketShare = j
    if (growth == null && /growth/.test(g)) growth = j
  }
  // Share/growth headers sometimes sit in non-FY columns — scan the group row too.
  rows[fyRowIdx].forEach((_, j) => {
    const g = groupAt(j)
    if (marketShare == null && /market\s*share/.test(g)) marketShare = j
    if (growth == null && /growth/.test(g)) growth = j
  })

  // 7. name column = the column where a data row says "grand total", else the
  //    left-most mostly-text column.
  let nameCol = -1
  for (let i = fyRowIdx + 1; i < rows.length && nameCol === -1; i++) {
    rows[i].forEach((c, j) => {
      if (nameCol === -1 && /grand\s*total/i.test(String(c ?? ''))) nameCol = j
    })
  }
  if (nameCol === -1) {
    const textScore: number[] = []
    for (let j = 0; j < 4; j++) {
      let n = 0
      for (let i = fyRowIdx + 1; i < rows.length; i++) {
        const v = rows[i][j]
        if (v != null && typeof v !== 'number' && String(v).trim() && toNumber(v) == null) n++
      }
      textScore[j] = n
    }
    nameCol = textScore.indexOf(Math.max(...textScore))
    if (nameCol < 0) nameCol = 0
  }

  return { forMonthCY, forMonthPY, ytdCY, ytdPY, marketShare, growth, nameCol, fyCurrent, fyPrevious, headerRowIdx: fyRowIdx }
}

// ── report meta (month / year) ──────────────────────────────────────────────

function detectReportMeta(blob: string, monthKeyHint: string): { report_month: string; report_year: number } {
  const re =
    /(?:for\s+and\s+up\s*to|up\s*to|upto|for)\s+the\s+month\s+of\s+([A-Za-z]+)[,\s]+\s*(20\d{2})/i
  const m = blob.match(re) ?? blob.match(/month\s+of\s+([A-Za-z]+)[,\s]+\s*(20\d{2})/i)
  if (m) {
    const idx = MONTH_NAMES.findIndex((mn) => mn.toLowerCase() === m[1].toLowerCase())
    if (idx >= 0) return { report_month: MONTH_NAMES[idx], report_year: Number(m[2]) }
  }
  const [yyyy, mm] = monthKeyHint.split('-').map(Number)
  return { report_month: MONTH_NAMES[(mm || 1) - 1], report_year: yyyy }
}

// ── row classification ──────────────────────────────────────────────────────

type RowKind = 'grand' | 'general_total' | 'standalone_total' | 'specialized_total' | 'insurer' | 'skip'

function classifyRow(lname: string): RowKind {
  if (/grand\s*total/.test(lname)) return 'grand'
  if (/general\s+insurers/.test(lname) && (/total/.test(lname) || /^general\s+insurers\b/.test(lname)))
    return 'general_total'
  if (/stand[\s-]*alone/.test(lname) && /health/.test(lname)) return 'standalone_total'
  if (/special[ie]z(?:ed)?/.test(lname) && /(psu|insurer)/.test(lname)) return 'specialized_total'
  // Sector sub-headers / sub-totals are not insurers and not a required category.
  if (/sub[\s-]*total|^(public|private)\s+sector/.test(lname)) return 'skip'
  return 'insurer'
}

// ── core parse (shared by XLSX + PDF-as-rows) ───────────────────────────────

function parseFlashRows(
  rows: XlsxRow[],
  ctx: {
    month_key: string
    source_url: string
    downloaded_file_url: string | null
    file_type: 'xlsx' | 'pdf'
    fetched_at: string
  },
): { rows: IrdaiNonLifeFlashRow[]; grand_total_found: boolean; warnings: string[] } | null {
  const cols = detectColumns(rows)
  if (!cols) return null
  const blob = rows.map((r) => r.map((c) => String(c ?? '')).join(' ')).join('\n')
  const scale = scaleFactor(blob)
  const meta = detectReportMeta(blob, ctx.month_key)
  const derived = fyForMonth(ctx.month_key)
  const fyCurrent = cols.fyCurrent || derived.current
  const fyPrevious = cols.fyPrevious || derived.previous

  const cell = (row: XlsxRow, j: number | null): number | null => {
    if (j == null) return null
    const v = toNumber(row[j])
    return v == null ? null : Math.round(v * scale * 100) / 100
  }
  const pct = (row: XlsxRow, j: number | null): number | null => (j == null ? null : toNumber(row[j]))

  const out: IrdaiNonLifeFlashRow[] = []
  const warnings: string[] = []
  let grand = false
  let section: InsurerGroup = 'General Insurer'

  for (let i = cols.headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const rawName = String(row[cols.nameCol] ?? '').trim()
    if (!rawName || FY_CELL.test(rawName)) continue
    const kind = classifyRow(rawName.toLowerCase())
    if (kind === 'skip') continue

    const forCY = cell(row, cols.forMonthCY)
    const forPY = cell(row, cols.forMonthPY)
    const ytdCY = cell(row, cols.ytdCY)
    const ytdPY = cell(row, cols.ytdPY)
    // A non-total row with no numbers at all is a section label → drop it.
    if (kind === 'insurer' && forCY == null && forPY == null && ytdCY == null && ytdPY == null) continue

    let group: InsurerGroup
    if (kind === 'grand') {
      group = 'Total'
      grand = true
    } else if (kind === 'general_total') {
      group = 'Total'
      section = 'Standalone Health'
    } else if (kind === 'standalone_total') {
      group = 'Total'
      section = 'Specialized PSU'
    } else if (kind === 'specialized_total') {
      group = 'Total'
    } else {
      group = section
    }

    out.push({
      source: SOURCE_NAME,
      source_url: ctx.source_url,
      downloaded_file_url: ctx.downloaded_file_url ?? undefined,
      file_type: ctx.file_type,
      report_month: meta.report_month,
      report_year: meta.report_year,
      financial_year_current: fyCurrent,
      financial_year_previous: fyPrevious,
      insurer_name_original: rawName,
      insurer_name_normalized: kind === 'insurer' ? normalizeInsurerName(rawName) : rawName.replace(/\s+/g, ' ').trim(),
      insurer_group: group,
      premium_for_month_current_year: forCY,
      premium_for_month_previous_year: forPY,
      premium_ytd_current_year: ytdCY,
      premium_ytd_previous_year: ytdPY,
      market_share_ytd_percent: pct(row, cols.marketShare),
      growth_yoy_percent: pct(row, cols.growth),
      unit: 'Rs crore',
      provisional: true,
      unaudited: true,
      fetched_at: ctx.fetched_at,
    })
  }
  if (ctx.file_type === 'pdf') {
    warnings.push('Parsed from PDF (no XLSX for this month) — column mapping is positional, lower confidence.')
  }
  return { rows: out, grand_total_found: grand, warnings }
}

/** Coarse PDF-text → row matrix so parseFlashRows can run (lower confidence). */
function pdfToRows(text: string): XlsxRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(/\s{2,}|\t|\|/).map((c) => c.trim()).filter((c) => c.length > 0))
    .filter((r) => r.length > 0)
}

// ── validation gate (per the task) ──────────────────────────────────────────

/** Returns a list of hard-error strings; empty = the month's data is usable. */
function validateMonth(p: { rows: IrdaiNonLifeFlashRow[]; grand_total_found: boolean }): string[] {
  const errors: string[] = []
  if (p.rows.length === 0) errors.push('no data rows parsed')
  if (!p.grand_total_found) errors.push('no GRAND TOTAL row found')
  const allBlank = p.rows.every(
    (r) =>
      r.premium_for_month_current_year == null &&
      r.premium_for_month_previous_year == null &&
      r.premium_ytd_current_year == null &&
      r.premium_ytd_previous_year == null,
  )
  if (p.rows.length > 0 && allBlank) errors.push('all premium fields are blank')
  const gt = p.rows.find((r) => r.insurer_group === 'Total' && /grand\s*total/i.test(r.insurer_name_original))
  if (gt && gt.premium_for_month_current_year == null && gt.premium_ytd_current_year == null)
    errors.push('GRAND TOTAL current-month premium and YTD premium are both missing')
  return errors
}

// ── file resolution (live discovery → staged fallback) ──────────────────────

interface ResolvedFile {
  buffer: Buffer
  file_type: 'xlsx' | 'pdf'
  downloaded_file_url: string | null
  raw_file: string
}

function is403(err: unknown): boolean {
  return /\b40[13]\b/.test(err instanceof Error ? err.message : String(err))
}

/** A month-specific staged file at data/raw/irdai/nonlife-flash/<month>.<ext>. */
async function loadStagedMonth(month: string): Promise<ResolvedFile | null> {
  for (const ext of ['xlsx', 'xls', 'pdf'] as const) {
    const p = resolve(RAW_ROOT, RAW_SUBDIR, `${month}.${ext}`)
    if (await fileExists(p)) {
      return {
        buffer: await readFile(p),
        file_type: ext === 'pdf' ? 'pdf' : 'xlsx',
        downloaded_file_url: null,
        raw_file: p,
      }
    }
  }
  return null
}

/** Discover the flash-figures link for a month on the IRDAI page (XLSX first). */
function discoverUrl($: import('cheerio').CheerioAPI, month: string): string | null {
  const [yyyy, mm] = month.split('-')
  const name = MONTH_NAMES[Number(mm) - 1].toLowerCase()
  const links = findLinks($, SOURCE_URL, (href, text) => {
    if (!/\.(xlsx|xls|pdf)(\?|$)/i.test(href)) return false
    const t = `${href} ${text}`.toLowerCase()
    const flashy = /(flash|gross\s*direct\s*premium|non[\s-]?life|for\s*and\s*up\s*to|monthly\s*business)/.test(t)
    return flashy && t.includes(name) && t.includes(yyyy)
  })
  if (links.length === 0) return null
  // Prefer XLSX over PDF, then newest-looking.
  links.sort((a, b) => Number(/\.(xlsx|xls)(\?|$)/i.test(b)) - Number(/\.(xlsx|xls)(\?|$)/i.test(a)))
  return links[0]
}

// ── snapshot writers (safe: never overwrite real data with empty) ───────────

interface Envelope<T> {
  _meta: Record<string, unknown>
  data: T[]
}

async function readEnvelope<T>(file: string): Promise<Envelope<T> | null> {
  try {
    return await readSnapshot<Envelope<T>>(file)
  } catch {
    return null
  }
}

function baseMeta(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    schema_version: '1.0.0',
    source: SOURCE_NAME,
    source_url: SOURCE_URL,
    upstream_sources: [SOURCE_ID],
    unit: 'Rs crore',
    basis: 'Gross Direct Premium Written (not earned / net / retained)',
    provisional: true,
    unaudited: true,
    ...extra,
  }
}

/** True when the existing envelope already holds real (non-pending) data. */
function hasRealData(env: Envelope<unknown> | null): boolean {
  return !!env && Array.isArray(env.data) && env.data.length > 0 && env._meta?.dataset !== 'pending'
}

async function writeSnapshots(
  anyData: boolean,
  blocked: boolean,
  fetched_at: string,
  parsed: ParsedMonth[],
  sources: FlashSource[],
  warnings: string[],
): Promise<{ wroteMonthly: boolean }> {
  const note = blocked
    ? EXACT_BLOCK_LOG
    : anyData
      ? 'Gross Direct Premium Written, Rs crore, provisional & unaudited. Source: IRDAI Non-Life Flash Figures.'
      : 'Pending — IRDAI source not yet reachable / no file. Drop data/raw/irdai/nonlife-flash/<YYYY-MM>.xlsx to populate.'
  const parser_status = anyData ? 'ready' : blocked ? 'blocked' : 'pending'

  // ── monthly (full history): merge new months over kept history ────────────
  const monthly = await readEnvelope<IrdaiNonLifeFlashRow>(FILE_MONTHLY)
  let wroteMonthly = false
  if (anyData) {
    const updatedKeys = new Set(parsed.map((p) => `${p.report_year}::${p.report_month}`))
    const kept = (monthly?.data ?? []).filter(
      (r) => !updatedKeys.has(`${r.report_year}::${r.report_month}`),
    )
    const merged = [...kept, ...parsed.flatMap((p) => p.rows)].sort(
      (a, b) =>
        a.report_year - b.report_year ||
        MONTH_NAMES.indexOf(a.report_month) - MONTH_NAMES.indexOf(b.report_month),
    )
    await writeSnapshot(FILE_MONTHLY, {
      _meta: baseMeta({
        snapshot_id: 'irdai-nonlife-flash-monthly',
        description:
          'Monthly industry-wide non-life Gross Direct Premium (per insurer + category totals + GRAND TOTAL) from IRDAI Non-Life Flash Figures.',
        dataset: 'official',
        last_updated: fetched_at.slice(0, 10),
        last_successful_run: fetched_at,
        last_fetched_at: fetched_at,
        parser_status,
        months: [...new Set(merged.map((r) => `${r.report_month} ${r.report_year}`))],
        notes: note,
        warnings: warnings.slice(0, 60),
      }),
      data: merged,
    })
    wroteMonthly = true
  } else if (!hasRealData(monthly)) {
    // No real data yet → write/refresh an honest pending placeholder (never blank real data).
    await writeSnapshot(FILE_MONTHLY, {
      _meta: baseMeta({
        snapshot_id: 'irdai-nonlife-flash-monthly',
        description:
          'Monthly industry-wide non-life Gross Direct Premium from IRDAI Non-Life Flash Figures.',
        dataset: 'pending',
        last_updated: monthly?._meta?.last_updated ?? null,
        last_successful_run: monthly?._meta?.last_successful_run ?? null,
        last_fetched_at: fetched_at,
        parser_status,
        notes: note,
        warnings: warnings.slice(0, 60),
      }),
      data: monthly?.data ?? [],
    })
  } // else: real data exists + nothing new → leave the file untouched.

  // ── latest (newest month only) ────────────────────────────────────────────
  const latestEnv = await readEnvelope<IrdaiNonLifeFlashRow>(FILE_LATEST)
  if (anyData) {
    const latest = parsed
      .slice()
      .sort(
        (a, b) =>
          a.report_year - b.report_year ||
          MONTH_NAMES.indexOf(a.report_month) - MONTH_NAMES.indexOf(b.report_month),
      )
      .pop()!
    await writeSnapshot(FILE_LATEST, {
      _meta: baseMeta({
        snapshot_id: 'irdai-nonlife-flash-latest',
        description: 'Most recent month of IRDAI Non-Life Flash Figures (per insurer + totals + GRAND TOTAL).',
        dataset: 'official',
        last_updated: fetched_at.slice(0, 10),
        last_successful_run: fetched_at,
        last_fetched_at: fetched_at,
        report_month: latest.report_month,
        report_year: latest.report_year,
        financial_year_current: latest.rows[0]?.financial_year_current ?? null,
        financial_year_previous: latest.rows[0]?.financial_year_previous ?? null,
        source_url: latest.source_url,
        downloaded_file_url: latest.downloaded_file_url,
        parser_status,
        notes: note,
      }),
      data: latest.rows,
    })
  } else if (!hasRealData(latestEnv)) {
    await writeSnapshot(FILE_LATEST, {
      _meta: baseMeta({
        snapshot_id: 'irdai-nonlife-flash-latest',
        description: 'Most recent month of IRDAI Non-Life Flash Figures.',
        dataset: 'pending',
        last_updated: latestEnv?._meta?.last_updated ?? null,
        last_successful_run: latestEnv?._meta?.last_successful_run ?? null,
        last_fetched_at: fetched_at,
        report_month: latestEnv?._meta?.report_month ?? null,
        report_year: latestEnv?._meta?.report_year ?? null,
        parser_status,
        notes: note,
      }),
      data: latestEnv?.data ?? [],
    })
  }

  // ── sources (provenance log): always merge, keep prior captured URLs ───────
  const sourcesEnv = await readEnvelope<FlashSource>(FILE_SOURCES)
  const byMonth = new Map<string, FlashSource>()
  for (const s of sourcesEnv?.data ?? []) byMonth.set(s.month_key, s)
  for (const s of sources) {
    const prior = byMonth.get(s.month_key)
    // A real (official) capture always wins; a block/pending never erases a prior official URL.
    if (!prior || s.status === 'official' || prior.status !== 'official') byMonth.set(s.month_key, s)
  }
  const mergedSources = [...byMonth.values()].sort((a, b) => a.month_key.localeCompare(b.month_key))
  if (mergedSources.length > 0 || !hasRealData(sourcesEnv)) {
    await writeSnapshot(FILE_SOURCES, {
      _meta: baseMeta({
        snapshot_id: 'irdai-nonlife-flash-sources',
        description: 'Captured IRDAI Non-Life Flash Figures source URLs / files, per report month.',
        dataset: mergedSources.some((s) => s.status === 'official') ? 'official' : 'pending',
        last_updated: fetched_at.slice(0, 10),
        last_fetched_at: fetched_at,
        last_attempt_status: blocked ? 'blocked' : anyData ? 'official' : 'pending',
        parser_status,
        notes: blocked ? EXACT_BLOCK_LOG : note,
      }),
      data: mergedSources,
    })
  }

  return { wroteMonthly }
}

// ── orchestration ────────────────────────────────────────────────────────────

export const ingestIrdaiNonLifeFlashFigures: Fetcher = {
  source_id: SOURCE_ID,
  name: SOURCE_NAME,
  frequency: 'monthly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const months = monthsToAttempt()
    const parsed: ParsedMonth[] = []
    const sources: FlashSource[] = []
    const warnings: string[] = []
    let blocked = false

    // Resolve the IRDAI index page once (live). A standing 403 here is the
    // canonical "blocked" case — we log it, fall back to staged files, and
    // never fabricate.
    let indexHtml: import('cheerio').CheerioAPI | null = null
    if (!isOfflineMode()) {
      try {
        indexHtml = await fetchHtml(SOURCE_URL)
      } catch (err) {
        if (is403(err)) {
          blocked = true
          await appendLog('ingest-irdai-nonlife-flash.log', { source: SOURCE_ID, status: 'live_blocked_403', url: SOURCE_URL, message: EXACT_BLOCK_LOG })
        } else {
          warnings.push(`IRDAI index fetch failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    for (const month of months) {
      try {
        const file = await resolveMonth(month, indexHtml)
        if (!file) {
          // No file for this month → honest pending (recorded in sources for provenance).
          sources.push({
            report_month: MONTH_NAMES[Number(month.split('-')[1]) - 1],
            report_year: Number(month.split('-')[0]),
            month_key: month,
            source: SOURCE_NAME,
            source_url: SOURCE_URL,
            downloaded_file_url: null,
            file_type: null,
            status: blocked ? 'blocked' : 'pending',
            rows: 0,
            fetched_at,
          })
          continue
        }

        let sheetRows: XlsxRow[]
        if (file.file_type === 'xlsx') {
          const { sheets } = parseXlsx(file.buffer)
          sheetRows = sheets[Object.keys(sheets)[0]] ?? []
        } else {
          sheetRows = pdfToRows((await parsePdf(file.buffer)).text)
        }

        const result = parseFlashRows(sheetRows, {
          month_key: month,
          source_url: file.downloaded_file_url ?? SOURCE_URL,
          downloaded_file_url: file.downloaded_file_url,
          file_type: file.file_type,
          fetched_at,
        })
        if (!result) {
          warnings.push(`${month}: could not locate the flash-figures table (no FY header detected).`)
          continue
        }

        const errors = validateMonth(result)
        if (errors.length > 0) {
          // Validation FAILS this month — never write invalid/empty rows.
          warnings.push(`${month}: validation failed — ${errors.join('; ')} (month skipped, prior snapshot kept).`)
          await appendLog('ingest-irdai-nonlife-flash.log', { source: SOURCE_ID, month, status: 'validation_failed', errors })
          continue
        }

        const head = result.rows[0]
        parsed.push({
          month_key: month,
          report_month: head.report_month,
          report_year: head.report_year,
          rows: result.rows,
          source_url: file.downloaded_file_url ?? SOURCE_URL,
          downloaded_file_url: file.downloaded_file_url,
          file_type: file.file_type,
          grand_total_found: result.grand_total_found,
          warnings: result.warnings,
        })
        warnings.push(...result.warnings.map((w) => `${month}: ${w}`))
        sources.push({
          report_month: head.report_month,
          report_year: head.report_year,
          month_key: month,
          source: SOURCE_NAME,
          source_url: file.downloaded_file_url ?? SOURCE_URL,
          downloaded_file_url: file.downloaded_file_url,
          file_type: file.file_type,
          status: 'official',
          rows: result.rows.length,
          fetched_at,
        })
      } catch (err) {
        if (is403(err)) {
          blocked = true
          await appendLog('ingest-irdai-nonlife-flash.log', { source: SOURCE_ID, month, status: 'fetch_blocked_403', message: EXACT_BLOCK_LOG })
        } else {
          warnings.push(`${month}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    const anyData = parsed.length > 0
    const { wroteMonthly } = await writeSnapshots(anyData, blocked, fetched_at, parsed, sources, warnings)

    if (blocked && !anyData) {
      // The exact, required operator-facing line.
      await appendLog('ingest-irdai-nonlife-flash.log', { source: SOURCE_ID, status: 'blocked', message: EXACT_BLOCK_LOG })
      warnings.unshift(EXACT_BLOCK_LOG)
    }

    await appendLog('ingest-irdai-nonlife-flash.log', {
      source: SOURCE_ID,
      status: anyData ? 'success' : blocked ? 'blocked' : 'pending',
      months_attempted: months.length,
      months_parsed: parsed.length,
      wrote_monthly: wroteMonthly,
      offline: isOfflineMode(),
    })

    // Status: success when ≥1 month validated; blocked on a 403 with no data;
    // pending otherwise (no reachable source / no staged file). One source going
    // pending/blocked never breaks the wider ingest run (ingest-all isolates it)
    // and never overwrites the previous valid snapshot.
    const status: FetchResult['status'] = anyData ? 'success' : blocked ? 'blocked' : 'pending'
    return {
      source_id: SOURCE_ID,
      status,
      raw_file: null,
      records: [], // self-contained snapshots; nothing flows through the merge.
      records_fetched: parsed.reduce((n, p) => n + p.rows.length, 0),
      fetched_at,
      warnings: warnings.length ? warnings.slice(0, 60) : undefined,
    }
  },
}

/** Resolve a month's file: direct override → live discovery → staged file. */
async function resolveMonth(
  month: string,
  indexHtml: import('cheerio').CheerioAPI | null,
): Promise<ResolvedFile | null> {
  if (!isOfflineMode()) {
    const url = MONTH_URLS[month] ?? (indexHtml ? discoverUrl(indexHtml, month) : null)
    if (url) {
      const { buffer } = await fetchBuffer(url) // throws on 403 → handled upstream
      const file_type: 'xlsx' | 'pdf' = /\.pdf(\?|$)/i.test(url) ? 'pdf' : 'xlsx'
      const raw_file = await writeRaw(RAW_SUBDIR, `${month}.${file_type}`, buffer)
      return { buffer, file_type, downloaded_file_url: url, raw_file }
    }
  }
  return loadStagedMonth(month)
}
