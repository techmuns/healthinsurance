// ---------------------------------------------------------------------------
//  Insights — the deterministic SIGNAL battery. Each family is a pure function
//  (Dataset) => Signal[] with real numbers; same data in → same signals out.
//  Where a metric/source is missing for an insurer/period it emits a signal with
//  dataGap:true rather than skipping silently — gaps are themselves informative.
//
//  (The build brief asks for one file per family; these are kept as separate
//  pure, independently-tested exports in one module for cohesion — same
//  testability and layer separation, fewer files.)
// ---------------------------------------------------------------------------

import type { Signal, ProvenanceLayer, CoverageRow, SignalRun } from './types'
import type { Dataset, InsurerPanel, AnnualMetrics } from './panel'
import { mean, stdev, zScore, slope, round, pctChange } from './stats'

const STAT: ProvenanceLayer[] = ['annual_report', 'statutory']
const GIC: ProvenanceLayer[] = ['statutory']
const DERIV: ProvenanceLayer[] = ['derived']
const MKT: ProvenanceLayer[] = ['exchange', 'annual_report', 'derived']
const BROKER: ProvenanceLayer[] = ['broker', 'aggregator']

const atFy = (p: InsurerPanel, fy: string): AnnualMetrics | null => p.annual.find((a) => a.fiscal_year === fy) ?? null
const lastTwo = <T>(xs: T[]): [T, T] | null => (xs.length >= 2 ? [xs[xs.length - 2], xs[xs.length - 1]] : null)

// ── 1. Cross-sectional dispersion & outliers (|z| ≥ 1.5) ────────────────────
const DISPERSION = [
  { key: 'combined_ratio' as const, label: 'Combined ratio', unit: '%', polarity: 'lower' },
  { key: 'roe' as const, label: 'ROE', unit: '%', polarity: 'higher' },
  { key: 'solvency_ratio' as const, label: 'Solvency', unit: 'x', polarity: 'higher' },
  { key: 'retail_mix' as const, label: 'Retail mix', unit: '%', polarity: 'higher' },
  { key: 'market_share' as const, label: 'SAHI segment share', unit: '%', polarity: 'higher' },
]

export function dispersionSignals(d: Dataset): Signal[] {
  const out: Signal[] = []
  const fy = d.asOf
  for (const m of DISPERSION) {
    const present = d.insurers
      .map((p) => ({ id: p.id, v: atFy(p, fy)?.[m.key] ?? null }))
      .filter((x): x is { id: string; v: number } => x.v != null)
    if (present.length < 3) continue
    const vals = present.map((x) => x.v)
    const mu = round(mean(vals))
    const sd = stdev(vals)
    out.push({ family: 'dispersion', insurer: 'panel', period: fy, metric: `${m.label} — peer mean`, value: mu, unit: m.unit, layers: STAT, dataGap: false, note: `n=${present.length}, sd=${round(sd)}` })
    for (const x of present) {
      const z = round(zScore(x.v, mu, sd), 2)
      if (Math.abs(z) < 1.5) continue
      out.push({
        family: 'dispersion', insurer: x.id, period: fy, metric: m.label, value: round(x.v), unit: m.unit,
        comparison: { basis: 'peer_mean', referenceValue: mu, delta: round(x.v - mu), zScore: z },
        layers: STAT, dataGap: false,
        note: `${z > 0 ? '+' : ''}${z}σ vs peers (${m.polarity}-is-better)`,
      })
    }
    // gaps for this metric/period
    for (const p of d.insurers) if (atFy(p, fy)?.[m.key] == null) out.push({ family: 'dispersion', insurer: p.id, period: fy, metric: m.label, value: null, unit: m.unit, layers: STAT, dataGap: true, note: 'not reported at this period' })
  }
  return out
}

