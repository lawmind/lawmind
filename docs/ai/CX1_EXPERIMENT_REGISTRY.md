# CX1 Experiment Registry

Last updated: **2026-08-17 18:17 Asia/Dubai**

Machine registry: `docs/ai/CX1_EXPERIMENT_REGISTRY.json`

## Rule

A CX1 result without a reproducible script, input description, and machine-readable evidence is not KNOW-level project truth.

## Current Entries

| Experiment | Workstream | Status | Evidence | Report |
|---|---|---|---|---|
| `cx1-heavy-lab-scheduler-20260817` | scheduler | active | observer script | `docs/ai/CX1_HEAVY_LAB_STATUS.md` |
| `cx1-run-queue-20260817` | M | active | scheduler-gated queue JSON | `docs/ai/CX1_RUN_QUEUE.md` |
| `cx1-preflight-20260817` | M | active | offline preflight JSON | `docs/ai/CX1_PREFLIGHT.md` |
| `cx1-gated-runner-20260817` | M | active | LIGHT-only runner result | `docs/ai/CX1_GATED_RUNNER.md` |
| `cx1-gated-runner-refusal-smoke-20260817` | M | complete_sample | isolated refusal smoke JSON | `docs/ai/CX1_GATED_RUNNER_SAFETY.md` |
| `cx1-evidence-integrity-20260817` | M | active | evidence hash manifest/integrity JSON | `docs/ai/CX1_EVIDENCE_INTEGRITY.md` |
| `cx1-selector-runner-20260817` | M | active | dry-run/refusal smoke JSON | `docs/ai/CX1_SELECTOR_RUNNER.md` |
| `cx1-corpus-census-phase1-20260817` | A | complete | metadata-only JSON/CSV | `docs/ai/CX1_FULL_CORPUS_CENSUS.md` |
| `cx1-halfvec-fidelity-harness-20260817` | C | complete_sample | reusable C1/C2 harness execution | `docs/ai/CX1_HALFVEC_FIDELITY.md` |
| `cx1-embedding-eligibility-phase1-20260817` | B | complete | estimated manifest | `docs/ai/CX1_EMBEDDING_ELIGIBILITY_CENSUS.md` |
| `cx1-retrieval-matrix-plan-20260817` | E | prepared_not_run | controlled arms summary + planned matrix | `docs/ai/CX1_RETRIEVAL_MATRIX.md` |
| `cx1-db-sample-census-harness-20260817` | A/B | prepared_not_run | dry-run SQL/plan artifact | `docs/ai/CX1_DB_SAMPLE_CENSUS.md` |
| `cx1-halfvec-fidelity-c1-c2-20260817` | C | complete_sample | copied-vector C1/C2 JSON | `docs/ai/CX1_HALFVEC_FIDELITY.md` |
| `cx1-experiment-registry-summary-20260817` | M | complete | registry JSON summary | `docs/ai/CX1_EXPERIMENT_REGISTRY.md` |
| `cx1-vector-capacity-20260817` | C/D prerequisite | complete | disposable Postgres benchmark | `docs/ai/CX1_VECTOR_CAPACITY_BENCHMARK.md` |
| `cx1-hnsw-parameter-plan-20260817` | D | prepared_not_run | offline HNSW matrix JSON/CSV | `docs/ai/CX1_HNSW_PARAMETER_LAB.md` |
| `cx1-local-scale-envelope-20260817` | scheduler baseline | complete | disposable workload benchmark | `docs/ai/CX1_LOCAL_SCALE_ENVELOPE.md` |
| `cx1-real-silver-benchmark-20260817` | G | complete | real-document Parquet benchmark | `docs/ai/CX1_REAL_SILVER_BENCHMARK.md` |
| `cx1-silver-production-prototype-smoke-20260817` | G | complete_sample | synthetic fixture smoke JSON | `docs/ai/CX1_SILVER_PRODUCTION_PROTOTYPE.md` |
| `cx1-silver-failure-smoke-20260817` | G | complete_sample | synthetic failure-injection JSON | `docs/ai/CX1_SILVER_PRODUCTION_PROTOTYPE.md` |
| `cx1-document-classification-audit-20260817` | H | complete_sample | offline audit JSON/selector plan | `docs/ai/CX1_DOCUMENT_CLASSIFICATION_AUDIT.md` |
| `cx1-legal-object-efficiency-audit-20260817` | I | complete_sample | offline triage summary/router proposal | `docs/ai/CX1_LEGAL_OBJECT_EFFICIENCY.md` |
| `cx1-devanagari-bakeoff-20260817` | F | complete | 32-document extraction bake-off | `docs/ai/CX1_DEVANAGARI_BAKEOFF.md` |
| `cx1-devanagari-scale-validation-plan-20260817` | F | prepared_not_run | offline plan/selector SQL | `docs/ai/CX1_DEVANAGARI_SCALE_VALIDATION.md` |
| `cx1-citation-graph-census-plan-20260817` | J | prepared_not_run | snapshot inventory + read-only selector SQL | `docs/ai/CX1_CITATION_GRAPH_CENSUS.md` |
| `cx1-premium-backend-shadow-lab-20260817` | K | complete_sample | synthetic projection/assertion JSON | `docs/ai/CX1_PREMIUM_DATA_BACKEND_LAB.md` |
| `cx1-disaster-recovery-drill-plan-20260817` | L | prepared_not_run | restore-drill checklist + smoke SQL | `docs/ai/CX1_DISASTER_RECOVERY_DRILL.md` |
| `cx1-heavy-lab-final-packet-20260817` | M | active | 20-section checkpoint packet | `docs/ai/CX1_HEAVY_LAB_FINAL.md` |

