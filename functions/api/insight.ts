// ---------------------------------------------------------------------------
//  /api/insight — the AI Senior-Analyst synthesis (Tier 2, build brief §4.2).
//
//  A Cloudflare Pages Function. It runs ONLY on demand (a click), server-side, so
//  the Anthropic API key NEVER reaches the browser. The browser POSTs only the
//  pre-computed Tier-1 readout + audit metadata (built by src/lib/analystReadout);
//  the model interprets those signals — it is never handed raw data and may never
//  invent a number.
//
//  Mirrors the trusted pattern of scripts/generate-insights.ts:
//    1. interpret a deterministic signal payload,
//    2. validate the output against it (numeric grounding + no-advice),
//    3. retry once with the errors, then fail-closed.
//
//  Caching: identical selections (same signature + model) are served from the
//  Workers cache, so a repeat generation costs nothing. Tier 1 stays free + client
//  side; this endpoint is the only paid call.
// ---------------------------------------------------------------------------

import { isGroundedNumber, numbersIn } from '../../src/insights/grounding'
import type { AnalystRequest, AnalystResult, Conviction } from '../../src/insights/analystTypes'

interface Env {
  ANTHROPIC_API_KEY?: string
  INSIGHTS_MODEL?: string
}
// Minimal Pages-function context (avoids pulling @cloudflare/workers-types).
interface Ctx {
  request: Request
  env: Env
}

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const MAX_SELECTION = 240
const MAX_BODY_BYTES = 256 * 1024

const SYSTEM_PROMPT = `ROLE
You are a senior buy-side insurance analyst covering India's standalone health
insurers (SAHI) and the broader non-life sector. A user has selected specific
audited cells in a data-audit grid and wants your read. You sound like a sharp
senior analyst briefing a portfolio manager: direct, financially intelligent,
concise, insight-heavy, honest about uncertainty. Never a generic chatbot.

GROUND TRUTH
You receive a SIGNALS payload: a deterministic Tier-1 readout (peer ranking,
z-scores, deltas, source quality, gaps) computed from the user's selection, plus
the selected cells with their audit lineage. That payload is your ONLY ground
truth. NEVER invent or estimate a number. Every figure you write must already
appear in the payload (a value, a stat, a z-score, a delta). If you need a number
you do not have, name the gap and lower conviction instead.

HARD RULES
- Premium ≠ profit. GWP / NWP / NEP are premium (scale) metrics, not profit. PAT,
  underwriting result and combined ratio are the profit measures. Never equate
  premium size with quality. Mix-adjust (retail vs group) before comparing insurers.
- Source firewall: statutory claims rest only on statutory/filing sources. If a
  selected value is market/aggregator-sourced, treat it as indicative and say so.
- Honest periods: if the selection is a single fiscal year (singlePeriod), do NOT
  imply a trend — say multi-year is not staged. Only discuss a trend where the
  payload actually carries multi-period points.
- Gaps reduce conviction. Weak coverage or market-only sources ⇒ Medium/Low.
- NO investment advice: never say buy / sell / hold / accumulate, never give a
  price target. Analytical implications only. (Broker targets, if present in the
  payload, may be reported as attributed consensus — not as your advice.)
- Use FY labels (FY25), never calendar years.

OUTPUT — return ONLY a JSON object (no prose, no markdown, no code fences):
{
  "headline": string,              // one sharp sentence: the main insight
  "analystTake": string,           // 2-4 sentences: what the selected data means
  "whatMostPeopleMiss": string,    // the hidden / second-order / misread angle
  "evidence": [ { "label": string, "detail": string } ],  // 2-5 items, selected values only; cite the figure + its source layer
  "peerOrTrendContext": string,    // relative position or change over time; if not enough data, say so plainly
  "riskCaveatFalsifier": string,   // what would make this read wrong
  "conviction": "High" | "Medium" | "Low",
  "convictionRationale": string,   // tie to coverage, source quality, consistency
  "whatToWatchNext": [ string ],   // 2-4 next metrics / filings / data points
  "sourceQualityNote": string      // ready vs gaps, blocked / broker-only cells, source warnings
}`

