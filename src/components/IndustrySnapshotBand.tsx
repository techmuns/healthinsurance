import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { TrendingUp } from 'lucide-react'

// ---------------------------------------------------------------------------
//  Industry Snapshot band — three lean ring cards giving the FY25 structure of
//  the Indian insurance market in one glance: segment mix, SAHI vs non-SAHI,
//  and PSU vs private. Figures are the user-provided, source-attributed market
//  totals (IRDAI Annual Report 2024-25 + company disclosures).
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
      { name: 'Health Insurance', premium: 611700, share: 32.7, color: TEAL, labelColor: '#147C7B' },
      { name: 'Life Insurance', premium: 1163400, share: 62.1, color: NAVY, labelColor: '#27457E' },
      { name: 'General Insurance (Other than Health)', premium: 97000, share: 5.2, color: VIOLET, labelColor: '#6F54A6' },
    ],
    insight: 'Life insurance remains the largest segment, while Health is the fastest growing.',
    tone: 'teal',
  },
  {
    title: '2. SAHI vs Non-SAHI (Health Insurance) (FY25)',
    subtitle: 'Total Premium (₹ Cr) and Share (%)',
    segments: [
      { name: 'SAHI (Standalone Health Insurers)', premium: 467100, share: 76.4, color: TEAL, labelColor: '#147C7B' },
      { name: 'Non-SAHI (Health business of GI)', premium: 144600, share: 23.6, color: GREY, labelColor: '#6B7480' },
    ],
    insight: 'SAHI accounts for 76.4% of the total health insurance market.',
    tone: 'teal',
  },
  {
    title: '3. PSU vs Private (Total Insurance) (FY25)',
    subtitle: 'Total Premium (₹ Cr) and Share (%)',
    segments: [
      { name: 'PSU Insurers', premium: 525000, share: 28.1, color: GOLD, labelColor: '#9C7430' },
      { name: 'Private Insurers', premium: 1345000, share: 71.9, color: NAVY, labelColor: '#27457E' },
    ],
    insight: 'Private insurers dominate with 71.9% share of the total insurance market.',
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
          Source: IRDAI Annual Report 2024-25, Company Annual Reports, Public Disclosures
        </span>
      </div>
    </section>
  )
}
