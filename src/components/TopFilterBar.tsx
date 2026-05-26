import { ChevronDown } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import type { SegmentedOption } from './SegmentedControl'
import { useFilters } from '@/state/filters'
import { insurers, DATA_FRESHNESS } from '@/data/mockData'
import type { PeerGroup, Scope, TimePeriod } from '@/data/types'

const peerGroups: PeerGroup[] = ['SAHI', 'General', 'Life', 'All']
const periods: TimePeriod[] = ['Monthly', 'Quarterly', 'Annual']
const scopeOptions: SegmentedOption<Scope>[] = [
  { value: 'industry-overview', label: 'Industry' },
  { value: 'company-view', label: 'Company' },
]

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
    scope,
    setScope,
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
        {/* Scope toggle (industry-wide vs company-centric) */}
        {isOverview && (
          <div>
            <FieldLabel hint="Industry compares the field; Company centers the highlighted insurer">Scope</FieldLabel>
            <SegmentedControl<Scope> options={scopeOptions} value={scope} onChange={setScope} size="sm" />
          </div>
        )}

        {/* Company / highlight company */}
        <label className="block">
          <FieldLabel hint={isOverview ? 'Outlines this company inside the industry visuals' : undefined}>
            {scope === 'company-view' || !isOverview ? 'Company' : 'Highlight'}
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
          <FieldLabel hint="Mock dataset is annual-only">Period</FieldLabel>
          <SegmentedControl<TimePeriod> options={periods} value={period} onChange={setPeriod} size="sm" />
        </div>

        <div className="ml-auto flex items-end gap-4">
          {/* Dataset — explicitly mock; live is not connected. */}
          <div>
            <FieldLabel hint="Live data is not connected in this demo">Dataset</FieldLabel>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-gold-soft px-2.5 py-1.5 text-[12px] font-semibold text-gold ring-1 ring-[#F0E1BE]">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              Mock dataset
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
