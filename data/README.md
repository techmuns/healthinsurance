# Insurance Investor Dashboard — Data Pipeline

This directory holds the **official-source data foundation** for the
dashboard. It is the durable layer the UI depends on; the UI may render
a "Mock dataset" badge until snapshots are populated, but it should
never silently swap mock numbers for real ones.

## Folder layout

```
data/
  raw/                                 # source-of-truth files, as fetched
    irdai/
      monthly/      ← IRDAI monthly business figures (Excel / PDF)
      quarterly/    ← IRDAI public disclosures (NL/L forms)
      annual/       ← IRDAI Handbook, Annual Report
    companies/
      niva-bupa/
      star-health/
      care-health/
      aditya-birla-health/
      manipalcigna/
      icici-lombard/
      bajaj-general/
      hdfc-life/
      sbi-life/
    exchanges/                          ← NSE / BSE filings, quotes
    gi-council/                         ← industry summaries (where IRDAI is awkward)
  processed/                            # normalised JSON between raw and snapshots
    monthly/
    quarterly/
    annual/
  source-map/
    insurance-source-map.json           ← the metric ↔ source contract
  provenance/                           # historical provenance writes
  logs/                                 # ingestion logs per run

src/data/
  snapshots/                            # production-readable artifacts
    company-master.json                 ← insurer universe
    insurer-monthly-premium.json
    insurer-quarterly-financials.json
    insurer-annual-snapshot.json        ← Phase 1 SAHI peers (schema-shaped)
    industry-segment-premium.json
    sahi-peer-comparison.json
    distribution-channel-mix.json
    distribution-reach-depth.json       ← intentionally blocked
    valuation-snapshot.json
    ownership-snapshot.json
    management-events.json
    data-provenance.json
    data-health.json
    _schemas.ts                         ← TypeScript shapes
  mock/                                 # design-time fixtures (separated cleanly)
```

## Source policy

**Allowed (source of truth):**
- IRDAI portal — handbook, monthly business figures, public disclosures, annual report.
- Official company investor-relations / financial-disclosure pages.
- NSE / BSE filings + quote pages — listed insurers only.
- GI Council — industry / segment statistics where IRDAI is awkward.

**Not allowed for core data:**
- Broker reports, news articles, third-party blogs.
- Screener, Tijori, Moneycontrol, Trendlyne or any aggregator.

These may be used later as optional cross-checks only.

## Raw-first rule

Every fetcher **must save the raw file** before parsing. PDFs as `.pdf`,
Excel as `.xlsx`, HTML snapshots as `.html`, CSV as `.csv`. The raw
file path is stored on every provenance entry, so any displayed number
can be traced back to the exact upstream artefact.

## Period rules

- **Annual** → annual reports / IRDAI annual handbook. FY labels.
- **Quarterly** → quarterly company disclosures / IRDAI L-forms. Q labels.
  Do NOT synthesise quarterly numbers from annual data.
- **Monthly** → IRDAI monthly business figures. Month labels.
  Do NOT synthesise monthly numbers from quarterly data.

If a period is selected in the header and the underlying series isn't
available, the UI shows an `EmptyState` ("Data unavailable for selected
period") rather than silently falling back to another period.

## Validation rules

Run by `scripts/ingest/validate-insurance-data.ts` before any snapshot
is written:

- Channel mix sums to approximately 100% (tolerance ±0.5pp).
- Segment mix sums to total GI premium (tolerance ±1%).
- GWP ≥ NWP ≥ NEP per period.
- Market share is in [0, 100].
- Solvency ratio is positive.
- All ratios are plausible (loss ratio < 200%, etc.).
- Source period matches displayed period.
- Units normalised to INR Cr.
- Percentages stored as numbers (not formatted strings).
- Null is the only marker for "missing" — never zero.

If a record fails validation, it is logged to `data/logs/` and the
previous valid snapshot value is preserved (never overwritten with bad
data).

## Automation

`.github/workflows/insurance-data-ingest.yml` schedules:

- **Monthly** — first week of each month, after IRDAI monthly release.
- **Quarterly** — early in the second month of each quarter.
- **Annual** — after IRDAI annual handbook publication window.
- **Manual dispatch** — anytime.

Each job runs the matching `scripts/ingest/ingest-*.ts`, then
`build-snapshots.ts`, then `validate-insurance-data.ts`, and finally
commits only files that have changed.

If one source fails, the workflow logs the failure and continues other
sources. Previous valid data is **never deleted** on a failed run.

## UI integration

Sections read snapshots through `src/lib/dataLayer.ts`:

```ts
const { value, dataset, sourceUrl, confidence } =
  getCompanyMetrics(companyId, 'Annual')
```

The returned envelope carries the `dataset` label ("official" / "mock" /
"mixed" / "pending"), so the UI can surface the right freshness chip
and source pop-over.

No section should import a raw mock array directly. That migration
happens after Phase 1 snapshots are populated.
