import { ArrowRight, ChevronDown } from 'lucide-react'
import { useFilters } from '@/state/filters'
import {
  FY_MIN,
  FY_MAX,
  fyLabel,
  fyOfIdx,
  fyStartIdx,
  fyEndIdx,
  quarterOfIdx,
  quarterStartIdx,
  quarterEndIdx,
  monthIdx,
  monthLabelOf,
} from '@/lib/dateRange'
import type { TimePeriod } from '@/data/types'

// Quarter → fiscal-month span, shown under each year heading.
const QUARTER_SPAN = ['Apr–Jun', 'Jul–Sep', 'Oct–Dec', 'Jan–Mar']
/** Long fiscal-year label for group headings: FY21 → "FY2020-21". */
const fyLong = (fy: number) => `FY${2000 + fy - 1}-${String(fy).padStart(2, '0')}`

const SELECT_CLS =
  'w-full appearance-none rounded-lg border border-soft-border bg-ice py-1.5 pl-2.5 pr-7 text-[13px] font-semibold text-navy-deep outline-none transition-all duration-200 hover:border-muted-blue focus:border-navy-primary'

interface Group {
  fy: number
  options: { value: string; label: string }[]
}

/** A native grouped <select> — quarters/months bucketed under their FY heading. */
function GroupedSelect({
  value,
  groups,
  onChange,
  ariaLabel,
}: {
  value: string
  groups: Group[]
  onChange: (value: string) => void
  ariaLabel: string
}) {
  return (
    <span className="relative block">
      <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} className={SELECT_CLS}>
        {groups.map((g) => (
          <optgroup key={g.fy} label={fyLong(g.fy)}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-secondary" />
    </span>
  )
}

/** A native year <select> for the year-range endpoints. */
function YearSelect({ value, onChange, ariaLabel }: { value: number; onChange: (fy: number) => void; ariaLabel: string }) {
  const years: number[] = []
  for (let fy = FY_MIN; fy <= FY_MAX; fy++) years.push(fy)
  return (
    <span className="relative block">
      <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(Number(e.target.value))} className={SELECT_CLS}>
        {years.map((fy) => (
          <option key={fy} value={fy}>
            {fyLabel(fy)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-secondary" />
    </span>
  )
}

/**
 * Dashboard-wide Data Range selector — a YEAR range that is always shown, plus a
 * QUARTER (or MONTH) sub-selector that only appears when the governing frequency
 * is Quarterly (or Monthly). The quarter/month options are limited to the
 * selected year span and grouped by fiscal year, so the dropdown never lists
 * quarters from years outside the chosen range. Changing the year range resets
 * the sub-selection to "all periods in range", dropping any now-invalid quarters.
 *
 * The single underlying `range` (absolute fiscal-month indices) is unchanged, so
 * every chart's range-clipping keeps working without modification.
 *
 * `frequency` is the frequency that governs the CURRENT section (global for
 * operating sections, the local toggle for Profitability, null elsewhere — which
 * falls back to a plain year range).
 */
export function DataRangeControl({ frequency = 'Annual' }: { frequency?: TimePeriod | null }) {
  const { range, setRange } = useFilters()
  const freq: TimePeriod = frequency ?? 'Annual'
  const yearFrom = fyOfIdx(range.from)
  const yearTo = fyOfIdx(range.to)

  // Year endpoints — changing either resets to the full span of the new years,
  // i.e. "all quarters/months within the selected year range".
  const onYearFrom = (fy: number) => {
    const yf = Math.min(fy, yearTo)
    setRange({ from: fyStartIdx(yf), to: fyEndIdx(yearTo) })
  }
  const onYearTo = (fy: number) => {
    const yt = Math.max(fy, yearFrom)
    setRange({ from: fyStartIdx(yearFrom), to: fyEndIdx(yt) })
  }

  // Quarter / month option groups — only the selected years, grouped by FY.
  const quarterGroups: Group[] = []
  const monthGroups: Group[] = []
  for (let fy = yearFrom; fy <= yearTo; fy++) {
    quarterGroups.push({
      fy,
      options: [1, 2, 3, 4].map((q) => ({ value: `q-${fy}-${q}`, label: `Q${q} · ${QUARTER_SPAN[q - 1]}` })),
    })
    monthGroups.push({
      fy,
      options: Array.from({ length: 12 }, (_, mo) => {
        const idx = monthIdx(fy, mo)
        return { value: `m-${idx}`, label: monthLabelOf(idx) }
      }),
    })
  }

  const qFromVal = `q-${yearFrom}-${quarterOfIdx(range.from)}`
  const qToVal = `q-${yearTo}-${quarterOfIdx(range.to)}`
  const onQFrom = (v: string) => {
    const [, fy, q] = v.split('-').map(Number)
    const s = quarterStartIdx(fy, q)
    setRange({ from: s, to: s > range.to ? quarterEndIdx(fy, q) : range.to })
  }
  const onQTo = (v: string) => {
    const [, fy, q] = v.split('-').map(Number)
    const e = quarterEndIdx(fy, q)
    setRange({ from: e < range.from ? quarterStartIdx(fy, q) : range.from, to: e })
  }

  const mFromVal = `m-${range.from}`
  const mToVal = `m-${range.to}`
  const onMFrom = (v: string) => {
    const idx = Number(v.split('-')[1])
    setRange({ from: idx, to: idx > range.to ? idx : range.to })
  }
  const onMTo = (v: string) => {
    const idx = Number(v.split('-')[1])
    setRange({ from: idx < range.from ? idx : range.from, to: idx })
  }

  const showQuarters = freq === 'Quarterly'
  const showMonths = freq === 'Monthly'

  return (
    <div className="flex flex-col gap-1">
      <div className="inline-flex flex-wrap items-center gap-1.5">
        {/* Year range — always shown. */}
        <YearSelect value={yearFrom} onChange={onYearFrom} ariaLabel="Year range — from" />
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-secondary" />
        <YearSelect value={yearTo} onChange={onYearTo} ariaLabel="Year range — to" />

        {showQuarters && (
          <>
            <span className="mx-0.5 hidden h-5 w-px bg-soft-border sm:block" />
            <GroupedSelect value={qFromVal} groups={quarterGroups} onChange={onQFrom} ariaLabel="Quarter — from" />
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-secondary" />
            <GroupedSelect value={qToVal} groups={quarterGroups} onChange={onQTo} ariaLabel="Quarter — to" />
          </>
        )}
        {showMonths && (
          <>
            <span className="mx-0.5 hidden h-5 w-px bg-soft-border sm:block" />
            <GroupedSelect value={mFromVal} groups={monthGroups} onChange={onMFrom} ariaLabel="Month — from" />
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-secondary" />
            <GroupedSelect value={mToVal} groups={monthGroups} onChange={onMTo} ariaLabel="Month — to" />
          </>
        )}
      </div>
      {(showQuarters || showMonths) && (
        <p className="text-[9.5px] leading-tight text-ink-secondary/80">
          {showQuarters ? 'Quarters shown only for selected years.' : 'Months shown only for selected years.'}
        </p>
      )}
    </div>
  )
}
