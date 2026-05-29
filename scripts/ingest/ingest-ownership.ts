// ---------------------------------------------------------------------------
//  Fetcher — Quarterly shareholding pattern for listed insurers.
//
//  Sources the SEBI-mandated quarterly Shareholding Pattern (SHP) that listed
//  insurers file with NSE / BSE. The form carries promoter / public splits and
//  an institutional breakdown (FII / DII / Mutual Funds) plus the largest
//  individual holders.
//
//  OFFLINE-FIRST, exactly like ingest-company-disclosures:
//    • Live (INGEST_OFFLINE=0): best-effort fetch of the exchange SHP document
//      for the ticker, saved to data/raw/exchanges/<id>/. NSE fronts its APIs
//      with an aggressive anti-bot WAF, so this frequently 403s; that is
//      tolerated per-company (caught, logged, row skipped) and the next
//      offline run replays whatever did download.
//    • Offline: read the most-recent pre-staged SHP file from
//      data/raw/exchanges/<id>/ (PDF / XLSX / HTML / CSV). With nothing staged
//      the fetcher returns an empty-but-valid 'pending' result, never throws.
//
//  Listed insurers only — unlisted entities have no shareholding pattern.
//  Anything we cannot parse stays `null` (never 0) and absent top holders are
//  an empty array, never fabricated.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult, SnapshotRecord } from './types'
import type { OwnershipHolder } from '../../src/data/snapshots/_schemas'
import { appendLog, nowIso, readSnapshot } from './util'
import { fetchOrLoadRaw, parsePdf, parseXlsx, toNumber } from './parsers'
import { extname } from 'node:path'

const SOURCE_ID = 'ownership_quarterly'
const PARSER_NAME = 'ingest-ownership'

interface CompanyMaster {
  data: Array<{
    company_id: string
    listed_status: 'listed' | 'unlisted'
    ticker: string | null
    exchange: 'NSE' | 'BSE' | null
  }>
}

/** Best-effort live SHP document URL for a ticker (NSE preferred, else BSE). */
function shpUrl(ticker: string, exchange: 'NSE' | 'BSE' | null): string {
  if (exchange === 'BSE') {
    // BSE corporate shareholding landing (scrip-code form is dynamic; the
    // ticker route is a stable, scrapeable entry point).
    return `https://www.bseindia.com/corporates/shpPromoterNGroup.aspx?scripcd=${encodeURIComponent(ticker)}`
  }
  // NSE shareholding-pattern API for an equity symbol.
  return `https://www.nseindia.com/api/corporate-shareholdings-patterns?index=equities&symbol=${encodeURIComponent(ticker)}`
}

