import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { TrendingUp } from 'lucide-react'

// ---------------------------------------------------------------------------
//  Industry Snapshot band — three lean ring cards giving the FY25 structure of
//  the Indian insurance market in one glance: segment mix, SAHI vs non-SAHI,
//  and PSU vs private.
//
//  Figures are the real FY25 (FY2024-25) market totals, cross-checked against
//  public sources (Jun 2026):
//    • Life total premium ₹8.86 lakh Cr — IRDAI Annual Report 2024-25.
//    • Non-life gross premium ₹3.07 lakh Cr; health = 41% of non-life ≈
//      ₹1.26 lakh Cr — IRDAI / General Insurance Council FY25.
//    • SAHI ≈ ₹0.40 lakh Cr (Star ₹16.8k + Care ₹8.3k + Niva ₹7.0k + Aditya
//      Birla + ManipalCigna) ≈ a third of health — company filings.
//    • PSU vs private split is on a TOTAL-premium basis: LIC = 57% of life
//      (IRDAI) keeps the public sector roughly level with private overall.
//  NOTE: still hardcoded here (not yet pipeline-fed). The SAHI rupee total and
//  the general-insurance public/private split are best estimates from filings;
//  everything else is directly sourced. Wire to the ingest pipeline next.
// ---------------------------------------------------------------------------

interface Seg {
  name: string
  premium: number // ₹ Cr
  share: number // %
  color: string // ring fill
  labelColor: string // readable % label colour (placed just outside the ring)
}

interface RingCard {
  title: string
  subtitle: string
  segments: Seg[]
  insight: string
  tone: 'teal' | 'gold'
}

// Ring fills
const TEAL = '#168E8E'
const NAVY = '#27457E'
const VIOLET = '#8061B8'
const GREY = '#AEB6C2'
const GOLD = '#C29A45'

const CARDS: RingCard[] = [
  {
    title: '1. Market Size by Segment (FY25)',
    subtitle: 'Total Premium (₹ Cr) and Market Share (%)',
    segments: [
      { name: 'Life Insurance', premium: 886000, share: 74.3, color: NAVY, labelColor: '#27457E' },
      { name: 'General Insurance (Other than Health)', premium: 181000, share: 15.1, color: VIOLET, labelColor: '#6F54A6' },
      { name: 'Health Insurance', premium: 126000, share: 10.6, color: TEAL, labelColor: '#147C7B' },
    ],
    insight: 'Life is the largest segment by far; health is the fastest-growing but still ~11% of total premium.',
    tone: 'teal',
  },
  {
    title: '2. SAHI vs Non-SAHI (Health Insurance) (FY25)',
    subtitle: 'Total Premium (₹ Cr) and Share (%)',
    segments: [
      { name: 'Non-SAHI (Health business of GI)', premium: 86000, share: 68.3, color: GREY, labelColor: '#6B7480' },
      { name: 'SAHI (Standalone Health Insurers)', premium: 40000, share: 31.7, color: TEAL, labelColor: '#147C7B' },
    ],
    insight: 'Standalone health insurers write about a third of health premium — general insurers write the rest.',
    tone: 'teal',
  },
  {
    title: '3. PSU vs Private (Total Insurance) (FY25)',
    subtitle: 'Total Premium (₹ Cr) and Share (%)',
    segments: [
      { name: 'Private Insurers', premium: 593000, share: 49.7, color: NAVY, labelColor: '#27457E' },
      { name: 'PSU Insurers', premium: 600000, share: 50.3, color: GOLD, labelColor: '#9C7430' },
    ],
    insight: 'On total premium, public and private are roughly level — LIC’s scale offsets private’s lead in general insurance.',
    tone: 'gold',
  },
]

const inr = (v: number) => `₹${v.toLocaleString('en-IN')} Cr`
const RAD = Math.PI / 180

// Ring geometry (px). Thin band; the box leaves room around it for the % labels
// to sit just outside the ring without clipping.
const BOX = 188
const C = BOX / 2
const INNER = 46
const OUTER = 58
const LABEL_R = OUTER + 12

/** Slim ring chart — thin stroke, rounded ends, clean center hole, with the %
 *  for each segment placed just outside the ring (kept off the thin band so it
 *  always reads cleanly). */
function RingChart({ segments }: { segments: Seg[] }) {
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
      <div className="pointer-events-none absolute inset-0">
        {labels.map((l) => (
          <span
            key={l.key}
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] font-bold tabular-nums"
            style={{ left: l.x, top: l.y, color: l.color }}
          >
            {l.share}%
          </span>
        ))}
      </div>
    </div>
  )
}

function RingInsightCard({ title, subtitle, segments, insight, tone }: RingCard) {
  const insightClass = tone === 'gold' ? 'bg-champagne-soft text-champagne-deep' : 'bg-teal-soft text-teal'
  return (
    <div className="flex flex-col rounded-[20px] border border-[rgba(23,43,77,0.08)] bg-white p-5 shadow-[0_1px_2px_rgba(23,43,77,0.04),0_10px_26px_rgba(23,43,77,0.06)]">
      <h3 className="font-display text-[15px] leading-tight text-navy-deep">{title}</h3>
      <p className="mt-0.5 text-[11px] text-ink-secondary">{subtitle}</p>

      <div className="mt-2 flex items-center gap-3">
        <RingChart segments={segments} />
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

      <div className={`mt-auto flex items-center gap-2 rounded-xl px-3 py-2 ${insightClass}`}>
        <TrendingUp className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[11px] font-medium leading-snug">{insight}</span>
      </div>
    </div>
  )
}

export function IndustrySnapshotBand() {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="h-3 w-[3px] rounded-full bg-champagne" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-champagne">Industry Snapshot</span>
        <span className="text-[11px] text-ink-secondary">FY25 · Indian insurance market</span>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 lg:items-stretch">
        {CARDS.map((c) => (
          <RingInsightCard key={c.title} {...c} />
        ))}
      </div>

      <div className="mt-2 flex justify-end">
        <span className="text-[10px] text-ink-secondary/80">
          Source: IRDAI Annual Report 2024-25 · General Insurance Council FY25 · company filings. PSU/private split shown on a total-premium basis.
        </span>
      </div>
    </section>
  )
}
