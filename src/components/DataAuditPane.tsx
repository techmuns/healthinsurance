import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { RotateCcw } from 'lucide-react'
import type { AuditFocus } from '@/insights/sourceMap'
import { AuditLoadingCard } from '@/components/AuditLoadingCard'

// ---------------------------------------------------------------------------
//  DataAuditPane — owns the Extracted Data Audit loading experience.
//
//  The audit surface carries a ~1 MB cell-level index that should only load when
//  a reviewer actually opens the QA tab, never on first paint. So this pane is
//  lightweight and eagerly loaded, and it pulls the heavy section + index in
//  dynamically the moment it mounts. It coordinates the whole "preparing"
//  lifecycle under ONE continuous progress experience:
//
//    1. download the audit chunk (dynamic import),
//    2. warm the cached audit model on a painted frame (the heavy index build),
//    3. then reveal the grid — which renders instantly from that warm cache.
//
//  Progress is a safe staged animation (no real % is available from a single
//  synchronous build): it eases toward ~88% while loading, HOLDS there until the
//  data is genuinely ready, then completes to 100% and reveals the grid. It
//  never fakes completion before the model is built. A real failure (chunk fetch
//  or build error) drops to a calm, reassuring retry card — the harsh
//  "something went wrong" boundary is reserved for genuine render crashes.
//
//  This is a UX / loading-state layer only: `buildAudit()` (via warmAudit) and
//  the grid's data, sources, filters and columns are untouched.
// ---------------------------------------------------------------------------

type AuditComp = ComponentType<{ focus?: AuditFocus | null }>
type Phase = 'loading' | 'ready' | 'error'

const TICK_MS = 33 // ~30fps progress nudges
const EASE = 0.2 // fraction of the remaining gap closed each tick (decelerating)
const HOLD_CEIL = 88 // hold here until the real model is prepared
const COMPLETE_AT = 99.4 // the asymptote never reaches 100 — snap to done past this

export function DataAuditPane({ focus }: { focus?: AuditFocus | null }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [progress, setProgress] = useState(0)
  const [Comp, setComp] = useState<AuditComp | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Refs drive the climb without re-creating the interval each render.
  const progressRef = useRef(0)
  const targetRef = useRef(HOLD_CEIL) // ceiling the bar eases toward
  const readyRef = useRef(false) // is the real model prepared?
  const tickRef = useRef<number | undefined>(undefined)
  const runRef = useRef(0) // identifies the active load attempt (retry-safe)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      window.clearInterval(tickRef.current)
    }
  }, [])

  // Eased auto-climb toward `targetRef`. Decelerates as it approaches, so it
  // reads as a calm, intentional fill rather than a mechanical bar.
  const startClimb = useCallback(() => {
    window.clearInterval(tickRef.current)
    tickRef.current = window.setInterval(() => {
      const target = targetRef.current
      let p = progressRef.current + (target - progressRef.current) * EASE
      // Don't sit exactly on the ceiling while holding — keep a hair below.
      if (p > target - 0.04) p = target - 0.02

      if (readyRef.current && p >= COMPLETE_AT) {
        // Real data is ready and we've climbed home — finish cleanly.
        window.clearInterval(tickRef.current)
        progressRef.current = 100
        setProgress(100)
        // A brief beat at 100% before the grid takes over, so completion reads.
        window.setTimeout(() => {
          if (aliveRef.current) setPhase('ready')
        }, 200)
        return
      }
      progressRef.current = p
      setProgress(p)
    }, TICK_MS)
  }, [])

  const load = useCallback(() => {
    const run = (runRef.current += 1)
    readyRef.current = false
    targetRef.current = HOLD_CEIL
    progressRef.current = 0
    setProgress(0)
    setErrorMsg(null)
    setComp(null)
    setPhase('loading')
    startClimb()

    void (async () => {
      try {
        // 1 · Download the audit chunk (heavy index + grid live here).
        const mod = await import('@/sections/ExtractedDataAudit')
        if (!aliveRef.current || run !== runRef.current) return
        setComp(() => mod.ExtractedDataAudit)

        // 2 · Warm the cached audit model on a painted frame, so the loader is
        //     on screen first and the grid then renders instantly from cache.
        await new Promise<void>((resolve, reject) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              try {
                mod.warmAudit()
                resolve()
              } catch (err) {
                reject(err)
              }
            }),
          )
        })
        if (!aliveRef.current || run !== runRef.current) return

        // 3 · Real model is prepared → release the bar to 100% and reveal.
        readyRef.current = true
        targetRef.current = 100
      } catch (err) {
        if (!aliveRef.current || run !== runRef.current) return
        // Keep the real error in the console for debugging; show a calm card.
        console.error('[DataAuditPane] Failed to prepare the audit view:', err)
        window.clearInterval(tickRef.current)
        setErrorMsg(err instanceof Error ? err.message : String(err))
        setPhase('error')
      }
    })()
  }, [startClimb])

  // Kick off on mount (and only on mount — `load` is stable).
  useEffect(() => {
    load()
  }, [load])

  if (phase === 'error') {
    return <AuditErrorCard message={errorMsg} onRetry={load} />
  }

  if (phase === 'ready' && Comp) {
    return (
      <div className="audit-reveal">
        <Comp focus={focus} />
      </div>
    )
  }

  return <AuditLoadingCard progress={progress} />
}

// ── Calm failure state ─────────────────────────────────────────────────────
// Only shown on a genuine failure (chunk fetch / index build). Reassuring, not
// alarming — a quiet retry, with the technical detail tucked away for an
// engineer. Never appears during normal loading.
function AuditErrorCard({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="flex min-h-[58vh] items-center justify-center px-4">
      <div className="card-surface relative w-full max-w-md overflow-hidden p-7 sm:p-8 text-center">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-champagne to-transparent" />

        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-champagne-deep">
          Extracted Data Audit
        </p>
        <h2 className="mt-3 font-display text-[20px] leading-tight text-navy-deep">
          We couldn&rsquo;t prepare the audit view yet
        </h2>
        <p className="mx-auto mt-2 max-w-xs text-[12.5px] leading-relaxed text-ink-secondary">
          The audit grid organizes a large set of extracted cells and source links. It
          didn&rsquo;t finish this time — nothing is lost, and the rest of the dashboard is
          unaffected. Please retry.
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-navy-primary px-4 py-2 text-[12.5px] font-semibold text-white shadow-soft transition-all hover:bg-navy-deep hover:shadow-card"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Retry
        </button>

        {message && (
          <details className="mt-4 text-left text-[11px] text-ink-secondary/80">
            <summary className="cursor-pointer select-none text-center font-semibold text-ink-secondary transition-colors hover:text-navy-deep">
              Technical details
            </summary>
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-ice px-3 py-2 font-mono text-[10.5px] leading-relaxed text-ink-secondary ring-1 ring-soft-border">
              {message}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
