# Project Status — Official Filings → Excel Pipeline

_Last updated: 2026-06-05. Branch: `main`._

This is the handoff/status doc for the official-filings → Excel-fill work. The
container is ephemeral, so this lives in the repo so the next session can pick up
without re-deriving state.

## Where it stands
- **80 / 2155 fillable cells filled (3.7%). QA passes (no hard violations).**
- Full pipeline working: **extract → bridge → fill → QA**.
- Niva Bupa **FY25 + FY26 headline ratios** (claims, combined, solvency) now fill
  from the year-end public disclosures, cross-validated across two filings.
- Workbook (gitignored build artifact): `output/Niva_Bupa_portfolio_review__filled.xlsx`.

## Regenerate the workbook
```bash
npx tsx scripts/ingest/fetch-company-filings.ts   # parse staged PDFs -> company-filings-snapshot.json
python3 scripts/excel/build_value_store.py         # bridge -> data/processed/excel-values.json
python3 scripts/excel/fill_template.py             # fill the workbook
python3 scripts/excel/qa_checks.py                 # QA gate (non-zero exit on hard failure)
```
If you drop NEW official PDFs into `data/raw/company-filings/<company>/<period>/`,
run `python3 scripts/excel/build_filings_inventory.py` first to stage them.

## What's built (chunks 2A–2F + basis rule)
- **Column-aware NL-20 parser**, both layouts — Care decimal, Niva/ICICI percent/`**`,
  ICICI segmental detected & blocked: `scripts/ingest/nl-form-parser.ts`.
- **NL-1 revenue-account parser** (statutory NEP): same file.
- **Inventory period fix** (`Mon-YYYY` → correct fiscal quarter; `fetched_at` preserved):
  `scripts/excel/build_filings_inventory.py`.
- **Bridge** with source-priority resolution, conflict handling, and the
  statutory-1/n basis rule: `scripts/excel/build_value_store.py`.
- **Filler + QA**: `scripts/excel/fill_template.py`, `scripts/excel/qa_checks.py`.
- **Manual-download worklist** (source-blocked frontier): `data/source-map/coverage-worklist.json`.

## Durable rules in force
- **`preferred_ratio_basis = statutory_1n`** — for combined/claims/expense/commission,
  the statutory IRDAI 1/n value wins; an adjusted ex-1/n value → Blocked Data
  (`basis_mismatch_ex_1n_adjusted`, "Annual report adjusted ex-1/n ratio; not
  comparable to statutory 1/n cell"); unclear basis → held `basis_unclear`, not filled.
- **Missing ≠ zero** — never coerce a missing value to 0; hold/mark it.
- **Column rule** — FY cells use the YTD column, quarter cells the standalone column,
  solvency is point-in-time (verified per cell in Source Audit → "Column basis").
- **No PPT values. No annual-report fused tables. No unofficial sources.**

---

## PENDING — your decision (data ready, just needs a yes/no)
1. **Wire NEP into Excel?** Niva statutory NEP is extracted & validated (FY25 =
   4,894.46 cr, matches official to the rupee) but **held** (premiums-from-filings
   policy + not on the target list). Yes → fills `nep` cells (H1FY25, H1FY26, FY25,
   FY26…) immediately. *Explicitly parked for a separate decision.*
2. **GWP basis.** Niva FY25/FY26 GWP empty. Disclosures give **GDPI** (direct
   premium), which differs from `total_gwp` by scope → held. Decide: accept GDPI as
   GWP for health insurers, or wait for a cleaner source.
3. **IFRS cells (63).** `pat_ifrs`, `claims_ratio_ifrs`, etc. — Indian insurers file
   IGAAP, not IFRS; no public source. Recommend reclassifying "available" →
   "unavailable" so the Missing sheet stops implying they're fetchable.

## PENDING — manual download (this sandbox is 403-blocked on insurer sites)
4. **Star Health public disclosures** — biggest single gap (~19+ core ratio cells).
   Exact steps + links in `data/source-map/coverage-worklist.json`. Parser already
   handles Star's layout — drop files in and they fill automatically.
5. **Care FY23** — the 31-Mar-2023 disclosure (3 cells). Same worklist.

## PENDING — future build chunks
6. **PAT** — not in public disclosures (NL-2 P&L is blank); lives only in
   **annual-report fused tables** (deliberately not parsed yet). An annual-report
   parser would unlock Niva PAT **and** Star/ICICI annual figures.
7. **Expense ratio (Niva/Care)** — held: NL-20 prints 2–3 expense bases, mapping not
   certain. Needs a basis decision or stays held.
8. **ICICI** — only a segmental NL-20 staged (correctly blocked); no ICICI cells in
   the schema today. Pursue only if ICICI becomes a peer column.

## Minor tidy-ups (non-blocking)
9. ~50 snapshot-sourced audit rows have a named source but no structured
   `document_type` / `filing_date` — could be back-filled for cleaner click-through.

---

## Highest-leverage next step
**Decide NEP wiring** (instant, zero-risk) and **get Star's disclosures downloaded**
(biggest coverage jump). Everything else is a deliberate future chunk or waiting on
a decision above.
