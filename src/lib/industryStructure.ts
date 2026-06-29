// ---------------------------------------------------------------------------
//  Industry structure — pipeline-fed market-level series & ring-card data.
//
//  Replaces the hardcoded FY25 arrays that used to live in mockData.ts and
//  IndustrySnapshotBand.tsx. Everything here is derived at module load from
//  committed snapshots, so the Industry tab advances by itself as ingestion
//  lands new fiscal years — no code edit per year:
//
//   • industry-segment-premium.json — GI Council segment report (FY15→latest,
//     swept every 3 days by gic-segment-monthly.yml). GI totals + the
//     Health / Motor / Fire / Crop / Marine / Other split per fiscal year.
//   • gic-health-portfolio.json — per-insurer full-FY health premium by
//     carrier group (sahi / general), same GI Council source family.
//   • life-industry-premium.json — annual IRDAI life totals (no monthly
//     source exists; the December annual cadence refreshes it).
//
//  Honesty rules (CLAUDE.md): missing ≠ zero — a year without a printed
//  segment value yields null, never 0; each card states its own fiscal year;
//  a ring never mixes fiscal years across its segments.
// ---------------------------------------------------------------------------

import industrySegment from '@/data/snapshots/industry-segment-premium.json'
import gicHealthPortfolio from '@/data/snapshots/gic-health-portfolio.json'
import lifeIndustry from '@/data/snapshots/life-industry-premium.json'
import type { SeriesPoint } from '@/data/types'

// ── raw row shapes ───────────────────────────────────────────────────────────

interface SegAnnualRow {
  period_type: string
  fiscal_year: string
  health_premium: number | null
  motor_premium: number | null
  fire_premium?: number | null
  marine_premium?: number | null
  crop_premium?: number | null
  pa_premium?: number | null // Personal Accident
  total_gi_premium: number | null
  provenance?: { source_name?: string; source_url?: string; fetched_at?: string }
}

interface GicPortfolioRow {
  fiscal_year: string
  entity: string
  carrier_group: string
  health_total: number | null
}

interface LifeRow {
  fiscal_year: string
  life_total_premium: number | null // industry total LIFE premium (IRDAI)
  lic_total_premium: number | null // LIC total premium = public-sector life
  public_gi_premium: number | null // four PSU general insurers = public-sector general
  lic_share_of_life_total?: number | null // informational
  provenance?: { source_name?: string; source_url?: string; fetched_at?: string }
}

interface MetaLike {
  _meta?: { last_updated?: string }
}

const fyNum = (fy: string) => Number(fy.replace(/^FY/, '')) || 0

const SEG_ANNUAL: SegAnnualRow[] = (industrySegment.data as SegAnnualRow[])
  .filter((r) => r.period_type === 'annual')
  .sort((a, b) => fyNum(a.fiscal_year) - fyNum(b.fiscal_year))

const GIC_ROWS = gicHealthPortfolio.data as GicPortfolioRow[]
const LIFE_ROWS = (lifeIndustry.data as LifeRow[]).sort((a, b) => fyNum(a.fiscal_year) - fyNum(b.fiscal_year))

// ── GI segment series (Market Engine + Pool Shift) ──────────────────────────
// Same shape and units the old mock arrays used: label = FYxx, values in
// ₹ '000 Cr for the absolute series, % of the printed GI total for the mix.
// "Others" = total − health − motor, only when all three are printed (a year
// where the source omits the split stays null — an honest gap in the line).

const r1 = (v: number) => Math.round(v * 10) / 10

export const giPremiumAbsoluteSeries: SeriesPoint[] = SEG_ANNUAL.map((r) => {
  const known = r.total_gi_premium != null && r.health_premium != null && r.motor_premium != null
  return {
    label: r.fiscal_year,
    Health: r.health_premium == null ? null : r1(r.health_premium / 1000),
    Motor: r.motor_premium == null ? null : r1(r.motor_premium / 1000),
    Others: known ? r1((r.total_gi_premium! - r.health_premium! - r.motor_premium!) / 1000) : null,
  }
})

