import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { TrendingUp } from 'lucide-react'
import {
  industrySnapshotCards,
  industrySnapshotSourceLine,
  industrySnapshotSpan,
  type StructureCard,
} from '@/lib/industryStructure'

// ---------------------------------------------------------------------------
//  Industry Snapshot band — three lean ring cards giving the structure of the
//  Indian insurance market in one glance: segment mix, SAHI vs non-SAHI, and
//  PSU vs private.
//
//  PIPELINE-FED (no hardcoded figures): the cards are built by
//  @/lib/industryStructure from the committed snapshots —
//    • GI / health / SAHI — GI Council segment report + health portfolio
//      (swept every 3 days), so those rings advance to a new fiscal year on
//      their own as the source publishes;
//    • Life & the PSU/private total-premium split — the annual IRDAI seed
//      (life-industry-premium.json), refreshed on the December annual cadence.
//  Each ring resolves to the latest fiscal year where ALL its segments are
//  sourced (never mixing years inside one ring) and carries its own FY label.
// ---------------------------------------------------------------------------

interface Seg {
  name: string
  premium: number // ₹ Cr
  share: number // %
  color: string // ring fill
  labelColor: string // readable % label colour (placed just outside the ring)
  yoy?: number | null // YoY change vs prior FY, % (tooltip only)
}

interface RingCard {
  title: string
  subtitle: string
  segments: Seg[]
  insight: string
  // Dominant tint per card (colour-psychology): Market Size = blue,
  // SAHI vs Non-SAHI = teal, PSU vs Private = gold.
  tone: 'blue' | 'teal' | 'gold'
  // Enhanced GI premium-mix donut (card 1 only): a centre total label + an
  // on-hover tooltip with ₹ Cr, share and YoY. Cards 2 & 3 leave these unset
  // and render exactly as before.
  enhanced?: boolean
  centerValue?: string // e.g. "₹3.36L Cr"
  centerCaption?: string // e.g. "FY26 General Insurance"
}

// Ring fills
const TEAL = '#168E8E'
const NAVY = '#27457E'
const GREY = '#AEB6C2'
const GOLD = '#C29A45'

// GI premium-mix palette (card 1): Health pops in vivid teal; every other line
// is a calm, muted premium tone so the eye lands on Health first.
const GI_MIX_PALETTE: { color: string; labelColor: string }[] = [
  { color: TEAL, labelColor: '#0E6F6D' }, // Health (highlight)
  { color: '#6E8FB8', labelColor: '#3D5F9F' }, // Motor
  { color: '#C58A63', labelColor: '#9C5E38' }, // Fire
  { color: '#9FB079', labelColor: '#6E7E4A' }, // Crop
  { color: '#A98BB5', labelColor: '#6F4F7B' }, // Personal Accident
  { color: '#7FA6AC', labelColor: '#4E767C' }, // Marine
  { color: GREY, labelColor: '#535C68' }, // Others
]

// Per-card presentation: title, tone and the segment palette (in the same
// order industryStructure emits the segments).
const CARD_STYLE: Record<
  StructureCard['key'],
  { title: (fy: string) => string; subtitle: string; tone: RingCard['tone']; palette: { color: string; labelColor: string }[] }
> = {
  'segment-mix': {
    title: (fy) => `1. General Insurance Premium Mix (${fy})`,
    subtitle: 'Total Premium (₹ Cr) and Market Share (%)',
    tone: 'blue',
    palette: GI_MIX_PALETTE,
  },
  'sahi-split': {
    title: (fy) => `2. SAHI vs Non-SAHI (Health Insurance) (${fy})`,
    subtitle: 'Total Premium (₹ Cr) and Share (%)',
    tone: 'teal',
    palette: [
      { color: GREY, labelColor: '#535C68' },
      { color: TEAL, labelColor: '#0E6F6D' },
    ],
  },
  'psu-private': {
    title: (fy) => `3. PSU vs Private (Total Insurance) (${fy})`,
    subtitle: 'Total Premium (₹ Cr) and Share (%)',
    tone: 'gold',
    palette: [
      { color: NAVY, labelColor: '#1E3A6B' },
      { color: GOLD, labelColor: '#8A6516' },
    ],
  },
}

