// ---------------------------------------------------------------------------
//  Fetcher — GI Council MONTHLY FLASH REPORTS → Stand-Alone Health Insurers.
//
//  These PDFs carry the per-insurer MONTHLY premium (current + previous year,
//  growth, YTD, market share) for the 7 SAHI companies — the monthly SAHI data
//  the dashboard is missing.
//
//  IMPORTANT REACHABILITY NOTE: gicouncil.in serves these from behind a WAF
//  that 403s datacenter IPs (proven from the Actions runner). So this fetcher
//  only returns data when fetchBuffer can route through an allowed IP — i.e.
//  when the INGEST_FETCH_PROXY relay secret is set (see parsers.ts). Until then
//  every month stays an honest "pending" (never fabricated). The download +
//  section-parse + validation below are ready; the field-column mapping is
//  marked for validation against the first real PDF the relay returns.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult } from './types'
import { appendLog, nowIso, isOfflineMode, REPO_ROOT } from './util'
import { fetchOrLoadRaw, parsePdf, toNumber } from './parsers'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const SOURCE_ID = 'gicouncil_flash_sahi'

// User-supplied exact flash-report PDF URLs, keyed YYYY-MM (report month).
const MONTH_URLS: Record<string, string> = {
  '2026-04': 'https://www.gicouncil.in/media/4642/flash-report-april-pdf.pdf',
  '2026-03': 'https://www.gicouncil.in/media/4629/flsh-report-march-2026.pdf',
  '2026-02': 'https://www.gicouncil.in/media/4603/flash_feb_2026.pdf',
  '2026-01': 'https://www.gicouncil.in/media/4594/jan-2026-flash-report-1.pdf',
  '2025-12': 'https://www.gicouncil.in/media/4588/flash_december_2025.pdf',
  '2025-11': 'https://www.gicouncil.in/media/4579/flash-report-nov-2025.pdf',
  '2025-10': 'https://www.gicouncil.in/media/4576/flash-report-october-2025.pdf',
  '2025-09': 'https://www.gicouncil.in/media/4568/month-of-september-flash-report.pdf',
  '2025-08': 'https://www.gicouncil.in/media/4563/flash-report-august-2025.pdf',
  '2025-07': 'https://www.gicouncil.in/media/4557/flash-report-july-2025.pdf',
  '2025-06': 'https://www.gicouncil.in/media/4544/flash-reportt-june-2025.pdf',
  '2025-05': 'https://www.gicouncil.in/media/4537/flash-report-may-2025.pdf',
  '2025-04': 'https://www.gicouncil.in/media/4523/flash_april_2025.pdf',
}

// The 7 Stand-Alone Health Insurers + alias→slug. Aliases are matched
// case-insensitively against each row's leading text.
const SAHI: { slug: string; aliases: string[] }[] = [
  { slug: 'niva-bupa', aliases: ['niva bupa'] },
  { slug: 'aditya-birla-health', aliases: ['aditya birla'] },
  { slug: 'care-health', aliases: ['care health'] },
  { slug: 'galaxy-health', aliases: ['galaxy health'] },
  { slug: 'manipalcigna', aliases: ['manipalcigna', 'manipal cigna'] },
  { slug: 'narayana-health', aliases: ['narayana'] },
  { slug: 'star-health', aliases: ['star health', 'star health & allied', 'star health and allied'] },
]

interface FlashRow {
  month: string
  insurer_slug: string
  insurer_name: string
  premium_month_cy: number | null
  premium_month_py: number | null
  growth_month_pct: number | null
  premium_cumulative_cy: number | null
  premium_cumulative_py: number | null
  growth_cumulative_pct: number | null
  market_share_cy_pct: number | null
  market_share_py_pct: number | null
  source_url: string
  fetched_at: string
}

/**
 * Locate the "Stand Alone Health Insurers" block and, for each SAHI alias,
 * pull the numeric tokens from its row. Column order in GI Council flash
 * reports is (current-month, prev-year-month, growth%, YTD-current,
 * YTD-prev, growth%, share-current%, share-prev%) — but THIS MAPPING MUST BE
 * VERIFIED against the first real PDF the relay returns; if the row has fewer
 * tokens than expected the extra fields stay null (fail-safe, never guessed).
 */
