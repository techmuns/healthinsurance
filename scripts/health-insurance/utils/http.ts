// ---------------------------------------------------------------------------
//  Compliant HTTP client.
//
//  This client is deliberately *polite and transparent*. It identifies itself
//  with an honest project User-Agent, rate-limits per host, and — critically —
//  it never tries to evade a block. The task's compliance rules are encoded
//  here as behaviour, not as comments:
//
//    • Retry ONLY transient failures: 429, 500, 502, 503, 504, network timeout.
//    • NEVER retry 401 / 403 — those are access decisions, not flakiness.
//    • Detect blocks (401/403, captcha / bot-challenge bodies) and stop. No
//      proxy rotation, no residential proxies, no logged-in impersonation.
//
//  A blocked source is reported honestly (status + reason) and the run moves
//  on to the next source.
// ---------------------------------------------------------------------------

import { log } from './logger.js'

/** Errors we treat as transient and worth a backed-off retry. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
/** Hard access decisions — never retried, never evaded. */
const BLOCKED_STATUS = new Set([401, 403])

export interface HttpOptions {
  /** Per-request timeout in ms (default 20s). */
  timeoutMs?: number
  /** Max attempts for transient errors (default 3). */
  maxAttempts?: number
  /** Min delay between requests to the same host, ms (default 1500). */
  minHostDelayMs?: number
  /** Expect binary (PDF/XLSX) — purely informational, body is always bytes. */
  binary?: boolean
}

export type HttpClassification =
  | 'ok'
  | 'blocked' // 401/403 or detected bot-challenge body
  | 'not_found' // 404/410
  | 'client_error' // other 4xx
  | 'server_error' // 5xx after retries exhausted
  | 'rate_limited' // 429 after retries exhausted
  | 'network_error' // DNS / connection / timeout
  | 'too_large' // body exceeded the size cap

export interface HttpResult {
  ok: boolean
  classification: HttpClassification
  status: number | null
  buffer: Buffer | null
  finalUrl: string | null
  contentType: string | null
  error: string | null
  /** True only for hard blocks the pipeline must record and skip. */
  blocked: boolean
}

const DEFAULT_TIMEOUT = 20_000
const DEFAULT_ATTEMPTS = 3
const DEFAULT_HOST_DELAY = 1_500
const MAX_BYTES = 80 * 1024 * 1024 // 80MB cap — annual reports can be large

/** Honest, project-identifying User-Agent (override with HI_USER_AGENT). */
const USER_AGENT =
  process.env.HI_USER_AGENT ??
  'HealthInsuranceDisclosureScraper/1.0 (+https://github.com/techmuns/healthinsurance; equity-research data pipeline; contact via repo issues)'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Per-host "last request" clock so we never hammer a single origin.
const lastRequestAt = new Map<string, number>()

async function throttle(host: string, minDelay: number): Promise<void> {
  const prev = lastRequestAt.get(host) ?? 0
  const wait = prev + minDelay - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt.set(host, Date.now())
}

/** Heuristic: does this HTML body look like a captcha / bot-challenge wall? */
function looksLikeChallenge(body: string): boolean {
  const head = body.slice(0, 4000).toLowerCase()
  return (
    /captcha|recaptcha|hcaptcha|are you a human|verify you are human/.test(head) ||
    /cf-browser-verification|checking your browser|cf-challenge|just a moment/.test(head) ||
    /access denied|request blocked|incident id|akamai|imperva|distil/.test(head) ||
    /enable javascript and cookies to continue/.test(head)
  )
}

/**
 * Fetch a URL politely. Always resolves with an HttpResult — callers branch on
 * `classification` / `blocked` rather than catching exceptions.
 */
export async function httpGet(url: string, opts: HttpOptions = {}): Promise<HttpResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT
  const maxAttempts = opts.maxAttempts ?? DEFAULT_ATTEMPTS
  const minHostDelay = opts.minHostDelayMs ?? DEFAULT_HOST_DELAY

  let host: string
  try {
    host = new URL(url).host
  } catch {
    return result(false, 'client_error', null, null, null, null, `Invalid URL: ${url}`, false)
  }

  let lastErr: string | null = null
  let lastStatus: number | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await throttle(host, minHostDelay)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: '*/*',
          'Accept-Language': 'en-IN,en;q=0.9',
        },
      })
      lastStatus = res.status

      // Hard block — record and stop immediately. No retry, no evasion.
      if (BLOCKED_STATUS.has(res.status)) {
        log.warn('http', `blocked ${res.status}`, { url })
        return result(false, 'blocked', res.status, null, res.url, null, `HTTP ${res.status}`, true)
      }

      // Transient — back off and retry while attempts remain.
      if (RETRYABLE_STATUS.has(res.status)) {
        lastErr = `HTTP ${res.status}`
        if (attempt < maxAttempts) {
          await backoff(attempt, res.headers.get('retry-after'))
          continue
        }
        const cls: HttpClassification = res.status === 429 ? 'rate_limited' : 'server_error'
        return result(false, cls, res.status, null, res.url, null, lastErr, false)
      }

      if (res.status === 404 || res.status === 410) {
        return result(false, 'not_found', res.status, null, res.url, null, `HTTP ${res.status}`, false)
      }
      if (!res.ok) {
        return result(false, 'client_error', res.status, null, res.url, null, `HTTP ${res.status}`, false)
      }

      // Enforce the size cap defensively before buffering everything.
      const declared = Number(res.headers.get('content-length') ?? '0')
      if (declared && declared > MAX_BYTES) {
        return result(false, 'too_large', res.status, null, res.url, null, `Content-Length ${declared} > cap`, false)
      }

      const contentType = res.headers.get('content-type')
      const ab = await res.arrayBuffer()
      const buffer = Buffer.from(ab)
      if (buffer.length > MAX_BYTES) {
        return result(false, 'too_large', res.status, null, res.url, contentType, `Body ${buffer.length} > cap`, false)
      }

      // A 200 that is actually a challenge page is still a block.
      const isHtml = (contentType ?? '').includes('text/html')
      if (isHtml && looksLikeChallenge(buffer.toString('utf8'))) {
        log.warn('http', 'challenge page behind 200', { url })
        return result(false, 'blocked', res.status, null, res.url, contentType, 'Bot-challenge page', true)
      }

      return result(true, 'ok', res.status, buffer, res.url, contentType, null, false)
    } catch (err) {
      // AbortError (timeout) or network failure — both transient.
      const msg = err instanceof Error ? err.message : String(err)
      lastErr = msg
      if (attempt < maxAttempts) {
        await backoff(attempt, null)
        continue
      }
      return result(false, 'network_error', null, null, null, null, msg, false)
    } finally {
      clearTimeout(timer)
    }
  }
  return result(false, 'network_error', lastStatus, null, null, null, lastErr ?? 'exhausted retries', false)
}

async function backoff(attempt: number, retryAfter: string | null): Promise<void> {
  // Honour a numeric Retry-After when present, otherwise exponential: 2s,4s,8s…
  const headerMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : null
  const ms = headerMs ?? 1000 * Math.pow(2, attempt)
  await sleep(Math.min(ms, 30_000))
}

function result(
  ok: boolean,
  classification: HttpClassification,
  status: number | null,
  buffer: Buffer | null,
  finalUrl: string | null,
  contentType: string | null,
  error: string | null,
  blocked: boolean,
): HttpResult {
  return { ok, classification, status, buffer, finalUrl, contentType, error, blocked }
}
