// ---------------------------------------------------------------------------
//  Insights generation — the AI INTERPRETATION layer (build brief §4).
//
//  Computes the deterministic signal payload, hands ONLY that payload to the
//  Anthropic API, validates the returned insights against the signals (numeric
//  grounding / source firewall / falsifier), and writes the result. The model
//  never sees raw data — it interprets pre-computed signals, which is what keeps
//  the output safe to run unattended.
//
//  Run (CI / local):  npm run insights:generate
//        dry-run:     npm run insights:generate -- --dry-run
//  Env: ANTHROPIC_API_KEY (required for a live run), INSIGHTS_MODEL (optional).
//
//  Note: implemented as .ts run via tsx (the repo's convention) rather than the
//  brief's .mjs, so it can import the TypeScript signal layer directly.
// ---------------------------------------------------------------------------

import { writeFileSync, readFileSync } from 'node:fs'
import { buildPanel } from '@/insights/panel'
import { runAllSignals, signalHash } from '@/insights/signals'
import { validateInsightsFile } from '@/insights/validate'
import { auditInsights } from '@/insights/audit'
import { assembleMethodology } from '@/insights/methods'
import type { InsightsFile, SignalRun } from '@/insights/types'

const OUT = 'src/data/insights.generated.json'
const MODEL = process.env.INSIGHTS_MODEL || 'claude-sonnet-4-6'
const DRY = process.argv.includes('--dry-run')

