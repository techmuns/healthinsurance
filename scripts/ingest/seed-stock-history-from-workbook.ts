// ---------------------------------------------------------------------------
//  seed-stock-history-from-workbook — one-time (idempotent) seed of the daily
//  stock-movement history from the Niva Bupa portfolio-review workbook.
//
//  The workbook's "Historical Stock Movement" tab is the real listing→Jul-2025
//  daily series (NSE security-wise price & delivery, originally via the paid
//  S&P Capital IQ plug-in). NSE WAF-blocks the cloud runner, so this is how the
//  real deliverable-quantity column gets into the store. From there the Yahoo
//  fetcher (scripts/ingest/fetch-yahoo-price.ts) keeps the series current going
//  forward (close + volume; deliverable stays null until an NSE file fills it).
//
//  Re-running is a no-op once the rows are present (merge is fill-nulls), so it
//  is safe to keep in the repo as the reproducible provenance of the seed.
//
//    npm run seed:stock-history
// ---------------------------------------------------------------------------

import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'
import { RAW_ROOT, fileExists, nowIso } from './util'
import {
  loadPriceHistory,
  mergePriceRows,
  savePriceHistory,
  type PriceRow,
} from './price-history-store'

const COMPANY_ID = 'niva-bupa'
const WORKBOOK = resolve(RAW_ROOT, 'exchanges', COMPANY_ID, 'niva-bupa-historical-stock-movement.xlsx')
const SOURCE_URL = 'https://www.nseindia.com/get-quotes/equity?symbol=NIVABUPA'
const SOURCE_FILE = 'data/raw/exchanges/niva-bupa/niva-bupa-historical-stock-movement.xlsx'

/** Excel serial (1900 date system) → ISO date (YYYY-MM-DD). */
function serialToIso(serial: unknown): string | null {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[, ]/g, ''))
  return Number.isFinite(n) ? n : null
}

async function main() {
  if (!(await fileExists(WORKBOOK))) {
    console.error(`seed-stock-history: workbook not found at ${WORKBOOK}`)
    process.exitCode = 1
    return
  }

  const wb = XLSX.read(await readFile(WORKBOOK), { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })

  const fetched_at = nowIso()
  const provenance = {
    source_name: 'Niva Bupa portfolio review workbook — NSE security-wise price & delivery',
    source_url: SOURCE_URL,
    source_file: SOURCE_FILE,
    fetched_at,
    parsed_at: fetched_at,
    parser_name: 'seed-stock-history-from-workbook',
    confidence: 'high' as const,
  }

  // Daily table: column B=date, C=close, D=total traded qty, E=deliverable qty
  // (the "% Deli." column F is derived, so it isn't stored — it's recomputed).
  const incoming: PriceRow[] = []
  for (const r of rows) {
    if (!Array.isArray(r)) continue
    const date = serialToIso(r[1])
    if (!date) continue
    const close = num(r[2])
    if (close === null) continue // skip header / "Average" / blank rows
    incoming.push({
      company_id: COMPANY_ID,
      date,
      close,
      traded_qty: num(r[3]),
      deliverable_qty: num(r[4]),
      provenance: { ...provenance, source_period: date },
    })
  }

  if (!incoming.length) {
    console.error('seed-stock-history: parsed 0 daily rows — workbook layout may have changed.')
    process.exitCode = 1
    return
  }

  const snap = await loadPriceHistory()
  const { added, enriched } = mergePriceRows(snap, incoming)
  await savePriceHistory(snap, {
    notes:
      'Daily close / traded / deliverable quantity per listed insurer. Workbook seed (NSE via S&P Capital IQ) for niva-bupa listing→Jul-2025; Yahoo Finance keeps it current (close + volume). Deliverable quantity is NSE-only — null where only Yahoo covers a day, until an NSE delivery file is staged.',
    seeded_from_workbook: SOURCE_FILE,
  })

  const niva = snap.data.filter((r) => r.company_id === COMPANY_ID)
  console.log(
    `seed-stock-history: parsed ${incoming.length} workbook rows · added ${added} · enriched ${enriched} · ` +
      `niva-bupa rows now ${niva.length} (${niva[0]?.date} → ${niva[niva.length - 1]?.date})`,
  )
}

main().catch((err) => {
  console.error('seed-stock-history failed:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
