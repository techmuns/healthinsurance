// SAHI Analysis hero/header — mirrors the Industry Insights hero (same premium
// rounded container, same ~height, calmer blue-tinted blobs) so switching pages
// causes no width/height jump. One fixed-height card:
//   • title line
//   • TOP ROW   — subsection chips (Companies first; no Overview)
//   • BOTTOM ROW — Company → Years (start→end) → Annual/Quarterly → quarter slot
// The quarter slot is always reserved (fixed footprint), so toggling Annual ↔
// Quarterly never changes the header height or shifts the layout.

import { useState } from 'react'
import { BarChart3, ChevronDown } from 'lucide-react'
import { SectionTabs, type SectionTab } from './SectionTabs'
import { useFilters } from '@/state/filters'
import { insurers } from '@/data/mockData'
import { FY_MAX, FY_MIN, fyEndIdx, fyLabel, fyOfIdx, fyStartIdx, quarterEndIdx, quarterOfIdx } from '@/lib/dateRange'

const GOLD = '#C99736'
const FYS = Array.from({ length: FY_MAX - FY_MIN + 1 }, (_, i) => FY_MIN + i)
const QUARTERS = [1, 2, 3, 4]
const MODES: { label: string; quarterly: boolean }[] = [
  { label: 'Annual', quarterly: false },
  { label: 'Quarterly', quarterly: true },
]

const SELECT_CLS =
  'appearance-none rounded-lg border border-soft-border bg-white/80 py-1 pl-2.5 pr-7 text-[12px] font-semibold text-navy-deep outline-none transition-all duration-200 hover:border-muted-blue focus:border-navy-primary'

