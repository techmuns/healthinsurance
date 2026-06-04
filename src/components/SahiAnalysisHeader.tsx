// SAHI Analysis command area — sits in the TOP-RIGHT of the header band, beside
// the Industry/SAHI switcher blocks (not as a card below). Two compact rows that
// fit within the same band height as the Industry header:
//   ROW 1 — subsection chips (Companies first; no Overview)
//   ROW 2 — Company → Year range → Annual/Quarterly → Quarter range
// The quarter-range control is always rendered (faint + disabled in Annual) so
// the layout never shifts when toggling Annual ↔ Quarterly. Quarter selection is
// a true FY+Q range, clamped to the selected year range.

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { type SectionTab } from './SectionTabs'
import { useFilters } from '@/state/filters'
import { insurers } from '@/data/mockData'
import { FY_MAX, FY_MIN, fyEndIdx, fyLabel, fyOfIdx, fyStartIdx, quarterEndIdx, quarterOfIdx, quarterStartIdx } from '@/lib/dateRange'

const FYS = Array.from({ length: FY_MAX - FY_MIN + 1 }, (_, i) => FY_MIN + i)
const ord = (fy: number, q: number) => fy * 4 + q

const SELECT_CLS =
  'appearance-none rounded-lg border border-soft-border bg-white/85 py-0.5 pl-2 pr-6 text-[11.5px] font-semibold text-navy-deep outline-none transition-all duration-200 hover:border-muted-blue focus:border-navy-primary disabled:cursor-not-allowed disabled:opacity-40'

function L({ children }: { children: string }) {
  return <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">{children}</span>
}
function Caret() {
  return <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-secondary" />
}

interface QSel {
  fy: number
  q: number
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
  const quarterly = period === 'Quarterly'

  // Local source-of-truth so flipping Annual ↔ Quarterly keeps the chosen years.
  const [startFY, setStartFY] = useState(() => fyOfIdx(range.from))
  const [endFY, setEndFY] = useState(() => fyOfIdx(range.to))
  const [qs, setQs] = useState<QSel>(() => (quarterly ? { fy: fyOfIdx(range.from), q: quarterOfIdx(range.from) } : { fy: fyOfIdx(range.from), q: 1 }))
  const [qe, setQe] = useState<QSel>(() => (quarterly ? { fy: fyOfIdx(range.to), q: quarterOfIdx(range.to) } : { fy: fyOfIdx(range.to), q: 4 }))

  const applyAnnual = (s: number, e: number) => setRange({ from: fyStartIdx(s), to: fyEndIdx(e) })
  const applyQuarter = (a: QSel, b: QSel) => setRange({ from: quarterStartIdx(a.fy, a.q), to: quarterEndIdx(b.fy, b.q) })

  const onStartFY = (fy: number) => {
    const s = Math.min(fy, endFY)
    const nqs: QSel = { fy: s, q: 1 }
    const nqe: QSel = { fy: endFY, q: 4 } // a year change resets the quarter range to the full new span
    setStartFY(s)
    setQs(nqs)
    setQe(nqe)
    if (quarterly) applyQuarter(nqs, nqe)
    else applyAnnual(s, endFY)
  }
  const onEndFY = (fy: number) => {
    const e = Math.max(fy, startFY)
    const nqs: QSel = { fy: startFY, q: 1 }
    const nqe: QSel = { fy: e, q: 4 }
    setEndFY(e)
    setQs(nqs)
    setQe(nqe)
    if (quarterly) applyQuarter(nqs, nqe)
    else applyAnnual(startFY, e)
  }
  const setMode = (qly: boolean) => {
    setPeriod(qly ? 'Quarterly' : 'Annual')
    setProfitabilityFrequency(qly ? 'Quarterly' : 'Annual')
    if (qly) applyQuarter(qs, qe)
    else applyAnnual(startFY, endFY)
  }
  const onQStart = (v: string) => {
    const [fy, q] = v.split('-').map(Number)
    const nqs: QSel = ord(fy, q) > ord(qe.fy, qe.q) ? { ...qe } : { fy, q }
    setQs(nqs)
    applyQuarter(nqs, qe)
  }
  const onQEnd = (v: string) => {
    const [fy, q] = v.split('-').map(Number)
    const nqe: QSel = ord(fy, q) < ord(qs.fy, qs.q) ? { ...qs } : { fy, q }
    setQe(nqe)
    applyQuarter(qs, nqe)
  }

