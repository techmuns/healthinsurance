// ---------------------------------------------------------------------------
//  Probe #3b — enumerate the IRDAI datasets that data.gov.in actually carries,
//  and report each one's granularity + freshness, all from the runner.
//
//  The API + website are reachable from Actions and the free sample key works
//  (proven). The site is a JS app, so dataset ids live in embedded JSON, not
//  static <a> hrefs — so here we pull EVERY uuid out of the IRDAI listing pages
//  and query each via the API, printing title + fields + a sample row. That
//  tells us definitively whether a fresh, monthly, company-wise premium set
//  exists on the official platform.
//
//  Pure diagnostics: commits nothing.
// ---------------------------------------------------------------------------

const KEY = '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b' // public sample key
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

const LISTING_PAGES = [
  'https://www.data.gov.in/keywords/IRDAI',
  'https://www.data.gov.in/sector/insurance-0',
  'https://www.data.gov.in/keywords/non-life%20insurance',
]

async function collectUuids(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, redirect: 'follow' })
    const body = await res.text()
    const ids = [...new Set((body.match(UUID) ?? []).map((s) => s.toLowerCase()))]
    console.log(`[WEB ${res.ok ? 'OK' : res.status}] ${url} — ${ids.length} uuids`)
    return ids
  } catch (err) {
    console.log(`[WEB ERROR] ${url} :: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

async function describe(id: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.data.gov.in/resource/${id}?api-key=${KEY}&format=json&limit=2`, { headers: { Accept: 'application/json' } })
    if (!res.ok) return false
    const j = JSON.parse(await res.text())
    if (!j || !j.title) return false
    const fields = (j.field ?? []).map((f: { name?: string; id?: string }) => f.name ?? f.id)
    const monthly = /month|monthly/i.test(`${j.title} ${fields.join(' ')}`)
    const flag = monthly ? '  ⟵ MONTHLY?' : ''
    console.log(`  • "${j.title}" (total=${j.total})${flag}\n      fields: [${fields.slice(0, 14).join(', ')}]\n      sample: ${JSON.stringify(j.records?.[0] ?? {}).slice(0, 220)}`)
    return true
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  console.log('── data.gov.in: which IRDAI datasets exist + their granularity (runner) ──')
  const all = new Set<string>()
  for (const p of LISTING_PAGES) (await collectUuids(p)).forEach((id) => all.add(id))
  console.log(`Querying ${all.size} candidate ids via the API (printing only the ones that resolve to a dataset):`)
  let datasets = 0
  for (const id of [...all].slice(0, 40)) if (await describe(id)) datasets++
  console.log(`── done · ${datasets} datasets resolved ──`)
}

void main()
