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
          const $ = await fetchHtml(url)
          const links = findLinks($, url, (href, text) => {
            if (!/\.pdf(\?|$)/i.test(href)) return false
            const t = `${href} ${text}`.toLowerCase()
            return /annual\s*report|public\s*disclosure|press\s*release|results/.test(t)
          })
          if (links.length === 0) {
            warnings.push(`No PDF link found on ${url} for ${t.company_id}`)
            continue
          }
          pdfUrl = links.sort().reverse()[0]
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

function inferFY(filename: string, text: string): string {
  const haystack = `${filename} ${text.slice(0, 600)}`
  const m =
    haystack.match(/\b20(\d{2})\s*[-–/]\s*20?(\d{2})\b/) ??
    haystack.match(/\bFY\s*[-]?\s*(?:20)?(\d{2})\b/i)
  if (!m) return 'FY' + new Date().getFullYear().toString().slice(2)
  const end = m[2] ?? m[1]
  return `FY${end.padStart(2, '0')}`
}