export const ingestOwnership: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Quarterly shareholding pattern (listed insurers)',
  frequency: 'quarterly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const master = await readSnapshot<CompanyMaster>('company-master.json')
    const listed = master.data.filter((c) => c.listed_status === 'listed' && c.ticker)

    const records: SnapshotRecord[] = []
    const warnings: string[] = []

    for (const c of listed) {
      const url = shpUrl(c.ticker!, c.exchange)
      const filename = `${c.company_id}-shp-${new Date().toISOString().slice(0, 10)}.dat`
      try {
        const { buffer, raw_file, mode } = await fetchOrLoadRaw(
          url,
          `exchanges/${c.company_id}`,
          filename,
          /\.(pdf|xlsx|xls|html?|csv|json|dat)$/i,
        )

        const parsed = await parseShareholding(buffer, raw_file)
        const populated =
          [
            parsed.promoter_share,
            parsed.fii_share,
            parsed.dii_share,
            parsed.mf_share,
            parsed.public_share,
          ].filter((v) => v != null).length + (parsed.top_holders.length > 0 ? 1 : 0)
        if (populated === 0) {
          warnings.push(`${c.company_id}: SHP file at ${raw_file} parsed but no shareholding fields matched.`)
          continue
        }

        const { quarter, fiscal_year } = parsed
        records.push({
          target: 'ownership-snapshot',
          keys: { company_id: c.company_id, quarter, fiscal_year },
          values: {
            promoter_share: parsed.promoter_share,
            fii_share: parsed.fii_share,
            dii_share: parsed.dii_share,
            mf_share: parsed.mf_share,
            public_share: parsed.public_share,
            // top_holders is an array; SnapshotRecord.values is scalar-typed,
            // but the merge writes it through verbatim onto the row (the
            // schema field is OwnershipHolder[]). Cast at the boundary.
            top_holders: parsed.top_holders as unknown as string,
          },
          provenance: {
            source_name: `${c.company_id} shareholding pattern (${quarter} ${fiscal_year})`,
            source_url: url,
            source_file: raw_file,
            source_period: `${quarter} ${fiscal_year}`,
            fetched_at,
            parsed_at: nowIso(),
            parser_name: PARSER_NAME,
            confidence: 'medium',
          },
        })
        await appendLog('ingest-ownership.log', {
          source: SOURCE_ID,
          company_id: c.company_id,
          status: 'parsed',
          mode,
          quarter: `${quarter} ${fiscal_year}`,
          promoter: parsed.promoter_share,
        })
      } catch (err) {
        const error = errMsg(err)
        warnings.push(`${c.company_id}: ${error}`)
        await appendLog('ingest-ownership.log', {
          source: SOURCE_ID,
          company_id: c.company_id,
          status: 'error',
          error,
        })
      }
    }

    return {
      source_id: SOURCE_ID,
      status: records.length > 0 ? 'success' : 'pending',
      raw_file: null,
      records,
      records_fetched: records.length,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

// ─── Shareholding-pattern parsing ────────────────────────────────────────────

interface ParsedShareholding {
  quarter: string
  fiscal_year: string
  promoter_share: number | null
  fii_share: number | null
  dii_share: number | null
  mf_share: number | null
  public_share: number | null
  top_holders: OwnershipHolder[]
}

/**
 * Turn a staged SHP artefact into shareholding buckets. Handles PDF (BSE/NSE
 * SHP tables are plain-text), XLSX (NSE's downloadable pattern), and a generic
 * text/HTML/JSON fallback. All-or-nothing per field — unmatched buckets stay
 * null so the merge gate never sees a fabricated split.
 */
export async function parseShareholding(buffer: Buffer, rawFile: string): Promise<ParsedShareholding> {
  const ext = extname(rawFile).toLowerCase()
  let text: string
  if (ext === '.pdf') {
    text = (await parsePdf(buffer)).text
  } else if (ext === '.xlsx' || ext === '.xls') {
    text = xlsxToText(buffer)
  } else {
    text = buffer.toString('utf8')
  }
  return extractShareholding(text)
}

function xlsxToText(buffer: Buffer): string {
  const { sheets } = parseXlsx(buffer)
  const lines: string[] = []
  for (const rows of Object.values(sheets)) {
    for (const r of rows) lines.push(r.map((c) => (c == null ? '' : String(c))).join(' '))
  }
  return lines.join('\n')
}

/** Percentage immediately following a label, scanning a bounded window. */
function pctNear(text: string, label: RegExp): number | null {
  const re = new RegExp(label.source + '[^\\n%]{0,80}?(\\d{1,3}(?:\\.\\d+)?)\\s*%', label.flags)
  const m = text.match(re)
  if (!m || m[1] == null) return null
  const n = parseFloat(m[1])
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return n
}

export function extractShareholding(text: string): ParsedShareholding {
  const promoter_share =
    pctNear(text, /Promoter\s*(?:&|and)?\s*(?:Promoter)?\s*Group/i) ?? pctNear(text, /Promoters?/i)
  const public_share = pctNear(text, /Public(?:\s+Shareholding)?/i)
  // Institutional sub-buckets. FPI is NSE's modern label for FII.
  const fii_share =
    pctNear(text, /Foreign\s+Portfolio\s+Investors?/i) ??
    pctNear(text, /\bFII?s?\b/i) ??
    pctNear(text, /Foreign\s+Institutional/i)
  const mf_share = pctNear(text, /Mutual\s+Funds?/i)
  const dii_share =
    pctNear(text, /Domestic\s+Institutional\s+Investors?/i) ??
    pctNear(text, /\bDIIs?\b/i) ??
    (mf_share != null ? mf_share : null) // DII at least includes MF when only MF is reported.

  return {
    ...inferQuarterFy(text),
    promoter_share,
    fii_share,
    dii_share,
    mf_share,
    public_share,
    top_holders: extractTopHolders(text),
  }
}

/**
 * Pull named large holders, e.g. lines like "ABC Capital Fund 7.34". Only rows
 * with a plausible percentage (0–100) and a non-numeric name are kept. Capped
 * at 10. Classification is heuristic from the name.
 */
export function extractTopHolders(text: string): OwnershipHolder[] {
  const out: OwnershipHolder[] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z][A-Za-z&.,'()\- ]{4,60}?)\s+(\d{1,2}\.\d{1,2})\s*%?\s*$/)
    if (!m) continue
    const name = m[1].trim().replace(/\s{2,}/g, ' ')
    const share = parseFloat(m[2])
    if (!Number.isFinite(share) || share <= 0 || share > 100) continue
    // Skip section headers / totals and the aggregate institutional-category
    // rows (FPI / DII / MF lines) — those are buckets, not named holders.
    if (
      /^(total|public|promoter|grand|category|particulars|sr\.?\s*no)/i.test(name) ||
      /^(foreign\s+portfolio|foreign\s+institutional|domestic\s+institutional|mutual\s+funds?|insurance\s+companies|alternate\s+investment|bodies\s+corporate|individuals?|non[\s-]?resident|qualified\s+institutional|central\s+government|state\s+government|trusts?|clearing\s+members?)\b/i.test(
        name,
      )
    )
      continue
    out.push({ name, type: classifyHolder(name), share, change: null })
    if (out.length >= 10) break
  }
  return out
}

