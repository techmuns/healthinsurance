// ---------------------------------------------------------------------------
//  Fetcher — GI Council SEGMENTWISE REPORT, FULL-FISCAL-YEAR (annual) cut.
//
//  Source listing (the page Neha uses):
//    https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report-on-homepage/
//  Each "Segment wise report <Month> <Year>" XLSX is CUMULATIVE "for the period
//  up to <Month>". Only the MARCH editions (and the later "final segment YY-YY"
//  re-issues) cover a complete fiscal year, so ONLY those may fill an FY column.
//  Partial-year editions (April, July, December…) are never promoted to an FY
//  value — that would silently present 9 months as 12.
//
//  Every full-FY workbook has 4 sheets; we read 3:
//    • "Health Portfolio"      — per-insurer Health-Retail / Health-Group /
//      Health-Government / Overseas Medical / Grand Total, grouped into
//      General Insurers and Stand-alone Health Insurers, with printed
//      sub-totals and an Industry Total. Each data row is followed by a
//      "Previous Year" row — the report restates the prior FY alongside.
//    • "Segmentwise Report"    — per-insurer Fire / Marine / Motor / Health /
//      … / Grand Total. We take the Industry Total (+ its Previous Year).
//    • "Miscellaneous portfolio" — Crop Insurance column (Industry Total).
//
//  CANONICAL-VALUE RULE (matches industry-segment-premium.json, 2026-06-10):
//  for any fiscal year, the newest GIC statement wins — FY25 is taken from the
//  March-2026 report's "Previous Year" rows (GIC's latest, restated statement
//  of FY25), not from the FY25 report itself. Both are parsed; the older one
//  simply loses to the newer on merge order. Within one report period a
//  "final" edition outranks the provisional March edition.
//
//  What it emits:
//    • target 'industry-segment-premium'  (existing snapshot, gap-fill only —
//      the merge pin-guard keeps every already-trusted value untouched):
//      health / motor / fire / crop / marine / other / total per FY.
//      other = total − health − motor (identity over the same printed row).
//    • target 'gic-health-portfolio'      (new snapshot): per FY —
//      per-insurer health premium (retail / group / govt / overseas / total)
//      for the insurers the workbook tracks, plus carrier-type aggregates:
//      SAHI + GENERAL + INDUSTRY as printed; PSUs (sum of the 4 public-sector
//      general insurers), Private (= GENERAL − PSUs) and Others-retail
//      (= INDUSTRY retail − the 11 named insurers) derived by exact arithmetic
//      over rows printed in the SAME table — each tagged with its derivation.
//      Anything that can't be derived from complete printed rows stays null
//      with a warning. Missing is never zero.
//
//  REACHABILITY: gicouncil.in 403s datacenter IPs. A live run works from a
//  residential/in-region network or with INGEST_FETCH_PROXY; otherwise the
//  fetcher uses (a) files dropped into data/raw/gicouncil/segment-annual/
//  (any filename containing "march <year>" or "final segment yy-yy"), and
//  (b) the checksum-manifested official files already committed under
//  data/agent-pulls/. No file, no number — months without a source stay
//  an honest pending.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult, SnapshotRecord } from './types'
import type { XlsxRow } from './parsers'
import { fetchBuffer, fetchHtml, findLinks, parseXlsx, toNumber } from './parsers'
import { appendLog, ensureDir, fileExists, isOfflineMode, nowIso, writeRaw, RAW_ROOT, PROCESSED_ROOT, REPO_ROOT } from './util'
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

const SOURCE_ID = 'gicouncil_segmentwise_annual'
const LISTING_URLS = [
  'https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report-on-homepage/',
  'https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report/',
]
const RAW_SUBDIR = 'gicouncil/segment-annual' // full-FY drops (any recognisable name)
const RAW_SUBDIR_MONTHLY = 'gicouncil/segment' // shared with the monthly fetcher (<YYYY-MM>.xlsx)
const MAX_LISTING_PAGES = 8

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

// Official full-FY files already pulled (muns agent, sha256 in the adjacent
// manifest.json files). Used when no newer staged/live file covers the FY.
interface CommittedSource { period: string; kind: 'march' | 'final'; path: string; url: string }
const COMMITTED_SOURCES: CommittedSource[] = [
  {
    period: '2024-03', kind: 'march',
    path: 'data/agent-pulls/gicouncil-segment/sources/segment_march_2024-16.xlsx',
    url: 'https://www.gicouncil.in/media/4418/segment_march_2024-16.xlsx',
  },
  {
    period: '2025-03', kind: 'final',
    path: 'data/agent-pulls/gicouncil-segment/sources/final-segment-24-25.xlsx',
    url: 'https://www.gicouncil.in/media/4513/final-segment-24-25.xlsx',
  },
  {
    period: '2026-03', kind: 'march',
    path: 'data/agent-pulls/industry-segment-history/sources/segment_march_2026-170426.xlsx',
    url: 'https://www.gicouncil.in/media/4638/segment_march_2026-170426.xlsx',
  },
]