export const giPremiumMixSeries: SeriesPoint[] = SEG_ANNUAL.map((r) => {
  const total = r.total_gi_premium
  const known = total != null && total > 0 && r.health_premium != null && r.motor_premium != null
  const pct = (v: number) => r1((v / total!) * 100)
  return {
    label: r.fiscal_year,
    Health: known ? pct(r.health_premium!) : null,
    Motor: known ? pct(r.motor_premium!) : null,
    Others: known ? pct(total! - r.health_premium! - r.motor_premium!) : null,
  }
})

// ── provenance for the GI segment series (Pool Shift source tag) ────────────

const latestSegRow = [...SEG_ANNUAL].reverse().find((r) => r.health_premium != null)

export const GI_SEGMENT_SOURCE = {
  source: 'GI Council' as const,
  confidence: 'high' as const,
  provenance: {
    source_name: latestSegRow?.provenance?.source_name ?? 'GI Council Segment-wise Report',
    source_url: latestSegRow?.provenance?.source_url ?? 'https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report/',
    fetched_at: (industrySegment as MetaLike)._meta?.last_updated ?? '',
  },
}

// ── Industry Snapshot ring cards ─────────────────────────────────────────────
// Each card resolves to the LATEST fiscal year for which every segment in the
// ring has a sourced value — so a ring never mixes bases, and each advances on
// its own as its sources land (the SAHI card moves with the 3-day GIC sweep;
// the life-dependent cards move when the December IRDAI figures arrive).

export interface StructureSeg {
  name: string
  premium: number // ₹ Cr
  share: number // % (1 dp)
  /** YoY change vs the prior fiscal year, % (1 dp). null when no prior basis. */
  yoy?: number | null
}

export interface StructureCard {
  key: 'segment-mix' | 'sahi-split' | 'psu-private'
  fy: string
  /** True when the underlying source marks the year provisional/unaudited. */
  provisional: boolean
  segments: StructureSeg[]
  insight: string
  /** Card total (₹ Cr) — drives the donut centre label (segment-mix only). */
  total?: number
}

const pctShares = (vals: number[]): number[] => {
  const total = vals.reduce((s, v) => s + v, 0)
  return vals.map((v) => r1((v / total) * 100))
}

// Card 1 — General-Insurance-only premium mix (no Life). The named GI lines are
// drawn straight from the GI Council Segment-wise Report; "Others" is the honest
// residual (GI total − the named lines) so the ring always foots to the printed
// industry total. Each segment carries its own YoY vs the prior FY.
const GI_SEG_DEFS: { field: keyof SegAnnualRow; name: string }[] = [
  { field: 'health_premium', name: 'Health' },
  { field: 'motor_premium', name: 'Motor' },
  { field: 'fire_premium', name: 'Fire' },
  { field: 'crop_premium', name: 'Crop' },
  { field: 'pa_premium', name: 'Personal Accident' },
  { field: 'marine_premium', name: 'Marine' },
]

/** Card 1 — General Insurance premium mix, at the latest FY where the GI total
 *  and at least Health are printed. GI-only: Life is never shown on this card. */
