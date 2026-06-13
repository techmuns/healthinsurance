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

function isBlockedIpv6(ip: string): boolean {
  const s = ip.toLowerCase().split('%')[0] // strip any zone id
  if (s === '::1' || s === '::') return true // loopback / unspecified
  if (s.startsWith('::ffff:')) {
    const v4 = s.slice('::ffff:'.length)
    if (net.isIPv4(v4)) return isBlockedIpv4(v4) // IPv4-mapped
  }
  const first = parseInt(s.split(':')[0] || '0', 16)
  if (Number.isNaN(first)) return false
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
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
