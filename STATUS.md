# Project Status — Official Filings → Excel Pipeline

_Last updated: 2026-06-08. Branch: `main`._

This is the handoff/status doc for the official-filings → Excel-fill work. The
container is ephemeral, so this lives in the repo so the next session can pick up
without re-deriving state.

## Where it stands
- **101 / 2155 fillable cells filled (4.7%). QA passes (no hard violations).**
- Full pipeline working: **extract → bridge → fill → QA**.
- Niva Bupa **FY25 + FY26 headline ratios** (claims, combined, solvency) now fill
  from the year-end public disclosures, cross-validated across two filings.
- **Statutory NEP wired** (Neha, 2026-06-08): Niva FY26 / H1FY25 / Q4FY25 / H1FY26 /
  Q4FY26 fill from the NL-1 revenue account; FY24/FY25 upgraded to the statutory
  source; FY23 fills the **restated** 2,662.75 (as-first-reported 2,841 kept on
  Blocked Data). All 8 Niva NEP cells now filled.
- **IFRS cells via company decks** (Neha, 2026-06-08 — `no PPT` rule overridden for
  IFRS only): **16 of Niva's 20 IFRS cells** filled from its Q4FY26 / H1FY26 / Q3FY26 /
  Q4FY25 decks — all 8 `pat_ifrs`, `claims_ratio_ifrs` + `expense_ratio_ifrs` for the
  cumulative periods (FY/H1/9M), and `net_worth_ifrs`. The 4 standalone-quarter ratios
  (Q4FY25/Q4FY26 claims+expense) aren't printed in any deck → honestly empty.
  Transcribed by hand with page-level provenance; every audit row states
  "special-purpose IFRS, not the statutory filing".
- Workbook (gitignored build artifact): `output/Niva_Bupa_portfolio_review__filled.xlsx`.
- **Setup note:** fill/QA need `openpyxl` (`pip3 install openpyxl`). Re-extracting
  deck figures needs `pypdfium2`; the values are already transcribed into
  `data/source-map/deck-sourced-values.json`, so the pipeline itself doesn't need it.

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
- **Bridge** with source-priority resolution, conflict handling, the statutory-1/n
  basis rule, and the NEP restatement-supersede rule: `scripts/excel/build_value_store.py`.
- **Deck-sourced layer** (`company_deck`, rank 2): hand-transcribed, page-cited values
  from official investor decks, wired for IFRS cells only — `collect_deck_sourced()`
  reads `data/source-map/deck-sourced-values.json`. Each audit row carries the
  "special-purpose IFRS, not statutory" caveat.
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
  *Exception (Neha, 2026-06-08): the `no PPT` rule is overridden for **IFRS cells
  only** — deck figures are wired via the `company_deck` layer, hand-transcribed with
  page-level provenance and labelled "special-purpose IFRS, not the statutory filing".*

---

## PENDING — your decision
1. ~~Wire NEP into Excel?~~ **DONE** (Neha, 2026-06-08) — statutory NL-1 NEP wired
   with the flow/column rule. See "Where it stands".
2. ~~GWP basis.~~ **RESOLVED** — the annual snapshot already supplies Niva GWP on
   the **direct-premium (GDPI)** basis (FY25 = 6,762.23 cr); the ex-1/n headline
   (7,407) stays held. Neha chose "use direct premium" → already in effect for the
   filled cells. Gap remaining: FY26 / H1 / 9M GWP have no direct-premium source.
3. ~~FY23 NEP restatement.~~ **DONE** (Neha, 2026-06-08) — FY23 fills the restated
   2,662.75; as-first-reported 2,841 documented on Blocked Data
   (`superseded_by_statutory_filing`).
4. **IFRS cells (63) — Niva DONE, 6 companies pending.** Niva: 16/20 filled from its
   four decks; the 4 unfilled are standalone-quarter claims/expense ratios that no deck
   prints. **Remaining ~47 cells = the other 6 companies** (Star/Care/ManipalCigna/
   Aditya-Birla/ICICI/GoDigit) — **no decks staged**. Drop their investor decks into
   `data/raw/companies/<id>/`, add page-cited rows to `deck-sourced-values.json`, rerun
   the bridge. Sandbox is 403-blocked on insurer sites, so Neha/an enabled fetch must
   supply the decks.

## PENDING — manual download (this sandbox is 403-blocked on insurer sites)
5. **Star Health public disclosures** — biggest single gap (~19+ core ratio cells).
   Exact steps + links in `data/source-map/coverage-worklist.json`. Parser already
   handles Star's layout — drop files in and they fill automatically.
6. **Care FY23** — the 31-Mar-2023 disclosure (3 cells). Same worklist.

## PENDING — future build chunks
7. **PAT (IGAAP)** — statutory NL-2 P&L is blank; the IGAAP PAT is reachable from the
   **deck I-GAAP→IFRS reconciliation** (Niva Q4 FY26 deck p.30: I-GAAP PAT FY24 81.9 /
   FY25 213.5 / FY26 130.8) via the same `deck-sourced-values.json` mechanism — a
   pending decision since it's deck-sourced, not the statutory filing.
8. **Expense ratio (Niva/Care, IGAAP)** — held: NL-20 prints 2–3 expense bases, mapping
   not certain. Needs a basis decision or stays held. (IFRS expense ratio is in the deck.)
9. **ICICI** — only a segmental NL-20 staged (correctly blocked); no ICICI cells in
   the schema today. Pursue only if ICICI becomes a peer column.

## Minor tidy-ups (non-blocking)
10. ~50 snapshot-sourced audit rows have a named source but no structured
    `document_type` / `filing_date` — could be back-filled for cleaner click-through.

---

## Highest-leverage next step
**Get the other six insurers' investor decks** (Star/Care/ManipalCigna/Aditya-Birla/
ICICI/GoDigit) — that unlocks ~47 IFRS cells through the same page-cited deck mechanism —
and **download Star's public disclosures** (biggest statutory-ratio gap). Niva's deck
mining is complete (16/20; the rest aren't printed anywhere).
