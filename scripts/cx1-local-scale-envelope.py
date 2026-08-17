#!/usr/bin/env python
"""Measure isolated workload interactions on the CX1 PostgreSQL lab.

"DeepSeek writes" means only representative result-row persistence. No model
call is made and no semantic claim is implied.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import statistics
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import unquote, urlparse

import psutil
import psycopg


ROOT = Path(__file__).resolve().parents[1]
LAB = Path("C:/lawmind/cx1-lab/vector")
PG_BIN = Path("C:/lawmind/pgsql/pgsql/bin")
DEFAULT_OUT = ROOT / "docs" / "ai" / "cx1-envelope-results" / "benchmark-results.json"


def source_url() -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("LOCAL_DATABASE_URL="):
            url = line.split("=", 1)[1].strip()
            if urlparse(url).hostname not in {"127.0.0.1", "localhost"}:
                raise SystemExit("REFUSING: LOCAL_DATABASE_URL is not loopback")
            return url
    raise SystemExit("LOCAL_DATABASE_URL missing")


def psql_args(url: str) -> tuple[list[str], dict]:
    parsed = urlparse(url)
    env = os.environ.copy()
    if parsed.password:
        env["PGPASSWORD"] = unquote(parsed.password)
    return [
        str(PG_BIN / "psql.exe"), "-w", "-h", parsed.hostname or "127.0.0.1",
        "-p", str(parsed.port or 5432), "-U", unquote(parsed.username or "postgres"),
        "-d", (parsed.path or "/postgres").lstrip("/"), "-X", "-v", "ON_ERROR_STOP=1",
    ], env


def run_command(args: list[str], env: dict | None = None) -> None:
    subprocess.run(args, check=True, capture_output=True, text=True, encoding="utf-8", env=env)


def lab_url(port: int) -> str:
    return f"postgresql://postgres@127.0.0.1:{port}/postgres"


@dataclass
class WorkResult:
    name: str
    operations: int = 0
    units: int = 0
    seconds: float = 0.0
    latencies_ms: list[float] = field(default_factory=list)
    error: str | None = None

    def report(self) -> dict:
        return {
            "name": self.name,
            "operations": self.operations,
            "units": self.units,
            "seconds": round(self.seconds, 3),
            "unitsPerSecond": round(self.units / self.seconds, 2) if self.seconds else None,
            "latencyMs": {
                "p50": round(statistics.median(self.latencies_ms), 3),
                "p95": round(sorted(self.latencies_ms)[int(len(self.latencies_ms) * 0.95)], 3),
            } if self.latencies_ms else None,
            "error": self.error,
        }


def postgres_tree_rss(postmaster_pid: int) -> int:
    try:
        process = psutil.Process(postmaster_pid)
        return sum(p.memory_info().rss for p in [process, *process.children(recursive=True)] if p.is_running())
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return 0


def read_probe(url: str, ids: list[str], stop: threading.Event) -> WorkResult:
    result = WorkResult("postgres_random_read")
    started = time.perf_counter()
    rng = random.Random(170817)
    try:
        with psycopg.connect(url, autocommit=True) as conn:
            while not stop.is_set():
                ident = ids[rng.randrange(len(ids))]
                t0 = time.perf_counter()
                conn.execute("SELECT length(full_text) FROM documents_source WHERE id=%s", (ident,)).fetchone()
                result.latencies_ms.append((time.perf_counter() - t0) * 1000)
                result.operations += 1
                result.units += 1
    except Exception as exc:  # noqa: BLE001
        result.error = str(exc)
    result.seconds = time.perf_counter() - started
    return result


def ingest(url: str, stop: threading.Event) -> WorkResult:
    result = WorkResult("ingest_copy_write")
    started = time.perf_counter()
    offset = 0
    try:
        with psycopg.connect(url, autocommit=True) as conn:
            conn.execute("TRUNCATE ingest_sink")
            while not stop.is_set():
                t0 = time.perf_counter()
                got = conn.execute(
                    """
                    INSERT INTO ingest_sink (source_id, case_title, full_text, reporter_citations, content_hash)
                    SELECT id, case_title, full_text, reporter_citations, md5(full_text)
                    FROM documents_source OFFSET %s LIMIT 1000
                    """,
                    (offset,),
                ).rowcount
                if not got:
                    offset = 0
                    conn.execute("TRUNCATE ingest_sink")
                    continue
                offset += got
                result.operations += 1
                result.units += got
                result.latencies_ms.append((time.perf_counter() - t0) * 1000)
    except Exception as exc:  # noqa: BLE001
        result.error = str(exc)
    result.seconds = time.perf_counter() - started
    return result


def citation_walk(url: str, stop: threading.Event) -> WorkResult:
    result = WorkResult("citation_key_walk")
    started = time.perf_counter()
    try:
        with psycopg.connect(url, autocommit=True) as conn:
            count = conn.execute("SELECT count(*) FROM documents_source").fetchone()[0]
            while not stop.is_set():
                t0 = time.perf_counter()
                conn.execute(
                    """
                    SELECT count(*) FROM (
                      SELECT upper(regexp_replace(rc, '[^A-Za-z0-9]', '', 'g')) k
                      FROM documents_source d, unnest(d.reporter_citations) rc WHERE rc <> ''
                      UNION ALL
                      SELECT upper(regexp_replace(substring(full_text from 1 for 2000), '[^A-Za-z0-9]', '', 'g'))
                      FROM documents_source
                    ) q
                    """
                ).fetchone()
                result.operations += 1
                result.units += count
                result.latencies_ms.append((time.perf_counter() - t0) * 1000)
    except Exception as exc:  # noqa: BLE001
        result.error = str(exc)
    result.seconds = time.perf_counter() - started
    return result


def deepseek_writes(url: str, stop: threading.Event) -> WorkResult:
    result = WorkResult("deepseek_result_writes_simulated")
    started = time.perf_counter()
    offset = 0
    try:
        with psycopg.connect(url, autocommit=True) as conn:
            conn.execute("TRUNCATE deepseek_result_sink")
            while not stop.is_set():
                t0 = time.perf_counter()
                got = conn.execute(
                    """
                    INSERT INTO deepseek_result_sink (judgment_id, task, parsed_output, raw_output)
                    SELECT id, 'holding',
                           jsonb_build_object('evidence', substring(full_text from 1 for 600), 'verified', true),
                           substring(full_text from 1 for 1200)
                    FROM documents_source OFFSET %s LIMIT 1000
                    """,
                    (offset,),
                ).rowcount
                if not got:
                    offset = 0
                    conn.execute("TRUNCATE deepseek_result_sink")
                    continue
                offset += got
                result.operations += 1
                result.units += got
                result.latencies_ms.append((time.perf_counter() - t0) * 1000)
    except Exception as exc:  # noqa: BLE001
        result.error = str(exc)
    result.seconds = time.perf_counter() - started
    return result


def vector_build(url: str, _: threading.Event) -> WorkResult:
    result = WorkResult("hnsw_build_100k")
    started = time.perf_counter()
    try:
        with psycopg.connect(url, autocommit=True) as conn:
            conn.execute("DROP INDEX IF EXISTS envelope_vectors_hnsw")
            conn.execute(
                "CREATE INDEX envelope_vectors_hnsw ON envelope_vectors USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64)"
            )
            result.operations = 1
            result.units = 100_000
    except Exception as exc:  # noqa: BLE001
        result.error = str(exc)
    result.seconds = time.perf_counter() - started
    return result


WORKERS = {
    "read": read_probe,
    "ingest": ingest,
    "citation": citation_walk,
    "deepseek_writes": deepseek_writes,
    "vector_build": vector_build,
}


def run_scenario(
    url: str,
    names: list[str],
    ids: list[str],
    duration: float,
    postmaster_pid: int,
) -> dict:
    stop = threading.Event()
    results: dict[str, WorkResult] = {}
    start_io = psutil.disk_io_counters()
    cpu: list[float] = []
    rss: list[int] = []
    psutil.cpu_percent(interval=None)

    def target(name: str) -> None:
        worker = WORKERS[name]
        results[name] = worker(url, ids, stop) if name == "read" else worker(url, stop)

    threads = [threading.Thread(target=target, args=(name,), daemon=True) for name in names]
    started = time.perf_counter()
    for thread in threads:
        thread.start()
    has_vector = "vector_build" in names
    while any(thread.is_alive() for thread in threads):
        elapsed = time.perf_counter() - started
        if (not has_vector and elapsed >= duration) or (has_vector and elapsed >= 180):
            stop.set()
        if has_vector and not threads[names.index("vector_build")].is_alive():
            stop.set()
        cpu.append(psutil.cpu_percent(interval=0.25))
        rss.append(postgres_tree_rss(postmaster_pid))
    stop.set()
    for thread in threads:
        thread.join()
    end_io = psutil.disk_io_counters()
    return {
        "name": "+".join(names),
        "wallSeconds": round(time.perf_counter() - started, 3),
        "workloads": {name: results[name].report() for name in names},
        "resources": {
            "cpuMeanPercent": round(statistics.mean(cpu), 2),
            "cpuPeakPercent": round(max(cpu), 2),
            "postgresRssPeakBytes": max(rss),
            "diskReadBytes": end_io.read_bytes - start_io.read_bytes,
            "diskWriteBytes": end_io.write_bytes - start_io.write_bytes,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=55432)
    parser.add_argument("--duration", type=float, default=15.0)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    data = LAB / "pgdata"
    if not (data / "postmaster.pid").exists():
        raise SystemExit("CX1 lab PostgreSQL is not running; run cx1-vector-capacity.py first")
    url = lab_url(args.port)
    source = source_url()
    copy_file = LAB / "documents.copy"
    with psycopg.connect(source, autocommit=False) as conn:
        conn.execute("SET TRANSACTION READ ONLY")
        active = conn.execute(
            "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state<>'idle'"
        ).fetchone()[0]
        if active:
            raise SystemExit(f"REFUSING: {active} other active canonical backend(s)")
        conn.rollback()
    source_psql, source_env = psql_args(source)
    if copy_file.exists():
        copy_file.unlink()
    run_command(
        [
            *source_psql,
            "-c",
            "\\copy (SELECT id, case_title, full_text, reporter_citations FROM judgments LIMIT 50000) "
            f"TO '{copy_file.as_posix()}' WITH (FORMAT binary)",
        ],
        source_env,
    )
    lab_psql = [
        str(PG_BIN / "psql.exe"), "-w", "-h", "127.0.0.1", "-p", str(args.port),
        "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1",
    ]
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("DROP TABLE IF EXISTS documents_source CASCADE")
        conn.execute(
            "CREATE UNLOGGED TABLE documents_source (id uuid PRIMARY KEY, case_title text, full_text text, reporter_citations text[])"
        )
    run_command(
        [*lab_psql, "-c", f"\\copy documents_source FROM '{copy_file.as_posix()}' WITH (FORMAT binary)"]
    )
    copy_bytes = copy_file.stat().st_size
    copy_file.unlink()
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("DROP TABLE IF EXISTS ingest_sink")
        conn.execute(
            "CREATE UNLOGGED TABLE ingest_sink (seq bigserial, source_id uuid, case_title text, full_text text, reporter_citations text[], content_hash text)"
        )
        conn.execute("DROP TABLE IF EXISTS deepseek_result_sink")
        conn.execute(
            "CREATE UNLOGGED TABLE deepseek_result_sink (seq bigserial, judgment_id uuid, task text, parsed_output jsonb, raw_output text)"
        )
        conn.execute("DROP TABLE IF EXISTS envelope_vectors CASCADE")
        conn.execute("CREATE UNLOGGED TABLE envelope_vectors AS SELECT id, embedding FROM vector_source LIMIT 100000")
        ids = [str(row[0]) for row in conn.execute("SELECT id FROM documents_source LIMIT 1000").fetchall()]

    postmaster_pid = int((data / "postmaster.pid").read_text().splitlines()[0])
    # One unreported warm-up puts vector pages in the same cache state as every measured rebuild.
    warmup = threading.Event()
    vector_build(url, warmup)
    scenarios = [
        ["read"], ["ingest"], ["citation"], ["deepseek_writes"], ["vector_build"],
        ["ingest", "vector_build"], ["citation", "vector_build"],
        ["deepseek_writes", "vector_build"], ["ingest", "citation"],
        ["ingest", "deepseek_writes"],
    ]
    results = []
    for names in scenarios:
        print(f"scenario {'+'.join(names)}", flush=True)
        results.append(run_scenario(url, names, ids, args.duration, postmaster_pid))

    report = {
        "kind": "cx1_local_scale_envelope",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "evidenceClass": "MEASURED_DISPOSABLE_WORKLOADS",
        "controls": {
            "durationSecondsForNonVectorScenarios": args.duration,
            "sourceDocumentsCopied": 50_000,
            "sourceCopyBytes": copy_bytes,
            "vectorBuildRows": 100_000,
            "canonicalWrites": 0,
            "deepseekModelCalls": 0,
            "deepseekWriteWorkload": "representative JSONB/raw-output persistence only",
        },
        "scenarios": results,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()

