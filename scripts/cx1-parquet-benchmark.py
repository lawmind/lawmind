#!/usr/bin/env python
"""Bounded DuckDB Parquet mechanics proof for CX1.

This test uses synthetic, non-production rows to prove partition shape,
compaction, and object-count behavior. Synthetic compression is deliberately not
reported as evidence for corpus capacity planning.
"""

from __future__ import annotations

import json
import os
import random
import statistics
import string
import tempfile
import time
from pathlib import Path

import duckdb
import pyarrow as pa


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "ai" / "cx1-parquet-proof"
ROWS = 18_000
SEED = 4107
BATCHES = 6
ROW_GROUP_SIZE_BYTES = "256KB"
FILE_SIZE_BYTES = "1MB"

COURTS = ["delhi", "bombay", "madras"]
YEARS = [2023, 2024]
CLASSES = ["decided", "bail_order", "procedural_disposal"]
TERMS = [
    "anticipatory bail parity co accused",
    "specific performance limitation readiness willingness",
    "quashing criminal proceedings abuse of process",
    "arbitration tribunal jurisdiction appointment",
    "service termination natural justice hearing",
    "negotiable instruments statutory notice liability",
]


def make_text(rng: random.Random, row_id: int) -> str:
    """Create bounded, varied synthetic text without implying legal realism."""
    words = []
    for token in range(190):
        if token % 19 == 0:
            words.append(TERMS[(row_id + token) % len(TERMS)])
        else:
            words.append("".join(rng.choices(string.ascii_lowercase, k=8)))
    return " ".join(words)


def parquet_files(path: Path) -> list[Path]:
    return sorted(p for p in path.rglob("*.parquet") if p.is_file())


def layout_stats(con: duckdb.DuckDBPyConnection, path: Path) -> dict[str, object]:
    files = parquet_files(path)
    sizes = [file.stat().st_size for file in files]
    glob = f"{path.as_posix()}/**/*.parquet"
    row_count, partition_count = con.execute(
        """
        SELECT count(*), count(DISTINCT (court, year))
        FROM read_parquet(?, hive_partitioning = true)
        """,
        [glob],
    ).fetchone()
    delhi_rows, delhi_objects = con.execute(
        """
        SELECT count(*), count(DISTINCT filename)
        FROM read_parquet(?, hive_partitioning = true, filename = true)
        WHERE court = 'delhi' AND year = 2024
        """,
        [glob],
    ).fetchone()
    row_groups = con.execute(
        "SELECT coalesce(sum(num_row_groups), 0) FROM parquet_file_metadata(?)",
        [glob],
    ).fetchone()[0]
    return {
        "objects": len(files),
        "bytes": sum(sizes),
        "object_min_bytes": min(sizes),
        "object_p50_bytes": int(statistics.median(sizes)),
        "object_max_bytes": max(sizes),
        "row_groups": int(row_groups),
        "rows": int(row_count),
        "coarse_partitions": int(partition_count),
        "delhi_2024_rows": int(delhi_rows),
        "estimated_get_requests_for_delhi_2024": int(delhi_objects),
    }


def copy_fragmented(con: duckdb.DuckDBPyConnection, path: Path) -> float:
    started = time.perf_counter()
    for batch in range(BATCHES):
        con.execute(
            f"""
            COPY (
                SELECT *
                FROM synthetic_docs
                WHERE ingest_batch = {batch}
                ORDER BY court, year, id
            ) TO '{path.as_posix()}' (
                FORMAT parquet,
                COMPRESSION zstd,
                PARTITION_BY (court, year),
                APPEND,
                FILENAME_PATTERN 'batch_{{uuid}}',
                ROW_GROUP_SIZE_BYTES '{ROW_GROUP_SIZE_BYTES}'
            )
            """
        )
    return time.perf_counter() - started


def copy_overpartitioned(con: duckdb.DuckDBPyConnection, path: Path) -> float:
    started = time.perf_counter()
    con.execute(
        f"""
        COPY (
            SELECT *
            FROM synthetic_docs
            ORDER BY court, year, document_class, id
        ) TO '{path.as_posix()}' (
            FORMAT parquet,
            COMPRESSION zstd,
            PARTITION_BY (court, year, document_class),
            ROW_GROUP_SIZE_BYTES '{ROW_GROUP_SIZE_BYTES}'
        )
        """
    )
    return time.perf_counter() - started


