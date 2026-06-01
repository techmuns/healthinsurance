import type { IconKey } from '@/components/icons'
import { LENS_ORDER, profitabilityLenses } from '@/data/profitabilityLenses'

/** A nested lens item shown under a parent section (e.g. the Profitability lenses). */
export interface NavChild {
  /** Full route id, e.g. "profitability/statutory". */
  id: string
  /** Short nested label, e.g. "Statutory". */
  label: string
  /** One-line hint shown on hover. */
  hint: string
}

export interface NavItem {
  id: string
  label: string
  shortLabel: string
  icon: IconKey
  question: string
  /** Optional nested children that expand under this item when it is active. */
  children?: NavChild[]
}

// Profitability expands into the three accounting lenses (Statutory / IFRS /
// IGAAP). Built from the single lens config so labels never drift.
const profitabilityChildren: NavChild[] = LENS_ORDER.map((key) => {
  const lens = profitabilityLenses[key]
  return { id: lens.routeId, label: lens.label, hint: lens.description }
})

export const navItems: NavItem[] = [
  { id: 'overview', label: 'Executive Overview', shortLabel: 'Overview', icon: 'overview', question: 'What is the full investor signal right now?' },
  { id: 'market', label: 'Market Engine', shortLabel: 'Market', icon: 'market', question: 'Where is the GI premium pool shifting, and is Niva gaining inside it?' },
  { id: 'growth', label: 'Premium Engine', shortLabel: 'Growth', icon: 'growth', question: 'Who is growing fastest, and is the growth high quality?' },
  { id: 'distribution', label: 'Distribution', shortLabel: 'Distribution', icon: 'distribution', question: 'Is the sales engine scalable and not over-concentrated?' },
  { id: 'profitability', label: 'Profitability', shortLabel: 'Profit', icon: 'capital', question: 'Is growth converting into profit and strong capital returns?', children: profitabilityChildren },
  { id: 'peers', label: 'Competitive Position', shortLabel: 'Peers', icon: 'peers', question: 'Who is winning versus peers?' },
  { id: 'valuation', label: 'Valuation', shortLabel: 'Valuation', icon: 'valuation', question: 'Is the stock pricing in too much, or still offering upside?' },
  { id: 'ownership', label: 'Ownership', shortLabel: 'Ownership', icon: 'ownership', question: 'Are serious investors increasing or reducing exposure?' },
  { id: 'management', label: 'Management Events', shortLabel: 'Management', icon: 'commentary', question: 'Is management credible, and what events matter now?' },
]

/** Sidebar grouping — keeps the rail scannable without changing the labels. */
export const navGroups: { label: string; itemIds: string[] }[] = [
  { label: 'Market', itemIds: ['overview', 'market', 'growth', 'distribution'] },
  { label: 'Company', itemIds: ['profitability', 'valuation', 'peers'] },
  { label: 'Governance', itemIds: ['ownership', 'management'] },
]
