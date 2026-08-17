# CX1 Selector Runner

Generated: **2026-08-17T14:21:24.504Z**

Status: **refused**

Task: `cx1-validate-light-artifacts`

Mode: **execute**

Gate: **LIGHT**

## Command

```powershell
node --check scripts\cx1-heavy-lab-runner.mjs scripts\cx1-db-sample-census.mjs scripts\cx1-devanagari-scale-plan.mjs scripts\cx1-hnsw-parameter-plan.mjs scripts\cx1-run-queue.mjs scripts\cx1-document-classification-audit.mjs scripts\cx1-legal-object-efficiency.mjs scripts\cx1-evidence-integrity.mjs scripts\cx1-selector-runner.mjs scripts\cx1-selector-runner-smoke.mjs scripts\cx1-retrieval-matrix.mjs scripts\cx1-citation-graph-census.mjs scripts\cx1-premium-backend-lab.mjs scripts\cx1-disaster-recovery-drill.mjs scripts\cx1-heavy-lab-final.mjs scripts\cx1-preflight.mjs scripts\cx1-gated-runner.mjs scripts\cx1-gated-runner-smoke.mjs
```

## Outcome

Executed: **no**

Exit code: **n/a**

Refusal reasons:
- selector runner only executes MEDIUM_CLEAN tasks; task gate is LIGHT
- task command is not an allowed pg-local psql selector shape

## Boundary

This runner executes only queue-cleared MEDIUM_CLEAN read-only selector SQL through pg-local psql. It never writes outside docs/ai/cx1-selector-results and never runs PDF/OCR, vector, HNSW, Gold, schema, or production mutation commands.
