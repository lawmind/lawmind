#!/usr/bin/env python
"""Basic local hardware viability smoke test for CX1.

The small payloads do not establish sustained capacity. They are written to an
OS temporary directory and removed after the JSON report is recorded.
"""

from __future__ import annotations

import json
import os
import random
import tempfile
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "ai" / "cx1-hardware-proof"
RUN = OUT / time.strftime("run-%Y%m%d-%H%M%S")
BLOCK = b"lawmind-cx1-benchmark\n" * 2048
SEQ_MB = 256
RANDOM_OPS = 4096


def mbps(bytes_count: int, seconds: float) -> float:
    return round((bytes_count / 1_048_576) / max(seconds, 0.001), 2)


def sequential(path: Path) -> dict[str, float | int | str]:
    target = path / "sequential-write.bin"
    total = SEQ_MB * 1_048_576
    written = 0
    t0 = time.perf_counter()
    with target.open("wb", buffering=1024 * 1024) as f:
        while written < total:
            n = min(len(BLOCK), total - written)
            f.write(BLOCK[:n])
            written += n
        f.flush()
        os.fsync(f.fileno())
    write_seconds = time.perf_counter() - t0

    read = 0
    t1 = time.perf_counter()
    with target.open("rb", buffering=1024 * 1024) as f:
        while chunk := f.read(1024 * 1024):
            read += len(chunk)
    read_seconds = time.perf_counter() - t1
    return {
        "file": target.name,
        "bytes": total,
        "write_seconds": round(write_seconds, 3),
        "write_mib_per_second": mbps(total, write_seconds),
        "read_seconds": round(read_seconds, 3),
        "read_mib_per_second": mbps(read, read_seconds),
    }


def random_io(path: Path) -> dict[str, float | int | str]:
    target = path / "random-io.bin"
    total = 64 * 1_048_576
    rng = random.Random(9173)
    with target.open("wb", buffering=1024 * 1024) as f:
        f.truncate(total)

    offsets = [rng.randrange(0, total // 4096) * 4096 for _ in range(RANDOM_OPS)]
    payload = os.urandom(4096)

    t0 = time.perf_counter()
    with target.open("r+b", buffering=0) as f:
        for off in offsets:
            f.seek(off)
            f.write(payload)
        os.fsync(f.fileno())
    write_seconds = time.perf_counter() - t0

    checksum = 0
    t1 = time.perf_counter()
    with target.open("rb", buffering=0) as f:
        for off in offsets:
            f.seek(off)
            checksum ^= f.read(4096)[0]
    read_seconds = time.perf_counter() - t1

    return {
        "file": target.name,
        "ops": RANDOM_OPS,
        "block_bytes": 4096,
        "write_seconds": round(write_seconds, 3),
        "write_iops": round(RANDOM_OPS / max(write_seconds, 0.001), 1),
        "read_seconds": round(read_seconds, 3),
        "read_iops": round(RANDOM_OPS / max(read_seconds, 0.001), 1),
        "checksum_probe": checksum,
    }


def network(path: Path) -> dict[str, float | int | str]:
    target = path / "cloudflare-25mb.bin"
    url = "https://speed.cloudflare.com/__down?bytes=25000000"
    t0 = time.perf_counter()
    bytes_read = 0
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "LawMind-CX1-bandwidth-probe/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp, target.open("wb") as f:
            while chunk := resp.read(1024 * 1024):
                f.write(chunk)
                bytes_read += len(chunk)
        seconds = time.perf_counter() - t0
        return {
            "url": url,
            "file": target.name,
            "bytes": bytes_read,
            "seconds": round(seconds, 3),
            "mib_per_second": mbps(bytes_read, seconds),
            "mbit_per_second": round((bytes_read * 8 / 1_000_000) / max(seconds, 0.001), 2),
        }
    except Exception as exc:  # noqa: BLE001 - benchmark records failure verbatim.
        return {"url": url, "error": type(exc).__name__, "message": str(exc)}


def main() -> None:
    RUN.mkdir(parents=True)
    with tempfile.TemporaryDirectory(prefix="lawmind-cx1-hardware-") as temp:
        payload_dir = Path(temp)
        report = {
            "evidence_class": "MEASURED-BUT-LIMITED",
            "kind": "cx1_local_hardware_basic_viability_smoke_test",
            "run_dir": str(RUN.relative_to(ROOT)).replace(os.sep, "/"),
            "sequential": sequential(payload_dir),
            "random_io": random_io(payload_dir),
            "network": network(payload_dir),
            "capacity_claim": "forbidden",
            "note": (
                "256 MiB sequential IO, 64 MiB random IO, and a 25 MB download "
                "are basic viability smoke tests only. Payloads are temporary."
            ),
        }
    (RUN / "hardware-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
