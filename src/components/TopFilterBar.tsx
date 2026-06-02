import { ChevronDown } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { DataRangeControl } from './DataRangeControl'
import { useFilters, useActiveCompany } from '@/state/filters'
import { insurers } from '@/data/mockData'
import { resolvePeriodAvailability } from '@/lib/periodData'
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
  const company = useActiveCompany()
  const isOverview = section === 'overview'

  // Company dropdown options are scoped to the current peer group — picking
  // a peer group first narrows the universe, then the user selects a
  // company inside it. "All" shows every insurer.
  const companyOptions = peerGroup === 'All' ? insurers : insurers.filter((c) => c.peerGroup === peerGroup)

  // The header honestly reflects the current selection's data state: whether the
  // selected company has real data at the selected period, and that period's
  // last-updated date. So changing Period/Company is visible in the control bar
  // itself, not only down in the page.
  const availability = resolvePeriodAvailability(company.id, company.shortName, period)

  return (
    <div className="sticky top-0 z-30 px-4 pt-3 sm:px-6">
      {/* Light, integrated control strip — calm and secondary to the content. */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2.5 rounded-xl2 border border-[rgba(23,43,77,0.08)] bg-white/80 px-4 py-2 shadow-soft backdrop-blur-md">
        {/* Peer group — primary lens; drives which companies appear below. */}
        <div>
          <FieldLabel hint="Universe lens — filters which insurers appear in the Company dropdown and across all charts">
            Peer Group
          </FieldLabel>
          <SegmentedControl<PeerGroup> options={peerGroups} value={peerGroup} onChange={setPeerGroup} size="sm" />
        </div>

        <div className="hidden h-8 w-px self-end bg-soft-border sm:block" />

        {/* Company / highlight company — filtered by selected peer group. */}
        <label className="block">
          <FieldLabel hint={isOverview ? 'Outlines this company inside the industry visuals' : 'Choose from the current peer group'}>
            {isOverview ? 'Highlight' : 'Company'}
          </FieldLabel>
          <span className="relative block">
            <select
              value={highlightedCompany}
              onChange={(e) => setHighlightedCompany(e.target.value)}
              className="w-full appearance-none rounded-lg border border-soft-border bg-ice py-1.5 pl-3 pr-8 text-[13px] font-semibold text-navy-deep outline-none transition-all duration-200 hover:border-muted-blue focus:border-navy-primary"
            >
              {companyOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-secondary" />
          </span>
        </label>

        <div className="hidden h-8 w-px self-end bg-soft-border sm:block" />

        {/* Data Range — dashboard-wide active window. Granularity follows the
            Period toggle (FY / quarter / month). Drives every clipped chart. */}
        <div>
          <FieldLabel hint="Active window — every chart, card and table is clipped to this range">
            Data Range
          </FieldLabel>
          <DataRangeControl />
        </div>

        <div className="hidden h-8 w-px self-end bg-soft-border sm:block" />

        {/* Period */}
        <div>
          <FieldLabel hint="Monthly / quarterly series pending the next IRDAI ingestion run">Period</FieldLabel>
          <SegmentedControl<TimePeriod> options={periods} value={period} onChange={setPeriod} size="sm" />
        </div>

        <div className="ml-auto flex items-end gap-4">
          {/* Data status — reflects the SELECTED company + period: "Official"
              when real data exists, or an honest "<Period> pending" otherwise. */}
          <div>
            <FieldLabel hint={availability.available ? 'Every value is real, from official filings — hover any source tag for the URL' : availability.body}>
              Data status
            </FieldLabel>
            {availability.available ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-soft px-2.5 py-1.5 text-[12px] font-semibold text-teal ring-1 ring-[#CFE3DA]">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                Official
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#FBF6EA] px-2.5 py-1.5 text-[12px] font-semibold text-[#8C6B1A] ring-1 ring-[#EAD9B6]">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {period} pending
              </span>
            )}
          </div>

          {/* Updated — the selected period's last-ingestion date (honest per period). */}
          <div className="hidden md:block">
            <FieldLabel>Updated</FieldLabel>
            <span className="inline-flex items-center rounded-lg border border-soft-border bg-card px-2.5 py-1.5 text-[12px] font-semibold text-navy-deep">
              {availability.lastUpdated ?? '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