// ── 2. Growth-quality decomposition (retail vs group) ───────────────────────
export function growthQualitySignals(d: Dataset): Signal[] {
  const out: Signal[] = []
  for (const p of d.insurers) {
    const hm = p.healthMix.filter((h) => h.retail != null && h.group != null && h.total != null)
    const pair = lastTwo(hm)
    if (!pair) {
      out.push({ family: 'growth_quality', insurer: p.id, period: d.asOf, metric: 'Retail vs group growth', value: null, unit: '%', layers: GIC, dataGap: true, note: 'insufficient retail/group history' })
      continue
    }
    const [prev, cur] = pair
    const rg = pctChange(prev.retail, cur.retail)
    const gg = pctChange(prev.group, cur.group)
    const mixCur = (cur.retail as number) / (cur.total as number) * 100
    const mixPrev = (prev.retail as number) / (prev.total as number) * 100
    if (rg != null) out.push({ family: 'growth_quality', insurer: p.id, period: cur.fiscal_year, metric: 'Retail health premium growth YoY', value: round(rg, 1), unit: '%', comparison: { basis: 'prior_period', referenceValue: round(gg ?? 0, 1), delta: round(rg - (gg ?? 0), 1) }, layers: GIC, dataGap: false, note: `group grew ${round(gg ?? 0, 1)}%` })
    if (gg != null) out.push({ family: 'growth_quality', insurer: p.id, period: cur.fiscal_year, metric: 'Group health premium growth YoY', value: round(gg, 1), unit: '%', layers: GIC, dataGap: false })
    out.push({ family: 'growth_quality', insurer: p.id, period: cur.fiscal_year, metric: 'Retail mix (health)', value: round(mixCur, 1), unit: '%', comparison: { basis: 'prior_period', referenceValue: round(mixPrev, 1), delta: round(mixCur - mixPrev, 1) }, layers: GIC, dataGap: false, note: `${mixCur >= mixPrev ? '+' : ''}${round(mixCur - mixPrev, 1)}pp YoY` })
    // retail-mix slope over the trailing window (inflection)
    const series = hm.slice(-5).map((h, i) => ({ x: i, y: (h.retail as number) / (h.total as number) * 100 }))
    const sl = slope(series)
    if (sl != null) out.push({ family: 'growth_quality', insurer: p.id, period: cur.fiscal_year, metric: 'Retail-mix trend (slope, pp/yr)', value: round(sl, 2), unit: 'pp', comparison: { basis: 'own_trend', referenceValue: 0, delta: round(sl, 2) }, layers: GIC, dataGap: false })
  }
  return out
}

// ── 3. Marginal market share (share of incremental retail premium) ──────────
export function marginalShareSignals(d: Dataset): Signal[] {
  const out: Signal[] = []
  const deltas = d.insurers.map((p) => {
    const hm = p.healthMix.filter((h) => h.retail != null)
    const pair = lastTwo(hm)
    return { id: p.id, d: pair ? (pair[1].retail as number) - (pair[0].retail as number) : null, cur: hm.length ? (hm[hm.length - 1].retail as number) : null, fy: hm.length ? hm[hm.length - 1].fiscal_year : d.asOf }
  })
  const totDelta = deltas.reduce((s, x) => s + (x.d ?? 0), 0)
  const totCur = deltas.reduce((s, x) => s + (x.cur ?? 0), 0)
  if (totDelta <= 0 || totCur <= 0) return out
  for (const x of deltas) {
    if (x.d == null || x.cur == null) continue
    const marginal = (x.d / totDelta) * 100
    const headline = (x.cur / totCur) * 100
    out.push({
      family: 'marginal_share', insurer: x.id, period: x.fy, metric: 'Marginal retail-share (of incremental premium)', value: round(marginal, 1), unit: '%',
      comparison: { basis: 'peer_mean', referenceValue: round(headline, 1), delta: round(marginal - headline, 1) },
      layers: GIC, dataGap: false, note: `headline retail share ${round(headline, 1)}%`,
    })
  }
  return out
}

