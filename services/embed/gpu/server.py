"""
GPU embedding sidecar for the one-time corpus embed.

Why a sidecar rather than a Python reimplementation of the whole job: the chunker,
the text-quality scorer, the recent-first ordering and the resumable
one-transaction-per-judgment write in `services/embed/src/` are validated and
tested (63 tests green, 1,000-judgment chunking sample clean). Reimplementing any
of them in Python would risk exactly the silent divergence this sprint has already
been bitten by. So Node keeps orchestrating and only the matrix multiply moves to
the GPU.

Contract, deliberately narrow:

    POST /embed  {"texts": ["...", ...]}
      -> {"vectors": [[1024 floats], ...], "tokenCounts": [int, ...]}

Vectors come back CLS-pooled and L2-normalised, matching
`services/embed/src/embed.ts`. That equivalence is not assumed — verify it with
`scripts/verify_gpu.py` before any bulk run.

dtype is fp32 and that is load-bearing, not a default. See the note at the dtype
in `embed.ts`: q8 vectors depend on batch composition AND on which CPU computed
them (~0.977 cosine either way), so a corpus embedded here could not serve queries
embedded on Railway. fp32 is stable across both.

Run:
    python services/embed/gpu/server.py --port 8799
"""

from __future__ import annotations

import argparse
import json
import os
import site
import socket
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
MODEL_DIR = REPO_ROOT / ".models" / "Xenova" / "bge-m3"
EMBEDDING_DIMENSIONS = 1024


def _add_cuda_dlls() -> None:
    """The nvidia-*-cu12 wheels put their DLLs somewhere Windows will not look.

    Without this, onnxruntime falls back to CPU *silently*, which would turn a
    one-hour job into a month-long one with no error to notice.

    Both mechanisms are needed and neither is redundant. `add_dll_directory`
    covers a direct ctypes load, but onnxruntime resolves its provider library
    through its own loader, which only consults PATH — with add_dll_directory
    alone the provider DLL loads by hand yet the session still quietly falls back
    to CPU. Verified on this machine, in that order.
    """
    if os.name != "nt":
        return
    found: list[str] = []
    roots = [Path(p) / "nvidia" for p in site.getsitepackages() + [site.getusersitepackages()]]
    for root in roots:
        if not root.is_dir():
            continue
        for sub in sorted(root.iterdir()):
            for bindir in (sub / "bin", sub / "lib"):
                if bindir.is_dir() and any(bindir.glob("*.dll")):
                    os.add_dll_directory(str(bindir))
                    found.append(str(bindir))
    if found:
        os.environ["PATH"] = os.pathsep.join(found) + os.pathsep + os.environ.get("PATH", "")


_add_cuda_dlls()

import numpy as np  # noqa: E402
import onnxruntime as ort  # noqa: E402
from tokenizers import Tokenizer  # noqa: E402


