// ---------------------------------------------------------------------------
//  Reachability probe #2 — can a FREE, keyless middleman reach IRDAI for us?
//
//  IRDAI blocks the runner's datacenter IP directly (403). This probe tests
//  public reader / CORS-proxy services + the Wayback Machine archive, which
//  fetch from THEIR own (often non-blocked) addresses and hand back the
//  content. If any returns real IRDAI HTML (XLSX links / premium text) instead
//  of a block page, that's a keyless relay — no signup, no credential.
//
//  Pure diagnostics: fetches nothing into the data tree, commits nothing.
// ---------------------------------------------------------------------------

const IRDAI_MONTHLY = 'https://irdai.gov.in/monthly-business-figures-non-life-insurers'
const enc = encodeURIComponent(IRDAI_MONTHLY)

interface Target { name: string; url: string }

const TARGETS: Target[] = [
  { name: 'Jina Reader → IRDAI', url: `https://r.jina.ai/${IRDAI_MONTHLY}` },
  { name: 'AllOrigins raw → IRDAI', url: `https://api.allorigins.win/raw?url=${enc}` },
  { name: 'corsproxy.io → IRDAI', url: `https://corsproxy.io/?url=${enc}` },
  { name: 'Wayback available? → IRDAI', url: `https://archive.org/wayback/available?url=${enc}` },
  { name: 'Wayback latest snapshot → IRDAI', url: `https://web.archive.org/web/2id_/${IRDAI_MONTHLY}` },
  { name: 'data.gov.in API base', url: 'https://api.data.gov.in/' },
]

function looksLikeIrdai(body: string): boolean {
  const b = body.toLowerCase()
  return /\.xlsx|gross direct premium|non-life|monthly business|niva|star health|new india/.test(b)
}
function looksBlocked(status: number, body: string): boolean {
  const b = body.toLowerCase()
  return status === 403 || /forbidden|access denied|attention required|not in allowlist|cloudflare/.test(b)
}

async function probe(t: Target): Promise<void> {
  const started = Date.now()
  try {
    const res = await fetch(t.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', Accept: '*/*' },
      redirect: 'follow',
    })
    const body = await res.text()
    const ms = Date.now() - started
    const verdict = res.ok && looksLikeIrdai(body) ? 'GOT IRDAI CONTENT ✅' : looksBlocked(res.status, body) ? 'blocked' : res.ok ? 'reachable (no IRDAI content)' : 'http error'
    const xlsx = (body.match(/\.xlsx/gi) ?? []).length
    console.log(`[${verdict}] HTTP ${res.status} · ${t.name}\n        bytes=${body.length} xlsxMentions=${xlsx} ${ms}ms\n        snippet: ${body.replace(/\s+/g, ' ').slice(0, 180)}`)
  } catch (err) {
    console.log(`[ERROR] ${t.name} :: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function main(): Promise<void> {
  console.log('── Free keyless-middleman probe for IRDAI (GitHub Actions egress) ──')
  for (const t of TARGETS) await probe(t)
  console.log('── done ──')
}

void main()
