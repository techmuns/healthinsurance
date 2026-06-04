import { BarChart3, Home, type LucideIcon } from 'lucide-react'

export type TopPage = 'industry' | 'sahi'

// Premium muted gold for the blob icon — brighter on the dark active block for
// contrast, slightly deeper on the light inactive block.
const GOLD_ON_DARK = '#D4A441'
const GOLD_ON_LIGHT = '#C99736'

interface Block {
  id: TopPage
  label: string
  sub: string
  Icon: LucideIcon
}

const BLOCKS: Block[] = [
  { id: 'industry', label: 'Industry Insights', sub: 'Overall industry snapshot', Icon: Home },
  { id: 'sahi', label: 'SAHI Analysis', sub: 'Standalone health deep-dive', Icon: BarChart3 },
]

/**
 * Two large "switcher blocks" that replace the crowded top tab bar. Active block
 * is navy-filled with white text, a soft shadow and a thin gold bottom accent;
 * inactive blocks are light with navy text and a soft blue-grey border. Each
 * carries a compact rounded-square blob with a gold icon on the left.
 */
export function HeaderSwitcher({ active, onSelect }: { active: TopPage; onSelect: (p: TopPage) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      {BLOCKS.map(({ id, label, sub, Icon }) => {
        const on = id === active
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={on ? 'page' : undefined}
            className={[
              'group relative flex items-center gap-2.5 overflow-hidden rounded-xl border px-3 py-2 text-left transition-all duration-200',
              on
                ? 'border-transparent bg-gradient-to-br from-[#1E4079] to-[#143058] text-white shadow-[0_6px_18px_rgba(20,48,88,0.28)]'
                : 'border-[#D7DEEA] bg-white/85 text-navy-deep shadow-soft hover:-translate-y-0.5 hover:border-muted-blue hover:bg-white hover:shadow-card',
            ].join(' ')}
          >
            {/* Icon blob — compact rounded square, gold icon centered. */}
            <span
              className={[
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                on ? 'bg-white/12 ring-1 ring-white/15' : 'bg-[#F4ECDB] ring-1 ring-[#E7D8B6]',
              ].join(' ')}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} style={{ color: on ? GOLD_ON_DARK : GOLD_ON_LIGHT }} />
            </span>

            <span className="leading-tight">
              <span className="block text-[13.5px] font-semibold tracking-tight">{label}</span>
              <span className={['block text-[10px]', on ? 'text-white/65' : 'text-ink-secondary'].join(' ')}>{sub}</span>
            </span>

            {/* Thin gold bottom accent on the active block. */}
            {on && (
              <span
                className="pointer-events-none absolute inset-x-3 bottom-1 h-[2px] rounded-full"
                style={{ background: GOLD_ON_DARK }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
