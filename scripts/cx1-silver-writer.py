#!/usr/bin/env python
"""Offline CX1 Silver writer prototype.

Input is JSONL so the prototype can be smoke-tested without touching Gold. Rows
are deterministically sorted and written as court-partitioned Parquet/ZSTD9 with
a versioned manifest and object hashes.
"""

from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path

from cx1_silver_lib import (
    SCHEMA_VERSION,
    group_objects,
    input_hash,
    load_jsonl,
    object_records,
    safe_rmtree,
    require_lab_path,
    write_manifest,
    write_parquet,
    atomic_replace,
)


def write_silver(input_paths: list[Path], output: Path, target_object_bytes: int, row_group_size: int) -> dict:
    output = require_lab_path(output)
    run_hash = input_hash(input_paths)
    manifest_path = output / "_manifest.json"
    if manifest_path.exists():
        existing = json.loads(manifest_path.read_text(encoding="utf-8"))
        if existing.get("inputHash") == run_hash and existing.get("status") == "complete":
            return {"status": "already_complete", "manifest": existing}

    rows: list[dict] = []
    for path in input_paths:
        rows.extend(load_jsonl(path))
    rows.sort(key=lambda r: (r["court"], r["year"], r["judgment_date"], r["id"]))

    tmp = output.with_name(f"{output.name}.tmp")
    safe_rmtree(tmp)
    tmp.mkdir(parents=True)
    checkpoint = {
        "schema": SCHEMA_VERSION,
        "status": "writing",
        "inputHash": run_hash,
        "rows": len(rows),
        "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    write_manifest(tmp, checkpoint)

    grouped = group_objects(rows, target_object_bytes)
    object_count = 0
    for court in sorted(grouped):
        safe_court = court.replace("/", "_").replace("\\", "_")
        for idx, batch in enumerate(grouped[court]):
            path = tmp / f"court={safe_court}" / f"part-{idx:06d}.parquet"
            write_parquet(batch, path, row_group_size)
            object_count += 1
            checkpoint["lastObject"] = path.relative_to(tmp).as_posix()
            checkpoint["objectsWritten"] = object_count
            write_manifest(tmp, checkpoint)

    objects = object_records(tmp)
    manifest = {
        "schema": SCHEMA_VERSION,
        "kind": "cx1_silver_writer_manifest",
        "status": "complete",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "inputHash": run_hash,
        "inputFiles": [str(path) for path in input_paths],
        "rows": len(rows),
        "courts": sorted(grouped.keys()),
        "controls": {
            "partition": "court",
            "sort": ["court", "year", "judgment_date", "id"],
            "compression": "zstd",
            "compressionLevel": 9,
            "targetObjectBytes": target_object_bytes,
            "rowGroupSizeRows": row_group_size,
        },
        "objects": objects,
        "objectCount": len(objects),
        "totalObjectBytes": sum(obj["bytes"] for obj in objects),
        "contentHash": input_hash([tmp / obj["path"] for obj in objects]),
    }
    write_manifest(tmp, manifest)
    atomic_replace(tmp, output)
    return {"status": "complete", "manifest": manifest}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", nargs="+", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--target-object-mib", type=float, default=128.0)
    parser.add_argument("--row-group-size", type=int, default=50000)
    args = parser.parse_args()
    result = write_silver(
        args.input,
        args.output,
        max(1, math.floor(args.target_object_mib * 1024 * 1024)),
        args.row_group_size,
    )
    print(json.dumps({"status": result["status"], "rows": result["manifest"]["rows"], "objects": result["manifest"]["objectCount"]}))


if __name__ == "__main__":
    main()