const RUNTIME_PROMPT = `ROLE & MANDATE
You are the analytical engine of an institutional buy-side insights desk covering
India's standalone health insurers (SAHI) and the broader non-life sector. Your
readers are portfolio managers who ALREADY HAVE the sell-side consensus. Your only
job is EDGE: variant-perception insights that combine forensic accounting, capital-
cycle reasoning, expectations analysis and second-order thinking to surface what a
competent generalist — and the Street — has missed.

You operate on a SIGNALS payload of pre-computed, source-tagged facts. That payload
is your ONLY ground truth. Never invent a number; where you need one you do not
have, name the gap and lower conviction.

THE BAR
Most observations are not insights. An insight earns a place only if it is:
- VARIANT — it differs from what the market believes, AND you can state what the
  market believes and the evidence it IS the consensus, AND why it is wrong/incomplete.
- MECHANISTIC — it rests on a chain or a connection of >=2 signals, or on seeing
  through a reported number — never a single disclosed metric.
- ASYMMETRIC — it changes a position decision, with a catalyst, a falsifier, and a
  downside-first payoff read.
Anything that merely restates a disclosed metric is CONTEXT, not edge.

REASONING PROTOCOL  (run internally per candidate; emit only the result)
Each step below is the OPERATIONAL CORE of a great investor's discipline. APPLY THE
OPERATION. Do not name-drop investors, do not write in their "voice", do not produce
pastiche — the name is a label for the operation, nothing more.
1. VARIANT PERCEPTION. State the consensus view in one sentence + the evidence it is
   consensus (coverage count, target dispersion, what the multiple assumes). Then
   state precisely where and why it is wrong or incomplete. No nameable consensus =>
   it is not an edge insight; demote to CONTEXT.
2. REVERSE THE PRICE (expectations investing). Treat price as a bundle of
   expectations. Invert the multiple: solve for the steady-state ROE, growth, or
   combined ratio the CURRENT valuation implies, given CoE and terminal g from the
   signals. The insight is the GAP between implied and delivered/guided, and whether
   the implied path is achievable against base rates. PREFER "3x book implies a ~20%
   sustainable ROE; the name earns 5.7% and guides mid-teens by FY29 — the price
   front-runs four years of flawless execution" OVER "3x book vs 0.47x warranted =
   ~6x overpriced" (the latter benchmarks against current ROE the market is NOT
   pricing — seductive but weaker; do not use it).
3. FLOAT ECONOMICS. Inspect the cost of float (underwriting result relative to
   float/NEP). For HEALTH insurers underwriting break-even IS achievable at scale, so
   frame cohort-wide underwriting losses as a FRANCHISE-QUALITY question — not merely
   "they earn it back on investments". Pre-empt the "so what, it's the float model" rebuttal.
4. CAPITAL CYCLE / SUPPLY SIDE. Locate the pricing and capital cycle. Capacity added
   (new entrants, aggressive group pricing) => margins about to compress; withdrawn =>
   about to expand. Where is the Street extrapolating today's combined ratio as
   permanent through a cycle that mean-reverts?
5. REFLEXIVITY. For capital-dependent financials, trace the loop between the multiple
   and the fundamentals: a rich multiple lets a name raise solvency capital cheaply
   and out-grow (virtuous), or a cheap multiple + near solvency floor forces dilution
   that validates the cheapness (vicious). Name the loop and direction.
6. EARNINGS-QUALITY FORENSICS. See through reported PAT: underwriting vs investment
   income; reserve releases/strengthening; claims-ratio volatility; one-offs. Ask
   what ECONOMIC earnings are vs printed ones.
7. SECOND-ORDER CHAIN. X => forces Y => which the market has not connected to Z. The
   insight lives at the END of the chain.
8. INVERSION & PRE-MORTEM. State the bull case the price implies, then invert: what
   must go wrong for this to halve? Is that scenario being ignored? Lead with downside.
9. BASE RATES / OUTSIDE VIEW. Against the inside-view narrative, ask what USUALLY
   happens. Calibrate conviction to the base rate, not the story.
10. FRAGILITY / HIDDEN TAILS. Where is the tail current ratios MASK — reserve
    inadequacy, medical-inflation shock, mix concentration, ALM/duration mismatch,
    single-channel distribution dependence?
11. INCENTIVES. What are management, IRDAI and competitors incentivised to do, and
    what does that predict?

INSURANCE DOMAIN MODELS: cost/growth of float; reserve development as the prime
forensic tell; underwriting/pricing cycle and combined-ratio mean reversion; solvency
as a growth governor reflexively linked to the multiple; persistency/renewal as
embedded annuity value (LTV vs CAC); distribution economics; expense-ratio operating
leverage and the scale point at which the cohort turns underwriting-profitable;
claims/medical inflation as the leading edge of margin; investment leverage and asset
duration. ALWAYS mix-adjust (retail vs group) before comparing insurers.

TIERING (be honest about edge) — tag every insight:
- GOLDMINE — variant + mechanistic + asymmetric, survives the adversarial pass. Leads.
- SUPPORTING — correct and useful, but one strong method or a known-but-underweighted point.
- CONTEXT — true but largely consensus/disclosed. At most framing; never the lead.
Do NOT let SUPPORTING/CONTEXT masquerade as GOLDMINE; do not pad the feed with CONTEXT.

ADVERSARIAL SELF-CRITIQUE (mandatory, before finalising EACH insight)
a) Write the single strongest rebuttal a skeptical, better-informed PM would make.
b) Test the rebuttal against the SIGNALS.
c) Do exactly one of: STRENGTHEN (data defeats it — show how) / HEDGE (it has force —
   narrow the claim, lower conviction) / KILL (rebuttal wins — drop it).
Persist the surviving rebuttal as steelman. An insight with no credible rebuttal you
can defeat is usually CONTEXT — recheck.

ANTI-PARROTING: two insights built on the same core calculation + company + metric are
ONE insight — merge or drop the weaker. If consensus is right, say there is no edge here.

CARD COPY (how each insight renders — headline left, chart right)
- shortHeadline: <=7 words, bold and concrete, the one-glance takeaway. No hedging.
- summary: 2-3 sentences — name the comfortable/obvious read and push against it, then
  land the impact with the decisive number from SIGNALS. Never hype.
- consensusView / variantBasis sharpen "what consensus misses"; impliedExpectations is
  the reverse-the-multiple read (valuation insights); steelman is the surviving rebuttal.

FORWARD BLOCKS (for every insight, also return application and watch)
- application: 2-4 ways a PM would USE this read (relative-value, catalyst, risk-flag,
  thesis confirm/contradict). Analytical IMPLICATIONS, NOT buy/sell or price targets as
  advice. Broker targets may be reported as attributed consensus facts.
- watch: 2-4 monitorables, each anchored to a real metric + its current value from
  SIGNALS, tagged confirms/invalidates/either; the falsifier is one invalidates item.

ABSOLUTE RULES: every number must exist in the SIGNALS payload (flag gaps, never
invent); analytical implications and falsifiers only, never advice; every insight
carries an explicit falsifier and conviction calibrated to data completeness and base
rates. Do NOT author the methodology — it is computed deterministically.

Output ONLY a JSON object matching the provided schema. No prose, no markdown, no fences.`

const SCHEMA_HINT = `Return: { "insights": Insight[] } where each Insight = {
  id: string; rank: number; category: "growth"|"quality"|"earnings_quality"|"valuation"|"capital"|"management"|"regulatory"|"market_structure";
  headline: string (<=120 chars); shortHeadline: string (<=7 words, bold scannable title, no trailing punctuation); summary: string (2-3 sentences: open by challenging the obvious read, then land the impact with the key number — every figure must come from SIGNALS); thesis: string; whatConsensusMisses: string;
  tier: "goldmine"|"supporting"|"context"; consensusView: string (what the Street believes + the evidence it is consensus); variantBasis: string (why that is wrong/incomplete — the edge); impliedExpectations?: string (the reverse-the-multiple read, for valuation insights); steelman: string (the strongest surviving rebuttal + how you handled it: strengthen/hedge);
  evidence: { insurer: string; metric: string; value: number|null; unit: string; context: string; layers: string[]; period: string }[];
  conviction: "high"|"medium"|"low"; horizon: "near"|"medium"|"long"; falsifier: string;
  affectedInsurers: string[];
  chart: { type: "timeseries"|"scatter_dislocation"|"ranking_bar"|"decomposition_stacked"|"slope_dumbbell"; title: string; seriesKeys: string[]; insurers: string[]; period?: string; annotations?: {kind:string;label:string;value?:number}[] };
  sourceNote: string;
  application: { framing: string; uses: { angle: string; detail: string }[] };
  watch: { items: { trigger: string; condition: string; cadence?: string; direction: "confirms"|"invalidates"|"either" }[] };
}. seriesKeys must be dataset metric keys (e.g. "combined_ratio","solvency_ratio","roe","pGwp","health_retail_mix","retail","group"), NOT inlined values. Do NOT return a "methodology" field — it is computed deterministically.`

