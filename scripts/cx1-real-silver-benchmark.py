#!/usr/bin/env python
"""Real-data Parquet/ZSTD benchmark for the isolated CX1 lane.

The canonical database is opened read-only. All Parquet payloads are written to
an OS/lab temporary directory and removed after the JSON result is persisted.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import statistics
import time
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

import duckdb
import psycopg
import pyarrow as pa
import pyarrow.parquet as pq


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "docs" / "ai" / "cx1-silver-results" / "benchmark-results.json"
LAB = Path("C:/lawmind/cx1-lab/silver")


def read_local_url() -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("LOCAL_DATABASE_URL="):
            url = line.split("=", 1)[1].strip()
            parsed = urlparse(url)
            if parsed.hostname not in {"127.0.0.1", "localhost"}:
                raise SystemExit("REFUSING: LOCAL_DATABASE_URL is not loopback")
            return url
    raise SystemExit("REFUSING: LOCAL_DATABASE_URL is absent")


SCHEMA = pa.schema(
    [
        ("id", pa.string()),
        ("court", pa.string()),
        ("year", pa.int32()),
        ("judgment_date", pa.date32()),
        ("language", pa.string()),
        ("document_class", pa.string()),
        ("size_bucket", pa.string()),
        ("case_title", pa.string()),
        ("full_text", pa.string()),
    ]
)


def export_sample(url: str, source: Path, percent: float, seed: int) -> dict:
    if source.exists():
        source.unlink()
    writer = pq.ParquetWriter(source, SCHEMA, compression="NONE")
    rows = 0
    text_bytes = 0
    distributions: dict[str, Counter] = {
        "court": Counter(),
        "year": Counter(),
        "language": Counter(),
        "documentClass": Counter(),
        "sizeBucket": Counter(),
        "scriptBucket": Counter(),
    }
    court_year: Counter = Counter()
    started = time.perf_counter()
    query = f"""
        SELECT id::text, court, extract(year from judgment_date)::int AS year,
               judgment_date, language::text,
               coalesce(hc_document_class, source_document_type, 'unclassified') AS document_class,
               CASE WHEN octet_length(full_text) < 4096 THEN 'small_lt_4k'
                    WHEN octet_length(full_text) < 65536 THEN 'medium_4k_64k'
                    ELSE 'large_ge_64k' END AS size_bucket,
               case_title, full_text
        FROM judgments TABLESAMPLE SYSTEM ({percent}) REPEATABLE ({seed})
        WHERE full_text IS NOT NULL
    """
    try:
        with psycopg.connect(url, autocommit=False) as conn:
            conn.execute("SET TRANSACTION READ ONLY")
            conn.execute("SET LOCAL statement_timeout = '30min'")
            with conn.cursor(name="cx1_silver", row_factory=psycopg.rows.tuple_row) as cur:
                cur.itersize = 2_000
                cur.execute(query)
                while True:
                    batch = cur.fetchmany(2_000)
                    if not batch:
                        break
                    columns = list(zip(*batch))
                    table = pa.Table.from_arrays(
                        [pa.array(column, type=field.type) for column, field in zip(columns, SCHEMA)],
                        schema=SCHEMA,
                    )
                    writer.write_table(table, row_group_size=2_000)
                    rows += len(batch)
                    for row in batch:
                        size = len(row[8].encode("utf-8"))
                        text_bytes += size
                        distributions["court"][row[1]] += 1
                        distributions["year"][str(row[2])] += 1
                        distributions["language"][row[4]] += 1
                        distributions["documentClass"][row[5]] += 1
                        distributions["sizeBucket"][row[6]] += 1
                        distributions["scriptBucket"][
                            "devanagari_bearing"
                            if any("\u0900" <= char <= "\u097f" for char in row[8])
                            else "no_devanagari"
                        ] += 1
                        court_year[f"{row[1]}|{row[2]}"] += 1
            conn.rollback()
    finally:
        writer.close()
    return {
        "rows": rows,
        "sourceTextBytes": text_bytes,
        "sourceExportSeconds": round(time.perf_counter() - started, 3),
        "samplePercent": percent,
        "repeatableSeed": seed,
        "distributions": {key: dict(value.most_common()) for key, value in distributions.items()},
        "courtYearDistribution": dict(court_year.most_common()),
    }


def parquet_files(path: Path) -> list[Path]:
    return [item for item in path.rglob("*.parquet") if item.is_file()]


def safe_sql(value: str) -> str:
    return value.replace("'", "''")


def write_layout(
    con: duckdb.DuckDBPyConnection,
    source: Path,
    output: Path,
    partition: tuple[str, ...],
    file_size: str,
    row_group_size: str,
    level: int,
) -> float:
    shutil.rmtree(output, ignore_errors=True)
    output.mkdir(parents=True)
    started = time.perf_counter()
    if not partition:
        con.execute(
            f"""
            COPY (SELECT * FROM read_parquet('{source.as_posix()}'))
            TO '{output.as_posix()}' (
              FORMAT parquet, COMPRESSION zstd, COMPRESSION_LEVEL {level},
              PER_THREAD_OUTPUT, FILE_SIZE_BYTES '{file_size}',
              ROW_GROUP_SIZE_BYTES '{row_group_size}'
            )
            """
        )
    else:
        columns = ", ".join(partition)
        partitions = con.execute(
            f"SELECT DISTINCT {columns} FROM read_parquet(?) ORDER BY {columns}", [str(source)]
        ).fetchall()
        for values in partitions:
            clauses = []
            directory = output
            for column, value in zip(partition, values):
                clauses.append(f"{column} = '{safe_sql(str(value))}'")
                directory /= f"{column}={value}"
            directory.mkdir(parents=True, exist_ok=True)
            con.execute(
                f"""
                COPY (
                  SELECT * EXCLUDE ({columns}) FROM read_parquet('{source.as_posix()}')
                  WHERE {' AND '.join(clauses)}
                ) TO '{directory.as_posix()}' (
                  FORMAT parquet, COMPRESSION zstd, COMPRESSION_LEVEL {level},
                  PER_THREAD_OUTPUT, FILE_SIZE_BYTES '{file_size}',
                  ROW_GROUP_SIZE_BYTES '{row_group_size}'
                )
                """
            )
    return time.perf_counter() - started


def timed_query(con: duckdb.DuckDBPyConnection, sql: str, params: list | None = None) -> float:
    started = time.perf_counter()
    con.execute(sql, params or []).fetchall()
    return (time.perf_counter() - started) * 1000


def layout_metrics(
    con: duckdb.DuckDBPyConnection,
    path: Path,
    source_text_bytes: int,
    encode_seconds: float,
    random_ids: list[str],
    target_court: str,
    target_year: int,
) -> dict:
    files = parquet_files(path)
    sizes = [item.stat().st_size for item in files]
    glob = f"{path.as_posix()}/**/*.parquet"
    meta = con.execute(
        "SELECT sum(num_rows), sum(num_row_groups) FROM parquet_file_metadata(?)", [glob]
    ).fetchone()
    full_scan_ms = timed_query(con, "SELECT sum(length(full_text)) FROM read_parquet(?)", [glob])
    filter_ms = timed_query(
        con,
        "SELECT count(*), sum(length(full_text)) FROM read_parquet(?, hive_partitioning=true) WHERE court=? AND year=?",
        [glob, target_court, target_year],
    )
    range_ms = timed_query(
        con,
        "SELECT count(*) FROM read_parquet(?, hive_partitioning=true) WHERE year BETWEEN ? AND ? AND document_class='decided'",
        [glob, target_year - 2, target_year],
    )
    random_times = [
        timed_query(con, "SELECT length(full_text) FROM read_parquet(?, hive_partitioning=true) WHERE id=?", [glob, ident])
        for ident in random_ids
    ]
    return {
        "rows": int(meta[0]),
        "sourceTextBytes": source_text_bytes,
        "parquetBytes": sum(sizes),
        "compressionRatio": round(source_text_bytes / sum(sizes), 4),
        "encodeSeconds": round(encode_seconds, 3),
        "encodeMiBPerSecond": round(source_text_bytes / 2**20 / encode_seconds, 3),
        "decodeFullScanMiBPerSecond": round(source_text_bytes / 2**20 / (full_scan_ms / 1000), 3),
        "objects": len(files),
        "objectBytes": {
            "min": min(sizes),
            "p50": int(statistics.median(sizes)),
            "p95": sorted(sizes)[min(len(sizes) - 1, int(len(sizes) * 0.95))],
            "max": max(sizes),
        },
        "rowGroups": int(meta[1]),
        "meanRowGroupCompressedBytesApprox": round(sum(sizes) / max(1, int(meta[1])), 2),
        "scansMs": {
            "full": round(full_scan_ms, 3),
            "courtYear": round(filter_ms, 3),
            "yearRangeAndClass": round(range_ms, 3),
            "randomDocumentP50": round(statistics.median(random_times), 3),
            "randomDocumentP95": round(sorted(random_times)[int(len(random_times) * 0.95)], 3),
        },
    }


def write_fragmented(con: duckdb.DuckDBPyConnection, source: Path, output: Path) -> float:
    shutil.rmtree(output, ignore_errors=True)
    output.mkdir(parents=True)
    started = time.perf_counter()
    for batch in range(8):
        con.execute(
            f"""
            COPY (
              SELECT * FROM read_parquet('{source.as_posix()}')
              WHERE abs(hash(id)) % 8 = {batch}
            ) TO '{output.as_posix()}' (
              FORMAT parquet, COMPRESSION zstd, COMPRESSION_LEVEL 3,
              PARTITION_BY (court, year), APPEND, FILENAME_PATTERN 'batch_{batch}_{{uuid}}',
              ROW_GROUP_SIZE_BYTES '32MB'
            )
            """
        )
    return time.perf_counter() - started


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-percent", type=float, default=5.0)
    parser.add_argument("--seed", type=int, default=170817)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--keep-payloads", action="store_true")
    args = parser.parse_args()
    LAB.mkdir(parents=True, exist_ok=True)
    source = LAB / "real-sample-uncompressed.parquet"
    sample = export_sample(read_local_url(), source, args.sample_percent, args.seed)
    if sample["rows"] < 50_000:
        raise SystemExit(f"sample too small to expose object behavior: {sample['rows']} rows")

    con = duckdb.connect(str(LAB / "benchmark.duckdb"))
    con.execute("SET threads=4")
    con.execute("SET preserve_insertion_order=false")
    ids = [row[0] for row in con.execute("SELECT id FROM read_parquet(?) USING SAMPLE 30 ROWS (reservoir, 170817)", [str(source)]).fetchall()]
    target_court, target_year = con.execute(
        "SELECT court, year FROM read_parquet(?) GROUP BY court, year ORDER BY count(*) DESC LIMIT 1",
        [str(source)],
    ).fetchone()

    specs = {
        "unpartitioned_128m_rg32_zstd3": ((), "128MB", "32MB", 3),
        "court_128m_rg32_zstd3": (("court",), "128MB", "32MB", 3),
        "court_year_128m_rg32_zstd3": (("court", "year"), "128MB", "32MB", 3),
        "court_year_256m_rg64_zstd3": (("court", "year"), "256MB", "64MB", 3),
        "court_year_128m_rg32_zstd6": (("court", "year"), "128MB", "32MB", 6),
        "court_year_128m_rg32_zstd9": (("court", "year"), "128MB", "32MB", 9),
    }
    layouts = {}
    for name, (partition, file_size, row_group, level) in specs.items():
        output = LAB / name
        elapsed = write_layout(con, source, output, partition, file_size, row_group, level)
        layouts[name] = {
            "controls": {
                "partition": list(partition),
                "fileTarget": file_size,
                "rowGroupTarget": row_group,
                "zstdLevel": level,
            },
            **layout_metrics(
                con,
                output,
                sample["sourceTextBytes"],
                elapsed,
                ids,
                target_court,
                int(target_year),
            ),
        }
        print(f"{name}: {layouts[name]['objects']} objects, {layouts[name]['compressionRatio']}x")

    fragmented = LAB / "fragmented"
    fragmented_seconds = write_fragmented(con, source, fragmented)
    fragment_objects = len(parquet_files(fragmented))
    fragment_bytes = sum(item.stat().st_size for item in parquet_files(fragmented))
    compacted = LAB / "compacted_from_fragmented"
    compaction_seconds = write_layout(
        con, source, compacted, ("court", "year"), "128MB", "32MB", 3
    )
    compact_objects = len(parquet_files(compacted))
    compact_bytes = sum(item.stat().st_size for item in parquet_files(compacted))

    report = {
        "kind": "cx1_real_silver_benchmark",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "evidenceClass": "MEASURED_REAL_LAWMIND_READ_ONLY_SAMPLE",
        "software": {"duckdb": duckdb.__version__, "pyarrow": pa.__version__},
        "sample": sample,
        "scanTarget": {"court": target_court, "year": int(target_year), "randomDocuments": len(ids)},
        "layouts": layouts,
        "compaction": {
            "fragmentBatches": 8,
            "fragmentedWriteSeconds": round(fragmented_seconds, 3),
            "fragmentedObjects": fragment_objects,
            "fragmentedBytes": fragment_bytes,
            "compactionSeconds": round(compaction_seconds, 3),
            "compactionMiBPerSecond": round(sample["sourceTextBytes"] / 2**20 / compaction_seconds, 3),
            "compactedObjects": compact_objects,
            "compactedBytes": compact_bytes,
            "objectReduction": round(fragment_objects / compact_objects, 3),
        },
        "payloadRetention": "removed after report" if not args.keep_payloads else str(LAB),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    con.close()
    if not args.keep_payloads:
        for child in LAB.iterdir():
            if child.name != "venv":
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink()
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
