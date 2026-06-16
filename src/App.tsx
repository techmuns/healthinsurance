import { useEffect, useState, lazy, Suspense, type ComponentType } from 'react'
import { UploadCloud } from 'lucide-react'
import { FilterProvider, useFilters } from '@/state/filters'
import { DEFAULT_RANGE } from '@/lib/dateRange'
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary'
import { HeaderSwitcher, type TopPage } from '@/components/HeaderSwitcher'
import { SahiAnalysisHeader } from '@/components/SahiAnalysisHeader'
import { type SectionTab } from '@/components/SectionTabs'
import { Sidebar } from '@/components/Sidebar'
import { MarketTrendExplorer } from '@/components/MarketTrendExplorer'
import { ExecutiveOverview } from '@/sections/ExecutiveOverview'
import { MarketDistribution } from '@/sections/MarketDistribution'
import { CompetitivePositioning } from '@/sections/CompetitivePositioning'
import { ProfitabilityReview } from '@/sections/ProfitabilityReview'
import { ValuationMarketView } from '@/sections/ValuationMarketView'
import { StreetView } from '@/sections/StreetView'
import { OwnershipGovernance } from '@/sections/OwnershipGovernance'
import { SectoralNews } from '@/sections/SectoralNews'
import { Insights } from '@/sections/Insights'
import { SourceUploadDrawer } from '@/components/SourceUploadDrawer'

// Lazy — the audit tab carries a ~1 MB cell-level index that should only load
// when a reviewer actually opens the QA surface, never on first paint.
const ExtractedDataAudit = lazy(() =>
  import('@/sections/ExtractedDataAudit').then((m) => ({ default: m.ExtractedDataAudit })),
)

type SectionProps = { onNavigate?: (id: string) => void; sub?: string }

/**
 * Header affordance to hand the dashboard an official source document. Lean by
 * design — official sources are acquired automatically; this is just the manual
 * "I have a file" option (annual report / disclosure / results / deck).
 */