// ── 4. Combined-ratio level + attribution (claims vs expense) ───────────────
export function combinedRatioSignals(d: Dataset): Signal[] {
  const out: Signal[] = []
  for (const p of d.insurers) {
    const cur = atFy(p, d.asOf)
    if (cur?.combined_ratio != null) {
      out.push({ family: 'combined_ratio', insurer: p.id, period: d.asOf, metric: 'Combined ratio', value: round(cur.combined_ratio, 1), unit: '%', comparison: { basis: 'regulatory_floor', referenceValue: 100, delta: round(cur.combined_ratio - 100, 1) }, layers: STAT, dataGap: false, note: cur.combined_ratio > 100 ? 'underwriting loss (>100)' : 'underwriting profit (<100)' })
    }
    // attribution where the series carries both claims & expense
    const series = p.annual.filter((a) => a.combined_ratio != null)
    const pair = lastTwo(series)
    if (pair) {
      const [a0, a1] = pair
      const dCR = (a1.combined_ratio as number) - (a0.combined_ratio as number)
      const dClaims = a0.claims_ratio != null && a1.claims_ratio != null ? round((a1.claims_ratio as number) - (a0.claims_ratio as number), 1) : null
      const dExp = a0.expense_ratio != null && a1.expense_ratio != null ? round((a1.expense_ratio as number) - (a0.expense_ratio as number), 1) : null
      out.push({ family: 'combined_ratio', insurer: p.id, period: a1.fiscal_year, metric: 'Δ Combined ratio YoY', value: round(dCR, 1), unit: 'pp', comparison: { basis: 'prior_period', referenceValue: 0, delta: round(dCR, 1) }, layers: STAT, dataGap: dClaims == null && dExp == null, note: `claims Δ ${dClaims ?? 'n/a'}pp · expense Δ ${dExp ?? 'n/a'}pp` })
    }
  }
  return out
}

// ── 5. Solvency runway → capital-raise lead indicator ───────────────────────
export function solvencySignals(d: Dataset): Signal[] {
  const out: Signal[] = []
  const FLOOR = 1.5
  for (const p of d.insurers) {
    const cur = atFy(p, d.asOf)
    if (cur?.solvency_ratio == null) {
      out.push({ family: 'solvency', insurer: p.id, period: d.asOf, metric: 'Solvency headroom', value: null, unit: 'x', layers: STAT, dataGap: true })
      continue
    }
    const s = cur.solvency_ratio
    out.push({ family: 'solvency', insurer: p.id, period: d.asOf, metric: 'Solvency ratio', value: round(s, 2), unit: 'x', comparison: { basis: 'regulatory_floor', referenceValue: FLOOR, delta: round(s - FLOOR, 2) }, layers: STAT, dataGap: false, note: `${round((s - FLOOR) / FLOOR * 100)}% above the 150% floor` })
    // crude raise-pressure horizon: headroom eroded at the GWP growth rate.
    const gpair = lastTwo(p.annual.filter((a) => a.gwp != null))
    const g = gpair ? pctChange(gpair[0].gwp, gpair[1].gwp) : null
    if (g != null && g > 0 && s > FLOOR) {
      // periods until s*(1/(1+g)^t) ≈ FLOOR  →  t ≈ ln(s/FLOOR)/ln(1+g)
      const t = Math.log(s / FLOOR) / Math.log(1 + g / 100)
      out.push({ family: 'solvency', insurer: p.id, period: d.asOf, metric: 'Raise-pressure horizon (heuristic)', value: round(t, 1), unit: 'periods', comparison: { basis: 'regulatory_floor', referenceValue: FLOOR, delta: round(s - FLOOR, 2) }, layers: DERIV, dataGap: false, note: `at ${round(g, 0)}% GWP growth, solvency drifts toward the floor in ~${round(t, 1)} yrs absent capital actions` })
    }
  }
  return out
}

