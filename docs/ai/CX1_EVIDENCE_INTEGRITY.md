# CX1 Evidence Integrity

Generated: **2026-08-17T16:10:15.467Z**

Status: **pass**

## Summary

| Signal | Value |
|---|---:|
| Registry experiments | 28 |
| Queue tasks | 16 |
| Manifest files | 120 |
| JSON files parsed | 40 |
| SQL files scanned | 7 |
| Fail findings | 0 |
| Warn findings | 0 |
| Info findings | 17 |

## Findings

| Severity | Area | Message | Detail |
|---|---|---|---|
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-classification-audit/residue-projection.csv |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-corpus-census/metadata-coverage.csv |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-devanagari-results/sample-manifest.json |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-embedding-eligibility/population-scenarios.csv |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-hardware-proof/run-20260816-033249/hardware-report.json |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-hardware-proof/run-20260816-033302/hardware-report.json |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-hardware-proof/run-20260816-033316/hardware-report.json |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-legal-object-efficiency/kind-risk.csv |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-legal-object-efficiency/task-summary.csv |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-parquet-proof/run-20260816-033152/benchmark-report.json |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-parquet-proof/run-20260816-035605-v2/benchmark-report.json |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-runner-results/citation-graph-census-runner.json |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-runner-results/premium-backend-lab-runner.json |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-runner-results/refusal-smoke.json |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-runner-results/retrieval-matrix-runner.json |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-runner-results/selector-smoke-runner.json |
| info | manifest | CX1 evidence file is not directly referenced by registry or queue | path=docs/ai/cx1-vector-results/hnsw-parameter-matrix.csv |

## Boundary

This audit is offline. It reads and hashes CX1 files, parses JSON, performs lexical SQL scans, and writes evidence under `docs/ai`. It does not query PostgreSQL, fetch PDFs, run OCR, copy vectors, build indexes, call a model, or modify production state.

## Manifest

- `docs/ai/cx1-evidence-integrity/artifact-manifest.json`
- `docs/ai/cx1-evidence-integrity/artifact-manifest.csv`