function SourceUploadButton() {
  const [open, setOpen] = useState(false)
  return (
    <div className="ml-auto shrink-0">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-card px-3 py-1.5 text-[12px] font-medium text-ink-secondary shadow-soft transition-colors hover:border-navy-primary/30 hover:text-navy-primary"
        title="Upload an official document as a source for the dashboard"
      >
        <UploadCloud className="h-3.5 w-3.5" />
        Add source
      </button>
      <SourceUploadDrawer open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

// ── SAHI Analysis sub-navigation ────────────────────────────────────────────
// The detailed SAHI workspace starts directly at Companies (Overview has moved
// to Industry Insights > Health Industry Insights). Each tab maps to a route
// string that drives the period/basis behaviour in the SAHI header.
const SAHI_TABS: SectionTab[] = [
  { id: 'companies', label: 'Companies' },
  { id: 'distribution', label: 'Premium & Distribution' },
  { id: 'profitability', label: 'Profitability' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'street-view', label: 'Street View' },
  { id: 'governance', label: 'Governance' },
  { id: 'sector-news', label: 'Key Sectoral News' },
]

// Per-view colour-psychology aura key (reuses the section palette below).
const AURA_KEY: Record<string, string> = {
  companies: 'peers',
  distribution: 'market-distribution',
  profitability: 'company-performance',
  valuation: 'company-performance',
  'street-view': 'street-view',
  governance: 'ownership-governance',
  'sector-news': 'sector-news',
}

const SECTION_AURA: Record<string, { a: string; b: string; c: string }> = {
  overview: { a: '#27457E', b: '#168E8E', c: '#B68B3A' },
  'market-distribution': { a: '#168E8E', b: '#4F7BCF', c: '#27457E' },
  'company-performance': { a: '#3D5F9F', b: '#168E8E', c: '#B68B3A' },
  'street-view': { a: '#B68B3A', b: '#27457E', c: '#168E8E' },
  peers: { a: '#6E7BD6', b: '#168E8E', c: '#27457E' },
  'ownership-governance': { a: '#27457E', b: '#8C97A8', c: '#B68B3A' },
  // Editorial field for the sector briefing — navy (trust) / gold (editorial) / teal.
  'sector-news': { a: '#27457E', b: '#B68B3A', c: '#168E8E' },
  // Calm, neutral field for the QA surface — navy / slate / muted gold.
  audit: { a: '#27457E', b: '#8C97A8', c: '#B68B3A' },
  // Analytical / editorial field for Insights — gold (edge) / navy / teal.
  insights: { a: '#B68B3A', b: '#27457E', c: '#168E8E' },
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
 *   A. Overall Industry View  (macro insurance market + GI pool shift)
 *   B. SAHI Analysis  (the health drilldown: health-share & premium charts →
 *      the company-specific insurer comparison)
 * No company / year / period controls here — it stays a clean insight layer.
 */
function IndustryInsightsPage() {
  // The Industry page carries no period/range controls, so reset to the annual
  // full-span default on entry — SAHI may have left a quarter/period selection
  // on the shared filters, and the macro charts should read clean annual data.
  const { setPeriod, setRange } = useFilters()
  useEffect(() => {
    setPeriod('Annual')
    setRange(DEFAULT_RANGE)
  }, [setPeriod, setRange])

  return (
    <div className="space-y-6">
      {/* A · Overall Industry View — hero + market-structure snapshot + GI pool. */}
      <ExecutiveOverview />

      {/* B · SAHI Analysis — the health drilldown: the health-share & premium
            workbench. (Insurer-by-insurer peer analysis now lives in
            SAHI Analysis › Peer Positioning.) */}
      <section>
        <div className="mb-4 mt-1 flex items-center gap-2.5 border-t border-soft-border pt-5">
          <span className="h-8 w-[3px] rounded-full bg-gradient-to-b from-champagne to-champagne-deep" />
          <div className="leading-tight">
            <p className="font-display text-[17px] text-navy-deep">SAHI Analysis</p>
            <p className="text-[11.5px] text-ink-secondary">
              Inside health — share &amp; premium trends across the standalone insurers (SAHI)
            </p>
          </div>
        </div>
        <div className="space-y-6">
          <MarketTrendExplorer />
        </div>
      </section>
    </div>
  )
}

/** Narrative hooks — a one-line "chapter" lead-in before each SAHI section so
 *  the analysis reads as a guided story: scoreboard → how they grow → do they
 *  profit → what they're worth → the live market vote → who's behind them →
 *  what's coming next. Copy only; introduces the data, never restates it. */
const SAHI_INTRO: Record<string, string> = {
  companies:
    "Start with the bird's-eye view — who's leading the standalone-health pack and who's slipping — before we zoom into any single name.",
  distribution:
    'Behind every rank sits a growth engine. See how each insurer builds its premium — and whether it leans on sticky retail or scale-heavy group.',
  profitability:
    "Growth is only half the story. Now let's see whether that strategy turns into real profit — or quietly burns through it.",
  valuation:
    'Strong books are one thing; what the market will pay for them is another. This is where the fundamentals meet a price.',
  'street-view':
    'Step onto the street for the live read — how investors are voting on these names right now, in price and momentum.',
  governance:
    "Every number rides on the people behind it. See who owns and steers these franchises — and who's been buying or selling.",
  'sector-news':
    'Finally, the currents shaping what comes next — the regulatory and sector signals set to move the coming quarters.',
}

/** Compact, editorial section lead-in: a champagne accent and one guiding line. */
function SectionIntro({ text }: { text: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="mt-1 h-9 w-[3px] shrink-0 rounded-full bg-gradient-to-b from-champagne to-champagne-deep" />
      <p className="max-w-3xl font-display text-[15px] leading-relaxed text-navy-deep/85">{text}</p>
    </div>
  )
}

/** Renders the active SAHI deep-dive sub-section (no Overview — that has moved),
 *  each opened by a short narrative hook that guides the reader into the data. */
function SahiContent({ tab }: { tab: string }) {
  const section = () => {
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
      case 'sector-news':
        return <SectoralNews />
      case 'companies':
      default:
        return <CompetitivePositioning />
    }
  }
  return (
    <div>
      <SectionIntro text={SAHI_INTRO[tab] ?? SAHI_INTRO.companies} />
      {section()}
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<TopPage>('industry')
  const [sahiTab, setSahiTab] = useState('companies')
  const [navOpen, setNavOpen] = useState(false)

  const auraKey = page === 'industry' ? 'overview' : page === 'insights' ? 'insights' : page === 'audit' ? 'audit' : AURA_KEY[sahiTab] ?? 'peers'
  const aura = SECTION_AURA[auraKey] ?? SECTION_AURA.overview

  const selectPage = (p: TopPage) => {
    setPage(p)
    setNavOpen(false)
  }
  // Sidebar mirrors the top-level pages as app-level icon nav (ids match TopPage).
  const onSidebarNavigate = (id: string) =>
    selectPage(id === 'sahi' || id === 'audit' || id === 'insights' ? id : 'industry')

  const viewKey = page === 'industry' ? 'industry' : page === 'insights' ? 'insights' : page === 'audit' ? 'audit' : `sahi-${sahiTab}`

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
          <header className="shrink-0 border-b border-[rgba(23,43,77,0.07)] bg-[#FAF9F6]/85 px-3 py-2 backdrop-blur-md sm:px-5">
            {/* One header band, ONE shared fixed height (sized for the SAHI
                command bar). Switcher blocks (left) + SAHI command area (right,
                only on SAHI). Industry uses the same height — switcher blocks
                sit vertically centered and airy. Same height ⇒ no content jump. */}
            <div className="flex min-h-[76px] items-center gap-x-4">
              <div className="shrink-0">
                <HeaderSwitcher active={page} onSelect={selectPage} />
              </div>
              {page === 'sahi' && (
                <div className="min-w-0 flex-1 animate-fade-soft">
                  <SahiAnalysisHeader tabs={SAHI_TABS} activeTab={sahiTab} onSelectTab={setSahiTab} />
                </div>
              )}
              <SourceUploadButton />
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
                  sectionLabel={page === 'industry' ? 'Industry Insights' : page === 'insights' ? 'Insights' : page === 'audit' ? 'Extracted Data Audit' : 'SAHI Analysis'}
                >
                  {page === 'industry' ? (
                    <IndustryInsightsPage />
                  ) : page === 'insights' ? (
                    <Insights />
                  ) : page === 'audit' ? (
                    <Suspense fallback={<div className="py-16 text-center text-[12.5px] text-ink-secondary">Loading the audit index…</div>}>
                      <ExtractedDataAudit />
                    </Suspense>
                  ) : (
                    <SahiContent tab={sahiTab} />
                  )}
                </SectionErrorBoundary>
              </div>

              <footer className="mt-auto border-t border-soft-border pt-4 text-center text-[11px] text-ink-secondary">
                Insurance Investment Dashboard · Figures sourced from company filings, IRDAI &amp; GI Council disclosures · AI-gathered items are clearly labelled
              </footer>
            </div>
          </main>
        </div>
      </div>
    </FilterProvider>
  )
}
