# CX1 Gated Runner

Generated: **2026-08-17T14:18:29.784Z**

Status: **refused**

Task: `cx1-db-sample-census-run`

Gate: **MEDIUM_CLEAN**

## Command

```powershell
node scripts\cx1-db-sample-census.mjs --run --sample-percent 0.25 --limit 20000 --seed 170817
```

## Outcome

Exit code: **n/a**

Refusal reasons:
- queue says task is not runnable: PostgreSQL active backends=2; oldest transaction=204s; RAM free 22.7%
- runner only executes LIGHT tasks; task gate is MEDIUM_CLEAN
- task is not in the LIGHT execution allowlist

## Boundary

This runner only executes queue-approved LIGHT tasks. It does not execute DB, PDF/OCR, vector-copy, HNSW, Gold, retrieval, or production-schema commands.
