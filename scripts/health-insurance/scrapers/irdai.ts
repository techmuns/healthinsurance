// ---------------------------------------------------------------------------
//  IRDAI / regulatory scraper.
//
//  IRDAI's portal fronts its content with a WAF that returns 403 to cloud /
//  GitHub-Actions IP ranges. That is an access control, and the rules are
//  explicit: do not bypass it. When IRDAI blocks, we record "blocked" with the
//  HTTP status and continue. When it is reachable (e.g. an in-region run), we
//  harvest the public-disclosure / annual-report / handbook PDFs it links.
// ---------------------------------------------------------------------------

import type { CompanyConfig, SourceEndpoint } from '../types.js'
import { httpGet } from '../utils/http.js'
import { discoverPdfLinksFromHtml, isLive, type DiscoveryResult } from './company-ir.js'
import { log } from '../utils/logger.js'

// IRDAI listing pages link a lot; keep the financial/disclosure documents.
const IRDAI_RULES: CompanyConfig['documentRules'] = {
  allow: ['public[\\s_-]*disclosure', 'annual[\\s_-]*report', 'handbook', 'statistics', 'circular', 'nl[\\s_-]*\\d', 'l[\\s_-]*\\d'],
  deny: ['tender', 'recruitment', 'vacancy', 'careers'],
}

export async function discoverIrdai(_company: CompanyConfig, endpoint: SourceEndpoint): Promise<DiscoveryResult> {
  const base = { endpointId: endpoint.id, url: endpoint.url }
  if (!isLive()) {
    return { ...base, status: 'skipped', httpStatus: null, error: 'live discovery disabled (HI_LIVE!=1)', documents: [] }
  }

  const res = await httpGet(endpoint.url, { timeoutMs: 30_000 })
  if (res.blocked) {
    log.warn('irdai', 'blocked — not bypassing IRDAI access control', { url: endpoint.url, status: res.status })
    return { ...base, status: 'blocked', httpStatus: res.status, error: res.error, documents: [] }
  }
  if (!res.ok || !res.buffer) {
    return { ...base, status: 'failed', httpStatus: res.status, error: res.error ?? res.classification, documents: [] }
  }
  const docs = discoverPdfLinksFromHtml(res.buffer.toString('utf8'), res.finalUrl ?? endpoint.url, IRDAI_RULES)
  log.info('irdai', `discovered ${docs.length} documents`, { url: endpoint.url })
  return { ...base, status: 'ok', httpStatus: res.status, error: null, documents: docs }
}