const inr = (v: number) => `₹${v.toLocaleString('en-IN')} Cr`
// Compact ₹ for the donut centre: ≥1 lakh-crore reads as "₹3.36L Cr".
const inrCompact = (v: number) => (v >= 100000 ? `₹${(v / 100000).toFixed(2)}L Cr` : inr(v))

function buildRingCards(cards: StructureCard[]): RingCard[] {
  return cards.map((c) => {
    const style = CARD_STYLE[c.key]
    const enhanced = c.key === 'segment-mix'
    return {
      title: style.title(c.fy),
      subtitle: style.subtitle,
      tone: style.tone,
      insight: c.insight,
      segments: c.segments.map((s, i) => ({ ...s, ...style.palette[Math.min(i, style.palette.length - 1)] })),
      enhanced,
      centerValue: enhanced && c.total != null ? inrCompact(c.total) : undefined,
      centerCaption: enhanced ? `${c.fy} General Insurance` : undefined,
    }
  })
}
const RAD = Math.PI / 180

// Ring geometry (px). Thin band; a roomier box + a larger label radius keep the
// % chips clear of the ring band and the card edges so they never overlap.
const BOX = 204
const C = BOX / 2
const INNER = 46
const OUTER = 58
const LABEL_R = OUTER + 19

/** On-hover tooltip for the GI premium-mix donut: segment name, ₹ Cr, % share
 *  and YoY (when a prior-year basis exists). */
function GiTooltip({ active, payload }: { active?: boolean; payload?: { payload: Seg }[] }) {
  if (!active || !payload?.length) return null
  const s = payload[0].payload
  return (
    <div className="rounded-lg border border-soft-border bg-card px-3 py-2 shadow-card">
      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-navy-deep">
        <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
        {s.name}
      </p>
      <p className="mt-0.5 text-[11px] tabular-nums text-ink-secondary">{inr(s.premium)} · {s.share}% share</p>
      {s.yoy != null && (
        <p className="mt-0.5 text-[11px] font-medium tabular-nums" style={{ color: s.yoy >= 0 ? '#2F855A' : '#A8443B' }}>
          YoY {s.yoy >= 0 ? '+' : '−'}{Math.abs(s.yoy).toFixed(1)}%
        </p>
      )}
    </div>
  )
}

/** Slim ring chart — thin stroke, rounded ends, clean center hole. The two-line
 *  cards place each segment's % just outside the ring; the enhanced GI premium-
 *  mix card (many slices) instead carries a centre total + an on-hover tooltip,
 *  keeping the ring uncluttered. */
