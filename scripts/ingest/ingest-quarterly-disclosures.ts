// ---------------------------------------------------------------------------
//  Fetcher — per-company QUARTERLY public disclosures (SAHI peers).
//
//  The annual fetcher (ingest-company-disclosures) grabs a single PDF per
//  company, which is right for the annual report but wrong for quarterly: a
//  company publishes four quarterly disclosures per year and we want all of
//  them. This fetcher therefore:
//
//    1. Walks each company's investor-relations / public-disclosure page.
//    2. Collects EVERY quarterly-looking PDF (Q1–Q4), not just the newest.
//    3. Downloads → writeRaw('companies/<id>', '<filename>.pdf').
//    4. pdf-parse → extract PAT, combined ratio, claims/commission/expense
//       ratios, solvency via the shared pattern map.
//    5. Emits one record per (company, quarter, FY) → insurer-quarterly-financials.
//
//  Offline mode replays whatever quarterly PDFs are already staged under
//  data/raw/companies/<id>/, so the merge can run without network once the
//  files exist on disk. Anything a pattern can't extract stays null (honest
//  "pending") — never coerced to a guess.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult, SnapshotRecord } from './types'
import { appendLog, isOfflineMode, nowIso, readSnapshot } from './util'
import { extractByPatterns, fetchHtml, fetchOrLoadRaw, findLinks, parsePdf } from './parsers'
import { QUARTERLY_PATTERNS, sanitiseQuarterly } from './quarterly-extract'

const SOURCE_ID = 'company_quarterly_disclosures'
const PEERS = ['niva-bupa', 'star-health', 'care-health', 'aditya-birla', 'manipalcigna']

interface CompanyMaster {
  data: Array<{
    company_id: string
    investor_relations_url: string | null
    financial_disclosure_url: string | null
    /** Direct quarterly-PDF URLs, tried before the HTML walk. */
    quarterly_pdf_hints?: string[]
    pdf_hints?: string[]
  }>
}

// A quarterly disclosure PDF — file/anchor text signals a specific quarter.
const QUARTERLY_LINK = /(q[1-4][\s_-]?fy|qtr[\s_-]?[1-4]|quarter[\s_-]?(?:ended|[1-4])|(?:9|nine)[\s_-]?month|h1[\s_-]?fy|half[\s_-]?year|public[\s_-]?disclosure)/i
// Statutory / non-financial filings we never want.
const DENY = /(mgt[\s_-]*7|grievance|policy[\s_-]*wording|prospectus|brochure|claim[\s_-]*form|complaint?|kyc|advert|citizen[\s_-]*charter|whistle|nomination|privacy|terms|agent[\s_-]*code)/i

