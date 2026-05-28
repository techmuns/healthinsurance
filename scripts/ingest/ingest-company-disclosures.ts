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
        const rawValues = extractByPatterns(text, COMMON_PATTERNS)
        const values = sanitiseExtracted(rawValues)
        const fy = inferFY(filename, text)
        const populated = Object.values(values).filter((v) => v != null).length

        if (populated === 0) {
          warnings.push(`${t.company_id}: parsed ${text.length} chars from ${filename} but no patterns matched plausibility rules.`)
          continue
        }

        // Detect whether this PDF is an annual or quarterly disclosure.
        // Quarterly disclosures carry cumulative figures (9M / H1 / Q3
        // standalone) that MUST NOT pollute the annual snapshot.
        const isQuarterly = isQuarterlyDisclosure(text, filename)
        const quarter = isQuarterly ? inferQuarter(text, filename) : null

        records.push(
          isQuarterly && quarter
            ? {
                target: 'insurer-quarterly-financials',
                keys: { company_id: t.company_id, quarter, fiscal_year: fy },
                values: { ...values, period_type: 'quarterly' },
                provenance: {
                  source_name: `${t.company_id} ${quarter} ${fy} public disclosure`,
                  source_url: pdfUrl ?? url,
                  source_file: raw_file,
                  source_period: `${quarter} ${fy}`,
                  fetched_at,
                  parsed_at: nowIso(),
                  parser_name: 'ingest-company-disclosures',
                  confidence: 'high',
                },
              }
            : {
                target: 'insurer-annual-snapshot',
                keys: { company_id: t.company_id, fiscal_year: fy },
                values,
                provenance: {
                  source_name: `${t.company_id} ${fy} annual disclosure`,
                  source_url: pdfUrl ?? url,
                  source_file: raw_file,
                  source_period: fy,
                  fetched_at,
                  parsed_at: nowIso(),
                  parser_name: 'ingest-company-disclosures',
                  confidence: 'high',
                },
              },
        )

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
const DENY_PDF = /(mgt[\s\-_]*7|grievance|policy[\s\-_]*wording|prospectus|brochure|claim[\s\-_]*form|customer[\s\-_]*service|kyc|advert|notice|rationale|stewardship|kfd|key[\s\-_]*feature|citizen[\s\-_]*charter|whistle[\s\-_]*blower|nomination|cookie|privacy|terms|agent[\s\-_]*code|charter|appointment|sec[\s\-_]*201|composite[\s\-_]*scheme|cession)/i

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

/**
 * Annual reports mention multiple fiscal years (current + prior + 5-year
 * history). The cover-page year is the one we want — prefer the FILENAME
 * year, otherwise pick the most-recent FY token that appears more than
 * once in the first 2000 chars (covers + first MD&A page).
 */
function inferFY(filename: string, text: string): string {
  // 1. Filename takes precedence — usually carries the canonical year.
  const fnm = filename.match(/\b20(\d{2})\s*[-–_/]\s*20?(\d{2})\b/) ?? filename.match(/\bFY\s*[-]?\s*(?:20)?(\d{2})\b/i)
  if (fnm) {
    const end = fnm[2] ?? fnm[1]
    return `FY${end.padStart(2, '0').slice(-2)}`
  }
  const fnmMonth = filename.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,\-_]*?(\d{4})/i)
  if (fnmMonth) {
    const monthOffset = MONTH_TO_FY[fnmMonth[1].toLowerCase().slice(0, 3)] ?? 0
    return `FY${String(parseInt(fnmMonth[2], 10) + monthOffset).slice(-2)}`
  }
  // 2. Otherwise: pick the most-frequent FY token in the first 2000 chars
  //    of the PDF body — covers + initial MD&A — favouring the latest year
  //    on a tie.
  const head = text.slice(0, 2000)
  const counts = new Map<number, number>()
  for (const m of head.matchAll(/\b(?:FY[\s\-]?20?(\d{2})|20(\d{2})\s*[-–_/]\s*20?(\d{2}))\b/gi)) {
    const yy = parseInt(m[1] ?? m[3] ?? m[2] ?? '0', 10)
    if (yy >= 18 && yy <= 30) counts.set(yy, (counts.get(yy) ?? 0) + 1)
  }
  if (counts.size > 0) {
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
    return `FY${String(sorted[0][0]).padStart(2, '0')}`
  }
  return 'FY' + new Date().getFullYear().toString().slice(2)
}

