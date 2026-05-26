// ===========================================================================
//  MOCK DATA  —  illustrative only, NOT real financials.
//  Every figure below is fabricated for layout/design purposes. Where a real
//  deployment would wire a data source, the `source` / `sourceUrl` fields show
//  the shape of the provenance the UI expects. Do not use for any decision.
// ===========================================================================

import type {
  Insurer,
  Metric,
  PeerGroup,
  SeriesPoint,
  Signal,
} from './types'

const UPDATED = '2026-05-23'

const m = (
  value: number | null,
  opts: Partial<Metric> = {},
): Metric => ({
  value,
  period: 'Q4 FY25',
  source: 'Company filings (mock)',
  status: value === null ? 'Pending' : 'Reported',
  lastUpdated: UPDATED,
  ...opts,
})

// --- Universe (single source of truth) -------------------------------------
// Every Executive Overview visual is derived from this array via the helpers in
// `@/lib/insurers`. `marketShare` is share of the insurer's own segment pool;
// `margin` is underwriting margin (100 − combined ratio). Life carriers report
// no combined ratio, so combinedRatio/margin/retailMix are 0 (= N/A) for them.

export const FOCAL_COMPANY = 'niva-bupa'

export const PEER_GROUP_LABEL: Record<PeerGroup, string> = {
  SAHI: 'Standalone health insurers',
  General: 'General insurers',
  Life: 'Life insurers',
  All: 'Full insurer universe',
}

export const insurers: Insurer[] = [
  // Standalone health insurers (SAHI) — segment shares sum to 90 (Others = 10).
  { id: 'niva-bupa', name: 'Niva Bupa Health Insurance', shortName: 'Niva Bupa', ticker: 'NIVABUPA', peerGroup: 'SAHI', marketShare: 19, premiumCollection: 7200, settlementRatio: 99.1, renewalRate: 90, customerRetention: 89, growth: 23.4, margin: 3.2, combinedRatio: 96.8, solvency: 2.18, roe: 17.2, valuation: 3.4, marketShareChange: 0.9, retailMix: 64, signal: 'Strong', takeaway: 'Leads on balance, not scale.' },
  { id: 'star-health', name: 'Star Health and Allied Insurance', shortName: 'Star Health', ticker: 'STARHEALTH', peerGroup: 'SAHI', marketShare: 33, premiumCollection: 12400, settlementRatio: 98.2, renewalRate: 92, customerRetention: 88, growth: 17.5, margin: 0.6, combinedRatio: 99.4, solvency: 2.05, roe: 14.2, valuation: 3.6, marketShareChange: 0.3, retailMix: 67, signal: 'Improving', takeaway: 'Remains the clear scale leader.' },
  { id: 'care-health', name: 'Care Health Insurance', shortName: 'Care Health', ticker: 'CAREHEALTH', peerGroup: 'SAHI', marketShare: 17, premiumCollection: 6400, settlementRatio: 98.7, renewalRate: 88, customerRetention: 86, growth: 20.1, margin: 1.9, combinedRatio: 98.1, solvency: 1.92, roe: 13.0, valuation: 3.0, marketShareChange: 0.5, retailMix: 55, signal: 'Improving', takeaway: 'Competitive, but trails on retention.' },
  { id: 'aditya-birla', name: 'Aditya Birla Health Insurance', shortName: 'Aditya Birla', ticker: 'ABHI', peerGroup: 'SAHI', marketShare: 12, premiumCollection: 4100, settlementRatio: 97.5, renewalRate: 85, customerRetention: 81, growth: 28.6, margin: -1.8, combinedRatio: 101.8, solvency: 1.78, roe: 9.5, valuation: 4.2, marketShareChange: 0.7, retailMix: 52, signal: 'Watch', takeaway: 'Growth is strong, but margin quality needs checking.' },
  { id: 'manipalcigna', name: 'ManipalCigna Health Insurance', shortName: 'ManipalCigna', ticker: 'MANIPALCIGNA', peerGroup: 'SAHI', marketShare: 9, premiumCollection: 2600, settlementRatio: 96.8, renewalRate: 83, customerRetention: 82, growth: 15.2, margin: -3.2, combinedRatio: 103.2, solvency: 1.70, roe: 8.1, valuation: 2.6, marketShareChange: -0.1, retailMix: 48, signal: 'Watch', takeaway: 'Sub-scale and margin-pressured.' },
  // General insurers.
  { id: 'icici-lombard', name: 'ICICI Lombard General', shortName: 'ICICI Lombard', ticker: 'ICICILOMB', peerGroup: 'General', marketShare: 28, premiumCollection: 21000, settlementRatio: 96.0, renewalRate: 79, customerRetention: 80, growth: 13.1, margin: -2.6, combinedRatio: 102.6, solvency: 2.55, roe: 18.4, valuation: 5.8, marketShareChange: 0.2, retailMix: 35, signal: 'Strong', takeaway: 'Scale and returns leader in general.' },
  { id: 'bajaj-general', name: 'Bajaj Allianz General', shortName: 'Bajaj Allianz', ticker: 'BAJAJGEN', peerGroup: 'General', marketShare: 16, premiumCollection: 14500, settlementRatio: 95.2, renewalRate: 76, customerRetention: 77, growth: 9.8, margin: -0.4, combinedRatio: 100.4, solvency: 2.10, roe: 14.0, valuation: 3.1, marketShareChange: -0.2, retailMix: 28, signal: 'Improving', takeaway: 'Steady, mid-pack on growth.' },
  // Life insurers — no combined ratio reported.
  { id: 'hdfc-life', name: 'HDFC Life', shortName: 'HDFC Life', ticker: 'HDFCLIFE', peerGroup: 'Life', marketShare: 22, premiumCollection: 56000, settlementRatio: 99.5, renewalRate: 87, customerRetention: 84, growth: 11.6, margin: 0, combinedRatio: 0, solvency: 1.98, roe: 14.8, valuation: 2.2, marketShareChange: 0.1, retailMix: 0, signal: 'Improving', takeaway: 'Premium franchise, steady compounding.' },
  { id: 'sbi-life', name: 'SBI Life', shortName: 'SBI Life', ticker: 'SBILIFE', peerGroup: 'Life', marketShare: 25, premiumCollection: 62000, settlementRatio: 99.8, renewalRate: 89, customerRetention: 86, growth: 7.8, margin: 0, combinedRatio: 0, solvency: 1.82, roe: 11.2, valuation: 1.8, marketShareChange: -0.1, retailMix: 0, signal: 'Watch', takeaway: 'Scale leader, slower growth.' },
]