function giSegmentMixCard(): StructureCard | null {
  const seg = [...SEG_ANNUAL].reverse().find((r) => r.total_gi_premium != null && r.health_premium != null)
  if (!seg) return null
  const total = seg.total_gi_premium!
  const prior = SEG_ANNUAL.find((r) => fyNum(r.fiscal_year) === fyNum(seg.fiscal_year) - 1)
  const yoyOf = (field: keyof SegAnnualRow, now: number): number | null => {
    const then = prior ? (prior[field] as number | null | undefined) : null
    return then != null && then > 0 ? r1((now / then - 1) * 100) : null
  }

  // Named GI lines that have a printed value this FY (missing ≠ zero — a line the
  // source omits is folded into Others rather than shown as a fake 0).
  const named = GI_SEG_DEFS
    .map((d) => ({ name: d.name, field: d.field, value: seg[d.field] as number | null | undefined }))
    .filter((s): s is { name: string; field: keyof SegAnnualRow; value: number } => s.value != null)

  const namedSum = named.reduce((s, n) => s + n.value, 0)
  const othersPrem = Math.max(0, total - namedSum)
  // Others YoY: prior Others = prior total − prior named (same line set), when sourced.
  let othersYoy: number | null = null
  if (prior?.total_gi_premium != null) {
    const priorNamed = named.reduce((s, n) => {
      const v = prior[n.field] as number | null | undefined
      return v != null ? s + v : s
    }, 0)
    const priorOthers = prior.total_gi_premium - priorNamed
    othersYoy = priorOthers > 0 ? r1((othersPrem / priorOthers - 1) * 100) : null
  }

  const premiums = [...named.map((n) => n.value), othersPrem]
  const shares = pctShares(premiums)
  const segments: StructureSeg[] = [
    ...named.map((n, i) => ({ name: n.name, premium: Math.round(n.value), share: shares[i], yoy: yoyOf(n.field, n.value) })),
    { name: 'Others', premium: Math.round(othersPrem), share: shares[shares.length - 1], yoy: othersYoy },
  ]

  const healthSeg = segments.find((s) => s.name === 'Health')
  const motorSeg = segments.find((s) => s.name === 'Motor')
  const insight = healthSeg && motorSeg
    ? `Health and Motor together form about ${Math.round(healthSeg.share + motorSeg.share)}% of general insurance premium.`
    : 'Health is the single largest general insurance line by premium.'

  return {
    key: 'segment-mix',
    fy: seg.fiscal_year,
    provisional: /provisional/i.test(seg.provenance?.source_name ?? ''),
    segments,
    insight,
    total: Math.round(total),
  }
}

/** Card 2 — SAHI vs non-SAHI within health, at the latest FY both GIC feeds cover. */
function sahiSplitCard(): StructureCard | null {
  const segByFy = new Map(SEG_ANNUAL.filter((r) => r.health_premium != null).map((r) => [r.fiscal_year, r]))
  const sahiFys = [...new Set(GIC_ROWS.filter((r) => r.carrier_group === 'sahi').map((r) => r.fiscal_year))]
    .filter((fy) => segByFy.has(fy))
    .sort((a, b) => fyNum(b) - fyNum(a))
  const fy = sahiFys[0]
  if (!fy) return null
  const seg = segByFy.get(fy)!
  const sahi = Math.round(
    GIC_ROWS.filter((r) => r.fiscal_year === fy && r.carrier_group === 'sahi').reduce((s, r) => s + (r.health_total ?? 0), 0),
  )
  const nonSahi = Math.round(seg.health_premium!) - sahi
  if (sahi <= 0 || nonSahi <= 0) return null
  const [nonS, sahiS] = pctShares([nonSahi, sahi])
  const third = sahiS >= 28 && sahiS <= 38
  return {
    key: 'sahi-split',
    fy,
    provisional: /provisional/i.test(seg.provenance?.source_name ?? ''),
    segments: [
      { name: 'Non-SAHI (Health business of GI)', premium: nonSahi, share: nonS },
      { name: 'SAHI (Standalone Health Insurers)', premium: sahi, share: sahiS },
    ],
    insight: third
      ? 'Standalone health insurers write about a third of health premium — general insurers write the rest.'
      : `Standalone health insurers write ${sahiS}% of health premium — general insurers write the rest.`,
  }
}