/**
 * Reject implausible extracted values so a misread regex doesn't poison
 * the snapshot. Per-metric bands derived from the IRDAI universe of
 * insurer sizes — no individual insurer has GWP > ₹200,000 Cr, no
 * combined ratio is below 50 or above 200, solvency ratios live in
 * 0.5-10x, ratios stored as decimal (e.g. "1.15") are normalised to %.
 */
/**
 * Returns true when the PDF text strongly indicates a quarterly /
 * half-year / 9-month disclosure rather than a full-year annual report.
 * Used to route the parsed values to the quarterly snapshot, keeping
 * annual rows clean of cumulative-period figures.
 */
function isQuarterlyDisclosure(text: string, filename: string): boolean {
  const haystack = `${filename} ${text.slice(0, 3000)}`
  // Filename hints first — IRDAI L-forms / NL-forms ship with QtrN labels.
  if (/\bQ[1-4][\s\-_]?FY|qtr[\s_\-]?[1-3]|quarter[\s_\-]?ended|9[\s_\-]?(month|m)|six[\s_\-]?month|half[\s_\-]?year|h1[\s_\-]?fy/i.test(haystack)) return true
  // Annual-report markers that explicitly contradict.
  if (/annual\s+report|board\s*['']\s*report\s*(?:to|on)\s+the\s+(?:members|shareholders)|management\s+discussion\s+and\s+analysis/i.test(text.slice(0, 5000))) {
    // Annual reports are themselves not quarterly disclosures, even if
    // they mention Q4 figures in passing.
    return false
  }
  // Default: not quarterly.
  return false
}

function inferQuarter(text: string, filename: string): string | null {
  const haystack = `${filename} ${text.slice(0, 2000)}`
  const q = haystack.match(/\bQ([1-4])\s*FY\b/i) ?? haystack.match(/qtr[\s_\-]?([1-3])\b/i)
  if (q) return `Q${q[1]}`
  if (/9[\s_\-]?month|9m/i.test(haystack)) return 'Q3'
  if (/h1|half[\s_\-]?year|six[\s_\-]?month/i.test(haystack)) return 'Q2'
  return null
}

function sanitiseExtracted(raw: Record<string, number | null>): Record<string, number | null> {
  const out: Record<string, number | null> = { ...raw }
  // GWP / NWP / NEP / PAT: bounded between 1 and 100,000 Cr per insurer
  // (largest Indian insurer ~SBI Life with GWP ~₹85k Cr; +20% headroom).
  for (const k of ['gwp', 'nwp', 'nep', 'pat'] as const) {
    const v = out[k]
    if (v == null) continue
    if (v < 1 || v > 100000) out[k] = null
  }
  // PAT is much smaller — clamp at 20k Cr.
  if (typeof out.pat === 'number' && Math.abs(out.pat) > 20000) out.pat = null
  // NWP ≤ GWP, NEP ≤ NWP. If violated, null the dependent value.
  if (typeof out.gwp === 'number' && typeof out.nwp === 'number' && out.nwp > out.gwp * 1.1) out.nwp = null
  if (typeof out.nwp === 'number' && typeof out.nep === 'number' && out.nep > out.nwp * 1.1) out.nep = null
  // If GWP itself is missing but NEP is huge, NEP is almost certainly a
  // misread of an industry total — drop it.
  if (out.gwp == null && typeof out.nep === 'number' && out.nep > 50000) out.nep = null
  if (out.gwp == null && typeof out.nwp === 'number' && out.nwp > 50000) out.nwp = null
  // Combined ratio: ratio expressed as decimal (e.g. 1.15) → convert to %.
  if (typeof out.combined_ratio === 'number') {
    if (out.combined_ratio > 0 && out.combined_ratio < 5) out.combined_ratio = out.combined_ratio * 100
    if (out.combined_ratio < 50 || out.combined_ratio > 200) out.combined_ratio = null
  }
  // Claims / expense ratios: same decimal-vs-% normalisation, plausible 0-200%.
  for (const k of ['claims_ratio', 'expense_ratio'] as const) {
    const v = out[k]
    if (v == null) continue
    if (v > 0 && v < 5) out[k] = v * 100
    const after = out[k]
    if (typeof after === 'number' && (after < 0 || after > 200)) out[k] = null
  }
  // Solvency: 0.5-10x.
  if (typeof out.solvency_ratio === 'number' && (out.solvency_ratio < 0.5 || out.solvency_ratio > 10)) out.solvency_ratio = null
  // ROE: -100 to 100%.
  if (typeof out.roe === 'number' && (out.roe < -100 || out.roe > 100)) out.roe = null
  return out
}