## Status Semantics

- `complete`: the named measurement/report is finished for its declared scope.
- `complete_sample`: measured, but scope is intentionally partial and must not be promoted as corpus-wide proof.
- `prepared_not_run`: script/harness exists and verifies cheaply, but the measurement has not run.
- `active`: operational artifact used continuously by CX1.

## Current KNOW-Level Findings

- HC metadata coverage base: **7,257,726 / 20,529,203 = 35.4%**, High Court scope only.
- Halfvec capacity candidate: measured combined table+HNSW footprint **13,778.58 bytes/vector fp32** vs **5,571.26 bytes/vector halfvec** at ~600k scale.
- Halfvec C1/C2 sample: **NO_MEASURABLE_DEGRADATION** candidate on 5,000 copied vectors, 100,000 pairs, 200 exact-NN queries; C3 ANN recall and C4 NEW1 gold remain unmeasured.
- Devanagari extraction: Poppler dropped all Devanagari tokens in the 32-document bake-off sample; it is not a safe repair path by itself.
- Silver benchmark: court partitioning with ZSTD 9 is the current measured layout recommendation; court/year physical partitioning creates too many tiny objects.
- Silver prototype smoke: the offline writer/compactor preserved **24 fixture rows**, proved writer rerun idempotence, and compacted **12** small objects to **6** objects under the disposable CX1 lab root.
- Silver failure smoke: stale final manifests and stale temp dirs were repaired for writer and compactor on an **18-row** fixture, and outside-lab output was refused.
- DB sample census harness: reproducible read-only SQL is prepared for Workstreams A/B, but the sample has not run.
- Devanagari scale-validation plan: selector SQL is prepared for **148** citation-prioritised/court-stratified documents across **9** strata; no new DB/PDF/OCR work has run.
- HNSW parameter lab plan: **270** fp32/halfvec HNSW parameter rows are prepared, with D0/D1/D2 priority frontiers gated on `VECTOR_EXCLUSIVE`.
- Retrieval matrix plan: existing NEW1 `arms-checkpoint.jsonl` is summarized reproducibly for the CONTROLLED 283-query x 3-arm pass; dense leads sparse/hybrid on the controlled Supreme Court set, while uncontrolled, halfvec, ef_search, exact-route, and High Court retrieval impacts remain not-yet-run.
- Run queue: live scheduler-gated queue permits only LIGHT validation at the current checkpoint; DB/OCR/vector commands remain blocked by gate reasons in `docs/ai/CX1_RUN_QUEUE.json`.
- Preflight: offline check passes for CX1 Node/Python syntax, JSON manifests, lexical read-only SQL scan, registry references, run-queue gates, and Silver lab-path fences.
- Gated runner: queue-approved LIGHT validation executed successfully; the runner refuses non-LIGHT DB/PDF/OCR/vector/HNSW work.
- Gated runner refusal smoke: requesting the prepared DB sample task through the runner produced an isolated refusal result and preserved the normal runner PASS artifact.
- Evidence integrity audit: offline manifest covers CX1 evidence files under `docs/ai`, with JSON parsing, SQL lexical scans, registry/queue/preflight consistency checks, hashes, and currently **0 fail / 0 warn** findings.
- Selector runner: dry-run-default wrapper is prepared for future `MEDIUM_CLEAN` read-only selector execution; smoke proves no-execute dry-run behavior and unsupported-task refusal before execution.
- Document classification audit: the plain-variant sample's **44.5%** unclassified residue is entirely `DISPOSED*` / `CLOSED`; treating that as a deterministic `decided` label would be unsafe, and CX1 prepared a larger read-only stratified selector for later execution.
- Legal-object efficiency audit: existing post-fix triage across five 0051 tasks has **4,119** quote claims, **81.9%** verified, **745** rejected, and **35** caught fabrications; CX1 recommends holding `case_structure` at 100 while keeping `holding`, `arguments`, `authorities`, and `topics` as 1,000-document candidates, subject to owner-lane approval and span verification.
- Citation graph census plan: existing measured snapshots are now inventoried with provenance and caveats; sentinel rows must stay out of unresolved-citation denominators, unresolved overruled/overruled_in_part/doubted targets are the top Workstream J priority region, and a read-only graph selector is prepared for a future `MEDIUM_CLEAN` window.
- Premium backend shadow lab: synthetic Workstream K harness projects observations into matter timelines/latest state, collapses one duplicate observation, retains one unlinked observation, detects one new order, two tomorrow hearing triggers, and one same-advocate same-date conflict, while keeping procedural orders non-citable.
- Disaster-recovery drill plan: native `pg_basebackup`/WAL acceptance evidence is converted into an eight-step restore checklist plus restored-cluster smoke SQL; CX1 explicitly records that file identity and migration compare evidence do not prove recoverability.
- Final packet: `docs/ai/CX1_HEAVY_LAB_FINAL.md` now exists in the requested 20-section format and explicitly separates current KNOW findings from gated not-yet-KNOW work.

