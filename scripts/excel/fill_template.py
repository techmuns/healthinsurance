#!/usr/bin/env python3
"""
Phase 5 - Template filler.

Reads ``schema-map.json`` (the cell contract) and ``data/processed/excel-values.json``
(the normalized, source-backed value store) and writes a filled copy of the
workbook, preserving the original formatting and every Excel formula.

Honesty model (per project policy + the task brief):
* The source template is treated as a *layout only*. We do NOT keep its original
  numbers. Each fillable cell is either (a) written from a source-backed value,
  or (b) left blank and recorded on the **Missing Data** sheet. Missing != zero.
* Formula cells are preserved untouched, so the workbook's own totals / YoY /
  mix-% recompute from whatever inputs we *did* source - which doubles as a
  reconciliation check.
* The Capital IQ plug-in cells (Market Cap / EV / 3-yr P/E in 'Comps') are
  formulas that only worked with the paid plug-in. We replace them with a fetched
  value when we have one, or clear them (so Excel shows a blank, not a #NAME?
  error) and record them as missing.
* Two sheets are appended: **Source Audit** (every filled value, full
  provenance) and **Missing Data** (every unfilled cell, with a reason).

Usage:
    python3 scripts/excel/fill_template.py [template.xlsx] [output.xlsx]
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill

REPO = Path(__file__).resolve().parents[2]
SCHEMA = REPO / "schema-map.json"
VALUES = REPO / "data" / "processed" / "excel-values.json"
TEMPLATE = REPO / "templates" / "niva-bupa-portfolio-review.xlsx"
OUT = REPO / "output" / "Niva_Bupa_portfolio_review__filled.xlsx"

AUDIT_SHEET = "Source Audit"
MISSING_SHEET = "Missing Data"

MISSING_REASON = {
    "available": "Source supported but value not yet fetched - run the ingestion job (needs internet egress).",
    "partial": "Partially available from official disclosures - period/coverage gap.",
    "backup": "No official equivalent; backup aggregator (Screener/Trendlyne) returned no value.",
    "computed": "Computed in-sheet by an Excel formula - no fetch required.",
    "narrative": "Editorial summary from transcripts - populated by a reviewer, not a numeric fetch.",
    "excluded_from_core": "Outside the source-backed core dataset (curated news).",
}


def header(ws, titles, fill="1F4E5F"):
    bold = Font(bold=True, color="FFFFFF")
    pat = PatternFill("solid", fgColor=fill)
    for c, t in enumerate(titles, start=1):
        cell = ws.cell(1, c, t)
        cell.font = bold
        cell.fill = pat
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    ws.freeze_panes = "A2"


def autosize(ws, widths):
    from openpyxl.utils import get_column_letter
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def main(template_path: Path, out_path: Path) -> None:
    schema = json.loads(SCHEMA.read_text())
    store = json.loads(VALUES.read_text()) if VALUES.exists() else {}

    wb = openpyxl.load_workbook(template_path)  # keep formulas
    # Drop any stale audit sheets from a previous run.
    for s in (AUDIT_SHEET, MISSING_SHEET):
        if s in wb.sheetnames:
            del wb[s]

    audit_rows, missing_rows = [], []
    filled = skipped = 0

    for sheet in schema["sheets"]:
        name = sheet["sheet"]
        if name not in wb.sheetnames:
            continue
        ws = wb[name]
        for b in sheet["bindings"]:
            if not b.get("fillable"):
                continue
            key = f"{b['entity']}::{b['metric']}::{b['period']}"
            entry = store.get(key)
            cell = b["cell"]
            if entry and entry.get("normalized_value") is not None:
                ws[cell] = entry["normalized_value"]
                filled += 1
                audit_rows.append([
                    name, cell, b["entity"], b["metric"], b["period"], b["unit"],
                    entry.get("raw_value"), entry.get("normalized_value"),
                    entry.get("transformation_used"), entry.get("source_name"),
                    entry.get("source_url"), entry.get("fetched_at"),
                    entry.get("confidence"), entry.get("source_status", "available"),
                ])
            else:
                # No source-backed value: blank the cell (missing != zero). This
                # also clears CIQ plug-in formulas so the workbook shows a blank
                # rather than a #NAME? error once the paid plug-in is gone.
                ws[cell] = None
                skipped += 1
                status = b.get("source_status", "available")
                missing_rows.append([
                    name, cell, b["entity"], b["metric"], b["period"], b["unit"],
                    status, MISSING_REASON.get(status, "Unavailable."),
                    b.get("source_name", ""),
                    "unavailable_publicly" if status in ("backup", "excluded_from_core") else "pending_fetch",
                ])

    # --- Source Audit sheet ------------------------------------------------
    aud = wb.create_sheet(AUDIT_SHEET)
    header(aud, ["Sheet", "Cell", "Entity", "Metric", "Period", "Unit",
                 "Raw value", "Normalized value", "Transformation",
                 "Source name", "Source URL", "Fetched at", "Confidence", "Status"])
    autosize(aud, [18, 7, 14, 26, 12, 9, 13, 15, 30, 34, 46, 22, 11, 12])
    for r in audit_rows:
        aud.append(r)

    # --- Missing Data sheet ------------------------------------------------
    mis = wb.create_sheet(MISSING_SHEET)
    header(mis, ["Sheet", "Cell", "Entity", "Metric", "Period", "Unit",
                 "Source status", "Reason", "Intended source", "Marker"], fill="7A3B2E")
    autosize(mis, [18, 7, 14, 26, 12, 9, 14, 52, 40, 20])
    for r in missing_rows:
        mis.append(r)

    # --- Run banner on the audit sheet (top, above the freeze) ------------
    aud.insert_rows(1)
    banner = aud.cell(1, 1,
        f"Source-backed fill - generated {datetime.now(timezone.utc).isoformat()} - "
        f"{filled} cells filled from official sources, {skipped} marked missing. "
        f"Template treated as layout only; original values NOT retained. Every "
        f"filled cell is traceable below.")
    banner.font = Font(italic=True, color="555555")
    aud.merge_cells(start_row=1, start_column=1, end_row=1, end_column=14)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)

    total = filled + skipped
    pct = (100.0 * filled / total) if total else 0.0
    print(f"filled workbook written -> {out_path}")
    print(f"  fillable cells: {total}")
    print(f"  filled from official sources: {filled} ({pct:.1f}%)")
    print(f"  marked missing (Missing Data sheet): {skipped}")
    print(f"  audit rows: {len(audit_rows)}")


if __name__ == "__main__":
    tpl = Path(sys.argv[1]) if len(sys.argv) > 1 else TEMPLATE
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else OUT
    if not tpl.exists():
        sys.exit(f"Template not found: {tpl}")
    main(tpl, out)
