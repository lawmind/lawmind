# CX1 Heavy Lab Final Packet

Generated: **2026-08-17T14:22:23.107Z**

Status: **CURRENT CHECKPOINT / NOT PRODUCTION PROMOTION APPROVAL**

This is the requested final packet format for the current CX1 shadow-lab state. It is intentionally conservative: several live measurements are still gated by scheduler pressure, so this file separates KNOW-level findings from prepared-but-not-run work. No canonical production state was changed to produce it.

## 1. New KNOW-Level Findings

- HC metadata coverage base: **7,257,726 / 20,529,203 = 35.4%** for High Court scope.
- Halfvec capacity benchmark: fp32 combined footprint **13,778.58 bytes/vector** versus halfvec **5,571.26 bytes/vector** at about 600k vectors.
- Halfvec C1/C2 sample verdict candidate: **NO_MEASURABLE_DEGRADATION**, p99 distance error **0.00002980**, top-10 exact overlap **0.9995**.
- Poppler is unsafe as a Devanagari repair path by itself: the 32-document bake-off dropped all Devanagari tokens.
- Retrieval controlled checkpoint covers **849 rows = 283 queries x 3 arms**; dense leads the controlled sparse/hybrid arms on success@5 and recall@20.
- Legal-object triage covers **4,119** quote claims with **81.9%** verified and **745** rejected.
- Citation graph snapshot inventory records **6** source snapshots and **6** priority regions; sentinel rows are not unresolved citations.
- Premium backend synthetic harness passes observation/timeline/latest-state assertions without touching production schema or UI.
- Evidence integrity currently passes: **120 files**, **40 JSON**, **7 SQL**, **0 fail / 0 warn**.

## 2. Things Disproved

- A 25 MB object download or byte-for-byte file identity is not restore-throughput or recoverability evidence.
- The older 117.88x synthetic compression result is invalid for real Silver capacity planning.
- Poppler cannot be treated as a clean Devanagari fallback when source documents contain Devanagari.
- The plain-variant `DISPOSED*` / `CLOSED` unclassified residue cannot be safely relabelled as `decided` by deterministic assumption.
- Sparse retrieval in the current controlled checkpoint is PostgreSQL `ts_rank`, not BM25.
- Citation count is not legal authority, ranking approval, or citation verification.

## 3. Production Recommendations

- Keep CX1 as a shadow lab: use its artifacts as evidence packets and owner-lane decision inputs, not automatic promotion machinery.
- Treat halfvec as a strong capacity candidate, but require C3 ANN recall and C4 retrieval-gold measurement before production representation change.
- Run prepared `MEDIUM_CLEAN` selectors only when PostgreSQL active readers and RAM pressure clear.
- Keep Silver court-partitioned with year/date sorting and ZSTD 9 as the current measured direction; require real-corpus replay before NEW2 integration.
- Keep `case_structure` held at small scale until prompt/router rework and remeasurement; the other legal-object tasks remain better expansion candidates subject to LCC approval.
- Treat unresolved currentness/treatment citation targets as the highest-value graph cleanup region.

## 4. Things Not Safe To Promote

- OCR text, halfvec representation, HNSW parameters, retrieval arms, classification labels, legal-object routing, citation graph identity, premium schemas, and backup acceptance are not safe to promote from this packet alone.
- Prepared SQL selectors are read-only plans; they are not corpus-current results until executed and captured under the scheduler gate.
- Synthetic premium and Silver failure smokes prove behavior shape only, not production reliability at scale.

## 5. Data-Quality Findings

- High Court held coverage is still partial at 35.4% of the measured HC source universe.
- The 44.5% unclassified plain-variant sample residue is concentrated in `DISPOSED*` / `CLOSED` phrases and needs larger stratified measurement.
- Devanagari-bearing documents need script-retention gates and targeted OCR validation before any text repair promotion.
- Citation denominators must exclude sentinel rows; otherwise unresolved rates are badly distorted.
- The legal-object span verifier is doing real safety work: 745 rejected quote claims and 35 caught fabrications remain important audit signals.

## 6. Embedding Population Scenarios

| Scenario | Documents | Vectors | fp32 Footprint | Halfvec Footprint | Status |
|---|---:|---:|---:|---:|---|
| MINIMAL | 1,743,908 | 1,743,908 | 22.38 GiB | 9.05 GiB | estimated |
| BALANCED | 2,651,123 | 2,651,123 | 34.02 GiB | 13.76 GiB | estimated |
| AGGRESSIVE | 5,880,811 | 5,880,811 | 75.46 GiB | 30.51 GiB | estimated, not recommendation |
| BALANCED_PLUS_OBJECTS | 2,651,123 | 10,604,493 | 136.08 GiB | 55.02 GiB | upper cost envelope |

