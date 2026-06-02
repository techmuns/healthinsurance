// ---------------------------------------------------------------------------
//  Fetcher — IRDAI monthly business figures (non-life insurers).
//
//  Live mode (INGEST_OFFLINE=0):
//    1. fetch IRDAI monthly page
//    2. find the latest XLSX link (sorted by filename → newest first)
//    3. download → writeRaw('irdai/monthly', '<YYYY-MM>.xlsx', buffer)
//    4. parse XLSX → match insurer rows by alias → emit monthly records
//
//  Offline mode:
//    Look for a pre-staged .xlsx file in data/raw/irdai/monthly/ and parse
//    that. (Lets users drop the IRDAI XLSX into the repo without network.)
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult, SnapshotRecord } from './types'
import { appendLog, isOfflineMode, nowIso, readSnapshot, writeRaw } from './util'
import { fetchBuffer, fetchHtml, findLinks, findRowByAlias, loadStagedRaw, parseXlsx, toNumber } from './parsers'

const SOURCE_ID = 'irdai_monthly_business'
const SOURCE_URL = 'https://irdai.gov.in/monthly-business-figures-non-life-insurers'

// Aliases per insurer — used to find the row in the IRDAI XLSX where the
// first column carries the insurer name. Different IRDAI releases use
// slightly different spellings, so we keep multiple matches per company.
const INSURER_ALIASES: Record<string, string[]> = {
  'niva-bupa': ['Niva Bupa', 'Max Bupa'],
  'star-health': ['Star Health'],
  'care-health': ['Care Health', 'Religare Health'],
  'aditya-birla': ['Aditya Birla Health'],
  manipalcigna: ['ManipalCigna', 'Manipal Cigna'],
  'icici-lombard': ['ICICI Lombard'],
  'bajaj-general': ['Bajaj Allianz General'],
}

interface CompanyMaster {
  data: Array<{ company_id: string }>
}

