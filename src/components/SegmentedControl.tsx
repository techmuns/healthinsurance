export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[] | readonly T[]
  value: T
  onChange: (value: T) => void
  label?: string
  size?: 'sm' | 'md'
}

function normalise<T extends string>(
  options: SegmentedOption<T>[] | readonly T[],
): SegmentedOption<T>[] {
  return options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  )
}

/** Pill-group toggle used for the in-module Metric / View / Segment / Time controls. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: SegmentedControlProps<T>) {
  const opts = normalise(options)
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">
          {label}
        </span>
      )}
      <div className="inline-flex items-center gap-0.5 rounded-full border border-soft-border bg-ice p-0.5">
        {opts.map((opt) => {
          const active = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={[
                'rounded-full font-medium transition-all duration-200',
                size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs',
                active
                  ? 'bg-navy-primary text-white shadow-soft'
                  : 'text-ink-secondary hover:text-navy-primary',
              ].join(' ')}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
