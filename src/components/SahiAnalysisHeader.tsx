// SAHI Analysis command area — lives in the TOP-RIGHT of the combined header
// band (to the right of the Industry/SAHI switcher blocks). Two compact rows:
//   TOP ROW    — title block (left)        · company + year range (right)
//   BOTTOM ROW — subsection chips (left)   · period control (right)
// There is no separate SAHI block below; the selected content starts directly
// under the header band.

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

/** Tiny inline control label — keeps each control on a single compact line. */
function L({ children }: { children: string }) {
  return <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.07em] text-ink-secondary">{children}</span>
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

  const freqKind = routeFrequencyKind(route)
  const effectiveFreq: TimePeriod | null =
    freqKind === 'operating' ? period : freqKind === 'profitability' ? profitabilityFrequency : null
  const companyOptions = peerGroup === 'All' ? insurers : insurers.filter((c) => c.peerGroup === peerGroup)

  return (
    <div className="rounded-xl border border-[rgba(23,43,77,0.08)] bg-white/75 px-3 py-2 shadow-soft backdrop-blur-sm">
      {/* ── TOP ROW — title (left) · Company + Year range (right) ────────── */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F4ECDB] ring-1 ring-[#E7D8B6]">
            <BarChart3 className="h-[15px] w-[15px]" strokeWidth={2.2} style={{ color: GOLD }} />
          </span>
          <div className="leading-tight">
            <p className="font-display text-[13px] text-navy-deep">SAHI Analysis</p>
            <p className="hidden text-[9.5px] text-ink-secondary md:block">Detailed standalone-health-insurer workspace</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {/* 1 · Company — the primary analysis driver. */}
          <div className="flex items-center gap-1.5">
            <L>Company</L>
            <span className="relative">
              <select
                aria-label="Company"
                value={highlightedCompany}
                onChange={(e) => setHighlightedCompany(e.target.value)}
                className="appearance-none rounded-lg border border-soft-border bg-ice py-1 pl-2.5 pr-7 text-[12px] font-semibold text-navy-deep outline-none transition-all duration-200 hover:border-muted-blue focus:border-navy-primary"
              >
                {companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-secondary" />
            </span>
          </div>

          {/* 2 · Year range — start FY → end FY. */}
          <div className="flex items-center gap-1.5">
            <L>Years</L>
            <DataRangeControl frequency={effectiveFreq} />
          </div>
        </div>
      </div>

      <div className="my-2 h-px bg-[rgba(23,43,77,0.06)]" />

      {/* ── BOTTOM ROW — subsection chips (left) · Period (right) ────────── */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <SectionTabs tabs={tabs} active={activeTab} onSelect={onSelectTab} />

        <div className="flex items-center gap-1.5">
          <L>Period</L>
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-soft-border bg-ice px-3 py-1 text-[11px] font-medium text-ink-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-blue/45" aria-hidden />
              {staticBasisLabel(route)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
