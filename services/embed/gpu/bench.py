"""
GPU embedding throughput bench — the measurement that has to exist before any
bulk run is sized.

`server.py` already refuses to run on CPU (`require_gpu=True` exits if
CUDAExecutionProvider does not take the graph), and its `token_sq_budget`
comment records a batch sweep on this card. What has never been written down is
the number that sizes a pilot: **chunks and tokens per second, with the GPU
actually observed to be busy.**

That distinction is the whole point. `providers=['CUDAExecutionProvider', ...]`
means the provider was REGISTERED, not that a single kernel ran on it — a graph
can be placed on CUDA and still spend its life waiting on a tokenizer running on
one CPU core. So this samples `nvidia-smi` throughout the run and reports GPU
utilisation and VRAM beside the throughput. A high chunks/sec with 3% GPU
utilisation and a saturated CPU is a tokenizer benchmark wearing a GPU's
clothes, and it would size the pilot wrong in the expensive direction.

Texts come from a file, never from the database: this box's CPU is saturated by
the ingest fleet, and a bench that competes with it measures contention.

    python services/embed/gpu/bench.py --texts sample.json --limit 2000

Exit code is 0 only if CUDA took the graph AND the GPU was observed doing work.
"""

from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from server import Embedder  # noqa: E402

try:
    import psutil  # noqa: E402
except ImportError:  # pragma: no cover - psutil is optional, absence is reported
    psutil = None


