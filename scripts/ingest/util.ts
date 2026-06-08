// ---------------------------------------------------------------------------
//  Ingest utilities — filesystem helpers, ISO timestamps, raw-file writers.
//  Pure Node 18+ (uses global fetch / fs/promises).
// ---------------------------------------------------------------------------

import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Repo root, resolved from this file's location.
const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(HERE, '..', '..')
export const RAW_ROOT = resolve(REPO_ROOT, 'data', 'raw')
export const PROCESSED_ROOT = resolve(REPO_ROOT, 'data', 'processed')
export const SNAPSHOTS_ROOT = resolve(REPO_ROOT, 'src', 'data', 'snapshots')
export const LOGS_ROOT = resolve(REPO_ROOT, 'data', 'logs')

export function nowIso(): string {
  return new Date().toISOString()
}

export async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true })
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

/** Write a raw artefact to data/raw/<subdir>/<filename>. Returns the path. */
export async function writeRaw(subdir: string, filename: string, content: Buffer | string): Promise<string> {
  const dir = resolve(RAW_ROOT, subdir)
  await ensureDir(dir)
  const path = resolve(dir, filename)
  await writeFile(path, content)
  return path
}

/** Read a snapshot JSON from src/data/snapshots/. */
export async function readSnapshot<T>(filename: string): Promise<T> {
  const path = resolve(SNAPSHOTS_ROOT, filename)
  const text = await readFile(path, 'utf8')
  return JSON.parse(text) as T
}

/** Write a snapshot JSON to src/data/snapshots/. */
export async function writeSnapshot(filename: string, data: unknown): Promise<void> {
  const path = resolve(SNAPSHOTS_ROOT, filename)
  await ensureDir(dirname(path))
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

/** Append a JSONL log line to data/logs/<filename>. */
export async function appendLog(filename: string, line: Record<string, unknown>): Promise<void> {
  await ensureDir(LOGS_ROOT)
  const path = resolve(LOGS_ROOT, filename)
  const entry = JSON.stringify({ ts: nowIso(), ...line }) + '\n'
  // Simple append-on-write — for higher throughput, swap for createWriteStream.
  let existing = ''
  try {
    existing = await readFile(path, 'utf8')
  } catch { /* file may not exist yet */ }
  await writeFile(path, existing + entry, 'utf8')
}

/** True when the calling env opts the fetcher OUT of live network (default). */
export function isOfflineMode(): boolean {
  return process.env.INGEST_OFFLINE !== '0'
}

/** Convert an INR value to crores. Accepts string or number. */
export function toCrore(v: string | number, scale: 'inr' | 'lakh' | 'crore' = 'crore'): number | null {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^0-9.-]/g, '')) : v
  if (!isFinite(n)) return null
  if (scale === 'inr') return n / 1e7
  if (scale === 'lakh') return n / 100
  return n
}

/**
 * Detect when a fetched page is actually a login wall / CAPTCHA / bot block
 * rather than real data. We NEVER bypass these — we surface a clear diagnostic
 * so the operator can stage an authenticated export or an official file instead.
 * Returns { blocked, reason } so a backup adapter can downgrade to 'blocked'
 * honestly instead of parsing a login page as if it were data.
 */
export function detectAccessBlock(buffer: Buffer | string, url: string): { blocked: boolean; reason: string } {
  const text = (typeof buffer === 'string' ? buffer : buffer.toString('utf8')).slice(0, 20000).toLowerCase()
  const signals: Array<[RegExp, string]> = [
    [/just a moment|cf-browser-verification|cloudflare/i, 'Cloudflare bot challenge'],
    [/captcha|recaptcha|hcaptcha/i, 'CAPTCHA challenge'],
    [/please log\s?in|sign in to continue|login required|please sign in/i, 'login wall'],
    [/access denied|forbidden|not authorized|403 forbidden/i, '403 / access denied'],
    [/subscribe to (?:view|unlock)|premium (?:feature|content)|upgrade to pro/i, 'paywall'],
    [/rate limit|too many requests|429/i, 'rate limited'],
  ]
  for (const [re, reason] of signals) {
    if (re.test(text)) return { blocked: true, reason: `${reason} at ${url}` }
  }
  // A near-empty body from a host that should return rich data is suspicious.
  if (text.trim().length < 200) return { blocked: true, reason: `empty/blocked response from ${url}` }
  return { blocked: false, reason: '' }
}

/** Normalise a FY label to 'FYxx' (e.g. '2024-25' → 'FY25', 'FY 2024-25' → 'FY25'). */
export function normaliseFy(label: string): string {
  const m = label.match(/(\d{2,4})\s*[-/]\s*(\d{2,4})/) ?? label.match(/FY\s*(\d{2,4})/i)
  if (!m) return label.trim()
  const end = m[2] ?? m[1]
  const yy = end.length === 4 ? end.slice(2) : end.padStart(2, '0')
  return `FY${yy}`
}
