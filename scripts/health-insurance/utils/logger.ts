// ---------------------------------------------------------------------------
//  Structured logger.
//
//  Console output is human-readable; an optional JSONL run log is appended to
//  data/logs/health-insurance-scrape.log so a scheduled run is auditable after
//  the fact. Logging never throws — a logging failure must not break a scrape.
// ---------------------------------------------------------------------------

import { mkdir, appendFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nowIso } from './dates.js'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(HERE, '..', '..', '..')
const LOG_FILE = resolve(REPO_ROOT, 'data', 'logs', 'health-insurance-scrape.log')

type Level = 'info' | 'warn' | 'error' | 'debug'

const DEBUG = process.env.HI_DEBUG === '1'

function emit(level: Level, scope: string, msg: string, extra?: Record<string, unknown>) {
  if (level === 'debug' && !DEBUG) return
  const tag = level === 'error' ? '✗' : level === 'warn' ? '!' : level === 'debug' ? '·' : '•'
  const detail = extra && Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''
  console[level === 'debug' ? 'log' : level](`${tag} [${scope}] ${msg}${detail}`)
  void appendJsonl({ ts: nowIso(), level, scope, msg, ...extra })
}

async function appendJsonl(line: Record<string, unknown>): Promise<void> {
  try {
    await mkdir(dirname(LOG_FILE), { recursive: true })
    await appendFile(LOG_FILE, JSON.stringify(line) + '\n', 'utf8')
  } catch {
    /* logging is best-effort — never throw */
  }
}

export const log = {
  info: (scope: string, msg: string, extra?: Record<string, unknown>) => emit('info', scope, msg, extra),
  warn: (scope: string, msg: string, extra?: Record<string, unknown>) => emit('warn', scope, msg, extra),
  error: (scope: string, msg: string, extra?: Record<string, unknown>) => emit('error', scope, msg, extra),
  debug: (scope: string, msg: string, extra?: Record<string, unknown>) => emit('debug', scope, msg, extra),
}