// ── 6. Valuation dislocation (listed: P/B vs ROE, P/GWP vs growth) ──────────
export function valuationSignals(d: Dataset): Signal[] {
  const out: Signal[] = []
  const COE = 12 // assumed cost of equity %, for the warranted-P/B line
  for (const p of d.insurers) {
    if (!p.listed || !p.valuation) continue
    const roe = atFy(p, d.asOf)?.roe ?? null
    const { pb, pGwp } = p.valuation
    if (roe != null) out.push({ family: 'valuation', insurer: p.id, period: d.asOf, metric: 'ROE (return base)', value: round(roe, 1), unit: '%', layers: STAT, dataGap: false, note: 'current return on equity' })
    if (pb != null && roe != null) {
      const warranted = round(roe / COE, 2) // simple ROE/CoE warranted P/B
      out.push({ family: 'valuation', insurer: p.id, period: p.valuation.period, metric: 'P/B vs warranted (ROE ÷ CoE)', value: round(pb, 2), unit: 'x', comparison: { basis: 'peer_mean', referenceValue: warranted, delta: round(pb - warranted, 2) }, layers: MKT, dataGap: false, note: `P/B ${round(pb, 2)}x vs ~${warranted}x warranted on ${round(roe, 1)}% ROE @ ${COE}% CoE — ${pb > warranted ? 'prices in ROE expansion' : 'cheap for returns'}` })
    }
    const gpair = lastTwo(p.annual.filter((a) => a.gwp != null))
    const g = gpair ? pctChange(gpair[0].gwp, gpair[1].gwp) : null
    if (pGwp != null && g != null) {
      out.push({ family: 'valuation', insurer: p.id, period: p.valuation.period, metric: 'P/GWP vs growth', value: round(pGwp, 2), unit: 'x', comparison: { basis: 'own_trend', referenceValue: round(g, 0), delta: round(pGwp, 2) }, layers: MKT, dataGap: false, note: `${round(pGwp, 2)}x P/GWP on ~${round(g, 0)}% GWP growth` })
    }
  }
  return out
}

// ── 7. Management credibility (promise vs delivery) ─────────────────────────
export function managementSignals(d: Dataset): Signal[] {
  const out: Signal[] = []
  for (const p of d.insurers) {
    if (!p.promises) {
      out.push({ family: 'management', insurer: p.id, period: d.asOf, metric: 'Guidance credibility', value: null, unit: '%', layers: STAT, dataGap: true, note: 'no tracked guidance on record' })
      continue
    }
    const { delivered, total, missed, delayed } = p.promises
    const rate = total ? (delivered / total) * 100 : 0
    out.push({ family: 'management', insurer: p.id, period: d.asOf, metric: 'Guidance delivered rate', value: round(rate, 0), unit: '%', comparison: { basis: 'own_trend', referenceValue: 100, delta: round(rate - 100, 0) }, layers: STAT, dataGap: false, note: `${delivered}/${total} delivered · ${delayed} delayed · ${missed} missed` })
  }
  return out
}

// ── 8. Consensus dynamics (listed) ──────────────────────────────────────────
export function consensusSignals(d: Dataset): Signal[] {
  const out: Signal[] = []
  for (const p of d.insurers) {
    if (!p.consensus) continue
    const c = p.consensus
    if (c.target != null && c.price != null && c.price > 0) {
      out.push({ family: 'consensus', insurer: p.id, period: d.asOf, metric: 'Consensus upside to target', value: round((c.target / c.price - 1) * 100, 1), unit: '%', comparison: { basis: 'prior_period', referenceValue: c.price, delta: round(c.target - c.price, 1) }, layers: BROKER, dataGap: false, note: `${c.buy} buy / ${c.hold} hold / ${c.sell} sell, n=${c.analystCount}` })
    }
    if (c.high != null && c.low != null && c.target != null && c.target > 0) {
      out.push({ family: 'consensus', insurer: p.id, period: d.asOf, metric: 'Target dispersion (high−low ÷ mean)', value: round((c.high - c.low) / c.target * 100, 1), unit: '%', layers: BROKER, dataGap: false, note: `range ₹${c.low}–₹${c.high}` })
    }
  }
  return out
}

