import type { ReactNode } from 'react'
import { OrganicIconBlob } from './OrganicIconBlob'
import { Icon } from './icons'
import { TopFilterBar } from './TopFilterBar'
import { navItems, navGroups } from '@/nav'

export interface DashboardShellProps {
  active: string
  onNavigate: (id: string) => void
  children: ReactNode
}

export function DashboardShell({ active, onNavigate, children }: DashboardShellProps) {
  // `active` may be a section/tab route ("company-performance/valuation"); the
  // base id drives which top-level sidebar item is highlighted. Internal tabs
  // are rendered in-page, so the sidebar stays a flat, clean six-item rail.
  const baseId = active.split('/')[0]
  return (
    <div className="flex min-h-screen bg-transparent">
      {/* Left navigation — light warm-ivory capsule rail, vertically centered */}
      <aside className="sticky top-0 hidden h-screen w-[256px] shrink-0 items-center justify-center p-4 lg:flex">
        <div className="flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-y-auto scroll-thin rounded-[26px] border border-[rgba(182,139,58,0.12)] bg-gradient-to-b from-[#FCFBF8] to-[#F6F4EE] px-2.5 py-4 shadow-[0_14px_38px_rgba(23,43,77,0.06)]">
          {/* Brand — compact lockup */}
          <div className="flex items-center gap-2 px-1.5 pb-2">
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

          <nav className="mt-1.5 flex flex-1 flex-col gap-0.5 border-t border-[rgba(23,43,77,0.06)] pt-2">
            {navGroups.map((groupItem, gi) => (
              <div key={groupItem.label} className={gi === 0 ? '' : 'mt-2.5'}>
                <p className="mb-1 px-2.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#A8A08D]">
                  {groupItem.label}
                </p>
                {groupItem.itemIds.map((id) => {
                  const item = navItems.find((n) => n.id === id)
                  if (!item) return null
                  const isActive = item.id === baseId
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      title={item.question}
                      className={[
                        'group relative flex w-full items-center gap-2.5 rounded-xl py-1 pl-2 pr-3 text-left text-[13px] leading-tight transition-all duration-200',
                        isActive
                          ? 'bg-gradient-to-br from-[#2A4680] to-[#1E3563] font-semibold text-white shadow-[0_6px_16px_rgba(23,43,77,0.14)]'
                          : 'text-[#7B8494] hover:bg-white/70 hover:text-navy-deep',
                      ].join(' ')}
                    >
                      {/* Slim gold accent on the active item */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-champagne to-champagne-deep" />
                      )}
                      <OrganicIconBlob
                        shape={isActive ? 'blob-b' : 'blob-d'}
                        tone={isActive ? 'glass' : 'ivory'}
                        size="xs"
                        interactive={!isActive}
                      >
                        <Icon name={item.icon} />
                      </OrganicIconBlob>
                      <span className="whitespace-nowrap">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopFilterBar route={active} />

        {/* Mobile nav — the six top-level sections; internal tabs render in-page. */}
        <div className="scroll-thin flex gap-2 overflow-x-auto px-4 pt-3 lg:hidden">
          {navItems.map((item) => {
            const isActive = item.id === baseId
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={[
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  isActive ? 'bg-navy-primary text-white' : 'bg-card text-ink-secondary ring-1 ring-soft-border',
                ].join(' ')}
              >
                {item.shortLabel}
              </button>
            )
          })}
        </div>

        {/* The Industry Overview is a full-width command surface; every other
            section stays in the calmer centered reading column. */}
        <main
          className={
            baseId === 'overview'
              ? 'w-full min-w-0 flex-1 overflow-x-hidden px-4 py-4 sm:px-6'
              : 'mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 sm:px-6'
          }
        >
          <div key={baseId} className="animate-fade-in">
            {children}
          </div>
        </main>

        <footer className="border-t border-soft-border px-6 py-4 text-center text-[11px] text-ink-secondary">
          Insurance Investment Dashboard · Headline figures sourced from company filings &amp; IRDAI disclosures · Some quarterly splits illustrative
        </footer>
      </div>
    </div>
  )
}
