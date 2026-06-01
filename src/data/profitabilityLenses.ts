// ---------------------------------------------------------------------------
// Profitability lenses — one profitability story per accounting basis.
//
// The Profitability page is a parent section with three nested lenses, each a
// self-contained story built for that accounting standard:
//
//   • Statutory — the regulatory / solvency reading of the audited Indian-GAAP
//     filings (combined ratio, expense of management, underwriting result,
//     investment support, solvency). What the regulator watches.
//   • IGAAP     — the SAME audited Indian-GAAP filings, read as accounting
//     profit and return on equity (GWP → claims/commission/opex → underwriting
//     result → investment income → PAT → ROE). What the shareholder earns.
//   • IFRS      — the international basis. Only the IFRS measures that are
//     actually disclosed (IFRS PAT, PAT margin, combined / claims / expense
//     ratios) plus the IGAAP↔IFRS reconciliation. Statutory-only items
//     (granular ₹100 cost split, underwriting result, ROE, solvency) are NOT
//     shown on IFRS — they are not reported on that basis and are never derived.
//
// This is config (content + ordering) only — every number is resolved from the
// real datasets in the section, with honest nulls. Missing ≠ zero; a metric that
// does not belong to a basis is removed from that lens, never shown as "NA".
// ---------------------------------------------------------------------------

import type { AccountingBasis } from './accountingBasis'

export type ProfitLens = 'statutory' | 'ifrs' | 'igaap'

/** The canonical order the lenses appear in (sidebar + in-page switcher). */
export const LENS_ORDER: ProfitLens[] = ['statutory', 'ifrs', 'igaap']

/** Default lens opened when the parent "Profitability" item is clicked. */
export const DEFAULT_LENS: ProfitLens = 'statutory'

/**
 * Each stage's `semantic` drives BOTH the resolved node value/status AND which
 * detail body renders below the story map (see the section's body registry).
 */
export type StageSemantic =
  | 'premium' // premium retained / earned (GWP → NWP → NEP)
  | 'discipline' // ₹100 cost split → combined ratio (statutory granularity)
  | 'underwriting-result' // audited core underwriting profit/loss
  | 'conversion' // premium → PAT (investment support)
  | 'returns' // PAT → ROE (shareholder return)
  | 'capital' // solvency cushion
  | 'ifrs-service' // IFRS cost ratios → IFRS combined ratio
  | 'ifrs-profit' // IFRS PAT + margin
  | 'ifrs-recon' // IGAAP ↔ IFRS PAT reconciliation

/** Tone key — mapped to a hex accent in the section (palette-aligned). */
export type StageAccent = 'emerald' | 'teal' | 'gold' | 'orange' | 'deepGreen' | 'navy'

/** Compact icon key — mapped to a lucide icon in the section. */
export type StageIcon = 'premium' | 'discipline' | 'result' | 'conversion' | 'returns' | 'capital' | 'service' | 'profit' | 'recon'

