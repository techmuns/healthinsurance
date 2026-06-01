// ---------------------------------------------------------------------------
// Profitability lenses — one profitability story per accounting basis.
//
// The Profitability page is a parent section with TWO nested lenses, each a
// self-contained story built for that accounting standard:
//
//   • Statutory / IGAAP — the reported Indian regulatory profitability view.
//     The historical Indian-insurance statutory numbers ARE the IGAAP accounts,
//     so these are one lens (premium → claims → expense → combined ratio →
//     underwriting result → PAT/ROE → solvency), not two.
//   • Ind AS / IFRS-style — the Ind-AS / IFRS-style profitability view. Only the
//     IFRS measures that are actually disclosed (IFRS PAT, margin, combined /
//     claims / expense ratios) plus the premium and investment-income context.
//     India has not adopted IFRS 17, so the granular IFRS-17 revenue-account
//     split is not separately reported and is never fabricated.
//
// This is config (content + ordering) only — every number is resolved from the
// real datasets in the section, with honest nulls. Missing ≠ zero; a metric that
// does not belong to a basis is removed from that lens, never shown as "NA".
// ---------------------------------------------------------------------------

import type { AccountingBasis } from './accountingBasis'

export type ProfitLens = 'statutory' | 'ifrs'

/** The canonical order the lenses appear in (sidebar + in-page switcher). */
export const LENS_ORDER: ProfitLens[] = ['statutory', 'ifrs']

/** Default lens opened when the parent "Profitability" item is clicked. */
export const DEFAULT_LENS: ProfitLens = 'statutory'

/**
 * Each stage's `semantic` drives the resolved node value/status, the active
 * detail body, the dynamic trend chart and the investor read (one place).
 */
export type StageSemantic =
  // ── Statutory / IGAAP ──
  | 'premium' // premium retained / net earned premium
  | 'claims' // net incurred claims ratio
  | 'expense' // expense + commission ratio
  | 'combined' // combined ratio (₹100 engine)
  | 'underwriting-result' // audited core underwriting profit/loss
  | 'conversion' // investment support → PAT
  | 'returns' // PAT margin / shareholder return (ROE shown in body)
  | 'capital' // solvency cushion
  // ── Ind AS / IFRS-style ──
  | 'ifrs-revenue' // insurance revenue (net earned premium basis)
  | 'ifrs-service' // insurance service result (IFRS combined ratio)
  | 'ifrs-finance' // insurance finance / investment result
  | 'ifrs-profit' // profit before tax / PAT (IFRS)
  | 'ifrs-margin' // IFRS-style margin / shareholder return

export type StageAccent = 'emerald' | 'teal' | 'gold' | 'orange' | 'deepGreen' | 'navy' | 'coral'

export type StageIcon =
  | 'premium'
  | 'claims'
  | 'expense'
  | 'combined'
  | 'result'
  | 'conversion'
  | 'returns'
  | 'capital'
  | 'revenue'
  | 'service'
  | 'finance'
  | 'profit'
  | 'margin'

export interface LensStage {
  semantic: StageSemantic
  /** Story-map node label, e.g. "Claims ratio". */
  label: string
  /** Single headline metric label under the node, e.g. "Claims ratio". */
  metricLabel: string
  /** Plain-English question this stage answers. */
  line: string
  icon: StageIcon
  accent: StageAccent
}

export interface LensSource {
  label: string
  period?: string
  url?: string
}

export interface LensDrawer {
  basisUsed: string
  formula: string[]
  why: string
  sources: LensSource[]
}

export interface LensConfig {
  key: ProfitLens
  /** Short sidebar / switcher label. */
  label: string
  /** Full route id, e.g. "profitability/statutory". */
  routeId: string
  /** The dataset basis each lens reads from. */
  dataBasis: AccountingBasis
  /** The visible basis tag shown on chips/headers. */
  basisTag: string
  /** The "Basis: …" pill wording (no confusing slash that reads like two
   *  separate selected bases). */
  basisLabel: string
  description: string
  question: string
  tone: StageAccent
  storyMapTitle: string
  storyMapSubtitle: string
  /** Ordered story stages — change per basis. */
  stages: LensStage[]
  /** The lens's own "Accounting details" drawer content. */
  detailDrawer: LensDrawer
}

const ANNUAL_REPORT_URL =
  'https://transactions.nivabupa.com/pages/doc/pub-dis/annual-reports/Annual-Report-FY-2024-25.pdf'
const IRDAI_DISCLOSURE_URL = 'https://transactions.nivabupa.com/pages/investor-relations.aspx'