// Insurers the Industry Growth sheet tracks (template ids). Matched
// case-insensitively as substrings of the workbook's name cell, within the
// carrier group the row sits in. Historical SAHI names are kept so older
// reports (FY18-FY23 drops) fill the back years automatically.
const SAHI_ALIASES: Record<string, string[]> = {
  'star-health': ['star health'],
  'care-health': ['care health', 'religare health'],
  'niva-bupa': ['niva bupa', 'max bupa'],
  'aditya-birla': ['aditya birla'],
  manipalcigna: ['manipalcigna', 'manipal cigna', 'cigna ttk'],
  'galaxy-health': ['galaxy health'],
  'narayana-health': ['narayana health'],
  'reliance-health': ['reliance health'],
  'hdfc-ergo': ['hdfc ergo health', 'apollo munich'], // the SAHI-era entity
}
const GENERAL_ALIASES: Record<string, string[]> = {
  'hdfc-ergo': ['hdfc ergo'],
  'new-india': ['new india'],
  'national-insurance': ['national insurance'],
  'icici-lombard': ['icici lombard'],
  'oriental-insurance': ['oriental insurance'],
  'united-india': ['united india'],
}
// The 4 public-sector general insurers — the "PSUs" carrier row.
const PSU_IDS = ['national-insurance', 'new-india', 'oriental-insurance', 'united-india']
// The named rows of the template's "Retail health premium by insurer" section;
// its "Others" row = Industry retail − exactly these.
const RETAIL_NAMED_IDS = [
  'star-health', 'care-health', 'niva-bupa', 'hdfc-ergo', 'new-india', 'national-insurance',
  'icici-lombard', 'aditya-birla', 'oriental-insurance', 'united-india', 'manipalcigna',
]

// ── small helpers ──────────────────────────────────────────────────────────

const norm = (v: unknown): string => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const clean = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim()
const r2 = (v: number): number => Math.round(v * 100) / 100
// The report prints ₹ Cr to 2dp; workbook cells carry float dust beyond that.
const num2 = (v: unknown): number | null => {
  const n = toNumber(v)
  return n == null ? null : r2(n)
}

function fyOfPeriod(period: string): string {
  // '2026-03' → FY26 (the report "up to March 2026" covers FY26 in full).
  return `FY${period.slice(2, 4)}`
}
function prevFy(fy: string): string {
  return `FY${String(Number(fy.slice(2)) - 1).padStart(2, '0')}`
}

interface HealthFields {
  health_retail: number | null
  health_group: number | null
  health_govt: number | null
  overseas_medical: number | null
  health_total: number | null
}
const emptyHealth = (): HealthFields => ({
  health_retail: null, health_group: null, health_govt: null, overseas_medical: null, health_total: null,
})

interface IndustrySegments {
  fire: number | null
  marine: number | null
  motor: number | null
  health: number | null
  crop: number | null
  total: number | null
}

interface InsurerRow {
  company_id: string | null // null = present in the file but not template-tracked
  insurer_name: string
  carrier_group: 'general' | 'sahi'
  current: HealthFields
  previous: HealthFields
}

interface FileParse {
  insurers: InsurerRow[]
  aggregates: {
    GENERAL: { current: HealthFields; previous: HealthFields } | null
    SAHI: { current: HealthFields; previous: HealthFields } | null
    INDUSTRY: { current: HealthFields; previous: HealthFields } | null
  }
  segments: { current: IndustrySegments; previous: IndustrySegments }
  warnings: string[]
}

// ── source-file classification & resolution ────────────────────────────────

interface SourceFile {
  period: string // YYYY-03 — the "up to March <year>" period
  kind: 'march' | 'final'
  buffer: Buffer
  source_url: string
  raw_file: string // repo-relative path of the file actually parsed
}

/** Classify a filename / link text as a full-FY edition (march or final) or a
 *  partial-year month ('YYYY-MM', never used for FY columns) or null. */
