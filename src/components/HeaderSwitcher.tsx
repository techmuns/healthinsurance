import { BarChart3, Home, ClipboardCheck, type LucideIcon } from 'lucide-react'

export type TopPage = 'industry' | 'sahi' | 'audit'

// Premium muted gold for the blob icon — brighter on the dark active block for
// contrast, slightly deeper on the light inactive block.
const GOLD_ON_DARK = '#D4A441'
const GOLD_ON_LIGHT = '#C99736'

interface Block {
  id: TopPage
  label: string
  Icon: LucideIcon
}

// Compact section nav — short labels keep the left side narrow so the SAHI
// command controls on the right get room to breathe.
const BLOCKS: Block[] = [
  { id: 'industry', label: 'Industry', Icon: Home },
  { id: 'sahi', label: 'SAHI Analysis', Icon: BarChart3 },
  { id: 'audit', label: 'Data Audit', Icon: ClipboardCheck },
]

/**
 * Compact icon-based section tiles. The active tile is navy-filled with white
 * text, a soft shadow and a thin gold bottom accent; inactive tiles are light
 * with navy text and a soft blue-grey border. Smaller than the previous wide
 * cards so the right-side controls are no longer squeezed.
 */
export function HeaderSwitcher({ active, onSelect }: { active: TopPage; onSelect: (p: TopPage) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {BLOCKS.map(({ id, label, Icon }) => {
        const on = id === active
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={on ? 'page' : undefined}
            title={label}
            className={[
              'group relative flex items-center gap-1.5 overflow-hidden rounded-lg border px-2.5 py-1.5 text-left transition-all duration-200',
              on
                ? 'border-transparent bg-gradient-to-br from-[#1E4079] to-[#143058] text-white shadow-[0_4px_14px_rgba(20,48,88,0.26)]'
                : 'border-[#D7DEEA] bg-white/85 text-navy-deep shadow-soft hover:-translate-y-0.5 hover:border-muted-blue hover:bg-white hover:shadow-card',
            ].join(' ')}
          >
            {/* Icon blob — compact rounded square, gold icon centered. */}
            <span
              className={[
                'flex h-7 w-7 shrink-0 items-center justify-center blob-c transition-colors',
                on ? 'bg-white/12 ring-1 ring-white/15' : 'bg-[#F4ECDB] ring-1 ring-[#E7D8B6]',
              ].join(' ')}
            >
              <Icon className="h-[15px] w-[15px]" strokeWidth={2.2} style={{ color: on ? GOLD_ON_DARK : GOLD_ON_LIGHT }} />
            </span>

            <span className="block text-[12.5px] font-semibold tracking-tight">{label}</span>

            {/* Thin gold bottom accent on the active tile. */}
            {on && (
              <span
                className="pointer-events-none absolute inset-x-2.5 bottom-[3px] h-[2px] rounded-full"
                style={{ background: GOLD_ON_DARK }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
