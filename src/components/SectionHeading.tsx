import type { ReactNode } from 'react'
import { OrganicIconBlob } from './OrganicIconBlob'
import { Icon, type IconKey } from './icons'

export interface SectionHeadingProps {
  eyebrow: string
  title: string
  icon?: IconKey
  right?: ReactNode
}

export function SectionHeading({ eyebrow, title, icon, right }: SectionHeadingProps) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {icon && (
          <OrganicIconBlob shape="blob-c" tone="soft" size="sm">
            <Icon name={icon} />
          </OrganicIconBlob>
        )}
        <div className="leading-tight">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-teal">{eyebrow}</p>
          <h2 className="font-display text-lg text-navy-deep">{title}</h2>
        </div>
      </div>
      {right}
    </div>
  )
}
