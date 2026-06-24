// ---------------------------------------------------------------------------
//  grounding — the shared, dependency-free numeric-grounding primitives.
//
//  These are the core of the correctness gate: a model may NEVER assert a number
//  that the underlying data does not contain. Extracted here so the SAME rule is
//  used by:
//    • the Insights validator (src/insights/validate.ts),
//    • the AI Analyst readout (src/lib/analystReadout.ts),
//    • the server-side AI Analyst function (functions/api/insight.ts).
//
//  Pure: no imports, no I/O. Safe to bundle into a Cloudflare Pages Function.
// ---------------------------------------------------------------------------

export const GROUND_TOL_ABS = 0.06
export const GROUND_TOL_REL = 0.012

/** Two numbers agree within tolerance (abs 0.06, or 1.2% relative). */
export function closeTo(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(GROUND_TOL_ABS, Math.abs(b) * GROUND_TOL_REL)
}

/** Structural constants that legitimately appear in prose without being a datum:
 *  underwriting break-even (100), the solvency floor (1.5x / 150%), the CoE
 *  assumption (12), and small integers (ranks, counts, n). Fiscal-year tokens are
 *  stripped before extraction so "FY25"/"FY29" never read as orphan figures. */
export const ALLOW_CONSTANTS = new Set<number>([100, 1.5, 150, 12, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

/** Extract every numeric token from text (FY labels removed first). */
export function numbersIn(text: string): number[] {
  return [...text.replace(/FY\d{2}/g, '').matchAll(/-?\d+(?:\.\d+)?/g)]
    .map((m) => Number(m[0]))
    .filter((n) => Number.isFinite(n))
}

/** Is `n` grounded against the set of true values? Absolute/sign tolerant AND
 *  percent⇄fraction tolerant, so "6%" grounds against 0.06 and vice-versa. */
export function isGroundedNumber(n: number, grounded: number[]): boolean {
  if (ALLOW_CONSTANTS.has(n) || ALLOW_CONSTANTS.has(Math.abs(n))) return true
  return grounded.some(
    (g) => closeTo(n, g) || closeTo(Math.abs(n), Math.abs(g)) || closeTo(n * 100, g) || closeTo(n / 100, g),
  )
}

/** Every number that appears in `text` but is NOT grounded in `grounded`. */
export function ungroundedNumbers(text: string, grounded: number[]): number[] {
  return numbersIn(text).filter((n) => !isGroundedNumber(n, grounded))
}
