// Full-width packed-bubble market-share map (Market Share tab ONLY). Circle
// area is proportional to market share, so the biggest player visually
// dominates the cluster and leadership reads in one glance — no axes to parse.
// The market leader gets a champagne ring, the selected company a navy ring +
// soft glow. Premium / Settlement / Renewal / Retention keep the ranking bars.
//
// Layout is a dependency-free, deterministic force-pack (gravity toward centre
// + pairwise collision resolution) computed in a fixed viewBox, then scaled to
// fit and re-centred. No d3 / random, so the cluster renders identically every
// time. Missing-share insurers are omitted (never drawn as a zero bubble).

import { useMemo, useState } from 'react'
import { companyColor, FOCAL_COLOR, LEADER_COLOR, type OverviewModel } from '@/lib/industryOverview'

// ── Fixed design space (the SVG scales responsively to the card width). A
// near-square frame so the cluster fills the half-width Market Share card. ───
const VIEW_W = 560
const VIEW_H = 380
const CX = VIEW_W / 2
const CY = VIEW_H / 2
const MARGIN = 14

interface Bubble {
  id: string
  shortName: string
  color: string
  share: number
  premium: number
  premiumAvailable: boolean
  focal: boolean
  isLeader: boolean
  x: number
  y: number
  r: number
}

// Mix a hex colour toward white by `amt` (0–1) for the radial-gradient core.
function lighten(hex: string, amt: number): string {
  const m = hex.replace('#', '')
  const n = parseInt(m.length === 3 ? m.replace(/./g, (c) => c + c) : m, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const mix = (c: number) => Math.round(c + (255 - c) * amt)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

// Deterministic force-pack: phyllotaxis seed → gravity + collision iterations.
function packBubbles(
  input: Array<Omit<Bubble, 'x' | 'y' | 'r'> & { rawShare: number }>,
): Bubble[] {
  const maxShare = Math.max(...input.map((d) => d.rawShare), 1)
  // Area ∝ share (r ∝ √share), with a floor so tiny players stay legible.
  const rOf = (s: number) => Math.max(26, 96 * Math.sqrt(Math.max(s, 0) / maxShare))

  // Largest first packs tightest; golden-angle spiral gives a stable seed.
  const GOLDEN = 2.399963229728653
  const nodes = [...input]
    .sort((a, b) => b.rawShare - a.rawShare)
    .map((d, i) => ({
      ...d,
      r: rOf(d.rawShare),
      x: CX + Math.sqrt(i) * 34 * Math.cos(i * GOLDEN),
      y: CY + Math.sqrt(i) * 34 * Math.sin(i * GOLDEN),
    }))

  const PAD = 5
  // Near-equal gravity → a rounded cluster that fills the near-square frame.
  const GX = 0.016
  const GY = 0.018
  for (let iter = 0; iter < 320; iter++) {
    for (const n of nodes) {
      n.x += (CX - n.x) * GX
      n.y += (CY - n.y) * GY
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist = Math.hypot(dx, dy)
        const min = a.r + b.r + PAD
        if (dist < min) {
          if (dist === 0) {
            // Identical seed (degenerate) — nudge deterministically.
            dx = 1
            dy = 0
            dist = 1
          }
          const push = (min - dist) / 2
          const ux = (dx / dist) * push
          const uy = (dy / dist) * push
          a.x -= ux
          a.y -= uy
          b.x += ux
          b.y += uy
        }
      }
    }
  }

  // Fit to the viewBox and re-centre the packed cluster.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.r)
    maxX = Math.max(maxX, n.x + n.r)
    minY = Math.min(minY, n.y - n.r)
    maxY = Math.max(maxY, n.y + n.r)
  }
  const bw = maxX - minX || 1
  const bh = maxY - minY || 1
  const scale = Math.min((VIEW_W - 2 * MARGIN) / bw, (VIEW_H - 2 * MARGIN) / bh, 1)
  const bcx = (minX + maxX) / 2
  const bcy = (minY + maxY) / 2
  return nodes.map((n) => ({
    ...n,
    r: n.r * scale,
    x: CX + (n.x - bcx) * scale,
    y: CY + (n.y - bcy) * scale,
  }))
}

