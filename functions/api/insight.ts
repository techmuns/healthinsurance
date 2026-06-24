// ---------------------------------------------------------------------------
//  /api/insight — the on-demand AI analysis for selected Data-Audit cells.
//
//  A Cloudflare Pages Function. Runs ONLY on a click, server-side, so the
//  Anthropic key NEVER reaches the browser. The browser POSTs only the
//  pre-computed Tier-1 readout + audit metadata; the model interprets those
//  signals and may never invent a number.
//
//  Output is deliberately SHORT — a quick analyst read (4-6 bullets + a useful
//  formula + a plain conclusion), not a formal report. It is validated against the
//  readout (numeric grounding + no investment advice), retried once, then fails
//  closed. Identical selections are served from the Workers cache.
// ---------------------------------------------------------------------------

import { isGroundedNumber, numbersIn } from '../../src/insights/grounding'
import type { AnalystRequest, AnalystResult, Conviction } from '../../src/insights/analystTypes'

interface Env {
  ANTHROPIC_API_KEY?: string
  INSIGHTS_MODEL?: string
}
interface Ctx {
  request: Request
  env: Env
}

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const MAX_SELECTION = 400
const MAX_BODY_BYTES = 512 * 1024

const SYSTEM_PROMPT = `ROLE
You are a sharp senior insurance analyst. A user has drag-selected specific
audited cells in a data-audit grid (India's standalone health insurers + non-life)
and wants a QUICK read — like asking the analyst next to them "what does this
mean?". Be direct, financially intelligent and concise. This is a quick assistant,
NOT a formal report: no thesis, no "what consensus misses", no falsifier.

GROUND TRUTH
You receive a SIGNALS payload: a deterministic Tier-1 readout (peer ranking,
z-scores, deltas, source quality, gaps) computed from the selection, plus the
selected cells with their audit lineage. That payload is your ONLY ground truth.
NEVER invent or estimate a number — every figure you write must already appear in
the payload. If you lack a number, name the gap instead.

HARD RULES
- Premium ≠ profit (GWP/NWP/NEP are scale, not profit). Never equate premium size
  with quality. Mix-adjust (retail vs group) before comparing insurers.
- Source firewall: if a value is market/aggregator-sourced, call it indicative.
- Gaps reduce conviction. If cells are not ready, say the analysis is partial.
- Single fiscal year ⇒ NO trend claim. Only discuss change over time when the
  payload carries multiple periods for the same company+metric.
- NO investment advice: never say buy/sell/hold/accumulate, no price targets.
- Use FY labels (FY25), never calendar years. If a "formula" is provided in the
  payload, use it verbatim — do not invent your own.

OUTPUT — return ONLY a JSON object (no prose, no markdown, no code fences):
{
  "quickRead": [ string ],         // 4-6 sharp bullets: the key facts + what they mean
  "formula": { "title": string, "body": string } | null,   // the relevant formula (use the payload's if given), else null
  "peerNote": string | null,       // one line on relative positioning, if the selection supports it; else null
  "sourceQuality": string,         // ready vs gaps + how it affects conviction
  "conviction": "High" | "Medium" | "Low",
  "conclusion": string             // one plain-language takeaway
}`

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
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

/** Fail-closed correctness gate: structure, numeric grounding, no advice. */
function checkResult(result: unknown, grounded: number[]): { ok: boolean; errors: string[]; value?: AnalystResult } {
  const errors: string[] = []
  if (!result || typeof result !== 'object') return { ok: false, errors: ['model did not return a JSON object'] }
  const r = result as Record<string, unknown>

  if (!Array.isArray(r.quickRead) || r.quickRead.length < 3 || !r.quickRead.every((b) => typeof b === 'string' && b.trim()))
    errors.push('quickRead must be an array of at least 3 non-empty strings')
  if (typeof r.sourceQuality !== 'string' || !r.sourceQuality.trim()) errors.push('missing sourceQuality')
  if (typeof r.conclusion !== 'string' || !r.conclusion.trim()) errors.push('missing conclusion')
  if (!['High', 'Medium', 'Low'].includes(r.conviction as string)) errors.push('conviction must be High | Medium | Low')
  if (r.formula != null && (typeof r.formula !== 'object' || typeof (r.formula as { body?: unknown }).body !== 'string'))
    errors.push('formula must be {title, body} or null')
  if (r.peerNote != null && typeof r.peerNote !== 'string') errors.push('peerNote must be a string or null')

  // Collect every prose string the model produced.
  const texts: string[] = []
  if (Array.isArray(r.quickRead)) for (const b of r.quickRead) if (typeof b === 'string') texts.push(b)
  for (const f of ['sourceQuality', 'conclusion', 'peerNote'] as const) if (typeof r[f] === 'string') texts.push(r[f] as string)
  const formula = r.formula as { title?: unknown; body?: unknown } | null
  if (formula && typeof formula.body === 'string') texts.push(formula.body)

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
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1500, system: SYSTEM_PROMPT, messages: [{ role: 'user', content }] }),
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
  if (readout.coverage.ready === 0) return json({ ok: false, error: 'No ready, source-backed cells in the selection to analyse.' }, 422)

  if (!env.ANTHROPIC_API_KEY) {
    return json(
      { ok: false, error: 'AI analysis is not configured on the server.', detail: 'Set ANTHROPIC_API_KEY in the Cloudflare Pages project settings to enable it.' },
      503,
    )
  }

  const model = env.INSIGHTS_MODEL || DEFAULT_MODEL
  const signature = readout.signature || 'nosig'

  const cache = (caches as unknown as { default: Cache }).default
  const cacheKey = new Request(`https://insight.cache/${model}/${signature}`)
  try {
    const hit = await cache.match(cacheKey)
    if (hit) return json({ ...((await hit.json()) as object), cached: true })
  } catch {
    /* cache is best-effort */
  }

  const userTurn = JSON.stringify({
    scope: body.scopeLabel,
    readout: {
      scope: readout.scope,
      coverage: readout.coverage,
      metricStats: readout.metricStats,
      trends: readout.trends,
      sourceQuality: readout.sourceQuality,
      formula: readout.formula,
    },
    selection: body.selection.map((s) => ({
      company: s.companyLabel,
      metric: s.metricLabel,
      period: s.period,
      value: s.value,
      unit: s.unit,
      status: s.statusLabel,
      ready: s.ready,
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
      await cache.put(cacheKey, new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } }))
    } catch {
      /* best-effort */
    }
    return json(payload)
  } catch (err) {
    return json({ ok: false, error: 'AI analysis failed.', detail: err instanceof Error ? err.message.slice(0, 200) : 'unknown error' }, 502)
  }
}
