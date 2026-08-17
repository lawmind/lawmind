# CX1 Run Queue

Generated: **2026-08-17T14:21:41.827Z**

## Scheduler

Current max class: **MEDIUM**

| Signal | Value |
|---|---:|
| CPU | 32.2% |
| RAM free | 21.7% |
| PostgreSQL active backends | 2 |
| PostgreSQL oldest transaction | 396s |

## Queue

| Task | Workstream | Gate | Runnable now | Status | Reason |
|---|---|---|---|---|---|
| `cx1-validate-light-artifacts` | M | LIGHT | yes | ready | LIGHT gate allows offline validation |
| `cx1-citation-graph-census-refresh` | J | LIGHT | yes | prepared_not_run | LIGHT gate allows offline validation |
| `cx1-premium-backend-lab-refresh` | K | LIGHT | yes | complete_sample | LIGHT gate allows offline validation |
| `cx1-retrieval-matrix-refresh` | E | LIGHT | yes | prepared_not_run | LIGHT gate allows offline validation |
| `cx1-selector-runner-smoke` | M | LIGHT | yes | active | LIGHT gate allows offline validation |
| `cx1-disaster-recovery-drill-refresh` | L | LIGHT | yes | prepared_not_run | LIGHT gate allows offline validation |
| `cx1-final-packet-refresh` | M | LIGHT | yes | active | LIGHT gate allows offline validation |
| `cx1-db-sample-census-run` | A/B | MEDIUM_CLEAN | no | prepared_not_run | PostgreSQL active backends=2; oldest transaction=396s; RAM free 21.7% |
| `cx1-devanagari-selector-run` | F | MEDIUM_CLEAN | no | prepared_not_run | PostgreSQL active backends=2; oldest transaction=396s; RAM free 21.7% |
| `cx1-classification-selector-run` | H | MEDIUM_CLEAN | no | prepared_not_run | PostgreSQL active backends=2; oldest transaction=396s; RAM free 21.7% |
| `cx1-legal-object-efficiency-selector-run` | I | MEDIUM_CLEAN | no | prepared_not_run | PostgreSQL active backends=2; oldest transaction=396s; RAM free 21.7% |
| `cx1-citation-graph-selector-run` | J | MEDIUM_CLEAN | no | prepared_not_run | PostgreSQL active backends=2; oldest transaction=396s; RAM free 21.7% |
| `cx1-hnsw-d0-plan-run` | D | VECTOR_EXCLUSIVE | no | prepared_not_run | scheduler maxClass is MEDIUM; PostgreSQL active backends=2; RAM free 21.7% |
| `cx1-halfvec-c3-ann-recall` | C | VECTOR_EXCLUSIVE | no | complete_sample | scheduler maxClass is MEDIUM; PostgreSQL active backends=2; RAM free 21.7% |
| `cx1-silver-real-replay-plan` | G | MEDIUM_CLEAN | no | complete_sample | PostgreSQL active backends=2; oldest transaction=396s; RAM free 21.7% |
| `cx1-disaster-recovery-drill-run` | L | HEAVY | no | prepared_not_run | scheduler maxClass is MEDIUM; PostgreSQL active backends=2; oldest transaction=396s; RAM free 21.7% |

## Next Safe Command

Task: `cx1-validate-light-artifacts`

```powershell
node --check scripts\cx1-heavy-lab-runner.mjs scripts\cx1-db-sample-census.mjs scripts\cx1-devanagari-scale-plan.mjs scripts\cx1-hnsw-parameter-plan.mjs scripts\cx1-run-queue.mjs scripts\cx1-document-classification-audit.mjs scripts\cx1-legal-object-efficiency.mjs scripts\cx1-evidence-integrity.mjs scripts\cx1-selector-runner.mjs scripts\cx1-selector-runner-smoke.mjs scripts\cx1-retrieval-matrix.mjs scripts\cx1-citation-graph-census.mjs scripts\cx1-premium-backend-lab.mjs scripts\cx1-disaster-recovery-drill.mjs scripts\cx1-heavy-lab-final.mjs scripts\cx1-preflight.mjs scripts\cx1-gated-runner.mjs scripts\cx1-gated-runner-smoke.mjs
```

## Boundaries

- This queue is an observer/planner artifact; it launches nothing.
- Live DB, PDF/OCR, vector-copy, and HNSW work remain gated by scheduler state.
- No queue item promotes halfvec, OCR text, Gold data, or production schema.