function parseSahiSection(text: string, month: string, url: string, fetched_at: string): FlashRow[] {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => /stand[\s-]*alone\s+health/i.test(l))
  if (start === -1) return []
  const rest = lines.slice(start + 1)
  const endRel = rest.findIndex((l) => /(special{1,2}ed|special\s+insurers|grand\s+total|total\s+(general|non-life)|industry\s+total)/i.test(l))
  const block = (endRel === -1 ? rest : rest.slice(0, endRel)).join('\n')

  const rows: FlashRow[] = []
  for (const c of SAHI) {
    const re = new RegExp(`(${c.aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})[^\\n]*`, 'i')
    const m = block.match(re)
    if (!m) continue
    const nums = (m[0].match(/-?\d[\d,]*\.?\d*/g) ?? []).map((n) => toNumber(n))
    rows.push({
      month,
      insurer_slug: c.slug,
      insurer_name: m[0].slice(0, 60).trim(),
      premium_month_cy: nums[0] ?? null,
      premium_month_py: nums[1] ?? null,
      growth_month_pct: nums[2] ?? null,
      premium_cumulative_cy: nums[3] ?? null,
      premium_cumulative_py: nums[4] ?? null,
      growth_cumulative_pct: nums[5] ?? null,
      market_share_cy_pct: nums[6] ?? null,
      market_share_py_pct: nums[7] ?? null,
      source_url: url,
      fetched_at,
    })
  }
  return rows
}

export const ingestGicouncilFlash: Fetcher = {
  source_id: SOURCE_ID,
  name: 'GI Council monthly flash reports (Stand-Alone Health Insurers)',
  frequency: 'monthly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const months: { month: string; partial: boolean; companies: FlashRow[]; warning?: string }[] = []
    const warnings: string[] = []
    let anyData = false

    for (const [month, url] of Object.entries(MONTH_URLS)) {
      try {
        const { buffer } = await fetchOrLoadRaw(url, 'gicouncil/flash-reports', `${month}.pdf`, /\.pdf$/i)
        const { text } = await parsePdf(buffer)
        const companies = parseSahiSection(text, month, url, fetched_at)
        const partial = companies.length < SAHI.length
        if (companies.length) anyData = true
        months.push({
          month,
          partial,
          companies,
          warning: partial ? `Only ${companies.length}/${SAHI.length} SAHI parsed — month marked partial (source: ${url})` : undefined,
        })
        if (partial) warnings.push(`${month}: ${companies.length}/${SAHI.length} SAHI companies parsed (partial).`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        months.push({ month, partial: true, companies: [], warning: `fetch failed: ${msg}` })
        warnings.push(`${month}: ${msg}`)
      }
    }

    // Write the processed JSON the dashboard reads — even when empty, so the UI
    // shows an honest "pending" rather than nothing.
    const out = {
      _meta: {
        snapshot_id: 'sahi-monthly-flash',
        description: 'Monthly Stand-Alone Health Insurer premium from GI Council flash reports.',
        source: 'GI Council Flash Report PDF',
        dataset: anyData ? 'official' : 'pending',
        last_updated: anyData ? fetched_at.slice(0, 10) : null,
        sahi_universe: SAHI.map((s) => s.slug),
        note: anyData
          ? 'Source: GI Council Flash Report PDF, per month.'
          : 'Pending — GI Council 403s the runner; set INGEST_FETCH_PROXY (India-IP relay) to populate.',
      },
      months,
    }
    const dir = resolve(REPO_ROOT, 'data', 'processed')
    await mkdir(dir, { recursive: true })
    await writeFile(resolve(dir, 'sahi-monthly-flash.json'), JSON.stringify(out, null, 2) + '\n', 'utf8')

    await appendLog('ingest-gicouncil-flash.log', { source: SOURCE_ID, months: months.length, anyData, offline: isOfflineMode() })
    return {
      source_id: SOURCE_ID,
      status: anyData ? 'success' : 'pending',
      raw_file: null,
      records: [],
      records_fetched: months.reduce((n, m) => n + m.companies.length, 0),
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}