## 7. fp32 vs Halfvec Verdict Evidence

- Candidate verdict: **NO_MEASURABLE_DEGRADATION** on the C1/C2 copied-vector sample.
- Distance pairs: **100,000**; absolute error p50 **0.00000763**, p95 **0.00002235**, p99 **0.00002980**, max **0.00005448**.
- Exact NN queries: **200**; top-5 overlap **0.9990**, top-10 **0.9995**, first-result disagreement **0**.
- C3 ANN recall and C4 NEW1 gold impact are not measured.

## 8. HNSW Pareto Frontier

- Pareto frontier is **not measured yet**. The current artifact is a staged matrix with **270** prepared parameter rows.
- Baseline production-style settings remain `m=16`, `ef_construction=64`; `ef_search` sweep is prepared but not run.
- Existing comparable observations favor halfvec storage/build cost, but recall under HNSW is the missing gate.

## 9. Retrieval Experiment Matrix

| Arm | Queries | success@5 | recall@20 | MRR | nDCG@20 |
|---|---:|---:|---:|---:|---:|
| CONTROLLED/dense | 283 | 21.6% | 40.6% | 0.151 | 0.207 |
| CONTROLLED/hybrid | 283 | 18.4% | 38.9% | 0.121 | 0.180 |
| CONTROLLED/sparse | 283 | 10.2% | 17.0% | 0.070 | 0.093 |

- Uncontrolled production-haystack, halfvec retrieval, `ef_search` frontier, exact-route probes, and High Court retrieval quality remain not run.

## 10. Devanagari Routing Evidence

- Scale-validation plan status: **prepared_not_run**.
- Planned documents: **148** across **9** strata.
- Proposed route states remain KEEP_PRIMARY, USE_ALTERNATE_EXTRACTOR, OCR_CANDIDATE, and MANUAL/UNRESOLVED.
- OCR citation preservation is not yet proven.

## 11. Silver Production-Readiness Status

- Real Silver benchmark and synthetic writer/compactor smokes are complete.
- Writer idempotence, manifest hashing, lab-path guard, stale-manifest repair, stale-temp cleanup, and outside-lab refusal have sample evidence.
- Real-corpus replay, process-kill crash injection, disk-full handling, corrupted Parquet handling, and 1M+ row scale remain not proven.

## 12. Classification Backlog

- The existing classification audit projects the 44.5% sample residue to a large backlog if the sample rate holds; this is indicative, not a corpus rate.
- Highest value next step is the prepared stratified selector over difficult `DISPOSED*` / `CLOSED` patterns, then false-positive-risk samples before any classifier rule change.
- No production classifier was modified by CX1.

## 13. DeepSeek / Legal-Object Efficiency Opportunities

- Current triage base: **4,119** claims, **3,374** verified, **745** rejected.
- Candidate router: defer or rework `case_structure` before larger expansion; keep holding, arguments, authorities, and topics as better candidates pending owner approval.
- Live token/latency/cost selectors are prepared but not run; `llm_calls` lacks a direct `document_enrichments` foreign key, so cost attribution remains coarse.

## 14. Citation / Graph Gaps

- Snapshot inventory count: **6**; priority regions: **6**.
- P0 regions: sentinel-safe denominators and unresolved overruled/overruled_in_part/doubted targets.
- Prepared selector covers degree distribution, unresolved-key buckets, ambiguous-key buckets, yearless prevalence, parallel aliases, court/year density, high-risk treatments, external gaps, and isolated held authorities.
- Live selector has not run, so corpus-current graph metrics are not KNOW.

## 15. Premium Backend Readiness

- Synthetic fixture observations: **10**.
- The harness proves observation-first projection shape for duplicate collapse, unlinked retention, latest state, hearing trigger, new order, disposal, and conflict candidate behavior.
- Production matcher quality, notification safety, API contract, schema ownership, and real replay remain undecided/unmeasured.

## 16. Remaining Unknowns

