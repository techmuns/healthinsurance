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

        {/* back layers: pale-blue field + mint bands (rising left→right) */}
        <g filter="url(#ribSoft)">
          <path d="M-20 115 C 130 86, 180 40, 320 60 L 320 -10 L -20 -10 Z" fill="url(#ribPaleBlue)" opacity="0.3" />
          <path d="M-20 102 C 95 114, 185 82, 320 100 L 320 66 C 185 50, 95 84, -20 70 Z" fill="url(#ribMint)" opacity="0.52" />
          <path d="M-20 30 C 95 42, 185 16, 320 26 L 320 -10 L -20 -10 Z" fill="url(#ribMint)" opacity="0.26" />
        </g>

        {/* dotted mesh, upper-right, radially faded (kept crisp) */}
        <rect x="175" y="-12" width="150" height="82" fill="url(#ribDots)" mask="url(#ribDotsMask)" opacity="0.32" />

        {/* front layers: blue field, gold ribbon, blue edge, glass sheen */}
        <g filter="url(#ribSoft)">
          <path d="M150 120 C 200 70, 175 24, 228 -20 L 320 -20 L 320 120 Z" fill="url(#ribPaleBlue)" opacity="0.34" />
          <path d="M28 122 C 122 80, 150 38, 212 -22 L 272 -22 C 210 38, 178 80, 90 122 Z" fill="url(#ribGold)" opacity="0.58" />
          <path d="M206 122 C 238 70, 208 26, 254 -22 L 320 -22 L 320 122 Z" fill="url(#ribBlue)" opacity="0.42" />
          <path d="M96 122 C 162 76, 142 28, 198 -22 L 234 -22 C 178 28, 200 76, 134 122 Z" fill="url(#ribGlass)" opacity="0.5" />
        </g>

        {/* satin highlight strokes along ribbon edges */}
        <path d="M92 120 C 152 74, 134 28, 190 -20" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="1.1" fill="none" />
        <path d="M210 120 C 240 68, 212 24, 256 -20" stroke="#FFFFFF" strokeOpacity="0.3" strokeWidth="0.9" fill="none" />

        {/* dissolve the left edge into the white card */}
        <rect x="0" y="0" width="100" height="110" fill="url(#ribLeftFade)" />
      </svg>
    </div>
  )
}
