// ---------------------------------------------------------------------------
//  fetch-company-pdfs — pull OFFICIAL company PDFs (annual reports / public
//  disclosures) that the insurer sites return 403 to from datacenter / sandbox
//  IPs. Routes each download through ScraperAPI's India IP (the same relay the
//  monthly IRDAI job uses to get past WAFs), validates the bytes are a real PDF
//  (%PDF magic), and stages the file into data/raw/companies/<id>/ so the
//  existing annual_report layer (hand-transcription) or the NL-form parser can
//  pick it up.
//
//  Runs in GitHub Actions (the .github/workflows/fetch-company-pdfs.yml dispatch)
//  where SCRAPERAPI_KEY is a secret — a direct fetch is 403 from GitHub IPs, and
//  this is NOT runnable from the interactive sandbox (api.scraperapi.com is also
//  egress-blocked there). Skip-if-exists dedup; loud failure only when nothing
//  could be fetched at all (so the run never looks green while doing nothing).
//
//  TARGETS are a curated list of OFFICIAL, direct PDF URLs only (statutory
//  sources). Add more as direct URLs are confirmed.
//
//  Secrets / env:
//    SCRAPERAPI_KEY      (recommended) free scraperapi.com key — India-IP fetch.
//    INGEST_FETCH_PROXY  (optional) alternative relay URL template with {url}.
//    COMPANY             (optional) comma-separated company_id filter.
// ---------------------------------------------------------------------------

import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..') // scripts/ingest -> repo root

interface Target {
  company_id: string
  url: string
  /** Destination path, relative to repo root. */
  dest: string
  label: string
  /** Best-effort/pattern-guessed URL that may 404 — never fails the run alone. */
  speculative?: boolean
}

// OFFICIAL direct PDF URLs only. Primary = the Aditya Birla subsidiaries report
// (a direct link on grasim.com that includes ABHI's audited statements).
const TARGETS: Target[] = [
  {
    company_id: 'aditya-birla',
    url: 'https://www.grasim.com/Upload/PDF/aditya-birla-capital-subsidiaries-financial-report-2024-25.pdf',
    dest: 'data/raw/companies/aditya-birla/aditya-birla-ABCL-Subsidiaries-Financial-Report-FY25.pdf',
    label: 'Aditya Birla Capital subsidiaries financial report FY25 (incl. ABHI audited statements)',
  },
  {
    company_id: 'aditya-birla',
    url: 'https://www.grasim.com/Upload/PDF/aditya-birla-capital-subsidiaries-financial-report-2023-24.pdf',
    dest: 'data/raw/companies/aditya-birla/aditya-birla-ABCL-Subsidiaries-Financial-Report-FY24.pdf',
    label: 'Aditya Birla Capital subsidiaries financial report FY24 (pattern-guess — may 404)',
    speculative: true,
  },
  {
    company_id: 'manipalcigna',
    url: 'https://www.manipalcigna.com/documents/20124/131103/Annual+Report+2023.pdf/b1b98948-3b19-85ff-383b-3d7a93a16aaa?t=1703076554969',
    dest: 'data/raw/companies/manipalcigna/manipalcigna-Annual-Report-2023.pdf',
    label: 'ManipalCigna Annual Report 2023 (FY23 — confirmed URL from search index)',
  },
]

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const DOWNLOAD_TIMEOUT_MS = 90_000 // annual reports are multi-MB.

// Public relays (best-effort fallback). A configured ScraperAPI key / custom
// proxy is preferred and used exclusively when present — public relays rarely
// pass large PDFs or insurer WAFs and just waste time.
const RELAYS = ['https://api.allorigins.win/raw?url={url}', 'https://api.codetabs.com/v1/proxy/?quest={url}']

