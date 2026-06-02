// ---------------------------------------------------------------------------
//  Company investor-relations / disclosure scraper.
//
//  Discovers document links on a company's official IR / public-disclosure
//  page. Discovery is live-only and gated by HI_LIVE: when live is off (the
//  default, and the only safe mode where the host blocks datacenter IPs) the
//  endpoint is reported "skipped" and the pipeline proceeds to extract from the
//  already-cached corpus instead.
//
//  Compliance: a 401/403/challenge response is reported "blocked" and we move
//  on. No evasion, no proxies, no browser impersonation.
// ---------------------------------------------------------------------------

import * as cheerio from 'cheerio'
import type { CompanyConfig, SourceEndpoint, SourceStatusValue } from '../types.js'
import { httpGet } from '../utils/http.js'
import { fileTypeFromName } from '../storage/raw-store.js'
import { log } from '../utils/logger.js'

export interface DiscoveredDoc {
  title: string
  url: string
  fileType: ReturnType<typeof fileTypeFromName>
}

export interface DiscoveryResult {
  endpointId: string
  url: string
  status: SourceStatusValue
  httpStatus: number | null
  error: string | null
  documents: DiscoveredDoc[]
}

const DOC_EXT = /\.(pdf|xlsx?|csv)(\?|$)/i

export function isLive(): boolean {
  return process.env.HI_LIVE === '1'
}

/** Extract candidate document links from an IR/disclosure HTML page. */
export function discoverPdfLinksFromHtml(
  html: string,
  baseUrl: string,
  rules: CompanyConfig['documentRules'],
  cap = 60,
): DiscoveredDoc[] {
  const $ = cheerio.load(html)
  const allow = (rules.allow ?? []).map((r) => new RegExp(r, 'i'))
  const deny = (rules.deny ?? []).map((r) => new RegExp(r, 'i'))
  const seen = new Set<string>()
  const docs: DiscoveredDoc[] = []

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim()
    if (!href) return
    let abs: string
    try {
      abs = href.startsWith('http') ? href : new URL(href, baseUrl).toString()
    } catch {
      return
    }
    if (!DOC_EXT.test(abs) || seen.has(abs)) return
    const filename = abs.split('/').pop() ?? abs
    const text = $(el).text().trim()
    const blob = `${filename} ${text}`
    if (deny.some((re) => re.test(blob))) return // policy wording, KYC, etc.
    seen.add(abs)
    docs.push({ title: text || filename, url: abs, fileType: fileTypeFromName(filename) })
  })

  // Prefer allow-listed documents (financials) when the page is large.
  const preferred = docs.filter((d) => allow.some((re) => re.test(`${d.url} ${d.title}`)))
  const chosen = (preferred.length ? preferred : docs).slice(0, cap)
  return chosen
}

export async function discoverCompanyIr(_company: CompanyConfig, endpoint: SourceEndpoint): Promise<DiscoveryResult> {
  const base = { endpointId: endpoint.id, url: endpoint.url }
  if (!isLive()) {
    log.debug('company-ir', 'skipped (HI_LIVE!=1) — using cached corpus', { url: endpoint.url })
    return { ...base, status: 'skipped', httpStatus: null, error: 'live discovery disabled (HI_LIVE!=1)', documents: [] }
  }

  const res = await httpGet(endpoint.url, { timeoutMs: 25_000 })
  if (res.blocked) {
    return { ...base, status: 'blocked', httpStatus: res.status, error: res.error, documents: [] }
  }
  if (!res.ok || !res.buffer) {
    return { ...base, status: 'failed', httpStatus: res.status, error: res.error ?? res.classification, documents: [] }
  }
  const docs = discoverPdfLinksFromHtml(res.buffer.toString('utf8'), res.finalUrl ?? endpoint.url, _company.documentRules)
  log.info('company-ir', `discovered ${docs.length} documents`, { company: _company.slug, url: endpoint.url })
  return { ...base, status: 'ok', httpStatus: res.status, error: null, documents: docs }
}
