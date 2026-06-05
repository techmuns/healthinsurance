#!/usr/bin/env python3
"""
Chunk 1 - Filings inventory / manifest (with source-locking).

Builds ``data/source-map/filings-inventory.json``: one row per official filing
with the agreed fields - company_id, document_title, document_type, source_url,
filing_period (+ explicit period_start/period_end via the FY calendar),
filing_date, fetched_at, checksum_sha256, fetch_status, notes.

Honesty / scope:
* Files already staged under ``data/raw/`` get a real sha256 +
  ``fetch_status="staged_local"`` (we hold the bytes; Chunk 2 parses them).
* Registry-declared docs not staged get ``fetch_status="declared_pending"``
  (checksum null) - from this cloud box every official site 403s, so they fetch
  in CI or via a manual drop into ``data/raw/company-filings/<company>/<period>/``.
* SOURCE-LOCKING: each run compares every file's checksum to the previously
  committed inventory. If the same file/URL now yields a different hash, the row
  is flagged ``source_changed_needs_review=true`` so a silently-swapped source is
  never trusted blindly.

This does NOT parse documents and does NOT touch build_value_store / fill_template
/ qa_checks / the workflow. It prints a coverage report (the Chunk 1 deliverable).
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
MASTER = REPO / "src" / "data" / "snapshots" / "company-master.json"
SCHEMA = REPO / "schema-map.json"
OUT = REPO / "data" / "source-map" / "filings-inventory.json"

# Document-type classification (first match wins; order matters).
NON_FINANCIAL = re.compile(r"agentcode|citizen ?charter|grievance|complain|brochure|policy-?wording|agentlist", re.I)
TYPE_RULES = [
    ("annual_report",         re.compile(r"annual[-_ ]?report|(?:^|[-_/])AR[-_]\d", re.I)),
    ("investor_presentation", re.compile(r"presentation|investor[-_ ]?ppt|earnings[-_ ]?deck|\bdeck\b", re.I)),
    ("earnings_transcript",   re.compile(r"transcript|earnings[-_ ]?call", re.I)),
    ("public_disclosure",     re.compile(r"public[-_ ]?disclosure|quantative|quantitative|\bNL[-_]?\d|\bL-\d|\d{4}q[1-4]NL|\d{3,4}q[1-4]", re.I)),
    ("quarterly_results",     re.compile(r"press[-_ ]?release|result|financial[-_ ]?result", re.I)),
    ("exchange_filing",       re.compile(r"(?:^|[-_/])ann[-_]|announcement", re.I)),
]

FY_PATTERNS = [re.compile(r"20(\d{2})[-_](?:20)?(\d{2})"), re.compile(r"FY[-_ ]?20?(\d{2})", re.I)]
QTR_PATTERN = re.compile(r"\bQ([1-4])\b.*?FY?[-_ ]?(\d{2})", re.I)
MONTH_QTR = {"jun": "Q1", "sep": "Q2", "dec": "Q3", "mar": "Q4"}
MONTH_PATTERN = re.compile(r"(jun|sep|dec|mar)[-_ ]?(\d{2})", re.I)
OLD_NL = re.compile(r"(\d{2})(\d{2})q([1-4])")        # 1213q1 -> Q1 FY13
EPOCH = re.compile(r"(?<!\d)(1[0-9]{9})(?!\d)")
ISO_DATE = re.compile(r"(20\d{2})[-_](\d{2})[-_](\d{2})")
PERIOD_LABEL = re.compile(r"^(?:Q([1-4]))?FY(\d{2})$")  # Q2FY26 / FY25


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
        return f"Q{m.group(3)}FY{m.group(2)}"
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


def period_to_dates(period: str | None) -> tuple[str | None, str | None]:
    """Indian insurance FY (Apr-Mar). FYxx ends 31-Mar-20xx. See fy-calendar.json."""
    if not period:
        return None, None
    m = PERIOD_LABEL.match(period)
    if not m:
        return None, None
    q, yy = m.group(1), int(m.group(2))
    end_year = 2000 + yy
    start_year = end_year - 1
    if q is None:
        return f"{start_year}-04-01", f"{end_year}-03-31"
    spans = {
        "1": (f"{start_year}-04-01", f"{start_year}-06-30"),
        "2": (f"{start_year}-07-01", f"{start_year}-09-30"),
        "3": (f"{start_year}-10-01", f"{start_year}-12-31"),
        "4": (f"{end_year}-01-01", f"{end_year}-03-31"),
    }
    return spans[q]


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


def document_title(name: str, company_id: str) -> str:
    t = re.sub(r"\.(pdf|html?|xlsx?|json)$", "", name, flags=re.I)
    t = re.sub(rf"^{re.escape(company_id)}[-_]", "", t)
    return re.sub(r"[-_]+", " ", t).strip()


def sha256_of(p: Path) -> tuple[str, int]:
    h = hashlib.sha256()
    n = 0
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
            n += len(chunk)
    return h.hexdigest(), n


def load_prior_locks() -> dict[str, str]:
    """Map a stable key (source_file or source_url) -> previously recorded
    checksum, from the last committed inventory. Drives source-locking."""
    if not OUT.exists():
        return {}
    try:
        prior = json.loads(OUT.read_text())["data"]
    except (json.JSONDecodeError, KeyError):
        return {}
    locks = {}
    for r in prior:
        chk = r.get("checksum_sha256") or r.get("sha256")  # accept the pre-rename field too
        if not chk:
            continue
        for key in (r.get("source_file"), r.get("source_url")):
            if key:
                locks[key] = chk
    return locks


def main() -> None:
    registry = json.loads(REGISTRY.read_text())["data"]
    reg_by_id = {c["company_id"]: c for c in registry}
    reg_ids = set(reg_by_id)
    # Companies scoped out of the company-filings layer (e.g. defunct,
    # irdai_industry_only). They must NOT produce filing/inventory rows.
    master = {c["company_id"]: c for c in json.loads(MASTER.read_text())["data"]}
    excluded = {cid for cid, c in master.items() if c.get("exclude_from_filings_inventory")}
    prior_locks = load_prior_locks()
    rows = []

    # 1) Walk staged raw files.
    for base in ("companies", "announcements", "company-filings"):
        root = RAW / base
        if not root.exists():
            continue
        for p in sorted(root.rglob("*")):
            if not p.is_file() or p.name == ".gitkeep":
                continue
            rel = p.relative_to(root)
            company_id = rel.parts[0] if rel.parts else "unknown"
            if company_id in excluded:
                continue
            name = p.name
            dtype, exclude = classify(name)
            if base == "announcements" and dtype == "other":
                dtype, exclude = "exchange_filing", False
            sha, nbytes = sha256_of(p)
            src_file = str(p.relative_to(REPO))
            period = infer_period(name)
            pstart, pend = period_to_dates(period)
            fetched_at = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat()

            notes = []
            if exclude:
                notes.append("non-financial / excluded from metrics")
            changed = src_file in prior_locks and prior_locks[src_file] != sha
            if changed:
                notes.append(f"checksum changed vs prior inventory (was {prior_locks[src_file][:12]}...)")

            rows.append({
                "company_id": company_id,
                "document_title": document_title(name, company_id),
                "document_type": dtype,
                "source_url": None,
                "filing_period": period,
                "period_start": pstart,
                "period_end": pend,
                "filing_date": infer_filing_date(name),
                "fetched_at": fetched_at,
                "checksum_sha256": sha,
                "bytes": nbytes,
                "fetch_status": "staged_local",
                "source_changed_needs_review": changed,
                "exclude_from_metrics": exclude,
                "source_file": src_file,
                "label_basis": "filename",
                "notes": "; ".join(notes),
            })

    # 2) Declared-but-unstaged registry docs -> pending.
    staged_types = {}
    for r in rows:
        staged_types.setdefault(r["company_id"], set()).add(r["document_type"])
    URL_TO_TYPE = [
        ("annual_report_url", "annual_report"),
        ("quarterly_ppt_url", "quarterly_ppt"),
        ("quarterly_results_url", "quarterly_results"),
        ("public_disclosure_url", "public_disclosure"),
    ]
    for c in registry:
        cid = c["company_id"]
        if cid in excluded:
            continue
        have = staged_types.get(cid, set())
        for field, dtype in URL_TO_TYPE:
            url = c.get(field)
            if url and dtype not in have:
                rows.append({
                    "company_id": cid,
                    "document_title": f"{c['company_name']} {dtype.replace('_', ' ')} (latest)",
                    "document_type": dtype,
                    "source_url": url,
                    "filing_period": "latest",
                    "period_start": None,
                    "period_end": None,
                    "filing_date": None,
                    "fetched_at": None,
                    "checksum_sha256": None,
                    "bytes": None,
                    "fetch_status": "declared_pending",
                    "source_changed_needs_review": False,
                    "exclude_from_metrics": False,
                    "source_file": None,
                    "label_basis": "registry",
                    "notes": f"Declared official source; not yet fetched ({c.get('verification_status')}). "
                             f"Drop into data/raw/company-filings/{cid}/<period>/ or fetch live in CI.",
                })

    inventory = {
        "_meta": {
            "inventory_id": "filings-inventory",
            "description": "Manifest of official company filings: staged (checksummed) + declared-pending (registry URLs). Source-locked. Chunk 1 deliverable; no parsing here.",
            "schema_version": "1.1.0",
            "generated_from": "data/raw/ scan + company-source-registry.json + fy-calendar.json",
            "fields": ["company_id", "document_title", "document_type", "source_url",
                       "filing_period", "period_start", "period_end", "filing_date",
                       "fetched_at", "checksum_sha256", "fetch_status",
                       "source_changed_needs_review", "notes"],
            "source_locking": "Each run compares checksum_sha256 to the previously committed inventory keyed by source_file/source_url; a mismatch sets source_changed_needs_review=true.",
            "fetched_at_note": "For staged_local rows, fetched_at = local file mtime (staging time in this workspace), not necessarily original publication.",
            "excluded_companies": sorted(excluded),
            "excluded_note": "Companies with exclude_from_filings_inventory=true in company-master.json (defunct / irdai_industry_only) are omitted entirely from this manifest.",
            "note": "From this cloud box every official site 403s; declared_pending rows fetch in CI or via manual drop.",
        },
        "data": rows,
    }
    OUT.write_text(json.dumps(inventory, indent=2, ensure_ascii=False) + "\n")
    coverage_report(rows, registry, reg_ids)


def coverage_report(rows, registry, reg_ids) -> None:
    FIN_TYPES = {"annual_report", "public_disclosure", "quarterly_results", "quarterly_ppt", "investor_presentation"}
    staged = [r for r in rows if r["fetch_status"] == "staged_local"]
    changed = [r for r in rows if r.get("source_changed_needs_review")]
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

    schema = json.loads(SCHEMA.read_text())
    COMPANY_SRC = {"company_financials", "company_premium_quarterly", "company_premium_monthly"}
    addressable = sum(1 for s in schema["sheets"] for b in s["bindings"]
                      if b.get("fillable") and b.get("source_key") in COMPANY_SRC
                      and b.get("entity") in cos_with_financial)

    line = "=" * 72
    print(line); print("FILINGS INVENTORY - COVERAGE REPORT (Chunk 1)"); print(line)
    print(f"Registry companies: {len(reg_ids)} | inventory rows: {len(rows)} "
          f"(staged_local={len(staged)}, declared_pending={len(rows)-len(staged)})")
    print(f"Source-locking: {len(changed)} file(s) flagged source_changed_needs_review.")
    print(f"\nStaged official docs by company:")
    print(f"  {'company':<20} {'annual':>6} {'pub_disc':>8} {'qtrly':>6} {'present':>7} {'exch':>5} {'non_fin':>7}")
    for cid in sorted(by_co):
        d = by_co[cid]
        print(f"  {cid:<20} {d['annual_report']:>6} {d['public_disclosure']:>8} {d['quarterly']:>6} "
              f"{d['presentation']:>7} {d['exchange_filing']:>5} {d['non_financial']:>7}")

    have_official = sorted(cos_with_financial)
    no_staged = sorted(reg_ids - set(by_co.keys()))
    only_nonfin = sorted({c for c in by_co if c not in cos_with_financial})
    print(f"\nWITH staged financial filings ({len(have_official)}): {', '.join(have_official)}")
    print(f"Staged docs but NONE financial: {', '.join(only_nonfin) or '(none)'}")
    print(f"NO staged docs at all ({len(no_staged)}): {', '.join(no_staged)}")
    print(f"\nMissing official sources (registry URL null / to_discover):")
    for c in registry:
        gaps = [f for f in ("annual_report_url", "quarterly_ppt_url", "public_disclosure_url") if not c.get(f)]
        if gaps:
            print(f"  {c['company_id']:<20} missing: {', '.join(g.replace('_url','') for g in gaps)}  ({c.get('verification_status')})")
    print(f"\nExpected Excel coverage improvement (upper bound): {addressable} fillable cells")
    print(f"  bound to company official-filing sources for the {len(have_official)} companies with a")
    print(f"  staged financial doc become parseable in Chunk 2 (vs ~52 filling today).")
    print(f"\nInventory written -> {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
