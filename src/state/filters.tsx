import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Dataset, DashboardFilters, PeerGroup, Scope, TimePeriod } from '@/data/types'
import { insurers, FOCAL_COMPANY, DATA_FRESHNESS } from '@/data/mockData'

interface FilterContextValue extends DashboardFilters {
  setScope: (s: Scope) => void
  setHighlightedCompany: (id: string) => void
  setPeerGroup: (g: PeerGroup) => void
  setPeriod: (t: TimePeriod) => void
  setDataset: (d: Dataset) => void
}

const FilterContext = createContext<FilterContextValue | null>(null)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<Scope>('industry-overview')
  const [highlightedCompany, setHighlightedCompanyState] = useState(FOCAL_COMPANY)
  const [peerGroup, setPeerGroup] = useState<PeerGroup>('SAHI')
  const [period, setPeriod] = useState<TimePeriod>('Annual')
  const [dataset, setDataset] = useState<Dataset>('mock')

  // Highlighting a company snaps the peer group to that company's segment when
  // it would otherwise sit outside the visible pool, so the selection always
  // shows up highlighted in the charts. 'All' already includes every insurer.
  const setHighlightedCompany = useCallback((id: string) => {
    setHighlightedCompanyState(id)
    const company = insurers.find((c) => c.id === id)
    if (company) {
      setPeerGroup((prev) => (prev !== 'All' && prev !== company.peerGroup ? company.peerGroup : prev))
    }
  }, [])

  const value = useMemo(
    () => ({
      scope,
      highlightedCompany,
      peerGroup,
      period,
      dataset,
      updatedAsOf: DATA_FRESHNESS.lastUpdated,
      setScope,
      setHighlightedCompany,
      setPeerGroup,
      setPeriod,
      setDataset,
    }),
    [scope, highlightedCompany, peerGroup, period, dataset, setHighlightedCompany],
  )

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}

export function useFilters() {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilters must be used within FilterProvider')
  return ctx
}

/** The currently highlighted insurer. */
export function useActiveCompany() {
  const { highlightedCompany } = useFilters()
  return insurers.find((c) => c.id === highlightedCompany) ?? insurers[0]
}