/** Back-compat alias — the highlight dropdown reads this. */
export const companies = insurers

export const DATA_FRESHNESS = {
  lastUpdated: UPDATED,
  coverage: 'FY21 – Q4 FY25',
  quality: 'Mock dataset',
  /** Mock data is annual-only; period toggle surfaces this limitation. */
  periodCoverage: 'Annual',
}

// =========================================================================
//  EXECUTIVE OVERVIEW
// =========================================================================

export interface HeroKpi {
  id: string
  label: string
  metric: Metric
  signal: Signal
  spark: number[]
  blob: 'blob-a' | 'blob-b' | 'blob-c' | 'blob-d' | 'blob-e'
  tone: 'navy' | 'muted' | 'soft'
  icon: 'growth' | 'share' | 'ratio' | 'shield' | 'returns' | 'valuation'
}

export const heroKpis: HeroKpi[] = [
  {
    id: 'premium-growth',
    label: 'Premium Growth (GWP, YoY)',
    metric: m(23.4, { unit: '%', change: 4.1, changeLabel: 'YoY', rank: 1, rankOf: 3, period: 'FY25' }),
    signal: 'Strong',
    spark: [14, 15, 17, 16, 19, 21, 22, 23.4],
    blob: 'blob-a',
    tone: 'navy',
    icon: 'growth',
  },
  {
    id: 'market-share',
    label: 'Market Share Change',
    metric: m(0.9, { unit: 'pp', change: 0.9, changeLabel: 'YoY', rank: 1, rankOf: 3, period: 'FY25' }),
    signal: 'Improving',
    spark: [8.1, 8.3, 8.6, 8.9, 9.2, 9.5, 9.8, 10.1],
    blob: 'blob-b',
    tone: 'soft',
    icon: 'share',
  },
  {
    id: 'combined-ratio',
    label: 'Combined Ratio',
    metric: m(96.8, { unit: '%', change: -1.6, changeLabel: 'YoY', rank: 2, rankOf: 3, period: 'FY25' }),
    signal: 'Improving',
    spark: [101, 100.4, 99.8, 99.1, 98.4, 97.9, 97.2, 96.8],
    blob: 'blob-c',
    tone: 'muted',
    icon: 'ratio',
  },
  {
    id: 'solvency',
    label: 'Solvency Ratio',
    metric: m(2.18, { unit: 'x', change: 0.06, changeLabel: 'YoY', rank: 2, rankOf: 3, period: 'Q4 FY25' }),
    signal: 'Strong',
    spark: [1.92, 1.98, 2.02, 2.05, 2.09, 2.12, 2.15, 2.18],
    blob: 'blob-d',
    tone: 'soft',
    icon: 'shield',
  },
  {
    id: 'roe',
    label: 'Return on Equity',
    metric: m(17.2, { unit: '%', change: 2.3, changeLabel: 'YoY', rank: 1, rankOf: 3, period: 'FY25' }),
    signal: 'Strong',
    spark: [11, 12.2, 13.1, 14, 15.1, 16, 16.6, 17.2],
    blob: 'blob-e',
    tone: 'navy',
    icon: 'returns',
  },
  {
    id: 'valuation',
    label: 'Valuation (P/GWP)',
    metric: m(3.4, { unit: 'x', change: -0.2, changeLabel: 'vs peer median', rank: 2, rankOf: 3, period: 'Current' }),
    signal: 'Watch',
    spark: [2.6, 2.9, 3.1, 3.5, 3.7, 3.6, 3.5, 3.4],
    blob: 'blob-a',
    tone: 'muted',
    icon: 'valuation',
  },
]

