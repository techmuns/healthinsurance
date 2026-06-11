// ---------------------------------------------------------------------------
//  Fetcher — GI Council  SEGMENTWISE REPORT  (Statistics → Industry Statistics).
//
//  Source (the ONLY allowed source for these 10 metrics):
//    "Gross direct premium income underwritten by non-life insurers within
//     India (segment-wise)", published monthly as a cumulative table
//     "for the period up to [Month]" (PROVISIONAL & UNAUDITED, Rs. In Crs.).
//
//  What it produces — per insurer (+ an INDUSTRY total), per month:
//    health · retail-health · group-health · government-health · overseas-medical
//    · motor · fire · crop · marine · other  premium.
//  The report is CUMULATIVE, so the pure single-month value is computed as
//    month = (YTD up to this month) − (YTD up to previous month).
//  April (fiscal-year start) IS its own month. When a month has no predecessor
//  YTD we keep the cumulative value, flagged `monthly_basis: 'up_to_month'`
//  (never silently presented as a single month). Missing columns stay null —
//  nothing is estimated, interpolated, or annualised.
//
//  REACHABILITY: gicouncil.in 403s datacenter IPs (proven by ingest-gicouncil-
//  flash.ts). So a live run returns data only when INGEST_FETCH_PROXY (an
//  in-region relay) is set, OR an official file is dropped into
//  data/raw/gicouncil/segment/<YYYY-MM>.xlsx — the staged file is parsed by the
//  next normal run. Until then every month stays an honest "pending".
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult, SnapshotRecord } from './types'
import type { XlsxRow } from './parsers'
import { findLinks, parsePdf, parseXlsx, toNumber } from './parsers'
import { gicFetch } from './gic-fetch'
import * as cheerio from 'cheerio'
import { appendLog, ensureDir, fileExists, isOfflineMode, nowIso, writeRaw, RAW_ROOT, PROCESSED_ROOT } from './util'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const SOURCE_ID = 'gicouncil_segmentwise'
const SOURCE_URL = 'https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report-on-homepage/'
const LISTING_URLS = [
  SOURCE_URL,
  'https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report/',
]
const RAW_SUBDIR = 'gicouncil/segment'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Optional direct-URL overrides keyed YYYY-MM (filled as exact links are known).
// Empty by default — discovery + staged files cover the rest.
const MONTH_URLS: Record<string, string> = {}

// Tracked NON-LIFE insurers only (the GI segment report excludes pure life
// insurers). Matched case-insensitively as a substring of the row's name cell.
const INSURER_ALIASES: Record<string, string[]> = {
  'niva-bupa': ['niva bupa', 'max bupa'],
  'star-health': ['star health'],
  'care-health': ['care health', 'religare health'],
  'aditya-birla': ['aditya birla health', 'aditya birla'],
  manipalcigna: ['manipalcigna', 'manipal cigna'],
  'icici-lombard': ['icici lombard'],
  'bajaj-general': ['bajaj allianz general', 'bajaj allianz'],
}

// ── Column vocabulary ──────────────────────────────────────────────────────
// Raw report columns we recognise. Composite output segments (health/motor/
// marine) are derived from a total column when present, else summed from parts.
type ColKey =
  | 'health_total'
  | 'retail_health'
  | 'group_health'
  | 'government_health'
  | 'overseas_medical'
  | 'motor_total'
  | 'motor_od'
  | 'motor_tp'
  | 'fire'
  | 'crop'
  | 'marine_total'
  | 'marine_cargo'
  | 'marine_hull'
  | 'other'

// Normalised header aliases (lowercased, alphanumeric only — see normaliseHeader).
const COL_ALIASES: Record<ColKey, string[]> = {
  health_total: ['health', 'healthtotal', 'healthinsurance'],
  retail_health: ['healthretail', 'retailhealth'],
  group_health: ['healthgroup', 'grouphealth'],
  government_health: ['healthgovernmentschemes', 'healthgovernment', 'governmenthealth', 'govthealth', 'healthgovtschemes', 'governmentschemes'],
  overseas_medical: ['overseasmedical', 'overseashealth', 'overseasmedicalinsurance', 'overseasmediclaim'],
  motor_total: ['motor', 'motortotal'],
  motor_od: ['motorod', 'motorowndamage'],
  motor_tp: ['motortp', 'motorthirdparty'],
  fire: ['fire', 'fireinsurance'],
  crop: ['crop', 'cropinsurance', 'agriculture', 'agricultureinsurance'],
  marine_total: ['marine', 'marinetotal'],
  marine_cargo: ['marinecargo', 'cargo'],
  marine_hull: ['marinehull', 'hull'],
  other: ['allothermisc', 'allothermiscellaneous', 'othermiscellaneous', 'miscellaneous', 'others', 'other'],
}