export function classifySegmentFile(s: string): { period: string; kind: 'march' | 'final' } | { monthly: string } | null {
  const t = s.toLowerCase()
  const fin = t.match(/final[\s_-]*segment[\s_-]*(\d{2})[\s_-]*-?[\s_-]*(\d{2})/)
  if (fin) return { period: `20${fin[2]}-03`, kind: 'final' }
  for (let m = 0; m < 12; m++) {
    const re = new RegExp(`segment[\\s_-]*(?:wise[\\s_-]*report[\\s_-]*)?${MONTH_NAMES[m]}[\\s_-]*(\\d{4})`)
    const hit = t.match(re)
    if (hit) {
      const period = `${hit[1]}-${String(m + 1).padStart(2, '0')}`
      return m === 2 ? { period, kind: 'march' } : { monthly: period }
    }
  }
  return null
}

/** Discover segment-report links on the listing page(s), following simple
 *  numbered pagination. Best-effort: the site 403s datacenter IPs. */
async function discoverListing(warnings: string[]): Promise<Array<{ url: string; text: string }>> {
  const seen = new Set<string>()
  const out: Array<{ url: string; text: string }> = []
  for (const base of LISTING_URLS) {
    const queue = [base]
    const visited = new Set<string>()
    while (queue.length > 0 && visited.size < MAX_LISTING_PAGES) {
      const pageUrl = queue.shift()!
      if (visited.has(pageUrl)) continue
      visited.add(pageUrl)
      let $: Awaited<ReturnType<typeof fetchHtml>>
      try {
        $ = await fetchHtml(pageUrl)
      } catch (err) {
        warnings.push(`listing fetch failed (${pageUrl}): ${err instanceof Error ? err.message : String(err)}`)
        break // same host — the next page would fail the same way
      }
      const fileLinks = findLinks($, pageUrl, (href, text) =>
        /\.(xlsx|xls)(\?|$)/i.test(href) && /segment/i.test(`${href} ${text}`))
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')?.trim()
        const text = clean($(el).text())
        if (!href) return
        const abs = href.startsWith('http') ? href : new URL(href, pageUrl).toString()
        if (fileLinks.includes(abs) && !seen.has(abs)) {
          seen.add(abs)
          out.push({ url: abs, text })
        }
        // numbered pager / rel=next links on the same listing path
        const isPager = /^\d+$/.test(text) || /next|»/i.test(text) || $(el).attr('rel') === 'next'
        if (isPager && abs.startsWith(base.split('?')[0].replace(/\/$/, '')) && !visited.has(abs)) queue.push(abs)
      })
    }
    if (out.length > 0) break // first listing URL that works is enough
  }
  return out
}

async function sha256(buf: Buffer): Promise<string> {
  return createHash('sha256').update(buf).digest('hex')
}

interface ManifestEntry { filename: string; url: string; bytes: number; sha256: string; fetched_at: string }

/** Gather every available full-FY file: staged drops, committed agent pulls,
 *  and (live mode) fresh downloads from the listing page. One file per
 *  (period, kind); staged drops outrank committed copies of the same edition. */
