// ---------------------------------------------------------------------------
//  gic-fetch — tiered byte-getter for gicouncil.in resources.
//
//  gicouncil.in 403s datacenter IPs, so a single fetch path is never enough.
//  Every GIC fetcher should pull listing pages and report files through this
//  helper, which tries each independent route in order and reports which one
//  delivered:
//
//    1. direct        — fetchBuffer (browser headers → headless browser →
//                       INGEST_FETCH_PROXY relay), the existing machinery.
//    2. scraperapi    — if SCRAPERAPI_KEY is set (routes via an in-region IP).
//    3. public relays — the same keyless fetch-relays the muns agent scripts
//                       use (allorigins / corsproxy / codetabs / thingproxy).
//    4. wayback       — the Internet Archive: latest archived copy of the URL;
//                       for listing pages a STALE copy is only accepted with a
//                       freshness warning, and a fresh "Save Page Now" capture
//                       is requested first (archive.org's own crawler fetches
//                       gicouncil.in from non-blocked IPs, so this also works
//                       as a slow but keyless live path). GIC media files are
//                       immutable (each upload gets a new /media/<id>/ URL),
//                       so ANY archived copy of a media URL is the real file.
//
//  Every response is validated before being accepted (XLSX must carry the ZIP
//  magic, HTML must not be a block/challenge page) — a relay that returns an
//  error page is treated as a miss, never as data. If every route fails the
//  caller gets a thrown error and the month stays an honest pending.
// ---------------------------------------------------------------------------

import { fetchBuffer } from './parsers'
import { detectAccessBlock } from './util'

const WAYBACK_AVAILABLE = 'https://archive.org/wayback/available'
const WAYBACK_SAVE = 'https://web.archive.org/save/'
// Listing pages older than this are stale for discovering NEW months (the
// month links themselves stay valid forever, so stale is warn-not-fail).
const LISTING_FRESH_DAYS = 60

const PUBLIC_RELAYS: string[] = [
  'https://api.allorigins.win/raw?url={url}',
  'https://corsproxy.io/?url={url}',
  'https://api.codetabs.com/v1/proxy/?quest={url}',
  'https://thingproxy.freeboard.io/fetch/{raw}',
]

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }

export type GicFetchKind = 'xlsx' | 'pdf' | 'listing'