// --- Industry at a Glance (first-page visual summary) -------------------
// The donut and Industry-Leaders ranking are derived at render time from
// `insurers` via `@/lib/insurers` so they always reflect the active filters.

export interface ShareSlice {
  name: string
  value: number
  focal?: boolean
  id?: string
  takeaway?: string
}

export interface PulseItem {
  kind: 'Strength' | 'Watch' | 'Risk'
  headline: string
  detail: string
  metric: string
}

export const pulseStrip: PulseItem[] = [
  {
    kind: 'Strength',
    headline: 'Health growth is broad-based',
    detail: 'SAHI insurers keep outgrowing the wider industry on retail demand.',
    metric: 'Health +19.3%',
  },
  {
    kind: 'Watch',
    headline: 'Competitive intensity rising',
    detail: 'Banca tie-ups and pricing competition are intensifying across players.',
    metric: 'Banca-led growth',
  },
  {
    kind: 'Risk',
    headline: 'Leader valuations look full',
    detail: 'Top SAHI names trade at a premium to the broader market.',
    metric: 'P/GWP up to 4.2x',
  },
]

export interface IndustryMetric {
  label: string
  value: string
  delta?: string
  /** What the delta is measured against, e.g. "vs last yr". */
  basis?: string
  positive?: boolean
  signal: Signal
  note?: string
}

/** Compact industry-level supporting metrics (mock). */
export const industryMetrics: IndustryMetric[] = [
  { label: 'Industry growth', value: '18.4%', delta: '+1.6 pp', basis: 'vs last yr', positive: true, signal: 'Improving', note: 'Private players outgrow the market' },
  { label: 'Health growth', value: '19.3%', delta: '+2.8 pp', basis: 'vs last yr', positive: true, signal: 'Strong', note: 'Fastest-growing segment' },
  { label: 'SAHI share', value: '38.2%', delta: '+3.1 pp', basis: 'vs last yr', positive: true, signal: 'Strong', note: 'Standalone health keeps gaining' },
  { label: 'Combined ratio', value: '99.8%', delta: '-0.9 pp', basis: 'vs last yr', positive: true, signal: 'Watch', note: 'Just under 100 — thin profit' },
  { label: 'Solvency', value: '2.0x', delta: '+0.05', basis: 'vs last yr', positive: true, signal: 'Strong', note: 'Well above the 1.5x floor' },
  { label: 'Valuation', value: '4.2x', basis: 'P/GWP', signal: 'Watch', note: 'Leaders trade at a premium' },
]

export interface StoryTile {
  id: string
  title: string
  insight: string
  status: Signal
  blob: 'blob-a' | 'blob-b' | 'blob-c' | 'blob-d' | 'blob-e'
  icon: 'growth' | 'ratio' | 'shield'
  detail: string[]
}

export const storyStrip: StoryTile[] = [
  {
    id: 'growth-quality',
    title: 'Growth Quality',
    insight: 'Retail health and renewals are driving GWP — not low-margin group business.',
    status: 'Strong',
    blob: 'blob-b',
    icon: 'growth',
    detail: [
      'Retail mix up to 64% of GWP (FY25) from 58% (FY23).',
      'Renewal premium share at 71%, supporting persistency.',
      'Fresh premium concentration in banca remains the watch-item.',
    ],
  },
  {
    id: 'margin-discipline',
    title: 'Margin Discipline',
    insight: 'Combined ratio below 100 and trending down as loss ratio normalises.',
    status: 'Improving',
    blob: 'blob-c',
    icon: 'ratio',
    detail: [
      'Combined ratio 96.8% vs 98.4% a year ago.',
      'Loss ratio improved 120 bps; expense ratio flat.',
      'Commission ratio elevated on banca-led acquisition.',
    ],
  },
  {
    id: 'capital-safety',
    title: 'Capital Safety',
    insight: 'Solvency comfortably above the regulatory floor with headroom to fund growth.',
    status: 'Strong',
    blob: 'blob-d',
    icon: 'shield',
    detail: [
      'Solvency 2.18x vs 1.50x regulatory minimum.',
      'No capital raise required to fund FY26 growth plan.',
      'Internal accruals covering new business strain.',
    ],
  },
]

