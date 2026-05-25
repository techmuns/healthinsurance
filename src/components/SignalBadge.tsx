type BadgeTone = 'positive' | 'warning' | 'negative' | 'neutral' | 'navy'

const toneClass: Record<BadgeTone, string> = {
  positive: 'bg-[#EAF3EE] text-signal-positive ring-1 ring-[#CDE6D7]',
  warning: 'bg-[#FBF3E2] text-signal-warning ring-1 ring-[#F0E1BE]',
  negative: 'bg-[#F8ECEC] text-signal-negative ring-1 ring-[#EBCFCE]',
  neutral: 'bg-ice text-ink-secondary ring-1 ring-soft-border',
  navy: 'bg-soft-blue text-navy-primary ring-1 ring-[#D6E2FA]',
}

// Maps a domain signal word to a visual tone.
const wordTone: Record<string, BadgeTone> = {
  Strong: 'positive',
  Improving: 'positive',
  Safe: 'positive',
  Cheap: 'positive',
  Achieved: 'positive',
  'On Track': 'navy',
  Fair: 'navy',
  Watch: 'warning',
  Delayed: 'warning',
  Weak: 'negative',
  Missed: 'negative',
  Expensive: 'negative',
}

export interface SignalBadgeProps {
  label: string
  tone?: BadgeTone
  size?: 'sm' | 'md'
}

export function SignalBadge({ label, tone, size = 'md' }: SignalBadgeProps) {
  const resolved = tone ?? wordTone[label] ?? 'neutral'
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full font-semibold tracking-tight',
        size === 'sm' ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
        toneClass[resolved],
      ].join(' ')}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  )
}
