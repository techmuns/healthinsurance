# Data-fetching playbook

What reliably works for pulling insurer financials into the audit grid, and the
traps that wasted time — so future fetches are clean. Keep this current as new
routes prove out.

## Routes that work (in order of preference)

1. **Parse a PDF already in the repo** (`pdf-parse` on files under
   `data/raw/companies/<id>/` or `data/agent-pulls/.../sources/`). Most reliable —
   no network. The dashboard's numbers should trace to one of these files.
2. **Agent fetch** (`sahi-financials-fetch.yml` → `sahi-financials-agent.ts`,
   muns chat + India-IP proxy). Good at *finding* NSE-archived docs
   (`nsearchives.nseindia.com/...`) and downloading them into `sources/`. Use it
   to discover the right document and its URL.
3. **Direct-PDF fetch** (`fetch-company-pdfs.yml` → `fetch-company-pdfs.ts`).
   Downloads a *curated exact PDF URL* through the India IP. Use once the agent
   (or you) has the precise URL. Add the URL to `TARGETS`.

## Key insight: investor decks carry BOTH accounting bases

A company's quarterly **earnings-call / investor presentation** ("the PPT")
usually contains, in an appendix, both:
- **IND AS (IFRS)** KPIs, and
- an **"IGAAP measures vs IndAS"** table + an **IND-AS-to-IGAAP profit
  reconciliation**.

So the deck alone can fill *both* the IGAAP and the IFRS rows — read the whole
deck, not just the front KPI page. Validate each filled year against a known
audited year before trusting it (e.g. the deck's IGAAP FY25 should match the
audited annual-report value). **Standing rule: prefer the PPT on any mismatch.**

## Basis discipline (do not cross-fill)

`1/n` vs `n`-basis GWP, and IGAAP vs IND AS, are **different measures, not a
mismatch**. Never put an IND-AS figure in an IGAAP cell or an `n`-basis premium in
a `1/n` cell. If only the wrong-basis number is available, leave the cell tagged.

## Traps (already fixed / known)

- **`period` must stay path-safe.** It's free text (can carry steering hints), but
  `sahi-financials-agent.ts` now slugifies it for filenames — a raw `/` or `&`
  used to crash the run with `ENOENT`. Still, keep dispatch `period` short.
- **Empty agent replies no longer clobber.** The agent script now skips writing a
  blank answer, so a failed search can't overwrite a prior good pull with 0 bytes.
- **BSE `AttachLive` PDF URLs block proxy/datacenter IPs** — the direct fetcher
  can't pull `bseindia.com/xml-data/corpfiling/AttachLive/*.pdf` even via the
  India relay. Prefer the NSE-archived copy of the same filing, or wait for the
  document on the company's own IR site.
- **JS-gated landing pages return empty** (e.g. `starhealth.in/public-disclosures`)
  — point the agent at a *document*, not a navigation page.
- **Screener.in has no statutory line items** (values are AJAX-loaded) — useless
  for GWP/NWP/NEP/ratios. Backup-tier only.

## When a cell can't be filled

Tag it (value-less overlay entry with `display_tag` + `note`) so the grid shows a
calm "Not available" with the reason on the surface — never leave a naked blank,
never invent a number. Common tags: `IFRS not reported`, `FY26 premium pending`,
`FY25 only`, `Basis changed (FY24)`.

## Quarterly (interim) columns — fully automated

The SAHI-comparison **interim** columns (H1 / 9M / Q1) self-fill via
`.github/workflows/sahi-quarterly-backfill.yml` (weekly cron + manual dispatch),
so no human is in the loop. The chain:

1. **Agent is period-aware** — `sahi-financials-agent.ts` detects an interim
   `FETCH_PERIOD` (H1FYxx / 9MFYxx / Q1FYxx) and asks for the *cumulative
   period-to-date* figure with basis discipline (1/n GWP, IGAAP/IFRS). Each fetch
   is wrapped in `timeout 360` so an unreachable deck fails fast.
2. **Per-insurer period map** — niva/star use H1+9M columns, care uses Q1+9M,
   aditya/manipal use Q1. Q4 columns are never fetched (the sheet derives them as
   full-year − 9M).
3. **`audit-fill.ts` accepts interim periods** — its period gate matches
   `FY\d\d` *and* `(Q[1-4]|H1|9M)FY\d\d`; the overlay → value-store → audit-index
   path already keys on `entity::metric::period`, so quarterly flows through.
4. **Publish is "re-apply, never merge"** — the job commits the raw pulls, then on
   each attempt **resets to latest `main` and re-runs the fill** from the cleaned
   files before rebuilding the store + index. This is the only pattern that
   survives the bot's concurrent regenerations; text-merging the big generated
   JSON (or the overlay) deadlocks the rebase. Use the same discipline for any
   manual quarterly fill from a repo PDF.

Validate a backfilled column against a known anchor before trusting the run — the
agent's Niva H1FY26 GWP/NWP reproduced the hand-read deck values exactly, and the
combined = claims + expense identity should hold per period.
