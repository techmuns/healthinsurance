// ---------------------------------------------------------------------------
//  Headless-browser fetch fallback (Playwright / Chromium).
//
//  IRDAI's portal returns HTTP 403 to plain `fetch` even with a full desktop-
//  Chrome header set — its WAF wants an actual browser session (JS execution,
//  a real TLS fingerprint, and a clearance cookie). This helper drives a real
//  headless Chromium past that: it warms up on the site origin to collect any
//  clearance cookie, then fetches the target through the browser's own network
//  stack (which carries that cookie + fingerprint).
//
//  It is OPTIONAL and self-fencing. The `playwright` import uses a *variable*
//  specifier so the type-checker never hard-depends on it; at runtime, if
//  Playwright or a browser binary isn't present (e.g. the local sandbox), every
//  call returns null and callers fall back to their normal behaviour. In CI the
//  workflow runs `playwright install chromium` first, so the path is live there.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

let browserPromise: Promise<any> | null = null
let contextPromise: Promise<any> | null = null
const warmedOrigins = new Set<string>()

async function getBrowser(): Promise<any> {
  if (browserPromise) return browserPromise
  browserPromise = (async () => {
    let pw: any
    try {
      // Variable specifier → not statically resolved by tsc; optional at runtime.
      const spec = 'playwright'
      pw = await import(spec)
    } catch {
      return null // Playwright not installed — skip the browser path entirely.
    }
    try {
      return await pw.chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
      })
    } catch {
      return null // No browser binary (`playwright install` not run) — skip.
    }
  })()
  return browserPromise
}

async function getContext(browser: any): Promise<any> {
  if (contextPromise) return contextPromise
  contextPromise = browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    viewport: { width: 1366, height: 768 },
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  })
  return contextPromise
}

// Visit the site root once per origin so a JS/cookie WAF challenge can issue its
// clearance cookie before we request the actual document.
async function warmOrigin(context: any, origin: string): Promise<void> {
  if (warmedOrigins.has(origin)) return
  warmedOrigins.add(origin)
  const page = await context.newPage()
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(2500) // let any interstitial challenge settle
  } catch {
    /* best-effort warm-up */
  } finally {
    await page.close().catch(() => {})
  }
}

/**
 * Fetch `url` through a real headless browser. Returns the body as a Buffer, or
 * `null` when the browser path is unavailable / fails (caller then falls back).
 * Pass `binary: true` for PDF/XLSX (raw bytes via the browser request context);
 * otherwise the rendered HTML is returned.
 */
export async function browserGet(url: string, opts: { binary?: boolean } = {}): Promise<Buffer | null> {
  const browser = await getBrowser()
  if (!browser) return null
  try {
    const context = await getContext(browser)
    await warmOrigin(context, new URL(url).origin)

    if (opts.binary) {
      // Browser request context → carries the warmed cookies + TLS fingerprint.
      const res = await context.request.get(url, { timeout: 60000 })
      if (!res.ok()) return null
      return Buffer.from(await res.body())
    }
    const page = await context.newPage()
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      if (res && res.status() >= 400) return null
      await page.waitForTimeout(1500)
      return Buffer.from(await page.content(), 'utf8')
    } finally {
      await page.close().catch(() => {})
    }
  } catch {
    return null
  }
}

/** Best-effort shutdown so the ingest process can exit cleanly. */
export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return
  const b = await browserPromise.catch(() => null)
  if (b) await b.close().catch(() => {})
  browserPromise = null
  contextPromise = null
  warmedOrigins.clear()
}
