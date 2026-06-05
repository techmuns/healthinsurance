#!/usr/bin/env python3
"""
Chunk 1 - Filings inventory / manifest.

Builds ``data/source-map/filings-inventory.json``: one row per official filing,
recording source_url, document_type, period, filing_date, checksum (sha256),
bytes, and fetch_status. It is honest about what we actually hold:

* Files already staged under ``data/raw/`` are inventoried with a real sha256 and
  ``fetch_status="staged_local"`` (we have the bytes; Chunk 2's parser will read
  them).
* Documents the registry declares but that are NOT staged are added as
  ``fetch_status="declared_pending"`` (sha256 null) - from this cloud box every
  official site 403s, so they are fetched in CI or dropped in manually.

This does NOT parse the documents or touch the value store / fill / QA / workflow.
It also prints a coverage report (the Chunk 1 deliverable).
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
RAW = REPO / "data" / "raw"
REGISTRY = REPO / "data" / "source-map" / "company-source-registry.json"
SCHEMA = REPO / "schema-map.json"
OUT = REPO / "data" / "source-map" / "filings-inventory.json"

# Document-type classification (first match wins; order matters).
NON_FINANCIAL = re.compile(r"agentcode|citizen ?charter|grievance|complain|brochure|policy-?wording|agentlist", re.I)
TYPE_RULES = [
    ("annual_report",       re.compile(r"annual[-_ ]?report|(?:^|[-_/])AR[-_]\d", re.I)),
    ("investor_presentation", re.compile(r"presentation|investor[-_ ]?ppt|earnings[-_ ]?deck|\bdeck\b", re.I)),
    ("earnings_transcript", re.compile(r"transcript|earnings[-_ ]?call", re.I)),
    ("public_disclosure",   re.compile(r"public[-_ ]?disclosure|quantative|quantitative|\bNL[-_]?\d|\bL-\d|\d{4}q[1-4]NL|\d{3,4}q[1-4]", re.I)),
    ("quarterly_results",   re.compile(r"press[-_ ]?release|result|financial[-_ ]?result", re.I)),
    ("exchange_filing",     re.compile(r"(?:^|[-_/])ann[-_]|announcement", re.I)),
]

FY_PATTERNS = [
    re.compile(r"20(\d{2})[-_](?:20)?(\d{2})"),       # 2024-2025 / 2024-25
    re.compile(r"FY[-_ ]?20?(\d{2})", re.I),           # FY25 / FY2025
]
QTR_PATTERN = re.compile(r"\bQ([1-4])\b.*?FY?[-_ ]?(\d{2})", re.I)
MONTH_QTR = {"jun": "Q1", "sep": "Q2", "dec": "Q3", "mar": "Q4"}
MONTH_PATTERN = re.compile(r"(jun|sep|dec|mar)[-_ ]?(\d{2})", re.I)
OLD_NL = re.compile(r"(\d{2})(\d{2})q([1-4])")        # 1213q1 -> FY13 Q1
EPOCH = re.compile(r"(?<!\d)(1[0-9]{9})(?!\d)")        # 10-digit unix ts
ISO_DATE = re.compile(r"(20\d{2})[-_](\d{2})[-_](\d{2})")


def classify(name: str) -> tuple[str, bool]:
    if NON_FINANCIAL.search(name):
        return "non_financial", True
    for dtype, rx in TYPE_RULES:
        if rx.search(name):
            return dtype, False
    return "other", True


def infer_period(name: str) -> str | None:
    m = OLD_NL.search(name)
    if m:
        return f"FY{m.group(2)} Q{m.group(3)}"
    m = QTR_PATTERN.search(name)
    if m:
        return f"Q{m.group(1)}FY{m.group(2)}"
    m = MONTH_PATTERN.search(name)
    if m:
        return f"{MONTH_QTR[m.group(1).lower()]}FY{m.group(2)}"
    for rx in FY_PATTERNS:
        m = rx.search(name)
        if m:
            return f"FY{m.groups()[-1]}"
    return None


def infer_filing_date(name: str) -> str | None:
    m = ISO_DATE.search(name)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = EPOCH.search(name)
    if m:
        try:
            return datetime.fromtimestamp(int(m.group(1)), tz=timezone.utc).date().isoformat()
        except (OverflowError, OSError, ValueError):
            return None
    return None


def sha256_of(p: Path) -> tuple[str, int]:
    h = hashlib.sha256()
    n = 0
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
            n += len(chunk)
    return h.hexdigest(), n


def main() -> None:
    registry = json.loads(REGISTRY.read_text())["data"]
    reg_ids = {c["company_id"] for c in registry}
    rows = []

    # 1) Walk staged raw files.
    for base in ("companies", "announcements"):
        root = RAW / base
        if not root.exists():
            continue
        for p in sorted(root.rglob("*")):
            if not p.is_file() or p.name in (".gitkeep",):
                continue
            rel = p.relative_to(root)
            company_id = rel.parts[0] if rel.parts else "unknown"
            name = p.name
            dtype, exclude = classify(name)
            if base == "announcements" and dtype == "other":
                dtype = "exchange_filing"
                exclude = False
            sha, nbytes = sha256_of(p)
            rows.append({
                "company_id": company_id,
                "document_type": dtype,
                "period": infer_period(name),
                "filing_date": infer_filing_date(name),
                "source_url": None,
                "source_file": str(p.relative_to(REPO)),
                "sha256": sha,
                "bytes": nbytes,
                "fetch_status": "staged_local",
                "exclude_from_metrics": exclude,
                "label_basis": "filename",
            })

    # 2) Declared-but-unstaged registry docs -> pending.
    staged_by_company = {}
    for r in rows:
        staged_by_company.setdefault(r["company_id"], set()).add(r["document_type"])
    URL_TO_TYPE = [
        ("annual_report_url", "annual_report"),
        ("quarterly_ppt_url", "quarterly_ppt"),
        ("quarterly_results_url", "quarterly_results"),
        ("public_disclosure_url", "public_disclosure"),
    ]
    for c in registry:
        cid = c["company_id"]
        have = staged_by_company.get(cid, set())
        for field, dtype in URL_TO_TYPE:
            url = c.get(field)
            if url and dtype not in have:
                rows.append({
                    "company_id": cid,
                    "document_type": dtype,
                    "period": "latest",
                    "filing_date": None,
                    "source_url": url,
                    "source_file": None,
                    "sha256": None,
                    "bytes": None,
                    "fetch_status": "declared_pending",
                    "exclude_from_metrics": False,
                    "label_basis": "registry",
                    "verification_status": c.get("verification_status"),
                })

    inventory = {
        "_meta": {
            "inventory_id": "filings-inventory",
            "description": "Manifest of official company filings: staged (checksummed) + declared-pending (registry URLs not yet fetched). Chunk 1 deliverable; no parsing here.",
            "schema_version": "1.0.0",
            "generated_from": "data/raw/ scan + company-source-registry.json",
            "note": "From this cloud box every official site 403s; declared_pending rows are fetched in CI or via manual drop into data/raw/company-filings/<company>/<period>/.",
            "fetch_status_values": ["staged_local", "declared_pending"],
        },
        "data": rows,
    }
    OUT.write_text(json.dumps(inventory, indent=2, ensure_ascii=False) + "\n")
    coverage_report(rows, registry, reg_ids)


def coverage_report(rows, registry, reg_ids) -> None:
    FIN_TYPES = {"annual_report", "public_disclosure", "quarterly_results", "quarterly_ppt", "investor_presentation"}
    staged = [r for r in rows if r["fetch_status"] == "staged_local"]
    by_co = {}
    for r in staged:
        d = by_co.setdefault(r["company_id"], {"annual_report": 0, "public_disclosure": 0,
                                               "quarterly": 0, "presentation": 0, "exchange_filing": 0,
                                               "non_financial": 0, "other": 0})
        t = r["document_type"]
        if t in ("quarterly_results", "quarterly_ppt"):
            d["quarterly"] += 1
        elif t in ("investor_presentation", "earnings_transcript"):
            d["presentation"] += 1
        elif t in d:
            d[t] += 1
        else:
            d["other"] += 1

    cos_with_financial = {r["company_id"] for r in staged
                          if r["document_type"] in FIN_TYPES and not r["exclude_from_metrics"]}

    # Expected Excel coverage improvement: fillable cells bound to company
    # financial/premium sources for companies that now have a staged official doc.
    schema = json.loads(SCHEMA.read_text())
    COMPANY_SRC = {"company_financials", "company_premium_quarterly", "company_premium_monthly"}
    addressable = 0
    for s in schema["sheets"]:
        for b in s["bindings"]:
            if b.get("fillable") and b.get("source_key") in COMPANY_SRC and b.get("entity") in cos_with_financial:
                addressable += 1

    line = "=" * 70
    print(line); print("FILINGS INVENTORY - COVERAGE REPORT (Chunk 1)"); print(line)
    print(f"Registry companies: {len(reg_ids)} | inventory rows: {len(rows)} "
          f"(staged_local={len(staged)}, declared_pending={len(rows)-len(staged)})")
    print(f"\nStaged official docs by company:")
    print(f"  {'company':<20} {'annual':>6} {'pub_disc':>8} {'qtrly':>6} {'present':>7} {'exch':>5} {'non_fin':>7}")
    for cid in sorted(by_co):
        d = by_co[cid]
        print(f"  {cid:<20} {d['annual_report']:>6} {d['public_disclosure']:>8} {d['quarterly']:>6} "
              f"{d['presentation']:>7} {d['exchange_filing']:>5} {d['non_financial']:>7}")

    have_official = sorted(cos_with_financial)
    no_staged = sorted(reg_ids - set(by_co.keys()))
    only_nonfin = sorted({c for c in by_co if c not in cos_with_financial})
    print(f"\nCompanies WITH staged financial filings ({len(have_official)}): {', '.join(have_official)}")
    print(f"Companies with staged docs but NONE financial: {', '.join(only_nonfin) or '(none)'}")
    print(f"Companies with NO staged docs at all ({len(no_staged)}): {', '.join(no_staged)}")
    print(f"\nMissing official sources (registry URL null / to_discover):")
    for c in registry:
        gaps = [f for f in ("annual_report_url", "quarterly_ppt_url", "public_disclosure_url") if not c.get(f)]
        if gaps:
            print(f"  {c['company_id']:<20} missing: {', '.join(g.replace('_url','') for g in gaps)}  ({c.get('verification_status')})")
    print(f"\nExpected Excel coverage improvement (upper bound):")
    print(f"  {addressable} fillable cells are bound to company official-filing sources for the")
    print(f"  {len(have_official)} companies that already have a staged financial doc - these become")
    print(f"  parseable in Chunk 2. (Today only ~52 cells fill from existing snapshots.)")
    print(f"\nInventory written -> {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
