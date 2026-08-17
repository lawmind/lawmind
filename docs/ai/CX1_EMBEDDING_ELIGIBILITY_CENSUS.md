# CX1 Embedding Eligibility Census

Generated: **2026-08-17T12:20:41.911Z**

## Boundary

This is a phase-1 population and storage model. It generates **no embeddings**, performs **no database read**, and makes **no legal-importance decision**.

Every tier below is experimental. NEW1 owns retrieval-quality judgment; NEW2/LCC own classification and promotion into canonical structures.

Supreme Court context: source denominator **38,351**, held **38,342**, gap **9**. The large uncertainty is the High Court/plain corpus, not Supreme Court coverage.

## Inputs

- `docs/ai/cx1-corpus-census/metadata-coverage.json`
- `docs/ai/new2-silver-proof/hc-class-sample-20260817.json`
- `docs/HC_ORDER_TYPES.json`
- `docs/ai/CX1_VECTOR_CAPACITY_BENCHMARK.md`

## Class-Derived Population Estimates

| Class | Sample share | Projected held HC docs if sample applies | Mean chars | Projected text bytes |
|---|---:|---:|---:|---:|
| unclassified | 44.5% | 3,229,688 | 8,204 | 24.68 GiB |
| decided | 18.0% | 1,306,391 | 21,053 | 25.61 GiB |
| procedural_disposal | 17.0% | 1,233,813 | 1,421 | 1.63 GiB |
| bail_order | 12.5% | 907,216 | 6,047 | 5.11 GiB |
| decided_brief | 5.5% | 399,175 | 981 | 373.45 MiB |
| reference_stub | 2.5% | 181,443 | 436 | 75.44 MiB |

These projections apply a 200-document, 20-cell plain-variant sample to the current held HC document count. The sample was chosen for spread, not as a random corpus estimator, so use the direction and order of magnitude, not the last digit.

The `decided` class remains an upper bound on authority share. The `unclassified` residue is the `DISPOSED*` / `CLOSED` family and is triage work, not safe positive or negative truth.

## Provisional Tiers

| Tier | Population | Meaning | Caution |
|---|---:|---|---|
| TIER_A | 1,743,908 | canonical substantive authorities with reliable identity/text | `decided` and `decided_brief` are sample-derived upper bounds on authority; they are not legal weight. |
| TIER_B | not measured | verified legal objects | Population needs document_enrichments task/status counts by task and verification_state; not estimated from document class. |
| TIER_C | not measured | important paragraphs from substantive authorities | Paragraph count and importance signals require sampled paragraph/citation/user-action data; not estimated in phase 1. |
| TIER_D | 2,141,029 | procedural/non-precedential material whose embedding value is uncertain | Bail orders may be practically useful but are not automatically precedential. Procedural disposals are a retrieval-value experiment, not an authority tier. |
| TIER_E | 3,411,131 | exclude/defer | The unclassified residue is model-triage work, not safe exclusion forever; reference stubs are the true hard defer in this phase. |

## Scenarios

| Scenario | Estimated docs | Vectors/doc | Vectors | fp32 combined | halfvec combined |
|---|---:|---:|---:|---:|---:|
| MINIMAL | 1,743,908 | 1 | 1,743,908 | 22.38 GiB | 9.05 GiB |
| BALANCED | 2,651,123 | 1 | 2,651,123 | 34.02 GiB | 13.76 GiB |
| AGGRESSIVE | 5,880,811 | 1 | 5,880,811 | 75.46 GiB | 30.51 GiB |
| BALANCED_PLUS_OBJECTS | 2,651,123 | 4 | 10,604,493 | 136.08 GiB | 55.02 GiB |

Storage uses CX1 measured TOAST-inclusive table plus HNSW costs: **13,778.58 bytes/vector fp32** and **5,571.26 bytes/vector halfvec** at ~600k scale. These are linear estimates, not build-time forecasts.

## What Must Be Measured Next

- paragraph count distribution
- citation-count distribution by class
- existing vector coverage by court/year after migration
- legal-object acceptance rates by task
- verified legal-object population
- duplicate/canonical collapse impact
- language distribution beyond Devanagari character presence proxy

## Machine Outputs

- `docs/ai/cx1-embedding-eligibility/population-scenarios.json`
- `docs/ai/cx1-embedding-eligibility/population-scenarios.csv`
