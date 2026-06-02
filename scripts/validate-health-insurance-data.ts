// ---------------------------------------------------------------------------
//  Entry point — validate-health-insurance-data
//
//  The CI schema gate. Reads every company artifact plus the run report,
//  source-status and review-queue files, schema-checks them, and exits 1 if
//  anything is invalid or non-serialisable. Run after the scraper in CI:
//
//    npx tsx scripts/validate-health-insurance-data.ts
//
//  This is intentionally strict: corrupt or schema-breaking output must fail
//  the build rather than ship to the dashboard.
// ---------------------------------------------------------------------------

import { readFile } from 'node:fs/promises'
import { COMPANIES } from './health-insurance/config/companies.js'
import { companyDataPath, RUN_REPORT_PATH, SOURCE_STATUS_PATH, REVIEW_QUEUE_PATH } from './health-insurance/storage/json-store.js'
import { validateCompanyData, validateJsonSerialisable } from './health-insurance/quality/schema.js'
import type { CompanyData } from './health-insurance/types.js'
import { log } from './health-insurance/utils/logger.js'

async function readJsonStrict(path: string): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    return { ok: true, data: JSON.parse(await readFile(path, 'utf8')) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function main(): Promise<number> {
  const errors: string[] = []
  let checked = 0

  // 1. Company artifacts.
  for (const company of COMPANIES) {
    const path = companyDataPath(company.slug)
    const read = await readJsonStrict(path)
    if (!read.ok) {
      errors.push(`${company.slug}.json: unreadable / invalid JSON — ${read.error}`)
      continue
    }
    checked++
    const result = validateCompanyData(read.data as CompanyData)
    if (!result.ok) errors.push(...result.errors)
    const ser = validateJsonSerialisable(read.data, `${company.slug}.json`)
    if (!ser.ok) errors.push(...ser.errors)
  }

  // 2. Operational artifacts must at least be valid, well-formed JSON objects.
  for (const [label, path, requiredKeys] of [
    ['run-report.json', RUN_REPORT_PATH, ['runStartedAt', 'ok', 'sources']],
    ['source-status.json', SOURCE_STATUS_PATH, ['sources']],
    ['extraction-review-queue.json', REVIEW_QUEUE_PATH, ['items']],
  ] as const) {
    const read = await readJsonStrict(path)
    if (!read.ok) {
      errors.push(`${label}: unreadable / invalid JSON — ${read.error}`)
      continue
    }
    const obj = read.data as Record<string, unknown>
    for (const k of requiredKeys) if (!(k in obj)) errors.push(`${label}: missing key "${k}"`)
  }

  if (errors.length) {
    log.error('validate', `FAILED — ${errors.length} problem(s)`, {})
    for (const e of errors.slice(0, 50)) log.error('validate', e, {})
    return 1
  }
  log.info('validate', `OK — ${checked} company artifact(s) + operational files valid`, {})
  return 0
}

main()
  .then((code) => { process.exitCode = code })
  .catch((err) => {
    log.error('validate', 'fatal', { error: err instanceof Error ? err.message : String(err) })
    process.exitCode = 1
  })