def nvidia_smi_query(fields: str) -> list[str]:
    """One `nvidia-smi --query-gpu` row, or [] when the tool is unavailable."""
    try:
        out = subprocess.run(
            ["nvidia-smi", f"--query-gpu={fields}", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    line = out.stdout.strip().splitlines()
    return [c.strip() for c in line[0].split(",")] if line else []


class Sampler(threading.Thread):
    """Polls GPU utilisation, VRAM and process CPU while the bench runs.

    Sampled rather than read once at the end: peak VRAM and mean utilisation are
    the two numbers that decide batch size, and both are invisible to a
    before/after reading.
    """

    def __init__(self, interval: float = 0.25) -> None:
        super().__init__(daemon=True)
        self.interval = interval
        self.stop_flag = threading.Event()
        self.gpu_util: list[float] = []
        self.vram_used: list[float] = []
        self.cpu_pct: list[float] = []
        self.proc = psutil.Process() if psutil is not None else None
        if self.proc is not None:
            self.proc.cpu_percent(None)  # prime the counter; first call is always 0

    def run(self) -> None:
        while not self.stop_flag.is_set():
            row = nvidia_smi_query("utilization.gpu,memory.used")
            if len(row) >= 2:
                try:
                    self.gpu_util.append(float(row[0]))
                    self.vram_used.append(float(row[1]))
                except ValueError:
                    pass
            if self.proc is not None:
                self.cpu_pct.append(self.proc.cpu_percent(None))
            self.stop_flag.wait(self.interval)


def summarise(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"n": 0, "mean": None, "max": None, "p50": None}
    s = sorted(values)
    return {
        "n": len(s),
        "mean": round(statistics.fmean(s), 2),
        "max": s[-1],
        "p50": s[len(s) // 2],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--texts", required=True, help="JSON array of chunk texts")
    ap.add_argument("--limit", type=int, default=2000)
    ap.add_argument(
        "--max-chars",
        type=int,
        default=2400,
        help="truncate to the real chunker's maxChars so the bench matches production shape",
    )
    ap.add_argument("--warmup", type=int, default=32)
    ap.add_argument("--json", default=None, help="write the measurement here")
    args = ap.parse_args()

    texts = json.loads(Path(args.texts).read_text(encoding="utf-8"))
    texts = [t[: args.max_chars] for t in texts if isinstance(t, str) and t.strip()]
    texts = texts[: args.limit]
    if not texts:
        print("no texts", file=sys.stderr)
        return 2

    identity = nvidia_smi_query("name,memory.total,driver_version")
    print(f"GPU        {identity[0] if identity else 'UNKNOWN'}")
    print(f"VRAM total {identity[1] + ' MiB' if len(identity) > 1 else 'UNKNOWN'}")
    print(f"driver     {identity[2] if len(identity) > 2 else 'UNKNOWN'}")
    print(f"texts      {len(texts)}  (truncated to {args.max_chars} chars)")
    if psutil is None:
        print("psutil     NOT INSTALLED — CPU utilisation will read null, not zero")
    print("")

    # Sampled BEFORE the session is built. The first draft of this took the
    # reading after the model was already resident and labelled it "idle", which
    # made the model's own ~3 GB invisible and reported a 24 MiB working set —
    # a number that would have sized the batch catastrophically wrong.
    pre = nvidia_smi_query("memory.used")
    pre_load_vram = float(pre[0]) if pre else 0.0

    # require_gpu=True: server.py exits rather than fall back. A silent CPU
    # fallback is the one failure this bench must never report as a slow GPU.
    embedder = Embedder(require_gpu=True)
    providers = embedder.session.get_providers()
    print(f"providers  {providers}")
    if "CUDAExecutionProvider" not in providers:
        print("CUDA did not take the graph", file=sys.stderr)
        return 1

    loaded = nvidia_smi_query("memory.used")
    loaded_vram = float(loaded[0]) if loaded else 0.0

    if args.warmup > 0:
        embedder.embed(texts[: args.warmup])

    sampler = Sampler()
    sampler.start()
    started = time.time()
    vectors, token_counts = embedder.embed(texts)
    elapsed = time.time() - started
    sampler.stop_flag.set()
    sampler.join(timeout=2)

    tokens = int(sum(token_counts))
    chunks_per_s = len(texts) / elapsed
    tokens_per_s = tokens / elapsed

    gpu = summarise(sampler.gpu_util)
    vram = summarise(sampler.vram_used)
    cpu = summarise(sampler.cpu_pct)

    print("")
    print(f"chunks           {len(texts)}")
    print(f"elapsed          {elapsed:.2f}s")
    print(f"chunks/second    {chunks_per_s:.2f}")
    print(f"ms/chunk         {1000 * elapsed / len(texts):.2f}")
    print(f"tokens           {tokens}")
    print(f"tokens/second    {tokens_per_s:.0f}")
    print(f"mean tokens/chunk {tokens / len(texts):.1f}")
    print("")
    print(f"GPU utilisation  mean {gpu['mean']}%  peak {gpu['max']}%  ({gpu['n']} samples)")
    print(
        f"VRAM             {pre_load_vram:.0f} MiB before load"
        f"  -> {loaded_vram:.0f} MiB model resident"
        f"  -> {vram['max']} MiB peak under inference"
    )
    print(f"  model weights  ~{loaded_vram - pre_load_vram:.0f} MiB")
    print(f"  inference working set ~{(vram['max'] or loaded_vram) - loaded_vram:.0f} MiB")
    print(f"process CPU      mean {cpu['mean']}%  peak {cpu['max']}%")
    print(f"token_sq_budget  {embedder.token_sq_budget}")
    print(f"vector dims      {len(vectors[0]) if len(vectors) else 'n/a'}")

    # A registered provider is not a busy GPU. If utilisation never moved, the
    # graph is on CUDA and the work is not, and reporting throughput without
    # saying so would size a pilot on a number that cannot scale.
    gpu_worked = (gpu["max"] or 0) > 5
    if not gpu_worked:
        print("")
        print("GPU UTILISATION NEVER ROSE ABOVE 5% — the graph is on CUDA but the work is not.")

    if args.json:
        Path(args.json).write_text(
            json.dumps(
                {
                    "kind": "new1_gpu_embed_bench",
                    "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "gpu": {
                        "name": identity[0] if identity else None,
                        "vramTotalMiB": identity[1] if len(identity) > 1 else None,
                        "driver": identity[2] if len(identity) > 2 else None,
                    },
                    "providers": providers,
                    "model": "BGE-M3 (Xenova/bge-m3) onnx fp32, CLS-pooled, L2-normalised",
                    "tokenSqBudget": embedder.token_sq_budget,
                    "chunks": len(texts),
                    "maxChars": args.max_chars,
                    "elapsedSeconds": round(elapsed, 3),
                    "chunksPerSecond": round(chunks_per_s, 3),
                    "msPerChunk": round(1000 * elapsed / len(texts), 3),
                    "tokens": tokens,
                    "tokensPerSecond": round(tokens_per_s, 1),
                    "meanTokensPerChunk": round(tokens / len(texts), 1),
                    "gpuUtilisationPct": gpu,
                    "vramUsedMiB": vram,
                    "vramBeforeLoadMiB": pre_load_vram,
                    "vramModelResidentMiB": loaded_vram,
                    "vramModelWeightsMiB": round(loaded_vram - pre_load_vram, 1),
                    "vramInferenceWorkingSetMiB": round((vram["max"] or loaded_vram) - loaded_vram, 1),
                    "processCpuPct": cpu,
                    "psutilAvailable": psutil is not None,
                    "gpuObservedWorking": gpu_worked,
                    "textSource": args.texts,
                    "note": "texts read from a file, never the database — the box's CPU is saturated by the ingest fleet and a DB read would measure contention",
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"\nwrote {args.json}")

    return 0 if gpu_worked else 1


if __name__ == "__main__":
    raise SystemExit(main())