- cx1-db-sample-census-run: PostgreSQL active backends=2; oldest transaction=396s; RAM free 21.7%
- cx1-devanagari-selector-run: PostgreSQL active backends=2; oldest transaction=396s; RAM free 21.7%
- cx1-classification-selector-run: PostgreSQL active backends=2; oldest transaction=396s; RAM free 21.7%
- cx1-legal-object-efficiency-selector-run: PostgreSQL active backends=2; oldest transaction=396s; RAM free 21.7%
- cx1-citation-graph-selector-run: PostgreSQL active backends=2; oldest transaction=396s; RAM free 21.7%
- cx1-hnsw-d0-plan-run: scheduler maxClass is MEDIUM; PostgreSQL active backends=2; RAM free 21.7%
- cx1-halfvec-c3-ann-recall: scheduler maxClass is MEDIUM; PostgreSQL active backends=2; RAM free 21.7%
- cx1-silver-real-replay-plan: PostgreSQL active backends=2; oldest transaction=396s; RAM free 21.7%
- cx1-disaster-recovery-drill-run: scheduler maxClass is MEDIUM; PostgreSQL active backends=2; oldest transaction=396s; RAM free 21.7%
- Also not yet measured: C3 ANN recall, C4 NEW1 retrieval gold, live DB sample census, Devanagari selector/OCR preservation, legal-object live cost selectors, citation graph live census, real Silver replay, and full DR restore.

## 17. Exact Handoff By Lane

- LCC: legal-object router evidence, citation graph census plan, premium backend shadow model, disaster-recovery drill checklist.
- NEW1: halfvec C1/C2 evidence, HNSW plan, retrieval matrix summary and prepared arms, embedding population scenarios.
- NEW2: corpus/classification backlog, Devanagari routing plan, Silver writer/compactor prototype and DR/Silver storage implications.
- NEW3: citation/source gap regions only when they imply measured acquisition/source backlog; do not spam intermediate CX1 artifacts.

## 18. Files / Scripts Produced