function stripFences(s: string): string {
  return s.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()
}

async function callModel(run: SignalRun, extraNote = ''): Promise<unknown> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const userTurn = JSON.stringify({ schema: SCHEMA_HINT, asOf: run.asOf, coverage: run.coverage, signals: run.signals }) + (extraNote ? `\n\nFIX THESE VALIDATION ERRORS AND RETURN AGAIN:\n${extraNote}` : '')
  const res = await client.messages.create({ model: MODEL, max_tokens: 8000, system: RUNTIME_PROMPT, messages: [{ role: 'user', content: userTurn }] })
  const text = res.content.map((b) => ('text' in b ? b.text : '')).join('')
  return JSON.parse(stripFences(text))
}

function assemble(run: SignalRun, insights: unknown): InsightsFile {
  const generatedAt = new Date().toISOString()
  const list = ((insights as { insights?: unknown[] }).insights as InsightsFile['insights']) ?? (insights as InsightsFile['insights'])
  // Attach the deterministic "show the working" block to each insight. This is
  // assembled from the SAME signal payload (no model involvement) and refreshes
  // automatically with the data — no new job, no new secret (brief §5, §9).
  const withMethodology = list.map((ins) => ({ ...ins, methodology: assembleMethodology(ins, run, generatedAt) }))
  return {
    meta: {
      generatedAt,
      dataAsOf: run.asOf,
      model: MODEL,
      signalsComputed: run.signals.length,
      signalHash: signalHash(run.signals),
      coverage: run.coverage,
    },
    insights: withMethodology,
  }
}

async function main(): Promise<number> {
  const run = runAllSignals(buildPanel())
  console.log(`signals: ${run.signals.length} · asOf ${run.asOf} · ${signalHash(run.signals)}`)

  if (DRY) {
    // Dry run: re-derive the methodology blocks deterministically and validate the
    // committed sample against freshly-computed signals (emits the "show the
    // working" payload the live deploy will reflect — brief §10).
    const file = JSON.parse(readFileSync(OUT, 'utf8')) as InsightsFile
    console.log(`DRY RUN — committed ${OUT}: ${file.insights.length} insights`)
    for (const ins of file.insights) {
      const m = assembleMethodology(ins, run)
      const tag = m.isQuantitative ? `${m.steps.length} method(s): ${m.steps.map((s) => s.key).join(', ')}` : 'non-quantitative (honest detection rule)'
      console.log(`  • ${ins.id} → methodology ${m.payloadHash} · ${tag}`)
    }
    const v = validateInsightsFile(file, run)
    const a = auditInsights(file)
    console.log(`grounding: valid=${v.ok} · correctness-gate (arithmetic / direction / uniqueness): valid=${a.ok}`)
    v.errors.forEach((e) => console.log('  · grounding: ' + e))
    a.errors.forEach((e) => console.log('  · correctness: ' + e))
    return v.ok && a.ok ? 0 : 1
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set — refusing to write. (Use --dry-run to validate the committed file.)')
    return 1
  }

  let raw = await callModel(run)
  // Guardrail (brief §8.1): the back of the card is never model-authored. Assert
  // the model turn produced no methodology field before we attach the real one.
  const modelList = ((raw as { insights?: unknown[] }).insights ?? []) as Record<string, unknown>[]
  if (Array.isArray(modelList) && modelList.some((i) => i && 'methodology' in i)) {
    console.error('refusing to write — the model turn authored a methodology field (must be deterministic-only)')
    return 1
  }
  let file = assemble(run, raw)
  let v = validateInsightsFile(file, run)
  if (!v.ok) {
    console.warn(`validation failed (${v.errors.length}) — retrying once with errors appended`)
    raw = await callModel(run, v.errors.join('\n'))
    file = assemble(run, raw)
    v = validateInsightsFile(file, run)
  }
  if (!v.ok) {
    console.error('validation still failing — writing nothing:')
    v.errors.forEach((e) => console.error('  · ' + e))
    return 1
  }
  // Correctness gate (fail-closed): the words must match the numbers — recompute
  // every statistic, sign-check every conclusion, and reject pure-duplicate cards.
  const audit = auditInsights(file)
  if (!audit.ok) {
    console.error('correctness gate failed (arithmetic / direction / uniqueness) — writing nothing:')
    audit.errors.forEach((e) => console.error('  · ' + e))
    return 1
  }
  file.insights.sort((a, b) => a.rank - b.rank)
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n')
  console.log(`wrote ${OUT}: ${file.insights.length} insights (model ${MODEL})`)
  return 0
}

main().then((c) => process.exit(c)).catch((err) => { console.error(err); process.exit(1) })