function classifyHolder(name: string): OwnershipHolder['type'] {
  const n = name.toLowerCase()
  if (/mutual fund|\bmf\b|amc|asset management/.test(n)) return 'MF'
  if (/lic|life insurance|insurance|pension|provident|bank of|sbi|hdfc|icici|kotak|axis/.test(n))
    return 'DII'
  if (/fund|capital|partners|investments?|holdings?|ventures?|llp|pte|inc\.?$|limited partnership/.test(n))
    return 'FII'
  if (/promoter|holdings? (?:pvt|private)|group/.test(n)) return 'Promoter'
  return 'Other'
}

/**
 * SHP filings carry an "as on" quarter-end date. Map it to a quarter label and
 * Indian FY. Falls back to the current quarter if no date is found.
 */
function inferQuarterFy(text: string): { quarter: string; fiscal_year: string } {
  const head = text.slice(0, 4000)
  // "as on 31-Dec-2024", "as on 31st December, 2024", "31/03/2025", "31.12.2024"
  const m =
    head.match(/as\s+on[^0-9]{0,12}(\d{1,2})[\s\-./]*([A-Za-z]+|\d{1,2})[\s\-.,/]*(\d{4})/i) ??
    head.match(/(\d{1,2})[\s\-./]+([A-Za-z]{3,9})[\s\-.,/]+(\d{4})/) ??
    head.match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/)
  if (m) {
    const monRaw = m[2]
    const month = monthNumber(monRaw)
    const year = parseInt(m[3], 10)
    if (month != null && Number.isFinite(year)) {
      return quarterFromMonthYear(month, year)
    }
  }
  // Fallback: derive from today (previous completed quarter).
  const now = new Date()
  return quarterFromMonthYear(now.getUTCMonth() + 1, now.getUTCFullYear())
}

function monthNumber(s: string): number | null {
  if (/^\d{1,2}$/.test(s)) {
    const n = parseInt(s, 10)
    return n >= 1 && n <= 12 ? n : null
  }
  const map: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  }
  return map[s.toLowerCase().slice(0, 3)] ?? null
}

/** Quarter-end month → SEBI quarter label + Indian FY (Apr–Mar). */
function quarterFromMonthYear(month: number, year: number): { quarter: string; fiscal_year: string } {
  // Jun→Q1, Sep→Q2, Dec→Q3, Mar→Q4. Other months snap to the prior quarter-end.
  let quarter: string
  let fyEnd: number
  if (month <= 3) {
    quarter = 'Q4'
    fyEnd = year // Mar 2025 is the close of FY25.
  } else if (month <= 6) {
    quarter = 'Q1'
    fyEnd = year + 1
  } else if (month <= 9) {
    quarter = 'Q2'
    fyEnd = year + 1
  } else {
    quarter = 'Q3'
    fyEnd = year + 1
  }
  return { quarter, fiscal_year: `FY${String(fyEnd).slice(2)}` }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
