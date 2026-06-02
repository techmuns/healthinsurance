// ---------------------------------------------------------------------------
//  Entry point — scrape-health-insurance
//
//  Discovers, catalogs and extracts public disclosures for the configured
//  Indian health insurers, then writes the dashboard-ready artifacts:
//
//    data/<slug>.json                    per-company time series
//    data/run-report.json                this run's summary
//    data/source-status.json             source reachability ledger
//    data/extraction-review-queue.json   low-confidence / conflict items
//
//  Selection (workflow_dispatch inputs company / slug):
//    npx tsx scripts/scrape-health-insurance.ts                 # all companies
//    npx tsx scripts/scrape-health-insurance.ts --slug niva-bupa
//    HI_SLUG=star-health npx tsx scripts/scrape-health-insurance.ts
//
//  Exit behaviour (per spec):
//    • exit 0 — scrape completed; some sources may be blocked/failed, output valid.
//    • exit 1 — schema validation failed, output not serialisable, or a code
//               error escaped the per-company/source guard (corrupt output).
// ---------------------------------------------------------------------------

import { COMPANIES, resolveCompany } from './health-insurance/config/companies.js'
import { runCompany } from './health-insurance/pipeline.js'
import {
  writeCompanyData, writeJson, RUN_REPORT_PATH, SOURCE_STATUS_PATH, REVIEW_QUEUE_PATH,
} from './health-insurance/storage/json-store.js'
import { validateJsonSerialisable } from './health-insurance/quality/schema.js'
import { dedupeReviewQueue } from './health-insurance/quality/review-queue.js'
import type {
  CompanyConfig, RunReport, RunReportSource, SourceStatusRecord, ReviewItem,
} from './health-insurance/types.js'
import { nowIso } from './health-insurance/utils/dates.js'
import { log } from './health-insurance/utils/logger.js'

function selectCompanies(): CompanyConfig[] {
  const argv = process.argv.slice(2)
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const ref = flag('slug') ?? flag('company') ?? process.env.HI_SLUG ?? process.env.HI_COMPANY ?? argv.find((a) => !a.startsWith('--'))
  if (!ref || ref.toLowerCase() === 'all') return COMPANIES
  const match = resolveCompany(ref)
  if (!match) {
    log.warn('scrape', `no company matched "${ref}" — running all`, { known: COMPANIES.map((c) => c.slug) })
    return COMPANIES
  }
  return [match]
}

async function main(): Promise<number> {
  const runStartedAt = nowIso()
  const targets = selectCompanies()
  log.info('scrape', `starting run`, { companies: targets.map((c) => c.slug), live: process.env.HI_LIVE === '1' })

  const allSources: RunReportSource[] = []
  const allStatuses: SourceStatusRecord[] = []
  const allReview: ReviewItem[] = []
  let documentsDiscovered = 0
  let documentsDownloaded = 0
  let metricsExtracted = 0
  let companiesProcessed = 0
  let hardFailure = false

  for (const company of targets) {
    try {
      const r = await runCompany(company)
      companiesProcessed++
      documentsDiscovered += r.discovered
      documentsDownloaded += r.downloaded
      metricsExtracted += r.metricsExtracted
      allSources.push(...r.runSources)
      allStatuses.push(...r.sourceStatus)
      allReview.push(...r.reviewItems)

      // Corrupt / schema-invalid output is a hard failure: do NOT write it,
      // preserving the previous valid artifact.
      const ser = validateJsonSerialisable(r.data, `${company.slug}.json`)
      if (!r.valid || !ser.ok) {
        hardFailure = true
        log.error('scrape', `not writing ${company.slug}.json (invalid)`, { errors: [...r.validationErrors.slice(0, 5), ...ser.errors] })
        continue
      }
      await writeCompanyData(r.data)
      log.info('scrape', `wrote data/${company.slug}.json`)
    } catch (err) {
      // A code-level exception that escaped the per-source guard is a hard
      // failure for this company, but the run continues for the others.
      hardFailure = true
      const msg = err instanceof Error ? err.message : String(err)
      log.error('scrape', `unhandled error for ${company.slug}`, { error: msg })
      allSources.push({ company: company.name, source: 'pipeline', url: '(code)', status: 'failed', count: 0, error: msg })
    }
  }

  const review = dedupeReviewQueue(allReview)
  const blockedSources = allSources.filter((s) => s.status === 'blocked')
  const failedSources = allSources.filter((s) => s.status === 'failed')

  const report: RunReport = {
    runStartedAt,
    runFinishedAt: nowIso(),
    ok: !hardFailure,
    companiesProcessed,
    documentsDiscovered,
    documentsDownloaded,
    metricsExtracted,
    sources: allSources,
    blockedSources,
    failedSources,
    reviewRequiredCount: review.length,
    reviewRequired: review.slice(0, 100), // sample; full set in the review queue file
  }

  // Always write the operational artifacts, even on partial failure.
  await writeJson(SOURCE_STATUS_PATH, { generatedAt: nowIso(), sources: allStatuses })
  await writeJson(REVIEW_QUEUE_PATH, { generatedAt: nowIso(), count: review.length, items: review })
  await writeJson(RUN_REPORT_PATH, report)
  log.info('scrape', 'wrote run-report.json, source-status.json, extraction-review-queue.json')

  // Validate the report itself is serialisable (defensive corruption check).
  const repSer = validateJsonSerialisable(report, 'run-report.json')
  if (!repSer.ok) {
    log.error('scrape', 'run report not serialisable', { errors: repSer.errors })
    hardFailure = true
  }

  log.info('scrape', 'run complete', {
    companiesProcessed, documentsDiscovered, documentsDownloaded, metricsExtracted,
    blocked: blockedSources.length, failed: failedSources.length, review: review.length, ok: !hardFailure,
  })

  return hardFailure ? 1 : 0
}

main()
  .then((code) => { process.exitCode = code })
  .catch(async (err) => {
    // Last-resort guard: still try to leave an honest run report behind.
    log.error('scrape', 'fatal', { error: err instanceof Error ? err.stack ?? err.message : String(err) })
    try {
      await writeJson(RUN_REPORT_PATH, {
        runStartedAt: nowIso(), runFinishedAt: nowIso(), ok: false,
        companiesProcessed: 0, documentsDiscovered: 0, documentsDownloaded: 0, metricsExtracted: 0,
        sources: [], blockedSources: [], failedSources: [], reviewRequiredCount: 0, reviewRequired: [],
        fatalError: err instanceof Error ? err.message : String(err),
      })
    } catch { /* nothing more we can do */ }
    process.exitCode = 1
  })