function relayTemplates(): { templates: string[]; premium: boolean } {
  const key = (process.env.SCRAPERAPI_KEY || '').trim()
  const custom = (process.env.INGEST_FETCH_PROXY || '').trim()
  const templates: string[] = []
  // ScraperAPI from an India IP returns raw bytes past the insurer WAF.
  if (key) templates.push(`https://api.scraperapi.com/?api_key=${key}&country_code=in&url={url}`)
  if (custom && (custom.includes('{url}') || custom.includes('{raw}'))) templates.push(custom)
  if (templates.length > 0) return { templates, premium: true }
  return { templates: [...RELAYS], premium: false }
}

/** True when the bytes look like a real PDF ("%PDF-" near the start). */
function looksLikePdf(buf: Buffer): boolean {
  return buf.length > 1000 && buf.subarray(0, 1024).toString('latin1').includes('%PDF-')
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function fetchOnce(target: string): Promise<Buffer | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    const res = await fetch(target, {
      redirect: 'follow',
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/pdf,*/*' },
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Direct fetch first (any IP the host doesn't block), then each relay. */
async function download(url: string): Promise<Buffer | null> {
  const enc = encodeURIComponent(url)
  const direct = await fetchOnce(url)
  if (direct && looksLikePdf(direct)) return direct
  for (const tmpl of relayTemplates().templates) {
    const buf = await fetchOnce(tmpl.replace('{url}', enc).replace('{raw}', url))
    if (buf && looksLikePdf(buf)) {
      try {
        console.log(`    (via ${new URL(tmpl.replace('{url}', '').replace('{raw}', '')).host})`)
      } catch {
        /* template host unparseable — ignore */
      }
      return buf
    }
  }
  return null
}

async function main(): Promise<number> {
  const filter = (process.env.COMPANY || process.argv.slice(2).join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const targets = filter.length ? TARGETS.filter((t) => filter.includes(t.company_id)) : TARGETS

  const { premium } = relayTemplates()
  console.log(`fetch-company-pdfs: ${targets.length} target(s); relay=${premium ? 'ScraperAPI/custom (India IP)' : 'public fallback only'}`)
  if (!premium) {
    console.warn(
      '  ! No SCRAPERAPI_KEY / INGEST_FETCH_PROXY set. Insurer sites 403 datacenter IPs, ' +
        'so only public relays are tried (low odds). Set SCRAPERAPI_KEY for reliable India-IP fetches.',
    )
  }

  let saved = 0
  let skipped = 0
  let hardFail = 0
  for (const t of targets) {
    const dest = resolve(REPO_ROOT, t.dest)
    if (await exists(dest)) {
      console.log(`  = exists, skip: ${t.dest}`)
      skipped++
      continue
    }
    console.log(`  → ${t.label}\n     ${t.url}`)
    const buf = await download(t.url)
    if (!buf) {
      console.error(`  ! failed (all routes blocked / not a PDF): ${t.dest}${t.speculative ? ' [speculative]' : ''}`)
      if (!t.speculative) hardFail++
      continue
    }
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, buf)
    console.log(`  + saved: ${t.dest}  (${buf.length.toLocaleString()} bytes)`)
    saved++
  }

  console.log(`\nDone. saved=${saved} skipped=${skipped} failed=${hardFail}.`)
  if (saved > 0) {
    console.log('Next: stage with build_filings_inventory.py, then process via the annual_report layer (hand-transcribe) or the NL-form parser.')
  }

  // Loud failure only when NO non-speculative target could be fetched at all.
  if (saved === 0 && hardFail > 0) {
    console.error(
      premium
        ? '\nERROR: targets found but none downloaded — the configured relay returned no valid PDF. ' +
            'Check the SCRAPERAPI_KEY is valid and has quota, and that the URL is reachable from an India IP.'
        : '\nERROR: nothing downloaded — direct fetch is 403 from this IP and no relay is configured. ' +
            'Add a free SCRAPERAPI_KEY repo secret (scraperapi.com) so downloads route through an India IP.',
    )
    return 1
  }
  return 0
}

main().then((code) => {
  process.exitCode = code
})
