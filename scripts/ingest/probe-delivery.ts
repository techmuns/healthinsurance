// TEMPORARY diagnostic — find a CI-reachable NSE delivery source for the
// deliverable-quantity column. Tests the archives host (bhavdata + MTO) for a
// few recent trading days. Deleted once a delivery fetcher is wired.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function get(url: string, referer: string): Promise<void> {
  console.log('\n=== GET ' + url)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/csv,text/plain,*/*', Referer: referer } })
    const t = await r.text()
    console.log(`status=${r.status} content-type=${r.headers.get('content-type')} bytes=${t.length}`)
    const niva = t.split(/\r?\n/).find((l) => /NIVABUPA/.test(l))
    console.log('head: ' + JSON.stringify(t.slice(0, 240)))
    if (niva) console.log('NIVABUPA row: ' + JSON.stringify(niva.slice(0, 300)))
  } catch (e) {
    console.log('ERROR: ' + (e instanceof Error ? e.message : String(e)))
  }
}

const DATES = ['10062026', '09062026', '08062026', '05062026'] // DDMMYYYY, recent
const main = async () => {
  for (const d of DATES) {
    await get(`https://archives.nseindia.com/products/content/sec_bhavdata_full_${d}.csv`, 'https://www.nseindia.com/')
    await get(`https://archives.nseindia.com/archives/equities/mto/MTO_${d}.DAT`, 'https://www.nseindia.com/')
  }
}
main()
