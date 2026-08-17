#!/usr/bin/env python
"""Failure-injection smoke for the CX1 Silver writer/compactor prototypes."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from cx1_silver_lib import input_hash, require_lab_path, safe_rmtree


ROOT = Path(__file__).resolve().parents[1]
LAB = Path("C:/lawmind/cx1-lab/silver-failure-smoke")


def run(args: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, *args],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=check,
    )


def run_json(args: list[str]) -> dict:
    result = run(args)
    return json.loads(result.stdout)


def write_fixture(path: Path) -> None:
    rows = []
    for i in range(18):
        court = "Madras High Court" if i % 2 == 0 else "Delhi High Court"
        year = 2022 + (i % 3)
        rows.append(
            {
                "id": f"failure-fixture-{i:03d}",
                "court": court,
                "year": year,
                "judgment_date": f"{year}-07-{(i % 26) + 1:02d}",
                "language": "en",
                "document_class": "decided",
                "case_title": f"Failure Fixture {i} v Registry",
                "source_url": f"https://example.invalid/failure/{i}",
                "full_text": ("Deterministic failure injection fixture text. " * (16 + i)),
            }
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(row, sort_keys=True) for row in rows) + "\n", encoding="utf-8")


def write_manifest(root: Path, manifest: dict) -> None:
    root.mkdir(parents=True, exist_ok=True)
    (root / "_manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    require_lab_path(LAB)
    safe_rmtree(LAB)
    fixture = LAB / "input" / "rows.jsonl"
    write_fixture(fixture)
    run_hash = input_hash([fixture])

    silver = LAB / "silver"
    silver_tmp = LAB / "silver.tmp"
    write_manifest(
        silver,
        {
            "schema": "cx1-silver-v1",
            "status": "writing",
            "inputHash": run_hash,
            "rows": 999,
            "injected": "stale-final-manifest",
        },
    )
    write_manifest(
        silver_tmp,
        {
            "schema": "cx1-silver-v1",
            "status": "writing",
            "inputHash": "stale-temp",
            "rows": 1,
            "injected": "stale-temp-manifest",
        },
    )
    (silver_tmp / "stale-marker.txt").write_text("must be removed\n", encoding="utf-8")

    writer = run_json(
        [
            "scripts/cx1-silver-writer.py",
            "--input",
            str(fixture),
            "--output",
            str(silver),
            "--target-object-mib",
            "0.004",
            "--row-group-size",
            "5",
        ]
    )
    writer_manifest = json.loads((silver / "_manifest.json").read_text(encoding="utf-8"))
    if writer["status"] != "complete":
        raise SystemExit(f"writer did not repair stale final manifest: {writer}")
    if writer_manifest["rows"] != 18 or writer_manifest["status"] != "complete":
        raise SystemExit(f"writer manifest not repaired: {writer_manifest}")
    if silver_tmp.exists():
        raise SystemExit("writer left stale temp directory behind")

    compacted = LAB / "compacted"
    compacted_tmp = LAB / "compacted.tmp"
    write_manifest(
        compacted,
        {
            "schema": "cx1-silver-v1",
            "status": "compacting",
            "sourceHash": "stale-source",
            "rows": 999,
            "injected": "stale-final-manifest",
        },
    )
    write_manifest(
        compacted_tmp,
        {
            "schema": "cx1-silver-v1",
            "status": "compacting",
            "sourceHash": "stale-temp",
            "rows": 1,
            "injected": "stale-temp-manifest",
        },
    )
    (compacted_tmp / "stale-marker.txt").write_text("must be removed\n", encoding="utf-8")

    compact = run_json(
        [
            "scripts/cx1-silver-compact.py",
            "--source",
            str(silver),
            "--output",
            str(compacted),
            "--target-object-mib",
            "0.008",
            "--row-group-size",
            "5",
        ]
    )
    compact_manifest = json.loads((compacted / "_manifest.json").read_text(encoding="utf-8"))
    if compact["status"] != "complete":
        raise SystemExit(f"compactor did not repair stale final manifest: {compact}")
    if compact_manifest["rows"] != writer_manifest["rows"] or compact_manifest["status"] != "complete":
        raise SystemExit(f"compactor manifest not repaired: {compact_manifest}")
    if compacted_tmp.exists():
        raise SystemExit("compactor left stale temp directory behind")

    outside = run(
        [
            "scripts/cx1-silver-writer.py",
            "--input",
            str(fixture),
            "--output",
            "C:/lawmind/cx1-outside-failure-should-not-exist",
        ],
        check=False,
    )
    guard_refused = outside.returncode != 0 and "REFUSING:" in (outside.stderr + outside.stdout)
    if not guard_refused:
        raise SystemExit(f"outside-lab guard did not refuse: rc={outside.returncode}")

    report = {
        "status": "pass",
        "fixtureRows": writer_manifest["rows"],
        "writerObjects": writer_manifest["objectCount"],
        "compactedObjects": compact_manifest["objectCount"],
        "writerRepairedStaleFinal": True,
        "writerCleanedStaleTemp": True,
        "compactorRepairedStaleFinal": True,
        "compactorCleanedStaleTemp": True,
        "outsideLabGuardRefused": True,
        "payloadRoot": str(LAB),
    }
    out = ROOT / "docs" / "ai" / "cx1-silver-results" / "failure-smoke.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
