// ---------------------------------------------------------------------------
//  Valuation source registry.
//
//  Every valuation number rendered on the Valuation page traces back to one
//  record here. The rule is strict:
//
//    • If a number has a record below, it is shown with a clickable source.
//    • If it has NO credible source, it is shown as "Source pending" and the
//      number is NEVER invented.
//
//  Confidence ladder:
//    verified  — live exchange data, or a primary company filing / investor
//                presentation that states the figure directly.
//    secondary — credible press / aggregator reporting a filing or a broker
//                note we cannot open the PDF for directly.
//    pending   — no credible public source (e.g. private-company equity value).
//
//  Last full check: 2026-06-01.
// ---------------------------------------------------------------------------

export type ValSourceType =
  | 'Exchange'
  | 'Company filing'
  | 'Investor presentation'
  | 'Broker report'
  | 'News'
  | 'Consensus aggregator'
  | 'Derived'
  | 'Estimate'

export type ValConfidence = 'verified' | 'secondary' | 'pending'

export interface ValuationSource {
  id: string
  company: string
  /** Page section the figure feeds, e.g. "Market snapshot". */
  section: string
  metric: string
  /** Human-readable value as shown, e.g. "₹83.50", "1.65x", "₹9,433 Cr". */
  value: string
  /** Honest period / basis, e.g. "as of 1 Jun 2026", "FY26", "FY26 · IFRS". */
  period: string
  /** Short chip label — analyst / publisher / filing name. */
  source_name: string
  /** Full title shown in the hover popover. */
  report_title: string
  /** YYYY-MM-DD, or "" when the page updates continuously (e.g. a live quote). */
  report_date: string
  source_url: string
  source_type: ValSourceType
  confidence: ValConfidence
  last_checked: string
}

const C = '2026-06-01'
// Analyst-views block re-checked when the broker notes were itemised.
const AC = '2026-06-04'

