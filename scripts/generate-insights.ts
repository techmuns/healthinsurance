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
import type { InsightsFile, SignalRun } from '@/insights/types'

const OUT = 'src/data/insights.generated.json'
const MODEL = process.env.INSIGHTS_MODEL || 'claude-sonnet-4-6'
const DRY = process.argv.includes('--dry-run')

const RUNTIME_PROMPT = `You are a senior buy-side equity analyst and quantitative strategist covering
India's standalone health insurers (SAHI) and the broader non-life insurance
sector. You write for portfolio managers at an institutional client. Your edge
is spotting what sell-side consensus and time-pressed analysts miss.

You are given a SIGNALS payload: pre-computed, source-tagged quantitative facts
about the sector. Treat these as the ONLY ground truth.

HARD RULES
- Use ONLY numbers that appear in the SIGNALS payload. Never invent, round into
  precision, or extrapolate a figure that is not present. If you need a number
  you do not have, say so and lower conviction.
- Every insight must be NON-OBVIOUS. Restating a single metric ("GWP grew 16%,
  strong momentum") is banned. Edge comes from connecting >=2 signals, exposing a
  divergence, an inflection, an earnings-quality issue, a capital-raise lead, a
  consensus blind spot, or a contradiction between sources.
- Respect the source firewall: an insight that depends on broker, exchange,
  or aggregator layers must be labelled as a market/analyst view, never as
  statutory fact. Statutory claims may rest only on statutory/annual_report/ifrs.
- Each insight states an explicit FALSIFIER: the specific, measurable thing that
  would prove the thesis wrong. No falsifier -> do not publish the insight.
- Calibrate conviction honestly. Thin / gapped data caps conviction at "low".
- This is research analysis, not investment advice. Frame as observation +
  falsifier + horizon, never "buy/sell".

RANK every insight by EDGE = (non-obviousness x materiality x conviction).
Return the 6-10 highest-edge insights. Drop everything marginal.

PRESENTATION
- title: a bold, scannable headline of AT MOST 7 words, in plain English (no
  jargon, no "SAHI"). It states the surprising claim — challenge a common belief
  ("X looks safe, but..."). Put NO raw numbers in the title; the figures live in
  thesis / evidence / chart. The title must be faithful to the data, never hyped.
- headline: the longer one-line version of the claim (may carry one figure).
- thesis: the 2-3 sentence impact explanation that backs the title with the real
  numbers and says why it matters / what to act on.

Output ONLY a JSON object matching the provided schema. No prose, no markdown,
no code fences.`

const SCHEMA_HINT = `Return: { "insights": Insight[] } where each Insight = {
  id: string; rank: number; category: "growth"|"quality"|"earnings_quality"|"valuation"|"capital"|"management"|"regulatory"|"market_structure";
  title: string (<=7 words, <=56 chars, plain English, NO raw numbers — the bold headline);
  headline: string (<=120 chars); thesis: string; whatConsensusMisses: string;
  evidence: { insurer: string; metric: string; value: number|null; unit: string; context: string; layers: string[]; period: string }[];
  conviction: "high"|"medium"|"low"; horizon: "near"|"medium"|"long"; falsifier: string;
  affectedInsurers: string[];
  chart: { type: "timeseries"|"scatter_dislocation"|"ranking_bar"|"decomposition_stacked"|"slope_dumbbell"; title: string; seriesKeys: string[]; insurers: string[]; period?: string; annotations?: {kind:string;label:string;value?:number}[] };
  sourceNote: string;
}. seriesKeys must be dataset metric keys (e.g. "combined_ratio","solvency_ratio","roe","pGwp","health_retail_mix","retail","group"), NOT inlined values.`

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
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      dataAsOf: run.asOf,
      model: MODEL,
      signalsComputed: run.signals.length,
      signalHash: signalHash(run.signals),
      coverage: run.coverage,
    },
    insights: (insights as { insights?: unknown[] }).insights as InsightsFile['insights'] ?? (insights as InsightsFile['insights']),
  }
}

async function main(): Promise<number> {
  const run = runAllSignals(buildPanel())
  console.log(`signals: ${run.signals.length} · asOf ${run.asOf} · ${signalHash(run.signals)}`)

  if (DRY) {
    // Dry run: validate the committed sample against freshly-computed signals.
    const file = JSON.parse(readFileSync(OUT, 'utf8')) as InsightsFile
    const v = validateInsightsFile(file, run)
    console.log(`DRY RUN — committed ${OUT}: ${file.insights.length} insights · valid=${v.ok}`)
    v.errors.forEach((e) => console.log('  · ' + e))
    return v.ok ? 0 : 1
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set — refusing to write. (Use --dry-run to validate the committed file.)')
    return 1
  }

  let raw = await callModel(run)
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
  file.insights.sort((a, b) => a.rank - b.rank)
  writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n')
  console.log(`wrote ${OUT}: ${file.insights.length} insights (model ${MODEL})`)
  return 0
}

main().then((c) => process.exit(c)).catch((err) => { console.error(err); process.exit(1) })
