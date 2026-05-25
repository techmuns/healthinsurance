import { ChevronDown } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { useFilters } from '@/state/filters'
import { companies, DATA_FRESHNESS } from '@/data/mockData'
import type { PeerGroup, TimePeriod } from '@/data/types'

const peerGroups: PeerGroup[] = ['SAHI', 'General', 'Life', 'All']
const periods: TimePeriod[] = ['Monthly', 'Quarterly', 'Annual']

function FieldLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <span
      className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45"
      title={hint}
    >
      {children}
    </span>
  )
}

export function TopFilterBar({ section }: { section?: string }) {
  const { companyId, setCompanyId, peerGroup, setPeerGroup, timePeriod, setTimePeriod } = useFilters()
  const isOverview = section === 'overview'

  return (
    <div className="sticky top-0 z-30 px-4 pt-3 sm:px-6">
      {/* Dark charcoal control bar — a Bloomberg-style anchor above the light canvas. */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2.5 rounded-2xl border border-white/5 bg-[#2E3138] px-4 py-2.5 shadow-[0_10px_30px_rgba(23,28,38,0.18)]">
        {/* Scope (overview is industry-wide) */}
        {isOverview && (
          <div>
            <FieldLabel hint="The first page is an industry-wide view">Scope</FieldLabel>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-royal px-3 py-1.5 text-[12px] font-semibold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" />
              Industry Overview
            </span>
          </div>
        )}

        {/* Company / highlight company */}
        <label className="block">
          <FieldLabel hint={isOverview ? 'Outlines this company inside the industry visuals' : undefined}>
            {isOverview ? 'Highlight company' : 'Company'}
          </FieldLabel>
          <span className="relative block">
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full appearance-none rounded-lg border border-white/15 bg-white/10 py-1.5 pl-3 pr-8 text-[13px] font-semibold text-white outline-none transition-colors hover:border-white/30 focus:border-royal [&>option]:text-ink-primary"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/55" />
          </span>
        </label>

        <div className="hidden h-9 w-px self-end bg-white/10 sm:block" />

        {/* Peer group */}
        <div>
          <FieldLabel hint="Compare against selected insurer type">Peer Group</FieldLabel>
          <SegmentedControl<PeerGroup> options={peerGroups} value={peerGroup} onChange={setPeerGroup} size="sm" tone="dark" />
        </div>

        {/* Period */}
        <div>
          <FieldLabel hint="Controls all charts and KPI deltas">Period</FieldLabel>
          <SegmentedControl<TimePeriod> options={periods} value={timePeriod} onChange={setTimePeriod} size="sm" tone="dark" />
        </div>

        <div className="ml-auto flex items-end gap-5">
          {/* Dataset */}
          <div>
            <FieldLabel hint="Source status for visible metrics">Dataset</FieldLabel>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-gold/15 px-2.5 py-1.5 text-[12px] font-semibold text-[#E7BE74] ring-1 ring-gold/25">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {DATA_FRESHNESS.quality}
            </span>
          </div>

          {/* Updated */}
          <div className="hidden md:block">
            <FieldLabel>Updated</FieldLabel>
            <span className="inline-flex items-center rounded-lg border border-white/12 bg-white/5 px-2.5 py-1.5 text-[12px] font-semibold text-white/80">
              {DATA_FRESHNESS.lastUpdated}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
