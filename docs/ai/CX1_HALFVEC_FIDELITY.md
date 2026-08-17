# CX1 Halfvec Fidelity

Generated: **2026-08-17T12:21:42Z**

Status: **measured on copied vectors only**

Verdict candidate: **NO_MEASURABLE_DEGRADATION**

NEW1 owns the final quality decision. This report isolates representation loss; it does not approve production halfvec.

## C1 Distance Distortion

Pairs: **100000**

| Metric | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|
| absolute error | 0.00000763 | 0.00002235 | 0.00002980 | 0.00005448 |
| relative error | 0.00001575 | 0.00004576 | 0.00006063 | 1.00000000 |

## C2 Exact Nearest-Neighbour Overlap

| k | mean overlap | p50 overlap | p05 overlap | first-result disagreement | mean rank correlation |
|---:|---:|---:|---:|---:|---:|
| 5 | 0.9990 | 1.0000 | 1.0000 | 0.0000 | 1.0000 |
| 10 | 0.9995 | 1.0000 | 1.0000 | 0.0000 | 0.9999 |
| 20 | 1.0000 | 1.0000 | 1.0000 | 0.0000 | 1.0000 |
| 50 | 0.9998 | 1.0000 | 1.0000 | 0.0000 | 1.0000 |

## Machine Output

- `docs/ai/cx1-vector-results/halfvec-fidelity.json`

Copied vector payload was removed after the run.