class Embedder:
    def __init__(self, *, require_gpu: bool = True, use_tf32: bool = False) -> None:
        model_path = MODEL_DIR / "onnx" / "model.onnx"
        if not model_path.exists():
            sys.exit(f"missing {model_path} — download model.onnx and model.onnx_data first")

        tok_path = MODEL_DIR / "tokenizer.json"
        if not tok_path.exists():
            sys.exit(f"missing {tok_path}")
        self.tokenizer = Tokenizer.from_file(str(tok_path))

        # use_tf32=0 is load-bearing. On Ampere and later, cuBLAS runs "fp32"
        # matmuls in TensorFloat-32 by default: 10 mantissa bits, not 23. That is
        # invisible until you compare against a CPU that used real fp32 — measured
        # here, TF32 put 1 chunk in 48 at 0.9988 against the Railway reference,
        # while true fp32 holds every chunk above 0.9999. The corpus has to be
        # comparable to query vectors computed on that CPU, so the speed is not
        # worth the drift.
        cuda_opts = {"device_id": 0, "use_tf32": 1 if use_tf32 else 0}
        providers = (
            [("CUDAExecutionProvider", cuda_opts), "CPUExecutionProvider"]
            if require_gpu
            else ["CPUExecutionProvider"]
        )
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        started = time.time()
        self.session = ort.InferenceSession(str(model_path), sess_options=opts, providers=providers)
        placed = self.session.get_providers()
        print(f"model loaded in {time.time() - started:.1f}s, providers={placed}", flush=True)

        if require_gpu and "CUDAExecutionProvider" not in placed:
            sys.exit(
                "CUDAExecutionProvider did not take the graph — refusing to run on CPU.\n"
                "A silent CPU fallback here is a month-long job wearing an hour's clothes."
            )
        self.inputs = {i.name for i in self.session.get_inputs()}

        # batch * seq^2, the shape of the attention buffer.
        #
        # 2M looks absurdly small (~3 chunks per group at typical length) but it
        # measured fastest on this card, and the curve is flat-to-worse above it:
        #
        #     2.0M -> 37.8 ms/chunk     8.5M -> 40.9      (RTX 4060 Ti, TF32 on)
        #     4.0M -> 40.0              12.0M -> 47.3
        #     6.0M -> 43.0              128-wide -> OOM at a 4.35 GB request
        #
        # An 8 GB 4060 Ti has modest memory bandwidth, so the bigger attention
        # buffers cost more than the extra parallelism returns. On a card with
        # more bandwidth this should be re-swept rather than inherited.
        self.token_sq_budget = int(os.environ.get("EMBED_TOKEN_SQ_BUDGET", 2_000_000))

    def _run_batch(self, encodings: list) -> np.ndarray:
        """One forward pass over an already length-homogeneous group."""
        width = max(len(e.ids) for e in encodings)

        input_ids = np.zeros((len(encodings), width), dtype=np.int64)
        attention = np.zeros((len(encodings), width), dtype=np.int64)
        for row, enc in enumerate(encodings):
            n = len(enc.ids)
            input_ids[row, :n] = enc.ids
            attention[row, :n] = 1

        feeds = {"input_ids": input_ids, "attention_mask": attention}
        if "token_type_ids" in self.inputs:
            feeds["token_type_ids"] = np.zeros_like(input_ids)
        feeds = {k: v for k, v in feeds.items() if k in self.inputs}

        hidden = self.session.run(None, feeds)[0]

        # CLS pooling then L2 normalisation — BGE-M3 dense, and what embed.ts does.
        cls = hidden[:, 0, :].astype(np.float32)
        norms = np.linalg.norm(cls, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        vectors = cls / norms

        if vectors.shape[1] != EMBEDDING_DIMENSIONS:
            raise RuntimeError(f"expected {EMBEDDING_DIMENSIONS} dims, model gave {vectors.shape[1]}")
        return vectors

    def embed(self, texts: list[str]) -> tuple[list[list[float]], list[int]]:
        """Length-bucketed so padding does not dominate.

        Self-attention costs O(seq_len^2) in both time and memory, and a batch is
        padded to its longest member. A mixed batch therefore pays the worst
        sequence's cost for every row: measured here, naively growing the batch
        made throughput *worse* (66 -> 169 -> 395 ms/chunk at 16/32/64) and
        batch=128 asked for a 4.35 GB attention buffer on an 8 GB card.

        So: sort by token length, fill each group under a fixed token^2 budget,
        and restore the caller's order at the end. Order matters — chunk_index and
        token_count are written positionally.

        Batching changes nothing numerically here: with use_tf32=0 the GPU is
        bit-identical between batched and single inference (verified 1.000000000
        across the sample), so this is purely a scheduling decision.
        """
        if not texts:
            return [], []

        encodings = [self.tokenizer.encode(t) for t in texts]
        order = sorted(range(len(texts)), key=lambda i: len(encodings[i].ids))

        groups: list[list[int]] = []
        current: list[int] = []
        for idx in order:
            candidate = current + [idx]
            longest = max(len(encodings[i].ids) for i in candidate)
            # Budget tracks the attention buffer, which is what actually runs out.
            if current and len(candidate) * longest * longest > self.token_sq_budget:
                groups.append(current)
                current = [idx]
            else:
                current = candidate
        if current:
            groups.append(current)

        vectors: list[list[float]] = [[] for _ in texts]
        token_counts = [0] * len(texts)
        for group in groups:
            out = self._run_batch([encodings[i] for i in group])
            for row, idx in enumerate(group):
                vectors[idx] = out[row].tolist()
                # Real token count for this text, never the padded batch width —
                # token_count is NOT NULL and padding would be silently wrong.
                token_counts[idx] = len(encodings[idx].ids)
        return vectors, token_counts


def make_handler(embedder: Embedder):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *_args) -> None:  # quiet; the CLI prints progress
            pass

        def _send(self, code: int, payload: dict) -> None:
            body = json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            if self.path == "/health":
                self._send(200, {"ok": True, "providers": embedder.session.get_providers()})
            else:
                self._send(404, {"ok": False})

        def do_POST(self) -> None:
            if self.path != "/embed":
                self._send(404, {"ok": False})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                texts = json.loads(self.rfile.read(length))["texts"]
                vectors, token_counts = embedder.embed(texts)
                self._send(200, {"vectors": vectors, "tokenCounts": token_counts})
            except Exception as err:  # surface loudly; a silent 500 stalls the run
                print(f"embed failed: {err}", file=sys.stderr, flush=True)
                self._send(500, {"error": str(err)})

    return Handler