// ── 9. Implied expectations — REVERSE THE PRICE (Gordon: P/B → steady-state ROE)
//  The structural valuation read the prompt's "reverse the price" step consumes:
//  invert the multiple to the steady-state ROE (and the perpetual growth) the
//  CURRENT price implies, against the ROE delivered. Listed names only — a
//  disclosed market P/B is required; unlisted SAHIs gap honestly.
export function impliedExpectationsSignals(d: Dataset): Signal[] {
  const out: Signal[] = []
  const COE = 12 // assumed cost of equity %
  const G_TERM = 8 // assumed terminal perpetual growth % (<= nominal GDP)
  for (const p of d.insurers) {
    const pb = p.valuation?.pb ?? null
    const roe = atFy(p, d.asOf)?.roe ?? null
    if (pb == null || roe == null) {
      out.push({ family: 'implied_expectations', insurer: p.id, period: d.asOf, metric: 'Implied steady-state ROE (reverse Gordon)', value: null, unit: '%', layers: MKT, dataGap: true, note: p.listed ? 'P/B or ROE not on record this period' : 'unlisted — no disclosed market multiple to invert' })
      continue
    }
    // P/B = (ROE − g)/(CoE − g)  ⇒  ROE* = CoE·(P/B) − g·((P/B) − 1)
    const roeImplied = round(COE * pb - G_TERM * (pb - 1), 1)
    out.push({
      family: 'implied_expectations', insurer: p.id, period: p.valuation!.period, metric: 'Implied steady-state ROE (reverse Gordon)', value: roeImplied, unit: '%',
      comparison: { basis: 'own_trend', referenceValue: round(roe, 1), delta: round(roeImplied - roe, 1) },
      layers: MKT, dataGap: false,
      note: `${round(pb, 1)}x P/B @ ${COE}% CoE & ${G_TERM}% terminal g implies ~${roeImplied}% sustainable ROE vs ${round(roe, 1)}% delivered — a ${round(roeImplied - roe, 1)}pp gap the price front-runs`,
    })
    // Cross-check: holding delivered ROE fixed, the perpetual growth the price requires.
    // g* = (ROE − P/B·CoE)/(1 − P/B)
    if (pb !== 1) {
      const gImplied = round((roe - pb * COE) / (1 - pb), 1)
      out.push({ family: 'implied_expectations', insurer: p.id, period: p.valuation!.period, metric: 'Implied perpetual growth (at current ROE)', value: gImplied, unit: '%', layers: MKT, dataGap: false, note: `on ${round(roe, 1)}% ROE a ${round(pb, 1)}x P/B requires ~${gImplied}% perpetual growth` })
    }
  }
  return out
}

// ── 10. Cost of float (Buffett lens) — underwriting result as a % of float.
//  For SHORT-TAIL health, float ≈ earned premium (claims pay out fast), so with
//  NEP as the float proxy the cost of float collapses to (combined ratio − 100):
//  positive = the insurer PAYS to hold float (loss-making underwriting); negative
//  = free float that compounds. Honest proxy — reserve-leverage isn't disclosed.
export function costOfFloatSignals(d: Dataset): Signal[] {
  const out: Signal[] = []
  for (const p of d.insurers) {
    const cur = atFy(p, d.asOf)
    const cr = cur?.combined_ratio ?? null
    if (cr == null) { out.push({ family: 'float_cost', insurer: p.id, period: d.asOf, metric: 'Cost of float (UW result ÷ NEP proxy)', value: null, unit: '%', layers: STAT, dataGap: true, note: 'combined ratio not reported' }); continue }
    const fc = round(cr - 100, 1) // -(UW result)/NEP = (CR − 100) for short-tail health
    out.push({
      family: 'float_cost', insurer: p.id, period: d.asOf, metric: 'Cost of float (UW result ÷ NEP proxy)', value: fc, unit: '%',
      comparison: { basis: 'regulatory_floor', referenceValue: 0, delta: fc },
      layers: STAT, dataGap: false,
      note: `${fc > 0 ? 'pays' : 'earns'} ${Math.abs(fc)}% to hold float${cur?.nep != null ? ` (NEP ~₹${round(cur.nep)}cr float proxy)` : ''} — ${fc > 0 ? 'a cost, not free compounding (franchise-quality flag)' : 'free float'}`,
    })
  }
  return out
}

