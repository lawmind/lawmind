#!/usr/bin/env python
"""Offline CX1 Silver compactor prototype.

Reads existing Silver Parquet fragments from a lab directory, rewrites them into
deterministic court-partitioned objects, and emits a fresh manifest. No Gold
integration and no production storage calls.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from cx1_silver_lib import (
    SCHEMA_VERSION,
    atomic_replace,
    group_objects,
    input_hash,
    object_records,
    read_parquet_rows,
    require_lab_path,
    safe_rmtree,
    write_manifest,
    write_parquet,
)


def compact_silver(source: Path, output: Path, target_object_bytes: int, row_group_size: int) -> dict:
    source = require_lab_path(source)
    output = require_lab_path(output)
    parquet_files = sorted(source.rglob("*.parquet"))
    if not parquet_files:
        raise SystemExit(f"no parquet files under {source}")
    source_hash = input_hash(parquet_files)
    manifest_path = output / "_manifest.json"
    if manifest_path.exists():
        existing = json.loads(manifest_path.read_text(encoding="utf-8"))
        if existing.get("sourceHash") == source_hash and existing.get("status") == "complete":
            return {"status": "already_complete", "manifest": existing}

    rows = read_parquet_rows(parquet_files)
    grouped = group_objects(rows, target_object_bytes)
    tmp = output.with_name(f"{output.name}.tmp")
    safe_rmtree(tmp)
    tmp.mkdir(parents=True)
    write_manifest(
        tmp,
        {
            "schema": SCHEMA_VERSION,
            "kind": "cx1_silver_compaction_manifest",
            "status": "compacting",
            "sourceHash": source_hash,
            "sourceObjects": len(parquet_files),
            "rows": len(rows),
        },
    )
    for court in sorted(grouped):
        safe_court = court.replace("/", "_").replace("\\", "_")
        for idx, batch in enumerate(grouped[court]):
            write_parquet(batch, tmp / f"court={safe_court}" / f"part-{idx:06d}.parquet", row_group_size)

    objects = object_records(tmp)
    manifest = {
        "schema": SCHEMA_VERSION,
        "kind": "cx1_silver_compaction_manifest",
        "status": "complete",
        "source": str(source),
        "sourceHash": source_hash,
        "sourceObjects": len(parquet_files),
        "rows": len(rows),
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
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--target-object-mib", type=float, default=128.0)
    parser.add_argument("--row-group-size", type=int, default=50000)
    args = parser.parse_args()
    result = compact_silver(
        args.source,
        args.output,
        max(1, math.floor(args.target_object_mib * 1024 * 1024)),
        args.row_group_size,
    )
    print(
        json.dumps(
            {
                "status": result["status"],
                "rows": result["manifest"]["rows"],
                "sourceObjects": result["manifest"]["sourceObjects"],
                "objects": result["manifest"]["objectCount"],
            }
        )
    )


if __name__ == "__main__":
    main()
