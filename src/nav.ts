import type { IconKey } from '@/components/icons'

export interface NavItem {
  id: string
  label: string
  shortLabel: string
  icon: IconKey
  question: string
}

export const navItems: NavItem[] = [
  { id: 'overview', label: 'Executive Overview', shortLabel: 'Overview', icon: 'overview', question: 'What is the full investor signal right now?' },
  { id: 'market', label: 'Market Landscape', shortLabel: 'Market', icon: 'market', question: 'Is the market growing, and which segment is gaining share?' },
  { id: 'growth', label: 'Company Growth', shortLabel: 'Growth', icon: 'growth', question: 'Who is growing fastest, and is the growth high quality?' },
  { id: 'distribution', label: 'Distribution', shortLabel: 'Distribution', icon: 'distribution', question: 'Is the sales engine scalable and not over-concentrated?' },
  { id: 'profitability', label: 'Profitability', shortLabel: 'Profit', icon: 'capital', question: 'Is growth converting into profit and strong capital returns?' },
  { id: 'peers', label: 'Competitive Position', shortLabel: 'Peers', icon: 'peers', question: 'Who is winning versus peers?' },
  { id: 'valuation', label: 'Valuation', shortLabel: 'Valuation', icon: 'valuation', question: 'Is the stock pricing in too much, or still offering upside?' },
  { id: 'ownership', label: 'Ownership', shortLabel: 'Ownership', icon: 'ownership', question: 'Are serious investors increasing or reducing exposure?' },
  { id: 'management', label: 'Management Events', shortLabel: 'Management', icon: 'commentary', question: 'Is management credible, and what events matter now?' },
]
