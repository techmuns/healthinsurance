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
