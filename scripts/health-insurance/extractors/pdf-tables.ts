// ---------------------------------------------------------------------------
//  Best-effort table extraction from PDF text.
//
//  True table reconstruction from PDFs is unreliable, so this module is
//  deliberately modest: it finds lines that pair a text label with one or more
//  numbers (the dominant shape of insurer disclosure tables — "Net Worth
//  1,234.5 1,100.2") and exposes them as label→numbers rows. The metric
//  extractor uses these rows to (a) lift values it can attribute to a labelled
//  table cell — higher confidence — and (b) capture multi-period columns.
//
//  When this finds nothing useful the caller falls back to free-text pattern
//  matching at reduced confidence, exactly as the spec prescribes.
// ---------------------------------------------------------------------------

export interface TableRow {
  /** The leading text label of the row (lower-cased, whitespace-collapsed). */
  label: string
  /** Original label text, untouched, for display / snippets. */
  rawLabel: string
  /** Numbers found on the row, left to right (period columns). */
  numbers: number[]
  /** The raw line, for snippet extraction. */
  line: string
}

// A label is leading non-numeric text; numbers are Indian-formatted figures.
const NUMBER_TOKEN = /-?\(?[\d,]+(?:\.\d+)?\)?%?/g

function parseIndianNumber(token: string): number | null {
  const negative = /^\(.*\)$/.test(token) // accounting parentheses = negative
  const cleaned = token.replace(/[(),%]/g, '').replace(/,/g, '')
  if (!cleaned || cleaned === '-') return null
  const n = parseFloat(cleaned)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

/**
 * Parse PDF text into label→numbers rows. Only lines whose leading segment is
 * a plausible label (has letters, isn't itself a number) and that carry at
 * least one number are returned.
 */
export function extractTableRows(text: string): TableRow[] {
  const rows: TableRow[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line.length < 3 || line.length > 240) continue

    const nums = line.match(NUMBER_TOKEN)
    if (!nums || nums.length === 0) continue

    // Label = everything before the first numeric token.
    const firstNum = line.search(/-?\(?[\d,]+(?:\.\d+)?\)?/)
    if (firstNum <= 0) continue
    const rawLabel = line.slice(0, firstNum).trim().replace(/[:.\-–]+$/, '').trim()
    // Need a real word label, not a stray symbol or a bare year header.
    if (!/[A-Za-z]{3,}/.test(rawLabel)) continue

    const numbers = nums.map(parseIndianNumber).filter((n): n is number => n !== null)
    if (numbers.length === 0) continue

    rows.push({ label: rawLabel.toLowerCase().replace(/\s+/g, ' '), rawLabel, numbers, line })
  }
  return rows
}

/**
 * Find the first table row whose label matches `labelRe`. Returns the row and
 * its first number (the most-recent period column, by Indian disclosure
 * convention where the latest year is printed first), or null.
 */
export function findTableValue(
  rows: TableRow[],
  labelRe: RegExp,
): { row: TableRow; value: number } | null {
  for (const row of rows) {
    if (labelRe.test(row.label)) {
      return { row, value: row.numbers[0] }
    }
  }
  return null
}
