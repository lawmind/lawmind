# CX1 Document Classification Audit

Generated: **2026-08-17T13:06:58.785Z**

Status: **offline_audit_complete**

## Boundary

offline only: no PostgreSQL query, no PDF fetch, no OCR, no model call, no production classifier edit

This is Workstream H evidence for a backlog. It does not relabel any row and does not decide legal authority.

## Inputs

- sample: `docs/ai/new2-silver-proof/hc-class-sample-20260817.json`
- corpusCensus: `docs/ai/cx1-corpus-census/metadata-coverage.json`
- mobileOrderTypes: `docs/HC_ORDER_TYPES.json`
- classifierSource: `services/ingest/src/hc-classify.ts`
- adjudicationSource: `services/ingest/src/hc-adjudicate.ts`

## Measured Base

Plain High Court source documents: **19,237,684** (93.7% of combined HC source universe).
Mobile source documents: **1,291,519** (6.3%); mobile order-type labels are disjoint and must not be treated as a corpus-wide judgment-share estimate.

| Class | Sample n | Sample share | Plain-source projection | Mean chars |
|---|---:|---:|---:|---:|
| `unclassified` | 89 | 44.5% | 8,560,769 | 8,204 |
| `decided` | 36 | 18.0% | 3,462,783 | 21,053 |
| `procedural_disposal` | 34 | 17.0% | 3,270,406 | 1,421 |
| `bail_order` | 25 | 12.5% | 2,404,711 | 6,047 |
| `decided_brief` | 11 | 5.5% | 1,058,073 | 981 |
| `reference_stub` | 5 | 2.5% | 480,942 | 436 |

## Residue Projection

The sample's unclassified residue is **44.5%** of the plain variant, projecting to roughly **8,560,769** plain-source documents if the sample rate held. This is indicative, not a corpus rate: the 200 documents were spread-selected, not randomly sampled.

| Residue method | Sample n | Sample share | Plain-source projection |
|---|---:|---:|---:|
| `unclassified_disposal:DISPOSED OFF` | 65 | 32.5% | 6,252,247 |
| `unclassified_disposal:DISPOSED OF` | 11 | 5.5% | 1,058,073 |
| `unclassified_disposal:CLOSED` | 10 | 5.0% | 961,884 |
| `unclassified_disposal:DISPOSED` | 3 | 1.5% | 288,565 |

Result: all sample unclassified rows are accounted for by the `DISPOSED*` / `CLOSED` family. That confirms the existing refusal is a designed ambiguity boundary, not a vocabulary miss in this sample.

## Held-Corpus Context

The owner-lane adjudication source records a held-corpus difficult subset of about **1,720,000** rows, dominated by:

| Disposal value | Held rows |
|---|---:|
| `DISPOSED OFF` | 687,076 |
| `DISPOSED OF` | 497,294 |
| `DISPOSED` | 227,304 |
| `DISPOSED OF NO COSTS` | 115,541 |
| `CLOSED` | 54,241 |
| `ORDERED` | 34,422 |

The 40-document model pilot span-verified 31/40 and found 7/40 quoted spans not present in the source. Conclusion stays: **candidate generator with mandatory span verification only**, never autonomous classification.

## Backlog

| ID | Owner | Status | Gate | Action |
|---|---|---|---|---|
| H1 | CX1 | complete_plan | LIGHT completed; selector execution remains MEDIUM_CLEAN | Larger stratified sample plan prepared for DISPOSED*/CLOSED/ORDERED residue by court, year, length band, citation density, and script defect risk. |
| H2 | CX1 | prepared_not_run | MEDIUM_CLEAN | Run read-only selector once DB pressure clears and write candidate sample rows to disposable CX1 JSONL. |
| H3 | LCC/NEW2 | not_cx1_canonical_change | owner decision | If a larger CX1 sample confirms value, decide whether a candidate table/migration is worth building; model output remains span-verified candidate evidence only. |

## Not Safe To Promote

- Do not map `DISPOSED`, `DISPOSED OFF`, `DISPOSED OF`, `CLOSED`, or `ORDERED` directly to `decided`.
- Do not quote mobile `order_type` judgment-share ranges as plain-variant or corpus-wide authority shares.
- Do not promote model labels without source-span verification and owner-lane review.

## Machine Outputs

- `docs/ai/cx1-classification-audit/classification-audit.json`
- `docs/ai/cx1-classification-audit/sample-plan.json`
- `docs/ai/cx1-classification-audit/residue-projection.csv`
- `docs/ai/cx1-classification-audit/sample-selector.sql`
