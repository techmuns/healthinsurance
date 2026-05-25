import { Building2, CalendarRange, CheckCircle2, ChevronDown, Layers } from 'lucide-react'
import { OrganicIconBlob } from './OrganicIconBlob'
import { SegmentedControl } from './SegmentedControl'
import { useFilters } from '@/state/filters'
import { companies, DATA_FRESHNESS } from '@/data/mockData'
import type { PeerGroup, TimePeriod } from '@/data/types'

const peerGroups: PeerGroup[] = ['SAHI', 'General', 'Life', 'All']
const periods: TimePeriod[] = ['Monthly', 'Quarterly', 'Annual']

export function TopFilterBar() {
  const { companyId, setCompanyId, peerGroup, setPeerGroup, timePeriod, setTimePeriod } = useFilters()

  return (
    <div className="sticky top-0 z-30 px-4 pt-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl2 border border-soft-border bg-card/90 px-4 py-3 shadow-bar backdrop-blur-md">
        {/* Company selector */}
        <label className="flex items-center gap-2.5">
          <OrganicIconBlob shape="blob-a" tone="soft" size="sm">
            <Building2 />
          </OrganicIconBlob>
          <span className="relative">
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="appearance-none rounded-full border border-soft-border bg-ice py-1.5 pl-3.5 pr-9 text-sm font-semibold text-navy-deep outline-none transition-colors hover:border-muted-blue focus:border-navy-primary"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-secondary" />
          </span>
        </label>

        <div className="hidden h-7 w-px bg-soft-border sm:block" />

        {/* Peer group */}
        <div className="flex items-center gap-2.5">
          <OrganicIconBlob shape="blob-b" tone="soft" size="sm">
            <Layers />
          </OrganicIconBlob>
          <SegmentedControl<PeerGroup>
            options={peerGroups}
            value={peerGroup}
            onChange={setPeerGroup}
            size="sm"
          />
        </div>

        {/* Time period */}
        <div className="flex items-center gap-2.5">
          <OrganicIconBlob shape="blob-c" tone="soft" size="sm">
            <CalendarRange />
          </OrganicIconBlob>
          <SegmentedControl<TimePeriod>
            options={periods}
            value={timePeriod}
            onChange={setTimePeriod}
            size="sm"
          />
        </div>

        {/* Status + freshness pushed right */}
        <div className="ml-auto flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF3EE] px-3 py-1.5 text-xs font-semibold text-signal-positive ring-1 ring-[#CDE6D7]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {DATA_FRESHNESS.quality}
          </span>
          <span className="hidden text-xs text-ink-secondary md:inline">
            Updated <span className="font-semibold text-navy-primary">{DATA_FRESHNESS.lastUpdated}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
