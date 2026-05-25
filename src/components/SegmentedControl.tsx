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
  /** "dark" adapts the control for the charcoal header bar. */
  tone?: 'light' | 'dark'
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
  tone = 'light',
}: SegmentedControlProps<T>) {
  const opts = normalise(options)
  const dark = tone === 'dark'
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span
          className={[
            'text-[11px] font-semibold uppercase tracking-wide',
            dark ? 'text-white/45' : 'text-ink-secondary',
          ].join(' ')}
        >
          {label}
        </span>
      )}
      <div
        className={[
          'inline-flex items-center gap-0.5 rounded-full p-0.5',
          dark ? 'bg-white/10 ring-1 ring-white/10' : 'border border-soft-border bg-ice',
        ].join(' ')}
      >
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
                  ? dark
                    ? 'bg-royal text-white shadow-soft'
                    : 'bg-navy-primary text-white shadow-soft'
                  : dark
                    ? 'text-white/55 hover:text-white'
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
