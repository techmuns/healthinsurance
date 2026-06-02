// ---------------------------------------------------------------------------
//  Probe #3 — does data.gov.in (official OGD API) actually have the fresh,
//  monthly, company-wise non-life premium data we need, and does the API work
//  from the runner with the free sample key?
//
//  Steps, all from the GitHub Actions runner:
//   A. API liveness — hit a known resource with the public sample key.
//   B. Discovery — fetch a few insurance resource pages + the IRDAI keyword
//      listing, scrape any api resource ids (UUIDs) out of the HTML.
//   C. For each discovered id, query the API and report its fields + the
//      earliest/latest period (granularity + freshness) + a sample row.
//
//  Pure diagnostics: commits nothing.
// ---------------------------------------------------------------------------

const KEY = '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b' // public sample key
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const RESOURCE_PAGES = [
  'https://www.data.gov.in/resource/year-wise-data-insurance-premium-claim-settlement-ratio-and-claims-outstanding-life-and',
  'https://www.data.gov.in/resource/company-wise-details-bifurcation-claims-amounts-disbursed-under-health-insurance-business',
  'https://www.data.gov.in/keywords/IRDAI',
  'https://www.data.gov.in/sector/insurance-0',
]
const CANDIDATE_IDS = ['335db748-fbd8-403f-bf91-827909c205b3']

async function apiQuery(id: string): Promise<void> {
  const url = `https://api.data.gov.in/resource/${id}?api-key=${KEY}&format=json&limit=3`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    const text = await res.text()
    let info = `bytes=${text.length}`
    try {
      const j = JSON.parse(text)
      const fields = (j.field ?? []).map((f: { id?: string; name?: string }) => f.name ?? f.id)
      info = `title="${j.title ?? '?'}" total=${j.total ?? '?'} count=${j.count ?? '?'} fields=[${fields.slice(0, 12).join(', ')}]`
      if (Array.isArray(j.records) && j.records[0]) info += `\n        sampleRow: ${JSON.stringify(j.records[0]).slice(0, 240)}`
    } catch {
      info += ` (non-JSON) snippet: ${text.replace(/\s+/g, ' ').slice(0, 160)}`
    }
    console.log(`[API ${res.ok ? 'OK' : res.status}] resource ${id}\n        ${info}`)
  } catch (err) {
    console.log(`[API ERROR] resource ${id} :: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function discover(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, redirect: 'follow' })
    const body = await res.text()
    const ids = [...new Set([...body.matchAll(/resource\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi)].map((m) => m[1]))]
    console.log(`[WEB ${res.ok ? 'OK' : res.status}] ${url}\n        bytes=${body.length} resourceIdsFound=${ids.length}${ids.length ? ': ' + ids.slice(0, 6).join(', ') : ''}`)
    return ids
  } catch (err) {
    console.log(`[WEB ERROR] ${url} :: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

async function main(): Promise<void> {
  console.log('── data.gov.in probe (official OGD API · GitHub Actions egress) ──')
  console.log('A) API liveness with candidate ids:')
  for (const id of CANDIDATE_IDS) await apiQuery(id)
  console.log('B) discover insurance resource ids from the website:')
  const found = new Set<string>()
  for (const p of RESOURCE_PAGES) (await discover(p)).forEach((id) => found.add(id))
  console.log(`C) query discovered ids (${found.size}):`)
  for (const id of [...found].slice(0, 6)) await apiQuery(id)
  console.log('── done ──')
}

void main()
