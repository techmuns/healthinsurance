import { useEffect } from 'react'
import { X } from 'lucide-react'
import { OrganicIconBlob } from './OrganicIconBlob'
import { Icon } from './icons'
import { navItems, navGroups } from '@/nav'

/**
 * Secondary navigation drawer — the old grouped sidebar, now opened on demand
 * from the top-bar menu button. It overlays the content (never reserves width)
 * and closes on backdrop click, Esc, or after a selection.
 */
export function NavDrawer({
  open,
  activeId,
  onClose,
  onNavigate,
}: {
  open: boolean
  activeId: string
  onClose: () => void
  onNavigate: (navId: string) => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-navy-deep/25 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Panel */}
      <aside
        className={`absolute left-0 top-0 flex h-full w-[270px] flex-col bg-gradient-to-b from-[#FCFBF8] to-[#F6F4EE] shadow-[0_18px_50px_rgba(23,43,77,0.18)] transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <OrganicIconBlob shape="blob-a" tone="navySoft" size="xs">
              <Icon name="shield" />
            </OrganicIconBlob>
            <div className="leading-tight">
              <p className="font-display text-[12.5px] font-medium leading-tight tracking-tight text-navy-deep">
                Insurance
              </p>
              <p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-champagne-deep/80">
                Investor Dashboard
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-white/70 hover:text-navy-deep"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="mt-1 flex flex-1 flex-col gap-0.5 overflow-y-auto scroll-thin border-t border-[rgba(23,43,77,0.06)] px-2.5 pt-2">
          {navGroups.map((groupItem, gi) => (
            <div key={groupItem.label} className={gi === 0 ? '' : 'mt-2.5'}>
              <p className="mb-1 px-2.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#A8A08D]">
                {groupItem.label}
              </p>
              {groupItem.itemIds.map((id) => {
                const item = navItems.find((n) => n.id === id)
                if (!item) return null
                const isActive = item.id === activeId
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    className={[
                      'group relative flex w-full items-center gap-2.5 rounded-xl py-1 pl-2 pr-3 text-left text-[13px] leading-tight transition-all duration-200',
                      isActive
                        ? 'bg-gradient-to-br from-[#2A4680] to-[#1E3563] font-semibold text-white shadow-[0_6px_16px_rgba(23,43,77,0.14)]'
                        : 'text-[#7B8494] hover:bg-white/70 hover:text-navy-deep',
                    ].join(' ')}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-champagne to-champagne-deep" />
                    )}
                    <OrganicIconBlob shape={isActive ? 'blob-b' : 'blob-d'} tone={isActive ? 'glass' : 'ivory'} size="xs" interactive={!isActive}>
                      <Icon name={item.icon} />
                    </OrganicIconBlob>
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>
    </div>
  )
}