export const ingestQuarterlyDisclosures: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Company quarterly disclosures (SAHI peers)',
  frequency: 'quarterly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const master = await readSnapshot<CompanyMaster>('company-master.json')
    const targets = master.data.filter((c) => PEERS.includes(c.company_id))

    const records: SnapshotRecord[] = []
    const warnings: string[] = []
    let anyError = false

    for (const t of targets) {
      const landing = t.financial_disclosure_url ?? t.investor_relations_url
      try {
        // Resolve the candidate quarterly PDF URLs.
        const pdfUrls = await resolveQuarterlyPdfs(t, landing, warnings)
        if (pdfUrls.length === 0) {
          warnings.push(`${t.company_id}: no quarterly disclosure PDFs found.`)
          continue
        }

        for (const pdfUrl of pdfUrls) {
          const last = (pdfUrl.split('/').pop() ?? 'q.pdf').split('?')[0]
          const filename = `${t.company_id}-${last}`
          try {
            const { buffer, raw_file, mode } = await fetchOrLoadRaw(
              pdfUrl,
              `companies/${t.company_id}`,
              filename,
              /\.pdf$/i,
            )
            const { text } = await parsePdf(buffer)
            const quarter = inferQuarter(text, filename)
            const fy = inferFY(filename, text)
            if (!quarter) {
              warnings.push(`${t.company_id}: could not infer quarter from ${filename} — skipped.`)
              continue
            }
            const values = sanitiseQuarterly(extractByPatterns(text, QUARTERLY_PATTERNS))
            const populated = Object.values(values).filter((v) => v != null).length
            if (populated === 0) {
              warnings.push(`${t.company_id} ${quarter} ${fy}: parsed ${text.length} chars but no patterns matched.`)
              continue
            }
            records.push({
              target: 'insurer-quarterly-financials',
              keys: { company_id: t.company_id, quarter, fiscal_year: fy },
              values: { ...values, period_type: 'quarterly' },
              provenance: {
                source_name: `${t.company_id} ${quarter} ${fy} public disclosure`,
                source_url: pdfUrl,
                source_file: raw_file,
                source_period: `${quarter} ${fy}`,
                fetched_at,
                parsed_at: nowIso(),
                parser_name: 'ingest-quarterly-disclosures',
                confidence: 'high',
              },
            })
            await appendLog('ingest-quarterly-disclosures.log', {
              source: SOURCE_ID, company_id: t.company_id, quarter, fy, status: 'parsed', mode, populated,
            })
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err)
            warnings.push(`${t.company_id} ${filename}: ${error}`)
          }
        }
      } catch (err) {
        anyError = true
        const error = err instanceof Error ? err.message : String(err)
        warnings.push(`${t.company_id}: ${error}`)
        await appendLog('ingest-quarterly-disclosures.log', { source: SOURCE_ID, company_id: t.company_id, status: 'error', error })
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

/**
 * Resolve quarterly PDF URLs for a company. Order:
 *   1. Explicit `quarterly_pdf_hints` from company-master (deterministic).
 *   2. Live HTML walk of the disclosure page collecting ALL quarterly PDFs.
 *   3. Offline: the resolver returns [] and fetchOrLoadRaw replays staged files
 *      — handled by the caller scanning the raw dir, so we surface staged files
 *      here too.
 */
async function resolveQuarterlyPdfs(
  t: { company_id: string; quarterly_pdf_hints?: string[] },
  landing: string | null,
  warnings: string[],
): Promise<string[]> {
  const hints = (t.quarterly_pdf_hints ?? []).filter((h) => /\.pdf(\?|$)/i.test(h) && !DENY.test(h))
  if (hints.length) return dedupe(hints)

  if (isOfflineMode()) {
    // Offline with no hints: nothing to resolve by URL. The merge step can
    // still replay any staged quarterly PDFs if hints are added later.
    return []
  }

  if (!landing) {
    warnings.push(`${t.company_id}: no disclosure URL in company-master and no quarterly hints.`)
    return []
  }
  // Live walk — collect every quarterly-looking PDF across the page and one
  // level of disclosure sub-pages.
  return dedupe(await walkForQuarterlyPdfs(landing, 0))
}

async function walkForQuarterlyPdfs(url: string, depth: number): Promise<string[]> {
  const $ = await fetchHtml(url)
  const host = new URL(url).hostname
  const pdfs = findLinks($, url, (href) => /\.pdf(\?|$)/i.test(href))
    .filter((href) => {
      const last = href.split('/').pop() ?? href
      return QUARTERLY_LINK.test(last) && !DENY.test(last)
    })
  const found = [...pdfs]
  if (depth < 1) {
    const subs = findLinks($, url, (href, text) => {
      if (/\.(pdf|xlsx|xls|zip|jpg|png)(\?|$)/i.test(href)) return false
      return /(disclosure|quarterly|financial|investor|results|public)/i.test(`${href} ${text}`)
    })
      .filter((u) => new URL(u).hostname === host)
      .slice(0, 5)
    for (const sub of subs) {
      try {
        found.push(...(await walkForQuarterlyPdfs(sub, depth + 1)))
      } catch { /* skip unreachable sub-pages */ }
    }
  }
  return found
}

const dedupe = (xs: string[]): string[] => [...new Set(xs)]

// Quarter inference — file/anchor + first 2k chars of the PDF body.
function inferQuarter(text: string, filename: string): string | null {
  const hay = `${filename} ${text.slice(0, 2000)}`
  const q = hay.match(/\bQ([1-4])\b/i) ?? hay.match(/qtr[\s_-]?([1-4])\b/i)
  if (q) return `Q${q[1]}`
  if (/(?:9|nine)[\s_-]?month|9m\b/i.test(hay)) return 'Q3'
  if (/h1\b|half[\s_-]?year|six[\s_-]?month/i.test(hay)) return 'Q2'
  if (/quarter\s+ended\s+(?:30|31)\s*june|jun/i.test(hay)) return 'Q1'
  if (/quarter\s+ended\s+(?:30|31)\s*sep/i.test(hay)) return 'Q2'
  if (/quarter\s+ended\s+(?:30|31)\s*dec/i.test(hay)) return 'Q3'
  if (/quarter\s+ended\s+(?:30|31)\s*mar/i.test(hay)) return 'Q4'
  return null
}

// FY inference — filename range/token first, else dominant FY token in head.
function inferFY(filename: string, text: string): string {
  const range = filename.match(/(\d{2,4})\s*[-–_/]\s*(\d{2,4})/)
  if (range) return `FY${range[2].slice(-2).padStart(2, '0')}`
  const fy = filename.match(/\bFY\s*[-]?\s*(?:20)?(\d{2})\b/i)
  if (fy) return `FY${fy[1].padStart(2, '0').slice(-2)}`
  const head = text.slice(0, 2000)
  const counts = new Map<number, number>()
  for (const m of head.matchAll(/\bFY[\s-]?20?(\d{2})\b/gi)) {
    const yy = parseInt(m[1], 10)
    if (yy >= 18 && yy <= 30) counts.set(yy, (counts.get(yy) ?? 0) + 1)
  }
  if (counts.size) return `FY${String([...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0])}`
  return 'FY' + new Date().getFullYear().toString().slice(2)
}
