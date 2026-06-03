import { useState, type ComponentType } from 'react'
import { FilterProvider } from '@/state/filters'
import { TopTabBar, type TopTab } from '@/components/TopTabBar'
import { Sidebar } from '@/components/Sidebar'
import { TopFilterBar } from '@/components/TopFilterBar'
import { ExecutiveOverview } from '@/sections/ExecutiveOverview'
import { MarketDistribution } from '@/sections/MarketDistribution'
import { CompanyPerformance } from '@/sections/CompanyPerformance'
import { StreetView } from '@/sections/StreetView'
import { CompetitivePositioning } from '@/sections/CompetitivePositioning'
import { OwnershipGovernance } from '@/sections/OwnershipGovernance'

type SectionProps = { onNavigate?: (id: string) => void; sub?: string }

interface SectionDef {
  navId: string
  anchor: string
  label: string
  Comp: ComponentType<SectionProps>
  /** Section drives internal tabs via onNavigate/sub — give it local state. */
  hasSub?: boolean
}

// The six top-level pages. Exactly one is rendered at a time — navigation is by
// the top tab bar or the left sidebar, never by scrolling.
const SECTIONS: SectionDef[] = [
  { navId: 'overview', anchor: 'executive-overview', label: 'Executive Overview', Comp: ExecutiveOverview },
  { navId: 'market-distribution', anchor: 'market-distribution', label: 'Market & Distribution', Comp: MarketDistribution },
  { navId: 'company-performance', anchor: 'company-performance', label: 'Company Performance', Comp: CompanyPerformance, hasSub: true },
  { navId: 'street-view', anchor: 'street-view', label: 'Street View', Comp: StreetView },
  { navId: 'peers', anchor: 'peer-comparison', label: 'Peer Comparison', Comp: CompetitivePositioning },
  { navId: 'ownership-governance', anchor: 'ownership-governance', label: 'Ownership & Governance', Comp: OwnershipGovernance, hasSub: true },
]

const TABS: TopTab[] = SECTIONS.map(({ navId, anchor, label }) => ({ navId, anchor, label }))

// Per-section colour-psychology aura. Each section gets its own faint tonal
// field so navigation feels alive and tone-coded to the section's meaning:
//   navy = core analysis · teal = growth/live · blue = company analysis ·
//   gold = valuation/premium · lavender = comparison · slate = governance.
const SECTION_AURA: Record<string, { a: string; b: string; c: string }> = {
  overview: { a: '#27457E', b: '#168E8E', c: '#B68B3A' },
  'market-distribution': { a: '#168E8E', b: '#4F7BCF', c: '#27457E' },
  'company-performance': { a: '#3D5F9F', b: '#168E8E', c: '#B68B3A' },
  'street-view': { a: '#B68B3A', b: '#27457E', c: '#168E8E' },
  peers: { a: '#6E7BD6', b: '#168E8E', c: '#27457E' },
  'ownership-governance': { a: '#27457E', b: '#8C97A8', c: '#B68B3A' },
}

/** Wraps a section that manages internal tabs so its routing stays local. */
function StatefulSection({ Comp }: { Comp: ComponentType<SectionProps> }) {
  const [sub, setSub] = useState<string | undefined>(undefined)
  const onNavigate = (route: string) => {
    const rest = route.split('/').slice(1).join('/')
    setSub(rest || undefined)
  }
  return <Comp onNavigate={onNavigate} sub={sub} />
}

/** Renders just the active section — a hard page swap (no scroll transition). */
function SectionRenderer({ section }: { section: SectionDef }) {
  const Comp = section.Comp
  return (
    <div key={section.navId} className="w-full animate-page-enter">
      {section.hasSub ? <StatefulSection Comp={Comp} /> : <Comp />}
    </div>
  )
}

export default function App() {
  const [activeId, setActiveId] = useState(SECTIONS[0].navId)
  const [navOpen, setNavOpen] = useState(false)

  const active = SECTIONS.find((s) => s.navId === activeId) ?? SECTIONS[0]
  const aura = SECTION_AURA[activeId] ?? SECTION_AURA.overview

  // Single source of truth for the active section — shared by tabs + sidebar.
  // No scrolling, no scrollIntoView; the chosen section is rendered directly.
  const select = (navId: string) => {
    setActiveId(navId)
    setNavOpen(false)
  }

  return (
    <FilterProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Lean collapsible left navigation (slim rail + slide-out panel) */}
        <Sidebar
          activeId={activeId}
          open={navOpen}
          onOpen={() => setNavOpen(true)}
          onClose={() => setNavOpen(false)}
          onNavigate={select}
        />

        {/* Main application column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="shrink-0">
            <TopTabBar tabs={TABS} activeId={activeId} onSelect={select} onOpenMenu={() => setNavOpen(true)} />
            <TopFilterBar route={activeId} />
          </header>

          {/* Only this content area scrolls — the shell stays fixed like an app. */}
          <main className="relative min-h-0 flex-1 overflow-y-auto scroll-thin">
            {/* Ambient colour-psychology field — retoned per section so each
                page reads as its own tonal world while staying subtle. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -left-28 top-6 h-72 w-72 rounded-full opacity-[0.06] blur-3xl transition-colors duration-700 ease-out" style={{ backgroundColor: aura.a }} />
              <div className="absolute right-[-7rem] top-1/3 h-80 w-80 rounded-full opacity-[0.05] blur-3xl transition-colors duration-700 ease-out" style={{ backgroundColor: aura.b }} />
              <div className="absolute bottom-[-5rem] left-1/3 h-64 w-72 rounded-full opacity-[0.045] blur-3xl transition-colors duration-700 ease-out" style={{ backgroundColor: aura.c }} />
              <div className="absolute right-1/4 top-2 h-px w-1/3 bg-gradient-to-r from-transparent via-[#B68B3A]/25 to-transparent" />
            </div>

            <div className="relative z-[1] flex min-h-full flex-col px-4 py-5 sm:px-6 lg:px-8">
              <SectionRenderer section={active} />

              <footer className="mt-auto border-t border-soft-border pt-4 text-center text-[11px] text-ink-secondary">
                Insurance Investment Dashboard · Headline figures sourced from company filings &amp; IRDAI disclosures · Some quarterly splits illustrative
              </footer>
            </div>
          </main>
        </div>
      </div>
    </FilterProvider>
  )
}
