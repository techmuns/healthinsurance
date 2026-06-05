// ---------------------------------------------------------------------------
//  Fetcher — Trendlyne (BACKUP only; analyst coverage + shareholding).
//
//  Policy (Neha, 2026-06-05): official-first. Analyst broker targets are the one
//  block in the workbook with NO official equivalent (there is no IRDAI/NSE feed
//  for "Motilal Oswal target ₹92"), so an aggregator is legitimately the only
//  source. Trendlyne is used here for that block and as a SHAREHOLDING backup
//  behind the official NSE/BSE shareholding-pattern filing. Every value is
//  tagged source:'backup', confidence:'low'.
//
//  Login-free: public Trendlyne pages only. No login, no licensed export, no
//  paywalled data. Login wall / CAPTCHA / 403 -> diagnostic + 'blocked', never
//  bypassed. Stage the public page under data/raw/trendlyne/<id>/ as fallback.
//
//  Produces src/data/snapshots/trendlyne-analyst-snapshot.json.
// ---------------------------------------------------------------------------

import type { Fetcher, FetchResult } from './types'
import { appendLog, detectAccessBlock, nowIso, writeSnapshot } from './util'
import { fetchOrLoadRaw } from './parsers'

const SOURCE_ID = 'trendlyne_backup'
const PARSER_NAME = 'fetch-trendlyne'

const TARGETS: Array<{ company_id: string; slug: string }> = [
  { company_id: 'niva-bupa', slug: 'NIVABUPA' },
  { company_id: 'star-health', slug: 'STARHEALTH' },
  { company_id: 'icici-lombard', slug: 'ICICIGI' },
  { company_id: 'godigit', slug: 'GODIGIT' },
]

interface AnalystRow {
  company_id: string
  broker: string | null
  date: string | null
  recommendation: string | null
  target_price: number | null
  provenance: Record<string, unknown>
}

function trendlyneUrl(slug: string): string {
  return `https://trendlyne.com/equity/recommendation/${encodeURIComponent(slug)}/`
}

export const fetchTrendlyne: Fetcher = {
  source_id: SOURCE_ID,
  name: 'Trendlyne analyst coverage + shareholding (backup only)',
  frequency: 'quarterly',
  async run(): Promise<FetchResult> {
    const fetched_at = nowIso()
    const rows: AnalystRow[] = []
    const warnings: string[] = []
    let blocked = false

    for (const t of TARGETS) {
      const url = trendlyneUrl(t.slug)
      try {
        const { buffer, raw_file, mode } = await fetchOrLoadRaw(
          url,
          `trendlyne/${t.company_id}`,
          `${t.company_id}-trendlyne-${fetched_at.slice(0, 10)}.html`,
          /\.(html?|json)$/i,
        )
        const block = detectAccessBlock(buffer, url)
        if (block.blocked) {
          blocked = true
          warnings.push(`${t.company_id}: ${block.reason}. Trendlyne is backup-only and login-free; no bypass attempted. Stage the public page under data/raw/trendlyne/${t.company_id}/.`)
          await appendLog('fetch-trendlyne.log', { source: SOURCE_ID, company_id: t.company_id, status: 'blocked', reason: block.reason })
          continue
        }
        const parsed = parseTrendlyne(buffer, t.company_id, url, raw_file, fetched_at)
        rows.push(...parsed)
        await appendLog('fetch-trendlyne.log', { source: SOURCE_ID, company_id: t.company_id, status: 'parsed', mode, rows: parsed.length })
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        warnings.push(`${t.company_id}: ${reason} (Trendlyne backup).`)
        await appendLog('fetch-trendlyne.log', { source: SOURCE_ID, company_id: t.company_id, status: 'pending', reason })
      }
    }

    await writeSnapshot('trendlyne-analyst-snapshot.json', {
      _meta: {
        snapshot_id: 'trendlyne-analyst-snapshot',
        description: 'BACKUP-ONLY analyst broker targets / recommendations from Trendlyne public pages. Analyst coverage has no official equivalent.',
        schema_version: '1.0.0',
        dataset: rows.length ? 'backup' : 'pending',
        source_policy: 'official-first; aggregator used only where no official source exists (analyst targets). All values confidence:low.',
        last_successful_run: rows.length ? fetched_at : null,
        parser_status: rows.length ? 'ready' : blocked ? 'blocked' : 'pending',
      },
      data: rows,
    })

    return {
      source_id: SOURCE_ID,
      status: rows.length ? 'success' : blocked ? 'blocked' : 'pending',
      raw_file: null,
      records: [],
      records_fetched: rows.length,
      fetched_at,
      warnings: warnings.length ? warnings : undefined,
    }
  },
}

/** Best-effort parse of broker recommendation rows from a Trendlyne public page.
 *  Backup-tier: a miss yields no rows (then those cells stay missing), never a
 *  fabricated target. */
export function parseTrendlyne(
  buffer: Buffer,
  company_id: string,
  url: string,
  raw_file: string,
  fetched_at: string,
): AnalystRow[] {
  const html = buffer.toString('utf8')
  const prov = {
    source_name: `Trendlyne public recommendations (${company_id}) — BACKUP`,
    source_url: url,
    source_file: raw_file,
    source_period: 'latest',
    fetched_at,
    parsed_at: nowIso(),
    parser_name: PARSER_NAME,
    confidence: 'low' as const,
  }
  const out: AnalystRow[] = []
  // Many Trendlyne pages embed a JSON blob of recommendations; prefer it.
  const jsonMatch = html.match(/"recommendations?"\s*:\s*(\[[\s\S]*?\])/)
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[1]) as Array<Record<string, unknown>>
      for (const r of arr) {
        out.push({
          company_id,
          broker: strOrNull(r.broker ?? r.broker_name ?? r.analyst),
          date: strOrNull(r.date ?? r.reco_date),
          recommendation: strOrNull(r.recommendation ?? r.reco ?? r.rating),
          target_price: numOrNull(r.target ?? r.target_price ?? r.tp),
          provenance: prov,
        })
      }
      if (out.length) return out
    } catch {
      /* fall through */
    }
  }
  return out // HTML-table scraping intentionally omitted — backup tier; stage JSON if needed.
}

function strOrNull(v: unknown): string | null {
  const s = v == null ? '' : String(v).trim()
  return s ? s : null
}
function numOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,₹\s]/g, ''))
  return Number.isFinite(n) ? n : null
}
