// ---------------------------------------------------------------------------
//  Fetcher — IRDAI quarterly insurer disclosures (profitability).
//
//  Goal: real STANDALONE quarterly figures (combined ratio, claims ratio,
//  commission/expense ratio, PAT, solvency) for the SAHI peers — the gap the
//  company-site fetchers can't fill because insurer sites (e.g. Niva Bupa) hard
//  block automated downloads. IRDAI's public-disclosure portal carries the same
//  regulator-mandated NL-form data and is reachable from the CI runner (the
//  existing IRDAI monthly fetcher proves runner -> irdai.gov.in works).
//
//  Live mode (INGEST_OFFLINE=0):
//    1. Walk IRDAI public-disclosure landing pages for quarterly insurer files
//       (xlsx / pdf), across the candidate portal URLs IRDAI has used.
//    2. For each insurer + quarter, download -> writeRaw('irdai/quarterly', …).
//    3. Parse the NL-form financial table -> combined ratio, claims/commission/
//       expense ratio, PAT, solvency.
//    4. Emit one provenance-tagged row per (company, quarter, FY) into
//       insurer-quarterly-financials.
//
//  Offline mode:
//    Parse whatever quarterly files are pre-staged under data/raw/irdai/
//    quarterly/. Lets the data be wired in without network once files exist.
//
//  Honesty: anything a pattern can't extract stays null (never a guess). Values
//  pass the same plausibility sanitiser used for company quarterly disclosures.
// ---------------------------------------------------------------------------

import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Fetcher, FetchResult, SnapshotRecord } from './types'
import { appendLog, ensureDir, isOfflineMode, nowIso, readSnapshot, RAW_ROOT } from './util'
import {
  extractByPatterns,
  fetchHtml,
  fetchOrLoadRaw,
  findLinks,
  findRowByAlias,
  parsePdf,
  parseXlsx,
  toNumber,
  type XlsxRow,
} from './parsers'
import { QUARTERLY_PATTERNS, sanitiseQuarterly } from './quarterly-extract'

const SOURCE_ID = 'irdai_quarterly_disclosures'

// IRDAI has hosted public disclosures at a few paths over time; we try each.
// The CI runner reaches irdai.gov.in; whichever resolves first with quarterly
// insurer links wins.
const PORTAL_URLS = [
  'https://irdai.gov.in/online-public-disclosures',
  'https://irdai.gov.in/public-disclosures',
  'https://irdai.gov.in/web/guest/public-disclosures',
]

// Insurer name aliases as they appear in IRDAI NL-form filenames / sheet rows.
const INSURER_ALIASES: Record<string, string[]> = {
  'niva-bupa': ['Niva Bupa', 'Max Bupa', 'NivaBupa'],
  'star-health': ['Star Health', 'Star Health and Allied'],
  'care-health': ['Care Health', 'Religare Health'],
  'aditya-birla': ['Aditya Birla Health', 'Aditya Birla'],
  manipalcigna: ['ManipalCigna', 'Manipal Cigna', 'Manipal'],
}

interface CompanyMaster {
  data: Array<{ company_id: string }>
}

