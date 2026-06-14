// ---------------------------------------------------------------------------
//  health-check — the data-pipeline watchdog.
//
//  Reads data-health.json (written by build-snapshots.ts) and flags sources
//  that need attention:
//    • regressed — was succeeding, now failing (upstream page changed / errored)
//    • blocked   — was succeeding, now WAF/login-blocked
//    • stale     — no successful refresh within its expected cadence window
//    • empty     — fetched OK but extracted 0 records (likely a layout change)
//
//  Sources that have NEVER succeeded are treated as known-pending (not yet
//  wired / standing-blocked) and are NOT flagged — so the signal stays about
//  things that *broke*, not things that were never on.
//
//  It writes a machine-readable report to $RUNNER_TEMP (CI) / the OS temp dir
//  for the workflow's alert step to open or refresh a GitHub issue, prints a
//  human summary, and ALWAYS exits 0 — it is informational and must never fail
//  the ingest run or block the data commit. The dashboard keeps showing the
//  last real, dated value while a source is down; nothing here fabricates data.
// ---------------------------------------------------------------------------

import { tmpdir } from 'node:os'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readSnapshot } from './util'

type Cadence = 'daily' | 'monthly' | 'quarterly' | 'annual'
const STALE_DAYS: Record<Cadence, number> = { daily: 4, monthly: 45, quarterly: 110, annual: 400 }

/** Infer a source's expected refresh cadence from its id (robust to new sources). */
function cadenceOf(sourceId: string): Cadence {
  const s = sourceId.toLowerCase()
  if (/price|delivery|muns_market|yahoo|moneycontrol_analyst|valuation_daily|quotes/.test(s)) return 'daily'
  if (/quarterly/.test(s)) return 'quarterly'
  if (/annual|handbook|_ir$|disclosures_batch|company_annual/.test(s)) return 'annual'
  return 'monthly' // monthly feeds + conservative default
}

interface PerSource {
  source_id: string
  status: 'success' | 'failed' | 'pending' | 'blocked'
  last_attempt_at: string | null
  last_success_at: string | null
  records_fetched: number | null
  error?: string
}
interface HealthFile {
  per_source: PerSource[]
  last_successful_run: string | null
}

type IssueKind = 'regressed' | 'blocked' | 'stale' | 'empty'
interface HealthIssue {
  source_id: string
  cadence: Cadence
  kind: IssueKind
  age_days: number | null
  last_success: string | null
  detail: string
}

function ageDays(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86_400_000)
}

async function main(): Promise<void> {
  const health = await readSnapshot<HealthFile>('data-health.json')
  const sources = health.per_source ?? []
  const issues: HealthIssue[] = []

  for (const p of sources) {
    // Known-pending (never succeeded) → not a regression; don't alert.
    if (!p.last_success_at) continue
    const cadence = cadenceOf(p.source_id)
    const age = ageDays(p.last_success_at)
    const base = { source_id: p.source_id, cadence, age_days: age, last_success: p.last_success_at }
    if (p.status === 'failed') {
      issues.push({ ...base, kind: 'regressed', detail: p.error ? `failing: ${p.error.slice(0, 140)}` : 'failing after previously succeeding' })
    } else if (p.status === 'blocked') {
      issues.push({ ...base, kind: 'blocked', detail: 'WAF/login-blocked after previously succeeding' })
    } else if (age != null && age > STALE_DAYS[cadence]) {
      issues.push({ ...base, kind: 'stale', detail: `no successful refresh in ${age}d (>${STALE_DAYS[cadence]}d expected for a ${cadence} source)` })
    } else if (p.status === 'success' && p.records_fetched === 0) {
      issues.push({ ...base, kind: 'empty', detail: 'fetched but extracted 0 records — possible upstream layout change' })
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    checked: sources.length,
    attention: issues.length,
    issues,
  }
  const out = resolve(process.env.RUNNER_TEMP || tmpdir(), 'data-health-report.json')
  writeFileSync(out, JSON.stringify(report, null, 2))

  if (issues.length === 0) {
    console.log(`data-health watchdog: all clear — ${report.checked} sources checked, none regressed/stale/empty.`)
  } else {
    console.log(`data-health watchdog: ${issues.length} source(s) need attention:`)
    for (const i of issues) console.log(`  • [${i.kind}] ${i.source_id} (${i.cadence}) — ${i.detail}`)
  }
  console.log(`report → ${out}`)
}

main().catch((e) => {
  // Informational only — never fail the ingest run.
  console.error('health-check: non-fatal error —', e instanceof Error ? e.message : e)
})
