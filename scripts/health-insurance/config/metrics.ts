// ---------------------------------------------------------------------------
//  Metric registry — the parsing brain.
//
//  Each entry declares the metric's identity (key/label/unit/category), the
//  LABEL locators to find in document text, and a plausibility band. Value
//  parsing is handled centrally in the extractor with unit-cue rules (a ratio
//  must carry "%", money must carry ₹/crore/comma-grouping, a count needs a
//  scale word or grouping). Separating label-location from value-parsing is
//  what stops a regex from reading "FY2025" or a "161%" growth figure as a
//  rupee amount.
//
//  This is *rules*, not data — no financial value is ever hard-coded.
// ---------------------------------------------------------------------------

import type { MetricDef } from '../types.js'

export const METRICS: MetricDef[] = [
  // ── Premium (₹ Crore) ────────────────────────────────────────────────────
  { key: 'gwp', label: 'Gross Written Premium', unit: 'INR Cr', category: 'premium', currency: 'INR',
    patterns: ['Gross\\s+Written\\s+Premium(?:\\s+Income)?', '\\bGWP\\b'], min: 50, max: 100000 },
  { key: 'grossDirectPremium', label: 'Gross Direct Premium', unit: 'INR Cr', category: 'premium', currency: 'INR',
    patterns: ['Gross\\s+Direct\\s+Premium(?:\\s+Income)?', '\\bGDPI\\b'], min: 50, max: 100000 },
  { key: 'retailHealthPremium', label: 'Retail Health Premium', unit: 'INR Cr', category: 'premium', currency: 'INR',
    patterns: ['Retail\\s+Health\\s+Premium', 'Retail\\s+Health\\b'], min: 20, max: 80000 },
  { key: 'groupHealthPremium', label: 'Group Health Premium', unit: 'INR Cr', category: 'premium', currency: 'INR',
    patterns: ['Group\\s+Health\\s+Premium', 'Group\\s+Business\\s+Premium'], min: 20, max: 80000 },
  { key: 'individualPremium', label: 'Individual Premium', unit: 'INR Cr', category: 'premium', currency: 'INR',
    patterns: ['Individual\\s+Premium', 'Individual\\s+Business\\s+Premium'], min: 20, max: 80000 },
  { key: 'corporatePremium', label: 'Corporate Premium', unit: 'INR Cr', category: 'premium', currency: 'INR',
    patterns: ['Corporate\\s+Premium', 'Corporate\\s+Business\\s+Premium'], min: 20, max: 80000 },
  { key: 'netWrittenPremium', label: 'Net Written Premium', unit: 'INR Cr', category: 'premium', currency: 'INR',
    patterns: ['Net\\s+Written\\s+Premium', '\\bNWP\\b'], min: 20, max: 100000 },
  { key: 'netEarnedPremium', label: 'Net Earned Premium', unit: 'INR Cr', category: 'premium', currency: 'INR',
    patterns: ['Net\\s+Earned\\s+Premium', 'Premium\\s+Earned\\s*\\(net\\)', '\\bNEP\\b'], min: 20, max: 100000 },
  { key: 'grossEarnedPremium', label: 'Gross Earned Premium', unit: 'INR Cr', category: 'premium', currency: 'INR',
    patterns: ['Gross\\s+Earned\\s+Premium'], min: 20, max: 100000 },

  // ── Profitability ─────────────────────────────────────────────────────────
  { key: 'pat', label: 'Profit After Tax', unit: 'INR Cr', category: 'profitability', currency: 'INR',
    patterns: ['Profit\\s+After\\s+Tax', '\\bPAT\\b', 'Profit\\s*/\\s*\\(Loss\\)\\s+after\\s+tax'], min: -20000, max: 20000 },
  { key: 'pbt', label: 'Profit Before Tax', unit: 'INR Cr', category: 'profitability', currency: 'INR',
    patterns: ['Profit\\s+Before\\s+Tax', '\\bPBT\\b'], min: -20000, max: 20000 },
  { key: 'underwritingProfit', label: 'Underwriting Profit', unit: 'INR Cr', category: 'profitability', currency: 'INR',
    patterns: ['Underwriting\\s+Profit', 'Underwriting\\s+Result'], min: -20000, max: 20000 },
  { key: 'underwritingLoss', label: 'Underwriting Loss', unit: 'INR Cr', category: 'profitability', currency: 'INR',
    patterns: ['Underwriting\\s+Loss'], min: -20000, max: 20000 },
  { key: 'operatingProfit', label: 'Operating Profit', unit: 'INR Cr', category: 'profitability', currency: 'INR',
    patterns: ['Operating\\s+Profit'], min: -20000, max: 20000 },
  { key: 'roe', label: 'Return on Equity', unit: '%', category: 'profitability', currency: null,
    patterns: ['Return\\s+on\\s+Equity', '\\bROE\\b', 'Return\\s+on\\s+Average\\s+Net\\s+Worth'], min: -100, max: 100 },
  { key: 'roa', label: 'Return on Assets', unit: '%', category: 'profitability', currency: null,
    patterns: ['Return\\s+on\\s+Assets', '\\bROA\\b'], min: -100, max: 100 },

  // ── Claims ────────────────────────────────────────────────────────────────
  { key: 'incurredClaimsRatio', label: 'Incurred Claims Ratio', unit: '%', category: 'claims', currency: null,
    patterns: ['Incurred\\s+Claims?\\s+Ratio', '\\bICR\\b'], min: 0, max: 200 },
  { key: 'grossClaimsRatio', label: 'Gross Claims Ratio', unit: '%', category: 'claims', currency: null,
    patterns: ['Gross\\s+Claims?\\s+Ratio'], min: 0, max: 200 },
  { key: 'netClaimsRatio', label: 'Net Claims Ratio', unit: '%', category: 'claims', currency: null,
    patterns: ['Net\\s+(?:Incurred\\s+)?Claims?\\s+Ratio', 'Net\\s+Loss\\s+Ratio'], min: 0, max: 200 },
  { key: 'claimSettlementRatio', label: 'Claim Settlement Ratio', unit: '%', category: 'claims', currency: null,
    patterns: ['Claims?\\s+Settlement\\s+Ratio', 'Settlement\\s+Ratio'], min: 0, max: 100 },
  { key: 'claimsPaid', label: 'Claims Paid', unit: 'INR Cr', category: 'claims', currency: 'INR',
    patterns: ['Claims?\\s+Paid', 'Benefits?\\s+Paid'], min: 5, max: 100000 },
  { key: 'claimsIncurred', label: 'Claims Incurred', unit: 'INR Cr', category: 'claims', currency: 'INR',
    patterns: ['Claims?\\s+Incurred(?:\\s*\\(net\\))?', 'Incurred\\s+Claims'], min: 5, max: 100000 },
  { key: 'claimsReported', label: 'Claims Reported', unit: 'count', category: 'claims', currency: null,
    patterns: ['Claims?\\s+Reported', 'Number\\s+of\\s+Claims\\s+Reported'], min: 1, max: 100000000 },
  { key: 'claimsProcessed', label: 'Number of Claims Processed', unit: 'count', category: 'claims', currency: null,
    patterns: ['Claims?\\s+Processed', 'Number\\s+of\\s+Claims\\s+Processed'], min: 1, max: 100000000 },
  { key: 'claimsOutstanding', label: 'Claims Outstanding', unit: 'count', category: 'claims', currency: null,
    patterns: ['Claims?\\s+Outstanding', 'Outstanding\\s+Claims'], min: 0, max: 100000000 },

  // ── Efficiency ────────────────────────────────────────────────────────────
  { key: 'combinedRatio', label: 'Combined Ratio', unit: '%', category: 'efficiency', currency: null,
    patterns: ['Combined\\s+Ratio'], min: 50, max: 200 },
  { key: 'expenseRatio', label: 'Expense Ratio', unit: '%', category: 'efficiency', currency: null,
    patterns: ['Expense\\s+Ratio(?:\\s*of\\s*Management)?'], min: 0, max: 100 },
  { key: 'commissionRatio', label: 'Commission Ratio', unit: '%', category: 'efficiency', currency: null,
    patterns: ['Net\\s+Commission\\s+Ratio', 'Commission\\s+Ratio'], min: 0, max: 100 },
  { key: 'operatingExpenseRatio', label: 'Operating Expense Ratio', unit: '%', category: 'efficiency', currency: null,
    patterns: ['Operating\\s+Expense[s]?\\s+Ratio'], min: 0, max: 100 },
  { key: 'managementExpenseRatio', label: 'Management Expense Ratio', unit: '%', category: 'efficiency', currency: null,
    patterns: ['Management\\s+Expense[s]?\\s+Ratio', '\\bMER\\b'], min: 0, max: 100 },

  // ── Capital ───────────────────────────────────────────────────────────────
  { key: 'solvencyRatio', label: 'Solvency Ratio', unit: 'x', category: 'capital', currency: null,
    patterns: ['Solvency\\s+Ratio', 'Solvency\\s+Margin'], min: 0.5, max: 10 },
  { key: 'netWorth', label: 'Net Worth', unit: 'INR Cr', category: 'capital', currency: 'INR',
    patterns: ['Net\\s+Worth'], denyContext: 'return\\s+on\\s+(?:average\\s+)?$', min: 10, max: 200000 },
  { key: 'shareholdersFunds', label: "Shareholders' Funds", unit: 'INR Cr', category: 'capital', currency: 'INR',
    patterns: ["Shareholders[’']?\\s+Funds", 'Share\\s*holders\\s+Funds'], min: 10, max: 200000 },
  { key: 'investmentAssets', label: 'Investment Assets', unit: 'INR Cr', category: 'capital', currency: 'INR',
    patterns: ['Investment[s]?\\s+Assets', 'Total\\s+Investments'], min: 50, max: 500000 },
  { key: 'investmentIncome', label: 'Investment Income', unit: 'INR Cr', category: 'capital', currency: 'INR',
    patterns: ['Investment\\s+Income', 'Income\\s+from\\s+Investments'], min: 5, max: 100000 },
  { key: 'aum', label: 'Assets Under Management', unit: 'INR Cr', category: 'capital', currency: 'INR',
    patterns: ['Assets\\s+Under\\s+Management', '\\bAUM\\b'], min: 50, max: 500000 },

  // ── Distribution (% share) ────────────────────────────────────────────────
  { key: 'agencyChannel', label: 'Agency Channel', unit: '%', category: 'distribution', currency: null,
    patterns: ['(?:Individual\\s+)?Agen(?:ts|cy)\\s+(?:Channel|Share|Mix|Contribution)'], min: 0, max: 100 },
  { key: 'bancassurance', label: 'Bancassurance', unit: '%', category: 'distribution', currency: null,
    patterns: ['Banca(?:ssurance)?\\s*(?:Channel|Share|Mix|Contribution)?'], min: 0, max: 100 },
  { key: 'brokerChannel', label: 'Broker Channel', unit: '%', category: 'distribution', currency: null,
    patterns: ['Brokers?\\s*(?:Channel|Share|Mix|Contribution)'], min: 0, max: 100 },
  { key: 'corporateAgents', label: 'Corporate Agents', unit: '%', category: 'distribution', currency: null,
    patterns: ['Corporate\\s+Agents?\\s*(?:Channel|Share|Mix|Contribution)?'], min: 0, max: 100 },
  { key: 'digitalChannel', label: 'Digital Channel', unit: '%', category: 'distribution', currency: null,
    patterns: ['Digital\\s*(?:Channel|Share|Mix|Contribution)'], min: 0, max: 100 },
  { key: 'directSales', label: 'Direct Sales', unit: '%', category: 'distribution', currency: null,
    patterns: ['Direct\\s+(?:Sales|Business)\\s*(?:Channel|Share|Mix|Contribution)?'], min: 0, max: 100 },
  { key: 'onlineSales', label: 'Online Sales', unit: '%', category: 'distribution', currency: null,
    patterns: ['Online\\s+(?:Sales|Channel)\\s*(?:Share|Mix|Contribution)?'], min: 0, max: 100 },
  { key: 'webAggregator', label: 'Web Aggregator Channel', unit: '%', category: 'distribution', currency: null,
    patterns: ['Web\\s+Aggregators?\\s*(?:Channel|Share|Mix|Contribution)?'], min: 0, max: 100 },

  // ── Operating (counts) ────────────────────────────────────────────────────
  { key: 'networkHospitals', label: 'Network Hospitals', unit: 'count', category: 'operating', currency: null,
    patterns: ['Network\\s+(?:of\\s+)?Hospitals', 'Hospital\\s+Network'], min: 50, max: 200000 },
  { key: 'cashlessHospitals', label: 'Cashless Hospitals', unit: 'count', category: 'operating', currency: null,
    patterns: ['Cashless\\s+Hospitals', 'Cashless\\s+Network\\s+Hospitals'], min: 50, max: 200000 },
  { key: 'livesCovered', label: 'Lives Covered', unit: 'count', category: 'operating', currency: null,
    patterns: ['Lives\\s+Covered', 'Lives\\s+Insured', 'Number\\s+of\\s+Lives'], min: 1000, max: 2000000000 },
  { key: 'activePolicies', label: 'Active Policies', unit: 'count', category: 'operating', currency: null,
    patterns: ['Active\\s+Policies', 'Policies\\s+in\\s+Force', 'Number\\s+of\\s+Policies'], min: 100, max: 2000000000 },
  { key: 'renewalRatio', label: 'Renewal Ratio', unit: '%', category: 'operating', currency: null,
    patterns: ['Renewal\\s+(?:Ratio|Rate|Retention)', 'Persistency(?:\\s+Ratio)?'], min: 0, max: 100 },
  { key: 'branches', label: 'Number of Branches', unit: 'count', category: 'operating', currency: null,
    patterns: ['Number\\s+of\\s+Branches', 'Branch\\s+Network', '\\bBranches\\b'], min: 1, max: 100000 },
  { key: 'agents', label: 'Number of Agents / Advisors', unit: 'count', category: 'operating', currency: null,
    patterns: ['Number\\s+of\\s+Agents', 'Individual\\s+Agents', '\\bAdvisors\\b'], min: 1, max: 10000000 },
]

/** Canonical metric keys used to initialise every company's `metrics` map. */
export const METRIC_KEYS: string[] = METRICS.map((m) => m.key)

export function getMetric(key: string): MetricDef | undefined {
  return METRICS.find((m) => m.key === key)
}

/** Compile a metric's label locators to case-insensitive RegExp. */
export function compilePatterns(def: MetricDef): RegExp[] {
  return def.patterns.map((src) => new RegExp(src, 'i'))
}