export interface GicFetchResult {
  buffer: Buffer
  /** Which route delivered the bytes (for logs / sidecar, not provenance —
   *  the source of record is always the original gicouncil.in URL). */
  via: string
  warnings: string[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function looksLikeXlsx(buf: Buffer): boolean {
  // XLSX = ZIP container: PK\x03\x04. (Legacy .xls = D0 CF 11 E0 compound doc.)
  if (buf.length < 1024) return false
  return (buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf)
}

function looksLikeListing(buf: Buffer, url: string): boolean {
  if (buf.length < 500) return false
  if (detectAccessBlock(buf, url).blocked) return false
  const text = buf.toString('utf8', 0, Math.min(buf.length, 200_000)).toLowerCase()
  return text.includes('segment')
}

function looksLikePdf(buf: Buffer): boolean {
  return buf.length > 1024 && buf.toString('latin1', 0, 5) === '%PDF-'
}

function validate(kind: GicFetchKind, buf: Buffer, url: string): boolean {
  if (kind === 'xlsx') return looksLikeXlsx(buf)
  if (kind === 'pdf') return looksLikePdf(buf)
  return looksLikeListing(buf, url)
}

async function plainGet(url: string, timeoutMs: number, headers: Record<string, string> = UA): Promise<Buffer | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { redirect: 'follow', headers, signal: ctrl.signal })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function relayTemplates(): Array<{ name: string; tmpl: string }> {
  const out: Array<{ name: string; tmpl: string }> = []
  const key = (process.env.SCRAPERAPI_KEY || '').trim()
  if (key) out.push({ name: 'scraperapi', tmpl: `https://api.scraperapi.com/?api_key=${key}&country_code=in&url={url}` })
  for (const tmpl of PUBLIC_RELAYS) out.push({ name: new URL(tmpl.replace('{url}', 'x').replace('{raw}', 'https://x')).hostname, tmpl })
  return out
}

interface WaybackSnapshot { rawUrl: string; timestamp: string }

async function waybackLatest(url: string): Promise<WaybackSnapshot | null> {
  const buf = await plainGet(`${WAYBACK_AVAILABLE}?url=${encodeURIComponent(url)}&timestamp=${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`, 20_000)
  if (!buf) return null
  try {
    const j = JSON.parse(buf.toString('utf8'))
    const snap = j?.archived_snapshots?.closest
    if (!snap?.available || !snap?.url) return null
    const ts = String(snap.timestamp ?? '')
    // /web/<ts>id_/<url> serves the ORIGINAL bytes (no archive toolbar rewrite).
    const rawUrl = String(snap.url).replace(/\/web\/(\d+)\//, '/web/$1id_/')
    return { rawUrl, timestamp: ts }
  } catch {
    return null
  }
}

/** Ask archive.org to capture the URL fresh (their crawler fetches gicouncil.in
 *  from a non-blocked network). Best-effort, anonymous, rate-limited. */
async function waybackSaveNow(url: string): Promise<void> {
  await plainGet(`${WAYBACK_SAVE}${url}`, 45_000)
  // SPN processes asynchronously; give the snapshot a moment to index.
  await sleep(4_000)
}

function snapshotAgeDays(ts: string): number {
  if (!/^\d{8}/.test(ts)) return Number.POSITIVE_INFINITY
  const d = new Date(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T00:00:00Z`)
  return (Date.now() - d.getTime()) / 86_400_000
}

/**
 * Fetch a gicouncil.in resource through every available route.
 * kind 'xlsx'/'pdf' = a report file; 'listing' = the reports index page.
 */
export async function gicFetch(url: string, kind: GicFetchKind): Promise<GicFetchResult> {
  const warnings: string[] = []

  // 1. direct (incl. headless browser + INGEST_FETCH_PROXY inside fetchBuffer)
  try {
    const { buffer } = await fetchBuffer(url)
    if (validate(kind, buffer, url)) return { buffer, via: 'direct', warnings }
    warnings.push(`direct fetch returned a non-${kind} response (block page?)`)
  } catch (err) {
    warnings.push(`direct fetch failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 2-3. keyed + public relays
  for (const { name, tmpl } of relayTemplates()) {
    const target = tmpl.replace('{url}', encodeURIComponent(url)).replace('{raw}', url)
    const buf = await plainGet(target, 60_000)
    if (buf && validate(kind, buf, url)) return { buffer: buf, via: name, warnings }
  }
  warnings.push('all relay routes failed or returned non-file responses')

  // 4. Internet Archive
  let snap = await waybackLatest(url)
  const needFresh = kind === 'listing'
  if (needFresh && (!snap || snapshotAgeDays(snap.timestamp) > LISTING_FRESH_DAYS)) {
    await waybackSaveNow(url) // request a fresh capture, then re-check
    snap = (await waybackLatest(url)) ?? snap
  }
  if (!snap && !needFresh) {
    await waybackSaveNow(url) // immutable file never archived yet — capture it
    snap = await waybackLatest(url)
  }
  if (snap) {
    const buf = await plainGet(snap.rawUrl, 90_000)
    if (buf && validate(kind, buf, url)) {
      const age = snapshotAgeDays(snap.timestamp)
      if (needFresh && age > LISTING_FRESH_DAYS) {
        warnings.push(`wayback listing snapshot is ${Math.round(age)} days old — newest month links may be missing`)
      }
      return { buffer: buf, via: `wayback:${snap.timestamp}`, warnings }
    }
    warnings.push('wayback snapshot fetch failed or returned invalid bytes')
  } else {
    warnings.push('no wayback snapshot available')
  }

  throw new Error(`all routes failed for ${url} — ${warnings.join('; ')}`)
}
