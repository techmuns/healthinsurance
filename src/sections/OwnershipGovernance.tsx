import { SectionTabs, type SectionTab } from '@/components/SectionTabs'
import { LockedPanel } from '@/components/LockedPanel'
import { Ownership } from '@/sections/Ownership'

const TABS: SectionTab[] = [
  { id: 'ownership', label: 'Ownership' },
  { id: 'management', label: 'Management Events', locked: true },
]

/**
 * Ownership & Governance — merges Ownership and Management Events under one
 * section with internal tabs. Ownership stays active; Management Events is locked
 * with a pending overlay (the section/structure is preserved for when the
 * management ingest lands).
 */
export function OwnershipGovernance({ onNavigate, sub }: { onNavigate?: (id: string) => void; sub?: string }) {
  const tab = TABS.find((t) => t.id === sub?.split('/')[0])?.id ?? TABS[0].id
  const go = (id: string) => onNavigate?.(`ownership-governance/${id}`)
  return (
    <div className="space-y-5">
      <SectionTabs tabs={TABS} active={tab} onSelect={go} />
      <div key={tab} className="animate-fade-in">
        {tab === 'ownership' && <Ownership />}
        {tab === 'management' && (
          <LockedPanel
            title="Management Events"
            message="Pending data integration — the event feed, KMP appointments and board changes populate here once the management ingest runs."
            height={360}
          />
        )}
      </div>
    </div>
  )
}
