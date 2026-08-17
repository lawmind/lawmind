# CX1 Preflight

Generated: **2026-08-17T14:22:23.316Z**

Status: **pass**

## Checks

| Check | Status | Detail |
|---|---|---|
| node-syntax | pass | node --check scripts/cx1-heavy-lab-runner.mjs scripts/cx1-corpus-census.mjs scripts/cx1-embedding-eligibility-census.mjs scripts/cx1-db-sample-census.mjs scripts/cx1-devanagari-scale-plan.mjs scripts/cx1-hnsw-parameter-plan.mjs scripts/cx1-run-queue.mjs scripts/cx1-document-classification-audit.mjs scripts/cx1-legal-object-efficiency.mjs scripts/cx1-evidence-integrity.mjs scripts/cx1-selector-runner.mjs scripts/cx1-selector-runner-smoke.mjs scripts/cx1-retrieval-matrix.mjs scripts/cx1-citation-graph-census.mjs scripts/cx1-premium-backend-lab.mjs scripts/cx1-disaster-recovery-drill.mjs scripts/cx1-heavy-lab-final.mjs scripts/cx1-preflight.mjs scripts/cx1-gated-runner.mjs scripts/cx1-gated-runner-smoke.mjs |
| python-compile | pass | C:\lawmind\cx1-lab\venv\Scripts\python.exe -m py_compile scripts/cx1-halfvec-fidelity.py scripts/cx1_silver_lib.py scripts/cx1-silver-writer.py scripts/cx1-silver-compact.py scripts/cx1-silver-smoke.py scripts/cx1-silver-failure-smoke.py |
| json-parse | pass | 26/26 JSON files parsed |
| sql-readonly-scan | pass | 7/7 SQL files passed lexical read-only scan |
| registry-references | pass | 81/81 registry references exist |
| run-queue-gates | pass | next cx1-validate-light-artifacts; scheduler MEDIUM |
| lab-path-fences | pass | 3/3 lab fence checks passed |

## Boundary

This preflight is offline. It does not query PostgreSQL, fetch PDFs, run OCR, copy vectors, build HNSW indexes, or modify canonical production state.

## Caveats

- SQL read-only validation is lexical and conservative; live execution remains scheduler-gated.
- Registry reference existence proves files exist, not that completed measurements cover broader claims.