// =========================================================================
//  SECTION 1 — MARKET LANDSCAPE
// =========================================================================

export const marketTrend: SeriesPoint[] = [
  { label: 'FY21', Total: 100, Health: 100, Life: 100, General: 100, SAHI: 100 },
  { label: 'FY22', Total: 110, Health: 118, Life: 107, General: 112, SAHI: 128 },
  { label: 'FY23', Total: 121, Health: 139, Life: 114, General: 124, SAHI: 162 },
  { label: 'FY24', Total: 134, Health: 166, Life: 122, General: 138, SAHI: 207 },
  { label: 'FY25', Total: 148, Health: 198, Life: 131, General: 152, SAHI: 263 },
]

export const marketSplit: SeriesPoint[] = [
  { label: 'FY23', Health: 38, Life: 24, General: 30, SAHI: 8 },
  { label: 'FY24', Health: 41, Life: 22, General: 28, SAHI: 9 },
  { label: 'FY25', Health: 44, Life: 21, General: 25, SAHI: 10 },
]

export const marketRanking: SeriesPoint[] = [
  { label: 'SAHI', value: 27.1 },
  { label: 'Health (all)', value: 19.3 },
  { label: 'General', value: 10.4 },
  { label: 'Total industry', value: 11.6 },
  { label: 'Life', value: 7.2 },
]

export const marketKpis: { label: string; metric: Metric }[] = [
  { label: 'Total industry GWP', metric: m(312400, { unit: '₹ Cr', period: 'FY25', change: 11.6, changeLabel: 'YoY', source: 'IRDAI handbook (mock)' }) },
  { label: 'Health premium growth', metric: m(19.3, { unit: '%', period: 'FY25', change: 2.8, changeLabel: 'YoY', source: 'IRDAI (mock)' }) },
  { label: 'SAHI share of health', metric: m(38.2, { unit: '%', period: 'FY25', change: 3.1, changeLabel: 'YoY', status: 'Derived', source: 'Derived from segment GWP (mock)' }) },
  { label: 'Private insurer share', metric: m(63.5, { unit: '%', period: 'FY25', change: 1.4, changeLabel: 'YoY', source: 'IRDAI (mock)' }) },
  { label: 'Top share gainer', metric: { ...m(null), period: 'FY25', status: 'Reported', source: 'Niva Bupa Health (mock)' } },
]

// =========================================================================
//  SECTION 2 — COMPANY GROWTH ENGINE
// =========================================================================

export const growthTrend: SeriesPoint[] = [
  { label: 'Q1 FY24', GWP: 16.2, NWP: 15.1, NEP: 14.4 },
  { label: 'Q2 FY24', GWP: 18.4, NWP: 16.9, NEP: 15.8 },
  { label: 'Q3 FY24', GWP: 19.1, NWP: 17.6, NEP: 16.7 },
  { label: 'Q4 FY24', GWP: 20.6, NWP: 18.8, NEP: 17.9 },
  { label: 'Q1 FY25', GWP: 21.3, NWP: 19.4, NEP: 18.6 },
  { label: 'Q2 FY25', GWP: 22.0, NWP: 20.1, NEP: 19.2 },
  { label: 'Q3 FY25', GWP: 22.8, NWP: 20.7, NEP: 19.9 },
  { label: 'Q4 FY25', GWP: 23.4, NWP: 21.2, NEP: 20.4 },
]

export const growthMix: SeriesPoint[] = [
  { label: 'FY23', 'Retail Health': 52, 'Group Health': 28, Motor: 9, Life: 6, Other: 5 },
  { label: 'FY24', 'Retail Health': 58, 'Group Health': 24, Motor: 8, Life: 6, Other: 4 },
  { label: 'FY25', 'Retail Health': 64, 'Group Health': 20, Motor: 7, Life: 5, Other: 4 },
]

export const growthQuality: SeriesPoint[] = [
  { label: 'FY23', Fresh: 34, Renewal: 66 },
  { label: 'FY24', Fresh: 31, Renewal: 69 },
  { label: 'FY25', Fresh: 29, Renewal: 71 },
]

