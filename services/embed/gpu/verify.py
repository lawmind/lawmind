"""
The gate that must pass before any bulk GPU embed run.

A corpus is only useful if its vectors are comparable to the vectors a query
produces. Queries are embedded by `services/embed/src/embed.ts` on the Railway
CPU; the corpus is embedded here, on this machine's GPU. Those are different
machines, different execution providers, and — until proven otherwise — possibly
different numbers.

This is not a hypothetical concern. The q8 build failed exactly this test:

    q8, batch 1 vs batch 8, same machine    0.976
    q8, Railway CPU vs Windows CPU, batch 1 0.977

which is why the corpus is fp32. fp32 should agree to ~1e-6, but "should" is not
a measurement, so this script takes one.

Inputs, both produced by the caller and passed in:
  --texts     JSON array of chunk texts
  --reference JSON array of vectors for those texts, embedded by the REAL query
              path (transformers.js, dtype fp32) on the Railway container

Exit code is 0 only if every chunk agrees at or above the threshold. A partial
pass is a fail: one bad chunk is one search that quietly returns the wrong law.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from server import Embedder  # noqa: E402

import numpy as np  # noqa: E402


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    a = a.astype(np.float64)
    b = b.astype(np.float64)
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))


def report(label: str, values: list[float], threshold: float) -> tuple[float, float, int]:
    s = sorted(values)
    mean = statistics.fmean(s)
    below = sum(1 for v in s if v < threshold)
    print(f"\n{label}")
    print(f"  n            {len(s)}")
    print(f"  mean         {mean:.9f}")
    print(f"  min          {s[0]:.9f}")
    print(f"  max          {s[-1]:.9f}")
    print(f"  below {threshold}  {below} of {len(s)}")
    return mean, s[0], below


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--texts", required=True)
    ap.add_argument("--reference", required=True)
    ap.add_argument("--threshold", type=float, default=0.999)
    ap.add_argument("--batch", type=int, default=8)
    args = ap.parse_args()

    texts: list[str] = json.loads(Path(args.texts).read_text(encoding="utf8"))
    reference = np.array(json.loads(Path(args.reference).read_text(encoding="utf8")), dtype=np.float64)
    print(f"{len(texts)} texts, reference {reference.shape}")

    gpu = Embedder(require_gpu=True)

    # Batched, as the bulk run will do it. If batching moved fp32 vectors the way
    # it moved q8 vectors, this is where it shows.
    batched: list[list[float]] = []
    for i in range(0, len(texts), args.batch):
        vecs, _ = gpu.embed(texts[i : i + args.batch])
        batched.extend(vecs)
    batched_arr = np.array(batched, dtype=np.float64)

    # One at a time, as a query is embedded.
    singles: list[list[float]] = []
    for t in texts:
        vecs, _ = gpu.embed([t])
        singles.extend(vecs)
    singles_arr = np.array(singles, dtype=np.float64)

    mean_b, min_b, below_b = report(
        "GPU batched vs Railway CPU single  <- THE GATE",
        [cosine(batched_arr[i], reference[i]) for i in range(len(texts))],
        args.threshold,
    )
    report(
        "GPU single vs Railway CPU single   (isolates the execution provider)",
        [cosine(singles_arr[i], reference[i]) for i in range(len(texts))],
        args.threshold,
    )
    report(
        "GPU batched vs GPU single          (isolates batch composition)",
        [cosine(batched_arr[i], singles_arr[i]) for i in range(len(texts))],
        args.threshold,
    )

    print("\n" + "=" * 68)
    if below_b == 0:
        print(f"PASS — every chunk agrees at >= {args.threshold} (worst {min_b:.9f}).")
        print("A corpus embedded here is comparable to queries embedded on Railway.")
        print("Safe to start the bulk run.")
        return 0
    print(f"FAIL — {below_b} of {len(texts)} chunks below {args.threshold} (worst {min_b:.9f}, mean {mean_b:.9f}).")
    print("Do NOT start the bulk run: these vectors would not be comparable to")
    print("query vectors, and the damage is silent — worse results, never an error.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
