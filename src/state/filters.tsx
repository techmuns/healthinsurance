import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Dataset, DashboardFilters, PeerGroup, Scope, TimePeriod } from '@/data/types'
import type { SeriesPoint } from '@/data/types'
import { insurers, FOCAL_COMPANY, DATA_FRESHNESS } from '@/data/mockData'
import { DEFAULT_RANGE, isPeriodLabel, labelInRange, type DateRange } from '@/lib/dateRange'

interface FilterContextValue extends DashboardFilters {
  setScope: (s: Scope) => void
  setHighlightedCompany: (id: string) => void
  setPeerGroup: (g: PeerGroup) => void
  setPeriod: (t: TimePeriod) => void
  setRange: (r: DateRange) => void
  setDataset: (d: Dataset) => void
}

const FilterContext = createContext<FilterContextValue | null>(null)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<Scope>('industry-overview')
  const [highlightedCompany, setHighlightedCompanyState] = useState(FOCAL_COMPANY)
  const [peerGroup, setPeerGroupState] = useState<PeerGroup>('SAHI')
  const [period, setPeriod] = useState<TimePeriod>('Annual')
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE)
  const [dataset, setDataset] = useState<Dataset>('mock')

  // Highlighting a company snaps the peer group to that company's segment when
  // it would otherwise sit outside the visible pool, so the selection always
  // shows up highlighted in the charts. 'All' already includes every insurer.
  const setHighlightedCompany = useCallback((id: string) => {
    setHighlightedCompanyState(id)
    const company = insurers.find((c) => c.id === id)
    if (company) {
      setPeerGroupState((prev) => (prev !== 'All' && prev !== company.peerGroup ? company.peerGroup : prev))
    }
  }, [])

  // Switching peer group is the primary lens: it filters which insurers
  // appear in the Company dropdown and across every chart. If the currently
  // highlighted company is not part of the new group, auto-snap to the first
  // insurer in that group so the dashboard never sits on an "invisible"
  // selection. 'All' keeps the existing highlight.
  const setPeerGroup = useCallback((g: PeerGroup) => {
    setPeerGroupState(g)
    if (g === 'All') return
    setHighlightedCompanyState((prev) => {
      const cur = insurers.find((c) => c.id === prev)
      if (cur && cur.peerGroup === g) return prev
      const fallback = insurers.find((c) => c.peerGroup === g)
      return fallback ? fallback.id : prev
    })
  }, [])

  const value = useMemo(
    () => ({
      scope,
      highlightedCompany,
      peerGroup,
      period,
      range,
      dataset,
      updatedAsOf: DATA_FRESHNESS.lastUpdated,
      setScope,
      setHighlightedCompany,
      setPeerGroup,
      setPeriod,
      setRange,
      setDataset,
    }),
    [scope, highlightedCompany, peerGroup, period, range, dataset, setHighlightedCompany],
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

/**
 * Clip any time-series array to the dashboard-wide range.
 *
 * Rows whose `label` is a recognised period (FY / quarter / month) are kept
 * only when they fall inside the active range; rows with non-period labels
 * (category charts, rankings) are returned untouched. Returns `{ data, clipped,
 * hasPeriodAxis }` so callers can show a "Data not available from source" state
 * when the range excludes every point.
 */
export function useRangeClip<T extends SeriesPoint>(data: T[]): { data: T[]; clipped: boolean; hasPeriodAxis: boolean } {
  const { range } = useFilters()
  return useMemo(() => {
    const hasPeriodAxis = data.some((d) => typeof d.label === 'string' && isPeriodLabel(d.label))
    if (!hasPeriodAxis) return { data, clipped: false, hasPeriodAxis: false }
    const next = data.filter((d) => typeof d.label === 'string' && labelInRange(d.label, range))
    return { data: next, clipped: next.length !== data.length, hasPeriodAxis: true }
  }, [data, range])
}
