// ---------------------------------------------------------------------------
//  Fetcher — IRDAI Handbook (annual) + IRDAI Annual Report.
//
//  Live mode:
//    1. Scrape the handbook page for the latest PDF link.
//    2. Download → writeRaw('irdai/annual', '<filename>.pdf').
//    3. pdf-parse → extract industry segment premium totals via regex.
//
//  Offline mode:
//    Parse the most recent .pdf file pre-staged under data/raw/irdai/annual/.
//
//  Patterns target the standard IRDAI handbook chapter on Non-Life Premium
//  by Segment. The handbook layout shifts slightly year-over-year, so we
//  match by label not by row index.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult, SnapshotRecord } from './types'
import { appendLog, isOfflineMode, nowIso } from './util'
import { extractByPatterns, fetchHtml, fetchOrLoadRaw, findLinks, parsePdf } from './parsers'

const SOURCE_ID = 'irdai_handbook'
const HANDBOOK_URL = 'https://irdai.gov.in/handbook-of-indian-insurance-statistics'

export const ingestIrdaiAnnual: Fetcher = {
  source_id: SOURCE_ID,
  name: 'IRDAI Handbook + Annual Report',
  frequency: 'annual',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    try {
      // Step 1: discover latest handbook PDF.
      let pdfUrl: string | null = null
      let filename = `handbook-${new Date().getFullYear()}.pdf`
      if (!isOfflineMode()) {
        const $ = await fetchHtml(HANDBOOK_URL)
        const links = findLinks($, HANDBOOK_URL, (href, text) => {
          if (!/\.pdf(\?|$)/i.test(href)) return false
          const t = `${href} ${text}`.toLowerCase()
          return /handbook|statistic/.test(t)
        })
        if (links.length === 0) {
          await appendLog('ingest-irdai-annual.log', { source: SOURCE_ID, status: 'no_links' })
          return {
            source_id: SOURCE_ID,
            status: 'failed',
            raw_file: null,
            records: [],
            records_fetched: 0,
            fetched_at,
            error: `No handbook PDF discovered on ${HANDBOOK_URL}`,
          }
        }
        pdfUrl = links.sort().reverse()[0]
        const last = pdfUrl.split('/').pop() ?? filename
        filename = last.split('?')[0]
      }

      // Step 2: fetch (live) or load (offline) the raw PDF.
      const { buffer, raw_file, mode } = await fetchOrLoadRaw(
        pdfUrl ?? HANDBOOK_URL,
        'irdai/annual',
        filename,
        /\.pdf$/i,
      )

      // Step 3: parse and extract industry segment totals.
      const { text } = await parsePdf(buffer)
      const segments = extractByPatterns(text, {
        total_gi_premium: /(?:Total\s+Non[\s\-]?Life|Total\s+General\s+Insurance)\s+(?:Premium|Business)[^0-9\-]*([\d,.]+)/i,
        health_premium: /Health\s+(?:Insurance|Segment|Total)[^0-9\-]*([\d,.]+)/i,
        motor_premium: /Motor\s+(?:Insurance|Segment|Total)[^0-9\-]*([\d,.]+)/i,
        fire_premium: /Fire\s+(?:Insurance|Segment)[^0-9\-]*([\d,.]+)/i,
        crop_premium: /Crop\s+(?:Insurance)?[^0-9\-]*([\d,.]+)/i,
        marine_premium: /Marine\s+(?:Insurance)?[^0-9\-]*([\d,.]+)/i,
      })

      // Infer fiscal year from filename or text header.
      const fy = inferFY(filename, text)

      const total = segments.total_gi_premium
      const health = segments.health_premium
      const motor = segments.motor_premium
      const healthShare = total && health ? Math.round((health / total) * 10000) / 100 : null
      const motorShare = total && motor ? Math.round((motor / total) * 10000) / 100 : null

      const record: SnapshotRecord = {
        target: 'industry-segment-premium',
        keys: { period: fy, period_type: 'annual' },
        values: {
          fiscal_year: fy,
          health_premium: health,
          motor_premium: motor,
          fire_premium: segments.fire_premium,
          crop_premium: segments.crop_premium,
          marine_premium: segments.marine_premium,
          total_gi_premium: total,
          health_share: healthShare,
          motor_share: motorShare,
        },
        provenance: {
          source_name: `IRDAI Handbook on Indian Insurance Statistics (${fy})`,
          source_url: pdfUrl ?? HANDBOOK_URL,
          source_file: raw_file,
          source_period: fy,
          fetched_at,
          parsed_at: nowIso(),
          parser_name: 'ingest-irdai-annual',
          confidence: 'high',
        },
      }

      const populated = Object.values(record.values).filter((v) => v != null).length
      await appendLog('ingest-irdai-annual.log', { source: SOURCE_ID, status: 'success', mode, filename, populated })

      return {
        source_id: SOURCE_ID,
        status: populated > 0 ? 'success' : 'failed',
        raw_file,
        records: populated > 0 ? [record] : [],
        records_fetched: populated > 0 ? 1 : 0,
        fetched_at,
        warnings:
          populated === 0
            ? [`Handbook parsed (${text.length} chars) but no segment totals matched the patterns.`]
            : undefined,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await appendLog('ingest-irdai-annual.log', { source: SOURCE_ID, status: 'error', error })
      return {
        source_id: SOURCE_ID,
        status: 'failed',
        raw_file: null,
        records: [],
        records_fetched: 0,
        fetched_at,
        error,
      }
    }
  },
}

function inferFY(filename: string, text: string): string {
  // Match "2024-25", "FY25", "2024-2025" in filename or first 500 chars of text.
  const haystack = `${filename} ${text.slice(0, 800)}`
  const m =
    haystack.match(/\b20(\d{2})\s*[-–/]\s*20?(\d{2})\b/) ??
    haystack.match(/\bFY\s*20?(\d{2})\b/i)
  if (!m) return 'FY' + new Date().getFullYear().toString().slice(2)
  const end = m[2] ?? m[1]
  return `FY${end.padStart(2, '0')}`
}