export const growthKpis: { label: string; metric: Metric }[] = [
  { label: 'GWP growth', metric: m(23.4, { unit: '%', period: 'FY25', change: 2.8, changeLabel: 'YoY' }) },
  { label: 'NWP growth', metric: m(21.2, { unit: '%', period: 'FY25', change: 2.4, changeLabel: 'YoY' }) },
  { label: 'Retail mix', metric: m(64, { unit: '%', period: 'FY25', change: 6, changeLabel: 'YoY' }) },
  { label: 'Renewal premium share', metric: m(71, { unit: '%', period: 'FY25', change: 2, changeLabel: 'YoY' }) },
]

export const growthDrawer: { metric: string; value: string; status: string }[] = [
  { metric: 'Fresh premium', value: '₹ 4,180 Cr', status: 'Reported' },
  { metric: 'Renewal premium', value: '₹ 10,240 Cr', status: 'Reported' },
  { metric: 'Policy count', value: '11.4 mn', status: 'Reported' },
  { metric: 'Average premium', value: '₹ 12,640', status: 'Derived' },
  { metric: 'Retail health contribution', value: '64% of GWP', status: 'Derived' },
]

// =========================================================================
//  SECTION 3 — DISTRIBUTION STRENGTH
// =========================================================================

export const channelShare: SeriesPoint[] = [
  { label: 'FY23', Agents: 46, Brokers: 14, Banca: 24, Direct: 9, Digital: 7 },
  { label: 'FY24', Agents: 44, Brokers: 15, Banca: 27, Direct: 8, Digital: 6 },
  { label: 'FY25', Agents: 42, Brokers: 16, Banca: 31, Direct: 6, Digital: 5 },
]

export const channelGrowth: SeriesPoint[] = [
  { label: 'Agents', value: 12.4 },
  { label: 'Brokers', value: 28.1 },
  { label: 'Banca', value: 41.6 },
  { label: 'Direct', value: -4.2 },
  { label: 'Digital', value: 6.8 },
]

export const productivity: SeriesPoint[] = [
  { label: 'FY21', agents: 41000, perAgent: 2.1 },
  { label: 'FY22', agents: 46000, perAgent: 2.4 },
  { label: 'FY23', agents: 52000, perAgent: 2.6 },
  { label: 'FY24', agents: 57000, perAgent: 3.0 },
  { label: 'FY25', agents: 61000, perAgent: 3.3 },
]

export const channelRisk: { channel: string; concentration: number; growthDependence: number }[] = [
  { channel: 'Agents', concentration: 42, growthDependence: 30 },
  { channel: 'Brokers', concentration: 16, growthDependence: 22 },
  { channel: 'Banca', concentration: 31, growthDependence: 41 },
  { channel: 'Direct', concentration: 6, growthDependence: 3 },
  { channel: 'Digital', concentration: 5, growthDependence: 4 },
]

export const distributionKpis: { label: string; metric: Metric }[] = [
  { label: 'Active agents', metric: m(61000, { unit: '', period: 'FY25', change: 7, changeLabel: 'YoY' }) },
  { label: 'Premium per agent', metric: m(3.3, { unit: '₹ L', period: 'FY25', change: 10, changeLabel: 'YoY' }) },
  { label: 'Banca dependence', metric: m(31, { unit: '%', period: 'FY25', change: 4, changeLabel: 'YoY' }) },
  { label: 'Commission ratio', metric: m(13.4, { unit: '%', period: 'FY25', change: 0.8, changeLabel: 'YoY' }) },
]

export const distributionRiskBadges: { label: string; tone: 'positive' | 'warning' | 'negative' }[] = [
  { label: 'High banca dependence', tone: 'warning' },
  { label: 'Broker-heavy growth', tone: 'warning' },
  { label: 'Direct channel weak', tone: 'negative' },
  { label: 'Commission ratio rising', tone: 'warning' },
  { label: 'Agent productivity improving', tone: 'positive' },
]

// =========================================================================
//  SECTION 4 — PROFITABILITY & CAPITAL
// =========================================================================

export const plTrend: SeriesPoint[] = [
  { label: 'FY21', Revenue: 8200, Operating: 410, PAT: 290 },
  { label: 'FY22', Revenue: 9600, Operating: 540, PAT: 360 },
  { label: 'FY23', Revenue: 11400, Operating: 690, PAT: 470 },
  { label: 'FY24', Revenue: 13100, Operating: 880, PAT: 610 },
  { label: 'FY25', Revenue: 15200, Operating: 1080, PAT: 790 },
]