function L({ children }: { children: string }) {
  return <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.07em] text-ink-secondary">{children}</span>
}
function Caret() {
  return <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-secondary" />
}
function PillGroup({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex h-[28px] items-center gap-0.5 rounded-full border border-soft-border bg-ice p-0.5">{children}</div>
}
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200',
        active ? 'bg-navy-primary text-white shadow-soft' : 'text-ink-secondary hover:text-navy-primary',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function SahiAnalysisHeader({
  tabs,
  activeTab,
  onSelectTab,
}: {
  tabs: SectionTab[]
  activeTab: string
  onSelectTab: (id: string) => void
}) {
  const { range, setRange, period, setPeriod, setProfitabilityFrequency, highlightedCompany, setHighlightedCompany, peerGroup } =
    useFilters()
  const companyOptions = peerGroup === 'All' ? insurers : insurers.filter((c) => c.peerGroup === peerGroup)

  // Local source-of-truth for the year span + quarter, so flipping Annual ↔
  // Quarterly never loses the chosen years (the global range is the derived span).
  const [startFY, setStartFY] = useState(() => fyOfIdx(range.from))
  const [endFY, setEndFY] = useState(() => fyOfIdx(range.to))
  const [quarter, setQuarter] = useState(() => (period === 'Quarterly' ? quarterOfIdx(range.to) : 4))
  const quarterly = period === 'Quarterly'

  const commit = (s: number, e: number, q: number, qly: boolean) => {
    // Quarterly trims the END to the chosen quarter of the end FY but keeps the
    // full start→end span, so trend charts stay multi-point and the shared range
    // still covers every year (the Industry page never blanks out).
    if (qly) setRange({ from: fyStartIdx(s), to: quarterEndIdx(e, q) })
    else setRange({ from: fyStartIdx(s), to: fyEndIdx(e) })
  }
  const onStart = (fy: number) => {
    const s = Math.min(fy, endFY)
    setStartFY(s)
    commit(s, endFY, quarter, quarterly)
  }
  const onEnd = (fy: number) => {
    const e = Math.max(fy, startFY)
    setEndFY(e)
    commit(startFY, e, quarter, quarterly)
  }
  const setMode = (qly: boolean) => {
    const p = qly ? 'Quarterly' : 'Annual'
    setPeriod(p)
    setProfitabilityFrequency(p)
    commit(startFY, endFY, quarter, qly)
  }
  const onQuarter = (q: number) => {
    setQuarter(q)
    commit(startFY, endFY, q, true)
  }

  return (
    <div className="card-surface relative mb-4 min-h-[170px] overflow-hidden rounded-[28px] px-5 py-5 sm:px-6">
      {/* Calm, blue-tinted ambient backdrop — distinct from the Industry hero. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.6]"
        style={{
          background:
            'radial-gradient(circle at 10% 18%, rgba(224,235,255,0.85) 0%, transparent 52%), radial-gradient(circle at 90% 88%, rgba(244,236,219,0.6) 0%, transparent 55%), radial-gradient(circle at 72% 10%, rgba(218,231,251,0.6) 0%, transparent 46%)',
        }}
      />
      <span aria-hidden className="blob-a pointer-events-none absolute -right-10 -top-10 h-32 w-32 bg-[#6E8BCB]/[0.08]" />
      <span aria-hidden className="blob-c pointer-events-none absolute -bottom-12 left-1/4 h-32 w-36 bg-[#B68B3A]/[0.06]" />

      <div className="relative z-[1] flex min-h-[130px] flex-col justify-between gap-3">
        {/* Title line */}
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F4ECDB] ring-1 ring-[#E7D8B6]">
            <BarChart3 className="h-[15px] w-[15px]" strokeWidth={2.2} style={{ color: GOLD }} />
          </span>
          <div className="leading-tight">
            <p className="font-display text-[15px] text-navy-deep">SAHI Analysis</p>
            <p className="text-[10px] text-ink-secondary">Detailed standalone-health-insurer workspace</p>
          </div>
        </div>

        {/* TOP ROW — subsection chips */}
        <div className="flex flex-wrap items-center gap-2">
          <SectionTabs tabs={tabs} active={activeTab} onSelect={onSelectTab} />
        </div>

        {/* BOTTOM ROW — Company → Years → Annual/Quarterly → reserved quarter slot */}
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <div className="flex items-center gap-1.5">
            <L>Company</L>
            <span className="relative">
              <select
                aria-label="Company"
                value={highlightedCompany}
                onChange={(e) => setHighlightedCompany(e.target.value)}
                className={SELECT_CLS}
              >
                {companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Caret />
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <L>Years</L>
            <span className="relative">
              <select aria-label="Start year" value={startFY} onChange={(e) => onStart(+e.target.value)} className={SELECT_CLS}>
                {FYS.filter((fy) => fy <= endFY).map((fy) => (
                  <option key={fy} value={fy}>
                    {fyLabel(fy)}
                  </option>
                ))}
              </select>
              <Caret />
            </span>
            <span className="text-ink-secondary" aria-hidden>
              →
            </span>
            <span className="relative">
              <select aria-label="End year" value={endFY} onChange={(e) => onEnd(+e.target.value)} className={SELECT_CLS}>
                {FYS.filter((fy) => fy >= startFY).map((fy) => (
                  <option key={fy} value={fy}>
                    {fyLabel(fy)}
                  </option>
                ))}
              </select>
              <Caret />
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <L>Period</L>
            <PillGroup>
              {MODES.map((m) => (
                <Pill key={m.label} active={quarterly === m.quarterly} onClick={() => setMode(m.quarterly)}>
                  {m.label}
                </Pill>
              ))}
            </PillGroup>
          </div>

          {/* Reserved quarter slot — fixed footprint at all times (no jump). */}
          <div className="flex h-[28px] min-w-[212px] items-center gap-1.5">
            {quarterly ? (
              <>
                <L>Quarter</L>
                <PillGroup>
                  {QUARTERS.map((q) => (
                    <Pill key={q} active={quarter === q} onClick={() => onQuarter(q)}>
                      {`Q${q}`}
                    </Pill>
                  ))}
                </PillGroup>
              </>
            ) : (
              <span className="text-[10px] italic text-ink-secondary/45">Switch to Quarterly to pick a quarter</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