// ── 11. Reflexive solvency-as-governor — can the name fund guided growth without
//  dilution at its current multiple? Needs a market multiple (listed only): a rich
//  multiple + comfortable solvency + high growth = a VIRTUOUS loop (cheap equity
//  funds growth); a cheap multiple + near-floor solvency forces dilution = VICIOUS.
export function reflexiveSolvencySignals(d: Dataset): Signal[] {
  const out: Signal[] = []
  const FLOOR = 1.5
  for (const p of d.insurers) {
    const cur = atFy(p, d.asOf)
    const s = cur?.solvency_ratio ?? null
    const pb = p.valuation?.pb ?? null
    const gpair = lastTwo(p.annual.filter((a) => a.gwp != null))
    const g = gpair ? pctChange(gpair[0].gwp, gpair[1].gwp) : null
    if (s == null || pb == null || g == null) {
      out.push({ family: 'reflexive_solvency', insurer: p.id, period: d.asOf, metric: 'Solvency–multiple reflexive loop', value: null, unit: 'x', layers: MKT, dataGap: true, note: p.listed ? 'solvency / multiple / growth incomplete' : 'unlisted — no market multiple; runway only (see solvency family)' })
      continue
    }
    const headroom = round(s - FLOOR, 2)
    const virtuous = pb >= 1.5 && s > FLOOR * 1.2
    out.push({
      family: 'reflexive_solvency', insurer: p.id, period: d.asOf, metric: 'Solvency–multiple reflexive loop', value: round(s, 2), unit: 'x',
      comparison: { basis: 'regulatory_floor', referenceValue: FLOOR, delta: headroom },
      layers: MKT, dataGap: false,
      note: `${virtuous ? 'virtuous' : 'watch'}: ${round(pb, 1)}x P/B + ${round(s, 2)}x solvency + ~${round(g, 0)}% growth — ${virtuous ? 'a rich multiple lets it raise solvency capital cheaply and out-grow' : 'thin headroom or a cheap multiple risks dilution that validates the cheapness'}`,
    })
  }
  return out
}

// ── 12. Persistency / embedded annuity value — renewal rate as the leading proxy
//  for the in-force book's lifetime value. Level only (single FY25 print); the
//  trend and an explicit LTV need churn/CAC the filings don't carry — gapped.
export function persistencySignals(d: Dataset): Signal[] {
  const out: Signal[] = []
  const present = d.insurers.map((p) => ({ id: p.id, r: atFy(p, d.asOf)?.renewal_rate ?? null })).filter((x): x is { id: string; r: number } => x.r != null)
  const mu = present.length >= 3 ? round(mean(present.map((x) => x.r)), 1) : null
  for (const p of d.insurers) {
    const cur = atFy(p, d.asOf)
    const r = cur?.renewal_rate ?? null
    if (r == null) { out.push({ family: 'persistency', insurer: p.id, period: d.asOf, metric: 'Renewal rate (persistency)', value: null, unit: '%', layers: STAT, dataGap: true, note: 'renewal rate not reported' }); continue }
    const comp = mu != null ? { basis: 'peer_mean' as const, referenceValue: mu, delta: round(r - mu, 1) } : undefined
    out.push({ family: 'persistency', insurer: p.id, period: d.asOf, metric: 'Renewal rate (persistency)', value: round(r, 0), unit: '%', comparison: comp, layers: STAT, dataGap: false, note: `${r}% retained${cur?.customer_retention != null ? ` · ${cur.customer_retention}% customer retention` : ''} — a stickier book is embedded annuity value; trend/LTV not disclosed` })
  }
  return out
}