export function MarketBubbleChart({ model, height = 360 }: { model: OverviewModel; height?: number }) {
  const [hovered, setHovered] = useState<string | null>(null)

  const bubbles = useMemo(() => {
    const plotted = model.byShare.filter((r) => r.shareAvailable && r.share > 0)
    const colorIdx = new Map(model.byShare.map((r, i) => [r.id, i]))
    return packBubbles(
      plotted.map((r) => ({
        id: r.id,
        shortName: r.shortName,
        color: companyColor(r.id, r.focal, colorIdx.get(r.id) ?? 0),
        share: r.share,
        premium: r.premium,
        premiumAvailable: r.premiumAvailable,
        focal: r.focal,
        isLeader: r.isLeader,
        rawShare: r.share,
      })),
    )
  }, [model.byShare])

  if (bubbles.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-[12px] text-ink-secondary" style={{ height }}>
        Market-share basis not available for this pool
      </div>
    )
  }

  // Draw the hovered bubble last so it (and its tooltip) sit on top.
  const order = [...bubbles].sort((a, b) => (a.id === hovered ? 1 : b.id === hovered ? -1 : 0))

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Market share packed bubble chart">
        <defs>
          {bubbles.map((b) => (
            <radialGradient key={b.id} id={`msb-grad-${b.id}`} cx="38%" cy="34%" r="72%">
              <stop offset="0%" stopColor={lighten(b.color, 0.42)} />
              <stop offset="100%" stopColor={b.color} />
            </radialGradient>
          ))}
        </defs>

        {order.map((b) => {
          const isHot = b.id === hovered
          const ring = b.focal ? FOCAL_COLOR : b.isLeader ? LEADER_COLOR : '#FFFFFF'
          const ringW = b.focal ? 3 : b.isLeader ? 2.6 : 1.4
          const r = isHot ? b.r * 1.035 : b.r
          const showName = r >= 38
          const nameSize = Math.max(10, Math.min(15, r * 0.24))
          const shareSize = Math.max(11, Math.min(21, r * 0.34))
          return (
            <g
              key={b.id}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(b.id)}
              onMouseLeave={() => setHovered((h) => (h === b.id ? null : h))}
            >
              {/* Glow halo for the leader / selected company */}
              {b.focal && <circle cx={b.x} cy={b.y} r={r + 7} fill="rgba(39,69,126,0.10)" />}
              {!b.focal && b.isLeader && <circle cx={b.x} cy={b.y} r={r + 6} fill="rgba(182,139,58,0.12)" />}

              <circle
                cx={b.x}
                cy={b.y}
                r={r}
                fill={`url(#msb-grad-${b.id})`}
                stroke={ring}
                strokeWidth={ringW}
                style={{ transition: 'r 140ms ease' }}
              />

              {/* In-bubble labels: name (large circles) + share %. */}
              {showName && (
                <text
                  x={b.x}
                  y={b.y - r * 0.16}
                  textAnchor="middle"
                  fontSize={nameSize}
                  fontWeight={600}
                  fill="#FFFFFF"
                  style={{ pointerEvents: 'none' }}
                >
                  {b.shortName}
                </text>
              )}
              <text
                x={b.x}
                y={showName ? b.y + r * 0.3 : b.y + shareSize * 0.34}
                textAnchor="middle"
                fontSize={shareSize}
                fontWeight={700}
                fill="#FFFFFF"
                style={{ pointerEvents: 'none' }}
              >
                {b.share.toFixed(1)}%
              </text>
            </g>
          )
        })}

        {/* Hover tooltip (SVG so it scales/positions with the chart) */}
        {hovered &&
          (() => {
            const b = bubbles.find((x) => x.id === hovered)!
            const tw = 168
            const th = 60
            const tx = Math.max(8, Math.min(VIEW_W - tw - 8, b.x - tw / 2))
            const ty = Math.max(8, b.y - b.r - th - 8)
            const prem = b.premiumAvailable ? `₹${Math.round(b.premium).toLocaleString('en-IN')} Cr` : 'n/a'
            return (
              <g style={{ pointerEvents: 'none' }}>
                <rect x={tx} y={ty} width={tw} height={th} rx={10} fill="#FFFFFF" stroke="#E3E8F0" />
                <circle cx={tx + 14} cy={ty + 17} r={4} fill={b.color} />
                <text x={tx + 24} y={ty + 21} fontSize={13} fontWeight={700} fill="#172B4D">
                  {b.shortName}
                  {b.isLeader ? '  · leader' : b.focal ? '  · selected' : ''}
                </text>
                <text x={tx + 14} y={ty + 38} fontSize={11.5} fill="#5A6B85">
                  Market share <tspan fontWeight={700} fill="#172B4D">{b.share.toFixed(1)}%</tspan>
                </text>
                <text x={tx + 14} y={ty + 52} fontSize={11.5} fill="#5A6B85">
                  Premium (GWP) <tspan fontWeight={700} fill="#172B4D">{prem}</tspan>
                </text>
              </g>
            )
          })()}
      </svg>
    </div>
  )
}
