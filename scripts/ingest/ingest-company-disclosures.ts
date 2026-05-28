// ---------------------------------------------------------------------------
//  Fetcher — per-company public disclosures (Phase 1 SAHI peers).
//
//  For each company:
//    1. Fetch its financial-disclosure landing page (HTML).
//    2. Find the most recent annual-report / public-disclosure PDF.
//    3. Download → writeRaw('companies/<id>', '<filename>.pdf').
//    4. pdf-parse → extract GWP, NWP, NEP, PAT, ratios, solvency via regex.
//    5. Emit one record per company → insurer-annual-snapshot.
//
//  Each company has its own pattern map because the annual reports use
//  slightly different phrasings. The extractors are forgiving: any pattern
//  that fails returns null for that field, leaving the existing snapshot
//  value intact (per never-null-overwrite rule).
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult, SnapshotRecord } from './types'
import { appendLog, isOfflineMode, nowIso, readSnapshot } from './util'
import { extractByPatterns, fetchHtml, fetchOrLoadRaw, findLinks, parsePdf } from './parsers'

const SOURCE_ID = 'company_disclosures_batch'
const PHASE_1_PEERS = ['niva-bupa', 'star-health', 'care-health', 'aditya-birla', 'manipalcigna']

interface CompanyMaster {
  data: Array<{
    company_id: string
    investor_relations_url: string | null
    financial_disclosure_url: string | null
  }>
}

// Pattern map applied to the extracted PDF text. Indian press releases tend
// to use either ₹ Crore / Crores / Cr — patterns normalise to bare numbers.
// Combined ratio and solvency live on the page in standard formats too.
const COMMON_PATTERNS = {
  gwp: /(?:Gross\s+Written\s+Premium|GWP)[^0-9\-]{0,80}?([\d,]+\.?\d*)/i,
  nwp: /(?:Net\s+Written\s+Premium|NWP)[^0-9\-]{0,80}?([\d,]+\.?\d*)/i,
  nep: /(?:Net\s+Earned\s+Premium|NEP)[^0-9\-]{0,80}?([\d,]+\.?\d*)/i,
  pat: /(?:Profit\s+After\s+Tax|PAT|Net\s+Profit)[^0-9\-]{0,80}?([\d,]+\.?\d*)/i,
  combined_ratio: /Combined\s+Ratio[^0-9\-]{0,60}?([\d.]+)\s*%?/i,
  claims_ratio: /(?:Claims?|Loss)\s+Ratio[^0-9\-]{0,60}?([\d.]+)\s*%?/i,
  expense_ratio: /Expense\s+Ratio[^0-9\-]{0,60}?([\d.]+)\s*%?/i,
  solvency_ratio: /Solvency\s+Ratio[^0-9\-]{0,60}?([\d.]+)\s*x?/i,
  roe: /(?:Return\s+on\s+Equity|ROE)[^0-9\-]{0,60}?([\d.]+)\s*%?/i,
}

