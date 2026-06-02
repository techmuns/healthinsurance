// ---------------------------------------------------------------------------
//  Source registry.
//
//  Maps every company to the ordered list of official endpoints we attempt,
//  tagged by sourceType so the run report and source-status.json can group
//  reachability by source. Exchange / IRDAI endpoints are shared infra; the
//  company-IR endpoints come from the company config.
//
//  Only official, publicly-listed pages appear here. No aggregators, no
//  authenticated APIs, no scraped third-party mirrors.
// ---------------------------------------------------------------------------

import type { CompanyConfig, SourceEndpoint } from '../types.js'

/** IRDAI public landing pages (shared, regulator-level). */
export const IRDAI_ENDPOINTS: Array<{ id: string; label: string; url: string }> = [
  { id: 'irdai_public_disclosures', label: 'IRDAI Public Disclosures', url: 'https://irdai.gov.in/public-disclosures' },
  { id: 'irdai_annual_reports', label: 'IRDAI Annual Reports', url: 'https://irdai.gov.in/annual-reports' },
  { id: 'irdai_handbook', label: 'IRDAI Handbook of Insurance Statistics', url: 'https://irdai.gov.in/handbook-of-indian-insurance-statistics' },
]

/** Exchange quote / filing roots for listed insurers. */
function exchangeEndpoints(company: CompanyConfig): SourceEndpoint[] {
  const out: SourceEndpoint[] = []
  const { nseSymbol, bseScripCode } = company.exchangeIdentifiers
  if (nseSymbol) {
    out.push({
      sourceType: 'exchange',
      id: `${company.slug}:nse`,
      label: `NSE — ${nseSymbol}`,
      url: `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(nseSymbol)}`,
    })
  }
  if (bseScripCode) {
    out.push({
      sourceType: 'exchange',
      id: `${company.slug}:bse`,
      label: `BSE — ${bseScripCode}`,
      url: `https://www.bseindia.com/stock-share-price/x/x/${bseScripCode}/`,
    })
  }
  return out
}

/** Build the ordered endpoint list for one company. */
export function endpointsFor(company: CompanyConfig): SourceEndpoint[] {
  const ir: SourceEndpoint[] = [...company.investorRelationsUrls, ...company.disclosureUrls]
    // de-dup while preserving order
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .map((url, i) => ({
      sourceType: 'company_ir' as const,
      id: `${company.slug}:company_ir:${i}`,
      label: `${company.name} — IR/Disclosures`,
      url,
    }))

  const exchange = exchangeEndpoints(company)

  const irdai: SourceEndpoint[] = IRDAI_ENDPOINTS.map((e) => ({
    sourceType: 'irdai' as const,
    id: `${company.slug}:${e.id}`,
    label: e.label,
    url: e.url,
  }))

  return [...ir, ...exchange, ...irdai]
}
