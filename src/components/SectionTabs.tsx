import { Lock } from 'lucide-react'

export interface SectionTab {
  id: string
  label: string
  /** Shows a lock icon on the tab; the tab is still selectable so the reader can
   *  see the locked overlay inside it. */
  locked?: boolean
}

/**
 * In-page tab bar for the consolidated sections — a calm, gold-underlined pill
 * row. Tabs route the page (the parent owns the active tab); locked tabs carry a
 * lock icon but remain selectable so their pending overlay can be viewed.
 */
export function SectionTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: SectionTab[]
  active: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-soft-border">
      {tabs.map((t) => {
        const on = t.id === active
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            aria-current={on ? 'page' : undefined}
            className={[
              'relative inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold transition-colors',
              on ? 'text-navy-deep' : 'text-ink-secondary hover:text-navy-primary',
            ].join(' ')}
            title={t.locked ? 'Pending data integration' : undefined}
          >
            {t.label}
            {t.locked && <Lock className="h-3 w-3 text-ink-secondary/70" />}
            {on && <span className="absolute inset-x-2.5 -bottom-px h-[2.5px] rounded-full bg-champagne" />}
          </button>
        )
      })}
    </div>
  )
}
