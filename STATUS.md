# Project Status — Official Filings → Excel Pipeline

_Last updated: 2026-06-08. Branch: `main`._

This is the handoff/status doc for the official-filings → Excel-fill work. The
container is ephemeral, so this lives in the repo so the next session can pick up
without re-deriving state.

## Where it stands
- **84 / 2155 fillable cells filled (3.9%). QA passes (no hard violations).**
- Full pipeline working: **extract → bridge → fill → QA**.
- Niva Bupa **FY25 + FY26 headline ratios** (claims, combined, solvency) now fill
  from the year-end public disclosures, cross-validated across two filings.
- **Statutory NEP now wired** (Neha, 2026-06-08): Niva FY26 / H1FY25 / Q4FY25 /
  H1FY26 / Q4FY26 newly fill from the NL-1 revenue account; FY24/FY25 upgraded to
  the statutory source. FY23 held — see the restatement decision below.
- Workbook (gitignored build artifact): `output/Niva_Bupa_portfolio_review__filled.xlsx`.
- **Setup note:** the fill/QA steps need `openpyxl` (`pip3 install openpyxl`); a
  fresh container won't have it.

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

## PENDING — your decision
1. ~~Wire NEP into Excel?~~ **DONE** (Neha, 2026-06-08) — statutory NL-1 NEP wired
   with the flow/column rule. See "Where it stands".
2. ~~GWP basis.~~ **RESOLVED** — the annual snapshot already supplies Niva GWP on
   the **direct-premium (GDPI)** basis (FY25 = 6,762.23 cr); the ex-1/n headline
   (7,407) stays held. Neha chose "use direct premium" → already in effect for the
   filled cells. Gap remaining: FY26 / H1 / 9M GWP have no direct-premium source.
3. **FY23 NEP restatement (NEW).** Wiring NEP surfaced a genuine conflict: Niva
   FY23 NEP is **2,841** as first reported but **2,662.75** as restated in the FY24
   filing. Held on Blocked Data (`source_conflict`). Decide which basis the FY23
   cell shows (restated 2,662.75 recommended for cross-year comparability).
4. **IFRS cells (63)** — `pat_ifrs` (27), `claims_ratio_ifrs` (18),
   `expense_ratio_ifrs` (15), `net_worth_ifrs` (3). Indian insurers file **IGAAP,
   not IFRS**. Neha says the figures live in each company's **PPT** — but the
   `no PPT values` rule is in force, and a deck figure may be IGAAP/adjusted, not
   IFRS. Blocked on: (a) getting a deck (sandbox is 403-blocked on insurer sites),
   (b) verifying the basis is genuinely IFRS before wiring. Awaiting Neha's deck
   or a decision to mark them unavailable.

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
