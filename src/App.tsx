import { useEffect, useRef, useState, type ComponentType } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { FilterProvider } from '@/state/filters'
import { TopTabBar, type TopTab } from '@/components/TopTabBar'
import { NavDrawer } from '@/components/NavDrawer'
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

// The six full-screen notebook pages, in scroll order. `navId` matches the
// nav/route id (so the filter bar stays route-aware); `anchor` is the DOM id.
const SECTIONS: SectionDef[] = [
  { navId: 'overview', anchor: 'executive-overview', label: 'Executive Overview', Comp: ExecutiveOverview },
  { navId: 'market-distribution', anchor: 'market-distribution', label: 'Market & Distribution', Comp: MarketDistribution },
  { navId: 'company-performance', anchor: 'company-performance', label: 'Company Performance', Comp: CompanyPerformance, hasSub: true },
  { navId: 'street-view', anchor: 'street-view', label: 'Street View', Comp: StreetView },
  { navId: 'peers', anchor: 'peer-comparison', label: 'Peer Comparison', Comp: CompetitivePositioning },
  { navId: 'ownership-governance', anchor: 'ownership-governance', label: 'Ownership & Governance', Comp: OwnershipGovernance, hasSub: true },
]

const TABS: TopTab[] = SECTIONS.map(({ navId, anchor, label }) => ({ navId, anchor, label }))

/** Wraps a section that manages internal tabs so its routing stays local
 *  (it no longer drives the global route now that every page is mounted). */
function StatefulSection({ Comp }: { Comp: ComponentType<SectionProps> }) {
  const [sub, setSub] = useState<string | undefined>(undefined)
  const onNavigate = (route: string) => {
    const rest = route.split('/').slice(1).join('/')
    setSub(rest || undefined)
  }
  return <Comp onNavigate={onNavigate} sub={sub} />
}

/** Subtle bottom-right page control — scrolls to the next page (or back to top
 *  on the last one). */
function NextControl({ section, onGo }: { section?: SectionDef; onGo: (navId: string) => void }) {
  if (!section) {
    return (
      <button
        type="button"
        onClick={() => onGo(SECTIONS[0].navId)}
        className="group inline-flex items-center gap-1.5 rounded-full border border-[rgba(23,43,77,0.1)] bg-white/70 px-3 py-1.5 text-[11.5px] font-medium text-ink-secondary shadow-soft backdrop-blur transition-all hover:border-muted-blue hover:text-navy-primary"
      >
        Back to top
        <ArrowUp className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onGo(section.navId)}
      className="group inline-flex items-center gap-1.5 rounded-full border border-[rgba(23,43,77,0.1)] bg-white/70 px-3 py-1.5 text-[11.5px] font-medium text-ink-secondary shadow-soft backdrop-blur transition-all hover:border-muted-blue hover:text-navy-primary"
    >
      <span className="text-ink-secondary/70">Next:</span>
      <span className="font-semibold text-navy-deep">{section.label}</span>
      <ArrowDown className="h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5" />
    </button>
  )
}

export default function App() {
  const [activeId, setActiveId] = useState(SECTIONS[0].navId)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const scrollRef = useRef<HTMLElement>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  // Update the active tab as sections cross the viewport's vertical centre.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const navId = (e.target as HTMLElement).dataset.navid
            if (navId) setActiveId(navId)
          }
        }
      },
      { root, rootMargin: '-48% 0px -48% 0px', threshold: 0 },
    )
    SECTIONS.forEach((s) => {
      const el = sectionRefs.current[s.navId]
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])

  const scrollTo = (navId: string) => {
    sectionRefs.current[navId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const goFromNav = (navId: string) => {
    setDrawerOpen(false)
    scrollTo(navId)
  }

  return (
    <FilterProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        {/* Sticky header: compact notebook tabs + global filter strip */}
        <header className="shrink-0">
          <TopTabBar tabs={TABS} activeId={activeId} onSelect={scrollTo} onOpenMenu={() => setDrawerOpen(true)} />
          <TopFilterBar route={activeId} />
        </header>

        {/* Full-width scroll-snap notebook — each section is a full-screen page */}
        <main
          ref={scrollRef}
          className="relative min-h-0 flex-1 overflow-y-auto scroll-smooth lg:snap-y lg:snap-proximity"
        >
          {SECTIONS.map((s, i) => {
            const Comp = s.Comp
            return (
              <section
                key={s.navId}
                id={s.anchor}
                data-navid={s.navId}
                ref={(el) => (sectionRefs.current[s.navId] = el)}
                className="relative flex min-h-full w-full flex-col px-4 py-5 sm:px-6 lg:px-8 lg:snap-start lg:snap-always"
              >
                <div className="w-full animate-fade-in">
                  {s.hasSub ? <StatefulSection Comp={Comp} /> : <Comp />}
                </div>
                <div className="mt-auto flex justify-end pt-6">
                  <NextControl section={SECTIONS[i + 1]} onGo={scrollTo} />
                </div>
              </section>
            )
          })}

          <footer className="border-t border-soft-border px-6 py-4 text-center text-[11px] text-ink-secondary">
            Insurance Investment Dashboard · Headline figures sourced from company filings &amp; IRDAI disclosures · Some quarterly splits illustrative
          </footer>
        </main>

        {/* Secondary navigation drawer (opened from the menu button) */}
        <NavDrawer open={drawerOpen} activeId={activeId} onClose={() => setDrawerOpen(false)} onNavigate={goFromNav} />
      </div>
    </FilterProvider>
  )
}