  // Quarter options span the selected year range only (FYstart Q1 … FYend Q4).
  const quarterOpts: { value: string; label: string }[] = []
  for (let fy = startFY; fy <= endFY; fy++) for (let q = 1; q <= 4; q++) quarterOpts.push({ value: `${fy}-${q}`, label: `FY${fy} Q${q}` })

  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      {/* ROW 1 — subsection chips */}
      <div className="flex flex-wrap items-center gap-1">
        {tabs.map((t) => {
          const on = t.id === activeTab
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTab(t.id)}
              aria-current={on ? 'page' : undefined}
              className={[
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200',
                on
                  ? 'bg-navy-primary text-white shadow-soft'
                  : 'bg-white/70 text-ink-secondary ring-1 ring-soft-border hover:text-navy-primary',
              ].join(' ')}
            >
              {on && <span className="h-1.5 w-1.5 rounded-full bg-champagne shadow-[0_0_5px_rgba(182,139,58,0.7)]" />}
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ROW 2 — Company → Year range → Period → Quarter range (reserved) */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {/* Company */}
        <div className="flex items-center gap-1">
          <L>Co.</L>
          <span className="relative">
            <select aria-label="Company" value={highlightedCompany} onChange={(e) => setHighlightedCompany(e.target.value)} className={SELECT_CLS}>
              {companyOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Caret />
          </span>
        </div>

        {/* Year range */}
        <div className="flex items-center gap-1">
          <L>FY</L>
          <span className="relative">
            <select aria-label="Start year" value={startFY} onChange={(e) => onStartFY(+e.target.value)} className={SELECT_CLS}>
              {FYS.filter((fy) => fy <= endFY).map((fy) => (
                <option key={fy} value={fy}>
                  {fyLabel(fy)}
                </option>
              ))}
            </select>
            <Caret />
          </span>
          <span className="text-[11px] text-ink-secondary" aria-hidden>→</span>
          <span className="relative">
            <select aria-label="End year" value={endFY} onChange={(e) => onEndFY(+e.target.value)} className={SELECT_CLS}>
              {FYS.filter((fy) => fy >= startFY).map((fy) => (
                <option key={fy} value={fy}>
                  {fyLabel(fy)}
                </option>
              ))}
            </select>
            <Caret />
          </span>
        </div>

        {/* Period toggle */}
        <div className="inline-flex h-[26px] items-center gap-0.5 rounded-full border border-soft-border bg-ice p-0.5">
          {[{ label: 'Annual', q: false }, { label: 'Quarterly', q: true }].map((m) => {
            const active = quarterly === m.q
            return (
              <button
                key={m.label}
                type="button"
                onClick={() => setMode(m.q)}
                aria-pressed={active}
                className={[
                  'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all duration-200',
                  active ? 'bg-navy-primary text-white shadow-soft' : 'text-ink-secondary hover:text-navy-primary',
                ].join(' ')}
              >
                {m.label}
              </button>
            )
          })}
        </div>

        {/* Quarter range — always rendered (faint + disabled in Annual) so the
            layout never shifts when toggling. Constrained to the year range. */}
        <div className={`flex items-center gap-1 transition-opacity duration-200 ${quarterly ? '' : 'opacity-40'}`}>
          <L>Qtr</L>
          <span className="relative">
            <select
              aria-label="Start quarter"
              disabled={!quarterly}
              value={`${qs.fy}-${qs.q}`}
              onChange={(e) => onQStart(e.target.value)}
              className={SELECT_CLS}
            >
              {quarterOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Caret />
          </span>
          <span className="text-[11px] text-ink-secondary" aria-hidden>→</span>
          <span className="relative">
            <select
              aria-label="End quarter"
              disabled={!quarterly}
              value={`${qe.fy}-${qe.q}`}
              onChange={(e) => onQEnd(e.target.value)}
              className={SELECT_CLS}
            >
              {quarterOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Caret />
          </span>
        </div>
      </div>
    </div>
  )
}
