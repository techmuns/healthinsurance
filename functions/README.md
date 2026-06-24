# Pages Functions

Server-side endpoints served by Cloudflare Pages (the same build that deploys the
dashboard). Everything here runs on the edge — the browser never sees any secret.

## `/api/insight` — AI Senior-Analyst synthesis

`POST /api/insight` powers the **Generate AI Analysis** button in Data Audit (and
the Insights Explorer). The browser sends only the pre-computed Tier-1 readout +
audit metadata (`src/lib/analystReadout.ts`); the function calls Anthropic, runs a
fail-closed correctness gate (every number must trace to the readout; no investment
advice), retries once, and caches identical selections.

### One-time setup (the only manual step)

The endpoint needs the Anthropic key as a **Cloudflare Pages environment variable**
— this is separate from the GitHub Actions secret used by the weekly insights job.

1. Cloudflare dashboard → **Workers & Pages** → this Pages project → **Settings** →
   **Environment variables**.
2. Add a **Secret** named `ANTHROPIC_API_KEY` (Production, and Preview if you use
   preview deploys). Paste the key. Save.
3. *(Optional)* add a plain variable `INSIGHTS_MODEL` to override the model
   (defaults to `claude-sonnet-4-6`).
4. Redeploy (or push) so the new variable is bound.

Until that variable is set, the AI button returns a clear "not configured" message
and the free, instant Tier-1 readout keeps working.

### Local testing

```bash
cp .dev.vars.example .dev.vars   # paste your key into .dev.vars (git-ignored)
npm run build && npx wrangler pages dev dist
```

A plain `npm run dev` (Vite only) does not run Functions; the Tier-1 readout still
works, and the AI button explains that it runs on the deployed site.
