/**
 * Right end-cap artwork for the Executive Overview hero — a sculpted cluster
 * of 5 overlapping translucent petal/blob shapes (ivory, pale blue, muted
 * gold, faint teal) plus two thin contour arcs and a tiny gold accent dot.
 * Pure presentation: anchored to the right ~32% of the card and clipped to
 * the card's right rounded corners; the inner edge fades into white so the
 * title area on the left stays clean and readable.
 */
export function HeaderRibbonArt() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 z-0 w-[34%] overflow-hidden rounded-r-[28px]">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 300 170"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          {/* Petal fills — pale, premium, translucent. */}
          <radialGradient id="petalIvory" cx="60%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#FBF4E4" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#F1E6CC" stopOpacity="0.55" />
          </radialGradient>
          <radialGradient id="petalBlue" cx="45%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#E5EEFB" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#CCDCF1" stopOpacity="0.55" />
          </radialGradient>
          <radialGradient id="petalGold" cx="50%" cy="55%" r="70%">
            <stop offset="0%" stopColor="#EFDDB1" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#D9BE7E" stopOpacity="0.4" />
          </radialGradient>
          <radialGradient id="petalTeal" cx="50%" cy="55%" r="70%">
            <stop offset="0%" stopColor="#D6ECE7" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#B7DCD3" stopOpacity="0.45" />
          </radialGradient>
          <radialGradient id="petalGlass" cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>

          {/* Fade the inner (left) edge of the cluster into the card so the
              left text column stays uncluttered. */}
          <linearGradient id="petalLeftFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
            <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>

          {/* Soft blur for the back petals — keeps the cluster calm. */}
          <filter id="petalSoft" x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
          <filter id="petalSoftLight" x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="0.5" />
          </filter>
        </defs>

        {/* Layer 1 — large pale-ivory petal coming inward from the top-right.
            Asymmetric organic blob, lightly tilted. */}
        <g transform="translate(208 14) rotate(-22)">
          <path
            d="M0 0 C 70 -6 116 38 110 88 C 104 132 56 154 8 144 C -38 134 -64 92 -52 50 C -42 16 -22 4 0 0 Z"
            fill="url(#petalIvory)"
            filter="url(#petalSoft)"
            opacity="0.85"
          />
        </g>

        {/* Layer 2 — soft pale-blue blob sitting behind the status chips
            (mid/lower-right). Larger, lower-opacity. */}
        <g transform="translate(168 86) rotate(8)">
          <path
            d="M0 0 C 56 -10 104 22 102 64 C 100 102 54 118 14 110 C -28 102 -50 70 -42 36 C -34 12 -16 4 0 0 Z"
            fill="url(#petalBlue)"
            filter="url(#petalSoft)"
            opacity="0.78"
          />
        </g>

        {/* Layer 3 — muted gold petal crossing gently behind the chips. Tall,
            tilted, the warm tone in the cluster. */}
        <g transform="translate(196 56) rotate(34)">
          <path
            d="M0 0 C 44 -4 80 30 76 68 C 72 102 40 116 10 110 C -22 104 -42 76 -36 46 C -30 18 -16 4 0 0 Z"
            fill="url(#petalGold)"
            filter="url(#petalSoftLight)"
            opacity="0.68"
          />
        </g>

        {/* Layer 4 — faint teal blob near the lower-right corner. Anchors the
            cluster visually and adds the structural-growth tint. */}
        <g transform="translate(232 122) rotate(-12)">
          <path
            d="M0 0 C 38 -4 64 20 62 50 C 60 78 36 92 10 88 C -16 84 -32 64 -28 40 C -24 16 -12 4 0 0 Z"
            fill="url(#petalTeal)"
            filter="url(#petalSoftLight)"
            opacity="0.7"
          />
        </g>

        {/* Layer 5 — small glass highlight on the top petal, sells the
            translucent-petal feel without adding visual noise. */}
        <g transform="translate(216 22) rotate(-22)">
          <ellipse cx="38" cy="28" rx="32" ry="14" fill="url(#petalGlass)" opacity="0.6" />
        </g>

        {/* Premium contour lines — two thin, low-opacity arcs trace petal
            edges for a sculpted finish. */}
        <path
          d="M150 130 C 178 96 178 56 214 28"
          stroke="#27457E"
          strokeOpacity="0.12"
          strokeWidth="0.9"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M178 152 C 210 122 234 96 260 60"
          stroke="#B68B3A"
          strokeOpacity="0.18"
          strokeWidth="0.7"
          fill="none"
          strokeLinecap="round"
        />

        {/* Tiny champagne accent dot — minimal, premium punctuation. */}
        <circle cx="252" cy="44" r="1.8" fill="#B68B3A" fillOpacity="0.65" />

        {/* Fade the inner edge into the white card. */}
        <rect x="0" y="0" width="140" height="170" fill="url(#petalLeftFade)" />
      </svg>
    </div>
  )
}