export const marginTrend: SeriesPoint[] = [
  { label: 'FY21', Combined: 101.0, Loss: 66.0, Expense: 22.0, Commission: 13.0 },
  { label: 'FY22', Combined: 99.8, Loss: 65.2, Expense: 21.6, Commission: 13.0 },
  { label: 'FY23', Combined: 99.1, Loss: 64.6, Expense: 21.3, Commission: 13.2 },
  { label: 'FY24', Combined: 98.4, Loss: 64.0, Expense: 21.0, Commission: 13.4 },
  { label: 'FY25', Combined: 96.8, Loss: 62.8, Expense: 20.6, Commission: 13.4 },
]

export const returnsTrend: SeriesPoint[] = [
  { label: 'FY21', ROE: 11.0, ROA: 3.1 },
  { label: 'FY22', ROE: 12.6, ROA: 3.4 },
  { label: 'FY23', ROE: 14.4, ROA: 3.8 },
  { label: 'FY24', ROE: 15.6, ROA: 4.1 },
  { label: 'FY25', ROE: 17.2, ROA: 4.5 },
]

export const solvencyTrend: SeriesPoint[] = [
  { label: 'FY21', Solvency: 1.92, Floor: 1.5 },
  { label: 'FY22', Solvency: 2.02, Floor: 1.5 },
  { label: 'FY23', Solvency: 2.09, Floor: 1.5 },
  { label: 'FY24', Solvency: 2.12, Floor: 1.5 },
  { label: 'FY25', Solvency: 2.18, Floor: 1.5 },
]

export const profitabilityKpis: { label: string; metric: Metric }[] = [
  { label: 'PAT', metric: m(790, { unit: '₹ Cr', period: 'FY25', change: 29.5, changeLabel: 'YoY' }) },
  { label: 'Combined ratio', metric: m(96.8, { unit: '%', period: 'FY25', change: -1.6, changeLabel: 'YoY' }) },
  { label: 'ROE', metric: m(17.2, { unit: '%', period: 'FY25', change: 1.6, changeLabel: 'YoY' }) },
  { label: 'Solvency', metric: m(2.18, { unit: 'x', period: 'Q4 FY25', change: 0.06, changeLabel: 'YoY' }) },
]

export const costKpis: { label: string; metric: Metric }[] = [
  { label: 'Expense of management (EOM)', metric: m(28.4, { unit: '%', period: 'FY25', change: -0.6, changeLabel: 'YoY' }) },
  { label: 'Opex / GWP', metric: m(20.6, { unit: '%', period: 'FY25', change: -0.4, changeLabel: 'YoY' }) },
  { label: 'Acquisition cost ratio', metric: m(13.4, { unit: '%', period: 'FY25', change: 0.0, changeLabel: 'YoY' }) },
]

// =========================================================================
//  SECTION 5 — COMPETITIVE POSITIONING
// =========================================================================

export interface PeerRow {
  company: string
  shortName: string
  ticker: string
  peerGroup: Exclude<PeerGroup, 'All'>
  gwpGrowth: number
  marketShareChange: number
  combinedRatio: number
  solvency: number
  roe: number
  valuation: number
  retailMix: number
  signal: Signal
  takeaway: string
  focal?: boolean
}

// Derived from the canonical `insurers` model so peer tables stay in sync.
export const peerRows: PeerRow[] = insurers.map((i) => ({
  company: i.name,
  shortName: i.shortName,
  ticker: i.ticker,
  peerGroup: i.peerGroup,
  gwpGrowth: i.growth,
  marketShareChange: i.marketShareChange,
  combinedRatio: i.combinedRatio,
  solvency: i.solvency,
  roe: i.roe,
  valuation: i.valuation,
  retailMix: i.retailMix,
  signal: i.signal,
  takeaway: i.takeaway,
  focal: i.id === FOCAL_COMPANY,
}))

// =========================================================================
//  SECTION 6 — VALUATION & MARKET VIEW
// =========================================================================

export const valuationTrend: SeriesPoint[] = [
  { label: 'FY21', 'P/GWP': 2.6, 'Peer median': 2.4 },
  { label: 'FY22', 'P/GWP': 2.9, 'Peer median': 2.6 },
  { label: 'FY23', 'P/GWP': 3.5, 'Peer median': 2.9 },
  { label: 'FY24', 'P/GWP': 3.7, 'Peer median': 3.1 },
  { label: 'FY25', 'P/GWP': 3.4, 'Peer median': 3.0 },
]

export const valuationPeers: SeriesPoint[] = [
  { label: 'Aditya Birla Health', value: 4.2 },
  { label: 'Star Health', value: 3.6 },
  { label: 'Niva Bupa', value: 3.4 },
  { label: 'Care Health', value: 3.0 },
  { label: 'ManipalCigna', value: 2.6 },
]

