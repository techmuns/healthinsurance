// ---------------------------------------------------------------------------
//  Insights — the METHODOLOGY assembler ("show the working").
//
//  This is the deterministic flip-side of every insight card. It maps each
//  signal family to a recognized, named method (z-score, warranted P/B, solvency
//  runway, …) and instantiates that formula with the ACTUAL numbers that produced
//  the insight — every input traceable to a value already present in the signal
//  payload. The model never touches any of this: `assembleMethodology` is a pure
//  function of (Insight, SignalRun), so the back of the card is the same
//  computation that produced the signal in the first place, surfaced verbatim.
//
//  Trust contract (see validate.ts / scripts/insights/check.ts):
//    • No number on the back may be absent from the signal payload (± tolerance).
//    • Non-quantitative items (news/filings) carry an honest detection rule, never
//      a fabricated formula (isQuantitative:false).
// ---------------------------------------------------------------------------

import type {
  Insight, Lens, LensBlock, MethodDescriptor, MethodInput, Methodology, ProvenanceLayer, Signal, SignalRun,
} from './types'

// ── small helpers ───────────────────────────────────────────────────────────

/** Compact number → string: drop trailing zeros, keep sign. */
const fmt = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return 'n/a'
  const r = Math.round(n * 100) / 100
  return Number.isInteger(r) ? String(r) : String(r)
}
const signed = (n: number | null | undefined): string => (n == null || !Number.isFinite(n) ? 'n/a' : n >= 0 ? `+${fmt(n)}` : fmt(n))