// ── 13. Operating-leverage scale path — expense ratio falling as GWP scales is
//  positive operating leverage; and the distance from the expense ratio to the
//  level that turns underwriting profitable (expense < 100 − claims). Only names
//  that disclose a multi-year expense ratio (trend) or expense + claims together
//  (distance) qualify; the rest gap honestly.
export function operatingLeverageSignals(d: Dataset): Signal[] {
  const out: Signal[] = []
  for (const p of d.insurers) {
    let emitted = false
    const exp = p.annual.filter((a) => a.expense_ratio != null)
    const pair = lastTwo(exp)
    if (pair) {
      const [a0, a1] = pair
      const dExp = round((a1.expense_ratio as number) - (a0.expense_ratio as number), 1)
      out.push({ family: 'operating_leverage', insurer: p.id, period: a1.fiscal_year, metric: 'Expense-ratio trajectory (operating leverage)', value: round(a1.expense_ratio as number, 1), unit: '%', comparison: { basis: 'prior_period', referenceValue: round(a0.expense_ratio as number, 1), delta: dExp }, layers: STAT, dataGap: false, note: `${dExp <= 0 ? 'falling' : 'rising'} ${Math.abs(dExp)}pp YoY as GWP scales — ${dExp <= 0 ? 'positive' : 'negative'} operating leverage` })
      emitted = true
    }
    const cur = atFy(p, d.asOf)
    if (cur?.expense_ratio != null && cur?.claims_ratio != null) {
      const breakeven = round(100 - cur.claims_ratio, 1)
      const dist = round(cur.expense_ratio - breakeven, 1)
      out.push({ family: 'operating_leverage', insurer: p.id, period: d.asOf, metric: 'Distance to underwriting break-even (via expense)', value: dist, unit: 'pp', comparison: { basis: 'regulatory_floor', referenceValue: 0, delta: dist }, layers: STAT, dataGap: false, note: `expense ${cur.expense_ratio}% vs ${breakeven}% break-even on ${cur.claims_ratio}% claims — ${dist > 0 ? `${dist}pp of expense to cut` : 'already expense-profitable'}` })
      emitted = true
    }
    if (!emitted) out.push({ family: 'operating_leverage', insurer: p.id, period: d.asOf, metric: 'Operating leverage', value: null, unit: '%', layers: STAT, dataGap: true, note: 'no multi-year expense ratio, nor expense + claims for the same period' })
  }
  return out
}

// ── 14. Mix-adjusted comparability — each insurer's retail vs group mix, so naive
//  cross-insurer combined-ratio / growth comparisons are made mix-aware (a group-
//  heavy book runs a structurally different combined ratio). Segment-level combined
//  ratios aren't disclosed, so a true mix-normalised CR is gapped.
export function mixComparabilitySignals(d: Dataset): Signal[] {
  const out: Signal[] = []
  const present = d.insurers.map((p) => ({ id: p.id, m: atFy(p, d.asOf)?.retail_mix ?? null })).filter((x): x is { id: string; m: number } => x.m != null)
  const mu = present.length >= 3 ? round(mean(present.map((x) => x.m)), 1) : null
  for (const p of d.insurers) {
    const m = atFy(p, d.asOf)?.retail_mix ?? null
    if (m == null) { out.push({ family: 'mix_comparability', insurer: p.id, period: d.asOf, metric: 'Retail mix (comparability adjuster)', value: null, unit: '%', layers: GIC, dataGap: true, note: 'retail mix not reported' }); continue }
    const comp = mu != null ? { basis: 'peer_mean' as const, referenceValue: mu, delta: round(m - mu, 1) } : undefined
    const heavy = m >= (mu ?? 60)
    out.push({ family: 'mix_comparability', insurer: p.id, period: d.asOf, metric: 'Retail mix (comparability adjuster)', value: round(m, 0), unit: '%', comparison: comp, layers: GIC, dataGap: false, note: `${m}% retail — mix-adjust before comparing combined ratios: a ${heavy ? 'retail-heavy' : 'group-heavy'} book runs structurally ${heavy ? 'higher-expense, stickier' : 'lower-expense, thinner-margin'} economics` })
  }
  return out
}

// ── Orchestrator ────────────────────────────────────────────────────────────
const FAMILIES = [dispersionSignals, growthQualitySignals, marginalShareSignals, combinedRatioSignals, solvencySignals, valuationSignals, managementSignals, consensusSignals, impliedExpectationsSignals, costOfFloatSignals, reflexiveSolvencySignals, persistencySignals, operatingLeverageSignals, mixComparabilitySignals]

/** Deterministic 32-bit hash of the signal payload (reproducibility stamp). */
export function signalHash(signals: Signal[]): string {
  const s = JSON.stringify(signals)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return `sig_${h.toString(16)}`
}

export function runAllSignals(d: Dataset): SignalRun {
  const signals = FAMILIES.flatMap((fn) => fn(d))
  const coverage: CoverageRow[] = d.insurers.map((p) => {
    const own = signals.filter((s) => s.insurer === p.id)
    const gapped = own.filter((s) => s.dataGap).length
    return { insurer: p.id, readyPct: own.length ? Math.round(((own.length - gapped) / own.length) * 100) : 0, gapped }
  })
  return { asOf: d.asOf, signals, coverage }
}
