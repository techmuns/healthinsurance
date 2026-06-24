import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
//  SectionTransition — the dashboard's shared page/section transition wrapper.
//
//  Switching the top-level sections (Industry · SAHI · Insights · Data Audit)
//  and the SAHI sub-tabs used to snap: the outgoing view vanished instantly and
//  the column could collapse for a frame before the new one painted. This
//  wrapper makes the swap feel calm and deliberate:
//
//    • the outgoing content plays a short exit (fade + tiny lift),
//    • then the incoming content plays an enter (fade + 10px rise + a whisper
//      of scale, 0.987 → 1),
//    • and the column holds the outgoing height through the exit so it never
//      collapses to a blank band mid-switch.
//
//  Motion is pure CSS (see index.css · .section-pane--*) — opacity + transform
//  only, so it stays GPU-friendly even with the tall Data Audit grid — and it
//  honours `prefers-reduced-motion` (the CSS degrades to a quick opacity fade).
//
//  No animation library: this is a tiny state machine. `transitionKey` is the
//  identity of the current view; when it changes we run exit → swap → enter.
//  Live re-renders that DON'T change the key (filter changes, callbacks,
//  internal section state) pass straight through with no animation.
// ---------------------------------------------------------------------------

const EXIT_MS = 150
const ENTER_MS = 240

type Phase = 'idle' | 'exiting' | 'entering'

interface SectionTransitionProps {
  /** Identity of the active view. A change drives the exit → enter sequence. */
  transitionKey: string
  children: ReactNode
  className?: string
}

export function SectionTransition({ transitionKey, children, className }: SectionTransitionProps) {
  // What is actually painted right now. During an exit this lags `children`
  // (it holds the outgoing view); it catches up at the swap point.
  const [shown, setShown] = useState<{ key: string; node: ReactNode }>(() => ({
    key: transitionKey,
    node: children,
  }))
  // Start with a gentle first-paint entrance, matching the prior behaviour.
  const [phase, setPhase] = useState<Phase>('entering')
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined)

  const rootRef = useRef<HTMLDivElement>(null)
  // The freshest children, captured at swap time so the incoming view is never
  // stale even if it updated mid-exit.
  const latestChildren = useRef<ReactNode>(children)
  latestChildren.current = children
  // The key we are currently animating toward — guards against restarting the
  // exit when the parent re-renders (new `children`, same key) mid-transition.
  const targetKey = useRef(transitionKey)
  const timers = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }, [])

  // First-paint entrance: settle to idle once the opening animation has run.
  // Mount-only — uses just the stable state setter and a module constant.
  useEffect(() => {
    const t = window.setTimeout(() => setPhase('idle'), ENTER_MS)
    timers.current.push(t)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => () => clearTimers(), [clearTimers])

  useEffect(() => {
    // Same view as what's painted, and we're settled → keep the live content in
    // sync (filters, callbacks, internal state) with no animation.
    if (transitionKey === shown.key && phase === 'idle') {
      setShown({ key: transitionKey, node: children })
      targetKey.current = transitionKey
      return
    }
    // Already animating toward this key (or mid-enter on it) → ignore re-renders
    // so the sequence isn't restarted or doubled.
    if (transitionKey === targetKey.current) return

    // A genuinely new view arrived → exit the current one, then swap + enter.
    targetKey.current = transitionKey
    // Hold the outgoing height so the column can't collapse during the exit.
    const h = rootRef.current?.offsetHeight
    if (h) setMinHeight(h)
    clearTimers()
    setPhase('exiting')

    const t1 = window.setTimeout(() => {
      // Swap to the freshest children for the new key, release the height lock,
      // and play the entrance — the incoming content sizes itself naturally.
      setShown({ key: transitionKey, node: latestChildren.current })
      setMinHeight(undefined)
      setPhase('entering')
      const t2 = window.setTimeout(() => setPhase('idle'), ENTER_MS)
      timers.current.push(t2)
    }, EXIT_MS)
    timers.current.push(t1)
  }, [transitionKey, children, shown.key, phase, clearTimers])

  const paneClass =
    phase === 'exiting'
      ? 'section-pane section-pane--exit'
      : phase === 'entering'
        ? 'section-pane section-pane--enter'
        : 'section-pane'

  return (
    <div ref={rootRef} className={className} style={minHeight ? { minHeight } : undefined}>
      <div className={paneClass}>{shown.node}</div>
    </div>
  )
}