export const profitabilityLenses: Record<ProfitLens, LensConfig> = {
  // ── Statutory / IGAAP ──────────────────────────────────────────────────────
  statutory: {
    key: 'statutory',
    label: 'Statutory / IGAAP',
    routeId: 'profitability/statutory',
    dataBasis: 'igaap',
    basisTag: 'Statutory / IGAAP',
    basisLabel: 'Statutory reporting · IGAAP',
    description: 'The reported Indian regulatory profitability view.',
    question: 'Is the book disciplined, profitable and well-capitalised?',
    tone: 'navy',
    storyMapTitle: 'Statutory / IGAAP Profitability Story',
    storyMapSubtitle: 'From premium to claims, costs, profit and capital.',
    stages: [
      { semantic: 'premium', label: 'Premium retained', metricLabel: 'Net earned premium', line: 'How much premium is kept and earned?', icon: 'premium', accent: 'navy' },
      { semantic: 'claims', label: 'Claims ratio', metricLabel: 'Claims ratio', line: 'How much premium goes to claims?', icon: 'claims', accent: 'coral' },
      { semantic: 'expense', label: 'Cost & commission', metricLabel: 'Expense ratio', line: 'Are running and selling costs disciplined?', icon: 'expense', accent: 'gold' },
      { semantic: 'combined', label: 'Combined ratio', metricLabel: 'Combined ratio', line: 'Do claims and costs stay inside ₹100?', icon: 'combined', accent: 'emerald' },
      { semantic: 'underwriting-result', label: 'Underwriting result', metricLabel: 'Underwriting result', line: 'Does insurance itself make money?', icon: 'result', accent: 'teal' },
      { semantic: 'conversion', label: 'Investment → PAT', metricLabel: 'PAT', line: 'What carries profit to the bottom line?', icon: 'conversion', accent: 'gold' },
      { semantic: 'returns', label: 'Profit & return', metricLabel: 'PAT margin', line: 'How much premium becomes shareholder profit?', icon: 'returns', accent: 'orange' },
      { semantic: 'capital', label: 'Solvency support', metricLabel: 'Solvency', line: 'Is there capital to fund the growth?', icon: 'capital', accent: 'deepGreen' },
    ],
    detailDrawer: {
      basisUsed:
        'Statutory / IGAAP — the audited Indian-GAAP financial statements as filed with IRDAI (Revenue Account Form B-RA, Profit & Loss Form B-PL), read together with the regulatory ratios: claims ratio, expense of management, combined ratio and solvency. The statutory return and the IGAAP accounts are the same set of books.',
      formula: [
        'Net earned premium = GWP − reinsurance ceded − change in unearned-premium reserve',
        'Claims ratio = net incurred claims ÷ net earned premium',
        'Combined ratio = (net claims + commission + operating expense) ÷ net premium',
        'Underwriting result = net earned premium − claims − commission − operating expense',
        'PAT = underwriting result + investment income + other (net) − tax',
        'Solvency = available solvency margin ÷ required margin (regulatory floor 1.5×)',
      ],
      why:
        'This is what the regulator and the solvency framework watch. A combined ratio above 100% means underwriting alone loses money — profit is then carried by investment income. The solvency cushion shows how much capital backs future growth and absorbs claims volatility.',
      sources: [
        { label: 'Annual report · Revenue A/c + P&L', period: 'FY25', url: ANNUAL_REPORT_URL },
        { label: 'IRDAI public disclosures', period: 'FY25–FY26', url: IRDAI_DISCLOSURE_URL },
      ],
    },
  },

  // ── Ind AS / IFRS-style ─────────────────────────────────────────────────────
  ifrs: {
    key: 'ifrs',
    label: 'Ind AS / IFRS-style',
    routeId: 'profitability/ifrs',
    dataBasis: 'ifrs',
    basisTag: 'Ind AS / IFRS-style',
    basisLabel: 'Ind AS / IFRS-style',
    description: 'The Ind-AS / IFRS-style profitability view.',
    question: 'How does profit read on the Ind-AS / IFRS-style basis?',
    tone: 'teal',
    storyMapTitle: 'Ind AS / IFRS-style Profitability Story',
    storyMapSubtitle: 'Revenue, service result, finance result and IFRS profit.',
    stages: [
      { semantic: 'ifrs-revenue', label: 'Insurance revenue', metricLabel: 'Net earned premium', line: 'How big is the insurance revenue base?', icon: 'revenue', accent: 'navy' },
      { semantic: 'ifrs-service', label: 'Service result', metricLabel: 'Combined ratio · IFRS', line: 'Does the insurance service earn a margin?', icon: 'service', accent: 'teal' },
      { semantic: 'ifrs-finance', label: 'Finance / investment', metricLabel: 'Investment income', line: 'What does the investment book contribute?', icon: 'finance', accent: 'deepGreen' },
      { semantic: 'ifrs-profit', label: 'Profit / PAT', metricLabel: 'PAT · IFRS', line: 'What does the business earn on IFRS?', icon: 'profit', accent: 'emerald' },
      { semantic: 'ifrs-margin', label: 'IFRS margin', metricLabel: 'PAT margin · IFRS', line: 'What return reaches the shareholder?', icon: 'margin', accent: 'orange' },
    ],
    detailDrawer: {
      basisUsed:
        'Ind AS / IFRS-style — the international accounting basis Indian insurers are converging toward. India has not yet adopted IFRS 17, so only IFRS profit and the headline cost ratios are separately disclosed; the granular IFRS-17 revenue-account split is not. This lens uses the disclosed IFRS figures (PAT, margin, combined / claims / expense ratios) with the premium and investment-income context — never a fabricated split, and never statutory-only metrics like ROE or solvency.',
      formula: [
        'IFRS recognises premium revenue and reserves differently from IGAAP, so IFRS PAT differs from IGAAP PAT.',
        'Insurance revenue (IFRS-style) ≈ net earned premium for short-duration health cover',
        'Insurance service result: combined ratio (IFRS) below 100% = a service margin',
        'PAT margin (IFRS) = IFRS PAT ÷ gross written premium',
      ],
      why:
        'On the IFRS basis the profit can read very differently from IGAAP — for Niva Bupa, recent-year IFRS PAT is materially higher than IGAAP PAT. The gap is the accounting basis, not the underlying business, which is why every figure on the dashboard is basis-tagged.',
      sources: [{ label: 'Annual report · IFRS accounts', period: 'FY25–FY26', url: ANNUAL_REPORT_URL }],
    },
  },
}

/** Resolve a lens config from a route id or lens key; falls back to the default. */
export function lensFromRoute(routeOrKey: string | undefined): LensConfig {
  if (!routeOrKey) return profitabilityLenses[DEFAULT_LENS]
  const key = (routeOrKey.includes('/') ? routeOrKey.split('/')[1] : routeOrKey) as ProfitLens
  return profitabilityLenses[key] ?? profitabilityLenses[DEFAULT_LENS]
}
