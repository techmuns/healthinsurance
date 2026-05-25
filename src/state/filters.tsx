import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { PeerGroup, TimePeriod } from '@/data/types'
import { companies, FOCAL_COMPANY } from '@/data/mockData'

interface FilterState {
  companyId: string
  peerGroup: PeerGroup
  timePeriod: TimePeriod
  setCompanyId: (id: string) => void
  setPeerGroup: (g: PeerGroup) => void
  setTimePeriod: (t: TimePeriod) => void
}

const FilterContext = createContext<FilterState | null>(null)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyId] = useState(FOCAL_COMPANY)
  const [peerGroup, setPeerGroup] = useState<PeerGroup>('SAHI')
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('Annual')

  const value = useMemo(
    () => ({ companyId, peerGroup, timePeriod, setCompanyId, setPeerGroup, setTimePeriod }),
    [companyId, peerGroup, timePeriod],
  )

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}

export function useFilters() {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilters must be used within FilterProvider')
  return ctx
}

export function useActiveCompany() {
  const { companyId } = useFilters()
  return companies.find((c) => c.id === companyId) ?? companies[0]
}
