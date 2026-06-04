// SAHI Analysis header — a split control surface that appears only on the SAHI
// Analysis page. Left (~60%): the title + the subsection chips (the SAHI
// internal navigation). Right (~40%): the global SAHI controls in the control
// hierarchy Company → Year Range → Period, in the existing compact chip style.

import { BarChart3, ChevronDown, Lock } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { DataRangeControl } from './DataRangeControl'
import { SectionTabs, type SectionTab } from './SectionTabs'
import { useFilters } from '@/state/filters'
import { insurers } from '@/data/mockData'
import { routeFrequencyKind, staticBasisLabel } from '@/nav'
import type { ProfitabilityFrequency, TimePeriod } from '@/data/types'

const GOLD = '#C99736'
const PROFITABILITY_PERIODS: ProfitabilityFrequency[] = ['Quarterly', 'Annual']

function FieldLabel({ children }: { children: string }) {
  return (
    <span className="mb-1 block text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">{children}</span>
  )
}

// Monthly / Quarterly / Annual — Monthly stays locked until monthly data lands.
function PeriodBlobs({ value, onChange }: { value: TimePeriod; onChange: (t: TimePeriod) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-ice p-0.5">
      {(['Monthly', 'Quarterly', 'Annual'] as TimePeriod[]).map((p) => {
        const locked = p === 'Monthly'
        const active = p === value && !locked
        return (
          <button
            key={p}
            type="button"
            disabled={locked}
            aria-pressed={active}
            onClick={() => !locked && onChange(p)}
            title={locked ? 'Monthly data pending' : undefined}
            className={[
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200',
              locked
                ? 'cursor-not-allowed text-ink-secondary/45'
                : active
                  ? 'bg-navy-primary text-white shadow-soft'
                  : 'text-ink-secondary hover:text-navy-primary',
            ].join(' ')}
          >
            {locked && <Lock className="h-2.5 w-2.5" />}
            {p}
          </button>
        )
      })}
    </div>
  )
}

export function SahiAnalysisHeader({
  tabs,
  activeTab,
  onSelectTab,
  route,
}: {
  tabs: SectionTab[]
  activeTab: string
  onSelectTab: (id: string) => void
  route: string
}) {
  const {
    highlightedCompany,
    setHighlightedCompany,
    peerGroup,
    period,
    setPeriod,
    profitabilityFrequency,
    setProfitabilityFrequency,
  } = useFilters()

  // Period control adapts to the active subsection's reporting cadence.
  const freqKind = routeFrequencyKind(route)
  const effectiveFreq: TimePeriod | null =
    freqKind === 'operating' ? period : freqKind === 'profitability' ? profitabilityFrequency : null
  // The universe is SAHI — the company picker lists the SAHI insurers.
  const companyOptions = peerGroup === 'All' ? insurers : insurers.filter((c) => c.peerGroup === peerGroup)

  return (
    <div className="px-4 pt-2 sm:px-6">
      <div className="rounded-xl2 border border-[rgba(23,43,77,0.08)] bg-white/80 px-3.5 py-3 shadow-soft backdrop-blur-md">
        <div className="grid grid-cols-1 gap-x-5 gap-y-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          {/* ── LEFT — title block + subsection chips ───────────────────── */}
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F4ECDB] ring-1 ring-[#E7D8B6]">
                <BarChart3 className="h-[16px] w-[16px]" strokeWidth={2.2} style={{ color: GOLD }} />
              </span>
              <div className="leading-tight">
                <p className="font-display text-[14px] text-navy-deep">SAHI Analysis</p>
                <p className="text-[10px] text-ink-secondary">Detailed standalone-health-insurer workspace</p>
              </div>
            </div>
            <SectionTabs tabs={tabs} active={activeTab} onSelect={onSelectTab} />
          </div>

          {/* ── RIGHT — Company → Year Range → Period ───────────────────── */}
          <div className="space-y-2.5 lg:border-l lg:border-soft-border lg:pl-5">
            <div className="flex flex-wrap items-end gap-2.5">
              {/* 1 · Company — the primary analysis driver. */}
              <label className="block min-w-0 flex-1">
                <FieldLabel>Company</FieldLabel>
                <span className="relative block">
                  <select
                    value={highlightedCompany}
                    onChange={(e) => setHighlightedCompany(e.target.value)}
                    className="w-full min-w-[150px] appearance-none rounded-lg border border-soft-border bg-ice py-1.5 pl-3 pr-8 text-[12.5px] font-semibold text-navy-deep outline-none transition-all duration-200 hover:border-muted-blue focus:border-navy-primary"
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

              {/* 2 · Year range — start → end FY. */}
              <div className="shrink-0">
                <FieldLabel>Year Range</FieldLabel>
                <DataRangeControl frequency={effectiveFreq} />
              </div>
            </div>

            {/* 3 · Period — adapts to the active subsection's cadence. */}
            <div>
              <FieldLabel>Period</FieldLabel>
              <div className="flex h-[30px] items-center">
                {freqKind === 'operating' ? (
                  <PeriodBlobs value={period} onChange={setPeriod} />
                ) : freqKind === 'profitability' ? (
                  <SegmentedControl<ProfitabilityFrequency>
                    options={PROFITABILITY_PERIODS}
                    value={profitabilityFrequency}
                    onChange={setProfitabilityFrequency}
                    size="sm"
                  />
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-ice px-3 py-1.5 text-[11px] font-medium text-ink-secondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-blue/45" aria-hidden />
                    {staticBasisLabel(route)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
