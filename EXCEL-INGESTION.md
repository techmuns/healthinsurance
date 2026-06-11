# Niva Bupa portfolio review — source-backed Excel ingestion

This rebuilds the Niva Bupa investor workbook — the one that was made with the
paid **S&P Capital IQ** Excel plug-in — from **free, official, public sources**,
on a schedule, with a full audit trail behind every number.

## What it does, in plain words

1. **Reads the workbook as a blank template** (12 sheets). It learns what every
   cell *means* — which company, which metric, which period — and whether the
   cell is a number we must fetch or a formula Excel works out on its own.
2. **Fetches the data** from approved sources (IRDAI, GI Council, the stock
   exchange, and each company's own filings).
3. **Fills a fresh copy** of the workbook with only the numbers it could source,
   and **leaves every cell it could not source blank** — never a guessed number.
4. **Adds two tabs**: a **Source Audit** tab (every filled number, traced to its
   exact source + link + date) and a **Missing Data** tab (everything not yet
   sourced, with the reason).
5. **Runs itself** on a schedule and saves the finished workbook.

### The honesty rules (non-negotiable)

- The original workbook is treated as a **layout only**. Its numbers are **not**
  copied into the output — every figure is re-sourced or left blank.
- **Missing is never zero.** A number we can't source is blank + logged, never 0.
- **Official sources first.** IRDAI / GI Council / NSE-BSE / company disclosures
  are the source of truth. Screener / Trendlyne / Investing are used **only** as
  a clearly-labelled, low-confidence **backup** for the few cells with no
  official equivalent (chiefly broker target prices), and only their **public,
  login-free** pages. *(Decision: Neha, 2026-06-05.)*

## The one thing to know about fetching

The official sites (IRDAI and NSE especially) **block automated access from
cloud/data-centre machines with a 403**. So:

- The scheduled job tries a real browser and an optional in-region relay.
- If a source is still blocked, that's **not a failure of the build** — those
  cells simply stay on the Missing Data tab marked "pending fetch".
- **Manual-upload fallback:** download the official file yourself (e.g. the IRDAI
  monthly Excel, or an NSE price CSV) and drop it into `data/raw/<source>/`. The
  next run picks it up automatically — no code, no toggles. One drop → refreshed
  workbook.

---

## Run it locally

```bash
# 1. Python tooling for the Excel read/fill (one-time)
pip install openpyxl

# 2. Phase 1 - read the template into a cell-level map
python3 scripts/excel/build_schema_map.py templates/niva-bupa-portfolio-review.xlsx

# 3. Phase 2 - project the official snapshots into a normalized value store
python3 scripts/excel/build_value_store.py

# 4. Phase 5 - fill a fresh copy + add Source Audit / Missing Data tabs
python3 scripts/excel/fill_template.py
#    -> output/Niva_Bupa_portfolio_review__filled.xlsx

# 5. Phase 7 - QA gate (exits non-zero on a hard violation)
python3 scripts/excel/qa_checks.py
```

To refresh the underlying data first (Node side, needs internet):

```bash
npm ci
INGEST_OFFLINE=0 npm run ingest          # all sources
INGEST_OFFLINE=0 npm run ingest:monthly  # just monthly premium, etc.
```

Offline (default), the Node fetchers replay whatever is staged under
`data/raw/`, so the pipeline always produces *something* honest.

---

## Repository map

| Path | Phase | What it is |
|---|---|---|
| `templates/niva-bupa-portfolio-review.xlsx` | — | the committed source template (layout of record) |
| `scripts/excel/build_schema_map.py` | 1 | template reader → `schema-map.json` |
| `schema-map.json` | 1 | cell-level contract (entity / metric / period / source per cell) |
| `scripts/excel/build_value_store.py` | 2 | bridge: official snapshots → `data/processed/excel-values.json` |
| `scripts/ingest/ingest-gicouncil-segment-annual.ts` | 3 | GI Council segment report, full-FY cut → Industry Growth sheet (segments, carrier mix, per-insurer health) |
| `scripts/ingest/fetch-investing.ts` | 3 | NSE-first price / delivery (Investing.com backup) |
| `scripts/ingest/fetch-screener.ts` | 3 | Screener backup cross-check (login-free) |
| `scripts/ingest/fetch-trendlyne.ts` | 3 | Trendlyne analyst/shareholding backup (login-free) |
| `.env.example` | 4 | login-free policy + optional IP-relay; no credentials in code |
| `scripts/excel/fill_template.py` | 5 | filler → `output/…__filled.xlsx` + Source Audit + Missing Data |
| `.github/workflows/insurance-data-ingest.yml` | 6 | scheduled fetch → build → QA → artifact |
| `scripts/excel/qa_checks.py` | 7 | QA gate (provenance, partition, units, invariants) |

The Node ingest framework (IRDAI / GI Council / company disclosures / ownership /
distribution / management events) already existed and is reused as-is; see
`data/README.md` for that layer.

### The Industry Growth sheet (GI Council segment report) — yearly refresh

The whole Industry Growth tab (industry premium by segment, health premium by
carrier type, per-SAHI health premium, retail health by insurer) fills from the
GI Council's **segment-wise report** — the monthly XLSX list at
<https://www.gicouncil.in/statistics/industry-statistics/segment-wise-report-on-homepage/>.
Only the **March** editions (and the mid-year **"final segment YY-YY"** re-issues)
cover a complete fiscal year, so only those can fill an FY column; partial-year
months are structurally never promoted to an FY value. For each FY the **newest
GIC statement wins** — a later report's restated "Previous Year" columns
supersede the year's own earlier edition.

**This is now hands-off.** Every month, two scheduled workflows cover each
other:

1. `gicouncil-segment-fetch.yml` (2nd of the month) — the muns chat agent
   enumerates every link on the listing page server-side, the runner downloads
   + checksums any new workbook into `data/agent-pulls/gicouncil-segment/`,
   commits, then dispatches the main ingest.
2. `insurance-data-ingest.yml` (monthly cadence) — the GIC fetchers run live.
   Every gicouncil.in request goes through the tiered byte-getter
   `scripts/ingest/gic-fetch.ts`: direct fetch → headless browser →
   `INGEST_FETCH_PROXY` → ScraperAPI (`SCRAPER_KEY`) → keyless public relays →
   the Internet Archive (with a fresh "Save Page Now" capture of the listing —
   archive.org's crawler fetches GIC from a non-blocked network). If even those
   fail, the muns agent (`MUNS_API_TOKEN`) supplies the listing links. Every
   response is validated (ZIP/PDF magic, block-page detection) before being
   trusted; the ingest then stages files, parses, rebuilds the value store +
   audit index, passes the QA gate and commits the refreshed snapshots.

The fetcher also auto-scans every `data/agent-pulls/*/sources/manifest.json`,
so anything any agent workflow ever downloads flows into both pipelines with
no extra steps. All of it stays idempotent (no new file → no-op), validates
that derived rows re-add to the report's printed sub-totals, and writes a
review sidecar to `data/processed/gic-segment-annual.json` showing which file
"won" each FY.

Manual override (never required, always available): drop a downloaded XLSX
into `data/raw/gicouncil/segment-annual/` (full-FY March / "final" editions)
or `data/raw/gicouncil/segment/<YYYY-MM>.xlsx` (monthly), push or run:

```bash
npm run ingest:gic-segment-annual
python3 scripts/excel/build_value_store.py
python3 scripts/excel/build_audit_index.py
```

### The Channel Mix sheet (IRDAI NL-36/NL-40 business acquisition) — quarterly refresh

The Channel Mix tab (channel GWP mix %, avg premium per policy by channel,
% commission by channel, agents GWP + agents policies) is fed by **two layers**:

1. **Official (rank 3, wins):** `scripts/ingest/ingest-distribution.ts` scans
   every public-disclosure PDF staged under `data/raw/companies/<id>/` for the
   **"Business Acquisition Through Different Channels"** form (NL-36 today,
   NL-40 pre-2022 — it anchors on the caption, not the form number) and reads
   the **up-to-period premium + policy columns** — the same basis as Neha's
   workbook (verified to the 4th decimal on Care FY19/FY24 and Niva FY22–FY25).
   The column-group is identified by a dominance test (cumulative ≥ its own
   quarter) so the era-dependent print order can't mislead it; bucket sums must
   tie to the printed Total (A) and the implied avg premium must be sane, else
   the form is skipped with a warning — never guessed. Premium shares fill the
   mix rows, premium ÷ policies fills the avg-premium rows, and the agents
   premium/policy pair fills the productivity block. Periods are the template's
   cumulative labels (`Q1FYxx`/`H1FYxx`/`9MFYxx`/`FYxx`). A committed parse
   cache (`data/raw/distribution/nl36-parse-cache.json`) makes re-runs
   incremental — bump `PARSER_VERSION` after a parser change.
2. **Workbook seed (rank 8, superseded by any official value):** Neha's
   Channel Mix sheet (`data/uploads/channel-mix-seed-workbook.xlsx`,
   provided 2026-06-11) seeds the history via
   `scripts/excel/build_channel_mix_seed.py` →
   `data/source-map/channel-mix-seed.json`. Unlike the Industry Growth seed,
   printed **zeros are kept** (0% commission on direct business is a real
   figure, not a missing era). % commission by channel has **no NL-form
   source** (the NL-6 commission schedule is by line of business, not channel),
   so those cells ride the seed until a per-channel commission source is
   chosen.

**Hands-off forward path:** the fetcher runs at `quarterly` cadence inside the
scheduled `insurance-data-ingest.yml` (Feb/May/Aug/Nov crons), scanning
whatever disclosures the company fetchers have staged by then; each new
quarter's NL-36 supersedes the seed for that column automatically and the
ingest rebuilds the value store + audit index, passes QA and commits. Star's
disclosures are 403-blocked to the runner today, so Star rides the seed until
its PDFs land (the `fetch-company-pdfs` ScraperAPI path or a manual drop —
the parser handles its layout the moment the files exist).

Manual run after dropping new disclosure PDFs into `data/raw/companies/<id>/`:

```bash
npm run ingest:distribution
python3 scripts/excel/build_value_store.py
python3 scripts/excel/fill_template.py && python3 scripts/excel/qa_checks.py
python3 scripts/excel/build_audit_index.py
```

---

## How to add a new company or metric

**A new metric (row) in an existing sheet:** add it to the per-sheet layout in
`scripts/excel/build_schema_map.py` (e.g. `SAHI_CMP_ROWS`), then map a snapshot
field to it in `scripts/excel/build_value_store.py`. Re-run steps 2-4.

**A new company:** add it to `src/data/snapshots/company-master.json` (the
`company_id` source of truth) and to the relevant `*_BLOCKS` / row lists in
`build_schema_map.py`. The `entity_from_label()` table maps the workbook's
display name → `company_id`.

**A new source:** add a Fetcher under `scripts/ingest/` that writes a snapshot in
the standard `{ _meta, data: [...] }` shape, register it in `ingest-all.ts`, then
add one mapping table entry in `build_value_store.py`. Official sources are
`confidence: high`; aggregator backups must be `confidence: low` +
`source_status: backup`.

---

## Run it on GitHub Actions

- **Schedule** (`.github/workflows/insurance-data-ingest.yml`): daily (price),
  monthly (IRDAI premium), quarterly (financials/shareholding), annual.
- **Manual:** Actions → *insurance-data-ingest* → *Run workflow* → pick a cadence
  and set **live = true** to fetch.
- Every run uploads the finished workbook + `schema-map.json` + value store as the
  **`niva-bupa-portfolio-review-filled`** artifact, runs the **QA gate**, and
  commits any changed snapshots. A hard QA violation (e.g. a value with no
  source) **fails the run**.
- **Optional secret** `INGEST_FETCH_PROXY` — an in-region fetch relay URL
  (template with a literal `{url}`) for sources that 403 the runner's IP. This
  only changes the egress IP; it is **not** a paywall/CAPTCHA bypass. No site
  logins are used or needed.

---

## Known source limitations (the honest list)

- **IRDAI / NSE 403 the cloud runner.** Live fetch needs the `INGEST_FETCH_PROXY`
  relay or the manual-upload fallback. Until then those cells read "pending fetch".
- **Unlisted SAHIs** (Care, Aditya Birla, ManipalCigna) have **no market price,
  market cap, or shareholding** — those Comps/Captable cells are genuinely
  `unavailable_publicly`, not a bug.
- **3-yr average P/E** (Comps) was a Capital IQ figure with no clean free
  equivalent; the backup is Screener's public page (low confidence) or computing
  it from NSE price history + reported EPS.
- **Analyst coverage** is inherently aggregator-sourced (no official feed for
  broker targets) → Trendlyne backup, `confidence: low`.
- **Management commentary** and **Key sectoral updates** are editorial summaries /
  curated news, not fetchable figures. They are drafted from earnings-call
  transcripts / the press and reviewed by a human — they are flagged on the
  Missing Data tab as narrative, not auto-filled.
- **openpyxl** preserves cell values, formulas, styles, merged cells and column
  widths, but can drop embedded **charts / pivot tables / macros** if the
  template ever gains them. The current template has none.
