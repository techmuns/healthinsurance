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
    <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-[rgba(23,43,77,0.08)] bg-white/70 p-1 shadow-soft backdrop-blur">
      {tabs.map((t) => {
        const on = t.id === active
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            aria-current={on ? 'page' : undefined}
            className={[
              'relative inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-all duration-normal ease-premium',
              on
                ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white shadow-[0_4px_12px_rgba(23,43,77,0.18)] ring-1 ring-[#B68B3A]/35'
                : 'text-ink-secondary hover:bg-soft-blue hover:text-navy-primary',
            ].join(' ')}
            title={t.locked ? 'Pending data integration' : undefined}
          >
            {on && <span className="h-1.5 w-1.5 rounded-full bg-champagne shadow-[0_0_5px_rgba(182,139,58,0.7)]" />}
            {t.label}
            {t.locked && <Lock className="h-3 w-3 opacity-70" />}
          </button>
        )
      })}
    </div>
  )
}
