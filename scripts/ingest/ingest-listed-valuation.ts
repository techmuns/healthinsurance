// ---------------------------------------------------------------------------
//  Ingest — listed-insurer valuation multiples into valuation-snapshot.json.
//
//  Neha asked the Analysis Builder's Valuation columns (P/E, P/B, P/GWP) to come
//  from "the market feed". The two listed SAHIs (Star Health, Niva Bupa) publish
//  a Stock P/E and Book Value on their Screener.in page; the other three SAHIs
//  are unlisted and have no market price, so they stay null (honest n/a).
//
//  Screener renders the top-ratio numbers client-side, so the fetch MUST run
//  with JS rendering (scraperapi render=true, set in the workflow's
//  INGEST_FETCH_PROXY). We fetch + parse each page directly here rather than via
//  fetchScreener.run(), because that path's access-block detector false-positives
//  on Screener's "Premium feature" upsell banner even though P/E and Book Value
//  are public.
//
//    P/E  = Screener "Stock P/E"
//    P/B  = current price ÷ Book Value   (Screener shows Book Value, not P/B)
//    P/GWP = market cap ÷ latest-FY GWP  (insurer-annual-snapshot)
//
//  Honesty: every number traces to the Screener page (provenance + date). A
//  company with no P/E and no derivable P/B contributes no row — never a
//  fabricated 0. A genuinely blocked page (Cloudflare/CAPTCHA/login/empty) is
//  skipped; the snapshot is only rewritten when at least one row is built.
// ---------------------------------------------------------------------------

import { parseScreener } from './fetch-screener'
import { fetchOrLoadRaw } from './parsers'
import { appendLog, nowIso, readSnapshot, writeSnapshot } from './util'
import type { InsurerAnnualRow, SnapshotEnvelope } from '../../src/data/snapshots/_schemas'

const TARGETS: Array<{ company_id: string; symbol: string }> = [
  { company_id: 'niva-bupa', symbol: 'NIVABUPA' },
  { company_id: 'star-health', symbol: 'STARHEALTH' },
]

function screenerUrl(symbol: string): string {
  return `https://www.screener.in/company/${encodeURIComponent(symbol)}/consolidated/`
}

/** Hard block signals only — NOT the "premium feature" upsell banner. */
function isHardBlock(html: string): string | null {
  const head = html.slice(0, 20000).toLowerCase()
  if (/just a moment|cf-browser-verification|cloudflare/.test(head)) return 'cloudflare'
  if (/captcha|recaptcha|hcaptcha/.test(head)) return 'captcha'
  if (/please log\s?in|sign in to continue|login required/.test(head)) return 'login wall'
  if (/access denied|403 forbidden/.test(head)) return '403'
  if (head.trim().length < 200) return 'empty'
  return null
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

const round2 = (v: number): number => Math.round(v * 100) / 100

async function main(): Promise<number> {
  const fetched_at = nowIso()
  const date = fetched_at.slice(0, 10)
  const gwpByCompany = await loadLatestGwp()

  const rows = []
  for (const t of TARGETS) {
    const url = screenerUrl(t.symbol)
    try {
      const { buffer, raw_file, mode } = await fetchOrLoadRaw(
        url,
        `screener/${t.company_id}`,
        `${t.company_id}-screener-${date}.html`,
        /\.(html?|json)$/i,
      )
      const block = isHardBlock(buffer.toString('utf8'))
      if (block) {
        console.log(`  · ${t.company_id}: blocked (${block}) — skipped.`)
        await appendLog('ingest-listed-valuation.log', { company_id: t.company_id, status: 'blocked', reason: block })
        continue
      }
      const metrics = new Map(parseScreener(buffer, t.company_id, url, raw_file, fetched_at).map((r) => [r.metric, r.value]))
      const pe = metrics.get('pe_ttm') ?? null
      const price = metrics.get('current_price') ?? null
      const bookValue = metrics.get('book_value') ?? null
      const directPb = metrics.get('price_to_book') ?? null
      const market_cap = metrics.get('market_cap') ?? null
      const pb = directPb ?? (price != null && bookValue != null && bookValue > 0 ? round2(price / bookValue) : null)

      if (pe == null && pb == null) {
        console.log(`  · ${t.company_id}: no P/E or P/B on page (mode=${mode}) — skipped.`)
        await appendLog('ingest-listed-valuation.log', { company_id: t.company_id, status: 'no-multiples', pe, price, bookValue })
        continue
      }

      const gwp = gwpByCompany.get(t.company_id) ?? null
      const price_to_gwp = market_cap != null && gwp != null && gwp > 0 ? round2(market_cap / gwp) : null

      rows.push({
        company_id: t.company_id,
        date,
        market_cap,
        share_price: price,
        shares_outstanding: null,
        price_to_book: pb,
        price_to_earnings: pe,
        price_to_gwp,
        price_to_nep: null,
        analyst_target_price: null,
        provenance: {
          source_name: `Screener.in public page (${t.symbol}) — Stock P/E${pb != null && directPb == null ? ', Book Value' : ''}`,
          source_url: url,
          source_file: raw_file,
          source_period: 'TTM',
          fetched_at,
          parsed_at: nowIso(),
          parser_name: 'ingest-listed-valuation',
          confidence: 'medium',
        },
      })
      console.log(`  + ${t.company_id}: P/E ${pe ?? 'n/a'} · P/B ${pb ?? 'n/a'} · P/GWP ${price_to_gwp ?? 'n/a'}`)
      await appendLog('ingest-listed-valuation.log', { company_id: t.company_id, status: 'parsed', pe, pb, price_to_gwp, market_cap, mode })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.log(`  ! ${t.company_id}: ${reason}`)
      await appendLog('ingest-listed-valuation.log', { company_id: t.company_id, status: 'error', reason })
    }
  }

  if (rows.length === 0) {
    console.log('No listed-insurer valuation rows built — leaving valuation-snapshot.json untouched.')
    return 0
  }

  await writeSnapshot('valuation-snapshot.json', {
    _meta: {
      snapshot_id: 'valuation-snapshot',
      description: 'Daily valuation snapshot for listed insurers — price, market cap, P/GWP, P/B, P/E.',
      schema_version: '1.0.0',
      dataset: 'mixed',
      last_updated: date,
      last_successful_run: fetched_at,
      upstream_sources: ['screener_public'],
      parser_status: 'ready',
      notes: 'Listed-insurer only (Star Health, Niva Bupa). Unlisted SAHIs (Care, Aditya Birla, ManipalCigna) have no market price → null (n/a). P/E from Screener "Stock P/E"; P/B = current price ÷ Book Value; P/GWP = market cap ÷ latest-FY GWP.',
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