function RingChart({ segments, enhanced, centerValue, centerCaption }: { segments: Seg[]; enhanced?: boolean; centerValue?: string; centerCaption?: string }) {
  const labels = useMemo(() => {
    let acc = 0
    return segments.map((s) => {
      const f0 = acc / 100
      acc += s.share
      const f1 = acc / 100
      // startAngle 90° (12 o'clock) sweeping clockwise.
      const mid = 90 - ((f0 + f1) / 2) * 360
      return {
        key: s.name,
        x: C + LABEL_R * Math.cos(mid * RAD),
        y: C - LABEL_R * Math.sin(mid * RAD),
        share: s.share,
        color: s.labelColor,
      }
    })
  }, [segments])

  return (
    <div className="relative shrink-0" style={{ width: BOX, height: BOX }}>
      <ResponsiveContainer>
        <PieChart>
          {enhanced && <Tooltip content={<GiTooltip />} wrapperStyle={{ outline: 'none', zIndex: 20 }} />}
          <Pie
            data={segments}
            dataKey="share"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={INNER}
            outerRadius={OUTER}
            paddingAngle={1.6}
            cornerRadius={4}
            startAngle={90}
            endAngle={-270}
            stroke="#FFFFFF"
            strokeWidth={1.5}
            isAnimationActive={false}
          >
            {segments.map((s) => (
              <Cell key={s.name} fill={s.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {/* Two-line cards: % chips just outside the ring. Enhanced card: centre total. */}
      {!enhanced && (
        <div className="pointer-events-none absolute inset-0">
          {labels.map((l) => (
            <span
              key={l.key}
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white/90 px-1.5 py-px text-[11px] font-bold tabular-nums shadow-[0_1px_2px_rgba(23,43,77,0.10)] ring-1 ring-black/[0.04]"
              style={{ left: l.x, top: l.y, color: l.color }}
            >
              {l.share}%
            </span>
          ))}
        </div>
      )}
      {enhanced && centerValue && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-7 text-center">
          <span className="font-display text-[13.5px] font-semibold leading-none text-navy-deep">{centerValue}</span>
          {centerCaption && (
            <span className="mt-1 text-[7.5px] font-semibold uppercase leading-tight tracking-[0.07em] text-ink-secondary">{centerCaption}</span>
          )}
        </div>
      )}
    </div>
  )
}

// Dominant tint per card — a soft tonal wash + a slim top accent rib, by
// colour-psychology: blue (market structure), teal (health/SAHI), gold (PSU).
const TINT: Record<RingCard['tone'], { accent: string; wash: string; bloom: string; insight: string }> = {
  blue: { accent: '#3D5F9F', wash: 'rgba(61,95,159,0.05)', bloom: 'rgba(61,95,159,0.10)', insight: 'bg-soft-blue text-navy-primary' },
  teal: { accent: '#168E8E', wash: 'rgba(22,142,142,0.055)', bloom: 'rgba(22,142,142,0.11)', insight: 'bg-teal-soft text-teal' },
  gold: { accent: '#C29A45', wash: 'rgba(194,154,69,0.07)', bloom: 'rgba(194,154,69,0.13)', insight: 'bg-champagne-soft text-champagne-deep' },
}

function RingInsightCard({ title, subtitle, segments, insight, tone, enhanced, centerValue, centerCaption }: RingCard) {
  const t = TINT[tone]
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-[20px] border p-5 shadow-[0_1px_2px_rgba(23,43,77,0.04),0_10px_26px_rgba(23,43,77,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_3px_8px_rgba(23,43,77,0.07),0_20px_42px_rgba(23,43,77,0.11)]"
      style={{ background: `linear-gradient(160deg, #FFFFFF 0%, ${t.wash} 100%)`, borderColor: 'rgba(23,43,77,0.08)' }}
    >
      {/* slim top accent rib + faint corner bloom */}
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: t.accent, opacity: 0.85 }} />
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-100" style={{ background: t.bloom }} />
      <h3 className="relative font-display text-[15px] leading-tight text-navy-deep">{title}</h3>
      <p className="relative mt-0.5 text-[11px] text-ink-secondary">{subtitle}</p>

      <div className="relative mt-2 flex items-center gap-3">
        <RingChart segments={segments} enhanced={enhanced} centerValue={centerValue} centerCaption={centerCaption} />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
          {segments.map((s) => (
            <div key={s.name} className="flex items-start gap-2">
              <span className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-medium leading-snug text-navy-deep">{s.name}</p>
                <p className="text-[11px] tabular-nums text-ink-secondary">{inr(s.premium)}</p>
              </div>
              <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-navy-deep">{s.share}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className={`relative mt-auto flex items-center gap-2 rounded-xl px-3 py-2 ${t.insight}`}>
        <TrendingUp className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[11px] font-medium leading-snug">{insight}</span>
      </div>
    </div>
  )
}

export function IndustrySnapshotBand() {
  // Built once per load from the committed snapshots — advances on its own as
  // ingestion lands new fiscal years.
  const { cards, span, sourceLine } = useMemo(() => {
    const structure = industrySnapshotCards()
    return {
      cards: buildRingCards(structure),
      span: industrySnapshotSpan(structure),
      sourceLine: industrySnapshotSourceLine(structure),
    }
  }, [])

  if (!cards.length) return null

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="h-3 w-[3px] rounded-full bg-champagne" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Industry Snapshot</span>
        <span className="text-[11px] text-ink-secondary">{span} · Indian insurance market</span>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 lg:items-stretch">
        {cards.map((c) => (
          <RingInsightCard key={c.title} {...c} />
        ))}
      </div>

      <div className="mt-2 flex justify-end">
        <span className="text-[10px] text-ink-secondary/80">{sourceLine}</span>
      </div>
    </section>
  )
}
