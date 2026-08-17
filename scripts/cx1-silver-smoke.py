#!/usr/bin/env python
"""Smoke test for the CX1 Silver writer and compactor prototypes."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from cx1_silver_lib import require_lab_path, safe_rmtree


ROOT = Path(__file__).resolve().parents[1]
LAB = Path("C:/lawmind/cx1-lab/silver-prototype-smoke")


def run(args: list[str]) -> dict:
    result = subprocess.run(
        [sys.executable, *args],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout)


def write_fixture(path: Path) -> None:
    rows = []
    for i in range(24):
        court = "Patna High Court" if i % 2 == 0 else "Bombay High Court"
        year = 2024 if i % 3 else 2023
        rows.append(
            {
                "id": f"fixture-{i:03d}",
                "court": court,
                "year": year,
                "judgment_date": f"{year}-08-{(i % 27) + 1:02d}",
                "language": "en",
                "document_class": "decided" if i % 4 else "bail_order",
                "case_title": f"Fixture {i} v State",
                "source_url": f"https://example.invalid/{i}",
                "full_text": ("Paragraph one. Verified fixture text. " * (20 + i)),
            }
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(row, sort_keys=True) for row in rows) + "\n", encoding="utf-8")


def main() -> None:
    require_lab_path(LAB)
    safe_rmtree(LAB)
    fixture = LAB / "input" / "rows.jsonl"
    write_fixture(fixture)
    silver = LAB / "silver"
    compacted = LAB / "compacted"
    first = run(
        [
            "scripts/cx1-silver-writer.py",
            "--input",
            str(fixture),
            "--output",
            str(silver),
            "--target-object-mib",
            "0.004",
            "--row-group-size",
            "6",
        ]
    )
    second = run(
        [
            "scripts/cx1-silver-writer.py",
            "--input",
            str(fixture),
            "--output",
            str(silver),
            "--target-object-mib",
            "0.004",
            "--row-group-size",
            "6",
        ]
    )
    compact = run(
        [
            "scripts/cx1-silver-compact.py",
            "--source",
            str(silver),
            "--output",
            str(compacted),
            "--target-object-mib",
            "0.008",
            "--row-group-size",
            "6",
        ]
    )
    manifest = json.loads((silver / "_manifest.json").read_text(encoding="utf-8"))
    compact_manifest = json.loads((compacted / "_manifest.json").read_text(encoding="utf-8"))
    if first["status"] != "complete":
        raise SystemExit(f"first writer run did not complete: {first}")
    if second["status"] != "already_complete":
        raise SystemExit(f"writer was not idempotent: {second}")
    if compact["status"] != "complete":
        raise SystemExit(f"compactor did not complete: {compact}")
    if manifest["rows"] != compact_manifest["rows"]:
        raise SystemExit("compaction changed row count")
    if not manifest["objects"] or not compact_manifest["objects"]:
        raise SystemExit("missing object hashes")
    report = {
        "status": "pass",
        "fixtureRows": manifest["rows"],
        "writerObjects": manifest["objectCount"],
        "compactedObjects": compact_manifest["objectCount"],
        "writerIdempotent": True,
        "writerContentHash": manifest["contentHash"],
        "compactedContentHash": compact_manifest["contentHash"],
        "payloadRoot": str(LAB),
    }
    out = ROOT / "docs" / "ai" / "cx1-silver-results" / "prototype-smoke.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()

