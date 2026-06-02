// ---------------------------------------------------------------------------
//  Date / fiscal-year helpers.
//
//  Indian insurers report on an April–March fiscal year. "FY2025" means the
//  year ending 31 March 2025. We canonicalise every fiscal label to the
//  4-digit end-year form "FY2025" so dedup keys stay stable across documents
//  that write "2024-25", "FY 24-25", "F.Y. 2024-2025", etc.
// ---------------------------------------------------------------------------

export function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Canonicalise any fiscal-year-ish label to "FY2025" (4-digit end year).
 * Returns null when no plausible fiscal year can be read.
 */
export function canonicalFiscalYear(input: string): string | null {
  if (!input) return null
  // 1. Range form: 2024-25, 2024-2025, 24-25, 2024/25 ...
  const range = input.match(/(20\d{2}|\d{2})\s*[-–—/]\s*(20\d{2}|\d{2})/)
  if (range) {
    const end = range[2]
    const yyyy = end.length === 4 ? end : `20${end.padStart(2, '0')}`
    if (isPlausibleFyYear(+yyyy)) return `FY${yyyy}`
  }
  // 2. Explicit FY token: FY25, FY2025, F.Y. 2025 ...
  const fy = input.match(/F\.?\s*Y\.?\s*[-]?\s*(20\d{2}|\d{2})/i)
  if (fy) {
    const y = fy[1]
    const yyyy = y.length === 4 ? y : `20${y.padStart(2, '0')}`
    if (isPlausibleFyYear(+yyyy)) return `FY${yyyy}`
  }
  // 3. Bare 4-digit year that looks like a fiscal end year.
  const bare = input.match(/\b(20\d{2})\b/)
  if (bare && isPlausibleFyYear(+bare[1])) return `FY${bare[1]}`
  return null
}

/** Guard against grabbing stray 4-digit numbers (page refs, amounts). */
function isPlausibleFyYear(year: number): boolean {
  return year >= 2008 && year <= 2035
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** Map a month name to the fiscal year (FY end) it belongs to. */
export function fiscalYearForMonth(monthName: string, calendarYear: number): string | null {
  const m = MONTH_INDEX[monthName.slice(0, 3).toLowerCase()]
  if (!m) return null
  // Apr–Dec belong to FY(calendarYear + 1); Jan–Mar to FY(calendarYear).
  const end = m >= 4 ? calendarYear + 1 : calendarYear
  return isPlausibleFyYear(end) ? `FY${end}` : null
}

/** Parse a loose date string to an ISO date (YYYY-MM-DD) or null. */
export function looseDateToIso(input: string): string | null {
  if (!input) return null
  const d = new Date(input)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  // dd-mm-yyyy / dd.mm.yyyy
  const m = input.match(/\b(\d{1,2})[-./](\d{1,2})[-./](20\d{2})\b/)
  if (m) {
    const [, dd, mm, yyyy] = m
    const dt = new Date(+yyyy, +mm - 1, +dd)
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)
  }
  return null
}
