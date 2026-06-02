// ---------------------------------------------------------------------------
//  Company registry.
//
//  Hard-coded company identity + official source URLs ONLY. No financial
//  values live here — every number in the pipeline is extracted from a source
//  document. Adding an insurer is a config change: append one entry and the
//  whole pipeline (discovery → catalog → extract → JSON) picks it up.
//
//  `slug`   — drives the output filename data/<slug>.json (task contract).
//  `rawDir` — the directory under the raw cache that holds this insurer's
//             already-fetched public files. Slugs and raw-dir names differ for
//             two insurers for historical reasons, so we map explicitly rather
//             than assume they match.
// ---------------------------------------------------------------------------

import type { CompanyConfig } from '../types.js'

export const COMPANIES: CompanyConfig[] = [
  {
    slug: 'star-health',
    name: 'Star Health & Allied Insurance',
    aliases: ['Star Health', 'Star Health and Allied Insurance', 'Star Health & Allied Insurance Co'],
    investorRelationsUrls: ['https://www.starhealth.in/investor-relations'],
    disclosureUrls: ['https://www.starhealth.in/investors/financial-information/'],
    exchangeIdentifiers: { nseSymbol: 'STARHEALTH', bseScripCode: '543412', isin: 'INE575P01011' },
    documentRules: {
      allow: ['annual[\\s_-]*report', 'investor', 'earnings', 'press[\\s_-]*release', 'results', 'public[\\s_-]*disclosure'],
      deny: ['policy[\\s_-]*wording', 'prospectus', 'brochure', 'claim[\\s_-]*form', 'kyc'],
    },
    rawDir: 'star-health',
    irdaiRegistration: '129',
    focal: true,
  },
  {
    slug: 'niva-bupa',
    name: 'Niva Bupa Health Insurance',
    aliases: ['Niva Bupa', 'Niva Bupa Health', 'Niva Bupa Health Insurance Company', 'Max Bupa'],
    investorRelationsUrls: ['https://transactions.nivabupa.com/pages/investor-relations.aspx'],
    disclosureUrls: ['https://transactions.nivabupa.com/pages/investor-relations.aspx'],
    exchangeIdentifiers: { nseSymbol: 'NIVABUPA', isin: 'INE995S01015' },
    documentRules: {
      allow: ['annual[\\s_-]*report', 'earnings', 'investor', 'public[\\s_-]*disclosure', 'financial[\\s_-]*results', 'transcript', 'presentation'],
      deny: ['mgt[\\s_-]*7', 'compliance[\\s_-]*officer', 'newspaper', 'shareholding[\\s_-]*pattern', 'intimation', 'rta'],
    },
    rawDir: 'niva-bupa',
    irdaiRegistration: '153',
    focal: true,
  },
  {
    slug: 'care-health',
    name: 'Care Health Insurance',
    aliases: ['Care Health', 'Care Health Insurance', 'Religare Health Insurance', 'Care Insurance'],
    investorRelationsUrls: ['https://www.careinsurance.com/about-us/financial-information.html'],
    disclosureUrls: ['https://cms.careinsurance.com/cms/public/public_disclosure'],
    exchangeIdentifiers: {},
    documentRules: {
      allow: ['public[\\s_-]*disclosure', 'annual[\\s_-]*report', 'nl[\\s_-]*\\d', 'l[\\s_-]*\\d', 'revenue', 'financial'],
      deny: ['grievance', 'cash[\\s_-]*and[\\s_-]*bank', 'kyc', 'policy[\\s_-]*wording'],
    },
    rawDir: 'care-health',
    irdaiRegistration: '148',
    focal: true,
  },
  {
    slug: 'manipal-cigna',
    name: 'ManipalCigna Health Insurance',
    aliases: ['ManipalCigna', 'Manipal Cigna', 'ManipalCigna Health Insurance Company', 'CignaTTK'],
    investorRelationsUrls: ['https://www.manipalcigna.com/disclosures/public-disclosures'],
    disclosureUrls: ['https://www.manipalcigna.com/disclosures/financial-disclosures'],
    exchangeIdentifiers: {},
    documentRules: {
      allow: ['public[\\s_-]*disclosure', 'annual[\\s_-]*report', 'financial', 'nl[\\s_-]*\\d', 'l[\\s_-]*\\d'],
      deny: ['policy[\\s_-]*wording', 'brochure', 'claim[\\s_-]*form'],
    },
    rawDir: 'manipalcigna',
    irdaiRegistration: '151',
    focal: true,
  },
  {
    slug: 'aditya-birla-health',
    name: 'Aditya Birla Health Insurance',
    aliases: ['Aditya Birla Health', 'Aditya Birla Health Insurance', 'ABHICL', 'Aditya Birla Capital Health'],
    investorRelationsUrls: ['https://www.adityabirlacapital.com/healthinsurance/about-us/financials'],
    disclosureUrls: ['https://www.adityabirlacapital.com/healthinsurance/about-us/financials'],
    exchangeIdentifiers: {},
    documentRules: {
      allow: ['public[\\s_-]*disclosure', 'annual[\\s_-]*report', 'financial', 'nl[\\s_-]*\\d', 'l[\\s_-]*\\d'],
      deny: ['citizen[\\s_-]*charter', 'agent[\\s_-]*code', 'complain', 'grievance', 'policy[\\s_-]*wording'],
    },
    rawDir: 'aditya-birla',
    irdaiRegistration: '153',
    focal: true,
  },
]

export function getCompany(slug: string): CompanyConfig | undefined {
  return COMPANIES.find((c) => c.slug === slug)
}

/** Resolve a company by slug OR display name OR any alias (case-insensitive). */
export function resolveCompany(ref: string): CompanyConfig | undefined {
  const r = ref.trim().toLowerCase()
  return COMPANIES.find(
    (c) =>
      c.slug === r ||
      c.name.toLowerCase() === r ||
      c.aliases.some((a) => a.toLowerCase() === r),
  )
}