async function resolveSources(warnings: string[]): Promise<SourceFile[]> {
  const byEdition = new Map<string, SourceFile>() // `${period}:${kind}`
  const put = (f: SourceFile, overwrite: boolean) => {
    const k = `${f.period}:${f.kind}`
    if (overwrite || !byEdition.has(k)) byEdition.set(k, f)
  }

  // 1. Committed official pulls (lowest precedence — same bytes, just older copies).
  for (const c of COMMITTED_SOURCES) {
    const abs = resolve(REPO_ROOT, c.path)
    if (!(await fileExists(abs))) continue
    put({ period: c.period, kind: c.kind, buffer: await readFile(abs), source_url: c.url, raw_file: c.path }, false)
  }

  // 2. Staged drops in data/raw/gicouncil/segment-annual/ (manual fallback).
  const stagedDir = resolve(RAW_ROOT, RAW_SUBDIR)
  for (const name of (await readdir(stagedDir).catch(() => [] as string[]))) {
    if (!/\.(xlsx|xls)$/i.test(name) || name.startsWith('~')) continue
    const cls = classifySegmentFile(name)
    if (!cls || !('period' in cls)) {
      if (cls === null) warnings.push(`staged file not recognised as a segment report (skipped): ${name}`)
      continue // monthly editions never fill FY columns
    }
    const abs = resolve(stagedDir, name)
    put({
      period: cls.period, kind: cls.kind, buffer: await readFile(abs),
      source_url: LISTING_URLS[0], raw_file: relative(REPO_ROOT, abs),
    }, true)
  }

  // 3. Live discovery + download (needs a non-datacenter egress or the proxy).
  if (!isOfflineMode()) {
    const links = await discoverListing(warnings)
    const manifestPath = resolve(stagedDir, 'manifest.json')
    const manifest: { files: Record<string, ManifestEntry> } = await readFile(manifestPath, 'utf8')
      .then((t) => JSON.parse(t))
      .catch(() => ({ files: {} }))
    for (const { url, text } of links) {
      const cls = classifySegmentFile(`${url} ${text}`)
      if (!cls) continue
      try {
        if ('monthly' in cls) {
          // Bonus: stage partial-year editions for the MONTHLY fetcher (only;
          // they are structurally barred from the annual path).
          const monthlyPath = resolve(RAW_ROOT, RAW_SUBDIR_MONTHLY, `${cls.monthly}.xlsx`)
          if (!(await fileExists(monthlyPath))) {
            const { buffer } = await fetchBuffer(url)
            await writeRaw(RAW_SUBDIR_MONTHLY, `${cls.monthly}.xlsx`, buffer)
          }
          continue
        }
        const filename = `${fyOfPeriod(cls.period)}-${cls.kind}.xlsx`
        if (manifest.files[url] && byEdition.has(`${cls.period}:${cls.kind}`)) continue // already have this edition
        const { buffer } = await fetchBuffer(url)
        const raw = await writeRaw(RAW_SUBDIR, filename, buffer)
        manifest.files[url] = {
          filename, url, bytes: buffer.length, sha256: await sha256(buffer), fetched_at: nowIso(),
        }
        put({ period: cls.period, kind: cls.kind, buffer, source_url: url, raw_file: relative(REPO_ROOT, raw) }, true)
      } catch (err) {
        warnings.push(`download failed (${url}): ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (Object.keys(manifest.files).length > 0) {
      await ensureDir(stagedDir)
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    }
  }

  // Newest period first; within a period the final edition outranks provisional.
  return [...byEdition.values()].sort((a, b) =>
    a.period === b.period ? (a.kind === 'final' ? -1 : 1) : (a.period < b.period ? 1 : -1))
}

// ── sheet parsing ───────────────────────────────────────────────────────────

function findSheet(sheets: Record<string, XlsxRow[]>, re: RegExp): XlsxRow[] | null {
  const name = Object.keys(sheets).find((n) => re.test(n))
  return name ? sheets[name] : null
}

/** Locate the header row + column index per normalised alias. */
function headerCols(rows: XlsxRow[], wanted: Record<string, string[]>): { headerIdx: number; col: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const col: Record<string, number> = {}
    rows[i].forEach((cell, j) => {
      const c = norm(cell)
      if (!c) return
      for (const [key, aliases] of Object.entries(wanted)) {
        if (col[key] == null && aliases.some((a) => c === a || c.startsWith(a))) col[key] = j
      }
    })
    if (Object.keys(col).length >= Math.min(3, Object.keys(wanted).length)) return { headerIdx: i, col }
  }
  return null
}

const isPrevRow = (name: string): boolean => /^previous year/i.test(name)
const isNoiseRow = (name: string): boolean =>
  /%|market share|growth/i.test(name) || name.length > 90 || /irdai has/i.test(name)

function readHealth(row: XlsxRow, col: Record<string, number>): HealthFields {
  const pick = (k: string): number | null => (col[k] == null ? null : num2(row[col[k]]))
  return {
    health_retail: pick('retail'),
    health_group: pick('group'),
    health_govt: pick('govt'),
    overseas_medical: pick('overseas'),
    health_total: pick('total'),
  }
}

/** Parse the "Health Portfolio" sheet: per-insurer rows (current + the
 *  interleaved "Previous Year" restatement) within their carrier group, plus
 *  the printed GENERAL / SAHI / INDUSTRY aggregates. */
function parseHealthPortfolio(rows: XlsxRow[], warnings: string[]): Pick<FileParse, 'insurers' | 'aggregates'> | null {
  const hdr = headerCols(rows, {
    retail: ['healthretail'],
    group: ['healthgroup'],
    govt: ['healthgovernment', 'healthgovt'],
    overseas: ['overseasmedical', 'overseasmediclaim'],
    total: ['grandtotal'],
  })
  if (!hdr || hdr.col.retail == null || hdr.col.total == null) {
    warnings.push('Health Portfolio: header row not found — format changed?')
    return null
  }
  const { headerIdx, col } = hdr

  const insurers: InsurerRow[] = []
  const aggregates: FileParse['aggregates'] = { GENERAL: null, SAHI: null, INDUSTRY: null }
  let group: 'general' | 'sahi' | 'specialised' | null = null
  let untracked = 0

  // Pending row waiting for its "Previous Year" line.
  let pending: { apply: (prev: HealthFields) => void } | null = null

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const name = clean(row[0])
    if (!name) continue

    if (isPrevRow(name)) {
      pending?.apply(readHealth(row, col))
      pending = null
      continue
    }
    pending = null

    if (/^general insurers$/i.test(name)) { group = 'general'; continue }
    if (/stand-?alone health insurers/i.test(name)) { group = 'sahi'; continue }
    if (/^specialised insurers/i.test(name)) { group = 'specialised'; continue }
    if (isNoiseRow(name)) continue

    const values = readHealth(row, col)
    const hasNumbers = Object.values(values).some((v) => v != null)
    if (!hasNumbers) continue

    if (/general insurers sub ?total/i.test(name)) {
      aggregates.GENERAL = { current: values, previous: emptyHealth() }
      pending = { apply: (p) => { aggregates.GENERAL!.previous = p } }
      continue
    }
    if (/stand-?alone health sub ?total/i.test(name)) {
      aggregates.SAHI = { current: values, previous: emptyHealth() }
      pending = { apply: (p) => { aggregates.SAHI!.previous = p } }
      continue
    }
    if (/^industry total/i.test(name)) {
      aggregates.INDUSTRY = { current: values, previous: emptyHealth() }
      pending = { apply: (p) => { aggregates.INDUSTRY!.previous = p } }
      continue
    }
    if (/sub ?total/i.test(name)) continue // specialised etc.

    if (group !== 'general' && group !== 'sahi') continue
    const aliases = group === 'sahi' ? SAHI_ALIASES : GENERAL_ALIASES
    const lname = name.toLowerCase()
    let companyId: string | null = null
    for (const [id, names] of Object.entries(aliases)) {
      if (names.some((a) => lname.includes(a))) { companyId = id; break }
    }
    if (!companyId) untracked++
    const rec: InsurerRow = {
      company_id: companyId, insurer_name: name.slice(0, 80), carrier_group: group,
      current: values, previous: emptyHealth(),
    }
    insurers.push(rec)
    pending = { apply: (p) => { rec.previous = p } }
  }

  if (!aggregates.INDUSTRY) warnings.push('Health Portfolio: Industry Total row not found.')
  if (untracked > 0 && insurers.length === untracked) warnings.push('Health Portfolio: no tracked insurer matched — alias table stale?')
  return { insurers, aggregates }
}

/** Industry Total (+ Previous Year) of a one-table sheet, given column aliases. */
function industryTotalsOf(
  rows: XlsxRow[], wanted: Record<string, string[]>, sheetLabel: string, warnings: string[],
): { current: Record<string, number | null>; previous: Record<string, number | null> } | null {
  const hdr = headerCols(rows, wanted)
  if (!hdr) {
    warnings.push(`${sheetLabel}: header row not found — format changed?`)
    return null
  }
  const read = (row: XlsxRow): Record<string, number | null> =>
    Object.fromEntries(Object.keys(wanted).map((k) => [k, hdr.col[k] == null ? null : num2(row[hdr.col[k]])]))
  for (let i = hdr.headerIdx + 1; i < rows.length; i++) {
    const name = clean(rows[i][0])
    if (!/^industry total/i.test(name)) continue
    const next = rows[i + 1] && isPrevRow(clean(rows[i + 1][0])) ? rows[i + 1] : null
    if (!next) warnings.push(`${sheetLabel}: Industry Total has no Previous Year row.`)
    return { current: read(rows[i]), previous: next ? read(next) : Object.fromEntries(Object.keys(wanted).map((k) => [k, null])) }
  }
  warnings.push(`${sheetLabel}: Industry Total row not found.`)
  return null
}

function parseWorkbook(buffer: Buffer, warnings: string[]): FileParse | null {
  const { sheets } = parseXlsx(buffer)
  const hp = findSheet(sheets, /health\s*portfolio/i)
  const sw = findSheet(sheets, /segment\s*wise|segmentwise/i)
  const misc = findSheet(sheets, /miscellaneous/i)
  if (!hp || !sw) {
    warnings.push('expected sheets ("Health Portfolio" + "Segmentwise Report") not found — not a full-FY segment workbook?')
    return null
  }

  const portfolio = parseHealthPortfolio(hp, warnings)
  if (!portfolio) return null

  const swTotals = industryTotalsOf(sw, {
    fire: ['fire'], marine: ['marinetotal'], motor: ['motortotal'],
    health: ['health'], total: ['grandtotal'],
  }, 'Segmentwise Report', warnings)
  const miscTotals = misc
    ? industryTotalsOf(misc, { crop: ['cropinsurance'] }, 'Miscellaneous portfolio', warnings)
    : null

  const seg = (which: 'current' | 'previous'): IndustrySegments => ({
    fire: swTotals?.[which].fire ?? null,
    marine: swTotals?.[which].marine ?? null,
    motor: swTotals?.[which].motor ?? null,
    health: swTotals?.[which].health ?? null,
    crop: miscTotals?.[which].crop ?? null,
    total: swTotals?.[which].total ?? null,
  })
  const segments = { current: seg('current'), previous: seg('previous') }

  // Cross-foot: the Segmentwise health column must equal the Health Portfolio
  // Industry Total (same statement, two sheets).
  const hpTotal = portfolio.aggregates.INDUSTRY?.current.health_total
  if (hpTotal != null && segments.current.health != null && Math.abs(hpTotal - segments.current.health) > Math.max(1, hpTotal * 0.001)) {
    warnings.push(`health cross-check failed: Health Portfolio ${hpTotal} vs Segmentwise ${segments.current.health}.`)
  }
  return { ...portfolio, segments, warnings: [] }
}

// ── derive carrier-type aggregates (exact arithmetic over printed rows) ─────

interface EntityValues extends HealthFields {
  entity: string
  carrier_group: 'general' | 'sahi' | 'aggregate'
  insurer_name: string | null
  derivation: string | null
}

function sumFields(rows: HealthFields[]): HealthFields {
  const out = emptyHealth()
  for (const k of Object.keys(out) as (keyof HealthFields)[]) {
    const vals = rows.map((r) => r[k])
    out[k] = vals.some((v) => v == null) ? null : r2((vals as number[]).reduce((a, b) => a + b, 0))
  }
  return out
}
function subFields(a: HealthFields, b: HealthFields): HealthFields {
  const out = emptyHealth()
  for (const k of Object.keys(out) as (keyof HealthFields)[]) {
    out[k] = a[k] == null || b[k] == null ? null : r2(a[k]! - b[k]!)
  }
  return out
}

/** One fiscal year's entity table out of a parsed file (current or previous columns). */
function entitiesForYear(parse: FileParse, which: 'current' | 'previous', fy: string, warnings: string[]): EntityValues[] {
  const out: EntityValues[] = []
  const pick = (r: { current: HealthFields; previous: HealthFields }) => r[which]

  // Tracked insurer rows. A company can legitimately be absent (not yet
  // licensed / merged away) — absent means NO row, never a zero.
  const byId = new Map<string, InsurerRow[]>()
  for (const r of parse.insurers) {
    if (!r.company_id) continue
    const rows = byId.get(`${r.company_id}:${r.carrier_group}`) ?? []
    rows.push(r)
    byId.set(`${r.company_id}:${r.carrier_group}`, rows)
  }
  for (const [key, rows] of byId) {
    const [id, grp] = key.split(':')
    if (rows.length > 1) warnings.push(`${fy}: ${id} matched ${rows.length} rows in the ${grp} block — using the first.`)
    const v = pick(rows[0])
    if (Object.values(v).every((x) => x == null)) continue
    out.push({ entity: id, carrier_group: grp as 'general' | 'sahi', insurer_name: rows[0].insurer_name, derivation: null, ...v })
  }

  const agg = parse.aggregates
  const printed = (
    entity: string, src: { current: HealthFields; previous: HealthFields } | null, label: string,
  ): HealthFields | null => {
    if (!src) return null
    const v = pick(src)
    if (Object.values(v).every((x) => x == null)) return null
    out.push({ entity, carrier_group: 'aggregate', insurer_name: label, derivation: null, ...v })
    return v
  }
  const general = printed('GENERAL', agg.GENERAL, 'General Insurers Sub Total (as printed)')
  printed('SAHI', agg.SAHI, 'Stand-alone Health sub Total (as printed)')
  const industry = printed('INDUSTRY', agg.INDUSTRY, 'Industry Total (as printed)')

  // PSUs = the 4 public-sector general insurers, summed from their printed rows.
  const psuRows = PSU_IDS
    .map((id) => parse.insurers.find((r) => r.company_id === id && r.carrier_group === 'general'))
    .filter((r): r is InsurerRow => r != null)
  if (psuRows.length === 4) {
    const psu = sumFields(psuRows.map(pick))
    if (psu.health_total != null) {
      out.push({
        entity: 'PSUs', carrier_group: 'aggregate', insurer_name: 'Public-sector general insurers',
        derivation: 'sum of the printed National + New India + Oriental + United India rows', ...psu,
      })
      // Private general insurers = printed General Insurers Sub Total − PSUs.
      if (general) {
        const priv = subFields(general, psu)
        if (priv.health_total != null) {
          out.push({
            entity: 'Private', carrier_group: 'aggregate', insurer_name: 'Private general insurers',
            derivation: 'printed General Insurers Sub Total − the 4 public-sector insurers', ...priv,
          })
        }
      }
    } else {
      warnings.push(`${fy}: a PSU row has a blank health total — PSUs/Private left null (not under-reported).`)
    }
  } else {
    warnings.push(`${fy}: found ${psuRows.length}/4 PSU rows — PSUs/Private left null.`)
  }

  // Others (retail) = Industry retail − the 11 named insurers. Only emitted when
  // every named row is present AND the sheet's own rows re-add to the printed
  // Industry Total (so a mis-parsed row can't inflate "Others").
  if (industry?.health_retail != null) {
    const named = RETAIL_NAMED_IDS.map((id) =>
      parse.insurers.find((r) => r.company_id === id && (id !== 'hdfc-ergo' ? true : r.carrier_group === 'general'))
      ?? parse.insurers.find((r) => r.company_id === id))
    const present = named.filter((r): r is InsurerRow => r != null)
    const allRows = parse.insurers.map((r) => pick(r).health_retail)
    const coverage = allRows.some((v) => v == null) ? null : r2((allRows as number[]).reduce((a, b) => a + b, 0))
    const tol = Math.max(1, industry.health_retail * 0.002)
    if (present.length === RETAIL_NAMED_IDS.length || which === 'previous' || present.length >= 9) {
      const namedVals = present.map((r) => pick(r).health_retail)
      if (!namedVals.some((v) => v == null) && coverage != null && Math.abs(coverage - industry.health_retail) <= tol) {
        const namedSum = (namedVals as number[]).reduce((a, b) => a + b, 0)
        out.push({
          entity: 'Others', carrier_group: 'aggregate', insurer_name: 'All other insurers (retail health)',
          derivation: `printed Industry Total retail − the ${present.length} named insurer rows`,
          ...emptyHealth(), health_retail: r2(industry.health_retail - namedSum),
        })
      } else if (coverage == null || Math.abs(coverage - (industry.health_retail ?? 0)) > tol) {
        warnings.push(`${fy}: insurer retail rows do not re-add to the printed Industry Total — "Others" left null.`)
      }
    } else {
      warnings.push(`${fy}: only ${present.length}/${RETAIL_NAMED_IDS.length} named retail rows found — "Others" left null.`)
    }
  }
  return out
}

// ── orchestration ───────────────────────────────────────────────────────────

interface YearStatement {
  fy: string
  recency: string // sortable: file period + edition; newest statement wins
  file: SourceFile
  basis: 'current-year columns' | 'prior-year comparative columns'
  entities: EntityValues[]
  segments: IndustrySegments
  periodLabel: string
}

export const ingestGicouncilSegmentAnnual: Fetcher = {
  source_id: SOURCE_ID,
  name: 'GI Council Segmentwise Report — full fiscal years (health portfolio + carrier mix)',
  // The new March edition appears in April and the "final" re-issue mid-year:
  // checking on the monthly cadence picks both up promptly; no-ops in between.
  frequency: 'monthly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const warnings: string[] = []
    const files = await resolveSources(warnings)

    const statements: YearStatement[] = []
    for (const file of files) {
      const fileWarnings: string[] = []
      let parse: FileParse | null = null
      try {
        parse = parseWorkbook(file.buffer, fileWarnings)
      } catch (err) {
        fileWarnings.push(`parse error: ${err instanceof Error ? err.message : String(err)}`)
      }
      warnings.push(...fileWarnings.map((w) => `${file.raw_file}: ${w}`))
      if (!parse) continue

      const fy = fyOfPeriod(file.period)
      const editionRank = file.kind === 'final' ? 'F' : 'P'
      const label = `upto March ${file.period.slice(0, 4)} (${fy}, ${file.kind === 'final' ? 'final' : 'provisional & unaudited'})`
      statements.push({
        fy, recency: `${file.period}${editionRank}`, file, basis: 'current-year columns',
        entities: entitiesForYear(parse, 'current', fy, warnings),
        segments: parse.segments.current, periodLabel: label,
      })
      statements.push({
        fy: prevFy(fy), recency: `${file.period}${editionRank}`, file, basis: 'prior-year comparative columns',
        entities: entitiesForYear(parse, 'previous', prevFy(fy), warnings),
        segments: parse.segments.previous, periodLabel: label,
      })
    }

    // The NEWEST GIC statement of each FY is canonical (restatements win).
    // Older statements are kept only where they contribute a field the newer
    // ones don't carry (e.g. a column dropped from a later edition), and are
    // emitted BEFORE the newer so the merge lands on the newest value. This
    // also makes reruns no-ops instead of re-playing superseded numbers.
    const byFy = new Map<string, YearStatement[]>()
    for (const st of statements) {
      byFy.set(st.fy, [...(byFy.get(st.fy) ?? []), st])
    }
    const kept: YearStatement[] = []
    for (const sts of byFy.values()) {
      sts.sort((a, b) => (a.recency > b.recency ? -1 : a.recency < b.recency ? 1 : a.basis === 'current-year columns' ? -1 : 1))
      const covered = new Set<string>()
      for (const st of sts) {
        let contributes = false
        const fieldKeys = (st: YearStatement): string[] => [
          ...Object.entries(st.segments).filter(([, v]) => v != null).map(([k]) => `seg:${k}`),
          ...st.entities.flatMap((e) =>
            (Object.keys(emptyHealth()) as (keyof HealthFields)[])
              .filter((k) => e[k] != null)
              .map((k) => `${e.entity}:${e.carrier_group}:${k}`)),
        ]
        for (const key of fieldKeys(st)) {
          if (!covered.has(key)) {
            covered.add(key)
            contributes = true
          }
        }
        if (contributes) kept.push(st)
      }
    }
    kept.sort((a, b) => (a.recency < b.recency ? -1 : a.recency > b.recency ? 1 : a.basis === 'prior-year comparative columns' ? -1 : 1))

    const records: SnapshotRecord[] = []
    for (const st of kept) {
      const provenance = {
        source_name: `GI Council Segment-wise Report (${st.periodLabel}) — ${st.basis}`,
        source_url: st.file.source_url,
        source_file: st.file.raw_file,
        source_period: st.fy,
        fetched_at,
        parsed_at: nowIso(),
        parser_name: 'ingest-gicouncil-segment-annual',
        confidence: 'high' as const,
      }

      // 1. Industry segment totals (gap-fill of the existing snapshot).
      const s = st.segments
      const other = s.total != null && s.health != null && s.motor != null ? r2(s.total - s.health - s.motor) : null
      if (Object.values(s).some((v) => v != null)) {
        records.push({
          target: 'industry-segment-premium',
          keys: { period: st.fy },
          values: {
            period_type: 'annual', fiscal_year: st.fy,
            health_premium: s.health, motor_premium: s.motor, fire_premium: s.fire,
            crop_premium: s.crop, marine_premium: s.marine, other_premium: other,
            total_gi_premium: s.total,
            health_share: s.total && s.health != null ? Math.round((s.health / s.total) * 1000) / 10 : null,
            motor_share: s.total && s.motor != null ? Math.round((s.motor / s.total) * 1000) / 10 : null,
          },
          provenance,
        })
      }

      // 2. Health-portfolio entities (per-insurer + carrier-type aggregates).
      for (const e of st.entities) {
        records.push({
          target: 'gic-health-portfolio',
          keys: { fiscal_year: st.fy, entity: e.entity, carrier_group: e.carrier_group },
          values: {
            insurer_name: e.insurer_name,
            health_retail: e.health_retail, health_group: e.health_group,
            health_govt: e.health_govt, overseas_medical: e.overseas_medical,
            health_total: e.health_total,
            basis: e.derivation ? `derived: ${e.derivation}` : 'as printed in the report',
            source_basis: st.basis,
            period_label: `For the period up to March 20${st.fy.slice(2)}`,
          },
          provenance,
        })
      }
    }

    // Honest processed sidecar — which file "won" each FY, for review.
    const winners: Record<string, { file: string; basis: string }> = {}
    for (const st of kept) winners[st.fy] = { file: st.file.raw_file, basis: st.basis }
    await ensureDir(PROCESSED_ROOT)
    await writeFile(resolve(PROCESSED_ROOT, 'gic-segment-annual.json'), JSON.stringify({
      _meta: {
        snapshot_id: 'gic-segment-annual',
        description: 'Full-FY statements extracted from GI Council Segment-wise Reports. For each FY the newest GIC statement wins (a later report\'s restated prior-year columns supersede the year\'s own earlier edition).',
        source_listing: LISTING_URLS[0],
        last_run_at: fetched_at,
        files_used: files.map((f) => ({ period: f.period, kind: f.kind, file: f.raw_file, url: f.source_url })),
        canonical_statement_per_fy: winners,
        warnings: warnings.slice(0, 50),
      },
    }, null, 2) + '\n', 'utf8')

    await appendLog('ingest-gicouncil-segment-annual.log', {
      source: SOURCE_ID, files: files.length, statements: statements.length,
      records: records.length, offline: isOfflineMode(),
    })

    return {
      source_id: SOURCE_ID,
      status: records.length > 0 ? 'success' : 'pending',
      raw_file: files[0]?.raw_file ?? null,
      records,
      records_fetched: records.length,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}