// Specific → generic order for the startsWith fallback (so "Health-Retail" is
// never swallowed by the generic "Health" total, "Motor OD" not by "Motor").
const COL_PRIORITY: ColKey[] = [
  'retail_health', 'group_health', 'government_health', 'overseas_medical',
  'motor_od', 'motor_tp', 'marine_cargo', 'marine_hull',
  'health_total', 'motor_total', 'marine_total', 'fire', 'crop', 'other',
]

// Final output segments (the clean dashboard fields), in display order.
const SEGMENTS = [
  'health_premium', 'retail_health_premium', 'group_health_premium',
  'government_health_premium', 'overseas_medical_premium',
  'motor_premium', 'fire_premium', 'crop_premium', 'marine_premium', 'other_premium',
] as const
type Segment = (typeof SEGMENTS)[number]
type SegMap = Record<Segment, number | null>

interface ParsedRow {
  company_id: string | null // null = untracked insurer (counted, not emitted)
  insurer_name: string
  is_industry: boolean
  ytd: SegMap
  incomplete: Segment[] // composites we refused to under-report (blank part cell)
}

interface MonthParse {
  month: string
  source_url: string
  raw_file: string | null
  confidence: 'high' | 'low'
  rows: ParsedRow[]
  warnings: string[]
}

// ── small helpers ──────────────────────────────────────────────────────────

const emptySeg = (): SegMap => Object.fromEntries(SEGMENTS.map((s) => [s, null] as const)) as SegMap

