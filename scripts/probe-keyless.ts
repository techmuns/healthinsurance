// ---------------------------------------------------------------------------
//  Standalone reachability probe for KEYLESS alternative sources.
//
//  Runs in GitHub Actions (full internet egress) and simply reports the HTTP
//  status + any discovered download links for candidate sources that publish
//  the same data IRDAI gates — chiefly the General Insurance Council. Tells us,
//  cheaply and definitively, whether the runner can reach them WITHOUT a relay
//  before we invest in a parser. Pure diagnostics — fetches nothing into the
//  data tree, commits nothing.
// ---------------------------------------------------------------------------

const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
}

interface Target {
  name: string
  url: string
  html?: boolean
}

const TARGETS: Target[] = [
  { name: 'GIC home', url: 'https://www.gicouncil.in/' },
  { name: 'GIC segment-wise report page', url: 'https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report-on-homepage/', html: true },
  { name: 'GIC flash-figures page', url: 'https://www.gicouncil.in/statistics/industry-statistics/flash-figures/', html: true },
  { name: 'GIC sample segment XLSX', url: 'https://www.gicouncil.in/media/4561/segment_july_2025.xlsx' },
  { name: 'BSE header API (valuation alt)', url: 'https://api.bseindia.com/BseIndiaAPI/api/getScripHeaderData/w?Debtflag=&scripcode=543308&seriesid=' },
]

async function probe(t: Target): Promise<void> {
  const started = Date.now()
  try {
    const res = await fetch(t.url, { headers: { ...HEADERS, Referer: new URL(t.url).origin + '/' }, redirect: 'follow' })
    const buf = Buffer.from(await res.arrayBuffer())
    const ms = Date.now() - started
    let extra = `bytes=${buf.length} type=${res.headers.get('content-type') ?? '?'} ${ms}ms`
    if (t.html && res.ok) {
      const body = buf.toString('utf8')
      const links = [...body.matchAll(/href=["']([^"']*(?:segment|flash|gdpi)[^"']*\.(?:xlsx|xls|pdf))["']/gi)].map((m) => m[1])
      const uniq = [...new Set(links)].slice(0, 8)
      extra += ` downloadLinks=${uniq.length}`
      if (uniq.length) extra += `\n        ${uniq.join('\n        ')}`
    }
    console.log(`[${res.ok ? 'REACHABLE' : 'BLOCKED'}] HTTP ${res.status} · ${t.name}\n        ${t.url}\n        ${extra}`)
  } catch (err) {
    console.log(`[ERROR] ${t.name}\n        ${t.url}\n        ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function main(): Promise<void> {
  console.log('── Keyless-source reachability probe (GitHub Actions egress) ──')
  for (const t of TARGETS) await probe(t)
  console.log('── done ──')
}

void main()