class ExclusiveThreadingHTTPServer(ThreadingHTTPServer):
    """A sidecar that REFUSES to start when one is already listening.

    THE DEFAULT WAS SILENTLY LETTING TWO SIDECARS SHARE ONE PORT.

    `http.server.HTTPServer` sets `allow_reuse_address = 1`, and on Windows
    `SO_REUSEADDR` does not mean what it means on Unix. On Unix it only permits
    binding a port stuck in TIME_WAIT. **On Windows it permits binding a port
    that is actively listening**, and the OS then hands new connections to
    whichever socket it likes.

    Observed on this box, 25 Aug 2026, with three sidecars alive at once:

        Listen         pid 21080
        Established    pid 20452   (created 09:03, actively serving the walk)

    Two processes, one port, connections split between them, and nothing
    anywhere reporting a problem. Every "duplicate sidecar" incident in
    `.agents/logs/new1-sidecar-keeper.log` has this at the bottom of it: the
    keeper's restart spawns a replacement, the replacement binds *successfully*
    instead of failing with EADDRINUSE, and the stalled original keeps answering.
    The keeper cannot detect a failure the operating system refuses to report.

    `SO_EXCLUSIVEADDRUSE` is the Windows-specific opposite: it makes the bind
    fail while another socket holds the address. That turns a silent duplicate
    into a loud, immediate crash with a diagnosable message — which is the whole
    point. A second sidecar SHOULD die.

    This is safe for restarts. `SO_EXCLUSIVEADDRUSE` blocks rebinding while
    another socket holds the address; a *listening* socket that closes does not
    enter TIME_WAIT (only established connections do), so a genuine
    kill-then-respawn rebinds immediately.

    On non-Windows the option does not exist and plain `allow_reuse_address =
    False` already gives the desired behaviour.
    """

    # Never inherit HTTPServer's `= 1`.
    allow_reuse_address = False

    def server_bind(self) -> None:
        if sys.platform == "win32":
            # 0x80000000 == SO_EXCLUSIVEADDRUSE. Not exposed by the socket module
            # on every Python build, so it is written out rather than imported.
            exclusive = getattr(socket, "SO_EXCLUSIVEADDRUSE", 0x80000000)
            try:
                self.socket.setsockopt(socket.SOL_SOCKET, exclusive, 1)
            except OSError as err:
                # Do not fail the sidecar over a missing socket option; say so and
                # continue, because a working sidecar without the guard beats no
                # sidecar. But it must be VISIBLE that the guard is off.
                print(
                    f"WARNING: could not set SO_EXCLUSIVEADDRUSE ({err}); "
                    "a duplicate sidecar could bind this port silently",
                    file=sys.stderr,
                    flush=True,
                )
        try:
            super().server_bind()
        except OSError as err:
            print(
                f"FATAL: port {self.server_address[1]} is already held by another sidecar ({err}). "
                "Refusing to start a duplicate. Kill the existing sidecar first — "
                "this refusal is deliberate and replaces the silent port-sharing "
                "that produced three concurrent sidecars on 25 Aug 2026.",
                file=sys.stderr,
                flush=True,
            )
            raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8799)
    parser.add_argument("--cpu", action="store_true", help="force CPU, for A/B verification only")
    parser.add_argument(
        "--tf32",
        action="store_true",
        help="allow TensorFloat-32 (faster, 10 mantissa bits). Only with a passing verify.py run.",
    )
    args = parser.parse_args()

    embedder = Embedder(require_gpu=not args.cpu, use_tf32=args.tf32)
    server = ExclusiveThreadingHTTPServer(("127.0.0.1", args.port), make_handler(embedder))
    print(f"listening on http://127.0.0.1:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
