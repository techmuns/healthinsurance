/**
 * Decorative right-side artwork for the Executive Overview hero — layered
 * translucent petal/ribbon bands (mint, champagne/gold, sky blue) over a faint
 * dotted mesh. Pure presentation: clipped to the card's right corners, sits
 * behind the title/chips. Tune band `d`/`opacity`/gradients to adjust the look.
 */
export function HeaderRibbonArt() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 z-0 w-[42%] overflow-hidden rounded-r-[28px]">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 300 110"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ribMint" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#C7E9DF" />
            <stop offset="100%" stopColor="#E4F4EF" />
          </linearGradient>
          <linearGradient id="ribGold" x1="0" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stopColor="#F1E1B2" />
            <stop offset="100%" stopColor="#E1C77F" />
          </linearGradient>
          <linearGradient id="ribBlue" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#C2D6F0" />
            <stop offset="100%" stopColor="#E4ECF9" />
          </linearGradient>
          <linearGradient id="ribPaleBlue" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D6E2F5" />
            <stop offset="100%" stopColor="#EEF3FC" />
          </linearGradient>
          <linearGradient id="ribGlass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ribLeftFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          <pattern id="ribDots" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.9" fill="#6C82A6" fillOpacity="0.5" />
          </pattern>
          <radialGradient id="ribDotsFade" cx="58%" cy="32%" r="58%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="ribDotsMask">
            <rect x="175" y="-12" width="150" height="82" fill="url(#ribDotsFade)" />
          </mask>
          <filter id="ribSoft" x="-12%" y="-12%" width="124%" height="124%">
            <feGaussianBlur stdDeviation="0.9" />
          </filter>
        </defs>

        {/* back layers: pale-blue field + mint bands */}
        <g filter="url(#ribSoft)">
          <path d="M-20 -5 C 130 24, 180 70, 320 50 L 320 120 L -20 120 Z" fill="url(#ribPaleBlue)" opacity="0.3" />
          <path d="M-20 8 C 95 -4, 185 28, 320 10 L 320 44 C 185 60, 95 26, -20 40 Z" fill="url(#ribMint)" opacity="0.52" />
          <path d="M-20 80 C 95 68, 185 94, 320 84 L 320 120 L -20 120 Z" fill="url(#ribMint)" opacity="0.26" />
        </g>

        {/* dotted mesh, upper-right, radially faded (kept crisp) */}
        <rect x="175" y="-12" width="150" height="82" fill="url(#ribDots)" mask="url(#ribDotsMask)" opacity="0.32" />

        {/* front layers: blue field, gold ribbon, blue edge, glass sheen */}
        <g filter="url(#ribSoft)">
          <path d="M150 -10 C 200 40, 175 86, 228 130 L 320 130 L 320 -10 Z" fill="url(#ribPaleBlue)" opacity="0.34" />
          <path d="M28 -12 C 122 30, 150 72, 212 132 L 272 132 C 210 72, 178 30, 90 -12 Z" fill="url(#ribGold)" opacity="0.58" />
          <path d="M206 -12 C 238 40, 208 84, 254 132 L 320 132 L 320 -12 Z" fill="url(#ribBlue)" opacity="0.42" />
          <path d="M96 -12 C 162 34, 142 82, 198 132 L 234 132 C 178 82, 200 34, 134 -12 Z" fill="url(#ribGlass)" opacity="0.5" />
        </g>

        {/* satin highlight strokes along ribbon edges */}
        <path d="M92 -10 C 152 36, 134 82, 190 130" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="1.1" fill="none" />
        <path d="M210 -10 C 240 42, 212 86, 256 130" stroke="#FFFFFF" strokeOpacity="0.3" strokeWidth="0.9" fill="none" />

        {/* dissolve the left edge into the white card */}
        <rect x="0" y="0" width="100" height="110" fill="url(#ribLeftFade)" />
      </svg>
    </div>
  )
}
