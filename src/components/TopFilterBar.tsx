import { ChevronDown } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { useFilters } from '@/state/filters'
import { insurers, DATA_FRESHNESS } from '@/data/mockData'
import type { PeerGroup, TimePeriod } from '@/data/types'

const peerGroups: PeerGroup[] = ['SAHI', 'General', 'Life', 'All']
const periods: TimePeriod[] = ['Monthly', 'Quarterly', 'Annual']

function FieldLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <span
      className="mb-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-ink-secondary"
      title={hint}
    >
      {children}
    </span>
  )
}

export function TopFilterBar({ section }: { section?: string }) {
  const {
    highlightedCompany,
    setHighlightedCompany,
    peerGroup,
    setPeerGroup,
    period,
    setPeriod,
  } = useFilters()
  const isOverview = section === 'overview'

  return (
    <div className="sticky top-0 z-30 px-4 pt-3 sm:px-6">
      {/* Light, integrated control strip — calm and secondary to the content. */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2.5 rounded-xl2 border border-[rgba(23,43,77,0.08)] bg-white/80 px-4 py-2 shadow-soft backdrop-blur-md">
        {/* Company / highlight company — first control on the overview */}
        <label className="block">
          <FieldLabel hint={isOverview ? 'Outlines this company inside the industry visuals' : undefined}>
            {isOverview ? 'Highlight' : 'Company'}
          </FieldLabel>
          <span className="relative block">
            <select
              value={highlightedCompany}
              onChange={(e) => setHighlightedCompany(e.target.value)}
              className="w-full appearance-none rounded-lg border border-soft-border bg-ice py-1.5 pl-3 pr-8 text-[13px] font-semibold text-navy-deep outline-none transition-colors hover:border-muted-blue focus:border-navy-primary"
            >
              {insurers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-secondary" />
          </span>
        </label>

        <div className="hidden h-8 w-px self-end bg-soft-border sm:block" />

        {/* Peer group */}
        <div>
          <FieldLabel hint="Filters which insurers appear in charts and tables">Peer Group</FieldLabel>
          <SegmentedControl<PeerGroup> options={peerGroups} value={peerGroup} onChange={setPeerGroup} size="sm" />
        </div>

        {/* Period */}
        <div>
          <FieldLabel hint="Monthly / quarterly series pending the next IRDAI ingestion run">Period</FieldLabel>
          <SegmentedControl<TimePeriod> options={periods} value={period} onChange={setPeriod} size="sm" />
        </div>

        <div className="ml-auto flex items-end gap-4">
          {/* Dataset — SAHI FY25 headline numbers are from official filings;
              quarterly / monthly series + General / Life carriers still mock. */}
          <div>
            <FieldLabel hint="Hover any source tag for the underlying URL">Dataset</FieldLabel>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-soft px-2.5 py-1.5 text-[12px] font-semibold text-teal ring-1 ring-[#CFE3DA]">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              Official + mock series
            </span>
          </div>

          {/* Updated */}
          <div className="hidden md:block">
            <FieldLabel>Updated</FieldLabel>
            <span className="inline-flex items-center rounded-lg border border-soft-border bg-card px-2.5 py-1.5 text-[12px] font-semibold text-navy-deep">
              {DATA_FRESHNESS.lastUpdated}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
