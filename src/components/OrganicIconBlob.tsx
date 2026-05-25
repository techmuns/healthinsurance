import type { ReactNode } from 'react'

type BlobShape = 'blob-a' | 'blob-b' | 'blob-c' | 'blob-d' | 'blob-e'
type BlobTone = 'navy' | 'navySoft' | 'invert' | 'ivory' | 'soft' | 'muted' | 'glass'
type BlobSize = 'xs' | 'sm' | 'md' | 'lg'

const sizeMap: Record<BlobSize, string> = {
  xs: 'h-8 w-8',
  sm: 'h-9 w-9',
  md: 'h-12 w-12',
  lg: 'h-14 w-14',
}

const iconSizeMap: Record<BlobSize, string> = {
  xs: '[&_svg]:h-[15px] [&_svg]:w-[15px]',
  sm: '[&_svg]:h-4 [&_svg]:w-4',
  md: '[&_svg]:h-[22px] [&_svg]:w-[22px]',
  lg: '[&_svg]:h-6 [&_svg]:w-6',
}

const toneMap: Record<BlobTone, string> = {
  navy: 'bg-navy-primary text-white shadow-soft',
  // Softer, layered navy with depth (less flat/bright than solid navy).
  navySoft: 'bg-gradient-to-br from-[#2C4A86] to-[#20366A] text-white shadow-soft',
  // White bubble with a blue icon + blue ring (selected/inverted state).
  invert: 'bg-white text-navy-primary ring-1 ring-navy-primary/30 shadow-soft',
  ivory: 'bg-ivory text-navy-primary ring-1 ring-soft-border',
  soft: 'bg-soft-blue text-navy-primary',
  muted: 'bg-muted-blue text-white shadow-soft',
  // Translucent white icon for use inside a dark/navy capsule.
  glass: 'bg-white/15 text-white ring-1 ring-white/25',
}

export interface OrganicIconBlobProps {
  children: ReactNode
  shape?: BlobShape
  tone?: BlobTone
  size?: BlobSize
  interactive?: boolean
  className?: string
}

/**
 * Premium organic "pebble" icon container used throughout the dashboard.
 * Inactive blobs are ivory with a navy line icon; the active/selected blob is
 * deep navy with a white icon. Shapes are intentionally asymmetric.
 */
export function OrganicIconBlob({
  children,
  shape = 'blob-a',
  tone = 'ivory',
  size = 'md',
  interactive = false,
  className = '',
}: OrganicIconBlobProps) {
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center justify-center transition-all duration-300 ease-out',
        sizeMap[size],
        iconSizeMap[size],
        toneMap[tone],
        shape,
        interactive ? 'hover:-translate-y-0.5 hover:shadow-lift' : '',
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