export interface LensStage {
  semantic: StageSemantic
  /** Story-map node label, e.g. "Cost discipline". */
  label: string
  /** Single headline metric label under the node, e.g. "Combined ratio". */
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
  /** What basis the numbers are on (one short paragraph). */
  basisUsed: string
  /** The formula / bridge, as compact bullet lines. */
  formula: string[]
  /** Why this lens matters to an investor (one short paragraph). */
  why: string
  /** Source links shown in the drawer. */
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
  /** The visible basis tag shown everywhere on the lens. */
  basisTag: string
  /** One-line description of what the lens is for (sidebar hint + hero). */
  description: string
  /** The hero question. */
  question: string
  /** Lens accent tone key (mapped to hex in the section). */
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
  // ── Statutory ─────────────────────────────────────────────────────────────
  statutory: {
    key: 'statutory',
    label: 'Statutory',
    routeId: 'profitability/statutory',
    dataBasis: 'igaap',
    basisTag: 'Statutory',
    description: 'The regulator’s view — can the book pay claims and keep writing?',
    question: 'Is the book disciplined, self-funding and well-capitalised?',
    tone: 'navy',
    storyMapTitle: 'Statutory Profitability Story',
    storyMapSubtitle: 'How premium covers claims, costs and capital.',
    stages: [
      { semantic: 'premium', label: 'Premium retained', metricLabel: 'Net earned premium', line: 'How much premium is kept and earned?', icon: 'premium', accent: 'navy' },
      { semantic: 'discipline', label: 'Cost discipline', metricLabel: 'Combined ratio', line: 'Do claims and costs stay inside ₹100?', icon: 'discipline', accent: 'emerald' },
      { semantic: 'underwriting-result', label: 'Underwriting result', metricLabel: 'Underwriting result', line: 'Does insurance itself make money?', icon: 'result', accent: 'teal' },
      { semantic: 'conversion', label: 'Investment support → PAT', metricLabel: 'PAT', line: 'What carries profit to the bottom line?', icon: 'conversion', accent: 'gold' },
      { semantic: 'capital', label: 'Solvency support', metricLabel: 'Solvency', line: 'Is there capital to fund the growth?', icon: 'capital', accent: 'deepGreen' },
    ],
    detailDrawer: {
      basisUsed:
        'Statutory / IRDAI basis — the audited Indian-GAAP financial statements as filed (Revenue Account Form B-RA, Profit & Loss Form B-PL) read together with the regulatory ratios: combined ratio, expense of management and solvency.',
      formula: [
        'Net earned premium = GWP − reinsurance ceded − change in unearned-premium reserve',
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

  // ── IFRS ────────────────────────────────────────────────────────────────--
  ifrs: {
    key: 'ifrs',
    label: 'IFRS',
    routeId: 'profitability/ifrs',
    dataBasis: 'ifrs',
    basisTag: 'IFRS',
    description: 'The international basis — only what is reported on IFRS.',
    question: 'How does profit read on the international basis?',
    tone: 'teal',
    storyMapTitle: 'IFRS Profitability Story',
    storyMapSubtitle: 'IFRS service result, profit and the basis gap.',
    stages: [
      { semantic: 'ifrs-service', label: 'Insurance service result', metricLabel: 'Combined ratio · IFRS', line: 'Do claims and costs leave a service margin?', icon: 'service', accent: 'teal' },
      { semantic: 'ifrs-profit', label: 'IFRS profit', metricLabel: 'PAT · IFRS', line: 'What does the business earn on IFRS?', icon: 'profit', accent: 'emerald' },
      { semantic: 'ifrs-recon', label: 'Basis reconciliation', metricLabel: 'IFRS vs IGAAP', line: 'Why does IFRS profit differ from IGAAP?', icon: 'recon', accent: 'navy' },
    ],
    detailDrawer: {
      basisUsed:
        'IFRS — the international accounting basis. India has not adopted IFRS 17, so only IFRS profit and the headline cost ratios are separately disclosed; the granular IFRS revenue-account split is not. Underwriting result, ROE and solvency are not reported on IFRS and are intentionally left out — never derived from statutory figures.',
      formula: [
        'IFRS recognises premium revenue and reserves differently from IGAAP, so IFRS PAT differs from IGAAP PAT.',
        'PAT margin (IFRS) = IFRS PAT ÷ GWP',
        'Combined ratio (IFRS) = (claims + expenses) ÷ premium, on the IFRS basis',
        'Basis gap = IFRS PAT − IGAAP PAT (the difference is accounting, not cash)',
      ],
      why:
        'On IFRS the profit can read very differently from IGAAP — for Niva Bupa, FY26 IFRS PAT is far higher than IGAAP PAT. The gap is the accounting basis, not the underlying business, which is exactly why every figure on the dashboard is basis-tagged.',
      sources: [{ label: 'Annual report · IFRS accounts', period: 'FY25–FY26', url: ANNUAL_REPORT_URL }],
    },
  },

  // ── IGAAP ─────────────────────────────────────────────────────────────────
  igaap: {
    key: 'igaap',
    label: 'IGAAP',
    routeId: 'profitability/igaap',
    dataBasis: 'igaap',
    basisTag: 'IGAAP',
    description: 'The reported accounting view — premium to shareholder return.',
    question: 'How well does premium convert into profit and return?',
    tone: 'gold',
    storyMapTitle: 'IGAAP Profitability Story',
    storyMapSubtitle: 'From premium to PAT to return on equity.',
    stages: [
      { semantic: 'premium', label: 'Premium earned', metricLabel: 'Gross written premium', line: 'How big is the top line?', icon: 'premium', accent: 'navy' },
      { semantic: 'discipline', label: 'Claims & costs', metricLabel: 'Combined ratio', line: 'Where does the premium go?', icon: 'discipline', accent: 'emerald' },
      { semantic: 'underwriting-result', label: 'Underwriting result', metricLabel: 'Underwriting result', line: 'Does insurance make money on its own?', icon: 'result', accent: 'teal' },
      { semantic: 'conversion', label: 'Profit conversion', metricLabel: 'PAT margin', line: 'How much premium becomes profit?', icon: 'conversion', accent: 'gold' },
      { semantic: 'returns', label: 'Shareholder return', metricLabel: 'ROE', line: 'What does the shareholder earn?', icon: 'returns', accent: 'orange' },
    ],
    detailDrawer: {
      basisUsed:
        'Indian GAAP (IGAAP) — the same audited financial statements as the Statutory lens, read as accounting profit and return on equity. The figures are identical to Statutory; the difference is the question: what does the shareholder earn on the capital invested?',
      formula: [
        'PAT margin = PAT ÷ gross written premium',
        'ROE = PAT ÷ net worth (shareholders’ equity)',
        'Underwriting result = net earned premium − claims − commission − operating expense',
        'PAT = underwriting result + investment income + other (net) − tax',
      ],
      why:
        'The IGAAP lens follows the rupee from premium to the shareholder. ROE is still early because the post-IPO capital base is large; it lifts as PAT compounds against equity without needing much fresh capital.',
      sources: [{ label: 'Annual report · Revenue A/c + P&L', period: 'FY25', url: ANNUAL_REPORT_URL }],
    },
  },
}

/** Resolve a lens config from a route id or lens key; falls back to the default. */
export function lensFromRoute(routeOrKey: string | undefined): LensConfig {
  if (!routeOrKey) return profitabilityLenses[DEFAULT_LENS]
  const key = (routeOrKey.includes('/') ? routeOrKey.split('/')[1] : routeOrKey) as ProfitLens
  return profitabilityLenses[key] ?? profitabilityLenses[DEFAULT_LENS]
}
