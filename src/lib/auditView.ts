// ---------------------------------------------------------------------------
//  useAuditView — the "Customize View" memory behind the audit tables. Tracks
//  which companies and columns the user has hidden and the column order, lets
//  them Save the view (persisted in localStorage, per table) and Reset back to
//  the default. Pure view state — it never touches the underlying data; hiding
//  is visual only.
//
//  The consuming component is expected to be keyed by its table id, so the hook
//  re-initialises (and reloads any saved view) when the table changes.
// ---------------------------------------------------------------------------

import { useState } from 'react'

export interface AuditViewSnapshot {
  hiddenColumns: string[]
  hiddenCompanies: string[]
  columnOrder: string[]
}

const PREFIX = 'audit-view:v1:'

function read(id: string): AuditViewSnapshot | null {
  try {
    const raw = localStorage.getItem(PREFIX + id)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<AuditViewSnapshot>
    if (!v || typeof v !== 'object') return null
    return {
      hiddenColumns: Array.isArray(v.hiddenColumns) ? v.hiddenColumns : [],
      hiddenCompanies: Array.isArray(v.hiddenCompanies) ? v.hiddenCompanies : [],
      columnOrder: Array.isArray(v.columnOrder) ? v.columnOrder : [],
    }
  } catch {
    return null
  }
}
function write(id: string, snap: AuditViewSnapshot) {
  try {
    localStorage.setItem(PREFIX + id, JSON.stringify(snap))
  } catch {
    /* ignore quota / unavailable storage */
  }
}
function clear(id: string) {
  try {
    localStorage.removeItem(PREFIX + id)
  } catch {
    /* ignore */
  }
}

// Keep a saved order valid against the live columns: keep the ones that still
// exist (in their saved order), then append any new columns the table grew.
function reconcileOrder(saved: string[], all: string[]): string[] {
  const allSet = new Set(all)
  const kept = saved.filter((k) => allSet.has(k))
  const keptSet = new Set(kept)
  return [...kept, ...all.filter((k) => !keptSet.has(k))]
}

function eqSet(a: Set<string>, b: string[]): boolean {
  if (a.size !== b.length) return false
  for (const x of b) if (!a.has(x)) return false
  return true
}
function eqArr(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

export interface AuditView {
  order: string[]
  hiddenColumns: string[]
  hiddenCompanies: string[]
  isHiddenColumn: (k: string) => boolean
  isHiddenCompany: (k: string) => boolean
  hideColumn: (k: string) => void
  showColumn: (k: string) => void
  hideCompany: (k: string) => void
  showCompany: (k: string) => void
  /** Drag reorder — drop `dragKey` immediately before `targetKey`. */
  reorder: (dragKey: string, targetKey: string) => void
  /** Swap two columns (used by the move-left / move-right header controls). */
  swap: (a: string, b: string) => void
  restoreAll: () => void
  save: () => void
  reset: () => void
  /** Differs from the pristine default (so Reset is meaningful). */
  customized: boolean
  /** Differs from the last saved snapshot (so Save is meaningful). */
  dirty: boolean
  hasSaved: boolean
}

export function useAuditView(id: string, allColumns: string[]): AuditView {
  const [saved, setSaved] = useState<AuditViewSnapshot | null>(() => {
    const s = read(id)
    return s ? { ...s, columnOrder: reconcileOrder(s.columnOrder, allColumns) } : null
  })
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set(saved?.hiddenColumns ?? []))
  const [hiddenCompanies, setHiddenCompanies] = useState<Set<string>>(() => new Set(saved?.hiddenCompanies ?? []))
  const [order, setOrder] = useState<string[]>(() => saved?.columnOrder ?? allColumns)

  const add = (set: React.Dispatch<React.SetStateAction<Set<string>>>, k: string) =>
    set((prev) => {
      if (prev.has(k)) return prev
      const n = new Set(prev)
      n.add(k)
      return n
    })
  const remove = (set: React.Dispatch<React.SetStateAction<Set<string>>>, k: string) =>
    set((prev) => {
      if (!prev.has(k)) return prev
      const n = new Set(prev)
      n.delete(k)
      return n
    })

  const reorder = (dragKey: string, targetKey: string) => {
    if (dragKey === targetKey) return
    setOrder((prev) => {
      const arr = prev.filter((k) => k !== dragKey)
      const i = arr.indexOf(targetKey)
      if (i === -1) return prev
      arr.splice(i, 0, dragKey)
      return arr
    })
  }
  const swap = (a: string, b: string) => {
    if (a === b) return
    setOrder((prev) => {
      const i = prev.indexOf(a)
      const j = prev.indexOf(b)
      if (i === -1 || j === -1) return prev
      const arr = prev.slice()
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return arr
    })
  }

  const restoreAll = () => {
    setHiddenColumns(new Set())
    setHiddenCompanies(new Set())
  }
  const save = () => {
    const snap: AuditViewSnapshot = {
      hiddenColumns: [...hiddenColumns],
      hiddenCompanies: [...hiddenCompanies],
      columnOrder: order,
    }
    write(id, snap)
    setSaved(snap)
  }
  const reset = () => {
    clear(id)
    setSaved(null)
    setHiddenColumns(new Set())
    setHiddenCompanies(new Set())
    setOrder(allColumns)
  }

  const customized = hiddenColumns.size > 0 || hiddenCompanies.size > 0 || !eqArr(order, allColumns)
  const dirty = saved
    ? !(eqSet(hiddenColumns, saved.hiddenColumns) && eqSet(hiddenCompanies, saved.hiddenCompanies) && eqArr(order, saved.columnOrder))
    : customized

  return {
    order,
    hiddenColumns: [...hiddenColumns],
    hiddenCompanies: [...hiddenCompanies],
    isHiddenColumn: (k) => hiddenColumns.has(k),
    isHiddenCompany: (k) => hiddenCompanies.has(k),
    hideColumn: (k) => add(setHiddenColumns, k),
    showColumn: (k) => remove(setHiddenColumns, k),
    hideCompany: (k) => add(setHiddenCompanies, k),
    showCompany: (k) => remove(setHiddenCompanies, k),
    reorder,
    swap,
    restoreAll,
    save,
    reset,
    customized,
    dirty,
    hasSaved: saved != null,
  }
}