def copy_compacted(
    con: duckdb.DuckDBPyConnection, source: Path, destination: Path
) -> float:
    started = time.perf_counter()
    source_glob = f"{source.as_posix()}/**/*.parquet"
    partitions = con.execute(
        """
        SELECT DISTINCT court, year
        FROM read_parquet(?, hive_partitioning = true)
        ORDER BY court, year
        """,
        [source_glob],
    ).fetchall()
    for court, year in partitions:
        court_dir = destination / f"court={court}"
        court_dir.mkdir(parents=True, exist_ok=True)
        partition_dir = court_dir / f"year={year}"
        con.execute(
            f"""
            COPY (
                SELECT * EXCLUDE (court, year, filename)
                FROM read_parquet(
                    '{source_glob}', hive_partitioning = true, filename = true
                )
                WHERE court = '{court}' AND year = {year}
                ORDER BY id
            ) TO '{partition_dir.as_posix()}' (
                FORMAT parquet,
                COMPRESSION zstd,
                PER_THREAD_OUTPUT,
                FILE_SIZE_BYTES '{FILE_SIZE_BYTES}',
                ROW_GROUP_SIZE_BYTES '{ROW_GROUP_SIZE_BYTES}'
            )
            """
        )
    return time.perf_counter() - started


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    run_dir = OUT / time.strftime("run-%Y%m%d-%H%M%S-v2")
    run_dir.mkdir()

    rng = random.Random(SEED)
    rows: dict[str, list[object]] = {
        "id": [],
        "court": [],
        "year": [],
        "document_class": [],
        "ingest_batch": [],
        "title": [],
        "full_text": [],
    }
    for row_id in range(ROWS):
        rows["id"].append(row_id)
        rows["court"].append(COURTS[row_id % len(COURTS)])
        rows["year"].append(YEARS[(row_id // len(COURTS)) % len(YEARS)])
        rows["document_class"].append(
            CLASSES[(row_id // (len(COURTS) * len(YEARS))) % len(CLASSES)]
        )
        rows["ingest_batch"].append((row_id // (len(COURTS) * len(YEARS))) % BATCHES)
        rows["title"].append(f"Synthetic Matter {row_id} v State")
        rows["full_text"].append(make_text(rng, row_id))

    con = duckdb.connect(":memory:")
    con.execute("SET threads = 1")
    con.execute("SET preserve_insertion_order = false")
    con.register("synthetic_arrow", pa.table(rows))
    con.execute("CREATE TABLE synthetic_docs AS SELECT * FROM synthetic_arrow")
    raw_text_bytes = con.execute(
        "SELECT sum(octet_length(encode(full_text))) FROM synthetic_docs"
    ).fetchone()[0]

    with tempfile.TemporaryDirectory(prefix="lawmind-cx1-parquet-") as temp:
        temp_root = Path(temp)
        fragmented = temp_root / "fragmented"
        overpartitioned = temp_root / "overpartitioned"
        compacted = temp_root / "compacted"

        fragmented_seconds = copy_fragmented(con, fragmented)
        overpartitioned_seconds = copy_overpartitioned(con, overpartitioned)
        compacted_seconds = copy_compacted(con, fragmented, compacted)

        layouts = {
            "fragmented_coarse_partition": {
                **layout_stats(con, fragmented),
                "write_seconds": round(fragmented_seconds, 3),
            },
            "overpartitioned_document_class": {
                **layout_stats(con, overpartitioned),
                "write_seconds": round(overpartitioned_seconds, 3),
            },
            "compacted_coarse_partition": {
                **layout_stats(con, compacted),
                "write_seconds": round(compacted_seconds, 3),
            },
        }

    fragmented_objects = layouts["fragmented_coarse_partition"]["objects"]
    compacted_objects = layouts["compacted_coarse_partition"]["objects"]
    checks = {
        "all_layouts_preserve_rows": all(
            layout["rows"] == ROWS for layout in layouts.values()
        ),
        "compaction_reduces_object_count": compacted_objects < fragmented_objects,
        "delhi_2024_selective_count_nonzero": all(
            layout["estimated_get_requests_for_delhi_2024"] > 0
            for layout in layouts.values()
        ),
        "document_class_partition_increases_partition_count": (
            layouts["overpartitioned_document_class"]["objects"]
            > layouts["compacted_coarse_partition"]["coarse_partitions"]
        ),
    }

    report = {
        "evidence_class": "MEASURED-BUT-LIMITED",
        "kind": "bounded_synthetic_duckdb_parquet_mechanics",
        "duckdb_version": duckdb.__version__,
        "rows": ROWS,
        "seed": SEED,
        "synthetic_raw_text_bytes": int(raw_text_bytes),
        "controls": {
            "threads": 1,
            "preserve_insertion_order": False,
            "fragment_batches": BATCHES,
            "row_group_size_bytes": ROW_GROUP_SIZE_BYTES,
            "compaction_file_size_bytes": FILE_SIZE_BYTES,
            "file_size_control_applied_per_coarse_partition": True,
            "production_target_inference": "forbidden",
        },
        "layouts": layouts,
        "checks": checks,
        "compression_capacity_status": "INVALID FOR CAPACITY PLANNING",
        "compression_capacity_reason": (
            "Synthetic text does not represent LawMind legal-text entropy. "
            "No synthetic compression ratio is reported or used."
        ),
        "delhi_2024_correction": (
            "The V1 script looked below <layout>/court=delhi/year=2024, but "
            "DuckDB wrote the Hive tree below <layout>/data.parquet/. V2 counts "
            "distinct filenames returned by read_parquet after filtering the "
            "partition columns, so it is independent of that path assumption."
        ),
        "payload_retention": (
            "Generated Parquet files lived in an OS temporary directory and "
            "were removed after measurements; this JSON report is retained."
        ),
        "run_dir": str(run_dir.relative_to(ROOT)).replace(os.sep, "/"),
    }
    if not all(checks.values()):
        report["evidence_class"] = "FAILED"

    report_path = run_dir / "benchmark-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))

    if not all(checks.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
