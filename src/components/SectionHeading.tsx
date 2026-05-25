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
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="h-3 w-[3px] rounded-full bg-champagne" />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-champagne">{eyebrow}</span>
        </div>
        <div className="flex items-baseline gap-2.5">
          <h2 className="font-display text-[19px] text-navy-deep">{title}</h2>
          {note && <span className="text-[11px] text-ink-secondary">{note}</span>}
        </div>
      </div>
      {right}
    </div>
  )
}
