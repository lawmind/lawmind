# CX1 Selector Runner

Generated: **2026-08-17T14:21:22.656Z**

Status: **dry_run_blocked**

Task: `cx1-devanagari-selector-run`

Mode: **dry-run**

Gate: **MEDIUM_CLEAN**

## Command

```powershell
node scripts\migration\pg-local.mjs psql -t -A -X -q -f docs\ai\cx1-devanagari-results\scale-validation-selector.sql
```

SQL: `docs/ai/cx1-devanagari-results/scale-validation-selector.sql`

## Outcome

Executed: **no**

Exit code: **n/a**

Refusal reasons:
- queue says task is not runnable: PostgreSQL active backends=2; oldest transaction=378s; RAM free 18.9%

## Boundary

This runner executes only queue-cleared MEDIUM_CLEAN read-only selector SQL through pg-local psql. It never writes outside docs/ai/cx1-selector-results and never runs PDF/OCR, vector, HNSW, Gold, schema, or production mutation commands.