const FY = /FY\d{2}/g
/** All finite numbers in a string (FY tokens stripped so "FY25" ≠ orphan 25). */
export function numbersIn(text: string): number[] {
  return [...text.replace(FY, '').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter(Number.isFinite)
}

const num = (re: RegExp, s?: string): number | null => {
  if (!s) return null
  const m = s.match(re)
  return m ? Number(m[1]) : null
}
const primaryLayer = (s: Signal): ProvenanceLayer => s.layers[0] ?? 'derived'

/** Deterministic djb2 hash of an arbitrary payload — the per-card reproducibility stamp. */
export function hashPayload(payload: unknown): string {
  const s = JSON.stringify(payload)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return `sig_${h.toString(16)}`
}

const PRETTY: Record<string, string> = {
  'niva-bupa': 'Niva Bupa', 'star-health': 'Star Health', 'care-health': 'Care Health',
  'aditya-birla': 'Aditya Birla', 'manipalcigna': 'ManipalCigna', panel: 'the panel',
}
const pretty = (id: string) => PRETTY[id] ?? id

const find = (run: SignalRun, insurer: string, metricRe: RegExp, period?: string): Signal | undefined =>
  run.signals.find((s) => s.insurer === insurer && metricRe.test(s.metric) && (!period || s.period === period) && !s.dataGap)

// ── method specs ─────────────────────────────────────────────────────────────
//
//  Each spec owns: a `match` (which signals belong to it), the recognized formula,
//  and a `build` that instantiates it with this insight's numbers + a robustness
//  line. `build` may read sibling signals from the run (μ, σ, ROE, CoE, the
//  corroborating combined-ratio / coverage prints) — all grounded by construction.

interface BuildCtx {
  run: SignalRun
  insight: Insight
  focal?: string
  /** The value shown on the front for this signal, if it is an evidence row —
   *  keeps the back numerically identical to the front. Falls back to s.value. */
  shown: (s: Signal) => number | null
}

interface MethodSpec {
  key: string
  name: string
  refTag: string
  gloss: string
  formulaTeX: string
  match: (s: Signal) => boolean
  build: (sigs: Signal[], ctx: BuildCtx) => Omit<MethodDescriptor, 'lens'> | null
}

// Fixed analytical lens for each method family (deterministic; brief §4). Technical
// has no method here (no price/volume signals yet) — it renders as an honest empty
// state, N/A for unlisted names.
const METHOD_LENS: Record<string, Lens> = {
  zscore: 'fundamental', solvency_runway: 'fundamental', solvency_headroom: 'fundamental',
  warranted_pb: 'fundamental', pgwp_growth: 'fundamental', uw_identity: 'fundamental',
  cr_decomp: 'fundamental', ols_trend: 'fundamental', mix_attrib: 'fundamental',
  marginal_share: 'macro', guidance_hitrate: 'sentiment', consensus_dynamics: 'sentiment',
}
const lensFor = (key: string): Lens => METHOD_LENS[key] ?? 'fundamental'
const LENS_FAMILIES: Record<Lens, string[]> = {
  fundamental: ['dispersion', 'combined_ratio', 'solvency', 'valuation', 'growth_quality'],
  technical: [],
  sentiment: ['management', 'consensus'],
  macro: ['marginal_share'],
}
export const LENS_ORDER: Lens[] = ['fundamental', 'technical', 'sentiment', 'macro']

/** Pick the focal insurer's signal if present, else the first. */
const lead = (sigs: Signal[], focal?: string): Signal => sigs.find((s) => s.insurer === focal) ?? sigs[0]

/** Honest growth-adjusted (PEG) read for the P/GWP step. States the raw multiple
 *  gap AND the growth gap, then concludes in words — so it never asserts "not
 *  faster growth" when the focal name in fact grows faster. Emits only the already
 *  grounded numbers (the two P/GWP multiples + the two growth rates); the PEG
 *  ratio itself is described, not printed, to keep every number signal-traceable. */
function pegRobustness(v: Signal, pgwp: number, g: number | null, other?: Signal, og?: number | null): string {
  if (!other) return 'Reads the premium multiple against its own GWP growth, not just its level.'
  const ov = other.value as number
  const mult = pgwp > ov ? 'higher' : pgwp < ov ? 'lower' : 'a similar'
  const head = `${pretty(v.insurer)} carries ${mult === 'a similar' ? 'a similar' : `a ${mult}`} ${fmt(pgwp)}x vs ${pretty(other.insurer)}'s ${fmt(ov)}x`
  if (g == null || og == null) return `${head}.`
  const growth = `on ~${fmt(g)}% vs ~${fmt(og)}% GWP growth`
  let tail: string
  if (pgwp > ov) tail = g > og ? `${growth} — the richer multiple is buying faster growth, not pure re-rating` : `${growth} — a higher multiple without faster growth to justify it`
  else if (pgwp < ov) tail = g > og ? `${growth} — a lower multiple even on faster growth` : growth
  else tail = growth
  return `${head}, ${tail}.`
}

const SPECS: MethodSpec[] = [
  // 1 ── Cross-sectional outlier: standard score (z) ──────────────────────────
  {
    key: 'zscore',
    name: 'Cross-sectional outlier — standard score (z)',
    refTag: 'Empirical-rule outlier',
    gloss: 'How many peer standard deviations a value sits from the peer mean.',
    formulaTeX: 'z = \\dfrac{x_i - \\mu_{\\text{peer}}}{\\sigma_{\\text{peer}}}, \\quad \\text{flag } |z| \\ge 1.5',
    match: (s) => s.family === 'dispersion' && s.comparison?.zScore != null,
    build: (sigs, ctx) => {
      const o = lead(sigs, ctx.focal)
      const c = o.comparison!
      const peer = find(ctx.run, 'panel', new RegExp(`^${o.metric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} — peer mean`), o.period)
      const sd = num(/sd=([\d.]+)/, peer?.note)
      const n = num(/n=(\d+)/, peer?.note)
      const xi = ctx.shown(o) ?? (o.value as number)
      const mu = c.referenceValue
      const z = c.zScore as number
      const inputs: MethodInput[] = [
        { symbol: 'x_i', label: `${pretty(o.insurer)} · ${o.metric}`, value: xi, unit: o.unit, insurer: o.insurer, period: o.period, layer: primaryLayer(o) },
        { symbol: 'μ', label: 'Peer mean', value: mu, unit: o.unit, insurer: 'panel', period: o.period, layer: primaryLayer(peer ?? o) },
      ]
      if (sd != null) inputs.push({ symbol: 'σ', label: 'Peer standard deviation', value: sd, unit: o.unit, insurer: 'panel', period: o.period, layer: primaryLayer(peer ?? o) })
      const instanceTeX = sd != null
        ? `z = \\dfrac{${fmt(xi)} - ${fmt(mu)}}{${fmt(sd)}} = ${signed(z)}\\,\\sigma`
        : `z = ${signed(z)}\\,\\sigma`
      const better = /lower-is-better/.test(o.note ?? '') ? 'lower-is-better' : 'higher-is-better'
      return {
        key: 'zscore', name: 'Cross-sectional outlier — standard score (z)', refTag: 'Empirical-rule outlier',
        gloss: 'How many peer standard deviations a value sits from the peer mean.',
        formulaTeX: 'z = \\dfrac{x_i - \\mu_{\\text{peer}}}{\\sigma_{\\text{peer}}}, \\quad \\text{flag } |z| \\ge 1.5',
        instanceTeX, inputs,
        statistic: { symbol: 'z', value: z, unit: 'σ' },
        threshold: { rule: `|z| ≥ 1.5σ (${better})`, value: 1.5, passed: Math.abs(z) >= 1.5 },
        robustness: `Measured across ${n ?? 'the'} peers in one cross-section; |z| ≥ 1.5σ is the empirical-rule gate for a genuine outlier rather than ordinary spread.`,
      }
    },
  },

  // 2 ── Solvency runway: extrapolation to the regulatory floor ────────────────
  {
    key: 'solvency_runway',
    name: 'Solvency runway — extrapolation to the regulatory floor',
    refTag: 'Linear runway-to-floor',
    gloss: 'How many years of growth-driven erosion until solvency reaches the IRDAI floor.',
    formulaTeX: 't = \\dfrac{\\ln\\!\\left(S / S_{\\text{floor}}\\right)}{\\ln\\!\\left(1 + g\\right)}, \\quad S_{\\text{floor}} = 150\\%',
    match: (s) => s.family === 'solvency' && /Raise-pressure/.test(s.metric),
    build: (sigs, ctx) => {
      const r = lead(sigs, ctx.focal)
      const sol = find(ctx.run, r.insurer, /^Solvency ratio/, r.period)
      const S = sol?.value ?? null
      const g = num(/at\s+(-?[\d.]+)%\s+GWP growth/, r.note)
      const t = ctx.shown(r) ?? (r.value as number)
      const peers = sigs.filter((s) => s.insurer !== r.insurer)
        .map((s) => `${pretty(s.insurer)} ~${fmt(ctx.shown(s) ?? s.value)} yrs`)
      const inputs: MethodInput[] = [
        { symbol: 'S', label: `${pretty(r.insurer)} · solvency ratio`, value: S, unit: 'x', insurer: r.insurer, period: r.period, layer: primaryLayer(sol ?? r) },
        { symbol: 'S_{floor}', label: 'IRDAI control floor', value: 1.5, unit: 'x', period: r.period, layer: 'statutory' },
        { symbol: 'g', label: `${pretty(r.insurer)} · GWP growth`, value: g, unit: '%', insurer: r.insurer, period: r.period, layer: 'derived' },
      ]
      const instanceTeX = S != null && g != null
        ? `t = \\dfrac{\\ln(${fmt(S)} / 1.5)}{\\ln(1 + ${fmt(g)}\\%)} \\approx ${fmt(t)}\\text{ yrs}`
        : `t \\approx ${fmt(t)}\\text{ yrs}`
      return {
        key: 'solvency_runway', name: 'Solvency runway — extrapolation to the regulatory floor', refTag: 'Linear runway-to-floor',
        gloss: 'How many years of growth-driven erosion until solvency reaches the IRDAI floor.',
        formulaTeX: 't = \\dfrac{\\ln\\!\\left(S / S_{\\text{floor}}\\right)}{\\ln\\!\\left(1 + g\\right)}, \\quad S_{\\text{floor}} = 150\\%',
        instanceTeX, inputs,
        statistic: { symbol: 't', value: t, unit: 'periods' },
        robustness: `Headroom eroded at the trailing GWP growth rate, not a company forecast.${peers.length ? ` Thinnest in the panel vs ${peers.join(', ')}.` : ''}`,
      }
    },
  },

  // 3 ── Solvency headroom: level vs the floor ─────────────────────────────────
  {
    key: 'solvency_headroom',
    name: 'Solvency headroom — level vs the regulatory floor',
    refTag: 'Cushion above floor',
    gloss: 'The solvency cushion held above the 150% control level.',
    formulaTeX: '\\text{headroom} = S - S_{\\text{floor}}, \\quad S_{\\text{floor}} = 1.5\\text{x}\\,(150\\%)',
    match: (s) => s.family === 'solvency' && /^Solvency ratio/.test(s.metric),
    build: (sigs, ctx) => {
      const lo = lead(sigs, ctx.focal)
      const inputs: MethodInput[] = sigs.map((s) => ({ symbol: s.insurer === lo.insurer ? 'S' : `S_{${pretty(s.insurer).split(' ')[0]}}`, label: `${pretty(s.insurer)} · solvency ratio`, value: ctx.shown(s) ?? s.value, unit: 'x', insurer: s.insurer, period: s.period, layer: primaryLayer(s) }))
      inputs.push({ symbol: 'S_{floor}', label: 'IRDAI control floor', value: 1.5, unit: 'x', period: lo.period, layer: 'statutory' })
      const S = (ctx.shown(lo) ?? lo.value) as number
      const head = lo.comparison?.delta ?? Math.round((S - 1.5) * 100) / 100
      return {
        key: 'solvency_headroom', name: 'Solvency headroom — level vs the regulatory floor', refTag: 'Cushion above floor',
        gloss: 'The solvency cushion held above the 150% control level.',
        formulaTeX: '\\text{headroom} = S - S_{\\text{floor}}, \\quad S_{\\text{floor}} = 1.5\\text{x}\\,(150\\%)',
        instanceTeX: `\\text{headroom} = ${fmt(S)} - 1.5 = ${signed(head)}\\text{x}`,
        inputs,
        statistic: { symbol: 'headroom', value: head, unit: 'x' },
        threshold: { rule: 'S ≥ 1.5x (IRDAI control level)', value: 1.5, passed: S >= 1.5 },
        robustness: 'A static cushion ignores growth; pair with the runway method, which ages the cushion forward at the GWP growth rate.',
      }
    },
  },

  // 4 ── Valuation: justified (warranted) P/B from ROE ─────────────────────────
  {
    key: 'warranted_pb',
    name: 'Valuation dislocation — justified P/B (Gordon)',
    refTag: 'Warranted multiple',
    gloss: 'The P/B a stock deserves on its return on equity vs its cost of equity.',
    formulaTeX: 'P/B^{*} = \\dfrac{ROE - g}{CoE - g} \\;\\xrightarrow{\\,g \\to 0\\,}\\; \\dfrac{ROE}{CoE}',
    match: (s) => s.family === 'valuation' && /P\/B/.test(s.metric),
    build: (sigs, ctx) => {
      const v = lead(sigs, ctx.focal)
      const c = v.comparison
      const pb = (ctx.shown(v) ?? v.value) as number
      const warranted = c?.referenceValue ?? null
      const gap = c?.delta ?? (warranted != null ? Math.round((pb - warranted) * 100) / 100 : null)
      const roeSig = find(ctx.run, v.insurer, /^ROE/, undefined)
      const roe = roeSig?.value ?? num(/on\s+([\d.]+)%\s+ROE/, v.note)
      const coe = num(/@\s+(\d+)%\s+CoE/, v.note) ?? 12
      const cr = find(ctx.run, v.insurer, /^Combined ratio$/)?.value ?? null
      const cons = find(ctx.run, v.insurer, /Consensus upside/)
      const analysts = num(/n=(\d+)/, cons?.note)
      const inputs: MethodInput[] = [
        { symbol: 'ROE', label: `${pretty(v.insurer)} · return on equity`, value: roe, unit: '%', insurer: v.insurer, period: roeSig?.period ?? v.period, layer: primaryLayer(roeSig ?? v) },
        { symbol: 'CoE', label: 'Cost of equity (assumption)', value: coe, unit: '%', period: v.period, layer: 'derived' },
        { symbol: 'P/B', label: `${pretty(v.insurer)} · market price-to-book`, value: pb, unit: 'x', insurer: v.insurer, period: v.period, layer: primaryLayer(v) },
      ]
      const robustBits: string[] = []
      if (cr != null) robustBits.push(`underwriting is still loss-making (CR ${fmt(cr)}% > 100)`)
      if (analysts != null) robustBits.push(`only ${analysts} analysts cover the name`)
      return {
        key: 'warranted_pb', name: 'Valuation dislocation — justified P/B (Gordon)', refTag: 'Warranted multiple',
        gloss: 'The P/B a stock deserves on its return on equity vs its cost of equity.',
        formulaTeX: 'P/B^{*} = \\dfrac{ROE - g}{CoE - g} \\;\\xrightarrow{\\,g \\to 0\\,}\\; \\dfrac{ROE}{CoE}',
        instanceTeX: roe != null && warranted != null
          ? `P/B^{*} = \\dfrac{${fmt(roe)}\\%}{${fmt(coe)}\\%} \\approx ${fmt(warranted)}\\text{x} \\;\\;(\\text{market } ${fmt(pb)}\\text{x},\\ ${signed(gap)}\\text{x})`
          : `P/B = ${fmt(pb)}\\text{x}`,
        inputs,
        statistic: { symbol: 'P/B^{*}', value: warranted ?? pb, unit: 'x' },
        threshold: warranted != null ? { rule: 'market P/B ≤ warranted ⇒ cheap; > ⇒ prices in ROE expansion', value: warranted, passed: pb <= warranted } : undefined,
        robustness: robustBits.length ? `The multiple is a forward-ROE option: ${robustBits.join(' and ')} — little margin for a slip in the ROE path the price already assumes.` : 'Warranted multiple assumes a steady state (g → 0); the gap is the market’s implied ROE expansion.',
      }
    },
  },

  // 5 ── Valuation: growth-adjusted P/GWP (PEG-style) ──────────────────────────
  {
    key: 'pgwp_growth',
    name: 'Growth-adjusted multiple — P/GWP vs GWP growth',
    refTag: 'PEG-style sanity check',
    gloss: 'Whether a richer premium multiple is actually buying faster growth.',
    formulaTeX: '\\text{richness} = \\dfrac{P/GWP}{g_{\\text{GWP}}} \\quad (\\text{higher} \\Rightarrow \\text{paying more per point of growth})',
    match: (s) => s.family === 'valuation' && /P\/GWP/.test(s.metric),
    build: (sigs, ctx) => {
      const v = lead(sigs, ctx.focal)
      const pgwp = (ctx.shown(v) ?? v.value) as number
      const g = v.comparison?.referenceValue ?? num(/on\s+~?([\d.]+)%\s+GWP growth/, v.note)
      const inputs: MethodInput[] = sigs.map((s) => {
        const gg = s.comparison?.referenceValue ?? num(/on\s+~?([\d.]+)%\s+GWP growth/, s.note)
        return { symbol: s.insurer === v.insurer ? 'P/GWP' : `P/GWP_{${pretty(s.insurer).split(' ')[0]}}`, label: `${pretty(s.insurer)} · P/GWP @ ~${fmt(gg)}% GWP growth`, value: ctx.shown(s) ?? s.value, unit: 'x', insurer: s.insurer, period: s.period, layer: primaryLayer(s) }
      })
      const other = sigs.find((s) => s.insurer !== v.insurer)
      const og = other ? (other.comparison?.referenceValue ?? num(/on\s+~?([\d.]+)%\s+GWP growth/, other.note)) : null
      const instanceTeX = other
        ? `${fmt(pgwp)}\\text{x} \\,@\\, ${fmt(g)}\\% \\;\\;\\text{vs}\\;\\; ${fmt(other.value)}\\text{x} \\,@\\, ${fmt(og)}\\%`
        : `${fmt(pgwp)}\\text{x} \\,@\\, ${fmt(g)}\\%\\text{ GWP growth}`
      return {
        key: 'pgwp_growth', name: 'Growth-adjusted multiple — P/GWP vs GWP growth', refTag: 'PEG-style sanity check',
        gloss: 'Whether a richer premium multiple is actually buying faster growth.',
        formulaTeX: '\\text{richness} = \\dfrac{P/GWP}{g_{\\text{GWP}}} \\quad (\\text{higher} \\Rightarrow \\text{paying more per point of growth})',
        instanceTeX, inputs,
        statistic: { symbol: 'P/GWP', value: pgwp, unit: 'x' },
        robustness: pegRobustness(v, pgwp, g, other, og),
      }
    },
  },

  // 6 ── Earnings quality: underwriting identity (CR vs break-even) ────────────
  {
    key: 'uw_identity',
    name: 'Earnings quality — underwriting identity',
    refTag: 'Combined-ratio break-even',
    gloss: 'A combined ratio above 100% means the core insurance book loses money.',
    formulaTeX: 'CR = \\text{Loss Ratio} + \\text{Expense Ratio}, \\quad \\text{UW profit} \\iff CR < 100\\%',
    match: (s) => s.family === 'combined_ratio' && /^Combined ratio$/.test(s.metric),
    build: (sigs, ctx) => {
      const focal = lead(sigs, ctx.focal)
      const inputs: MethodInput[] = sigs.map((s) => ({ symbol: sigs.length > 1 ? `CR_{${pretty(s.insurer).split(' ')[0]}}` : 'CR', label: `${pretty(s.insurer)} · combined ratio`, value: ctx.shown(s) ?? s.value, unit: '%', insurer: s.insurer, period: s.period, layer: primaryLayer(s) }))
      inputs.push({ symbol: '\\text{B/E}', label: 'Underwriting break-even', value: 100, unit: '%', period: focal.period, layer: 'derived' })
      const cr = (ctx.shown(focal) ?? focal.value) as number
      const vals = sigs.map((s) => (ctx.shown(s) ?? s.value) as number)
      const peerMean = find(ctx.run, 'panel', /^Combined ratio — peer mean/, focal.period)?.value ?? null
      const instanceTeX = sigs.length > 1
        ? `${fmt(Math.min(...vals))}\\% \\le CR \\le ${fmt(Math.max(...vals))}\\%${peerMean != null ? `,\\ \\text{mean } ${fmt(peerMean)}\\%` : ''} > 100\\%`
        : `CR = ${fmt(cr)}\\% > 100\\% \\Rightarrow \\text{underwriting loss}`
      return {
        key: 'uw_identity', name: 'Earnings quality — underwriting identity', refTag: 'Combined-ratio break-even',
        gloss: 'A combined ratio above 100% means the core insurance book loses money.',
        formulaTeX: 'CR = \\text{Loss Ratio} + \\text{Expense Ratio}, \\quad \\text{UW profit} \\iff CR < 100\\%',
        instanceTeX, inputs,
        statistic: { symbol: sigs.length > 1 ? '\\overline{CR}' : 'CR', value: sigs.length > 1 && peerMean != null ? peerMean : cr, unit: '%' },
        threshold: { rule: 'CR < 100% for a genuine underwriting profit', value: 100, passed: cr < 100 },
        robustness: `Combined ratio is a statutory disclosure. Above 100%, reported profit (where positive) is investment-led — the underwriting line itself loses money.`,
      }
    },
  },

  // 7 ── Combined-ratio variance decomposition (claims vs expense) ─────────────
  {
    key: 'cr_decomp',
    name: 'Combined-ratio attribution — variance decomposition',
    refTag: 'Claims vs expense split',
    gloss: 'Splits the year-on-year combined-ratio move into claims and expense drivers.',
    formulaTeX: '\\Delta CR = \\Delta\\text{LR} + \\Delta\\text{ER}',
    match: (s) => s.family === 'combined_ratio' && /Δ Combined ratio/.test(s.metric),
    build: (sigs, ctx) => {
      const d = lead(sigs, ctx.focal)
      const dLR = num(/claims Δ\s*(-?[\d.]+)/, d.note)
      const dER = num(/expense Δ\s*(-?[\d.]+)/, d.note)
      const dCR = (ctx.shown(d) ?? d.value) as number
      return {
        key: 'cr_decomp', name: 'Combined-ratio attribution — variance decomposition', refTag: 'Claims vs expense split',
        gloss: 'Splits the year-on-year combined-ratio move into claims and expense drivers.',
        formulaTeX: '\\Delta CR = \\Delta\\text{LR} + \\Delta\\text{ER}',
        instanceTeX: `\\Delta CR = ${dLR == null ? '\\text{n/a}' : signed(dLR)} + ${dER == null ? '\\text{n/a}' : signed(dER)} = ${signed(dCR)}\\text{pp}`,
        inputs: [
          { symbol: '\\Delta\\text{LR}', label: `${pretty(d.insurer)} · Δ loss ratio`, value: dLR, unit: 'pp', insurer: d.insurer, period: d.period, layer: primaryLayer(d) },
          { symbol: '\\Delta\\text{ER}', label: `${pretty(d.insurer)} · Δ expense ratio`, value: dER, unit: 'pp', insurer: d.insurer, period: d.period, layer: primaryLayer(d) },
        ],
        statistic: { symbol: '\\Delta CR', value: dCR, unit: 'pp' },
        robustness: dLR == null || dER == null ? 'One leg of the split is not separately reported this period, which caps the attribution.' : 'Identity decomposition — the two legs sum exactly to the combined-ratio move.',
      }
    },
  },

  // 8 ── Trend & inflection: OLS slope ─────────────────────────────────────────
  {
    key: 'ols_trend',
    name: 'Trend & inflection — least-squares slope',
    refTag: 'OLS trend',
    gloss: 'The fitted per-year drift of a series — its direction, not a single print.',
    formulaTeX: '\\hat{\\beta} = \\dfrac{\\sum (t - \\bar{t})(y - \\bar{y})}{\\sum (t - \\bar{t})^{2}}',
    match: (s) => s.family === 'growth_quality' && /slope/.test(s.metric),
    build: (sigs, ctx) => {
      const f = lead(sigs, ctx.focal)
      const b = (ctx.shown(f) ?? f.value) as number
      const peers = sigs.filter((s) => s.insurer !== f.insurer)
      const inputs: MethodInput[] = sigs.map((s) => ({ symbol: s.insurer === f.insurer ? '\\hat{\\beta}' : `\\hat{\\beta}_{${pretty(s.insurer).split(' ')[0]}}`, label: `${pretty(s.insurer)} · retail-mix slope`, value: ctx.shown(s) ?? s.value, unit: 'pp', insurer: s.insurer, period: s.period, layer: primaryLayer(s) }))
      return {
        key: 'ols_trend', name: 'Trend & inflection — least-squares slope', refTag: 'OLS trend',
        gloss: 'The fitted per-year drift of a series — its direction, not a single print.',
        formulaTeX: '\\hat{\\beta} = \\dfrac{\\sum (t - \\bar{t})(y - \\bar{y})}{\\sum (t - \\bar{t})^{2}}',
        instanceTeX: `\\hat{\\beta} = ${signed(b)}\\text{ pp/yr}`,
        inputs,
        statistic: { symbol: '\\hat{\\beta}', value: b, unit: 'pp' },
        threshold: { rule: 'sign of β (negative ⇒ retail mix drifting down)', value: 0, passed: b >= 0 },
        robustness: `Least-squares fit over the trailing GI-Council prints — a trend, not one noisy reading.${peers.length ? ` ${pretty(f.insurer)} ${b < 0 ? 'declines' : 'builds'} where ${peers.map((s) => `${pretty(s.insurer)} ${signed(ctx.shown(s) ?? s.value)}`).join(', ')}.` : ''}`,
      }
    },
  },

  // 9 ── Growth-quality / mix attribution (retail vs group) ────────────────────
  {
    key: 'mix_attrib',
    name: 'Growth quality — retail/group mix attribution',
    refTag: 'Contribution decomposition',
    gloss: 'Whether growth is coming from higher-margin retail or thinner group business.',
    formulaTeX: '\\text{retail share} = \\dfrac{GWP_{\\text{retail}}}{GWP_{\\text{total}}}, \\quad \\text{mix shift} = \\Delta\\!\\left(\\tfrac{\\text{retail}}{\\text{total}}\\right)',
    match: (s) => s.family === 'growth_quality',
    build: (sigs, ctx) => {
      const insurer = lead(sigs, ctx.focal).insurer
      const retailG = sigs.find((s) => /Retail health premium growth/.test(s.metric)) ?? find(ctx.run, insurer, /Retail health premium growth/)
      const groupG = sigs.find((s) => /Group health premium growth/.test(s.metric)) ?? find(ctx.run, insurer, /Group health premium growth/)
      const mix = sigs.find((s) => /^Retail mix/.test(s.metric)) ?? find(ctx.run, insurer, /^Retail mix/)
      const inputs: MethodInput[] = []
      if (retailG) inputs.push({ symbol: 'g_{\\text{retail}}', label: `${pretty(insurer)} · retail premium growth`, value: ctx.shown(retailG) ?? retailG.value, unit: '%', insurer, period: retailG.period, layer: primaryLayer(retailG) })
      if (groupG) inputs.push({ symbol: 'g_{\\text{group}}', label: `${pretty(insurer)} · group premium growth`, value: ctx.shown(groupG) ?? groupG.value, unit: '%', insurer, period: groupG.period, layer: primaryLayer(groupG) })
      if (mix) inputs.push({ symbol: '\\tfrac{\\text{retail}}{\\text{total}}', label: `${pretty(insurer)} · retail mix`, value: ctx.shown(mix) ?? mix.value, unit: '%', insurer, period: mix.period, layer: primaryLayer(mix) })
      const headline = retailG ?? mix ?? groupG
      if (!headline) return null
      const rg = retailG ? (ctx.shown(retailG) ?? retailG.value) : null
      const gg = groupG ? (ctx.shown(groupG) ?? groupG.value) : (retailG?.comparison?.referenceValue ?? null)
      const mx = mix ? (ctx.shown(mix) ?? mix.value) : null
      const instanceTeX = rg != null && gg != null
        ? `g_{\\text{retail}} = ${signed(rg)}\\%\\ \\text{vs}\\ g_{\\text{group}} = ${signed(gg)}\\%${mx != null ? `,\\ \\text{mix } ${fmt(mx)}\\%` : ''}`
        : mx != null ? `\\text{retail mix} = ${fmt(mx)}\\%` : `g = ${signed(headline.value)}\\%`
      return {
        key: 'mix_attrib', name: 'Growth quality — retail/group mix attribution', refTag: 'Contribution decomposition',
        gloss: 'Whether growth is coming from higher-margin retail or thinner group business.',
        formulaTeX: '\\text{retail share} = \\dfrac{GWP_{\\text{retail}}}{GWP_{\\text{total}}}, \\quad \\text{mix shift} = \\Delta\\!\\left(\\tfrac{\\text{retail}}{\\text{total}}\\right)',
        instanceTeX, inputs,
        statistic: { symbol: 'g_{\\text{retail}}', value: (rg ?? mx ?? headline.value) as number, unit: '%' },
        threshold: rg != null && gg != null ? { rule: 'retail growth > group growth ⇒ mix improving', value: gg, passed: rg > gg } : undefined,
        robustness: 'Sourced from the GI-Council retail/group health split — a single latest-period growth read, not the multi-year trend, so retail can lead in the newest print even where the trend slope is still down. Growth only improves quality if retail outpaces group and the mix actually rises.',
      }
    },
  },

  // 10 ── Marginal market share (share of incremental premium) ─────────────────
  {
    key: 'marginal_share',
    name: 'Marginal market share — share of incremental premium',
    refTag: 'Incremental vs stock share',
    gloss: 'The share of the segment’s NEW premium an insurer is capturing vs its standing share.',
    formulaTeX: '\\text{marginal share} = \\dfrac{\\Delta GWP_i}{\\Delta GWP_{\\text{seg}}} \\;\\;\\text{vs}\\;\\; \\dfrac{GWP_i}{GWP_{\\text{seg}}}',
    match: (s) => s.family === 'marginal_share',
    build: (sigs, ctx) => {
      const m = lead(sigs, ctx.focal)
      const marginal = (ctx.shown(m) ?? m.value) as number
      const stock = m.comparison?.referenceValue ?? num(/headline retail share\s+([\d.]+)/, m.note)
      return {
        key: 'marginal_share', name: 'Marginal market share — share of incremental premium', refTag: 'Incremental vs stock share',
        gloss: 'The share of the segment’s NEW premium an insurer is capturing vs its standing share.',
        formulaTeX: '\\text{marginal share} = \\dfrac{\\Delta GWP_i}{\\Delta GWP_{\\text{seg}}} \\;\\;\\text{vs}\\;\\; \\dfrac{GWP_i}{GWP_{\\text{seg}}}',
        instanceTeX: `${fmt(marginal)}\\%\\ \\text{of new premium}${stock != null ? `\\ \\text{vs}\\ ${fmt(stock)}\\%\\ \\text{stock share}` : ''}`,
        inputs: [
          { symbol: '\\text{marginal}', label: `${pretty(m.insurer)} · share of incremental premium`, value: marginal, unit: '%', insurer: m.insurer, period: m.period, layer: primaryLayer(m) },
          { symbol: '\\text{stock}', label: `${pretty(m.insurer)} · standing segment share`, value: stock, unit: '%', insurer: m.insurer, period: m.period, layer: primaryLayer(m) },
        ],
        statistic: { symbol: '\\text{marginal}', value: marginal, unit: '%' },
        threshold: stock != null ? { rule: 'marginal > stock ⇒ gaining share', value: stock, passed: marginal > stock } : undefined,
        robustness: 'Incremental share leads stock share — it shows where the segment is heading before the standing table moves.',
      }
    },
  },

  // 11 ── Management credibility: guidance hit-rate ────────────────────────────
  {
    key: 'guidance_hitrate',
    name: 'Management credibility — guidance hit-rate',
    refTag: 'Promise vs delivery',
    gloss: 'The share of tracked guidance management has actually delivered.',
    formulaTeX: '\\text{hit-rate} = \\dfrac{\\text{delivered}}{\\text{total tracked}}',
    match: (s) => s.family === 'management' && !s.dataGap,
    build: (sigs, ctx) => {
      const g = lead(sigs, ctx.focal)
      const delivered = num(/(\d+)\/\d+\s+delivered/, g.note)
      const total = num(/\d+\/(\d+)\s+delivered/, g.note)
      const missed = num(/(\d+)\s+missed/, g.note)
      const delayed = num(/(\d+)\s+delayed/, g.note)
      const rate = (ctx.shown(g) ?? g.value) as number
      return {
        key: 'guidance_hitrate', name: 'Management credibility — guidance hit-rate', refTag: 'Promise vs delivery',
        gloss: 'The share of tracked guidance management has actually delivered.',
        formulaTeX: '\\text{hit-rate} = \\dfrac{\\text{delivered}}{\\text{total tracked}}',
        instanceTeX: delivered != null && total != null ? `\\text{hit-rate} = \\dfrac{${delivered}}{${total}} = ${fmt(rate)}\\%` : `\\text{hit-rate} = ${fmt(rate)}\\%`,
        inputs: [
          { symbol: '\\text{delivered}', label: `${pretty(g.insurer)} · guidance delivered`, value: delivered, unit: 'items', insurer: g.insurer, period: g.period, layer: primaryLayer(g) },
          { symbol: '\\text{total}', label: `${pretty(g.insurer)} · guidance tracked`, value: total, unit: 'items', insurer: g.insurer, period: g.period, layer: primaryLayer(g) },
        ],
        statistic: { symbol: '\\text{hit-rate}', value: rate, unit: '%' },
        threshold: missed != null ? { rule: '0 missed items ⇒ credible delivery', value: 0, passed: missed === 0 } : undefined,
        robustness: `Scored against audited outcomes${delayed != null ? `, ${delayed} delayed` : ''}${missed != null ? `, ${missed} missed` : ''} — credibility, not a forecast.`,
      }
    },
  },

  // 12 ── Consensus dynamics: upside + dispersion ──────────────────────────────
  {
    key: 'consensus_dynamics',
    name: 'Consensus dynamics — upside & dispersion',
    refTag: 'Street view',
    gloss: 'How much upside the Street prices and how tightly analysts agree.',
    formulaTeX: '\\text{upside} = \\dfrac{\\overline{tgt} - P}{P}, \\quad \\text{dispersion} = \\dfrac{\\text{high} - \\text{low}}{\\overline{tgt}}',
    match: (s) => s.family === 'consensus',
    build: (sigs, ctx) => {
      const up = sigs.find((s) => /upside/i.test(s.metric)) ?? find(ctx.run, lead(sigs, ctx.focal).insurer, /upside/i)
      const disp = sigs.find((s) => /dispersion/i.test(s.metric)) ?? find(ctx.run, lead(sigs, ctx.focal).insurer, /dispersion/i)
      const base = up ?? disp!
      const analysts = num(/n=(\d+)/, up?.note)
      const inputs: MethodInput[] = []
      if (up) inputs.push({ symbol: '\\text{upside}', label: `${pretty(base.insurer)} · upside to target`, value: ctx.shown(up) ?? up.value, unit: '%', insurer: base.insurer, period: up.period, layer: primaryLayer(up) })
      if (disp) inputs.push({ symbol: '\\text{dispersion}', label: `${pretty(base.insurer)} · target dispersion`, value: ctx.shown(disp) ?? disp.value, unit: '%', insurer: base.insurer, period: disp.period, layer: primaryLayer(disp) })
      const upV = up ? (ctx.shown(up) ?? up.value) : null
      const dispV = disp ? (ctx.shown(disp) ?? disp.value) : null
      return {
        key: 'consensus_dynamics', name: 'Consensus dynamics — upside & dispersion', refTag: 'Street view',
        gloss: 'How much upside the Street prices and how tightly analysts agree.',
        formulaTeX: '\\text{upside} = \\dfrac{\\overline{tgt} - P}{P}, \\quad \\text{dispersion} = \\dfrac{\\text{high} - \\text{low}}{\\overline{tgt}}',
        instanceTeX: `\\text{upside } ${signed(upV)}\\%,\\ \\text{dispersion } ${fmt(dispV)}\\%${analysts != null ? `,\\ n = ${analysts}` : ''}`,
        inputs,
        statistic: { symbol: '\\text{upside}', value: (upV ?? dispV) as number, unit: '%' },
        threshold: analysts != null ? { rule: 'thin coverage (few analysts) ⇒ lightly stress-tested', value: analysts, passed: analysts >= 5 } : undefined,
        robustness: `A broker/aggregator view, not statutory fact.${analysts != null ? ` Only ${analysts} analysts and a tight band — a modest surprise can move the stock more than the consensus implies.` : ''}`,
      }
    },
  },
]

const SPEC_INDEX: Record<string, number> = Object.fromEntries(SPECS.map((s, i) => [s.key, i]))

// ── contributing-signal selection ────────────────────────────────────────────

const normMetric = (m: string) => m.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const metricMatch = (a: string, b: string) => {
  const x = normMetric(a), y = normMetric(b)
  return x === y || x.includes(y) || y.includes(x)
}
const TOL_ABS = 0.06, TOL_REL = 0.012
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(TOL_ABS, Math.abs(b) * TOL_REL)

/** Signals an insight rests on — driven strictly by its EVIDENCE rows (the
 *  structured, intended link the model already curated), ordered by appearance so
 *  the load-bearing metric comes first. A single evidence value can resolve to
 *  more than one signal (e.g. a combined ratio that is both an outlier AND an
 *  underwriting loss), so each lens gets its own method. Corroborating context
 *  the thesis leans on (an insurer's underwriting loss, thin coverage) is surfaced
 *  inside each method's robustness line, not by fuzzy prose-number matching. */
function contributingSignals(insight: Insight, run: SignalRun): { signal: Signal; order: number }[] {
  const picked = new Map<string, { signal: Signal; order: number }>()
  const keyOf = (s: Signal) => `${s.family}|${s.insurer}|${s.metric}|${s.value}`
  insight.evidence.forEach((e, i) => {
    if (e.value == null) return
    const exact = run.signals.filter((s) => !s.dataGap && s.value != null && s.insurer === e.insurer && metricMatch(s.metric, e.metric) && close(s.value as number, e.value as number))
    const hits = exact.length ? exact : run.signals.filter((s) => !s.dataGap && s.value != null && s.insurer === e.insurer && close(s.value as number, e.value as number))
    for (const hit of hits) {
      const k = keyOf(hit)
      const prev = picked.get(k)
      if (!prev || i < prev.order) picked.set(k, { signal: hit, order: prev ? Math.min(prev.order, i) : i })
    }
  })
  return [...picked.values()]
}

// ── assembly ─────────────────────────────────────────────────────────────────

/** Build the deterministic methodology block for one insight from the signal run.
 *  Pure: same (insight, run) → same methodology. The model is never consulted. */
export function assembleMethodology(insight: Insight, run: SignalRun, computedAt?: string): Methodology {
  const contributing = contributingSignals(insight, run)
  const focal = insight.affectedInsurers.length === 1 ? insight.affectedInsurers[0] : undefined

  // Index evidence values so the back shows the same number as the front.
  const shown = (s: Signal): number | null => {
    const e = insight.evidence.find((ev) => ev.value != null && ev.insurer === s.insurer && metricMatch(ev.metric, s.metric) && close(ev.value as number, s.value as number))
    return e ? (e.value as number) : s.value
  }
  const ctx: BuildCtx = { run, insight, focal, shown }

  // Partition contributing signals by their owning spec (first match wins).
  const byKey = new Map<string, { sigs: Signal[]; order: number }>()
  for (const { signal, order } of contributing) {
    const spec = SPECS.find((sp) => sp.match(signal))
    if (!spec) continue
    const cur = byKey.get(spec.key) ?? { sigs: [], order }
    cur.sigs.push(signal)
    cur.order = Math.min(cur.order, order)
    byKey.set(spec.key, cur)
  }

  const steps: MethodDescriptor[] = [...byKey.entries()]
    .sort((a, b) => a[1].order - b[1].order || SPEC_INDEX[a[0]] - SPEC_INDEX[b[0]])
    .map(([key, { sigs }]) => {
      const built = SPECS.find((s) => s.key === key)!.build(sigs, ctx)
      return built ? { ...built, lens: lensFor(key) } : null
    })
    .filter((d): d is MethodDescriptor => d != null)

  return {
    steps,
    lenses: assembleLenses(steps, insight, run),
    payloadHash: hashPayload(contributing.map(({ signal }) => signal).sort((a, b) => (a.insurer + a.metric).localeCompare(b.insurer + b.metric))),
    computedAt: computedAt ?? new Date().toISOString(),
    isQuantitative: steps.length > 0,
  }
}

/** Listed insurers, derived from the data: only listed names carry valuation signals. */
const listedSet = (run: SignalRun): Set<string> => new Set(run.signals.filter((s) => s.family === 'valuation' && s.insurer !== 'panel').map((s) => s.insurer))

/** The fixed four-lens frame, assembled deterministically — always all four,
 *  honest when empty (Technical is N/A for unlisted names; a missing input shows
 *  the verbatim gap reason and visibly caps conviction). */
function assembleLenses(steps: MethodDescriptor[], insight: Insight, run: SignalRun): Record<Lens, LensBlock> {
  const listed = listedSet(run)
  const affected = insight.affectedInsurers.filter((id) => id !== 'panel')
  const anyListed = affected.length ? affected.some((id) => listed.has(id)) : true
  const inScope = (insurer: string) => affected.length === 0 || affected.includes(insurer)
  const out = {} as Record<Lens, LensBlock>
  for (const lens of LENS_ORDER) {
    const stepKeys = steps.filter((s) => s.lens === lens).map((s) => s.key)
    if (stepKeys.length) { out[lens] = { status: 'populated', stepKeys }; continue }
    if (lens === 'technical') {
      out[lens] = affected.length && !anyListed
        ? { status: 'not_applicable', reason: 'Unlisted — no market price/volume.', stepKeys: [] }
        : { status: 'no_signal', stepKeys: [] }
      continue
    }
    const gap = run.signals.find((s) => s.dataGap && LENS_FAMILIES[lens].includes(s.family) && inScope(s.insurer))
    out[lens] = gap
      ? { status: 'data_gap', reason: gap.note || 'Input not staged for this period.', stepKeys: [] }
      : { status: 'no_signal', stepKeys: [] }
  }
  return out
}

/** Every number the model-authored forward blocks render — for grounding (§9.2). */
export function forwardNumbers(insight: Insight): number[] {
  const out: number[] = []
  if (insight.application) {
    out.push(...numbersIn(insight.application.framing))
    for (const u of insight.application.uses) out.push(...numbersIn(`${u.angle} ${u.detail}`))
  }
  if (insight.watch) for (const w of insight.watch.items) out.push(...numbersIn([w.trigger, w.condition, w.cadence ?? ''].join(' ')))
  return out
}

/** Every number a methodology renders — for the numeric-grounding guardrail. */
export function methodologyNumbers(m: Methodology): number[] {
  const out: number[] = []
  for (const step of m.steps) {
    for (const inp of step.inputs) if (inp.value != null) out.push(inp.value)
    out.push(step.statistic.value)
    if (step.threshold) out.push(step.threshold.value)
    out.push(...numbersIn([step.name, step.refTag, step.gloss, step.instanceTeX, step.robustness ?? ''].join(' ')))
  }
  return out
}
