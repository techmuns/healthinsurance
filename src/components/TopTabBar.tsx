import { Menu } from 'lucide-react'
import { OrganicIconBlob } from './OrganicIconBlob'
import { Icon } from './icons'

export interface TopTab {
  navId: string
  anchor: string
  label: string
}

/**
 * Compact notebook-style top navigation. Replaces the permanent left sidebar:
 * a small menu button (opens the secondary drawer), a brand mark, then the six
 * section tabs as pills. Active = navy pill + white text + a small gold dot;
 * inactive = quiet light pill. Sticky, horizontally scrollable on narrow widths.
 */
export function TopTabBar({
  tabs,
  activeId,
  onSelect,
  onOpenMenu,
}: {
  tabs: TopTab[]
  activeId: string
  onSelect: (navId: string) => void
  onOpenMenu: () => void
}) {
  return (
    <div className="sticky top-0 z-40 border-b border-[rgba(23,43,77,0.07)] bg-[#FAF9F6]/85 px-3 py-2 backdrop-blur-md sm:px-5">
      <div className="flex items-center gap-2.5">
        {/* Menu → opens the secondary nav drawer */}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(23,43,77,0.08)] bg-white/70 text-navy-deep transition-colors hover:bg-white hover:text-navy-primary"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Brand mark */}
        <div className="hidden shrink-0 items-center gap-2 pr-1 sm:flex">
          <OrganicIconBlob shape="blob-a" tone="navySoft" size="xs">
            <Icon name="shield" />
          </OrganicIconBlob>
          <span className="font-display text-[13px] font-medium leading-none tracking-tight text-navy-deep">
            Insurance
          </span>
        </div>

        <div className="hidden h-7 w-px shrink-0 bg-[rgba(23,43,77,0.08)] sm:block" />

        {/* Section tabs — horizontally scrollable on narrow screens */}
        <nav className="hide-scrollbar -mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1">
          {tabs.map((t) => {
            const active = t.navId === activeId
            return (
              <button
                key={t.navId}
                type="button"
                onClick={() => onSelect(t.navId)}
                aria-current={active ? 'page' : undefined}
                className={[
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-all duration-200',
                  active
                    ? 'bg-gradient-to-br from-navy-primary to-navy-deep text-white shadow-soft'
                    : 'text-ink-secondary hover:bg-white/80 hover:text-navy-primary',
                ].join(' ')}
              >
                {active && (
                  <span className="h-1.5 w-1.5 rounded-full bg-champagne shadow-[0_0_5px_rgba(182,139,58,0.7)]" />
                )}
                <span className="whitespace-nowrap">{t.label}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
