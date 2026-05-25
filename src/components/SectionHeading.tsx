import type { ReactNode } from 'react'

export interface SectionHeadingProps {
  eyebrow: string
  title: string
  note?: string
  right?: ReactNode
}

/** Editorial section header: gold eyebrow + accent bar, strong title, optional note. */
export function SectionHeading({ eyebrow, title, note, right }: SectionHeadingProps) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="h-3 w-[3px] rounded-full bg-champagne" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">{eyebrow}</span>
        </div>
        <div className="flex items-baseline gap-2.5">
          <h2 className="font-display text-[23px] leading-tight text-navy-deep">{title}</h2>
          {note && <span className="text-[11px] text-ink-secondary">{note}</span>}
        </div>
      </div>
      {right}
    </div>
  )
}
