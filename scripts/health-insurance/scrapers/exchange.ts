// ---------------------------------------------------------------------------
//  Stock-exchange scraper (NSE / BSE).
//
//  NSE and BSE actively block automated/datacenter access (they return 401/403
//  or a bot-challenge to non-browser clients). Per the compliance rules we do
//  NOT try to defeat that: if the endpoint blocks, we record it "blocked" and
//  continue. Only listed insurers have exchange endpoints at all.
// ---------------------------------------------------------------------------

import type { CompanyConfig, SourceEndpoint } from '../types.js'
import { httpGet } from '../utils/http.js'
import { discoverPdfLinksFromHtml, isLive, type DiscoveryResult } from './company-ir.js'
import { log } from '../utils/logger.js'

export async function discoverExchange(company: CompanyConfig, endpoint: SourceEndpoint): Promise<DiscoveryResult> {
  const base = { endpointId: endpoint.id, url: endpoint.url }
  if (!isLive()) {
    return { ...base, status: 'skipped', httpStatus: null, error: 'live discovery disabled (HI_LIVE!=1)', documents: [] }
  }

  const res = await httpGet(endpoint.url, { timeoutMs: 25_000 })
  if (res.blocked) {
    log.warn('exchange', 'blocked — not bypassing', { url: endpoint.url, status: res.status })
    return { ...base, status: 'blocked', httpStatus: res.status, error: res.error, documents: [] }
  }
  if (!res.ok || !res.buffer) {
    return { ...base, status: 'failed', httpStatus: res.status, error: res.error ?? res.classification, documents: [] }
  }
  // If an exchange page is reachable, harvest any attached filing PDFs.
  const docs = discoverPdfLinksFromHtml(res.buffer.toString('utf8'), res.finalUrl ?? endpoint.url, company.documentRules)
  return { ...base, status: 'ok', httpStatus: res.status, error: null, documents: docs }
}
