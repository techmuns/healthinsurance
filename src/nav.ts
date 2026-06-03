import type { IconKey } from '@/components/icons'

export interface NavItem {
  id: string
  label: string
  shortLabel: string
  icon: IconKey
  question: string
}

// Six consolidated top-level sections. Each section renders its sub-areas as
// in-page tabs (not sidebar children), so the rail stays short and scannable.
export const navItems: NavItem[] = [
  { id: 'overview', label: 'Executive Overview', shortLabel: 'Overview', icon: 'overview', question: 'What is the full investor signal right now?' },
  { id: 'market-distribution', label: 'Market & Distribution', shortLabel: 'Market', icon: 'market', question: 'Where is the premium pool shifting, how is premium written, and through which channels?' },
  { id: 'company-performance', label: 'Company Performance', shortLabel: 'Company', icon: 'capital', question: 'Is the company profitable, fairly valued, and ahead of peers over time?' },
  { id: 'street-view', label: 'Street View', shortLabel: 'Street', icon: 'commentary', question: 'What do brokers and analysts think it is worth?' },
  { id: 'peers', label: 'Peer Comparison', shortLabel: 'Peers', icon: 'peers', question: 'How do listed and unlisted peers compare?' },
  { id: 'ownership-governance', label: 'Ownership & Governance', shortLabel: 'Governance', icon: 'ownership', question: 'Who owns the company, and what governance events matter?' },
]

/** Sidebar grouping — keeps the rail scannable without changing the labels. */
export const navGroups: { label: string; itemIds: string[] }[] = [
  { label: 'Overview', itemIds: ['overview'] },
  { label: 'Business', itemIds: ['market-distribution', 'company-performance', 'street-view', 'peers'] },
  { label: 'Governance', itemIds: ['ownership-governance'] },
]

export type SectionFrequencyKind = 'operating' | 'profitability' | 'none'

function splitRoute(active: string): { base: string; tab: string } {
  const slash = active.indexOf('/')
  const base = slash === -1 ? active : active.slice(0, slash)
  const sub = slash === -1 ? '' : active.slice(slash + 1)
  return { base, tab: sub.split('/')[0] }
}

// ── Frequency-toggle ownership ──────────────────────────────────────────────
// The global header frequency toggle drives only the "operating" routes
// (Overview + Market & Distribution; Monthly is locked there until data lands).
// Company Performance's Profitability tab runs a Quarterly/Annual toggle; every
// other route shows a short static reporting-basis label in the same slot.
export function routeFrequencyKind(active: string): SectionFrequencyKind {
  const { base, tab } = splitRoute(active)
  if (base === 'overview' || base === 'market-distribution') return 'operating'
  if (base === 'company-performance') return tab === '' || tab === 'profitability' ? 'profitability' : 'none'
  return 'none'
}

/** Short static reporting-basis label for routes without a frequency toggle. */
export function staticBasisLabel(active: string): string {
  const { base, tab } = splitRoute(active)
  if (base === 'company-performance') {
    if (tab === 'valuation') return 'Latest available'
    if (tab === 'competitive-position') return 'Scorecard basis'
    if (tab === 'historical-trends') return 'Annual history'
  }
  if (base === 'street-view') return 'Analyst-sourced'
  if (base === 'peers') return 'Scorecard basis'
  if (base === 'ownership-governance') return tab === 'management' ? 'Event-based' : 'Reported quarterly'
  return 'Published annually'
}
