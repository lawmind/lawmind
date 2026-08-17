# CX1 DB Sample Census

Generated: **2026-08-17T12:36:38.132Z**

## Scope

This is a read-only sampled database census harness for CX1 Workstreams A and B. It measures text length, citation density, chunk/vector coverage, enrichment coverage, class slices, and court/year slices from a bounded `judgments TABLESAMPLE SYSTEM` population.

The harness writes only docs/report artifacts. It does not modify database rows, indexes, Gold data, retrieval behavior, or citation verification behavior.

## Run State

Mode: **prepared_not_run**

| Control | Value |
|---|---:|
| TABLESAMPLE SYSTEM percent | 0.25 |
| Limit | 20,000 |
| Repeatable seed | 170817 |

Machine artifacts:

- `docs/ai/cx1-db-sample-census/sample-census.sql`
- `docs/ai/cx1-db-sample-census/sample-census-plan.json`

## Prepared SQL

The SQL is prepared but intentionally not run in this checkpoint. Run only after `node scripts/cx1-heavy-lab-runner.mjs recommend` reports a clean MEDIUM or better window with no competing lane readers.

## Caveats

- `TABLESAMPLE SYSTEM` samples blocks, not uniformly random rows.
- Citation sentinel rows are counted separately and excluded from real-citation density.
- The Devanagari detector is a Unicode range screen, not OCR quality proof.
- This is a measurement harness, not a promotion decision.