/** Card 3 — PSU vs private on TOTAL premium (life + GI), COMPOSED from published
 *  components: PSU = LIC total premium + the four PSU general insurers; Private =
 *  (industry life − LIC) + (industry GI − public GI). The GI total comes live from
 *  the GI Council segment series; the life total, LIC total and public-GI figure are
 *  the annual IRDAI/LIC components. Resolves to the LATEST fiscal year where EVERY
 *  component is sourced, so it advances on its own as each year's figures land — and
 *  never fabricates a year whose life side hasn't been published (missing ≠ zero). */
function psuPrivateCard(): StructureCard | null {
  for (const row of [...LIFE_ROWS].reverse()) {
    if (row.life_total_premium == null || row.lic_total_premium == null || row.public_gi_premium == null) continue
    const seg = SEG_ANNUAL.find((r) => r.fiscal_year === row.fiscal_year && r.total_gi_premium != null)
    if (!seg) continue
    const psu = Math.round(row.lic_total_premium + row.public_gi_premium)
    const priv = Math.round(row.life_total_premium - row.lic_total_premium + (seg.total_gi_premium! - row.public_gi_premium))
    if (psu <= 0 || priv <= 0) continue
    const [privS, psuS] = pctShares([priv, psu])
    return {
      key: 'psu-private',
      fy: row.fiscal_year,
      // Audited annual basis (IRDAI Annual Report + LIC full-year results), not a
      // provisional GI-council print — so this card is not flagged provisional.
      provisional: false,
      segments: [
        { name: 'Private Insurers', premium: priv, share: privS },
        { name: 'PSU Insurers', premium: psu, share: psuS },
      ],
      insight:
        Math.abs(privS - psuS) <= 6
          ? 'On total premium, public and private are now neck-and-neck — LIC’s scale nearly offsets private’s lead across general insurance.'
          : privS > psuS
            ? 'On total premium, private insurers now write the larger share — even against LIC’s scale.'
            : 'On total premium, the public sector still writes the larger share — LIC’s scale outweighs private’s lead in general insurance.',
    }
  }
  return null
}

export function industrySnapshotCards(): StructureCard[] {
  return [giSegmentMixCard(), sahiSplitCard(), psuPrivateCard()].filter((c): c is StructureCard => c != null)
}

/** "FY25–FY26" band label across whatever years the cards landed on. */
export function industrySnapshotSpan(cards: StructureCard[]): string {
  const fys = [...new Set(cards.map((c) => c.fy))].sort((a, b) => fyNum(a) - fyNum(b))
  if (!fys.length) return '—'
  return fys.length === 1 ? fys[0] : `${fys[0]}–${fys[fys.length - 1]}`
}

/** Short, honest source footnote assembled from the live provenances. */
export function industrySnapshotSourceLine(cards: StructureCard[]): string {
  const giCard = cards.find((c) => c.key === 'segment-mix')
  const sahiCard = cards.find((c) => c.key === 'sahi-split')
  const psuFy = cards.find((c) => c.key === 'psu-private')?.fy
  const parts: string[] = []
  if (giCard) parts.push(`GI Council segment report (GI premium mix, ${giCard.fy}${giCard.provisional ? ', provisional' : ''})`)
  if (sahiCard) parts.push(`GI Council segment report (GI & SAHI, ${sahiCard.fy}${sahiCard.provisional ? ', provisional' : ''})`)
  if (psuFy) parts.push(`public vs private on total premium — public = LIC + 4 PSU general insurers (${psuFy})`)
  return `Source: ${parts.join(' · ')}.`
}

// ── freshness ────────────────────────────────────────────────────────────────

/** Latest last_updated across the snapshots behind the industry structure view. */
export const industryDataLastUpdated: string | null =
  [
    (industrySegment as MetaLike)._meta?.last_updated,
    (gicHealthPortfolio as MetaLike)._meta?.last_updated,
    (lifeIndustry as MetaLike)._meta?.last_updated,
  ]
    .filter((d): d is string => !!d)
    .sort()
    .pop() ?? null
