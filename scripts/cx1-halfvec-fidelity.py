#!/usr/bin/env python
"""CX1 halfvec semantic fidelity harness.

Runs C1 distance distortion and C2 exact nearest-neighbour overlap on copied
embeddings. This intentionally avoids HNSW so representation loss is measured
before ANN loss. It writes a report and machine JSON, but it must only be run
when the CX1 scheduler allows VECTOR_EXCLUSIVE or an explicit small dry run.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import subprocess
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

try:
    import numpy as np
except ImportError as exc:  # pragma: no cover - environment guard
    raise SystemExit("numpy is required for this harness") from exc

ROOT = Path(__file__).resolve().parents[1]
LAB = Path("C:/lawmind/cx1-lab/halfvec-fidelity")
PG_BIN = Path("C:/lawmind/pgsql/pgsql/bin")
DEFAULT_JSON = ROOT / "docs" / "ai" / "cx1-vector-results" / "halfvec-fidelity.json"
DEFAULT_REPORT = ROOT / "docs" / "ai" / "CX1_HALFVEC_FIDELITY.md"


def local_url() -> str:
    env = ROOT.joinpath(".env").read_text(encoding="utf-8")
    for line in env.splitlines():
        if line.startswith("LOCAL_DATABASE_URL="):
            url = line.split("=", 1)[1].strip()
            if urlparse(url).hostname not in {"127.0.0.1", "localhost"}:
                raise SystemExit("REFUSING: LOCAL_DATABASE_URL is not loopback")
            return url
    raise SystemExit("LOCAL_DATABASE_URL missing")


def psql_args(url: str) -> tuple[list[str], dict[str, str]]:
    parsed = urlparse(url)
    env = os.environ.copy()
    if parsed.password:
        env["PGPASSWORD"] = unquote(parsed.password)
    return (
        [
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
        ],
        env,
    )


def command(args: list[str], *, env: dict[str, str] | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(args, check=True, text=True, encoding="utf-8", capture_output=True, env=env)


def parse_vector(text: str) -> np.ndarray:
    return np.fromstring(text.strip("[]"), sep=",", dtype=np.float32)


def cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return math.nan
    return 1.0 - float(np.dot(a, b) / denom)


def percentiles(values: list[float]) -> dict[str, float]:
    clean = np.array([v for v in values if math.isfinite(v)], dtype=np.float64)
    if clean.size == 0:
        return {"count": 0}
    return {
        "count": int(clean.size),
        "p50": float(np.percentile(clean, 50)),
        "p95": float(np.percentile(clean, 95)),
        "p99": float(np.percentile(clean, 99)),
        "max": float(np.max(clean)),
    }


def overlap(a: list[int], b: list[int], k: int) -> float:
    return len(set(a[:k]).intersection(b[:k])) / k


def rank_correlation(a: list[int], b: list[int], k: int) -> float | None:
    shared = list(set(a[:k]).intersection(b[:k]))
    if len(shared) < 2:
        return None
    ar = np.array([a.index(x) for x in shared], dtype=np.float64)
    br = np.array([b.index(x) for x in shared], dtype=np.float64)
    if np.std(ar) == 0 or np.std(br) == 0:
        return None
    return float(np.corrcoef(ar, br)[0, 1])


def copy_vectors(rows: int, seed: int, out_file: Path) -> None:
    url = local_url()
    args, env = psql_args(url)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    sql = (
        "COPY ("
        "SELECT id, embedding::text "
        "FROM judgment_chunks TABLESAMPLE SYSTEM (2) REPEATABLE (%s) "
        "WHERE embedding IS NOT NULL "
        "LIMIT %s"
        ") TO STDOUT WITH CSV"
    )
    # PowerShell/stdout redirection is not used because this script runs via
    # Python. Capture stdout so the file is controlled here.
    result = command([*args, "-c", sql % (seed, rows)], env=env)
    out_file.write_text(result.stdout, encoding="utf-8")


def load_vectors(path: Path, rows: int) -> tuple[list[str], np.ndarray]:
    ids: list[str] = []
    vecs: list[np.ndarray] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        first, rest = line.split(",", 1)
        ids.append(first)
        vecs.append(parse_vector(rest.strip('"')))
        if len(ids) >= rows:
            break
    if not vecs:
        raise SystemExit("no vectors loaded")
    matrix = np.vstack(vecs).astype(np.float32)
    norms = np.linalg.norm(matrix, axis=1)
    keep = norms > 0
    return [i for i, ok in zip(ids, keep) if ok], matrix[keep]


def c1_distance_distortion(matrix: np.ndarray, pairs: int, seed: int) -> dict:
    rng = random.Random(seed)
    half = matrix.astype(np.float16).astype(np.float32)
    abs_errors: list[float] = []
    rel_errors: list[float] = []
    buckets = {
        "high_similarity": [],
        "medium_similarity": [],
        "low_similarity": [],
    }
    worst: list[dict] = []
    n = matrix.shape[0]
    for _ in range(pairs):
        i = rng.randrange(n)
        j = rng.randrange(n)
        d32 = cosine_distance(matrix[i], matrix[j])
        d16 = cosine_distance(half[i], half[j])
        err = abs(d32 - d16)
        abs_errors.append(err)
        if abs(d32) > 1e-9:
            rel_errors.append(err / abs(d32))
        similarity = 1.0 - d32
        if similarity >= 0.8:
            buckets["high_similarity"].append(err)
        elif similarity >= 0.4:
            buckets["medium_similarity"].append(err)
        else:
            buckets["low_similarity"].append(err)
        worst.append({"i": i, "j": j, "fp32Distance": d32, "halfDistance": d16, "absError": err})
    worst.sort(key=lambda r: r["absError"], reverse=True)
    return {
        "pairs": pairs,
        "absoluteError": percentiles(abs_errors),
        "relativeError": percentiles(rel_errors),
        "bySimilarityBucket": {k: percentiles(v) for k, v in buckets.items()},
        "worst": worst[:10],
    }


def topk_by_cosine(query: np.ndarray, matrix: np.ndarray, k: int) -> list[int]:
    q_norm = np.linalg.norm(query)
    m_norms = np.linalg.norm(matrix, axis=1)
    sims = np.matmul(matrix, query) / (m_norms * q_norm)
    order = np.argsort(-sims)
    return [int(i) for i in order[:k]]


def c2_exact_overlap(matrix: np.ndarray, queries: int, seed: int) -> dict:
    rng = random.Random(seed)
    half = matrix.astype(np.float16).astype(np.float32)
    ks = [5, 10, 20, 50]
    metrics = {str(k): {"overlaps": [], "rankCorrelations": [], "firstDisagreements": 0} for k in ks}
    margins: list[float] = []
    n = matrix.shape[0]
    for _ in range(queries):
        q_idx = rng.randrange(n)
        fp32_order = topk_by_cosine(matrix[q_idx], matrix, max(ks) + 1)
        half_order = topk_by_cosine(half[q_idx], half, max(ks) + 1)
        fp32_order = [i for i in fp32_order if i != q_idx]
        half_order = [i for i in half_order if i != q_idx]
        for k in ks:
            metrics[str(k)]["overlaps"].append(overlap(fp32_order, half_order, k))
            corr = rank_correlation(fp32_order, half_order, k)
            if corr is not None:
                metrics[str(k)]["rankCorrelations"].append(corr)
            if fp32_order[:1] != half_order[:1]:
                metrics[str(k)]["firstDisagreements"] += 1
        if len(fp32_order) >= 2:
            # Approximate distance margin between fp32 first and second neighbor.
            d1 = cosine_distance(matrix[q_idx], matrix[fp32_order[0]])
            d2 = cosine_distance(matrix[q_idx], matrix[fp32_order[1]])
            margins.append(d2 - d1)
    return {
        "queries": queries,
        "topK": {
            k: {
                "meanOverlap": float(np.mean(v["overlaps"])),
                "p50Overlap": float(np.percentile(v["overlaps"], 50)),
                "p05Overlap": float(np.percentile(v["overlaps"], 5)),
                "meanRankCorrelation": float(np.mean(v["rankCorrelations"]))
                if v["rankCorrelations"]
                else None,
                "firstResultDisagreementRate": v["firstDisagreements"] / queries,
            }
            for k, v in metrics.items()
        },
        "fp32FirstSecondDistanceMargin": percentiles(margins),
    }


def verdict(c1: dict, c2: dict) -> str:
    p99_abs = c1["absoluteError"].get("p99", 1.0)
    first_disagree = c2["topK"]["5"]["firstResultDisagreementRate"]
    top10_overlap = c2["topK"]["10"]["meanOverlap"]
    if p99_abs <= 0.0005 and first_disagree <= 0.01 and top10_overlap >= 0.99:
        return "NO_MEASURABLE_DEGRADATION"
    if p99_abs <= 0.003 and first_disagree <= 0.05 and top10_overlap >= 0.95:
        return "SMALL_MEASURABLE_DEGRADATION"
    return "MATERIAL_DEGRADATION"


def write_report(result: dict, path: Path) -> None:
    c1 = result["c1DistanceDistortion"]
    c2 = result["c2ExactNearestNeighbourOverlap"]
    lines = [
        "# CX1 Halfvec Fidelity",
        "",
        f"Generated: **{result['createdAt']}**",
        "",
        "Status: **measured on copied vectors only**",
        "",
        f"Verdict candidate: **{result['verdictCandidate']}**",
        "",
        "NEW1 owns the final quality decision. This report isolates representation loss; it does not approve production halfvec.",
        "",
        "## C1 Distance Distortion",
        "",
        f"Pairs: **{c1['pairs']}**",
        "",
        "| Metric | p50 | p95 | p99 | max |",
        "|---|---:|---:|---:|---:|",
        f"| absolute error | {c1['absoluteError'].get('p50', 0):.8f} | {c1['absoluteError'].get('p95', 0):.8f} | {c1['absoluteError'].get('p99', 0):.8f} | {c1['absoluteError'].get('max', 0):.8f} |",
        f"| relative error | {c1['relativeError'].get('p50', 0):.8f} | {c1['relativeError'].get('p95', 0):.8f} | {c1['relativeError'].get('p99', 0):.8f} | {c1['relativeError'].get('max', 0):.8f} |",
        "",
        "## C2 Exact Nearest-Neighbour Overlap",
        "",
        "| k | mean overlap | p50 overlap | p05 overlap | first-result disagreement | mean rank correlation |",
        "|---:|---:|---:|---:|---:|---:|",
    ]
    for k, row in c2["topK"].items():
        corr = row["meanRankCorrelation"]
        corr_text = f"{corr:.4f}" if corr is not None else "n/a"
        lines.append(
            f"| {k} | {row['meanOverlap']:.4f} | {row['p50Overlap']:.4f} | {row['p05Overlap']:.4f} | {row['firstResultDisagreementRate']:.4f} | {corr_text} |"
        )
    lines.extend(
        [
            "",
            "## Machine Output",
            "",
            f"- `{result['resultFile']}`",
            "",
            "Copied vector payload is removed after the run unless `--keep-copy` is supplied.",
        ]
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=5000)
    parser.add_argument("--pairs", type=int, default=100000)
    parser.add_argument("--queries", type=int, default=200)
    parser.add_argument("--seed", type=int, default=170817)
    parser.add_argument("--reuse-copy", action="store_true")
    parser.add_argument("--keep-copy", action="store_true")
    parser.add_argument("--out", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()

    LAB.mkdir(parents=True, exist_ok=True)
    copy_file = LAB / f"vectors-{args.rows}-{args.seed}.csv"
    if not args.reuse_copy or not copy_file.exists():
        started = time.perf_counter()
        copy_vectors(args.rows, args.seed, copy_file)
        copy_seconds = time.perf_counter() - started
    else:
        copy_seconds = 0.0

    ids, matrix = load_vectors(copy_file, args.rows)
    c1 = c1_distance_distortion(matrix, args.pairs, args.seed)
    c2 = c2_exact_overlap(matrix, args.queries, args.seed + 1)
    result = {
        "kind": "cx1_halfvec_fidelity",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "evidenceClass": "MEASURED_COPIED_VECTORS_NO_HNSW",
        "input": {
            "copyFile": str(copy_file),
            "requestedRows": args.rows,
            "loadedRows": len(ids),
            "dimensions": int(matrix.shape[1]),
            "seed": args.seed,
            "copySeconds": round(copy_seconds, 3),
            "copyPayloadRemovedAfterRun": not args.keep_copy,
        },
        "c1DistanceDistortion": c1,
        "c2ExactNearestNeighbourOverlap": c2,
        "verdictCandidate": verdict(c1, c2),
        "resultFile": args.out.relative_to(ROOT).as_posix(),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    write_report(result, args.report)
    if not args.keep_copy and copy_file.exists():
        copy_file.unlink()
    print(f"wrote {args.out}")
    print(f"wrote {args.report}")
    print(result["verdictCandidate"])


if __name__ == "__main__":
    main()
