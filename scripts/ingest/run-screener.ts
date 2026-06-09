// Focused runner for the Screener.in backup fetcher. Downloads the public
// company pages (via the India-IP fetch proxy set in CI) into
// data/raw/screener/<company>/ and writes the crosscheck snapshot. The raw HTML
// is then parsed locally for the specific audit cell(s) we want.
import { fetchScreener } from './fetch-screener'

fetchScreener
  .run()
  .then((r) => {
    console.log(`screener: status=${r.status} rows=${r.records_fetched}`)
    for (const w of r.warnings ?? []) console.log(`  warn: ${w}`)
  })
  .catch((e) => {
    console.error('screener run error:', e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  })
