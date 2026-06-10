#!/usr/bin/env python3
"""
Roll the Captable (shareholding) column forward automatically.

The Captable tab's cells are bound to a fixed quarter-end (e.g. 2026-03-31) in
schema-map.json. A filed shareholding pattern for a quarter is final and never
changes — so "keeping shareholding current" really means: when the company files
a NEWER quarter, advance the displayed column to it. This script aligns the
Captable bindings' `period` in schema-map.json to the as_of of
shareholding-pattern-snapshot.json (which fetch-shareholding.ts sets to the latest
filed quarter). It is the hands-off bridge so the dashboard advances quarters with
no human edit.

Guarded + idempotent: it ONLY touches the Captable sheet's bindings, and only
writes when the period actually changes. Run it BEFORE build_value_store.py /
build_audit_index.py so the rebuilt index binds the new period. The snapshot's
holder values are keyed to its own as_of, so the value store fills the advanced
column on the same run.

Usage: python3 scripts/excel/sync_captable_period.py
"""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCHEMA = REPO / "schema-map.json"
SNAPSHOT = REPO / "src" / "data" / "snapshots" / "shareholding-pattern-snapshot.json"
SHEET = "Captable"


def main() -> int:
    try:
        as_of = json.loads(SNAPSHOT.read_text())["_meta"]["as_of"]
    except Exception as e:  # noqa: BLE001
        print(f"sync_captable_period: no snapshot as_of ({e}); nothing to do.")
        return 0
    if not isinstance(as_of, str) or len(as_of) != 10:
        print(f"sync_captable_period: snapshot as_of '{as_of}' is not a YYYY-MM-DD date; skipping.")
        return 0

    schema = json.loads(SCHEMA.read_text())
    sheet = next((s for s in schema.get("sheets", []) if s.get("sheet") == SHEET), None)
    if sheet is None:
        print(f"sync_captable_period: no '{SHEET}' sheet in schema-map; skipping.")
        return 0

    changed = 0
    prev = None
    for b in sheet.get("bindings", []):
        if b.get("period") != as_of:
            prev = prev or b.get("period")
            b["period"] = as_of
            changed += 1

    if not changed:
        print(f"sync_captable_period: Captable already bound to {as_of}; no change.")
        return 0

    # Match build_schema_map.py's writer exactly (indent=2, ensure_ascii=False, no
    # trailing newline) so the only diff is the period field.
    SCHEMA.write_text(json.dumps(schema, indent=2, ensure_ascii=False))
    print(f"sync_captable_period: advanced Captable column {prev} -> {as_of} ({changed} binding(s)).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
