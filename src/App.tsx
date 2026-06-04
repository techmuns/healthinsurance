import { useState, type ComponentType } from 'react'
import { FilterProvider } from '@/state/filters'
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary'
import { HeaderSwitcher, type TopPage } from '@/components/HeaderSwitcher'
import { SectionTabs, type SectionTab } from '@/components/SectionTabs'
import { Sidebar } from '@/components/Sidebar'
import { TopFilterBar } from '@/components/TopFilterBar'
import { ExecutiveOverview } from '@/sections/ExecutiveOverview'
import { MarketDistribution } from '@/sections/MarketDistribution'
import { ProfitabilityReview } from '@/sections/ProfitabilityReview'
import { ValuationMarketView } from '@/sections/ValuationMarketView'
import { StreetView } from '@/sections/StreetView'
import { OwnershipGovernance } from '@/sections/OwnershipGovernance'

type SectionProps = { onNavigate?: (id: string) => void; sub?: string }

// ── SAHI Analysis sub-navigation ────────────────────────────────────────────
// The six SAHI deep-dive tabs (compact pills under the SAHI header). Each maps
// to a route string that drives the data row's period/basis behaviour.
const SAHI_TABS: SectionTab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'profitability', label: 'Profitability' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'street-view', label: 'Street View' },
  { id: 'governance', label: 'Governance' },
]

const SAHI_ROUTE: Record<string, string> = {
  overview: 'overview',
  distribution: 'market-distribution',
  profitability: 'company-performance/profitability',
  valuation: 'company-performance/valuation',
  'street-view': 'street-view',
  governance: 'ownership-governance',
}

// Per-view colour-psychology aura key (reuses the section palette below).
const AURA_KEY: Record<string, string> = {
  overview: 'peers',
  distribution: 'market-distribution',
  profitability: 'company-performance',
  valuation: 'company-performance',
  'street-view': 'street-view',
  governance: 'ownership-governance',
}

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

/** Renders the active SAHI deep-dive sub-section. */
function SahiContent({ tab }: { tab: string }) {
  switch (tab) {
    case 'distribution':
      return <MarketDistribution />
    case 'profitability':
      return <ProfitabilityReview />
    case 'valuation':
      return <ValuationMarketView />
    case 'street-view':
      return <StreetView />
    case 'governance':
      return <StatefulSection Comp={OwnershipGovernance} />
    case 'overview':
    default:
      return <ExecutiveOverview view="sahi" />
  }
}

export default function App() {
  const [page, setPage] = useState<TopPage>('industry')
  const [sahiTab, setSahiTab] = useState('overview')
  const [navOpen, setNavOpen] = useState(false)

  const auraKey = page === 'industry' ? 'overview' : AURA_KEY[sahiTab] ?? 'peers'
  const aura = SECTION_AURA[auraKey] ?? SECTION_AURA.overview

  const selectPage = (p: TopPage) => {
    setPage(p)
    setNavOpen(false)
  }
  // Sidebar mirrors the two pages as app-level icon nav.
  const onSidebarNavigate = (id: string) => selectPage(id === 'sahi' ? 'sahi' : 'industry')

  const viewKey = page === 'industry' ? 'industry' : `sahi-${sahiTab}`

  return (
    <FilterProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Lean collapsible left navigation — app-level (the two pages). */}
        <Sidebar
          activeId={page}
          open={navOpen}
          onOpen={() => setNavOpen(true)}
          onClose={() => setNavOpen(false)}
          onNavigate={onSidebarNavigate}
        />

        {/* Main application column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="shrink-0">
            {/* Header switcher blocks — the primary page switch. */}
            <div className="border-b border-[rgba(23,43,77,0.07)] bg-[#FAF9F6]/85 px-3 py-2.5 backdrop-blur-md sm:px-5">
              <HeaderSwitcher active={page} onSelect={selectPage} />
            </div>

            {/* SAHI Analysis workspace controls — compact data row + sub-nav
                pills. Hidden entirely on the clean Industry Insights page. */}
            {page === 'sahi' && (
              <div className="animate-fade-soft">
                <TopFilterBar route={SAHI_ROUTE[sahiTab]} />
                <div className="px-4 pt-2.5 sm:px-6">
                  <SectionTabs tabs={SAHI_TABS} active={sahiTab} onSelect={setSahiTab} />
                </div>
              </div>
            )}
          </header>

          {/* Only this content area scrolls — the shell stays fixed like an app. */}
          <main className="relative min-h-0 flex-1 overflow-y-auto scroll-thin">
            {/* Ambient colour-psychology field — retoned per view. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -left-28 top-6 h-72 w-72 rounded-full opacity-[0.06] blur-3xl transition-colors duration-700 ease-out" style={{ backgroundColor: aura.a }} />
              <div className="absolute right-[-7rem] top-1/3 h-80 w-80 rounded-full opacity-[0.05] blur-3xl transition-colors duration-700 ease-out" style={{ backgroundColor: aura.b }} />
              <div className="absolute bottom-[-5rem] left-1/3 h-64 w-72 rounded-full opacity-[0.045] blur-3xl transition-colors duration-700 ease-out" style={{ backgroundColor: aura.c }} />
              <div className="absolute right-1/4 top-2 h-px w-1/3 bg-gradient-to-r from-transparent via-[#B68B3A]/25 to-transparent" />
            </div>

            <div className="relative z-[1] flex min-h-full flex-col px-4 py-5 sm:px-6 lg:px-8">
              <div key={viewKey} className="w-full animate-page-enter">
                <SectionErrorBoundary
                  resetKey={viewKey}
                  sectionLabel={page === 'industry' ? 'Industry Insights' : 'SAHI Analysis'}
                >
                  {page === 'industry' ? <ExecutiveOverview view="industry" /> : <SahiContent tab={sahiTab} />}
                </SectionErrorBoundary>
              </div>

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