function json(obj: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  })
}

function stripFences(s: string): string {
  return s.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()
}

/** Numbers in analyst prose, with period/year tokens removed to avoid false
 *  positives (FY25, 2024, 24-25 are labels, not data). */
function proseNumbers(text: string): number[] {
  const cleaned = text
    .replace(/FY\s?\d{2}(?:[-/]\d{2})?/gi, ' ')
    .replace(/\b20\d{2}\b/g, ' ')
    .replace(/\b\d{2}[-/]\d{2}\b/g, ' ')
  return numbersIn(cleaned)
}

const ADVICE_PATTERNS: RegExp[] = [
  /\b(price target|target price)\b/i,
  /\bfair value of\b/i,
  /\b(strong\s+)?(buy|sell)\s+(rating|call|recommendation|the stock|shares)\b/i,
  /\b(we|i)\s+(recommend|advise|rate)\b/i,
  /\brecommend(?:ed|ing)?\s+(?:a\s+)?(?:buy|sell|hold|accumulate|reduce)\b/i,
]

const STRING_FIELDS: (keyof AnalystResult)[] = [
  'headline',
  'analystTake',
  'whatMostPeopleMiss',
  'peerOrTrendContext',
  'riskCaveatFalsifier',
  'convictionRationale',
  'sourceQualityNote',
]

/** Fail-closed correctness gate: structure, numeric grounding, no advice. */
function checkResult(result: unknown, grounded: number[]): { ok: boolean; errors: string[]; value?: AnalystResult } {
  const errors: string[] = []
  if (!result || typeof result !== 'object') return { ok: false, errors: ['model did not return a JSON object'] }
  const r = result as Record<string, unknown>

  for (const f of STRING_FIELDS) if (typeof r[f] !== 'string' || !(r[f] as string).trim()) errors.push(`missing/empty field: ${f}`)
  if (!['High', 'Medium', 'Low'].includes(r.conviction as string)) errors.push('conviction must be High | Medium | Low')
  if (!Array.isArray(r.evidence) || r.evidence.length === 0) errors.push('evidence must be a non-empty array')
  if (!Array.isArray(r.whatToWatchNext) || r.whatToWatchNext.length === 0) errors.push('whatToWatchNext must be a non-empty array')

  // Collect every prose string the model produced.
  const texts: string[] = []
  for (const f of STRING_FIELDS) if (typeof r[f] === 'string') texts.push(r[f] as string)
  if (Array.isArray(r.evidence)) for (const e of r.evidence as { label?: unknown; detail?: unknown }[]) {
    if (typeof e?.label === 'string') texts.push(e.label)
    if (typeof e?.detail === 'string') texts.push(e.detail)
  }
  if (Array.isArray(r.whatToWatchNext)) for (const w of r.whatToWatchNext as unknown[]) if (typeof w === 'string') texts.push(w)

  // Numeric grounding — every number must trace to the Tier-1 readout.
  for (const t of texts) {
    for (const n of proseNumbers(t)) {
      if (!isGroundedNumber(n, grounded)) errors.push(`ungrounded number ${n} in: "${t.slice(0, 60)}…"`)
    }
    for (const p of ADVICE_PATTERNS) if (p.test(t)) errors.push(`investment-advice phrasing in: "${t.slice(0, 60)}…"`)
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, errors: [], value: r as unknown as AnalystResult }
}

