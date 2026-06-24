// ---------------------------------------------------------------------------
//  verifyHistory — a small local history of the Excel files run through the
//  Upload Verifier, so a recent workbook can be reopened with one click instead
//  of being re-picked from disk.
//
//  Stored entirely in the browser's localStorage (the files never leave the
//  machine, same as the verifier itself): file name, size, when it was checked,
//  and the raw bytes (base64). We deliberately store the BYTES, not the result —
//  reopening re-runs the check against the CURRENT dashboard figures, so a saved
//  file can never show a stale comparison.
//
//  Bounded on purpose: a handful of most-recent files, within a size budget,
//  evicting the oldest. Any storage error degrades silently to "no history" —
//  the verifier itself never depends on this.
// ---------------------------------------------------------------------------

const KEY = 'verify:uploadHistory:v1'
const MAX_ENTRIES = 6
const MAX_TOTAL_B64 = 4_200_000 // ~4.2 MB of base64 across all kept files

export interface HistoryEntry {
  id: string
  name: string
  size: number // bytes (original file)
  ts: number // epoch ms when checked
  b64: string // base64 of the file bytes
}

// ── base64 ⇄ ArrayBuffer (chunked, so large workbooks don't blow the stack) ──
function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function b64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out.buffer
}

function read(): HistoryEntry[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as HistoryEntry[]
    return Array.isArray(list) ? list.filter((e) => e && typeof e.b64 === 'string' && e.name) : []
  } catch {
    return []
  }
}

/** Persist the list, trimming oldest entries until it fits the quota. */
function write(list: HistoryEntry[]): void {
  if (typeof localStorage === 'undefined') return
  const trimmed = [...list]
  // Trim to the count + size budget first (newest are at the front).
  while (trimmed.length > MAX_ENTRIES) trimmed.pop()
  while (trimmed.length > 1 && trimmed.reduce((n, e) => n + e.b64.length, 0) > MAX_TOTAL_B64) trimmed.pop()
  // Write; if the browser still rejects it (quota), drop the oldest and retry.
  for (;;) {
    try {
      localStorage.setItem(KEY, JSON.stringify(trimmed))
      return
    } catch {
      if (trimmed.length === 0) return // give up silently
      trimmed.pop()
    }
  }
}

/** Newest-first list of saved uploads (without decoding the bytes). */
export function listHistory(): HistoryEntry[] {
  return read().sort((a, b) => b.ts - a.ts)
}

/** Save (or refresh) a file in history. De-duplicates by name + size so the same
 *  workbook re-uploaded just moves to the top rather than piling up. */
export function addHistory(name: string, buf: ArrayBuffer): void {
  try {
    const size = buf.byteLength
    const entry: HistoryEntry = { id: `${Date.now()}-${size}`, name, size, ts: Date.now(), b64: bufToB64(buf) }
    const rest = read().filter((e) => !(e.name === name && e.size === size))
    write([entry, ...rest])
  } catch {
    /* never let history break an upload */
  }
}

/** The stored bytes for a saved upload, ready to re-verify, or null if gone. */
export function getHistoryBytes(id: string): ArrayBuffer | null {
  const e = read().find((x) => x.id === id)
  if (!e) return null
  try {
    return b64ToBuf(e.b64)
  } catch {
    return null
  }
}

export function removeHistory(id: string): void {
  write(read().filter((e) => e.id !== id))
}

export function clearHistory(): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

// ── small display helpers ────────────────────────────────────────────────────
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export function formatWhen(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}
