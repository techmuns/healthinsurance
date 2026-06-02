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
import { appendLog, isOfflineMode, nowIso, writeRaw } from './util'
import { extractByPatterns, fetchBuffer, fetchHtml, findLinks, loadStagedRaw, parsePdf } from './parsers'

const SOURCE_ID = 'irdai_handbook'
const HANDBOOK_URL = 'https://irdai.gov.in/handbook-of-indian-insurance-statistics'

export const ingestIrdaiAnnual: Fetcher = {
  source_id: SOURCE_ID,
  name: 'IRDAI Handbook + Annual Report',
  frequency: 'annual',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    try {
      // Step 1: resolve the handbook PDF. Prefer the live IRDAI source; if it
      // is blocked (the standing IP-level 403) or unavailable, fall back to a
      // manually-staged PDF in data/raw/irdai/annual/ — so a one-time drop
      // flows through the next normal run with no offline-mode toggle.
      let pdfUrl: string | null = null
      let filename = `handbook-${new Date().getFullYear()}.pdf`
      let buffer: Buffer | null = null
      let raw_file: string | null = null
      let mode: 'live' | 'staged' = 'live'
      let liveError: string | null = null

      if (!isOfflineMode()) {
        try {
          const $ = await fetchHtml(HANDBOOK_URL)
          const links = findLinks($, HANDBOOK_URL, (href, text) => {
            if (!/\.pdf(\?|$)/i.test(href)) return false
            const t = `${href} ${text}`.toLowerCase()
            return /handbook|statistic/.test(t)
          })
          if (links.length > 0) {
            pdfUrl = links.sort().reverse()[0]
            filename = (pdfUrl.split('/').pop() ?? filename).split('?')[0]
            const fetched = await fetchBuffer(pdfUrl)
            buffer = fetched.buffer
            raw_file = await writeRaw('irdai/annual', filename, buffer)
          } else {
            liveError = `No handbook PDF discovered on ${HANDBOOK_URL}`
            console.log(`[irdai-annual] reached handbook page but found NO matching PDF links at ${HANDBOOK_URL}`)
          }
        } catch (err) {
          liveError = err instanceof Error ? err.message : String(err)
          await appendLog('ingest-irdai-annual.log', { source: SOURCE_ID, status: 'live_blocked', error: liveError })
        }
      }

      // Fall back to a manually-staged handbook PDF when live yielded nothing.
      if (!buffer) {
        const staged = await loadStagedRaw('irdai/annual', /\.pdf$/i)
        if (staged) {
          buffer = staged.buffer
          raw_file = staged.raw_file
          filename = staged.raw_file.split('/').pop() ?? filename
          mode = 'staged'
          await appendLog('ingest-irdai-annual.log', { source: SOURCE_ID, status: 'using_staged_file', raw_file, live_error: liveError })
        }
      }

      // No live data and no staged file → honest failure (never fabricate).
      if (!buffer) {
        const error = liveError ?? 'IRDAI handbook unavailable and no staged file present.'
        await appendLog('ingest-irdai-annual.log', { source: SOURCE_ID, status: 'no_data', error })
        return {
          source_id: SOURCE_ID,
          status: 'failed',
          raw_file: null,
          records: [],
          records_fetched: 0,
          fetched_at,
          error,
          warnings: [
            'To populate industry/annual data: download the IRDAI "Handbook of Indian Insurance Statistics" PDF and drop it into data/raw/irdai/annual/. The next run uses it automatically.',
          ],
        }
      }

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

      // Carrier-type split of HEALTH premium (Public / Private / Standalone).
      // The same row labels recur across handbook tables, so we VALIDATE the
      // parse (shares must sum ~100 and each be individually plausible) and only
      // emit when coherent — never a guess. Diagnostics below print what the
      // page/PDF actually yielded so we can refine patterns from the CI log.
      const carrier = extractByPatterns(text, {
        health_sahi_premium: /stand[\s-]?alone\s+health\s+insurers?[^0-9\-]*([\d,.]+)/i,
        health_public_premium: /public\s+sector[^0-9\-]*([\d,.]+)/i,
        health_private_premium: /private\s+sector[^0-9\-]*([\d,.]+)/i,
      })
      let health_sahi_share: number | null = null
      let health_private_share: number | null = null
      let health_psu_share: number | null = null
      {
        const cs = carrier.health_sahi_premium
        const cpu = carrier.health_public_premium
        const cpr = carrier.health_private_premium
        if (cs != null && cpu != null && cpr != null && cs + cpu + cpr > 0) {
          const sum = cs + cpu + cpr
          const sahiSh = (cs / sum) * 100
          const prSh = (cpr / sum) * 100
          const puSh = (cpu / sum) * 100
          if (sahiSh >= 10 && sahiSh <= 50 && prSh >= 25 && prSh <= 65 && puSh >= 8 && puSh <= 50) {
            health_sahi_share = Math.round(sahiSh * 10) / 10
            health_private_share = Math.round(prSh * 10) / 10
            health_psu_share = Math.round(puSh * 10) / 10
          }
        }
      }
      console.log(`[irdai-annual] mode=${mode} file=${filename} parsedChars=${text.length}`)
      console.log(`[irdai-annual] segments=${JSON.stringify(segments)}`)
      console.log(`[irdai-annual] carrier=${JSON.stringify(carrier)} -> shares SAHI=${health_sahi_share} Private=${health_private_share} PSU=${health_psu_share}`)
      {
        const si = text.search(/stand[\s-]?alone\s+health/i)
        console.log(`[irdai-annual] standalone-health snippet: ${si >= 0 ? JSON.stringify(text.slice(Math.max(0, si - 60), si + 180)) : 'NOT FOUND in parsed text'}`)
      }

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
          health_sahi_share,
          health_private_share,
          health_psu_share,
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
      console.log(`[irdai-annual] FETCH/PARSE FAILED (likely IRDAI WAF block): ${error}`)
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
