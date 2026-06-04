import type { IconKey } from '@/components/icons'

export interface NavItem {
  id: string
  label: string
  shortLabel: string
  icon: IconKey
  question: string
}

// Two top-level pages. Page switching is primarily via the header switcher
// blocks; the sidebar mirrors the same two destinations as app-level icon
// navigation (it deliberately does NOT duplicate the SAHI sub-tabs, which live
// as pills under the SAHI header).
export const navItems: NavItem[] = [
  { id: 'industry', label: 'Industry Insights', shortLabel: 'Industry', icon: 'home', question: 'How is the overall insurance industry doing right now?' },
  { id: 'sahi', label: 'SAHI Analysis', shortLabel: 'SAHI', icon: 'analytics', question: 'How do the standalone health insurers compare in depth?' },
]

/** Sidebar grouping — keeps the rail scannable without changing the labels. */
export const navGroups: { label: string; itemIds: string[] }[] = [
  { label: 'Pages', itemIds: ['industry', 'sahi'] },
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
