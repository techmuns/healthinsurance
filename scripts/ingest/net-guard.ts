// ---------------------------------------------------------------------------
//  Network egress guard (SSRF protection) for the ingest fetchers.
//
//  The scheduled ingest runs LIVE in CI with `contents: write` and auto-commits
//  whatever it downloads under data/raw/**. The links it fetches are discovered
//  by scraping third-party pages, so a poisoned/compromised upstream page could
//  point the fetcher at an internal address (cloud metadata 169.254.169.254,
//  localhost, RFC-1918 hosts) and have the runner read — and commit — internal
//  responses. These helpers block that:
//
//    • isSafeHttpUrlSync(url)  — cheap, synchronous gate used to drop unsafe
//      links at discovery time (scheme + IP-literal/hostname checks, no DNS).
//    • assertPublicUrl(url)    — async gate used right before/after a fetch; it
//      additionally resolves the hostname and rejects any address that lands in
//      a private / loopback / link-local / reserved range.
//
//  Legitimate public sources (insurer IR sites, IRDAI, GI Council, exchanges)
//  resolve to public IPs and pass unchanged.
// ---------------------------------------------------------------------------

import { lookup } from 'node:dns/promises'
import net from 'node:net'

/** Hostnames that are always internal regardless of DNS. */
const BLOCKED_HOST_RE = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal|metadata)$/i

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const o = Number(p)
    if (o > 255) return null
    n = (n << 8) | o
  }
  return n >>> 0
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  if (n == null) return false
  const inRange = (base: string, bits: number): boolean => {
    const b = ipv4ToInt(base)
    if (b == null) return false
    const shift = 32 - bits
    return shift === 32 ? n === b : (n >>> shift) === (b >>> shift)
  }
  return (
    inRange('0.0.0.0', 8) || // "this" network
    inRange('10.0.0.0', 8) || // private
    inRange('100.64.0.0', 10) || // CGNAT
    inRange('127.0.0.0', 8) || // loopback
    inRange('169.254.0.0', 16) || // link-local (incl. cloud metadata)
    inRange('172.16.0.0', 12) || // private
    inRange('192.0.0.0', 24) || // IETF protocol assignments
    inRange('192.168.0.0', 16) || // private
    inRange('198.18.0.0', 15) || // benchmarking
    inRange('240.0.0.0', 4) || // reserved
    n === (ipv4ToInt('255.255.255.255') as number) // broadcast
  )
}

/**
 * Expand a (well-formed) IPv6 literal to its 16 bytes — handling `::`
 * compression and an optional trailing dotted-quad (e.g. `::ffff:1.2.3.4`).
 * Returns null if it can't be parsed. We parse to bytes rather than matching on
 * text because the WHATWG URL parser normalises IPv4-mapped addresses into the
 * hex-compressed form (`::ffff:169.254.169.254` → `::ffff:a9fe:a9fe`), so a
 * textual `::ffff:<dotted>` check alone misses them.
 */
function ipv6ToBytes(addr: string): number[] | null {
  let s = addr.toLowerCase().split('%')[0] // strip any zone id
  // Fold a trailing dotted-quad IPv4 into two hex hextets.
  const dotted = s.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (dotted) {
    const n = ipv4ToInt(dotted[1])
    if (n == null) return null
    const hi = (n >>> 16) & 0xffff
    const lo = n & 0xffff
    s = s.slice(0, s.length - dotted[1].length).replace(/:$/, '') + `:${hi.toString(16)}:${lo.toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : null
  let hextets: string[]
  if (tail === null) {
    if (head.length !== 8) return null // no '::' → must be full
    hextets = head
  } else {
    const missing = 8 - head.length - tail.length
    if (missing < 0) return null
    hextets = [...head, ...Array(missing).fill('0'), ...tail]
  }
  if (hextets.length !== 8) return null
  const bytes: number[] = []
  for (const h of hextets) {
    if (!/^[0-9a-f]{1,4}$/.test(h || '0')) return null
    const v = parseInt(h || '0', 16)
    bytes.push((v >> 8) & 0xff, v & 0xff)
  }
  return bytes
}

function isBlockedIpv6(ip: string): boolean {
  const b = ipv6ToBytes(ip)
  if (!b) {
    const s = ip.toLowerCase().split('%')[0]
    return s === '::1' || s === '::' // conservative fallback if parsing fails
  }
  if (b.every((x) => x === 0)) return true // :: unspecified
  if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return true // ::1 loopback
  if ((b[0] & 0xfe) === 0xfc) return true // fc00::/7 unique-local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true // fe80::/10 link-local
  // IPv4-mapped ::ffff:0:0/96 and IPv4-compatible ::/96 (deprecated) — validate
  // the embedded IPv4 against the v4 deny-list so e.g. ::ffff:169.254.169.254
  // (in any notation) is caught.
  const first10Zero = b.slice(0, 10).every((x) => x === 0)
  const mapped = first10Zero && b[10] === 0xff && b[11] === 0xff
  const compat = b.slice(0, 12).every((x) => x === 0) && !(b[12] === 0 && b[13] === 0 && b[14] === 0)
  if (mapped || compat) return isBlockedIpv4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`)
  return false
}

/** True when an IP literal falls in a private / loopback / reserved range. */
export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip)
  if (net.isIPv6(ip)) return isBlockedIpv6(ip)
  return false
}

/**
 * Synchronous, DNS-free safety gate for a discovered link. Rejects non-HTTP(S)
 * schemes, obviously-internal hostnames, and IP-literal hosts in private ranges.
 * Use this to filter scraped links before they are ever queued for fetching.
 */
export function isSafeHttpUrlSync(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.replace(/^\[|\]$/g, '') // unwrap [IPv6]
  if (!host) return false
  if (BLOCKED_HOST_RE.test(host)) return false
  if (net.isIP(host) && isBlockedAddress(host)) return false
  return true
}

/**
 * Async safety gate: everything `isSafeHttpUrlSync` checks PLUS a DNS resolution
 * of the hostname, rejecting when any resolved address is private/loopback/
 * reserved (defeats hostname→internal mappings and most DNS-rebinding). Throws
 * on an unsafe URL. A DNS failure is left to the fetch to surface (an
 * unresolvable host is not an SSRF risk).
 */
export async function assertPublicUrl(raw: string): Promise<void> {
  if (!isSafeHttpUrlSync(raw)) {
    throw new Error(`Blocked unsafe URL (scheme/host not allowed): ${raw}`)
  }
  const host = new URL(raw).hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host)) return // already validated as a literal above
  let addrs: { address: string }[]
  try {
    addrs = await lookup(host, { all: true })
  } catch {
    return // unresolvable — fetch will fail; not an SSRF vector
  }
  for (const a of addrs) {
    if (isBlockedAddress(a.address)) {
      throw new Error(`Blocked URL — ${host} resolves to a private address (${a.address})`)
    }
  }
}
