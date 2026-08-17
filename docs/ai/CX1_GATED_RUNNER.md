# CX1 Gated Runner

Generated: **2026-08-17T14:21:35.031Z**

Status: **pass**

Task: `cx1-validate-light-artifacts`

Gate: **LIGHT**

## Command

```powershell
node --check scripts\cx1-heavy-lab-runner.mjs scripts\cx1-db-sample-census.mjs scripts\cx1-devanagari-scale-plan.mjs scripts\cx1-hnsw-parameter-plan.mjs scripts\cx1-run-queue.mjs scripts\cx1-document-classification-audit.mjs scripts\cx1-legal-object-efficiency.mjs scripts\cx1-evidence-integrity.mjs scripts\cx1-selector-runner.mjs scripts\cx1-selector-runner-smoke.mjs scripts\cx1-retrieval-matrix.mjs scripts\cx1-citation-graph-census.mjs scripts\cx1-premium-backend-lab.mjs scripts\cx1-disaster-recovery-drill.mjs scripts\cx1-heavy-lab-final.mjs scripts\cx1-preflight.mjs scripts\cx1-gated-runner.mjs scripts\cx1-gated-runner-smoke.mjs
```

## Outcome

Exit code: **0**

## Boundary

This runner only executes queue-approved LIGHT tasks. It does not execute DB, PDF/OCR, vector-copy, HNSW, Gold, retrieval, or production-schema commands.
