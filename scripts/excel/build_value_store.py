#!/usr/bin/env python3
"""
Phase 2 bridge - normalized value store for the Excel filler.

Reads the repo's existing OFFICIAL-source snapshots (src/data/snapshots/*.json,
produced by the TypeScript ingest pipeline from IRDAI / GI Council / company
public disclosures) and projects them into a single flat store keyed by
``"<entity>::<metric>::<period>"`` that the Phase 5 filler consumes.

Honesty rules:
* Only real values are emitted. A ``null`` in a snapshot is dropped (never 0),
  so the cell stays "missing" and lands on the Missing Data sheet.
* Every entry carries the full provenance contract the task requires
  (source_name, source_url, fetched_at, period, raw_value, normalized_value,
  transformation_used, confidence, source_status).
* Unit transforms are explicit and recorded in ``transformation_used`` so a
  percentage in a snapshot (e.g. 96.1) becomes the fraction the template stores
  (0.961) with a clear audit trail.

This bridge is the seam where future source adapters plug in: any new fetcher
that writes a snapshot in the same shape is mapped here with one table entry.
"""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SNAP = REPO / "src" / "data" / "snapshots"
OUT = REPO / "data" / "processed" / "excel-values.json"


def pct_to_fraction(v):
    return v / 100.0


def identity(v):
    return v


TRANSFORMS = {
    "identity": (identity, "identity (value used as-is)"),
    "pct_to_fraction": (pct_to_fraction, "percent -> fraction (value / 100)"),
}


def emit(store, entity, metric, period, raw_value, transform, unit, prov, status="available"):
    """Add one normalized entry. Drops nulls (missing != zero). First write wins
    so a richer snapshot mapped earlier is not clobbered by a coarser one."""
    if raw_value is None:
        return
    key = f"{entity}::{metric}::{period}"
    if key in store:
        return
    fn, label = TRANSFORMS[transform]
    store[key] = {
        "entity": entity,
        "metric": metric,
        "period": period,
        "unit": unit,
        "raw_value": raw_value,
        "normalized_value": fn(raw_value),
        "transformation_used": label,
        "source_name": prov.get("source_name"),
        "source_url": prov.get("source_url"),
        "source_file": prov.get("source_file"),
        "fetched_at": prov.get("fetched_at"),
        "confidence": prov.get("confidence", "medium"),
        "source_status": status,
    }


def load(name):
    p = SNAP / f"{name}.json"
    if not p.exists():
        return []
    return json.loads(p.read_text()).get("data", [])


# (snapshot_field, target_metric, transform, unit)
ANNUAL_MAP = [
    ("gross_direct_premium", "total_gwp", "identity", "INR_cr"),
    ("nwp", "nwp", "identity", "INR_cr"),
    ("nep", "nep", "identity", "INR_cr"),
    ("pat", "pat_igaap", "identity", "INR_cr"),
    ("combined_ratio", "combined_ratio_igaap", "pct_to_fraction", "ratio"),
    ("claims_ratio", "claims_ratio_igaap", "pct_to_fraction", "ratio"),
    ("expense_ratio", "expense_ratio_igaap", "pct_to_fraction", "ratio"),
    ("solvency_ratio", "solvency_ratio", "identity", "ratio"),
]

QUARTERLY_MAP = [
    ("gwp", "total_gwp", "identity", "INR_cr"),
    ("nwp", "nwp", "identity", "INR_cr"),
    ("nep", "nep", "identity", "INR_cr"),
    ("pat", "pat_igaap", "identity", "INR_cr"),
    ("combined_ratio", "combined_ratio_igaap", "pct_to_fraction", "ratio"),
    ("claims_ratio", "claims_ratio_igaap", "pct_to_fraction", "ratio"),
    ("expense_ratio", "expense_ratio_igaap", "pct_to_fraction", "ratio"),
    ("solvency_ratio", "solvency_ratio", "identity", "ratio"),
]

INDUSTRY_MAP = [
    ("health_premium", "Health Insurance", "gi_segment_gross_premium"),
    ("motor_premium", "Motor Insurance", "gi_segment_gross_premium"),
    ("total_gi_premium", "Total", "gi_segment_gross_premium"),
]

CHANNEL_MAP = [
    ("banca_share", "channel_gwp_mix::Banca"),
    ("broker_share", "channel_gwp_mix::Brokers"),
    ("agent_share", "channel_gwp_mix::Individual agents"),
    ("corporate_agent_share", "channel_gwp_mix::Corporate Agents - Others"),
    ("direct_share", "channel_gwp_mix::Direct Business"),
    ("others_share", "channel_gwp_mix::Others"),
]


def main():
    store = {}

    # --- insurer-annual-snapshot -> SAHIs comparison (annual) -------------
    for r in load("insurer-annual-snapshot"):
        prov = r.get("provenance", {})
        period = r.get("fiscal_year")
        if not period:
            continue
        for field, metric, tf, unit in ANNUAL_MAP:
            emit(store, r["company_id"], metric, period, r.get(field), tf, unit, prov)

    # --- sahi-peer-comparison -> market-share metrics --------------------
    for r in load("sahi-peer-comparison"):
        prov = r.get("provenance", {})
        period = r.get("fiscal_year")
        if not period:
            continue
        emit(store, r["company_id"], "overall_health_market_share", period,
             r.get("health_market_share"), "pct_to_fraction", "ratio", prov)
        emit(store, r["company_id"], "retail_health_market_share", period,
             r.get("retail_health_market_share"), "pct_to_fraction", "ratio", prov)

    # --- insurer-quarterly-financials -> SAHIs comparison (quarterly) ----
    for r in load("insurer-quarterly-financials"):
        prov = r.get("provenance", {})
        q, fy = r.get("quarter"), r.get("fiscal_year")
        if not (q and fy):
            continue
        period = f"{q}{fy}"  # e.g. "Q4FY25" - matches schema-map period labels
        for field, metric, tf, unit in QUARTERLY_MAP:
            emit(store, r["company_id"], metric, period, r.get(field), tf, unit, prov)

    # --- industry-segment-premium -> Industry Growth ---------------------
    for r in load("industry-segment-premium"):
        prov = r.get("provenance", {})
        period = r.get("fiscal_year") or r.get("period")
        if not period:
            continue
        for field, entity, metric in INDUSTRY_MAP:
            emit(store, entity, metric, period, r.get(field), "identity", "INR_cr", prov)

    # --- distribution-channel-mix -> Channel Mix -------------------------
    for r in load("distribution-channel-mix"):
        prov = r.get("provenance", {})
        period = r.get("fiscal_year") or r.get("period")
        if not period:
            continue
        for field, metric in CHANNEL_MAP:
            emit(store, r["company_id"], metric, period, r.get(field),
                 "pct_to_fraction", "ratio", prov, status="partial")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(store, indent=2, ensure_ascii=False))
    print(f"excel-values.json written -> {OUT}")
    print(f"  {len(store)} normalized values from official snapshots")
    from collections import Counter
    by_metric = Counter(v["metric"].split("::")[0] for v in store.values())
    for metric, n in by_metric.most_common():
        print(f"    {metric:<32} {n}")


if __name__ == "__main__":
    main()
