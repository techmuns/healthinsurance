// TEMPORARY diagnostic — discover the muns market-data API contract from CI.
// /market_data only returns a saved-file PREVIEW; the OpenAPI spec lists a
// /stock-data route that is almost certainly the full-series JSON endpoint.
// Dump its spec + a real response. Deleted once the fetcher is wired.

const BASE = 'https://fastapi.muns.io'
const Q = 'ticker=NIVABUPA&start=2026-06-01&end=2026-06-10&country=India'

async function get(url: string, full = false): Promise<void> {
  console.log('\n=== GET ' + url)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json, */*' } })
    const t = await r.text()
    console.log(`status=${r.status} content-type=${r.headers.get('content-type')} bytes=${t.length}`)
    console.log('head: ' + JSON.stringify(t.slice(0, full ? 1400 : 700)))
  } catch (e) {
    console.log('ERROR: ' + (e instanceof Error ? e.message : String(e)))
  }
}

const main = async () => {
  // Spec for the candidate data routes.
  try {
    const spec = await (await fetch(`${BASE}/openapi.json`)).json()
    for (const p of ['/stock-data', '/stock-data/batch', '/financials/{ticker}']) {
      console.log(`\n--- SPEC ${p}: ` + JSON.stringify(spec.paths?.[p]).slice(0, 1200))
    }
  } catch (e) {
    console.log('spec error: ' + (e instanceof Error ? e.message : String(e)))
  }
  // Try the full-series endpoint a few plausible ways.
  await get(`${BASE}/stock-data?${Q}`, true)
  await get(`${BASE}/stock-data?${Q}&interval=1d`, true)
  await get(`${BASE}/stock-data/batch?${Q}`, true)
}
main()