export const valuationScatter: { name: string; growth: number; valuation: number; focal?: boolean }[] = [
  { name: 'Niva Bupa', growth: 23.4, valuation: 3.4, focal: true },
  { name: 'Star Health', growth: 17.5, valuation: 3.6 },
  { name: 'Care Health', growth: 20.1, valuation: 3.0 },
  { name: 'Aditya Birla', growth: 28.6, valuation: 4.2 },
  { name: 'ManipalCigna', growth: 15.2, valuation: 2.6 },
  { name: 'ICICI Lombard', growth: 13.1, valuation: 5.8 },
]

export const priceVolume: SeriesPoint[] = [
  { label: 'Jan', price: 480, volume: 12 },
  { label: 'Feb', price: 502, volume: 18 },
  { label: 'Mar', price: 521, volume: 15 },
  { label: 'Apr', price: 498, volume: 22 },
  { label: 'May', price: 540, volume: 19 },
]

export const valuationKpis: { label: string; metric: Metric }[] = [
  { label: 'Current multiple (P/GWP)', metric: m(3.4, { unit: 'x', period: 'Current', source: 'Market data (mock)' }) },
  { label: 'Peer median', metric: m(3.0, { unit: 'x', period: 'Current', status: 'Derived', source: 'Derived (mock)' }) },
  { label: 'Premium to peers', metric: m(13, { unit: '%', period: 'Current', status: 'Derived', source: 'Derived (mock)' }) },
  { label: 'Consensus upside', metric: m(8.5, { unit: '%', period: 'NTM', status: 'Estimated', source: 'Sell-side consensus (mock)' }) },
]

export const streetView = {
  buy: 11,
  hold: 6,
  sell: 2,
  targetPrice: 586,
  currentPrice: 540,
  recentChange: 'Upgraded to Buy by 2 brokers after Q4 print',
}

// =========================================================================
//  SECTION 7 — OWNERSHIP
// =========================================================================

export const ownershipTrend: SeriesPoint[] = [
  { label: 'Q1 FY25', Promoter: 52, FII: 18, DII: 12, MF: 9, PE: 5, Public: 4 },
  { label: 'Q2 FY25', Promoter: 52, FII: 19, DII: 12, MF: 9, PE: 4, Public: 4 },
  { label: 'Q3 FY25', Promoter: 51, FII: 21, DII: 13, MF: 8, PE: 4, Public: 3 },
  { label: 'Q4 FY25', Promoter: 51, FII: 23, DII: 13, MF: 7, PE: 3, Public: 3 },
]

export const ownershipChange: SeriesPoint[] = [
  { label: 'Promoter', value: -1.0 },
  { label: 'FII', value: 5.0 },
  { label: 'DII', value: 1.0 },
  { label: 'MF', value: -2.0 },
  { label: 'PE', value: -2.0 },
  { label: 'Public', value: -1.0 },
]

export const ownershipKpis: { label: string; metric: Metric }[] = [
  { label: 'Promoter holding', metric: m(51, { unit: '%', period: 'Q4 FY25', change: -1, changeLabel: 'YoY' }) },
  { label: 'FII change', metric: m(5.0, { unit: 'pp', period: 'FY25', change: 5, changeLabel: 'YoY' }) },
  { label: 'DII change', metric: m(1.0, { unit: 'pp', period: 'FY25', change: 1, changeLabel: 'YoY' }) },
  { label: 'PE / strategic', metric: m(3, { unit: '%', period: 'Q4 FY25', change: -2, changeLabel: 'YoY' }) },
]

export const majorHolders: { holder: string; type: string; stake: number; change: number }[] = [
  { holder: 'Founder Group', type: 'Promoter', stake: 51.0, change: -1.0 },
  { holder: 'Global EM Equity Fund', type: 'FII', stake: 6.4, change: 1.8 },
  { holder: 'Northwind Capital', type: 'FII', stake: 4.1, change: 1.2 },
  { holder: 'Domestic Insurance Pool', type: 'DII', stake: 5.2, change: 0.6 },
  { holder: 'Evergreen PE', type: 'PE', stake: 3.0, change: -2.0 },
]

// =========================================================================
//  SECTION 8 — MANAGEMENT COMMENTARY & EVENTS
// =========================================================================

export interface CommentaryItem {
  topic: 'Growth' | 'Margin' | 'Distribution' | 'Regulation' | 'Capital'
  quote: string
  speaker: string
  date: string
}

