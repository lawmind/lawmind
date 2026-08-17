#!/usr/bin/env python
"""Disposable pgvector capacity benchmark using a read-only vector copy."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import statistics
import subprocess
import threading
import time
from pathlib import Path
from urllib.parse import urlparse, unquote

import psutil
import psycopg


ROOT = Path(__file__).resolve().parents[1]
LAB = Path("C:/lawmind/cx1-lab/vector")
PG_BIN = Path("C:/lawmind/pgsql/pgsql/bin")
DEFAULT_OUT = ROOT / "docs" / "ai" / "cx1-vector-results" / "benchmark-results.json"


def local_url() -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("LOCAL_DATABASE_URL="):
            url = line.split("=", 1)[1].strip()
            if urlparse(url).hostname not in {"127.0.0.1", "localhost"}:
                raise SystemExit("REFUSING: LOCAL_DATABASE_URL is not loopback")
            return url
    raise SystemExit("LOCAL_DATABASE_URL missing")


def command(args: list[str], *, env: dict | None = None, capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        args,
        check=True,
        text=True,
        encoding="utf-8",
        capture_output=capture,
        env=env,
    )


def source_psql_args(url: str) -> tuple[list[str], dict]:
    parsed = urlparse(url)
    env = os.environ.copy()
    if parsed.password:
        env["PGPASSWORD"] = unquote(parsed.password)
    args = [
        str(PG_BIN / "psql.exe"),
        "-w",
        "-h",
        parsed.hostname or "127.0.0.1",
        "-p",
        str(parsed.port or 5432),
        "-U",
        unquote(parsed.username or "postgres"),
        "-d",
        (parsed.path or "/postgres").lstrip("/"),
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
    ]
    return args, env


def lab_url(port: int) -> str:
    return f"postgresql://postgres@127.0.0.1:{port}/postgres"


def relation_bytes(conn: psycopg.Connection, name: str) -> int:
    return conn.execute("SELECT pg_relation_size(%s::regclass)", (name,)).fetchone()[0]


def table_bytes(conn: psycopg.Connection, name: str) -> int:
    """Heap, FSM/VM, and TOAST; indexes are deliberately measured separately."""
    return conn.execute("SELECT pg_table_size(%s::regclass)", (name,)).fetchone()[0]


def tree_rss(postmaster_pid: int) -> int:
    try:
        root = psutil.Process(postmaster_pid)
        processes = [root, *root.children(recursive=True)]
        return sum(process.memory_info().rss for process in processes if process.is_running())
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return 0


def monitored_execute(conn: psycopg.Connection, sql: str, postmaster_pid: int) -> dict:
    done = threading.Event()
    samples: list[int] = []
    baseline = tree_rss(postmaster_pid)

    def monitor() -> None:
        while not done.wait(0.25):
            samples.append(tree_rss(postmaster_pid))

    watcher = threading.Thread(target=monitor, daemon=True)
    watcher.start()
    started = time.perf_counter()
    try:
        conn.execute(sql)
        conn.commit()
    finally:
        done.set()
        watcher.join()
    peak = max(samples or [baseline])
    return {
        "seconds": round(time.perf_counter() - started, 3),
        "baselineRssBytes": baseline,
        "peakRssBytes": peak,
        "peakRssDeltaBytes": max(0, peak - baseline),
    }


def percentile(values: list[float], p: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * p / 100))]


def benchmark_representation(
    conn: psycopg.Connection,
    postmaster_pid: int,
    scale: int,
    representation: str,
    dump_dir: Path,
) -> dict:
    table = f"bench_{representation}_{scale}"
    index = f"{table}_hnsw"
    cast = "embedding" if representation == "fp32" else "embedding::halfvec(1024)"
    opclass = "vector_cosine_ops" if representation == "fp32" else "halfvec_cosine_ops"
    conn.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
    conn.execute(
        f"CREATE UNLOGGED TABLE {table} AS SELECT id, {cast} AS embedding FROM vector_source LIMIT {scale}"
    )
    conn.commit()
    rows, avg_payload = conn.execute(
        f"SELECT count(*), avg(pg_column_size(embedding)) FROM {table}"
    ).fetchone()
    heap_before = relation_bytes(conn, table)
    table_before = table_bytes(conn, table)
    build = monitored_execute(
        conn,
        f"CREATE INDEX {index} ON {table} USING hnsw (embedding {opclass}) WITH (m=16, ef_construction=64)",
        postmaster_pid,
    )
    index_before = relation_bytes(conn, index)

    available = conn.execute("SELECT count(*) FROM vector_source").fetchone()[0]
    holdout_start = min(scale, max(0, available - 100))
    queries = [
        row[0]
        for row in conn.execute(
            f"SELECT embedding::text FROM vector_source OFFSET {holdout_start} LIMIT 40"
        ).fetchall()
    ]
    conn.execute("SET hnsw.ef_search=40")
    conn.execute("SET enable_seqscan=off")
    latencies = []
    query_cast = "vector(1024)" if representation == "fp32" else "halfvec(1024)"
    for value in queries:
        started = time.perf_counter()
        conn.execute(
            f"SELECT id FROM {table} ORDER BY embedding <=> %s::{query_cast} LIMIT 10", (value,)
        ).fetchall()
        latencies.append((time.perf_counter() - started) * 1000)

    insert_n = min(10_000, max(0, available - scale))
    insert_started = time.perf_counter()
    if insert_n:
        conn.execute(
            f"INSERT INTO {table} SELECT id, {cast} FROM vector_source OFFSET {scale} LIMIT {insert_n}"
        )
        conn.commit()
    insert_seconds = time.perf_counter() - insert_started
    index_after = relation_bytes(conn, index)
    heap_after = relation_bytes(conn, table)
    table_after = table_bytes(conn, table)

    dump = dump_dir / f"{table}.dump"
    if dump.exists():
        dump.unlink()
    dump_started = time.perf_counter()
    command(
        [
            str(PG_BIN / "pg_dump.exe"),
            "-w",
            "-h",
            "127.0.0.1",
            "-p",
            str(conn.info.port),
            "-U",
            "postgres",
            "-Fc",
            "-t",
            table,
            "-f",
            str(dump),
            "postgres",
        ]
    )
    dump_seconds = time.perf_counter() - dump_started
    result = {
        "scaleRows": int(rows),
        "representation": representation,
        "payloadBytesPerVector": round(float(avg_payload), 2),
        "heapBytesBeforeIncremental": heap_before,
        "heapBytesPerVectorBeforeIncremental": round(heap_before / rows, 2),
        "tableIncludingToastBytesBeforeIncremental": table_before,
        "tableIncludingToastBytesPerVectorBeforeIncremental": round(table_before / rows, 2),
        "indexBytesBeforeIncremental": index_before,
        "indexBytesPerVectorBeforeIncremental": round(index_before / rows, 2),
        "build": build,
        "queryLatencyMs": {
            "queries": len(latencies),
            "p50": round(statistics.median(latencies), 3),
            "p95": round(percentile(latencies, 95), 3),
            "max": round(max(latencies), 3),
            "efSearch": 40,
        },
        "incrementalInsert": {
            "rows": insert_n,
            "seconds": round(insert_seconds, 3),
            "rowsPerSecond": round(insert_n / insert_seconds, 2) if insert_seconds else None,
            "indexGrowthBytes": index_after - index_before,
            "heapGrowthBytes": heap_after - heap_before,
            "tableIncludingToastGrowthBytes": table_after - table_before,
        },
        "backupImpact": {
            "logicalCustomDumpBytes": dump.stat().st_size,
            "logicalDumpSeconds": round(dump_seconds, 3),
            "physicalTableIncludingToastPlusIndexBytes": table_after + index_after,
            "note": "pg_dump stores rows and index DDL, not HNSW pages; physical backup includes table/TOAST and index pages",
        },
    }
    dump.unlink()
    conn.execute(f"DROP TABLE {table} CASCADE")
    conn.commit()
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=55432)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--stop-lab", action="store_true")
    args = parser.parse_args()
    data = LAB / "pgdata"
    log = LAB / "postgres.log"
    copy_file = LAB / "vectors.copy"
    dumps = LAB / "dumps"
    LAB.mkdir(parents=True, exist_ok=True)
    dumps.mkdir(exist_ok=True)
    if args.reset and data.exists():
        command([str(PG_BIN / "pg_ctl.exe"), "-D", str(data), "stop", "-m", "fast"], capture=True)
        shutil.rmtree(data)
    if not data.exists():
        command(
            [
                str(PG_BIN / "initdb.exe"),
                "-D",
                str(data),
                "-U",
                "postgres",
                "--auth=trust",
                "--encoding=UTF8",
            ]
        )
    status = subprocess.run(
        [str(PG_BIN / "pg_ctl.exe"), "-D", str(data), "status"], capture_output=True
    )
    if status.returncode != 0:
        command(
            [
                str(PG_BIN / "pg_ctl.exe"),
                "-D",
                str(data),
                "-l",
                str(log),
                "-o",
                f"-p {args.port} -h 127.0.0.1 -c shared_buffers=2GB -c maintenance_work_mem=2GB -c max_parallel_maintenance_workers=4 -c work_mem=64MB",
                "start",
                "-w",
                "-t",
                "120",
            ],
            capture=False,
        )
    print("lab PostgreSQL ready", flush=True)

    source = local_url()
    with psycopg.connect(source, autocommit=False) as source_conn:
        source_conn.execute("SET TRANSACTION READ ONLY")
        active = source_conn.execute(
            "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state<>'idle'"
        ).fetchone()[0]
        if active:
            raise SystemExit(f"REFUSING: {active} other active canonical backend(s)")
        existing = source_conn.execute(
            """
            SELECT pg_relation_size('judgment_chunks'),
                   pg_relation_size('judgment_chunks_embedding_hnsw'),
                   pg_get_indexdef('judgment_chunks_embedding_hnsw'::regclass),
                   (SELECT extversion FROM pg_extension WHERE extname='vector')
            """
        ).fetchone()
        source_conn.rollback()
    print("canonical catalog preflight complete", flush=True)

    psql, source_env = source_psql_args(source)
    if copy_file.exists():
        copy_file.unlink()
    export_sql = (
        "\\copy (SELECT id, embedding FROM judgment_chunks WHERE embedding IS NOT NULL) "
        f"TO '{copy_file.as_posix()}' WITH (FORMAT binary)"
    )
    export_started = time.perf_counter()
    print("exporting canonical vectors as binary COPY", flush=True)
    command([*psql, "-c", export_sql], env=source_env)
    export_seconds = time.perf_counter() - export_started
    print(f"vector export complete in {export_seconds:.1f}s", flush=True)

    with psycopg.connect(lab_url(args.port), autocommit=True) as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        conn.execute("DROP TABLE IF EXISTS vector_source")
        conn.execute("CREATE UNLOGGED TABLE vector_source (id uuid, embedding vector(1024))")
    lab_psql = [
        str(PG_BIN / "psql.exe"), "-w", "-h", "127.0.0.1", "-p", str(args.port),
        "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1",
    ]
    import_started = time.perf_counter()
    print("importing vector copy into disposable lab", flush=True)
    command([*lab_psql, "-c", f"\\copy vector_source FROM '{copy_file.as_posix()}' WITH (FORMAT binary)"])
    import_seconds = time.perf_counter() - import_started
    print(f"vector import complete in {import_seconds:.1f}s", flush=True)
    copy_bytes = copy_file.stat().st_size
    copy_file.unlink()

    postmaster_pid = int((data / "postmaster.pid").read_text().splitlines()[0])
    with psycopg.connect(lab_url(args.port), autocommit=False) as conn:
        conn.execute("SET statement_timeout='0'")
        copied = conn.execute("SELECT count(*) FROM vector_source").fetchone()[0]
        measurements = []
        for scale in (100_000, 300_000, 600_000):
            for representation in ("fp32", "halfvec"):
                print(f"benchmarking {scale:,} {representation}", flush=True)
                measurements.append(
                    benchmark_representation(conn, postmaster_pid, scale, representation, dumps)
                )

    report = {
        "kind": "cx1_vector_capacity_benchmark",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "evidenceClass": "MEASURED_DISPOSABLE_POSTGRES_COPY",
        "source": {
            "rows": int(copied),
            "nonnullVectors": int(copied),
            "heapBytes": int(existing[0]),
            "hnswIndexBytes": int(existing[1]),
            "hnswIndexDefinition": existing[2],
            "pgvectorVersion": existing[3],
            "writes": 0,
        },
        "copy": {
            "rows": int(copied),
            "binaryCopyBytes": copy_bytes,
            "exportSeconds": round(export_seconds, 3),
            "importSeconds": round(import_seconds, 3),
            "payloadRemovedAfterImport": True,
        },
        "lab": {
            "port": args.port,
            "dataDirectory": str(data),
            "sharedBuffers": "2GB",
            "maintenanceWorkMem": "2GB",
            "maxParallelMaintenanceWorkers": 4,
        },
        "measurements": measurements,
        "semanticEquivalence": "NOT TESTED — NEW1 owns quality",
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.out}")
    if args.stop_lab:
        command([str(PG_BIN / "pg_ctl.exe"), "-D", str(data), "stop", "-m", "fast"])


if __name__ == "__main__":
    main()
