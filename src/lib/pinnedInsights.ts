// ---------------------------------------------------------------------------
//  pinnedInsights — a tiny localStorage-backed store for AI analyst cards the
//  user has pinned. Pinned cards surface in the Insights tab so a good read isn't
//  lost when the selection clears. Reactive via useSyncExternalStore so the drawer
//  and the Insights tab stay in lock-step.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from 'react'
import type { AnalystResult } from '@/insights/analystTypes'

export interface PinnedInsight {
  signature: string
  scopeLabel: string
  result: AnalystResult
  pinnedAt: string
}

const KEY = 'analyst-pins:v1'
const listeners = new Set<() => void>()
let cache: PinnedInsight[] | null = null

function read(): PinnedInsight[] {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    cache = raw ? (JSON.parse(raw) as PinnedInsight[]) : []
  } catch {
    cache = []
  }
  return cache
}

function write(list: PinnedInsight[]): void {
  cache = list
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage full / unavailable — non-fatal */
  }
  listeners.forEach((l) => l())
}

export function getPins(): PinnedInsight[] {
  return read()
}

export function isPinned(signature: string): boolean {
  return read().some((p) => p.signature === signature)
}

export function addPin(signature: string, scopeLabel: string, result: AnalystResult): void {
  const list = read()
  if (list.some((p) => p.signature === signature)) return
  write([{ signature, scopeLabel, result, pinnedAt: new Date().toISOString() }, ...list])
}

export function removePin(signature: string): void {
  write(read().filter((p) => p.signature !== signature))
}

export function togglePin(signature: string, scopeLabel: string, result: AnalystResult): void {
  if (isPinned(signature)) removePin(signature)
  else addPin(signature, scopeLabel, result)
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Reactive list of pinned insights. */
export function usePinnedInsights(): PinnedInsight[] {
  return useSyncExternalStore(subscribe, getPins, getPins)
}
