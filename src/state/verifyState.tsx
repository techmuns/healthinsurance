import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { VerifyResult, VerifyRow, VerifyStatus } from '@/lib/excelVerify'

// ---------------------------------------------------------------------------
//  verifyState — shared state that links the Excel Upload Verifier to the Data
//  Audit grid (both live on the Data Audit page). It holds the verification
//  result, whether the grid is showing the verification overlay, the active
//  filter, and the cell the user asked to jump to. Pure UI/navigation state —
//  no data, counts or audit logic live here.
//
//  Kept as a context so the verifier drawer (lazy), the launcher card and the
//  audit grid can all read/drive it without threading a dozen props, and so
//  importing it never pulls SheetJS into the audit chunk (types only).
// ---------------------------------------------------------------------------

/** A verifier row resolves to this stable audit-cell address for navigation. */
export interface VerifyTarget {
  sheet: string
  cellId: string // AuditCell.id === `${sheet}!${cellRef}`
  cellRef: string
  /** Bumped on every navigate so re-clicking the same cell re-triggers the pulse. */
  nonce: number
}

/** Grid overlay filter — by exact verify status, or all. */
export type GridFilter = VerifyStatus | 'all'
/** Verifier list filter — "missing" folds the two missing directions. */
export type ListFilter = 'all' | 'mismatch' | 'source_basis' | 'missing' | 'matched'

export interface VerifyState {
  /** The verification result (persists until a new file / clear). */
  result: VerifyResult | null
  /** Whether the audit grid renders the verification overlay colouring. */
  verifyView: boolean
  /** Grid overlay status filter. */
  gridFilter: GridFilter
  /** Verifier list status filter (persisted so reopening keeps it). */
  listFilter: ListFilter
  /** Cell to scroll-to / pulse in the grid (null = none pending). */
  target: VerifyTarget | null
  /** Is the verifier drawer open. */
  open: boolean
  /** Drawer is open but collapsed to a small pill (grid fully visible). */
  minimized: boolean

  setResult: (r: VerifyResult | null) => void
  setVerifyView: (b: boolean) => void
  setGridFilter: (f: GridFilter) => void
  setListFilter: (f: ListFilter) => void
  openVerifier: () => void
  closeVerifier: () => void
  /** Collapse the open drawer to a corner pill (keeps the result + state). */
  minimizeVerifier: () => void
  /** Expand the pill back to the full docked panel. */
  restoreVerifier: () => void
  /** From a verifier row → highlight that audit cell. Keeps the drawer OPEN
   *  (docked beside the grid) so the list and the cell can be read together. */
  navigateToCell: (row: VerifyRow) => void
  /** Leave overlay colouring but keep the result available. */
  exitVerifyView: () => void
  /** Drop the verification result entirely (back to the normal audit grid). */
  clearVerification: () => void
}

const Ctx = createContext<VerifyState | null>(null)

/** Required accessor (throws if used outside the provider). */
export function useVerify(): VerifyState {
  const c = useContext(Ctx)
  if (!c) throw new Error('useVerify must be used within <VerifyProvider>')
  return c
}

/** Optional accessor — lets the audit grid render normally with no provider. */
export function useVerifyOptional(): VerifyState | null {
  return useContext(Ctx)
}

export function VerifyProvider({ children }: { children: ReactNode }) {
  const [result, setResultState] = useState<VerifyResult | null>(null)
  const [verifyView, setVerifyView] = useState(false)
  const [gridFilter, setGridFilter] = useState<GridFilter>('all')
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  const [target, setTarget] = useState<VerifyTarget | null>(null)
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const nonce = useRef(0)

  const value = useMemo<VerifyState>(() => ({
    result, verifyView, gridFilter, listFilter, target, open, minimized,
    setResult: (r) => {
      setResultState(r)
      setVerifyView(!!r)
      if (!r) { setTarget(null); setGridFilter('all'); setListFilter('all') }
    },
    setVerifyView,
    setGridFilter,
    setListFilter,
    openVerifier: () => { setOpen(true); setMinimized(false) },
    closeVerifier: () => { setOpen(false); setMinimized(false) },
    minimizeVerifier: () => setMinimized(true),
    restoreVerifier: () => { setOpen(true); setMinimized(false) },
    navigateToCell: (row) => {
      nonce.current += 1
      setTarget({ sheet: row.sheet, cellId: row.id, cellRef: row.cellRef, nonce: nonce.current })
      setGridFilter('all') // never let the active filter dim the cell we just jumped to
      setVerifyView(true)
      // Keep the drawer open + expanded so the list stays beside the grid; the
      // cell pulses on the left. (Was: setOpen(false), which hid the list.)
      setMinimized(false)
    },
    exitVerifyView: () => setVerifyView(false),
    clearVerification: () => {
      setResultState(null); setVerifyView(false); setTarget(null); setGridFilter('all'); setListFilter('all')
    },
  }), [result, verifyView, gridFilter, listFilter, target, open, minimized])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
