# HALFVEC C3/C4 — VERDICT CRITERIA, DECLARED BEFORE THE FULL RUN

Written 19 Aug 2026 at 13:40 UTC, while the 283-query run was at query 20 of 283
and only the 5-query pilot had reported. Recorded separately and first, because a
threshold chosen after seeing the result is not a threshold.

## The three arms

| arm | what it is |
| --- | --- |
| `EXACT_FP32` | ground truth. `new1_fp32_probe`, index scans disabled. |
| `HNSW_FP32` | the production index (`m=16, ef_construction=64`), unchanged. |
| `HNSW_HALFVEC` | `new1_halfvec_probe`, identical HNSW parameters. |

`HNSW_FP32` is the incumbent, not `EXACT_FP32`. The decision is *"can halfvec
replace what production runs today"*, so halfvec is judged against the fp32 GRAPH,
and the exact arm exists to say how much of any gap is the graph rather than the
representation.

## The verdict

**`HALFVEC_TASK_FIDELITY_PASS`** requires ALL of:

1. ANN recall@5, @10 and @20 against `EXACT_FP32` within **1 percentage point** of
   `HNSW_FP32`'s, and not below **0.98** in absolute terms.
2. End-task `success@5` and `recall@20` differing from `HNSW_FP32` by at most
   **one query** (0.35 pts on n=283), with McNemar exact **p > 0.05**.
3. Net gold-rank movement against `HNSW_FP32` not negative beyond noise:
   `lostFromTop5 - gainedIntoTop5 <= 1`.
4. Judgment-level candidate overlap with `EXACT_FP32` at k=20 within **2 points**
   of `HNSW_FP32`'s.

**`HALFVEC_TASK_FIDELITY_WARN`**: task metrics hold (2 and 3 pass) but an ANN-layer
criterion (1 or 4) fails — the representation is task-safe at the depths the
advocate sees, and lossy deeper in the candidate pool. Shippable only with the
candidate-depth number attached, because a deeper rerank would be reading the
degraded part.

**`HALFVEC_TASK_FIDELITY_FAIL`**: any end-task criterion fails — McNemar
p <= 0.05 against `HNSW_FP32`, or more than one query's worth of success@5 or
recall@20 lost, or net top-5 loss > 1.

## What no verdict here can mean

The population is the 620,300 existing chunk vectors, all Supreme Court plus a
few thousand HC. A PASS is a statement about **this** index at **this** scale. The
Tier-A population is a different distribution (document-level HEAD vectors, all
courts) and the verdict does not transfer to it without re-measurement — which is
cheap, because the same probe runs against any table.

Latency is recorded but is NOT a criterion. The box carries NEW2's ingest fleet
(25 processes) throughout, so per-query timings are contended and comparing them
across arms measures the box as much as the index.