export const ingestIrdaiQuarterly: Fetcher = {
  source_id: SOURCE_ID,
  name: 'IRDAI Quarterly Disclosures (profitability)',
  frequency: 'quarterly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const master = await readSnapshot<CompanyMaster>('company-master.json')
    const ids = master.data.map((c) => c.company_id).filter((id) => INSURER_ALIASES[id])

    const records: SnapshotRecord[] = []
    const warnings: string[] = []

    try {
      const files = isOfflineMode()
        ? await stagedQuarterlyFiles()
        : await discoverQuarterlyFiles(warnings)

      if (files.length === 0) {
        await appendLog('ingest-irdai-quarterly.log', { source: SOURCE_ID, status: 'no_files', offline: isOfflineMode() })
        return {
          source_id: SOURCE_ID,
          status: 'pending',
          raw_file: null,
          records: [],
          records_fetched: 0,
          fetched_at,
          warnings: warnings.length ? warnings : ['No IRDAI quarterly disclosure files found (portal layout may have shifted, or none staged offline).'],
        }
      }

      for (const f of files) {
        try {
          const { buffer, raw_file } = await fetchOrLoadRaw(f.url, 'irdai/quarterly', f.filename, /\.(pdf|xlsx|xls)$/i)
          const quarter = inferQuarter(f.filename)
          const fy = inferFY(f.filename)
          if (!quarter || !fy) {
            warnings.push(`Could not infer quarter/FY from ${f.filename} — skipped.`)
            continue
          }

          // A single IRDAI file may be one insurer (NL-form) or a consolidated
          // workbook with one row/section per insurer. Handle both.
          const perInsurer = /\.(xlsx|xls)$/i.test(f.filename)
            ? extractFromXlsx(buffer, ids)
            : await extractQuarterlyPdf(buffer, ids, f.filename)

          for (const [companyId, values] of Object.entries(perInsurer)) {
            const populated = Object.values(values).filter((v) => v != null).length
            if (populated === 0) continue
            records.push({
              target: 'insurer-quarterly-financials',
              keys: { company_id: companyId, quarter, fiscal_year: fy },
              values: { ...values, period_type: 'quarterly' },
              provenance: {
                source_name: `IRDAI public disclosure — ${companyId} ${quarter} ${fy}`,
                source_url: f.url,
                source_file: raw_file,
                source_period: `${quarter} ${fy}`,
                fetched_at,
                parsed_at: nowIso(),
                parser_name: 'ingest-irdai-quarterly',
                confidence: 'high',
              },
            })
          }
        } catch (err) {
          warnings.push(`${f.filename}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      await appendLog('ingest-irdai-quarterly.log', {
        source: SOURCE_ID, status: records.length ? 'success' : 'pending', files: files.length, records: records.length,
      })

      return {
        source_id: SOURCE_ID,
        status: records.length > 0 ? 'success' : 'pending',
        raw_file: null,
        records,
        records_fetched: records.length,
        fetched_at,
        warnings: warnings.length ? warnings : undefined,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await appendLog('ingest-irdai-quarterly.log', { source: SOURCE_ID, status: 'error', error })
      return { source_id: SOURCE_ID, status: 'failed', raw_file: null, records: [], records_fetched: 0, fetched_at, error }
    }
  },
}

interface QFile {
  url: string
  filename: string
}

// Walk the candidate portal URLs collecting quarterly insurer disclosure files.
async function discoverQuarterlyFiles(warnings: string[]): Promise<QFile[]> {
  const out: QFile[] = []
  for (const portal of PORTAL_URLS) {
    try {
      const found = await walkPortal(portal, 0)
      out.push(...found)
      if (found.length) break // first portal that yields quarterly files wins
    } catch (err) {
      warnings.push(`${portal}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  // De-dupe by URL.
  const seen = new Set<string>()
  return out.filter((f) => (seen.has(f.url) ? false : (seen.add(f.url), true)))
}

async function walkPortal(url: string, depth: number): Promise<QFile[]> {
  const $ = await fetchHtml(url)
  const host = new URL(url).hostname
  const files = findLinks($, url, (href, text) => {
    if (!/\.(pdf|xlsx|xls)(\?|$)/i.test(href)) return false
    const blob = `${href} ${text}`.toLowerCase()
    // Quarterly + financial-disclosure signal; exclude obvious non-financial.
    return /(q[1-4]|quarter|nl[\s\-_]?\d|public[\s\-_]?disclosure|financial)/.test(blob) && !/grievance|policy|annual[\s\-_]?report/.test(blob)
  }).map((u) => ({ url: u, filename: (u.split('/').pop() ?? 'q.pdf').split('?')[0] }))

  const out = [...files]
  if (depth < 1) {
    const subs = findLinks($, url, (href, text) => {
      if (/\.(pdf|xlsx|xls|zip|jpg|png)(\?|$)/i.test(href)) return false
      return /(disclosure|quarterly|financial|insurer|health)/i.test(`${href} ${text}`)
    })
      .filter((u) => new URL(u).hostname === host)
      .slice(0, 6)
    for (const sub of subs) {
      try {
        out.push(...(await walkPortal(sub, depth + 1)))
      } catch { /* skip unreachable sub-pages */ }
    }
  }
  return out
}

// Offline: list whatever quarterly files were pre-staged for IRDAI.
async function stagedQuarterlyFiles(): Promise<QFile[]> {
  const dir = resolve(RAW_ROOT, 'irdai', 'quarterly')
  await ensureDir(dir)
  const entries = await readdir(dir).catch(() => [] as string[])
  return entries
    .filter((e) => /\.(pdf|xlsx|xls)$/i.test(e))
    .map((e) => ({ url: resolve(dir, e), filename: e }))
}

// ─── Per-insurer extraction ─────────────────────────────────────────────────

type Values = Record<string, number | string | null>

// XLSX: find each insurer's row by alias, map the NL-form ratio columns.
function extractFromXlsx(buffer: Buffer, ids: string[]): Record<string, Values> {
  const { sheets } = parseXlsx(buffer)
  const out: Record<string, Values> = {}
  const allRows: XlsxRow[] = Object.values(sheets).flat()
  // Locate a header row to map column → metric (IRDAI sheets vary in layout).
  const colMap = mapColumns(allRows)
  for (const id of ids) {
    const row = findRowByAlias(allRows, INSURER_ALIASES[id])
    if (!row) continue
    const v: Values = {}
    for (const [metric, idx] of Object.entries(colMap)) {
      v[metric] = idx != null ? toNumber(row[idx]) : null
    }
    out[id] = sanitiseQuarterly(v as Record<string, number | null>)
  }
  return out
}

// Best-effort header → column index map for IRDAI NL-form workbooks.
function mapColumns(rows: XlsxRow[]): Record<string, number | null> {
  const header = rows.find((r) => r.some((c) => /combined\s*ratio|claims?\s*ratio|profit\s*after\s*tax|solvency/i.test(String(c ?? ''))))
  const map: Record<string, number | null> = {
    combined_ratio: null, claims_ratio: null, commission_ratio: null, expense_ratio: null, pat: null, solvency_ratio: null, gwp: null, nwp: null, nep: null,
  }
  if (!header) return map
  header.forEach((cell, i) => {
    const s = String(cell ?? '').toLowerCase()
    if (/combined\s*ratio/.test(s)) map.combined_ratio = i
    else if (/(incurred\s*claims?|claims?\s*ratio|loss\s*ratio)/.test(s)) map.claims_ratio = i
    else if (/commission\s*ratio/.test(s)) map.commission_ratio = i
    else if (/(expense\s*ratio|management\s*expense)/.test(s)) map.expense_ratio = i
    else if (/profit\s*after\s*tax|\bpat\b|net\s*profit/.test(s)) map.pat = i
    else if (/solvency/.test(s)) map.solvency_ratio = i
    else if (/gross\s*written|gross\s*direct\s*premium|\bgwp\b/.test(s)) map.gwp = i
    else if (/net\s*written|\bnwp\b/.test(s)) map.nwp = i
    else if (/net\s*earned|\bnep\b/.test(s)) map.nep = i
  })
  return map
}

// PDF: NL-form text → shared anchored patterns. The filename usually names the
// single insurer; otherwise we attribute to whichever alias appears in the head
// of the document text.
async function extractQuarterlyPdf(buffer: Buffer, ids: string[], filename: string): Promise<Record<string, Values>> {
  const { text } = await parsePdf(buffer)
  const matched = ids.find((id) => INSURER_ALIASES[id].some((a) => filename.toLowerCase().includes(a.toLowerCase().replace(/\s+/g, ''))
    || filename.toLowerCase().includes(a.toLowerCase())))
    ?? ids.find((id) => INSURER_ALIASES[id].some((a) => text.slice(0, 4000).toLowerCase().includes(a.toLowerCase())))
  if (!matched) return {}
  const values = sanitiseQuarterly(extractByPatterns(text, QUARTERLY_PATTERNS))
  return { [matched]: values }
}

// ─── Period inference ───────────────────────────────────────────────────────

function inferQuarter(filename: string): string | null {
  const f = filename.toLowerCase()
  const q = f.match(/\bq([1-4])\b/) ?? f.match(/qtr[\s_-]?([1-4])/)
  if (q) return `Q${q[1]}`
  if (/(?:9|nine)[\s_-]?month|9m|dec(?:ember)?/.test(f)) return 'Q3'
  if (/h1|half[\s_-]?year|six[\s_-]?month|sep(?:tember)?/.test(f)) return 'Q2'
  if (/jun(?:e)?/.test(f)) return 'Q1'
  if (/mar(?:ch)?/.test(f)) return 'Q4'
  return null
}

function inferFY(filename: string): string | null {
  const range = filename.match(/(\d{2,4})\s*[-–_/]\s*(\d{2,4})/)
  if (range) return `FY${range[2].slice(-2).padStart(2, '0')}`
  const fy = filename.match(/\bFY\s*[-]?\s*(?:20)?(\d{2})\b/i)
  if (fy) return `FY${fy[1].padStart(2, '0').slice(-2)}`
  const yr = filename.match(/\b20(\d{2})\b/)
  if (yr) return `FY${yr[1]}`
  return null
}
