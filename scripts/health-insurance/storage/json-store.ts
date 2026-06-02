// ---------------------------------------------------------------------------
//  JSON store.
//
//  Reads and writes the dashboard-ready artifacts under data/:
//    data/<slug>.json                      — per-company time series
//    data/run-report.json                  — every-run summary
//    data/source-status.json               — source reachability ledger
//    data/extraction-review-queue.json     — low-confidence / conflict items
//
//  Writes are pretty-printed with a trailing newline to match the repo's
//  existing snapshot style and keep diffs clean.
// ---------------------------------------------------------------------------

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CompanyConfig, CompanyData } from '../types.js'
import { METRIC_KEYS } from '../config/metrics.js'
import { nowIso } from '../utils/dates.js'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(HERE, '..', '..', '..')
export const DATA_ROOT = resolve(REPO_ROOT, 'data')

export function companyDataPath(slug: string): string {
  return resolve(DATA_ROOT, `${slug}.json`)
}

/** An empty-but-valid company artifact: all metric keys present, all arrays. */
export function emptyCompanyData(company: CompanyConfig): CompanyData {
  const metrics: Record<string, []> = {}
  for (const k of METRIC_KEYS) metrics[k] = []
  return {
    company: company.name,
    slug: company.slug,
    lastUpdated: nowIso(),
    documents: {
      quarterlyResults: [],
      annualReports: [],
      transcripts: [],
      stockExchangeFilings: [],
      irdaiDisclosures: [],
      otherDisclosures: [],
    },
    metrics,
    sourceStatus: [],
    reviewQueue: [],
  }
}

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

/** Read an existing company artifact, or a fresh empty one. */
export async function readCompanyData(company: CompanyConfig): Promise<CompanyData> {
  const existing = await readJson<CompanyData>(companyDataPath(company.slug))
  if (!existing) return emptyCompanyData(company)
  // Forward-compatibility: ensure any newly-added metric key exists as [].
  for (const k of METRIC_KEYS) if (!existing.metrics[k]) existing.metrics[k] = []
  return existing
}

export async function writeCompanyData(data: CompanyData): Promise<void> {
  await writeJson(companyDataPath(data.slug), data)
}

export const RUN_REPORT_PATH = resolve(DATA_ROOT, 'run-report.json')
export const SOURCE_STATUS_PATH = resolve(DATA_ROOT, 'source-status.json')
export const REVIEW_QUEUE_PATH = resolve(DATA_ROOT, 'extraction-review-queue.json')