export const valuationSources: ValuationSource[] = [
  // ── Niva Bupa — market snapshot ──────────────────────────────────────────
  {
    id: 'niva-price',
    company: 'Niva Bupa',
    section: 'Market snapshot',
    metric: 'Share price',
    value: '₹83.50',
    period: 'as of 1 Jun 2026',
    source_name: 'NSE',
    report_title: 'NIVABUPA live quote — National Stock Exchange',
    report_date: '',
    source_url: 'https://www.nseindia.com/get-quotes/equity?symbol=NIVABUPA',
    source_type: 'Exchange',
    confidence: 'verified',
    last_checked: C,
  },
  {
    id: 'niva-mcap',
    company: 'Niva Bupa',
    section: 'Market snapshot',
    metric: 'Market capitalisation',
    value: '≈ ₹15,576 Cr',
    period: 'as of mid-May 2026',
    source_name: 'Screener',
    report_title: 'Niva Bupa market capitalisation (≈ ₹15.6k Cr) — Screener',
    report_date: '',
    source_url: 'https://www.screener.in/company/NIVABUPA/',
    source_type: 'Exchange',
    confidence: 'secondary',
    last_checked: C,
  },
  {
    id: 'niva-52wk',
    company: 'Niva Bupa',
    section: 'Market snapshot',
    metric: '52-week range',
    value: '₹67.50 – ₹95.21',
    period: 'trailing 52 weeks',
    source_name: 'Tickertape',
    report_title: 'NIVABUPA 52-week high / low',
    report_date: '',
    source_url: 'https://www.tickertape.in/stocks/niva-bupa-health-insurance-company-NIVA',
    source_type: 'Exchange',
    confidence: 'secondary',
    last_checked: C,
  },
  {
    id: 'niva-ipo',
    company: 'Niva Bupa',
    section: 'Market snapshot',
    metric: 'IPO reference',
    value: 'Issue ₹74 · listed ₹78.14',
    period: 'listed 14 Nov 2024',
    source_name: 'Chittorgarh',
    report_title: 'Niva Bupa IPO — ₹74 issue price, listed 14 Nov 2024 on NSE/BSE',
    report_date: '2024-11-14',
    source_url: 'https://www.chittorgarh.com/ipo/niva-bupa-health-insurance-ipo/1899/',
    source_type: 'News',
    confidence: 'secondary',
    last_checked: C,
  },

  // ── Niva Bupa — reported financials (primary filing) ─────────────────────
  {
    id: 'niva-fy26-gwp',
    company: 'Niva Bupa',
    section: 'Financials',
    metric: 'Gross written premium',
    value: '₹9,432.9 Cr (+27.4% YoY)',
    period: 'FY26 (to 31 Mar 2026)',
    source_name: 'Niva Bupa IR',
    report_title: 'Audited FY26 results & investor presentation (board approved 8 May 2026)',
    report_date: '2026-05-08',
    source_url: 'https://transactions.nivabupa.com/pages/investor-relations.aspx',
    source_type: 'Investor presentation',
    confidence: 'verified',
    last_checked: C,
  },
  {
    id: 'niva-fy26-pat',
    company: 'Niva Bupa',
    section: 'Financials',
    metric: 'Profit after tax',
    value: '₹366.1 Cr (+80% YoY)',
    period: 'FY26 · IFRS basis',
    source_name: 'Niva Bupa IR',
    report_title: 'FY26 PAT ₹366.1 Cr (IFRS), +80% YoY — audited results 8 May 2026',
    report_date: '2026-05-08',
    source_url: 'https://transactions.nivabupa.com/pages/investor-relations.aspx',
    source_type: 'Investor presentation',
    confidence: 'verified',
    last_checked: C,
  },
  {
    id: 'niva-share',
    company: 'Niva Bupa',
    section: 'Financials',
    metric: 'Retail-health market share',
    value: '10.1% (+76 bps YoY)',
    period: 'FY26',
    source_name: 'Niva Bupa IR',
    report_title: 'Retail-health market share 10.1% at close of FY26 (+76 bps) — FY26 results',
    report_date: '2026-05-08',
    source_url: 'https://transactions.nivabupa.com/pages/investor-relations.aspx',
    source_type: 'Investor presentation',
    confidence: 'verified',
    last_checked: C,
  },
  {
    id: 'niva-fy25',
    company: 'Niva Bupa',
    section: 'Financials',
    metric: 'FY25 GWP / PAT',
    value: 'GWP ₹7,015 Cr · PAT ₹203 Cr',
    period: 'FY25 (to 31 Mar 2025)',
    source_name: 'Business Standard',
    report_title: 'Niva Bupa FY25 prior-year comparatives (GWP ₹7,015 Cr, PAT ₹203 Cr)',
    report_date: '2026-05-09',
    source_url:
      'https://www.business-standard.com/amp/markets/capital-market-news/niva-bupa-health-insurance-company-standalone-net-profit-rises-67-47-in-the-march-2026-quarter-126050900095_1.html',
    source_type: 'News',
    confidence: 'secondary',
    last_checked: C,
  },

  // ── Niva Bupa — derived multiples (components above are sourced) ──────────
  {
    id: 'niva-pgwp',
    company: 'Niva Bupa',
    section: 'Multiples',
    metric: 'P / GWP',
    value: '1.65x',
    period: 'FY26 · mkt cap ÷ GWP',
    source_name: 'Derived',
    report_title: 'Market cap ≈ ₹15,576 Cr ÷ FY26 GWP ₹9,432.9 Cr = 1.65x',
    report_date: '',
    source_url: 'https://www.screener.in/company/NIVABUPA/',
    source_type: 'Derived',
    confidence: 'secondary',
    last_checked: C,
  },
  {
    id: 'niva-pe',
    company: 'Niva Bupa',
    section: 'Multiples',
    metric: 'P / E',
    value: '42.6x',
    period: 'FY26 · mkt cap ÷ PAT',
    source_name: 'Derived',
    report_title: 'Market cap ≈ ₹15,576 Cr ÷ FY26 PAT ₹366.1 Cr = 42.6x',
    report_date: '',
    source_url: 'https://www.screener.in/company/NIVABUPA/',
    source_type: 'Derived',
    confidence: 'secondary',
    last_checked: C,
  },
  {
    id: 'niva-pb',
    company: 'Niva Bupa',
    section: 'Multiples',
    metric: 'P / B',
    value: '≈ 3.0x',
    period: 'most recent quarter',
    source_name: 'StockAnalysis',
    report_title: 'Niva Bupa price-to-book ≈ 3.0x (MRQ) — StockAnalysis statistics',
    report_date: '',
    source_url: 'https://stockanalysis.com/quote/nse/NIVABUPA/statistics/',
    source_type: 'News',
    confidence: 'secondary',
    last_checked: C,
  },

  // ── Niva Bupa — analyst views ────────────────────────────────────────────
  // Consensus = each covering broker's most recent note (the 8 dated notes
  // below collapse to 4 brokers' latest view).
  {
    id: 'niva-consensus',
    company: 'Niva Bupa',
    section: 'Street view',
    metric: 'Consensus target',
    value: '₹89.8 (range ₹84–97)',
    period: "4 brokers' latest view · to 10 May 2026",
    source_name: 'Broker notes (MOSL · ICICI Sec · JM Fin · Morgan Stanley)',
    report_title:
      'Consensus of each broker’s most recent Niva Bupa note — avg ₹89.8 (₹84–97); 3 buy-side, 1 Equal-weight, 0 Sell',
    report_date: '2026-05-10',
    source_url: 'https://www.moneycontrol.com/news/business/stocks/buy-niva-bupa-target-of-rs-97-motilal-oswal-13931563.html',
    source_type: 'Derived',
    confidence: 'secondary',
    last_checked: AC,
  },
  {
    id: 'niva-mosl-may26',
    company: 'Niva Bupa',
    section: 'Street view',
    metric: 'Motilal Oswal target',
    value: 'BUY · ₹97',
    period: 'note dated 10 May 2026',
    source_name: 'Motilal Oswal',
    report_title: 'Motilal Oswal — Buy, target ₹97; 4QFY26 NEP growth strong · via Moneycontrol',
    report_date: '2026-05-10',
    source_url: 'https://www.moneycontrol.com/news/business/stocks/buy-niva-bupa-target-of-rs-97-motilal-oswal-13931563.html',
    source_type: 'Broker report',
    confidence: 'secondary',
    last_checked: AC,
  },
  {
    id: 'niva-jm-nov25',
    company: 'Niva Bupa',
    section: 'Street view',
    metric: 'JM Financial target',
    value: 'ADD · ₹84',
    period: 'note dated Nov 2025',
    source_name: 'JM Financial',
    report_title: 'JM Financial — Add, target ₹84; claims ratio beat, EPS estimates cut · via Investment Guru India',
    report_date: '2025-11-01',
    source_url: 'https://investmentguruindia.com/newsdetail/add-niva-bupa-health-insurance-ltd-for-target-rs-84-by-jm-financial-services732594',
    source_type: 'Broker report',
    confidence: 'secondary',
    last_checked: AC,
  },
  {
    id: 'niva-isec-nov25',
    company: 'Niva Bupa',
    section: 'Street view',
    metric: 'ICICI Securities target',
    value: 'BUY · ₹90',
    period: 'note dated 6 Nov 2025',
    source_name: 'ICICI Securities',
    report_title: 'ICICI Securities — Buy, target ₹90; GST/input-tax-credit concern addressed · via Moneycontrol',
    report_date: '2025-11-06',
    source_url: 'https://www.moneycontrol.com/news/business/buy-niva-bupa-health-insurance-company-target-of-rs-90-icici-securities-2-13662848.html',
    source_type: 'Broker report',
    confidence: 'secondary',
    last_checked: AC,
  },
  {
    id: 'niva-mosl-nov25',
    company: 'Niva Bupa',
    section: 'Street view',
    metric: 'Motilal Oswal target',
    value: 'BUY · ₹92',
    period: 'note dated 3 Nov 2025',
    source_name: 'Motilal Oswal',
    report_title: 'Motilal Oswal — Buy, target ₹92; 2QFY26 NEP +17% YoY · via Moneycontrol',
    report_date: '2025-11-03',
    source_url: 'https://www.moneycontrol.com/news/business/buy-niva-bupa-target-of-rs-92-motilal-oswal-13652497.html',
    source_type: 'Broker report',
    confidence: 'secondary',
    last_checked: AC,
  },
  {
    id: 'niva-isec-aug25',
    company: 'Niva Bupa',
    section: 'Street view',
    metric: 'ICICI Securities target',
    value: 'BUY · ₹92',
    period: 'note dated 11 Aug 2025',
    source_name: 'ICICI Securities',
    report_title: 'ICICI Securities — Buy, target ₹92 (maintained) · via Moneycontrol',
    report_date: '2025-08-11',
    source_url: 'https://www.moneycontrol.com/news/business/earnings/buy-niva-bupa-health-insurance-company-target-of-rs-92-icici-securities-13455854.html',
    source_type: 'Broker report',
    confidence: 'secondary',
    last_checked: AC,
  },
  {
    id: 'niva-mosl-aug25',
    company: 'Niva Bupa',
    section: 'Street view',
    metric: 'Motilal Oswal target',
    value: 'BUY · ₹101',
    period: 'note dated 7 Aug 2025',
    source_name: 'Motilal Oswal',
    report_title: 'Motilal Oswal — Buy, target ₹101 (most bullish on record) · via Moneycontrol',
    report_date: '2025-08-07',
    source_url: 'https://www.moneycontrol.com/news/business/earnings/buy-niva-bupa-target-of-rs-101-motilal-oswal-2-13423064.html',
    source_type: 'Broker report',
    confidence: 'secondary',
    last_checked: AC,
  },
  {
    id: 'niva-mosl-apr25',
    company: 'Niva Bupa',
    section: 'Street view',
    metric: 'Motilal Oswal target',
    value: 'BUY · ₹100',
    period: 'note dated 23 Apr 2025',
    source_name: 'Motilal Oswal',
    report_title: 'Motilal Oswal — Buy, target ₹100; initiation-style bullish thesis · via Moneycontrol',
    report_date: '2025-04-23',
    source_url: 'https://www.moneycontrol.com/news/business/stocks/buy-niva-bupa-health-insurance-target-of-rs-100-motilal-oswal-13001646.html',
    source_type: 'Broker report',
    confidence: 'secondary',
    last_checked: AC,
  },
  {
    id: 'niva-ms-dec24',
    company: 'Niva Bupa',
    section: 'Street view',
    metric: 'Morgan Stanley target',
    value: 'EQUAL-WEIGHT · ₹88',
    period: 'note dated 23 Dec 2024',
    source_name: 'Morgan Stanley',
    report_title: 'Morgan Stanley — Equal-weight initiation, target ₹88 · via Moneycontrol',
    report_date: '2024-12-23',
    source_url: 'https://hindi.moneycontrol.com/news/markets/niva-bupa-share-price-rise-2-percent-after-morgan-stanley-initiates-coverage-with-target-price-of-rs-88-1945483.html',
    source_type: 'Broker report',
    confidence: 'secondary',
    last_checked: AC,
  },

  // ── Star Health — listed peer ────────────────────────────────────────────
  {
    id: 'star-market',
    company: 'Star Health',
    section: 'Peer valuation',
    metric: 'Price / market cap',
    value: '₹515.9 · ₹30,356 Cr',
    period: 'as of 6 May 2026',
    source_name: 'Tickertape',
    report_title: 'Star Health (STARHEALTH) price ₹515.9, market cap ₹30,356 Cr',
    report_date: '',
    source_url: 'https://www.tickertape.in/stocks/star-health-and-allied-insurance-company-STARH',
    source_type: 'Exchange',
    confidence: 'secondary',
    last_checked: C,
  },
  {
    id: 'star-fy26',
    company: 'Star Health',
    section: 'Peer valuation',
    metric: 'FY26 GWP / PAT',
    value: 'GWP ₹20,369 Cr (+16%) · PAT ₹911 Cr',
    period: 'FY26',
    source_name: 'Star Health results',
    report_title: 'Star Health FY26 — GWP ₹20,369 Cr (+16%), PAT ₹911 Cr (+16%)',
    report_date: '2026-05-01',
    source_url: 'https://www.investywise.com/star-health-and-allied-insurance-q4-fy26-earnings-report/',
    source_type: 'News',
    confidence: 'secondary',
    last_checked: C,
  },
  {
    id: 'star-pgwp',
    company: 'Star Health',
    section: 'Peer valuation',
    metric: 'P / GWP',
    value: '1.49x',
    period: 'FY26 · mkt cap ÷ GWP',
    source_name: 'Derived',
    report_title: 'Star Health market cap ₹30,356 Cr ÷ FY26 GWP ₹20,369 Cr = 1.49x',
    report_date: '',
    source_url: 'https://www.tickertape.in/stocks/star-health-and-allied-insurance-company-STARH',
    source_type: 'Derived',
    confidence: 'secondary',
    last_checked: C,
  },

  // ── Unlisted peers — no public market valuation ──────────────────────────
  {
    id: 'unlisted-pending',
    company: 'Unlisted peers',
    section: 'Peer valuation',
    metric: 'Equity value',
    value: 'Source pending',
    period: '—',
    source_name: 'No public source',
    report_title:
      'Care Health, Aditya Birla Health and ManipalCigna are unlisted — no live market price. Any equity value would be an estimate; none is published here until a credible source (funding round, transaction, filing) is on record.',
    report_date: '',
    source_url: '',
    source_type: 'Estimate',
    confidence: 'pending',
    last_checked: C,
  },
]

const byId = new Map(valuationSources.map((s) => [s.id, s]))

export function valSrc(id: string): ValuationSource | undefined {
  return byId.get(id)
}

const CONF_TO_DOT: Record<ValConfidence, 'high' | 'medium' | 'pending'> = {
  verified: 'high',
  secondary: 'medium',
  pending: 'pending',
}

/**
 * Ready-to-spread props for <SourceTag/> from a registry id. Falls back to a
 * quiet "Source pending" pill when the id is unknown, so a missing record can
 * never silently render as if it were sourced.
 */
export function srcTag(id: string): {
  source: string
  period: string
  confidence: 'high' | 'medium' | 'pending'
  provenance: { source_name: string; source_url: string; fetched_at: string }
} {
  const s = byId.get(id)
  if (!s) {
    return {
      source: 'Source pending',
      period: '—',
      confidence: 'pending',
      provenance: { source_name: 'No source on record yet.', source_url: '', fetched_at: '' },
    }
  }
  return {
    source: s.source_name,
    period: s.period,
    confidence: CONF_TO_DOT[s.confidence],
    provenance: { source_name: s.report_title, source_url: s.source_url, fetched_at: s.last_checked },
  }
}
