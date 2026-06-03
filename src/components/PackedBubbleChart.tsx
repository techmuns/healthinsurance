// Packed "circle dominance" map for the Market Share tab. Circle size = market
// share, so the leader visually dominates at a glance — no axes, no gridlines,
// no scatter. Layout is a deterministic anchor-seeded collision relaxation
// (rank-based anchors → push apart until non-overlapping), so it generalizes to
// any peer group while keeping the leader prominent. The market leader carries a
// gold crown; the selected company gets a navy glow + double ring.

import { useEffect, useMemo, useRef, useState } from 'react'
import { companyColor, FOCAL_COLOR, LEADER_COLOR, type OverviewModel } from '@/lib/industryOverview'

const OTHERS_COLOR = '#D4D9E0'
const H = 340

interface Bubble {
  id: string
  name: string
  share: number
  premium: number | null
  color: string
  textLight: boolean
  focal: boolean
  isLeader: boolean
  rank: number | null
  listedLabel: string
}

interface Placed extends Bubble {
  x: number
  y: number
  r: number
}

// Rank-ordered anchors (normalized) — roughly: leader right, #2 top-left, #3
// left-middle, #4 lower-middle, #5 lower-right, #6 bottom. Beyond six, spiral.
const ANCHORS: [number, number][] = [
  [0.66, 0.42],
  [0.39, 0.27],
  [0.25, 0.55],
  [0.49, 0.73],
  [0.72, 0.64],
  [0.55, 0.9],
]

function anchorFor(i: number): [number, number] {
  if (i < ANCHORS.length) return ANCHORS[i]
  const a = i * 2.4
  return [0.5 + 0.3 * Math.cos(a), 0.5 + 0.3 * Math.sin(a)]
}

function layout(bubbles: Bubble[], W: number): Placed[] {
  if (W <= 0 || bubbles.length === 0) return []
  const sorted = [...bubbles].sort((a, b) => b.share - a.share)
  const maxShare = sorted[0].share || 1
  const maxR = Math.max(30, Math.min(H * 0.3, W * 0.17))

  const placed: Placed[] = sorted.map((b, i) => {
    const r = Math.max(24, maxR * Math.sqrt(Math.max(b.share, 0) / maxShare))
    const [ax, ay] = anchorFor(i)
    return { ...b, r, x: ax * W, y: ay * H }
  })
  const anchorsPx = placed.map((p) => ({ x: p.x, y: p.y }))

  const PAD = 5
  for (let iter = 0; iter < 420; iter++) {
    // Separate overlapping pairs.
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]
        const b = placed[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d = Math.hypot(dx, dy)
        const min = a.r + b.r + PAD
        if (d < min) {
          if (d === 0) {
            dx = (i % 2 === 0 ? 1 : -1)
            dy = (j % 2 === 0 ? 1 : -1)
            d = Math.hypot(dx, dy)
          }
          const push = (min - d) / 2
          const ux = dx / d
          const uy = dy / d
          a.x -= ux * push
          a.y -= uy * push
          b.x += ux * push
          b.y += uy * push
        }
      }
    }
    // Gentle pull back toward each bubble's anchor so the layout keeps its shape.
    for (let i = 0; i < placed.length; i++) {
      placed[i].x += (anchorsPx[i].x - placed[i].x) * 0.035
      placed[i].y += (anchorsPx[i].y - placed[i].y) * 0.035
      // Keep fully inside, leaving headroom up top for the crown.
      placed[i].x = Math.min(Math.max(placed[i].x, placed[i].r + 8), W - placed[i].r - 8)
      placed[i].y = Math.min(Math.max(placed[i].y, placed[i].r + 22), H - placed[i].r - 12)
    }
  }
  return placed
}

