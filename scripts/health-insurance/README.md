# Indian Health Insurance Disclosure Scraper

A production-grade, compliance-first data pipeline that discovers, downloads,
catalogs and extracts public disclosures from Indian health insurers and
regulatory sources, and turns them into dashboard-ready JSON time series.

It is built to be **maintained**, not run once: adding an insurer is a config
change, every value is source-auditable, and blocked sources are handled
honestly instead of bypassed.

## Primary companies

`star-health` · `niva-bupa` · `care-health` · `manipal-cigna` ·
`aditya-birla-health` — add more in `config/companies.ts`.

## Pipeline

```
discover → catalog → extract → classify → period → merge(history) → validate → report
```

| Stage | Module |
|---|---|
| HTTP (compliant: retries 429/5xx only, never bypasses 401/403) | `utils/http.ts` |
| Company / source / metric config (the only hard-coded values) | `config/*.ts` |
| Live discovery (IR / exchange / IRDAI) | `scrapers/*.ts` |
| PDF text + tables, classification, period parsing, metric extraction | `extractors/*.ts` |
| Raw cache, JSON store, history-preserving merge | `storage/*.ts` |
| Confidence scoring, schema validation, review queue | `quality/*.ts` |
| Orchestration | `pipeline.ts` |

## Run it

```bash
npm ci

# All companies, offline (extract from the cached corpus under data/raw/companies)
npx tsx scripts/scrape-health-insurance.ts

# One company
npx tsx scripts/scrape-health-insurance.ts --slug niva-bupa

# Attempt live discovery too (sources may be blocked — handled gracefully)
HI_LIVE=1 npx tsx scripts/scrape-health-insurance.ts

# Validate the output (CI gate — exits 1 on any schema break)
npx tsx scripts/validate-health-insurance-data.ts
```

### Environment flags

| Var | Default | Meaning |
|---|---|---|
| `HI_LIVE` | `0` | `1` enables live discovery of IR/exchange/IRDAI pages. |
| `HI_DOWNLOAD` | `0` | `1` downloads live-discovered docs into the raw cache (where allowed). |
| `HI_SLUG` / `HI_COMPANY` | — | Restrict the run to one company. |
| `HI_RAW_ROOT` | `data/raw/companies` | Where the raw corpus lives / is written. |
| `HI_RAW_PERSIST` | `local` | `local` \| `lfs` \| `r2` \| `s3` (object-store offload is opt-in). |
| `HI_COMMIT_RAW` | `0` | `1` to allow committing raw binaries (off by default). |
| `HI_MAX_CATALOG` / `HI_MAX_DOCS` | `400` / `60` | Bounds per company (catalog vs deep-extract). |
| `HI_USER_AGENT` | project UA | Override the transparent identifying User-Agent. |
| `HI_DEBUG` | `0` | `1` for per-document debug logs. |

## Outputs (`data/`)

- `star-health.json`, `niva-bupa.json`, `care-health.json`, `manipal-cigna.json`,
  `aditya-birla-health.json` — per-company documents + metric time series.
- `run-report.json` — every-run summary (discovered / extracted / blocked / review).
- `source-status.json` — per-source reachability ledger.
- `extraction-review-queue.json` — low-confidence / conflict / unknown items.

## Compliance posture

- Only **public** documents. The HTTP client retries only transient errors
  (429, 5xx, timeouts); a `401`/`403`/captcha/bot-challenge is recorded as
  **blocked** and skipped — no proxy rotation, no browser impersonation, no
  retrying a hard block.
- **No fabricated data.** Every metric is parsed from a source document and
  carries its source URL, page number, raw snippet, confidence and tag.
  Missing ≠ zero — an absent metric is simply absent.

## Trust model (why some sources don't yield "confirmed" metrics)

Confirmed metrics come only from **structured disclosures** (annual reports,
earnings/investor presentations, quarterly results, press releases). Two
classes are deliberately routed to the review queue rather than asserted:

- **IRDAI NL/L-form disclosures** — dense, multi-column, reported in ₹'000/lakhs
  (not crores); scale and period-column alignment need a form-specific parser.
- **Call transcripts** — Q&A prose where figures are usually comparatives.

Multi-period table cells (where the period column is ambiguous) are likewise
downgraded to review rather than mislabelled.

## Extending

Add an insurer: append an entry to `COMPANIES` in `config/companies.ts`
(`slug`, `name`, `aliases`, IR/disclosure URLs, exchange ids, `rawDir`,
document rules). Add a metric: append to `METRICS` in `config/metrics.ts`
(label locators + plausibility band). Nothing else needs to change.