## Not Yet KNOW

- Corpus-wide document-class proportions beyond current samples.
- Exact embedding eligibility populations by class/citation/paragraph/legal-object status.
- DB-sampled text length, citation density, chunk coverage, and enrichment coverage.
- Devanagari scale selector execution and OCR citation-preservation measurement.
- HNSW ANN recall under halfvec.
- HNSW parameter matrix execution.
- NEW1 retrieval-gold impact of halfvec.
- Retrieval matrix uncontrolled production-haystack execution, halfvec retrieval arms, ef_search frontier impact, exact-route probes, and High Court retrieval measurement.
- Full Silver writer/compactor real-corpus production-scale replay and broader crash matrix.
- Workstream H larger selector execution and any span-verified candidate adjudication over the difficult subset.
- Workstream I live enrichment/token/latency selector execution and any per-task cost attribution; `llm_calls` has no direct link to `document_enrichments` in the current schema.
- Workstream J live citation graph selector execution; current J artifact is a snapshot-aware plan, not a corpus-current graph census.
- Workstream K remains synthetic only: no production observation schema, matcher threshold, notification contract, hearing-pack API, or real cause-list/order replay has been approved or measured.
- Workstream L full R2/base-backup readback, `pg_verifybackup`, disposable restore, restored-cluster smoke, RTO, and RPO measurement have not run.