function Crown({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${s})`}>
      <path d="M -10 5 L -10 -3 L -5 1.5 L 0 -6 L 5 1.5 L 10 -3 L 10 5 Z" fill={LEADER_COLOR} stroke="#9C7430" strokeWidth={0.7} strokeLinejoin="round" />
      <circle cx={-10} cy={-4} r={1.6} fill={LEADER_COLOR} />
      <circle cx={0} cy={-7.5} r={1.8} fill={LEADER_COLOR} />
      <circle cx={10} cy={-4} r={1.6} fill={LEADER_COLOR} />
    </g>
  )
}

const cr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')} Cr`

export function PackedBubbleChart({ model }: { model: OverviewModel }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(820)
  const [hover, setHover] = useState<string | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const bubbles: Bubble[] = useMemo(() => {
    const list: Bubble[] = model.byShare.map((r, i) => ({
      id: r.id,
      name: r.shortName,
      share: r.share,
      premium: r.premiumAvailable ? r.premium : null,
      color: companyColor(r.id, r.focal, i),
      textLight: true,
      focal: r.focal,
      isLeader: r.isLeader,
      rank: r.shareRank,
      listedLabel: r.listed ? `${r.ticker} · Listed` : 'Unlisted',
    }))
    if (model.others) {
      list.push({
        id: 'others',
        name: 'Others',
        share: model.others.share,
        premium: null,
        color: OTHERS_COLOR,
        textLight: false,
        focal: false,
        isLeader: false,
        rank: null,
        listedLabel: 'Smaller insurers',
      })
    }
    return list
  }, [model])

  const placed = useMemo(() => layout(bubbles, width), [bubbles, width])
  const sig = bubbles.map((b) => b.id).join('|')
  const hovered = placed.find((p) => p.id === hover) ?? null

  return (
    <div className="flex flex-1 flex-col">
      <div ref={ref} className="relative w-full" style={{ height: H }}>
        <svg width={width} height={H} role="img" aria-label="Market share map">
          {placed.map((p) => {
            const nameSize = Math.min(15, Math.max(9.5, p.r * 0.24))
            const shareSize = Math.min(23, Math.max(12, p.r * 0.34))
            const txt = p.textLight ? '#FFFFFF' : '#172B4D'
            const stroke = p.focal ? FOCAL_COLOR : p.isLeader ? LEADER_COLOR : 'rgba(255,255,255,0.7)'
            return (
              <g
                key={p.id}
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* glow */}
                {p.focal && <circle cx={p.x} cy={p.y} r={p.r + 9} fill="rgba(39,69,126,0.14)" />}
                {!p.focal && p.isLeader && <circle cx={p.x} cy={p.y} r={p.r + 8} fill="rgba(182,139,58,0.14)" />}
                {/* double ring for the selected company */}
                {p.focal && <circle cx={p.x} cy={p.y} r={p.r + 4} fill="none" stroke={FOCAL_COLOR} strokeWidth={1.5} strokeOpacity={0.55} />}
                <circle cx={p.x} cy={p.y} r={p.r} fill={p.color} fillOpacity={hover && hover !== p.id ? 0.78 : 0.95} stroke={stroke} strokeWidth={p.focal || p.isLeader ? 2.4 : 1} />
                {p.isLeader && <Crown x={p.x} y={p.y - p.r - 9} s={Math.min(1.5, Math.max(0.95, p.r / 80))} />}
                <text x={p.x} y={p.y - shareSize * 0.18} textAnchor="middle" fontSize={nameSize} fontWeight={600} fill={txt}>
                  {p.name}
                </text>
                <text x={p.x} y={p.y + shareSize * 0.82} textAnchor="middle" fontSize={shareSize} fontWeight={700} fill={txt}>
                  {p.share.toFixed(1)}%
                </text>
              </g>
            )
          })}
        </svg>

        {/* Hover tooltip */}
        {hovered && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-soft-border bg-white/95 px-3 py-2 text-[11.5px] shadow-card backdrop-blur"
            style={{ left: hovered.x, top: hovered.y - hovered.r - 12, minWidth: 150 }}
          >
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-navy-deep">
              <span className="h-2 w-2 rounded-full" style={{ background: hovered.color }} />
              {hovered.name}
              {hovered.isLeader && <span className="text-[9px] font-bold uppercase tracking-wide text-champagne-deep">· leader</span>}
              {hovered.focal && <span className="text-[9px] font-bold uppercase tracking-wide text-navy-primary">· selected</span>}
            </div>
            <div className="tabular-nums text-ink-secondary">
              Market share <span className="font-semibold text-ink-primary">{hovered.share.toFixed(1)}%</span>
              {hovered.rank != null && <span className="text-ink-secondary"> · Rank #{hovered.rank}</span>}
            </div>
            <div className="tabular-nums text-ink-secondary">
              Premium (GWP) <span className="font-semibold text-ink-primary">{hovered.premium != null ? cr(hovered.premium) : 'n/a'}</span>
            </div>
            <div className="text-ink-secondary">{hovered.listedLabel}</div>
          </div>
        )}
      </div>

      {/* Bottom mini cards — colour · company · premium · share */}
      <div key={sig} className="mt-1 flex flex-wrap gap-1.5">
        {bubbles.map((b) => (
          <span
            key={b.id}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10.5px] ${b.focal ? 'border-[#C9D8F2] bg-soft-blue' : 'border-soft-border bg-white/70'}`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: b.color }} />
            <span className={`font-semibold ${b.focal ? 'text-navy-deep' : 'text-ink-primary'}`}>{b.name}</span>
            <span className="text-ink-secondary">· {b.share.toFixed(1)}%</span>
            <span className="text-ink-secondary">· {b.premium != null ? cr(b.premium) : 'n/a'}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
