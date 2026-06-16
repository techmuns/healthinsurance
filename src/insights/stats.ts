// Pure statistical helpers for the signal layer. No domain logic, no I/O.

export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Sample standard deviation (n-1); 0 for fewer than two points. */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

export const zScore = (x: number, m: number, sd: number): number => (sd > 0 ? (x - m) / sd : 0)

/** Ordinary-least-squares slope of y over x (index ok); null if < 2 points. */
export function slope(points: { x: number; y: number }[]): number | null {
  if (points.length < 2) return null
  const mx = mean(points.map((p) => p.x))
  const my = mean(points.map((p) => p.y))
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - mx) * (p.y - my)
    den += (p.x - mx) ** 2
  }
  return den === 0 ? null : num / den
}

export const round = (v: number, dp = 2): number => Math.round(v * 10 ** dp) / 10 ** dp

/** % change a→b; null if a is 0/null. */
export function pctChange(a: number | null, b: number | null): number | null {
  if (a == null || b == null || a === 0) return null
  return ((b - a) / a) * 100
}
