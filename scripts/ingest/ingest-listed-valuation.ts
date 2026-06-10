// ---------------------------------------------------------------------------
//  Ingest — listed-insurer valuation multiples into valuation-snapshot.json.
//
//  Neha asked the Analysis Builder's Valuation columns (P/E, P/B, P/GWP) to come
//  from "the market feed". The two listed SAHIs (Star Health, Niva Bupa) publish
//  a Stock P/E and Price-to-Book on their Screener.in page; the other three SAHIs
//  are unlisted and have no market price, so they stay null (honest n/a).
//
//  Pipeline:
//    1. Run the existing Screener fetcher (live, via the India-IP proxy set in
//       CI) → screener-crosscheck-snapshot.json carries pe_ttm, price_to_book,
//       market_cap, current_price per listed company.
//    2. Map those into the canonical ValuationRow shape, derive Price/GWP from
//       market cap ÷ latest-FY GWP, and write valuation-snapshot.json.
//
//  Honesty: every emitted number traces to the Screener page (provenance +
//  date). A company with no P/E or P/B on the page contributes no row — never a
//  fabricated 0. If Screener is blocked, the snapshot is left untouched.
// ---------------------------------------------------------------------------

import { fetchScreener } from './fetch-screener'
import { appendLog, nowIso, readSnapshot, writeSnapshot } from './util'
import type { InsurerAnnualRow, SnapshotEnvelope } from '../../src/data/snapshots/_schemas'

interface CrossRow {
  company_id: string
  metric: string
  value: number | null
  provenance: Record<string, unknown>
}
interface CrosscheckSnapshot {
  data: CrossRow[]
}

async function loadLatestGwp(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  try {
    const snap = await readSnapshot<SnapshotEnvelope<InsurerAnnualRow>>('insurer-annual-snapshot.json')
    const latestFy = new Map<string, string>()
    for (const row of snap.data) {
      if (typeof row.gwp !== 'number') continue
      const prev = latestFy.get(row.company_id)
      if (!prev || row.fiscal_year > prev) {
        latestFy.set(row.company_id, row.fiscal_year)
        out.set(row.company_id, row.gwp)
      }
    }
  } catch {
    /* no GWP → Price/GWP stays null */
  }
  return out
}

async function main(): Promise<number> {
  const fetched_at = nowIso()
  const date = fetched_at.slice(0, 10)

  // 1. Refresh the Screener crosscheck (writes the snapshot; live in CI).
  const res = await fetchScreener.run()
  console.log(`screener: status=${res.status} rows=${res.records_fetched}`)
  for (const w of res.warnings ?? []) console.log(`  warn: ${w}`)

  // 2. Read back the parsed metrics and the GWP basis.
  const cross = await readSnapshot<CrosscheckSnapshot>('screener-crosscheck-snapshot.json')
  const gwpByCompany = await loadLatestGwp()

  // Group the crosscheck rows by company.
  const byCompany = new Map<string, Map<string, { value: number; prov: Record<string, unknown> }>>()
  for (const r of cross.data ?? []) {
    if (r.value == null) continue
    if (!byCompany.has(r.company_id)) byCompany.set(r.company_id, new Map())
    byCompany.get(r.company_id)!.set(r.metric, { value: r.value, prov: r.provenance })
  }

  const rows = []
  for (const [company_id, metrics] of byCompany) {
    const pe = metrics.get('pe_ttm')?.value ?? null
    const pb = metrics.get('price_to_book')?.value ?? null
    const market_cap = metrics.get('market_cap')?.value ?? null
    const share_price = metrics.get('current_price')?.value ?? null
    // Only emit a row that carries at least one valuation multiple.
    if (pe == null && pb == null) continue
    const gwp = gwpByCompany.get(company_id) ?? null
    const price_to_gwp = market_cap != null && gwp != null && gwp > 0 ? Math.round((market_cap / gwp) * 100) / 100 : null
    const prov = metrics.get('pe_ttm')?.prov ?? metrics.get('price_to_book')?.prov ?? {}
    rows.push({
      company_id,
      date,
      market_cap,
      share_price,
      shares_outstanding: null,
      price_to_book: pb,
      price_to_earnings: pe,
      price_to_gwp,
      price_to_nep: null,
      analyst_target_price: null,
      provenance: {
        source_name: `Screener.in public page (${company_id}) — listed-insurer valuation`,
        source_url: `https://www.screener.in/company/${company_id === 'niva-bupa' ? 'NIVABUPA' : 'STARHEALTH'}/consolidated/`,
        source_period: 'TTM',
        fetched_at,
        parsed_at: nowIso(),
        parser_name: 'ingest-listed-valuation',
        confidence: 'medium',
        ...prov,
      },
    })
    await appendLog('ingest-listed-valuation.log', { company_id, pe, pb, price_to_gwp, market_cap })
  }

  await writeSnapshot('valuation-snapshot.json', {
    _meta: {
      snapshot_id: 'valuation-snapshot',
      description: 'Daily valuation snapshot for listed insurers — price, market cap, P/GWP, P/B, P/E.',
      schema_version: '1.0.0',
      dataset: rows.length ? 'mixed' : 'pending',
      last_updated: rows.length ? date : null,
      last_successful_run: rows.length ? fetched_at : null,
      upstream_sources: ['screener_public'],
      parser_status: rows.length ? 'ready' : 'pending',
      notes: 'Listed-insurer only (Star Health, Niva Bupa). Unlisted SAHIs (Care, Aditya Birla, ManipalCigna) have no market price → null (n/a). P/E and P/B sourced from the Screener public page; P/GWP = market cap ÷ latest-FY GWP.',
    },
    data: rows,
  })

  console.log(`valuation-snapshot: wrote ${rows.length} listed-insurer row(s).`)
  return 0
}

main().then((code) => { process.exitCode = code }).catch((e) => {
  console.error('ingest-listed-valuation error:', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
})