export const ingestCompanyDisclosures: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Company public disclosures (Phase 1: SAHI peers)',
  frequency: 'quarterly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const master = await readSnapshot<CompanyMaster>('company-master.json')
    const targets = master.data.filter((c) => PHASE_1_PEERS.includes(c.company_id))

    const records: SnapshotRecord[] = []
    const warnings: string[] = []
    let anyError = false

    for (const t of targets) {
      const url = t.financial_disclosure_url ?? t.investor_relations_url
      if (!url) {
        warnings.push(`${t.company_id} has no disclosure URL in company-master.`)
        continue
      }
      try {
        // Find the latest PDF link on the disclosure page.
        let pdfUrl: string | null = null
        let filename = `${t.company_id}-${new Date().toISOString().slice(0, 10)}.pdf`
        if (!isOfflineMode()) {
          pdfUrl = await discoverDisclosurePdf(url, t.company_id, 0)
          if (!pdfUrl) {
            warnings.push(`No financial PDF link found on ${url} (or sub-pages) for ${t.company_id}`)
            continue
          }
          const last = pdfUrl.split('/').pop() ?? filename
          filename = `${t.company_id}-${last.split('?')[0]}`
        }

        const { buffer, raw_file, mode } = await fetchOrLoadRaw(
          pdfUrl ?? url,
          `companies/${t.company_id}`,
          filename,
          /\.pdf$/i,
        )

        const { text } = await parsePdf(buffer)
        const values = extractByPatterns(text, COMMON_PATTERNS)
        const fy = inferFY(filename, text)
        const populated = Object.values(values).filter((v) => v != null).length

        if (populated === 0) {
          warnings.push(`${t.company_id}: parsed ${text.length} chars from ${filename} but no patterns matched.`)
          continue
        }

        records.push({
          target: 'insurer-annual-snapshot',
          keys: { company_id: t.company_id, fiscal_year: fy },
          values,
          provenance: {
            source_name: `${t.company_id} disclosure (${fy})`,
            source_url: pdfUrl ?? url,
            source_file: raw_file,
            source_period: fy,
            fetched_at,
            parsed_at: nowIso(),
            parser_name: 'ingest-company-disclosures',
            confidence: 'high',
          },
        })

        await appendLog('ingest-company-disclosures.log', {
          source: SOURCE_ID,
          company_id: t.company_id,
          status: 'parsed',
          mode,
          populated,
          fy,
        })
      } catch (err) {
        anyError = true
        const error = err instanceof Error ? err.message : String(err)
        warnings.push(`${t.company_id}: ${error}`)
        await appendLog('ingest-company-disclosures.log', {
          source: SOURCE_ID,
          company_id: t.company_id,
          status: 'error',
          error,
        })
      }
    }

    return {
      source_id: SOURCE_ID,
      status: records.length > 0 ? 'success' : anyError ? 'failed' : 'pending',
      raw_file: null,
      records,
      records_fetched: records.length,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

// PDF filenames / anchor text that we definitely do NOT want (these are
// statutory company-secretarial filings, brochures, policy wording etc. —
// not financial disclosures).
const DENY_PDF = /(mgt[\s\-_]*7|grievance|policy[\s\-_]*wording|prospectus|brochure|claim[\s\-_]*form|customer[\s\-_]*service|kyc|advert|notice|rationale|stewardship|kfd|key[\s\-_]*feature)/i

// Strong-signal financial / disclosure terms — preferred over anything else.
const ALLOW_PDF = /(annual[\s_\-]*report|public[\s_\-]*disclosure|financial[\s_\-]*disclosure|press[\s_\-]*release|results|quarterly|q[1-4]\s*fy|fy\s*2?[0-9]{2,4}|nl[\s_\-]*\d|^l[\s_\-]*\d|financial[\s_\-]*information|investor[\s_\-]*presentation|earnings)/i

const SUBPAGE_HINT = /(disclosure|financial|annual|quarterly|investor|results|reports?)/i

/**
 * Walks the disclosure landing page for the best-matching financial PDF.
 * If the page lists no PDFs at depth 0, follows up to N sub-anchors whose
 * text looks disclosure-related (e.g. "Quarterly", "FY 2024-25", "Public
 * Disclosures") and tries again — one level deep, max 4 children, to keep
 * the fetch budget bounded.
 */
async function discoverDisclosurePdf(url: string, companyId: string, depth: number): Promise<string | null> {
  const $ = await fetchHtml(url)
  const allPdfs = findLinks($, url, (href) => /\.pdf(\?|$)/i.test(href))
  // 1. Strong match — allow-list match and not deny-listed.
  const strong = allPdfs.filter((href) => {
    const last = href.split('/').pop() ?? href
    return ALLOW_PDF.test(last) && !DENY_PDF.test(last)
  })
  if (strong.length) return strong.sort().reverse()[0]
  // 2. Any non-denied PDF.
  const safe = allPdfs.filter((href) => !DENY_PDF.test(href.split('/').pop() ?? href))
  if (safe.length) return safe.sort().reverse()[0]
  // 3. Recurse one level into disclosure-looking sub-pages.
  if (depth >= 1) return null
  const subPages = findLinks($, url, (href, text) => {
    if (/\.(pdf|xlsx|xls|zip|jpg|png)(\?|$)/i.test(href)) return false
    const blob = `${href} ${text}`
    return SUBPAGE_HINT.test(blob)
  })
    .filter((u) => new URL(u).hostname === new URL(url).hostname)
    .slice(0, 4)
  for (const sub of subPages) {
    try {
      const found = await discoverDisclosurePdf(sub, companyId, depth + 1)
      if (found) return found
    } catch { /* skip 4xx sub-pages */ }
  }
  return null
}

// Month name → FY-end year offset (Apr-Mar fiscal year).
const MONTH_TO_FY: Record<string, number> = {
  jan: 0, feb: 0, mar: 0, apr: 1, may: 1, jun: 1, jul: 1, aug: 1, sep: 1, oct: 1, nov: 1, dec: 1,
}

function inferFY(filename: string, text: string): string {
  const haystack = `${filename} ${text.slice(0, 600)}`
  // 1. Explicit FY 2024-25 / 2024-2025 patterns.
  const explicit = haystack.match(/\b20(\d{2})\s*[-–/]\s*20?(\d{2})\b/)
  if (explicit) {
    const end = explicit[2]
    return `FY${end.padStart(2, '0').slice(-2)}`
  }
  // 2. FY25 / FY-2025 patterns.
  const fy = haystack.match(/\bFY\s*[-]?\s*(?:20)?(\d{2})\b/i)
  if (fy) return `FY${fy[1].padStart(2, '0').slice(-2)}`
  // 3. "Month YYYY" or "MonthYYYY" → map to fiscal year end.
  const mm = haystack.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,\-_]*?(\d{4})/i)
  if (mm) {
    const monthOffset = MONTH_TO_FY[mm[1].toLowerCase().slice(0, 3)] ?? 0
    const fyEnd = parseInt(mm[2], 10) + monthOffset
    return `FY${String(fyEnd).slice(-2)}`
  }
  // 4. Last-ditch: bare 4-digit year → assume calendar year → FY = same year + 1 if before April.
  const yr = haystack.match(/\b(20\d{2})\b/)
  if (yr) return `FY${yr[1].slice(-2)}`
  return 'FY' + new Date().getFullYear().toString().slice(2)
}