- cx1-heavy-lab-scheduler-20260817: `scripts/cx1-heavy-lab-runner.mjs`, `docs/ai/CX1_HEAVY_LAB_STATUS.md`
- cx1-run-queue-20260817: `scripts/cx1-run-queue.mjs`, `docs/ai/CX1_RUN_QUEUE.md`, `docs/ai/CX1_RUN_QUEUE.json`
- cx1-preflight-20260817: `scripts/cx1-preflight.mjs`, `docs/ai/CX1_PREFLIGHT.md`, `docs/ai/CX1_PREFLIGHT.json`
- cx1-gated-runner-20260817: `scripts/cx1-gated-runner.mjs`, `docs/ai/CX1_GATED_RUNNER.md`, `docs/ai/CX1_GATED_RUNNER.json`
- cx1-gated-runner-refusal-smoke-20260817: `scripts/cx1-gated-runner-smoke.mjs`, `docs/ai/CX1_GATED_RUNNER_SAFETY.md`, `docs/ai/cx1-runner-results/runner-smoke.json`
- cx1-evidence-integrity-20260817: `scripts/cx1-evidence-integrity.mjs`, `docs/ai/CX1_EVIDENCE_INTEGRITY.md`, `docs/ai/cx1-evidence-integrity/integrity-report.json`
- cx1-selector-runner-20260817: `scripts/cx1-selector-runner.mjs`, `docs/ai/CX1_SELECTOR_RUNNER.md`, `docs/ai/cx1-selector-results/selector-runner-smoke.json`
- cx1-corpus-census-phase1-20260817: `scripts/cx1-corpus-census.mjs`, `docs/ai/CX1_FULL_CORPUS_CENSUS.md`, `docs/ai/cx1-corpus-census/metadata-coverage.json`
- cx1-halfvec-fidelity-harness-20260817: `scripts/cx1-halfvec-fidelity.py`, `docs/ai/CX1_HALFVEC_FIDELITY.md`, `docs/ai/cx1-vector-results/halfvec-fidelity.json`
- cx1-embedding-eligibility-phase1-20260817: `scripts/cx1-embedding-eligibility-census.mjs`, `docs/ai/CX1_EMBEDDING_ELIGIBILITY_CENSUS.md`, `docs/ai/cx1-embedding-eligibility/population-scenarios.json`
- cx1-retrieval-matrix-plan-20260817: `scripts/cx1-retrieval-matrix.mjs`, `docs/ai/CX1_RETRIEVAL_MATRIX.md`, `docs/ai/cx1-retrieval-matrix/matrix-plan.json`
- cx1-db-sample-census-harness-20260817: `scripts/cx1-db-sample-census.mjs`, `docs/ai/CX1_DB_SAMPLE_CENSUS.md`, `docs/ai/cx1-db-sample-census/sample-census-plan.json`
- cx1-halfvec-fidelity-c1-c2-20260817: `scripts/cx1-halfvec-fidelity.py`, `docs/ai/CX1_HALFVEC_FIDELITY.md`, `docs/ai/cx1-vector-results/halfvec-fidelity.json`
- cx1-experiment-registry-summary-20260817: `docs/ai/CX1_EXPERIMENT_REGISTRY.md`, `docs/ai/CX1_EXPERIMENT_REGISTRY.json`
- cx1-vector-capacity-20260817: `scripts/cx1-vector-capacity.py`, `docs/ai/CX1_VECTOR_CAPACITY_BENCHMARK.md`, `docs/ai/cx1-vector-results/benchmark-results.json`
- cx1-hnsw-parameter-plan-20260817: `scripts/cx1-hnsw-parameter-plan.mjs`, `docs/ai/CX1_HNSW_PARAMETER_LAB.md`, `docs/ai/cx1-vector-results/hnsw-parameter-plan.json`
- cx1-local-scale-envelope-20260817: `scripts/cx1-local-scale-envelope.py`, `docs/ai/CX1_LOCAL_SCALE_ENVELOPE.md`, `docs/ai/cx1-envelope-results/benchmark-results.json`
- cx1-real-silver-benchmark-20260817: `scripts/cx1-real-silver-benchmark.py`, `docs/ai/CX1_REAL_SILVER_BENCHMARK.md`, `docs/ai/cx1-silver-results/benchmark-results.json`
- cx1-silver-production-prototype-smoke-20260817: `scripts/cx1-silver-smoke.py`, `docs/ai/CX1_SILVER_PRODUCTION_PROTOTYPE.md`, `docs/ai/cx1-silver-results/prototype-smoke.json`
- cx1-silver-failure-smoke-20260817: `scripts/cx1-silver-failure-smoke.py`, `docs/ai/CX1_SILVER_PRODUCTION_PROTOTYPE.md`, `docs/ai/cx1-silver-results/failure-smoke.json`
- cx1-document-classification-audit-20260817: `scripts/cx1-document-classification-audit.mjs`, `docs/ai/CX1_DOCUMENT_CLASSIFICATION_AUDIT.md`, `docs/ai/cx1-classification-audit/classification-audit.json`
- cx1-legal-object-efficiency-audit-20260817: `scripts/cx1-legal-object-efficiency.mjs`, `docs/ai/CX1_LEGAL_OBJECT_EFFICIENCY.md`, `docs/ai/cx1-legal-object-efficiency/triage-summary.json`
- cx1-devanagari-bakeoff-20260817: `scripts/cx1-devanagari-bakeoff.mjs`, `docs/ai/CX1_DEVANAGARI_BAKEOFF.md`, `docs/ai/cx1-devanagari-results/bakeoff-results.json`
- cx1-devanagari-scale-validation-plan-20260817: `scripts/cx1-devanagari-scale-plan.mjs`, `docs/ai/CX1_DEVANAGARI_SCALE_VALIDATION.md`, `docs/ai/cx1-devanagari-results/scale-validation-plan.json`
- cx1-premium-backend-shadow-lab-20260817: `scripts/cx1-premium-backend-lab.mjs`, `docs/ai/CX1_PREMIUM_DATA_BACKEND_LAB.md`, `docs/ai/cx1-premium-backend-lab/premium-backend-lab.json`
- cx1-citation-graph-census-plan-20260817: `scripts/cx1-citation-graph-census.mjs`, `docs/ai/CX1_CITATION_GRAPH_CENSUS.md`, `docs/ai/cx1-citation-graph-census/citation-graph-census.json`
- cx1-disaster-recovery-drill-plan-20260817: `scripts/cx1-disaster-recovery-drill.mjs`, `docs/ai/CX1_DISASTER_RECOVERY_DRILL.md`, `docs/ai/cx1-disaster-recovery-drill/drill-plan.json`
- cx1-heavy-lab-final-packet-20260817: `scripts/cx1-heavy-lab-final.mjs`, `docs/ai/CX1_HEAVY_LAB_FINAL.md`

## 19. Cleanup Performed

- Halfvec copied vector CSV payload was removed after the C1/C2 run.
- CX1 architecture cleanup removed only verified disposable proof payloads and retained JSON reports.
- Silver and DR artifacts are fenced under CX1 lab/documentation paths; no Gold cleanup ran.

## 20. Recommended Next CX1 Heavy Mission

- Current scheduler: **MEDIUM**, PostgreSQL active=2, oldest transaction=396s, RAM free=21.7%.
- Next LIGHT action: keep queue/preflight/integrity fresh.
- Next `MEDIUM_CLEAN` action when clear: run the DB sample census or the Devanagari/classification/legal-object/citation selectors one at a time, saving stdout to disposable CX1 evidence.
- Next `VECTOR_EXCLUSIVE` action when clear: run C3 ANN recall and the D0 HNSW parameter frontier.
- Next `HEAVY` idle action when clear: execute Workstream L restore drill against disposable storage and a non-production PostgreSQL port.

## Boundary

This packet is generated offline from existing CX1 evidence. It does not query PostgreSQL, fetch PDFs, run OCR, copy vectors, build indexes, call a model, perform provider operations, or write production state.