async function callAnthropic(apiKey: string, model: string, userTurn: string, fixNote: string): Promise<unknown> {
  const content = userTurn + (fixNote ? `\n\nYOUR PREVIOUS OUTPUT FAILED THESE CHECKS — FIX AND RETURN AGAIN:\n${fixNote}` : '')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`)
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  const text = (data.content ?? []).map((b) => (b.type === 'text' ? b.text ?? '' : '')).join('')
  return JSON.parse(stripFences(text))
}

export const onRequestPost = async (context: Ctx): Promise<Response> => {
  const { request, env } = context

  // Size guard (basic abuse protection; the cache below dedupes repeat calls).
  const lenHeader = Number(request.headers.get('content-length') ?? '0')
  if (lenHeader && lenHeader > MAX_BODY_BYTES) return json({ ok: false, error: 'Selection too large.' }, 413)

  let body: AnalystRequest
  try {
    body = (await request.json()) as AnalystRequest
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400)
  }

  const readout = body?.readout
  if (!readout || !Array.isArray(readout.groundedValues) || !Array.isArray(body.selection)) {
    return json({ ok: false, error: 'Malformed analyst request.' }, 400)
  }
  if (body.selection.length > MAX_SELECTION) return json({ ok: false, error: 'Too many cells selected.' }, 413)
  if (readout.coverage.ready === 0) {
    return json({ ok: false, error: 'No ready, source-backed cells in the selection to analyse.' }, 422)
  }

  if (!env.ANTHROPIC_API_KEY) {
    // Tier 1 still works in the browser; surface this clearly so the UI explains it.
    return json(
      { ok: false, error: 'AI analysis is not configured on the server.', detail: 'Set ANTHROPIC_API_KEY in the Cloudflare Pages project settings to enable it.' },
      503,
    )
  }

  const model = env.INSIGHTS_MODEL || DEFAULT_MODEL
  const signature = readout.signature || 'nosig'

  // Workers cache — identical selection + model ⇒ free repeat.
  const cache = (caches as unknown as { default: Cache }).default
  const cacheKey = new Request(`https://insight.cache/${model}/${signature}`)
  try {
    const hit = await cache.match(cacheKey)
    if (hit) {
      const cached = await hit.json()
      return json({ ...(cached as object), cached: true })
    }
  } catch {
    /* cache is best-effort */
  }

  // Only the signals + a trimmed selection travel to the model (no raw extras).
  const userTurn = JSON.stringify({
    scope: body.scopeLabel,
    readout: {
      scope: readout.scope,
      coverage: readout.coverage,
      metricStats: readout.metricStats,
      trends: readout.trends,
      sourceQuality: readout.sourceQuality,
    },
    selection: body.selection.map((s) => ({
      company: s.companyLabel,
      metric: s.metricLabel,
      period: s.period,
      value: s.value,
      unit: s.unit,
      status: s.statusLabel,
      ready: s.ready,
      sourceLayer: s.sourceLayer,
      sourceClass: s.sourceClass,
      gapReason: s.gapReason,
    })),
  })

  const grounded = readout.groundedValues

  try {
    let raw = await callAnthropic(env.ANTHROPIC_API_KEY, model, userTurn, '')
    let gate = checkResult(raw, grounded)
    if (!gate.ok) {
      raw = await callAnthropic(env.ANTHROPIC_API_KEY, model, userTurn, gate.errors.join('\n'))
      gate = checkResult(raw, grounded)
    }
    if (!gate.ok || !gate.value) {
      return json({ ok: false, error: 'The analysis did not pass the correctness checks.', detail: gate.errors.slice(0, 4).join(' · ') }, 422)
    }

    const result: AnalystResult = {
      ...gate.value,
      conviction: gate.value.conviction as Conviction,
      model,
      generatedAt: new Date().toISOString(),
    }
    const payload = { ok: true as const, result, signature }

    try {
      await cache.put(
        cacheKey,
        new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } }),
      )
    } catch {
      /* best-effort */
    }
    return json(payload)
  } catch (err) {
    return json({ ok: false, error: 'AI analysis failed.', detail: err instanceof Error ? err.message.slice(0, 200) : 'unknown error' }, 502)
  }
}