export const ingestIrdaiMonthly: Fetcher = {
  source_id: SOURCE_ID,
  name: 'IRDAI Monthly Business Figures',
  frequency: 'monthly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const master = await readSnapshot<CompanyMaster>('company-master.json')
    const ids = master.data.map((c) => c.company_id).filter((id) => INSURER_ALIASES[id])

    try {
      // Step 1: resolve the raw XLSX. Prefer the live IRDAI source; if it is
      // blocked (the standing IP-level 403) or unavailable, fall back to a
      // manually-staged file in data/raw/irdai/monthly/ — so a one-time drop
      // flows through the next normal run with no offline-mode toggle.
      let xlsxUrl: string | null = null
      let filename = `${new Date().toISOString().slice(0, 7)}.xlsx`
      let buffer: Buffer | null = null
      let raw_file: string | null = null
      let mode: 'live' | 'staged' = 'live'
      let liveError: string | null = null

      if (!isOfflineMode()) {
        try {
          const $ = await fetchHtml(SOURCE_URL)
          const links = findLinks($, SOURCE_URL, (href, text) => {
            if (!/\.(xlsx|xls)(\?|$)/i.test(href)) return false
            const t = `${href} ${text}`.toLowerCase()
            return /non[\s-]?life|monthly|business/.test(t)
          })
          if (links.length > 0) {
            xlsxUrl = links.sort().reverse()[0]
            filename = (xlsxUrl.split('/').pop() ?? filename).split('?')[0]
            const fetched = await fetchBuffer(xlsxUrl)
            buffer = fetched.buffer
            raw_file = await writeRaw('irdai/monthly', filename, buffer)
          } else {
            liveError = `No XLSX link discovered on ${SOURCE_URL}`
          }
        } catch (err) {
          liveError = err instanceof Error ? err.message : String(err)
          await appendLog('ingest-irdai-monthly.log', { source: SOURCE_ID, status: 'live_blocked', error: liveError })
        }
      }

      // Fall back to a manually-staged file when the live source yielded nothing.
      if (!buffer) {
        const staged = await loadStagedRaw('irdai/monthly', /\.(xlsx|xls)$/i)
        if (staged) {
          buffer = staged.buffer
          raw_file = staged.raw_file
          filename = staged.raw_file.split('/').pop() ?? filename
          mode = 'staged'
          await appendLog('ingest-irdai-monthly.log', { source: SOURCE_ID, status: 'using_staged_file', raw_file, live_error: liveError })
        }
      }

      // No live data and no staged file → honest failure (never fabricate).
      if (!buffer) {
        const error = liveError ?? 'IRDAI monthly source unavailable and no staged file present.'
        await appendLog('ingest-irdai-monthly.log', { source: SOURCE_ID, status: 'no_data', error })
        return {
          source_id: SOURCE_ID,
          status: 'failed',
          raw_file: null,
          records: [],
          records_fetched: 0,
          fetched_at,
          error,
          warnings: [
            'To populate Monthly: download the IRDAI "Monthly Business Figures – Non-Life Insurers" XLSX and drop it into data/raw/irdai/monthly/. The next run uses it automatically.',
          ],
        }
      }

      // Step 2: parse + extract per-insurer GDPI.
      const { sheets } = parseXlsx(buffer)
      const sheetName = Object.keys(sheets)[0]
      const rows = sheets[sheetName] ?? []

      const records: SnapshotRecord[] = []
      const monthLabel = filename.replace(/\.(xlsx|xls)$/i, '')
      const fy = inferFiscalYear(monthLabel)

      for (const id of ids) {
        const row = findRowByAlias(rows, INSURER_ALIASES[id])
        if (!row) continue
        // IRDAI XLSX rows typically: [Insurer, GDPI for month, YTD, prior YTD, growth %].
        // We pick the first numeric cell after the name as the month GDPI.
        const numCols = row.slice(1).map(toNumber)
        const monthVal = numCols.find((v) => v != null) ?? null
        records.push({
          target: 'insurer-monthly-premium',
          keys: { company_id: id, month: monthLabel },
          values: {
            period_type: 'monthly',
            fiscal_year: fy,
            gross_direct_premium: monthVal,
          },
          provenance: {
            source_name: `IRDAI Monthly Business Figures (${monthLabel})`,
            source_url: xlsxUrl ?? SOURCE_URL,
            source_file: raw_file,
            source_period: monthLabel,
            fetched_at,
            parsed_at: nowIso(),
            parser_name: 'ingest-irdai-monthly',
            confidence: 'high',
          },
        })
      }

      await appendLog('ingest-irdai-monthly.log', {
        source: SOURCE_ID,
        status: 'success',
        mode,
        records: records.length,
        sheet: sheetName,
        filename,
      })

      return {
        source_id: SOURCE_ID,
        status: records.length > 0 ? 'success' : 'failed',
        raw_file,
        records,
        records_fetched: records.length,
        fetched_at,
        warnings:
          records.length === 0
            ? [`Parsed ${rows.length} rows from ${filename} but no insurer aliases matched.`]
            : undefined,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await appendLog('ingest-irdai-monthly.log', { source: SOURCE_ID, status: 'error', error })
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

function inferFiscalYear(label: string): string {
  // label looks like "2025-04" or "Apr-2025" → infer FY.
  // Indian FY runs Apr → Mar; April 2025 belongs to FY26 (FY 2025-26).
  const m = label.match(/(\d{4})[-_/](\d{1,2})/) ?? label.match(/(\d{1,2})[-_/](\d{4})/)
  if (!m) return 'FY' + new Date().getFullYear().toString().slice(2)
  const yyyy = m[1].length === 4 ? Number(m[1]) : Number(m[2])
  const mm = m[1].length === 4 ? Number(m[2]) : Number(m[1])
  const fyEnd = mm >= 4 ? yyyy + 1 : yyyy
  return `FY${String(fyEnd).slice(2)}`
}
