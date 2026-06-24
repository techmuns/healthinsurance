// ---------------------------------------------------------------------------
//  insightApi — the browser client for the Tier-2 AI Senior-Analyst endpoint.
//
//  • Caches each generated card by its Tier-1 signature in localStorage, so an
//    identical selection never pays for a second call (build brief §11).
//  • Dedupes concurrent calls for the same signature.
//  • Degrades gracefully: in a plain `vite dev` (no Pages Functions runtime),
//    /api/insight returns index.html — detected and reported as "not available
//    here" rather than crashing. The free Tier-1 readout always works.
// ---------------------------------------------------------------------------

import type { AnalystRequest, AnalystApiResponse, AnalystResult } from '@/insights/analystTypes'

const CACHE_PREFIX = 'analyst-insight:v1:'
const TTL_MS = 7 * 24 * 60 * 60 * 1000
const inFlight = new Map<string, Promise<AnalystApiResponse>>()

function readCache(sig: string): AnalystResult | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + sig)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at: number; result: AnalystResult }
    if (!parsed.at || Date.now() - parsed.at > TTL_MS) return null
    return parsed.result
  } catch {
    return null
  }
}

function writeCache(sig: string, result: AnalystResult): void {
  try {
    localStorage.setItem(CACHE_PREFIX + sig, JSON.stringify({ at: Date.now(), result }))
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

/** A previously-generated card for this signature, if still cached. */
export function cachedAnalysis(sig: string): AnalystResult | null {
  return readCache(sig)
}

/** Generate (or fetch from cache) the AI analyst card for a selection. */
export async function generateAnalysis(req: AnalystRequest, force = false): Promise<AnalystApiResponse> {
  const sig = req.readout.signature
  if (!force) {
    const cached = readCache(sig)
    if (cached) return { ok: true, result: cached, signature: sig, cached: true }
    const existing = inFlight.get(sig)
    if (existing) return existing
  }

  const run = (async (): Promise<AnalystApiResponse> => {
    try {
      const res = await fetch('/api/insight', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
      })
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.includes('application/json')) {
        return {
          ok: false,
          error: 'AI analysis runs on the deployed site.',
          detail: 'The /api/insight function is served by Cloudflare Pages. The instant readout below works everywhere.',
        }
      }
      const data = (await res.json()) as AnalystApiResponse
      if (data.ok) writeCache(sig, data.result)
      return data
    } catch (err) {
      return { ok: false, error: 'Couldn’t reach the analysis service.', detail: err instanceof Error ? err.message : 'network error' }
    } finally {
      inFlight.delete(sig)
    }
  })()

  if (!force) inFlight.set(sig, run)
  return run
}
