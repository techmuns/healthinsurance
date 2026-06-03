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
  // Section-transition indicator: a soft navy blob naming the section being
  // scrolled toward; fades out once the next section settles.
  const [transit, setTransit] = useState<{ label: string; dir: 1 | -1; visible: boolean }>({ label: '', dir: 1, visible: false })
  const scrollRef = useRef<HTMLElement>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId

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

  // Show the transition blob while scrolling toward the adjacent section.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    let lastY = root.scrollTop
    let ticking = false
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      ticking = false
      const y = root.scrollTop
      const dir: 1 | -1 = y >= lastY ? 1 : -1
      lastY = y
      const activeIdx = SECTIONS.findIndex((s) => s.navId === activeIdRef.current)
      const nextIdx = activeIdx + dir
      if (nextIdx >= 0 && nextIdx < SECTIONS.length) {
        const label = SECTIONS[nextIdx].label
        setTransit((t) => (t.visible && t.label === label && t.dir === dir ? t : { label, dir, visible: true }))
      }
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => setTransit((t) => ({ ...t, visible: false })), 240)
    }
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(update)
      }
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
      clearTimeout(hideTimer)
    }
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

        {/* Section-transition blob — soft navy glow naming the next section */}
        <div
          aria-hidden={!transit.visible}
          className={[
            'pointer-events-none fixed bottom-7 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ease-out',
            transit.visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
          ].join(' ')}
        >
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-gradient-to-br from-[#2A4680] to-[#1B3260] px-4 py-2 text-[12.5px] font-medium text-white shadow-[0_12px_34px_rgba(23,43,77,0.4)] backdrop-blur-md">
            {transit.dir === 1 ? <ArrowDown className="h-3.5 w-3.5 text-champagne" /> : <ArrowUp className="h-3.5 w-3.5 text-champagne" />}
            <span className="text-white/70">{transit.dir === 1 ? 'Next' : 'Back to'}</span>
            <span className="font-semibold">{transit.label}</span>
          </div>
        </div>
      </div>
    </FilterProvider>
  )
}
