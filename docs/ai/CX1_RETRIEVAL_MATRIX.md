# CX1 Retrieval Matrix

Generated: **2026-08-17T14:21:24.097Z**

Status: **prepared_with_existing_controlled_summary**

## Boundary

This checkpoint is offline. It reads existing NEW1 harness fixtures, source, logs, and checkpoints; it does not query PostgreSQL, call embeddings, run retrieval, mutate production, edit NEW1 gold, or change ranking code.

## Completed Existing Evidence

The existing `arms-checkpoint.jsonl` contains the full CONTROLLED pass: 283 queries x 3 arms = 849 rows. This is a Supreme Court controlled haystack comparison, not a High Court benchmark and not a halfvec decision.

| Pass | Mode | Queries | success@5 | recall@20 | MRR | nDCG@5 | nDCG@20 |
|---|---|---:|---:|---:|---:|---:|---:|
| CONTROLLED | dense | 283 | 21.6% | 40.6% | 0.151 | 0.152 | 0.207 |
| CONTROLLED | hybrid | 283 | 18.4% | 38.9% | 0.121 | 0.121 | 0.180 |
| CONTROLLED | sparse | 283 | 10.2% | 17.0% | 0.070 | 0.073 | 0.093 |

## Matrix State

| Config | Status | Gate | Command |
|---|---|---|---|
| `E0-controlled-sparse-existing` | complete_existing_checkpoint | none_offline_summary | `not rerun; summarized from arms-checkpoint.jsonl` |
| `E0-controlled-dense-existing` | complete_existing_checkpoint | none_offline_summary | `not rerun; summarized from arms-checkpoint.jsonl` |
| `E0-controlled-hybrid-existing` | complete_existing_checkpoint | none_offline_summary | `not rerun; summarized from arms-checkpoint.jsonl` |
| `E1-uncontrolled-sparse` | prepared_not_run | MEDIUM_CLEAN | `ARMS_PASS=uncontrolled pnpm --filter @lawmind/harness arms` |
| `E1-uncontrolled-dense` | prepared_not_run | MEDIUM_CLEAN | `ARMS_PASS=uncontrolled pnpm --filter @lawmind/harness arms` |
| `E1-uncontrolled-hybrid` | prepared_not_run | MEDIUM_CLEAN | `ARMS_PASS=uncontrolled pnpm --filter @lawmind/harness arms` |
| `E2-halfvec-controlled-dense` | blocked_by_missing_disposable_halfvec_retrieval_runner | VECTOR_EXCLUSIVE | `future: copied/disposable halfvec retrieval runner over frozen 283-query benchmark` |
| `E3-halfvec-controlled-hybrid` | blocked_by_missing_disposable_halfvec_retrieval_runner | VECTOR_EXCLUSIVE | `future: copied/disposable halfvec hybrid retrieval runner over frozen 283-query benchmark` |
| `E4-ef-search-sweep` | blocked_by_hnsw_parameter_lab | VECTOR_EXCLUSIVE | `future: run HNSW finalist ef_search values against frozen retrieval benchmark` |
| `E5-exact-route-probes` | prepared_not_run | MEDIUM_CLEAN | `future: bounded exact citation/title probe set from post-migration-probes.json` |

## KNOW / Not KNOW

- KNOW: the controlled sparse/dense/hybrid checkpoint can be summarized reproducibly from 849 existing rows.
- KNOW: in that controlled Supreme Court pass, dense leads the three existing modes on success@5, recall@20, MRR, and nDCG.
- Not KNOW: uncontrolled production-haystack comparison is not complete in this artifact.
- Not KNOW: fp32-vs-halfvec retrieval impact, HNSW `ef_search` frontier impact, and High Court retrieval quality remain unmeasured here.
- Not safe to claim: Postgres `ts_rank` sparse is BM25. It is not.

## Machine Outputs

- `docs/ai/cx1-retrieval-matrix/matrix-plan.json`
- `docs/ai/cx1-retrieval-matrix/completed-controlled-summary.csv`
- `docs/ai/cx1-retrieval-matrix/planned-configs.csv`

## Next Action

When the queue permits MEDIUM_CLEAN, run only one bounded retrieval command at a time and preserve per-arm checkpoints. When VECTOR_EXCLUSIVE opens, run C3/D disposable vector measurements before any halfvec retrieval arm.
