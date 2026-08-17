# CX1 HNSW Parameter Lab

Generated: **2026-08-17T12:44:28.804Z**

## Scope

This is a prepared HNSW parameter lab plan. It reads existing vector capacity and halfvec fidelity artifacts only. It does not connect to PostgreSQL, copy vectors, build indexes, or run retrieval.

## Current Evidence

Existing non-null vectors: **620,300** on pgvector **0.8.5**.

| Representation | Table+TOAST/vector | HNSW/vector at m=16 | Combined/vector | 600k build at m=16/efc=64 | 600k p50/p95 at ef=40 |
|---|---:|---:|---:|---:|---:|
| fp32 | 5.47 KiB | 7.99 KiB | 13.46 KiB | 403.253s | 6.617/11.2 ms |
| halfvec | 2.78 KiB | 2.66 KiB | 5.44 KiB | 80.3s | 5.754/9.804 ms |

Halfvec C1/C2 fidelity candidate: **NO_MEASURABLE_DEGRADATION** on **5,000** copied vectors; p99 absolute distance error **0.000029802322387695312**, top-10 exact overlap **0.9995**. C3 ANN recall and C4 NEW1 gold are still unmeasured.

## Prepared Matrix

Matrix rows: **270**. Priority frontier rows for D0/D1: **20**. Priority frontier rows for D2: **16**.

| Phase | Purpose | Rows |
|---|---|---:|
| D0 | Validate harness on 100k rows with baseline m=16/ef_construction=64 and ef_search sweep. | 10 |
| D1 | Measure fp32 vs halfvec ANN recall and latency on 300k rows for the priority frontier. | 10 |
| D2 | Repeat only promising frontier candidates at 600k rows. | 16 |
| D3 | Run NEW1 retrieval-gold impact only after ANN recall and scheduler gates pass. | 0 |

## Machine Outputs

- `docs/ai/cx1-vector-results/hnsw-parameter-plan.json`
- `docs/ai/cx1-vector-results/hnsw-parameter-matrix.csv`

## Run Gate

Run only when the CX1 scheduler reports `VECTOR_EXCLUSIVE`. Build one HNSW index at a time in a disposable lab cluster, compute exact neighbours from the same copied population, remove copied payloads after the run, and do not promote halfvec or parameter changes without NEW1 quality approval.

## Caveats

- heuristicHnswBytesPerVector scales measured m=16 bytes linearly by m/16; it is a planning prior, not evidence.
- Existing timing measurements are not monotonic across scale; no build-time extrapolation is made.
- Halfvec is not production-approved by this plan. C1/C2 was exact vector fidelity only; C3 ANN recall and C4 gold remain unmeasured.