function normaliseHeader(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function fiscalYearOf(month: string): string {
  const [yyyy, mm] = month.split('-').map(Number)
  const fyEnd = mm >= 4 ? yyyy + 1 : yyyy
  return `FY${String(fyEnd).slice(2)}`
}

function periodLabel(month: string): string {
  const [yyyy, mm] = month.split('-').map(Number)
  return `For the period up to ${MONTH_NAMES[mm - 1]} ${yyyy}`
}

/** Previous calendar month as YYYY-MM. */
function prevMonth(month: string): string {
  const [yyyy, mm] = month.split('-').map(Number)
  const d = mm === 1 ? { y: yyyy - 1, m: 12 } : { y: yyyy, m: mm - 1 }
  return `${d.y}-${String(d.m).padStart(2, '0')}`
}

/** The trailing window of report months to attempt (Apr 2025 → last full month). */
function monthsToAttempt(): string[] {
  const out: string[] = []
  const now = new Date()
  // Up to the previous calendar month (a month's report lands after it closes).
  const end = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const start = new Date(2025, 3, 1) // 2025-04
  const cur = new Date(start)
  while (cur <= end) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

// ── file resolution (staged-first, revision-aware, time-budgeted) ───────────

interface ResolvedFile {
  buffer: Buffer
  ext: 'xlsx' | 'pdf'
  source_url: string
  raw_file: string | null
}

// Month-keyed download ledger (data/raw/gicouncil/segment/manifest.json):
// which listing URL each staged month came from. GIC media files are immutable
// (a revised edition gets a NEW /media/<id>/ URL), so "listed URL == recorded
// URL" means we already hold the current edition and no download is needed;
// a changed URL is a revision and triggers exactly one re-download.
interface MonthLedgerEntry { url: string; bytes?: number; sha256?: string; fetched_at?: string; via?: string }
interface MonthLedger { months: Record<string, MonthLedgerEntry> }

const ledgerPath = () => resolve(RAW_ROOT, RAW_SUBDIR, 'manifest.json')

async function loadMonthLedger(): Promise<MonthLedger> {
  try {
    const j = JSON.parse(await readFile(ledgerPath(), 'utf8'))
    if (j && typeof j === 'object' && j.months && typeof j.months === 'object') return j as MonthLedger
  } catch { /* first run — empty ledger */ }
  return { months: {} }
}

async function saveMonthLedger(ledger: MonthLedger): Promise<void> {
  if (Object.keys(ledger.months).length === 0) return // nothing learned yet (e.g. offline run)
  await ensureDir(resolve(RAW_ROOT, RAW_SUBDIR))
  await writeFile(ledgerPath(), JSON.stringify(ledger, null, 2) + '\n', 'utf8')
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

// Live-fetch wall-clock budget for ONE run. Past the deadline the resolver is
// staged-only: the run must always reach parse → project → commit with
// whatever is in hand, instead of dying inside a slow relay walk (the
// 2026-06-11 run was killed by the workflow timeout exactly this way).
const LIVE_BUDGET_MS = Math.max(60_000, Number(process.env.GIC_TIME_BUDGET_MS) || 8 * 60_000)
let liveDeadline = Number.POSITIVE_INFINITY
let budgetWarned = false

function liveBudgetExhausted(warnings: string[]): boolean {
  if (Date.now() < liveDeadline) return false
  if (!budgetWarned) {
    budgetWarned = true
    const msg = `live-fetch budget (${Math.round(LIVE_BUDGET_MS / 60_000)} min) spent — remaining months use staged copies only this run`
    console.log(`[gic-monthly] ${msg}`)
    warnings.push(msg)
  }
  return true
}

/** A month-specific staged file at data/raw/gicouncil/segment/<month>.<ext>. */
async function loadStagedMonth(month: string): Promise<ResolvedFile | null> {
  for (const ext of ['xlsx', 'xls', 'pdf'] as const) {
    const p = resolve(RAW_ROOT, RAW_SUBDIR, `${month}.${ext}`)
    if (await fileExists(p)) {
      return { buffer: await readFile(p), ext: ext === 'pdf' ? 'pdf' : 'xlsx', source_url: SOURCE_URL, raw_file: p }
    }
  }
  return null
}

/** Discover the report link for a month on the Segmentwise index page (XLSX
 *  first). The listing is fetched through every gic-fetch route (direct →
 *  relays → Internet Archive), so a runner the site 403s can still discover. */
async function discoverUrl(month: string): Promise<string | null> {
  const [yyyy, mm] = month.split('-')
  const name = MONTH_NAMES[Number(mm) - 1].toLowerCase()
  for (const listing of LISTING_URLS) {
    let $: cheerio.CheerioAPI
    try {
      const got = await gicFetch(listing, 'listing')
      $ = cheerio.load(got.buffer.toString('utf8'))
    } catch {
      continue
    }
    const links = findLinks($, listing, (href, text) => {
      if (!/\.(xlsx|xls|pdf)(\?|$)/i.test(href)) return false
      const t = `${href} ${text}`.toLowerCase()
      return /segment/.test(t) && t.includes(name) && t.includes(yyyy)
    })
    if (links.length === 0) continue
    links.sort((a, b) => Number(/\.(xlsx|xls)(\?|$)/i.test(b)) - Number(/\.(xlsx|xls)(\?|$)/i.test(a)))
    return links[0]
  }
  return null
}

async function resolveMonth(month: string, ledger: MonthLedger, warnings: string[]): Promise<ResolvedFile | null> {
  const staged = await loadStagedMonth(month)
  if (isOfflineMode() || liveBudgetExhausted(warnings)) return staged

  try {
    const url = MONTH_URLS[month] ?? (await discoverUrl(month))
    if (!url) {
      // Not on the listing: a new month not yet published (honest pending), or
      // the listing was unreachable on every route this run.
      if (!staged) console.log(`[gic-monthly] ${month}: not on the listing and no staged copy — pending`)
      return staged
    }
    const rec = ledger.months[month]
    if (staged && rec?.url === url) return staged // current edition already held — immutable, skip
    if (staged && !rec) {
      // Staged copy predates this ledger (earlier runs / agent pulls already
      // validated + parsed it). Record the currently listed URL once so future
      // runs can detect a revision — without re-downloading bytes we hold.
      ledger.months[month] = { url, via: 'adopted — staged copy predates the ledger', fetched_at: nowIso() }
      console.log(`[gic-monthly] ${month}: staged copy adopted for listed URL (no download)`)
      return staged
    }
    const why = staged ? `revised edition (listing URL changed: ${rec?.url} → ${url})` : 'no staged copy'
    console.log(`[gic-monthly] ${month}: live download — ${why}`)
    const t0 = Date.now()
    const ext: 'xlsx' | 'pdf' = /\.pdf(\?|$)/i.test(url) ? 'pdf' : 'xlsx'
    const { buffer, via } = await gicFetch(url, ext)
    const raw_file = await writeRaw(RAW_SUBDIR, `${month}.${ext}`, buffer)
    ledger.months[month] = { url, bytes: buffer.length, sha256: sha256Hex(buffer), fetched_at: nowIso(), via }
    console.log(`[gic-monthly] ${month}: ${(buffer.length / 1024).toFixed(0)} KB via ${via} in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    if (staged) warnings.push(`${month}: revised edition on the listing — re-downloaded and re-parsed from the new file.`)
    return { buffer, ext, source_url: url, raw_file }
  } catch (err) {
    const msg = `${month}: live fetch failed — ${err instanceof Error ? err.message : String(err)}`
    console.log(`[gic-monthly] ${msg}${staged ? ' (using staged copy)' : ''}`)
    if (!staged) warnings.push(msg)
    return staged
  }
}

// ── parsing ────────────────────────────────────────────────────────────────

/** Detect "Rs. in lakhs / '000" so values are normalised to ₹ Cr (default: crore). */
function scaleFactor(blob: string): number {
  const t = blob.toLowerCase()
  if (/in\s*'?0{3}|in\s*thousand/.test(t)) return 1e-4 // ₹'000 → ₹ Cr
  if (/in\s*lakh/.test(t)) return 1e-2 // ₹ lakh → ₹ Cr
  return 1 // Rs. In Crs. (the GI Council default)
}

/** Sum the present part-columns; if a present column has a blank cell, refuse
 *  (return incomplete) rather than under-report. */
function combine(keys: ColKey[], colFor: Partial<Record<ColKey, number>>, row: XlsxRow, scale: number): { value: number | null; incomplete: boolean } {
  const present = keys.filter((k) => colFor[k] != null)
  if (present.length === 0) return { value: null, incomplete: false }
  const vals = present.map((k) => toNumber(row[colFor[k]!]))
  if (vals.some((v) => v == null)) return { value: null, incomplete: true }
  return { value: (vals as number[]).reduce((s, v) => s + v, 0) * scale, incomplete: false }
}

function pick(key: ColKey, colFor: Partial<Record<ColKey, number>>, row: XlsxRow, scale: number): number | null {
  if (colFor[key] == null) return null
  const v = toNumber(row[colFor[key]!])
  return v == null ? null : v * scale
}

/** Parse one XLSX/PDF-table sheet of rows into per-insurer YTD segment maps. */
function parseSegmentRows(rows: XlsxRow[]): { rows: ParsedRow[]; warnings: string[]; ok: boolean } {
  const warnings: string[] = []
  const scale = scaleFactor(rows.map((r) => r.map((c) => String(c ?? '')).join(' ')).join('\n'))

  // Reverse exact-match map: normalised alias → ColKey.
  const exact = new Map<string, ColKey>()
  for (const k of Object.keys(COL_ALIASES) as ColKey[]) for (const a of COL_ALIASES[k]) exact.set(a, k)
  const matchCol = (cell: string): ColKey | null => {
    if (exact.has(cell)) return exact.get(cell)!
    for (const k of COL_PRIORITY) if (COL_ALIASES[k].some((a) => cell.startsWith(a))) return k
    return null
  }

  // Header row = the row matching the most segment columns (need ≥ 3).
  let headerIdx = -1
  let colFor: Partial<Record<ColKey, number>> = {}
  let bestMatches = 0
  for (let i = 0; i < rows.length; i++) {
    const map: Partial<Record<ColKey, number>> = {}
    rows[i].forEach((cell, j) => {
      const c = normaliseHeader(cell)
      if (!c) return
      const k = matchCol(c)
      if (k && map[k] == null) map[k] = j
    })
    const n = Object.keys(map).length
    if (n > bestMatches) {
      bestMatches = n
      headerIdx = i
      colFor = map
    }
  }
  if (headerIdx === -1 || bestMatches < 3) {
    return { rows: [], warnings: ['No segment header row found (need ≥3 recognisable segment columns) — not a Segmentwise report?'], ok: false }
  }

  // Coverage warning: any output segment with no source column stays null for
  // the whole month — surface it (rule: missing column ⇒ unavailable + warning).
  const segHasSource: Record<Segment, boolean> = {
    health_premium: colFor.health_total != null || (['retail_health', 'group_health', 'government_health', 'overseas_medical'] as ColKey[]).some((k) => colFor[k] != null),
    retail_health_premium: colFor.retail_health != null,
    group_health_premium: colFor.group_health != null,
    government_health_premium: colFor.government_health != null,
    overseas_medical_premium: colFor.overseas_medical != null,
    motor_premium: colFor.motor_total != null || colFor.motor_od != null || colFor.motor_tp != null,
    fire_premium: colFor.fire != null,
    crop_premium: colFor.crop != null,
    marine_premium: colFor.marine_total != null || colFor.marine_cargo != null || colFor.marine_hull != null,
    other_premium: colFor.other != null,
  }
  const missing = SEGMENTS.filter((s) => !segHasSource[s])
  if (missing.length) warnings.push(`columns not found (kept null, not estimated): ${missing.join(', ')}`)

  // Insurer-name column: a header cell naming the insurer, else the first column.
  let nameCol = 0
  rows[headerIdx].forEach((cell, j) => {
    const c = normaliseHeader(cell)
    if (/(insurer|company|nameofthe|particular)/.test(c) && nameCol === 0) nameCol = j
  })

  const out: ParsedRow[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const rawName = String(row[nameCol] ?? '').trim()
    if (!rawName) continue
    const lname = rawName.toLowerCase()
    const isIndustry = /(grand\s*total|industry\s*total|^total$|all\s*(non[\s-]?life|insurers))/i.test(lname)
    // Skip private/public sub-totals so they aren't mistaken for insurers.
    if (!isIndustry && /(sub[\s-]?total|public\s*sector|private\s*sector|standalone\s*health\s*total)/i.test(lname)) continue

    let companyId: string | null = null
    for (const [id, aliases] of Object.entries(INSURER_ALIASES)) {
      if (aliases.some((a) => lname.includes(a))) { companyId = id; break }
    }
    if (!isIndustry && !companyId) continue // untracked insurer → not emitted

    const seg = emptySeg()
    const incomplete: Segment[] = []

    seg.retail_health_premium = pick('retail_health', colFor, row, scale)
    seg.group_health_premium = pick('group_health', colFor, row, scale)
    seg.government_health_premium = pick('government_health', colFor, row, scale)
    seg.overseas_medical_premium = pick('overseas_medical', colFor, row, scale)
    seg.fire_premium = pick('fire', colFor, row, scale)
    seg.crop_premium = pick('crop', colFor, row, scale)
    seg.other_premium = pick('other', colFor, row, scale)

    // Health: explicit total if present, else sum of the present sub-splits.
    if (colFor.health_total != null) {
      seg.health_premium = pick('health_total', colFor, row, scale)
    } else {
      const h = combine(['retail_health', 'group_health', 'government_health', 'overseas_medical'], colFor, row, scale)
      seg.health_premium = h.value
      if (h.incomplete) incomplete.push('health_premium')
    }
    // Motor: total if present, else OD + TP.
    if (colFor.motor_total != null) {
      seg.motor_premium = pick('motor_total', colFor, row, scale)
    } else {
      const m = combine(['motor_od', 'motor_tp'], colFor, row, scale)
      seg.motor_premium = m.value
      if (m.incomplete) incomplete.push('motor_premium')
    }
    // Marine: total if present, else cargo + hull.
    if (colFor.marine_total != null) {
      seg.marine_premium = pick('marine_total', colFor, row, scale)
    } else {
      const mar = combine(['marine_cargo', 'marine_hull'], colFor, row, scale)
      seg.marine_premium = mar.value
      if (mar.incomplete) incomplete.push('marine_premium')
    }

    out.push({ company_id: companyId, insurer_name: rawName.slice(0, 80), is_industry: isIndustry, ytd: seg, incomplete })
  }

  if (out.every((r) => !r.is_industry)) warnings.push('No grand-total / industry row identified in the segment table.')
  return { rows: out, warnings, ok: true }
}

/** Convert a PDF table to coarse rows so parseSegmentRows can run (low confidence). */
function pdfToRows(text: string): XlsxRow[] {
  return text.split(/\r?\n/).map((line) => line.split(/\s{2,}|\t|\|/).map((c) => c.trim()).filter((c) => c.length > 0))
}

// ── orchestration ───────────────────────────────────────────────────────────

export const ingestGicouncilSegment: Fetcher = {
  source_id: SOURCE_ID,
  name: 'GI Council Segmentwise Report (non-life, segment-wise GDPI)',
  frequency: 'monthly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const t0 = Date.now()
    const months = monthsToAttempt()
    const parsed: MonthParse[] = []
    const warnings: string[] = []
    const ledger = await loadMonthLedger()
    liveDeadline = Date.now() + LIVE_BUDGET_MS
    budgetWarned = false

    for (const month of months) {
      const file = await resolveMonth(month, ledger, warnings).catch(() => null)
      if (!file) continue // honest pending for this month — no file, no fabrication
      try {
        let rowsOut: ReturnType<typeof parseSegmentRows>
        let confidence: 'high' | 'low' = 'high'
        if (file.ext === 'xlsx') {
          const { sheets } = parseXlsx(file.buffer)
          const sheetRows = sheets[Object.keys(sheets)[0]] ?? []
          rowsOut = parseSegmentRows(sheetRows)
        } else {
          const { text } = await parsePdf(file.buffer)
          confidence = 'low'
          rowsOut = parseSegmentRows(pdfToRows(text))
        }
        if (!rowsOut.ok) {
          warnings.push(`${month}: ${rowsOut.warnings.join('; ')}`)
          continue
        }
        for (const r of rowsOut.rows) {
          for (const s of r.incomplete) warnings.push(`${month} ${r.insurer_name}: ${s} not summed — a sub-column cell was blank (kept null, not under-reported).`)
        }
        if (rowsOut.warnings.length) warnings.push(...rowsOut.warnings.map((w) => `${month}: ${w}`))
        parsed.push({ month, source_url: file.source_url, raw_file: file.raw_file, confidence, rows: rowsOut.rows })
      } catch (err) {
        warnings.push(`${month}: parse error — ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    await saveMonthLedger(ledger)
    console.log(`[gic-monthly] resolved ${parsed.length}/${months.length} months in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

    // ── YTD → monthly (cumulative minus previous month), within this run ──────
    const byMonth = new Map(parsed.map((p) => [p.month, p]))
    const records: SnapshotRecord[] = []
    const sidecarMonths: SidecarMonth[] = []

    for (const p of parsed) {
      const isAprl = p.month.endsWith('-04')
      const prev = byMonth.get(prevMonth(p.month))
      const sidecarRows: SidecarRow[] = []

      for (const r of p.rows) {
        // basis is per-insurer: a true single month needs this insurer's prior YTD.
        const prevRow = prev?.rows.find((x) =>
          r.is_industry ? x.is_industry : x.company_id === r.company_id,
        )
        const basis: 'monthly' | 'up_to_month' = isAprl || prevRow ? 'monthly' : 'up_to_month'

        const monthly = emptySeg()
        for (const s of SEGMENTS) {
          const ytd = r.ytd[s]
          if (ytd == null) { monthly[s] = null; continue }
          if (isAprl) { monthly[s] = ytd; continue } // Apr YTD == Apr month
          const pv = prevRow?.ytd[s]
          if (pv == null) { monthly[s] = ytd; continue } // up_to_month (no prior)
          const delta = Math.round((ytd - pv) * 100) / 100
          if (delta < 0) {
            monthly[s] = null
            warnings.push(`${p.month} ${r.insurer_name}: ${s} YTD fell vs prior month (${pv}→${ytd}); monthly set null (restatement/mis-parse, not estimated).`)
          } else {
            monthly[s] = delta
          }
        }

        const provenance = {
          source_name: 'GI Council Segmentwise Report',
          source_url: p.source_url,
          source_file: p.raw_file,
          source_period: periodLabel(p.month),
          fetched_at,
          parsed_at: nowIso(),
          parser_name: 'ingest-gicouncil-segment',
          confidence: p.confidence,
        }

        // Flat values: headline (monthly|up_to_month) + raw YTD counterparts.
        const values: Record<string, number | string | null> = {
          period_type: 'monthly',
          fiscal_year: fiscalYearOf(p.month),
          monthly_basis: basis,
          source_period: periodLabel(p.month),
        }
        for (const s of SEGMENTS) {
          values[s] = monthly[s]
          values[`${s}_ytd`] = r.ytd[s]
        }

        if (r.is_industry) {
          // Derive the industry total + key shares (arithmetic, not estimates).
          const top = [monthly.health_premium, monthly.motor_premium, monthly.fire_premium, monthly.crop_premium, monthly.marine_premium, monthly.other_premium]
          const total = top.every((v) => v != null) ? (top as number[]).reduce((a, b) => a + b, 0) : null
          values.total_gi_premium = total
          values.health_share = total && monthly.health_premium != null ? Math.round((monthly.health_premium / total) * 1000) / 10 : null
          values.motor_share = total && monthly.motor_premium != null ? Math.round((monthly.motor_premium / total) * 1000) / 10 : null
          records.push({ target: 'industry-segment-premium', keys: { period: p.month }, values, provenance })
        } else if (r.company_id) {
          records.push({ target: 'insurer-monthly-premium', keys: { company_id: r.company_id, month: p.month }, values, provenance })
        }

        sidecarRows.push({
          company_id: r.is_industry ? 'INDUSTRY' : r.company_id!,
          insurer_name: r.insurer_name,
          basis,
          segments: Object.fromEntries(
            SEGMENTS.map((s) => [s, { ytd: r.ytd[s], monthly: monthly[s] }] as [string, { ytd: number | null; monthly: number | null }]),
          ),
        })
      }

      sidecarMonths.push({
        month: p.month,
        source_period: periodLabel(p.month),
        source_url: p.source_url,
        confidence: p.confidence,
        rows: sidecarRows,
      })
    }

    const anyData = records.length > 0
    await writeSidecar(anyData, fetched_at, sidecarMonths, warnings)

    await appendLog('ingest-gicouncil-segment.log', {
      source: SOURCE_ID, months_attempted: months.length, months_parsed: parsed.length,
      records: records.length, offline: isOfflineMode(),
    })

    return {
      source_id: SOURCE_ID,
      status: anyData ? 'success' : 'pending',
      raw_file: null,
      records,
      records_fetched: records.length,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

// ── processed sidecar (honest pending mirror, like sahi-monthly-flash.json) ──

interface SidecarRow {
  company_id: string
  insurer_name: string
  basis: 'monthly' | 'up_to_month'
  segments: Record<string, { ytd: number | null; monthly: number | null }>
}
interface SidecarMonth {
  month: string
  source_period: string
  source_url: string
  confidence: 'high' | 'low'
  rows: SidecarRow[]
}

async function writeSidecar(anyData: boolean, fetched_at: string, monthsData: SidecarMonth[], warnings: string[]): Promise<void> {
  const out = {
    _meta: {
      snapshot_id: 'segment-premium-monthly',
      description: 'Monthly segment-wise gross direct premium (non-life) from the GI Council Segmentwise Report. Stores both cumulative (ytd) and computed single-month (monthly) values per segment.',
      source: 'GI Council Segmentwise Report (Statistics → Industry Statistics)',
      source_url: SOURCE_URL,
      dataset: anyData ? 'official' : 'pending',
      last_fetched_at: fetched_at,
      last_updated: anyData ? fetched_at.slice(0, 10) : null,
      note: anyData
        ? 'monthly = (YTD up to this month) − (YTD up to previous month); April is its own month; up_to_month rows lack a predecessor.'
        : 'Pending — GI Council 403s the runner. Set INGEST_FETCH_PROXY (India-IP relay) or drop the official XLSX into data/raw/gicouncil/segment/<YYYY-MM>.xlsx.',
      warnings: warnings.slice(0, 50),
    },
    months: monthsData,
  }
  await ensureDir(PROCESSED_ROOT)
  await writeFile(resolve(PROCESSED_ROOT, 'segment-premium-monthly.json'), JSON.stringify(out, null, 2) + '\n', 'utf8')
}
