import { useState, type ComponentType } from 'react'
import { FilterProvider } from '@/state/filters'
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary'
import { HeaderSwitcher, type TopPage } from '@/components/HeaderSwitcher'
import { SahiAnalysisHeader } from '@/components/SahiAnalysisHeader'
import { type SectionTab } from '@/components/SectionTabs'
import { Sidebar } from '@/components/Sidebar'
import { ExecutiveOverview } from '@/sections/ExecutiveOverview'
import { MarketDistribution } from '@/sections/MarketDistribution'
import { CompetitivePositioning } from '@/sections/CompetitivePositioning'
import { ProfitabilityReview } from '@/sections/ProfitabilityReview'
import { ValuationMarketView } from '@/sections/ValuationMarketView'
import { StreetView } from '@/sections/StreetView'
import { OwnershipGovernance } from '@/sections/OwnershipGovernance'

type SectionProps = { onNavigate?: (id: string) => void; sub?: string }

// ── SAHI Analysis sub-navigation ────────────────────────────────────────────
// The detailed SAHI workspace starts directly at Companies (Overview has moved
// to Industry Insights > Health Industry Insights). Each tab maps to a route
// string that drives the period/basis behaviour in the SAHI header.
const SAHI_TABS: SectionTab[] = [
  { id: 'companies', label: 'Companies' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'profitability', label: 'Profitability' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'street-view', label: 'Street View' },
  { id: 'governance', label: 'Governance' },
]

const SAHI_ROUTE: Record<string, string> = {
  companies: 'peers',
  distribution: 'market-distribution',
  profitability: 'company-performance/profitability',
  valuation: 'company-performance/valuation',
  'street-view': 'street-view',
  governance: 'ownership-governance',
}

// Per-view colour-psychology aura key (reuses the section palette below).
const AURA_KEY: Record<string, string> = {
  companies: 'peers',
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

/**
 * Industry Insights — the broad insight homepage, two stacked layers:
 *   A. Overall Industry View  (macro insurance market)
 *   B. Health Industry Insights  (the SAHI overview, bridging macro → SAHI)
 * No company / year / period controls here — it stays a clean insight layer.
 */
function IndustryInsightsPage() {
  return (
    <div className="space-y-6">
      {/* A · Overall Industry View — hero + market-structure snapshot + pool. */}
      <ExecutiveOverview view="industry" />

      {/* B · Health Industry Insights — high-level SAHI summary + share trend. */}
      <section>
        <div className="mb-4 mt-1 flex items-center gap-2.5 border-t border-soft-border pt-5">
          <span className="h-8 w-[3px] rounded-full bg-gradient-to-b from-champagne to-champagne-deep" />
          <div className="leading-tight">
            <p className="font-display text-[17px] text-navy-deep">Health Industry Insights</p>
            <p className="text-[11.5px] text-ink-secondary">
              How the health insurance &amp; standalone-health-insurer (SAHI) segment is evolving
            </p>
          </div>
        </div>
        <ExecutiveOverview view="sahi" />
      </section>
    </div>
  )
}

/** Renders the active SAHI deep-dive sub-section (no Overview — that has moved). */
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
    case 'companies':
    default:
      return <CompetitivePositioning />
  }
}

export default function App() {
  const [page, setPage] = useState<TopPage>('industry')
  const [sahiTab, setSahiTab] = useState('companies')
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
          <header className="shrink-0 border-b border-[rgba(23,43,77,0.07)] bg-[#FAF9F6]/85 px-3 py-2.5 backdrop-blur-md sm:px-5">
            {/* Combined header band — switcher blocks on the left; the entire
                SAHI command area (title + sub-nav chips + company/year/period)
                in the top-right, shown only when SAHI Analysis is active. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 lg:flex-nowrap">
              <div className="shrink-0">
                <HeaderSwitcher active={page} onSelect={selectPage} />
              </div>
              {page === 'sahi' && (
                <div className="min-w-0 flex-1 animate-fade-soft">
                  <SahiAnalysisHeader
                    tabs={SAHI_TABS}
                    activeTab={sahiTab}
                    onSelectTab={setSahiTab}
                    route={SAHI_ROUTE[sahiTab]}
                  />
                </div>
              )}
            </div>
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
                  {page === 'industry' ? <IndustryInsightsPage /> : <SahiContent tab={sahiTab} />}
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
