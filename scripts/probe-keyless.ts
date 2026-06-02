// ---------------------------------------------------------------------------
//  Probe: are the GI Council MONTHLY FLASH-REPORT PDFs (user-supplied exact
//  URLs) reachable from the GitHub Actions runner? These carry the per-insurer
//  "Stand Alone Health Insurers" monthly premium we want. Earlier the gicouncil
//  /media/ path 403'd the runner (datacenter WAF) — this confirms it for the
//  exact flash URLs before we build a downloader/parser. Commits nothing.
// ---------------------------------------------------------------------------

const TARGETS: [string, string][] = [
  ['April 2026 flash', 'https://www.gicouncil.in/media/4642/flash-report-april-pdf.pdf'],
  ['Dec 2025 flash', 'https://www.gicouncil.in/media/4588/flash_december_2025.pdf'],
  ['April 2025 flash', 'https://www.gicouncil.in/media/4523/flash_april_2025.pdf'],
  ['flash-figures page', 'https://www.gicouncil.in/statistics/industry-statistics/flash-figures/'],
]
const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/pdf,text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.gicouncil.in/statistics/industry-statistics/flash-figures/',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
}

async function main(): Promise<void> {
  console.log('── GI Council FLASH-report reachability probe (Actions egress) ──')
  for (const [name, url] of TARGETS) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' })
      const buf = Buffer.from(await res.arrayBuffer())
      const head = buf.subarray(0, 5).toString('latin1')
      const isPdf = head.startsWith('%PDF')
      console.log(`[${res.ok && isPdf ? 'GOT PDF ✅' : res.ok ? 'OK (not pdf)' : 'BLOCKED'}] HTTP ${res.status} · ${name}\n        ${url}\n        bytes=${buf.length} type=${res.headers.get('content-type') ?? '?'} head=${JSON.stringify(head)}`)
    } catch (err) {
      console.log(`[ERROR] ${name} :: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  console.log('── done ──')
}
void main()
