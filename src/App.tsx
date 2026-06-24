import { useEffect, useState, type ComponentType } from 'react'
import { Users, Share2, Gauge, Scale, Activity, Landmark, Newspaper, ArrowLeft, type LucideIcon } from 'lucide-react'
import type { AuditFocus, NavTarget } from '@/insights/sourceMap'
import { FilterProvider, useFilters } from '@/state/filters'
import { VerifyProvider } from '@/state/verifyState'
import { DEFAULT_RANGE } from '@/lib/dateRange'
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary'
import { SectionTransition } from '@/components/SectionTransition'
import { DataAuditPane } from '@/components/DataAuditPane'
import { HeaderSwitcher, type TopPage } from '@/components/HeaderSwitcher'
import { SahiAnalysisHeader } from '@/components/SahiAnalysisHeader'
import { PageHeadline, type HeadlineTone } from '@/components/PageHeadline'
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

// The Data Audit tab carries a ~1 MB cell-level index that should only load when
// a reviewer actually opens the QA surface, never on first paint. DataAuditPane
// owns that lazy load (a dynamic import) plus the premium "preparing" progress
// experience, so opening Data Audit is the only place that pulls SheetJS + the
// cell-level model.

type SectionProps = { onNavigate?: (id: string) => void; sub?: string }

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

/** Per-tab premium headline band — the SAHI "headline system". Each tab opens
 *  with a tone-coded title + sharp subtitle so the analysis reads as a guided
 *  story: scoreboard → how they grow → do they profit → what they're worth →
 *  the live market vote → who's behind them → what's coming next. The subtitle
 *  introduces the data; it never restates the numbers below. Colour psychology:
 *  navy = core financial logic, teal = growth engine, gold = valuation/importance. */
interface SahiHead {
  eyebrow: string
  title: string
  subtitle: string
  Icon: LucideIcon
  tone: HeadlineTone
}
const SAHI_HEAD: Record<string, SahiHead> = {
  companies: {
    eyebrow: 'Peer Positioning',
    title: 'The standalone-health scoreboard',
    subtitle: 'Who leads and who lags across the standalone health insurers — before the company-level detail.',
    Icon: Users,
    tone: 'navy',
  },
  distribution: {
    eyebrow: 'Premium & Distribution',
    title: 'How each insurer builds its premium',
    subtitle: 'The retail-versus-group mix and the channel engine behind the rankings.',
    Icon: Share2,
    tone: 'teal',
  },
  profitability: {
    eyebrow: 'Profitability',
    title: 'Does the growth convert to profit?',
    subtitle: 'Whether each insurer’s growth strategy turns into durable, high-quality profitability.',
    Icon: Gauge,
    tone: 'navy',
  },
  valuation: {
    eyebrow: 'Valuation',
    title: 'Is the valuation earned?',
    subtitle: 'Whether the price is supported by growth, profitability and peer positioning.',
    Icon: Scale,
    tone: 'gold',
  },
  'street-view': {
    eyebrow: 'Street View',
    title: 'The live market read',
    subtitle: 'Price, targets and momentum as the market sees them today.',
    Icon: Activity,
    tone: 'gold',
  },
  governance: {
    eyebrow: 'Governance',
    title: 'Who owns and steers these franchises',
    subtitle: 'Ownership, leadership and who has recently been buying or selling.',
    Icon: Landmark,
    tone: 'navy',
  },
  'sector-news': {
    eyebrow: 'Key Sectoral News',
    title: 'Signals shaping the quarters ahead',
    subtitle: 'The regulatory and sector developments moving the health-insurance pool.',
    Icon: Newspaper,
    tone: 'navy',
  },
}

/** Renders the active SAHI deep-dive sub-section (no Overview — that has moved),
 *  each opened by a premium headline band that guides the reader into the data. */