export const commentary: CommentaryItem[] = [
  { topic: 'Growth', quote: 'We expect retail health to compound in the low-20s with rising contribution from tier-2 markets.', speaker: 'MD & CEO', date: '2026-05-12' },
  { topic: 'Margin', quote: 'Combined ratio improvement is structural; we see room below 96% as the book seasons.', speaker: 'CFO', date: '2026-05-12' },
  { topic: 'Distribution', quote: 'Agency remains core; banca growth is additive but we are watching concentration.', speaker: 'Chief Distribution Officer', date: '2026-05-12' },
  { topic: 'Regulation', quote: 'Revised EOM norms are manageable within our current cost trajectory.', speaker: 'CFO', date: '2026-05-12' },
  { topic: 'Capital', quote: 'No equity raise is planned; solvency funds the FY26 growth plan internally.', speaker: 'CFO', date: '2026-05-12' },
]

export interface PromiseItem {
  topic: string
  previousGuidance: string
  currentUpdate: string
  status: 'Achieved' | 'On Track' | 'Delayed' | 'Missed'
}

export const promiseTracker: PromiseItem[] = [
  { topic: 'GWP growth FY25', previousGuidance: '~20% YoY', currentUpdate: 'Delivered 23.4%', status: 'Achieved' },
  { topic: 'Combined ratio', previousGuidance: 'Below 98%', currentUpdate: 'At 96.8%', status: 'Achieved' },
  { topic: 'Retail mix', previousGuidance: '60%+ by FY25', currentUpdate: 'At 64%', status: 'Achieved' },
  { topic: 'Banca concentration', previousGuidance: 'Hold near 25%', currentUpdate: 'Rose to 31%', status: 'Missed' },
  { topic: 'Digital channel scale-up', previousGuidance: '8% of mix by FY25', currentUpdate: 'At 5%', status: 'Delayed' },
]

export interface EventItem {
  id: string
  date: string
  title: string
  tag: string
  type: 'Sector' | 'Company' | 'Regulation' | 'Competition'
  impact: 'Positive' | 'Negative' | 'Neutral' | 'Watch'
  relevance: string
  importance: number
  source: string
  sourceUrl?: string
  detail: string
}

export const events: EventItem[] = [
  {
    id: 'ev1',
    date: '2026-05-12',
    title: 'Niva Bupa posts Q4 with combined ratio at multi-year low',
    tag: 'Niva Bupa Health',
    type: 'Company',
    impact: 'Positive',
    relevance: 'Confirms structural margin thesis; supports premium valuation.',
    importance: 95,
    source: 'Q4 FY25 results (mock)',
    detail: 'Combined ratio of 96.8% beat consensus of ~98%. Retail health mix and renewal strength were the key drivers; management guided to further improvement.',
  },
  {
    id: 'ev2',
    date: '2026-05-05',
    title: 'Regulator revises Expense of Management norms',
    tag: 'IRDAI',
    type: 'Regulation',
    impact: 'Watch',
    relevance: 'Cost ceilings could pressure aggressive-acquisition peers more than Niva Bupa.',
    importance: 88,
    source: 'Regulatory circular (mock)',
    detail: 'Revised EOM framework tightens allowable expense ratios on a glide path. Insurers with elevated commission ratios face the most adjustment; Niva Bupa sits within limits.',
  },
  {
    id: 'ev3',
    date: '2026-04-22',
    title: 'Large bank renews banca tie-up with Star Health',
    tag: 'Star Health',
    type: 'Competition',
    impact: 'Negative',
    relevance: 'Tightens banca shelf-space; watch impact on Niva Bupa fresh premium.',
    importance: 74,
    source: 'Exchange filing (mock)',
    detail: 'Multi-year exclusive renewal locks a major bank channel to a peer, a modest headwind to Niva Bupa’s banca-led fresh premium growth.',
  },
  {
    id: 'ev4',
    date: '2026-04-10',
    title: 'Industry health GWP grows 19% in FY25',
    tag: 'Sector',
    type: 'Sector',
    impact: 'Positive',
    relevance: 'Confirms the structural growth backdrop for SAHI players.',
    importance: 70,
    source: 'IRDAI handbook (mock)',
    detail: 'Health remained the fastest-growing segment, with SAHI insurers outpacing the broader industry on retail momentum.',
  },
  {
    id: 'ev5',
    date: '2026-03-28',
    title: 'FII ownership in Niva Bupa rises to multi-quarter high',
    tag: 'Niva Bupa Health',
    type: 'Company',
    impact: 'Positive',
    relevance: 'Quality institutions accumulating; supportive of the stock.',
    importance: 62,
    source: 'Shareholding disclosure (mock)',
    detail: 'FII holding rose ~5pp over FY25 while PE holders trimmed, a net positive rotation toward long-only institutions.',
  },
]
