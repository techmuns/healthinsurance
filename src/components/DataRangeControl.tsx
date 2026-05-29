import { ArrowRight, ChevronDown } from 'lucide-react'
import { useFilters } from '@/state/filters'
import {
  fromOptionValue,
  rangeOptions,
  toOptionValue,
  type RangeOption,
} from '@/lib/dateRange'

/** One styled native <select> — matches the top bar's Company picker exactly. */
function RangeSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string
  options: RangeOption[]
  onChange: (opt: RangeOption) => void
  ariaLabel: string
}) {
  return (
    <span className="relative block">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => {
          const opt = options.find((o) => o.value === e.target.value)
          if (opt) onChange(opt)
        }}
        className="w-full appearance-none rounded-lg border border-soft-border bg-ice py-1.5 pl-2.5 pr-7 text-[13px] font-semibold text-navy-deep outline-none transition-all duration-200 hover:border-muted-blue focus:border-navy-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-secondary" />
    </span>
  )
}

/**
 * Dashboard-wide Data Range selector. Two compact pickers (From → To) whose
 * granularity follows the active Period — FY in Annual, Q·FY in Quarterly,
 * month·year in Monthly. The endpoints are kept ordered (from ≤ to).
 */
export function DataRangeControl() {
  const { period, range, setRange } = useFilters()
  const options = rangeOptions(period)
  const fromValue = fromOptionValue(range.from, period)
  const toValue = toOptionValue(range.to, period)

  const onFrom = (opt: RangeOption) => {
    // Keep ordered: if the new start passes the end, pull the end along with it.
    setRange({ from: opt.fromIdx, to: opt.fromIdx > range.to ? opt.toIdx : range.to })
  }
  const onTo = (opt: RangeOption) => {
    setRange({ from: opt.toIdx < range.from ? opt.fromIdx : range.from, to: opt.toIdx })
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <RangeSelect value={fromValue} options={options} onChange={onFrom} ariaLabel="Data range — from" />
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-secondary" />
      <RangeSelect value={toValue} options={options} onChange={onTo} ariaLabel="Data range — to" />
    </div>
  )
}