function SahiContent({ tab }: { tab: string }) {
  const head = SAHI_HEAD[tab] ?? SAHI_HEAD.companies
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
      <PageHeadline eyebrow={head.eyebrow} title={head.title} subtitle={head.subtitle} Icon={head.Icon} tone={head.tone} />
      {section()}
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<TopPage>('industry')
  const [sahiTab, setSahiTab] = useState('companies')
  const [navOpen, setNavOpen] = useState(false)
  // Insight → source navigation: the Data-Audit cell to highlight on arrival, the
  // insight to offer "Back to Insight" for, and the insight to re-open (flipped)
  // once we land back on the Insights tab.
  const [auditFocus, setAuditFocus] = useState<AuditFocus | null>(null)
  const [insightReturn, setInsightReturn] = useState<string | null>(null)
  const [reopenInsightId, setReopenInsightId] = useState<string | null>(null)

  const auraKey = page === 'industry' ? 'overview' : page === 'insights' ? 'insights' : page === 'audit' ? 'audit' : AURA_KEY[sahiTab] ?? 'peers'
  const aura = SECTION_AURA[auraKey] ?? SECTION_AURA.overview

  const selectPage = (p: TopPage) => {
    setPage(p)
    setNavOpen(false)
    // A manual page switch cancels the "return to the insight" breadcrumb.
    setInsightReturn(null)
    setAuditFocus(null)
  }

  // Jump from an insight to its source — Data Audit first (the verification
  // layer), the dashboard chart only on fallback. Remembers the insight to return.
  const goToInsightSource = (target: NavTarget, insightId: string) => {
    setInsightReturn(insightId)
    setAuditFocus(target.page === 'audit' ? target.audit ?? null : null)
    setPage(target.page)
    if (target.sahiTab) setSahiTab(target.sahiTab)
    setNavOpen(false)
  }

  // Return to the same insight card the user jumped from, re-flipped to its workings.
  const backToInsight = () => {
    if (insightReturn) setReopenInsightId(insightReturn)
    setInsightReturn(null)
    setAuditFocus(null)
    setPage('insights')
  }
  // Sidebar mirrors the top-level pages as app-level icon nav (ids match TopPage).
  const onSidebarNavigate = (id: string) =>
    selectPage(id === 'sahi' || id === 'audit' || id === 'insights' ? id : 'industry')

  const viewKey = page === 'industry' ? 'industry' : page === 'insights' ? 'insights' : page === 'audit' ? 'audit' : `sahi-${sahiTab}`

  return (
    <FilterProvider>
      {/* Verification state lives at the app level so an uploaded Excel survives
          moving between sections — leaving Data Audit no longer discards it. */}
      <VerifyProvider>
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
              {/* Shared transition wrapper — the header/nav stay fixed while only
                  this inner content area crossfades between views. */}
              <SectionTransition transitionKey={viewKey} className="w-full">
                <SectionErrorBoundary
                  resetKey={viewKey}
                  sectionLabel={page === 'industry' ? 'Industry Insights' : page === 'insights' ? 'Insights' : page === 'audit' ? 'Extracted Data Audit' : 'SAHI Analysis'}
                >
                  {page === 'industry' ? (
                    <IndustryInsightsPage />
                  ) : page === 'insights' ? (
                    <Insights
                      onNavigate={goToInsightSource}
                      reopenInsightId={reopenInsightId}
                      onReopened={() => setReopenInsightId(null)}
                    />
                  ) : page === 'audit' ? (
                    <DataAuditPane focus={auditFocus} />
                  ) : (
                    <SahiContent tab={sahiTab} />
                  )}
                </SectionErrorBoundary>
              </SectionTransition>

              <footer className="mt-auto border-t border-soft-border pt-4 text-center text-[11px] text-ink-secondary">
                Insurance Investment Dashboard · Figures sourced from company filings, IRDAI &amp; GI Council disclosures · AI-gathered items are clearly labelled
              </footer>
            </div>
          </main>
        </div>

        {/* Floating return — shown after jumping from an insight to its source
            (Data Audit or a chart). Brings the reader back to the same insight,
            re-flipped, so studying context is never lost. */}
        {insightReturn && page !== 'insights' && (
          <button
            type="button"
            onClick={backToInsight}
            className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-[#E4CE93] bg-gradient-to-br from-[#1E4079] to-[#143058] px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-[0_10px_30px_rgba(23,43,77,0.28)] transition-transform hover:-translate-y-0.5"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Insight
          </button>
        )}
      </div>
      </VerifyProvider>
    </FilterProvider>
  )
}
