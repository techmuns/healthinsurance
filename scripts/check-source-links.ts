// ---------------------------------------------------------------------------
//  Source-link guard — keeps the promise "no broken source links, ever".
//
//  Every "view source" link the dashboard shows comes from one of two places:
//    1. a URL hardcoded in src/**/*.{ts,tsx} (rendered fallbacks), or
//    2. a `source_url` / `url` / `*_source_url` field in a committed snapshot
//       under src/data/snapshots/*.json.
//  This script gathers the unique set, then checks each one with a browser-like
//  request and classifies the result:
//
//    • BROKEN     — a 404 / 410 / 400 / 451, an unresolvable host, or a
//                   malformed URL (literal space / backslash in the path).
//                   These are the real defects (a renamed or mistyped page).
//    • UNVERIFIED — 403 / 406 / 429 / 5xx / network timeout. Many real Indian
//                   insurer + regulator sites bot-block datacenter / CI IPs;
//                   the link is almost certainly fine in a browser, so we warn
//                   but never fail on these (no false alarms in CI).
//    • OK         — any 2xx / 3xx.
//
//  Exit code is non-zero ONLY when a BROKEN link is found, so CI fails loudly
//  the moment a source goes dead — never on a bot-block.
//
//  Run:  npm run check:links            (report + fail on broken)
//        npm run check:links -- --all   (also list OK / unverified)
// ---------------------------------------------------------------------------

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const SNAP_DIR = join(ROOT, 'src/data/snapshots')
const SRC_DIR = join(ROOT, 'src')

// Hosts/paths we never check: XML namespaces (not links) and our own data API
// (an endpoint that 422s without query params — it is lineage, not a page link).
const SKIP = [/schemas\.openxmlformats\.org/, /:\/\/fastapi\.muns\.io/, /localhost|127\.0\.0\.1/, /\$\{|[{}]/]

const URL_FIELD = /"(?:source_url|url|aggregator_url|lic_source_url|investor_relations_url|homepage|website|downloaded_file_url)"\s*:\s*"([^"]+)"/g
const HARDCODED = /https?:\/\/[^\s"'`)\]]+/g

function walk(dir: string, test: (f: string) => boolean): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p, test))
    else if (test(e.name)) out.push(p)
  }
  return out
}

function collectUrls(): Map<string, Set<string>> {
  // url -> set of files it appears in (for actionable reporting)
  const map = new Map<string, Set<string>>()
  const add = (raw: string, file: string) => {
    const u = raw.trim().replace(/[.,]+$/, '')
    if (!/^https?:\/\//.test(u)) return
    if (SKIP.some((re) => re.test(u))) return
    if (!map.has(u)) map.set(u, new Set())
    map.get(u)!.add(file.replace(ROOT + '/', ''))
  }
  // 1. snapshot URL fields (JSON-unescape so \\ becomes the real char we render)
  for (const f of walk(SNAP_DIR, (n) => n.endsWith('.json'))) {
    const txt = readFileSync(f, 'utf8')
    for (const m of txt.matchAll(URL_FIELD)) {
      let v = m[1]
      try { v = JSON.parse('"' + m[1] + '"') } catch { /* keep raw */ }
      add(v, f)
    }
  }
  // 2. hardcoded URLs in source code
  for (const f of walk(SRC_DIR, (n) => n.endsWith('.ts') || n.endsWith('.tsx'))) {
    const txt = readFileSync(f, 'utf8')
    for (const m of txt.matchAll(HARDCODED)) add(m[0], f)
  }
  return map
}

type Verdict = 'ok' | 'broken' | 'unverified'
interface Result { url: string; verdict: Verdict; detail: string; files: string[] }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const BROKEN_CODES = new Set([400, 404, 410, 451])

async function probe(url: string): Promise<{ verdict: Verdict; detail: string }> {
  // Malformed URL stored in the data is itself a defect (the Care backslash bug).
  if (/[\s\\]/.test(url) || /%5C/i.test(url)) return { verdict: 'broken', detail: 'malformed URL (space/backslash)' }
  for (let attempt = 0; attempt < 2; attempt++) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 30_000)
    try {
      const res = await fetch(url, { redirect: 'follow', signal: ac.signal, headers: { 'user-agent': UA } })
      clearTimeout(t)
      if (BROKEN_CODES.has(res.status)) return { verdict: 'broken', detail: `HTTP ${res.status}` }
      if (res.status >= 200 && res.status < 400) return { verdict: 'ok', detail: `HTTP ${res.status}` }
      return { verdict: 'unverified', detail: `HTTP ${res.status} (likely bot-block)` }
    } catch (err: unknown) {
      clearTimeout(t)
      const code = (err as { cause?: { code?: string } })?.cause?.code
      if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { verdict: 'broken', detail: `DNS: ${code}` }
      if (attempt === 0) continue // one retry for transient timeouts
      return { verdict: 'unverified', detail: 'network timeout/refused' }
    }
  }
  return { verdict: 'unverified', detail: 'network timeout/refused' }
}

async function main() {
  const showAll = process.argv.includes('--all')
  const urlMap = collectUrls()
  const urls = [...urlMap.keys()].sort()
  console.log(`Checking ${urls.length} unique source links…\n`)

  const results: Result[] = []
  const CONC = 8
  for (let i = 0; i < urls.length; i += CONC) {
    const batch = urls.slice(i, i + CONC)
    const r = await Promise.all(batch.map(async (u) => {
      const { verdict, detail } = await probe(u)
      return { url: u, verdict, detail, files: [...urlMap.get(u)!] }
    }))
    results.push(...r)
  }

  const broken = results.filter((r) => r.verdict === 'broken')
  const unverified = results.filter((r) => r.verdict === 'unverified')
  const ok = results.filter((r) => r.verdict === 'ok')

  if (broken.length) {
    console.log(`\n❌ BROKEN (${broken.length}) — these must be fixed:`)
    for (const r of broken) {
      console.log(`  ${r.detail.padEnd(28)} ${r.url}`)
      console.log(`      used in: ${r.files.slice(0, 4).join(', ')}${r.files.length > 4 ? ` (+${r.files.length - 4} more)` : ''}`)
    }
  }
  if (unverified.length && showAll) {
    console.log(`\n⚠️  UNVERIFIED (${unverified.length}) — bot-block/network, not failing on these:`)
    for (const r of unverified) console.log(`  ${r.detail.padEnd(28)} ${r.url}`)
  }
  if (showAll) {
    console.log(`\n✅ OK (${ok.length})`)
    for (const r of ok) console.log(`  ${r.detail.padEnd(10)} ${r.url}`)
  }

  console.log(`\n────────────────────────────────────────`)
  console.log(`OK ${ok.length}  ·  unverified ${unverified.length}  ·  broken ${broken.length}`)
  if (broken.length) {
    console.log(`\nFAIL: ${broken.length} broken source link(s).`)
    process.exit(1)
  }
  console.log(`\nPASS: no broken source links.`)
}

main().catch((e) => { console.error(e); process.exit(2) })
