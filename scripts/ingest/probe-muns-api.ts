// TEMPORARY diagnostic — discover the muns market-data API contract from CI
// (the sandbox can't reach it). Dumps the OpenAPI spec (every route + the
// /market_data response model) and probes a few ways to pull the FULL dataset
// rather than the "Sample Data Preview" the bare call returns. Deleted once the
// fetcher is wired to the real contract.

const BASE = 'https://fastapi.muns.io'
const Q = 'ticker=NIVABUPA&start=2026-06-01&end=2026-06-10&country=India'

async function get(url: string): Promise<void> {
  console.log('\n=== GET ' + url)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json, text/csv, */*' } })
    const t = await r.text()
    console.log(`status=${r.status} content-type=${r.headers.get('content-type')} bytes=${t.length}`)
    if (url.endsWith('/openapi.json')) {
      try {
        const j = JSON.parse(t)
        console.log('PATHS: ' + JSON.stringify(Object.keys(j.paths ?? {})))
        const md = j.paths?.['/market_data']
        console.log('/market_data spec: ' + JSON.stringify(md).slice(0, 1500))
      } catch {
        console.log('openapi head: ' + t.slice(0, 600))
      }
    } else {
      console.log('head: ' + JSON.stringify(t.slice(0, 700)))
    }
  } catch (e) {
    console.log('ERROR: ' + (e instanceof Error ? e.message : String(e)))
  }
}

const main = async () => {
  await get(`${BASE}/openapi.json`)
  await get(`${BASE}/market_data?${Q}`) // baseline preview
  await get(`${BASE}/market_data?${Q}&format=json`)
  await get(`${BASE}/market_data?${Q}&full=true`)
  await get(`${BASE}/market_data?${Q}&preview=false`)
  await get(`${BASE}/shared/csv/NIVABUPANS.csv`)
  await get(`${BASE}/static/csv/NIVABUPANS.csv`)
  await get(`${BASE}/download?file=NIVABUPANS.csv`)
  await get(`${BASE}/files/NIVABUPANS.csv`)
}
main()
