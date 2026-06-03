import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { OrganicIconBlob } from './OrganicIconBlob'
import { Icon } from './icons'
import { TopFilterBar } from './TopFilterBar'
import { navItems, navGroups } from '@/nav'

export interface DashboardShellProps {
  active: string
  onNavigate: (id: string) => void
  children: ReactNode
}

// Tone-coded dot for each nested lens, so the three accounting lenses read as
// calmly colour-coded (navy = statutory, teal = IFRS, gold = IGAAP) without
// shouting. Keyed on the lens route suffix.
const LENS_DOT: Record<string, string> = {
  statutory: '#27457E',
  ifrs: '#168E8E',
}
const lensDot = (childId: string) => LENS_DOT[childId.split('/')[1] ?? ''] ?? '#168E8E'

export function DashboardShell({ active, onNavigate, children }: DashboardShellProps) {
  // `active` may be a nested lens route ("profitability/ifrs"); the base id
  // ("profitability") drives which top-level item is highlighted and which
  // section's children expand.
  const baseId = active.split('/')[0]
  return (
    <div className="flex min-h-screen bg-transparent">
      {/* Left navigation — floating champagne capsule rail, vertically centered */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 items-center justify-center p-4 lg:flex">
        <div className="flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-y-auto scroll-thin rounded-[30px] border border-[rgba(182,139,58,0.18)] bg-gradient-to-b from-[#F8F3E9] to-[#F4ECDC] px-3 py-5 shadow-[0_18px_45px_rgba(23,43,77,0.08)]">
          {/* Brand — compact lockup */}
          <div className="flex items-center gap-2 px-1.5 pb-3">
            <OrganicIconBlob shape="blob-a" tone="navySoft" size="xs">
              <Icon name="shield" />
            </OrganicIconBlob>
            <div className="leading-tight">
              <p className="font-display text-[12.5px] font-medium leading-tight tracking-tight text-navy-deep">
                Insurance
              </p>
              <p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-champagne-deep">
                Investor Dashboard
              </p>
            </div>
          </div>

          <nav className="mt-2 flex flex-1 flex-col gap-0.5 border-t border-[rgba(182,139,58,0.16)] pt-2.5">
            {navGroups.map((groupItem, gi) => (
              <div key={groupItem.label} className={gi === 0 ? '' : 'mt-2'}>
                <p className="mb-0.5 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-champagne-deep">
                  {groupItem.label}
                </p>
                {groupItem.itemIds.map((id) => {
                  const item = navItems.find((n) => n.id === id)
                  if (!item) return null
                  const isActive = item.id === baseId
                  // Clicking a parent with children opens its default (first) lens
                  // and expands the nested list; otherwise it navigates directly.
                  const target = item.children?.length ? item.children[0].id : item.id
                  const showChildren = !!item.children?.length && isActive
                  return (
                    <div key={item.id}>
                      <button
                        type="button"
                        onClick={() => onNavigate(target)}
                        title={item.question}
                        aria-expanded={item.children?.length ? showChildren : undefined}
                        className={[
                          'group flex w-full items-center gap-2.5 rounded-2xl py-1 pl-1.5 pr-3 text-left text-[13px] leading-tight transition-all duration-200',
                          isActive
                            ? 'border border-white/12 bg-gradient-to-br from-[#2A4680] to-[#1E3563] font-semibold text-white shadow-[0_8px_20px_rgba(23,43,77,0.16)]'
                            : 'border border-transparent text-[#657184] hover:bg-white/55 hover:text-navy-deep',
                        ].join(' ')}
                      >
                        <OrganicIconBlob
                          shape={isActive ? 'blob-b' : 'blob-d'}
                          tone={isActive ? 'invert' : 'navySoft'}
                          size="sm"
                          interactive={!isActive}
                          className={isActive ? '' : 'ring-1 ring-white/80'}
                        >
                          <Icon name={item.icon} />
                        </OrganicIconBlob>
                        <span className="whitespace-nowrap">{item.label}</span>
                        {item.children?.length ? (
                          <ChevronDown
                            className={[
                              'ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200',
                              showChildren ? 'rotate-180' : '',
                              isActive ? 'text-white/70' : 'text-[#9AA6B8]',
                            ].join(' ')}
                          />
                        ) : null}
                      </button>

                      {/* Nested lenses — compact, premium, visually nested under
                          the parent. Only shown while the parent section is active. */}
                      {showChildren && (
                        <div className="animate-fade-in mt-1 flex flex-col gap-0.5 border-l border-[rgba(182,139,58,0.32)] pb-0.5 pl-2 ml-[19px]">
                          {item.children!.map((child) => {
                            const childActive = active === child.id
                            const dot = lensDot(child.id)
                            return (
                              <button
                                key={child.id}
                                type="button"
                                onClick={() => onNavigate(child.id)}
                                title={child.hint}
                                aria-current={childActive ? 'page' : undefined}
                                className={[
                                  'group/child relative flex w-full items-center gap-2 rounded-xl py-1 pl-2.5 pr-2.5 text-left text-[12px] leading-tight transition-all duration-200',
                                  childActive
                                    ? 'bg-white font-semibold text-navy-deep shadow-[0_4px_12px_rgba(23,43,77,0.08)] ring-1 ring-[rgba(39,69,126,0.16)]'
                                    : 'text-[#76808F] hover:bg-white/60 hover:text-navy-deep',
                                ].join(' ')}
                              >
                                {childActive && (
                                  <span aria-hidden className="absolute inset-y-1 left-0 w-[2.5px] rounded-full" style={{ background: dot }} />
                                )}
                                <span
                                  aria-hidden
                                  className="h-1.5 w-1.5 shrink-0 rounded-full transition-all"
                                  style={{ background: childActive ? dot : 'transparent', border: childActive ? 'none' : `1.5px solid ${dot}99` }}
                                />
                                <span className="whitespace-nowrap">{child.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopFilterBar section={baseId} />

        {/* Mobile nav — top-level sections; lens switching on mobile is handled
            by the in-page lens switcher on the Profitability page. */}
        <div className="scroll-thin flex gap-2 overflow-x-auto px-4 pt-3 lg:hidden">
          {navItems.map((item) => {
            const isActive = item.id === baseId
            const target = item.children?.length ? item.children[0].id : item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(target)}
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

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 sm:px-6">
          {/* Keyed on the base section id (not the full lens route) so switching
              lenses updates in place rather than remounting the whole column. */}
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
