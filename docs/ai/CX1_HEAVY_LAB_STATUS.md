# CX1 Heavy Lab Status

Last checkpoint: **2026-08-17 18:21 Asia/Dubai**  
Lane: **CX1 shadow / lab**  
Mode: **read-only production, disposable copies only**

## Adoption State

CX1 has adopted the existing local lab outputs instead of duplicating them:

| Workstream | State | Output |
|---|---|---|
| Run queue | ACTIVE | `docs/ai/CX1_RUN_QUEUE.md` |
| Preflight | ACTIVE / PASS | `docs/ai/CX1_PREFLIGHT.md` |
| Gated runner | ACTIVE / PASS | `docs/ai/CX1_GATED_RUNNER.md` |
| Gated runner refusal smoke | COMPLETE SAMPLE | `docs/ai/CX1_GATED_RUNNER_SAFETY.md` |
| Evidence integrity audit | ACTIVE / PASS | `docs/ai/CX1_EVIDENCE_INTEGRITY.md` |
| Selector runner | ACTIVE / PASS | `docs/ai/CX1_SELECTOR_RUNNER.md` |
| Final checkpoint packet | ACTIVE | `docs/ai/CX1_HEAVY_LAB_FINAL.md` |
| Resource envelope | ADOPTED | `docs/ai/CX1_LOCAL_SCALE_ENVELOPE.md` |
| Vector capacity | ADOPTED | `docs/ai/CX1_VECTOR_CAPACITY_BENCHMARK.md` |
| Real Silver benchmark | ADOPTED | `docs/ai/CX1_REAL_SILVER_BENCHMARK.md` |
| Devanagari bake-off | ADOPTED | `docs/ai/CX1_DEVANAGARI_BAKEOFF.md` |
| Devanagari scale-validation plan | PREPARED NOT RUN | `docs/ai/CX1_DEVANAGARI_SCALE_VALIDATION.md` |
| Corpus census phase 1 | COMPLETE | `docs/ai/CX1_FULL_CORPUS_CENSUS.md` |
| Embedding eligibility phase 1 | COMPLETE | `docs/ai/CX1_EMBEDDING_ELIGIBILITY_CENSUS.md` |
| DB sample census harness | PREPARED NOT RUN | `docs/ai/CX1_DB_SAMPLE_CENSUS.md` |
| Halfvec fidelity C1/C2 | COMPLETE SAMPLE | `docs/ai/CX1_HALFVEC_FIDELITY.md` |
| HNSW parameter lab plan | PREPARED NOT RUN | `docs/ai/CX1_HNSW_PARAMETER_LAB.md` |
| Retrieval matrix plan | PREPARED / EXISTING CONTROLLED SUMMARY | `docs/ai/CX1_RETRIEVAL_MATRIX.md` |
| Silver production prototype smoke/failure smoke | COMPLETE SAMPLE | `docs/ai/CX1_SILVER_PRODUCTION_PROTOTYPE.md` |
| Document-classification audit | COMPLETE SAMPLE / PLAN PREPARED | `docs/ai/CX1_DOCUMENT_CLASSIFICATION_AUDIT.md` |
| Legal-object efficiency audit | COMPLETE SAMPLE / SELECTORS PREPARED | `docs/ai/CX1_LEGAL_OBJECT_EFFICIENCY.md` |
| Citation graph census plan | PREPARED NOT RUN | `docs/ai/CX1_CITATION_GRAPH_CENSUS.md` |
| Premium backend shadow lab | COMPLETE SAMPLE | `docs/ai/CX1_PREMIUM_DATA_BACKEND_LAB.md` |
| Disaster-recovery drill plan | PREPARED NOT RUN | `docs/ai/CX1_DISASTER_RECOVERY_DRILL.md` |

Experiment registry:

- machine: `docs/ai/CX1_EXPERIMENT_REGISTRY.json`
- human: `docs/ai/CX1_EXPERIMENT_REGISTRY.md`
- active run queue: `docs/ai/CX1_RUN_QUEUE.json`, `docs/ai/CX1_RUN_QUEUE.md`
- active preflight: `docs/ai/CX1_PREFLIGHT.json`, `docs/ai/CX1_PREFLIGHT.md`
- active gated runner: `docs/ai/CX1_GATED_RUNNER.json`, `docs/ai/CX1_GATED_RUNNER.md`
- final checkpoint packet: `docs/ai/CX1_HEAVY_LAB_FINAL.md`
- gated-runner refusal smoke: `docs/ai/cx1-runner-results/runner-smoke.json`, `docs/ai/CX1_GATED_RUNNER_SAFETY.md`
- evidence integrity audit: `docs/ai/cx1-evidence-integrity/integrity-report.json`, `docs/ai/cx1-evidence-integrity/artifact-manifest.json`, `docs/ai/cx1-evidence-integrity/artifact-manifest.csv`, `docs/ai/CX1_EVIDENCE_INTEGRITY.md`
- selector runner: `docs/ai/CX1_SELECTOR_RUNNER.md`, `docs/ai/cx1-selector-results/selector-runner-smoke.json`, `docs/ai/cx1-selector-results/selector-runner-dry-run.json`, `docs/ai/cx1-selector-results/selector-runner-refusal.json`
- retrieval matrix: `docs/ai/CX1_RETRIEVAL_MATRIX.md`, `docs/ai/cx1-retrieval-matrix/matrix-plan.json`, `docs/ai/cx1-retrieval-matrix/completed-controlled-summary.csv`, `docs/ai/cx1-retrieval-matrix/planned-configs.csv`
- citation graph census: `docs/ai/CX1_CITATION_GRAPH_CENSUS.md`, `docs/ai/cx1-citation-graph-census/citation-graph-census.json`, `docs/ai/cx1-citation-graph-census/snapshot-inventory.csv`, `docs/ai/cx1-citation-graph-census/priority-regions.csv`, `docs/ai/cx1-citation-graph-census/graph-census-selector.sql`
- premium backend shadow lab: `docs/ai/CX1_PREMIUM_DATA_BACKEND_LAB.md`, `docs/ai/cx1-premium-backend-lab/premium-backend-lab.json`, `docs/ai/cx1-premium-backend-lab/scenario-summary.csv`, `docs/ai/cx1-premium-backend-lab/hearing-pack-readiness.csv`
- disaster-recovery drill: `docs/ai/CX1_DISASTER_RECOVERY_DRILL.md`, `docs/ai/cx1-disaster-recovery-drill/drill-plan.json`, `docs/ai/cx1-disaster-recovery-drill/acceptance-checklist.csv`, `docs/ai/cx1-disaster-recovery-drill/restore-smoke.sql`
- classification audit: `docs/ai/cx1-classification-audit/classification-audit.json`, `docs/ai/cx1-classification-audit/sample-selector.sql`
- legal-object efficiency audit: `docs/ai/cx1-legal-object-efficiency/triage-summary.json`, `docs/ai/cx1-legal-object-efficiency/router-proposal.json`, `docs/ai/cx1-legal-object-efficiency/efficiency-selector.sql`, `docs/ai/cx1-legal-object-efficiency/llm-cost-selector.sql`

## Current Machine / Lane Pressure

Observed 2026-08-17 18:21 Asia/Dubai:

- PostgreSQL 18.6 local cluster is running on `127.0.0.1:5432`, database `lawmind`, size **120 GB**.
- OS memory was about **6.9 GiB free / 31.75 GiB total**.
- Disk free: **C: 484.5 GiB / 930 GiB**, **D: 793.2 GiB / 1.82 TiB**.
- `pg_stat_activity` showed **2 active backends** at the checkpoint; oldest transaction about **396 s**.
- Scheduler detected no known main-lane heavy process at the final checkpoint, but active PostgreSQL work and low free RAM capped CX1 at **MEDIUM**.

Scheduler artifact added: `scripts/cx1-heavy-lab-runner.mjs`.
Run queue artifact added: `scripts/cx1-run-queue.mjs`.
Preflight artifact added: `scripts/cx1-preflight.mjs`.
Gated runner artifact added: `scripts/cx1-gated-runner.mjs`.
Gated runner smoke artifact added: `scripts/cx1-gated-runner-smoke.mjs`.
Selector runner artifact added: `scripts/cx1-selector-runner.mjs`.
Selector runner smoke artifact added: `scripts/cx1-selector-runner-smoke.mjs`.

Current recommendation: after one `VECTOR_EXCLUSIVE` window, C1/C2 ran and the copied payload was removed. The latest scheduler result is **MEDIUM**; `CX1_RUN_QUEUE` currently permits only LIGHT artifact validation, citation-graph refresh, premium-backend refresh, retrieval-matrix refresh, disaster-recovery drill refresh, final-packet refresh, and selector-runner smoke tasks while blocking DB/OCR/vector/HNSW/classification-selector/legal-object-selector/citation-graph-selector/disaster-recovery-restore jobs.
Preflight status: **PASS** for syntax, JSON, SQL read-only lexical scan, registry references, run-queue gates, and lab-path fences.
Gated runner status: **PASS** for `cx1-validate-light-artifacts`; non-LIGHT work is refused by design.
Refusal smoke status: **PASS**; `cx1-db-sample-census-run` was refused before execution and wrote isolated evidence under `docs/ai/cx1-runner-results/`.
Selector runner status: **PASS**; dry-run/default and unsupported-task refusal smokes wrote evidence under `docs/ai/cx1-selector-results/` without running PostgreSQL selectors.
Evidence integrity audit status: **PASS**; the manifest hashes CX1 evidence files under `docs/ai` and reports zero failure or warning findings at the checkpoint.
Document-classification audit status: **COMPLETE SAMPLE**; offline H1 sample plan is prepared, but the larger selector has not run.
Legal-object efficiency audit status: **COMPLETE SAMPLE**; offline triage/router summary is written, but the DB enrichment/cost selectors have not run.
Retrieval matrix status: **PREPARED / EXISTING CONTROLLED SUMMARY**; CX1 summarized the existing 849-row NEW1 controlled arms checkpoint and prepared the remaining matrix without running retrieval.
Citation graph census status: **PREPARED NOT RUN**; CX1 inventoried existing citation/graph snapshots and prepared a read-only graph selector with currentness, key, alias, and isolation diagnostics without querying PostgreSQL or changing citation state.
Premium backend shadow lab status: **COMPLETE SAMPLE**; CX1 exercised a synthetic observation-to-matter projection without production DB/API/schema/UI changes, provider fetch, model call, legal advice, or citation confirmation.
Disaster-recovery drill status: **PREPARED NOT RUN**; CX1 converted backup architecture evidence into a restore-drill checklist and restored-cluster smoke SQL without downloading R2 objects, running backup/restore commands, starting PostgreSQL, querying Gold, or changing production state.
Final packet status: **ACTIVE CHECKPOINT**; `docs/ai/CX1_HEAVY_LAB_FINAL.md` exists in the requested 20-section format and marks remaining gated work as not-yet-KNOW rather than production-ready.

## WORKSTREAM M — Lab Control Plane

STATE: ACTIVE / PASS  
STARTED: 2026-08-17 16:44 Asia/Dubai  
LAST CHECKPOINT: 2026-08-17 18:21 Asia/Dubai  
INPUT: CX1 registry, queue, preflight, gated-runner outputs, and discovered CX1 evidence under `docs/ai`  
OUTPUT: `scripts/cx1-run-queue.mjs`, `scripts/cx1-preflight.mjs`, `scripts/cx1-gated-runner.mjs`, `scripts/cx1-gated-runner-smoke.mjs`, `scripts/cx1-evidence-integrity.mjs`, `scripts/cx1-selector-runner.mjs`, `scripts/cx1-selector-runner-smoke.mjs`, `scripts/cx1-retrieval-matrix.mjs`, `scripts/cx1-citation-graph-census.mjs`, `scripts/cx1-premium-backend-lab.mjs`, `scripts/cx1-disaster-recovery-drill.mjs`, `scripts/cx1-heavy-lab-final.mjs`, `docs/ai/CX1_RUN_QUEUE.md`, `docs/ai/CX1_PREFLIGHT.md`, `docs/ai/CX1_GATED_RUNNER.md`, `docs/ai/CX1_GATED_RUNNER_SAFETY.md`, `docs/ai/CX1_EVIDENCE_INTEGRITY.md`, `docs/ai/CX1_SELECTOR_RUNNER.md`, `docs/ai/CX1_RETRIEVAL_MATRIX.md`, `docs/ai/CX1_CITATION_GRAPH_CENSUS.md`, `docs/ai/CX1_PREMIUM_DATA_BACKEND_LAB.md`, `docs/ai/CX1_DISASTER_RECOVERY_DRILL.md`, `docs/ai/CX1_HEAVY_LAB_FINAL.md`, `docs/ai/cx1-evidence-integrity/artifact-manifest.json`, `docs/ai/cx1-selector-results/selector-runner-smoke.json`, `docs/ai/cx1-retrieval-matrix/matrix-plan.json`, `docs/ai/cx1-citation-graph-census/citation-graph-census.json`, `docs/ai/cx1-premium-backend-lab/premium-backend-lab.json`, `docs/ai/cx1-disaster-recovery-drill/drill-plan.json`  
MEASURED FACTS:

- Run queue currently permits LIGHT validation, citation-graph refresh, premium-backend refresh, selector-runner smoke, retrieval-matrix refresh, disaster-recovery drill refresh, and final-packet refresh tasks; all DB/OCR/vector/HNSW selector/retrieval/restore execution tasks are gated.
- Preflight passes for Node/Python syntax, JSON parsing, lexical read-only SQL scans, registry references, queue gates, and Silver lab-path fences.
- Gated runner executes only queue-approved LIGHT work and refuses non-LIGHT commands before execution.
- Refusal smoke proves `cx1-db-sample-census-run` is refused with isolated evidence and does not overwrite the normal runner result.
- Selector runner smoke proves prepared selector dry-run does not execute without `--execute`, and an unsupported task is refused before execution. The current Devanagari selector dry-run observed the live gate block: PostgreSQL active backends=2 and RAM free 21.7%.
- Evidence integrity audit hashes **120** CX1 evidence files, parses **40** JSON files, scans **7** SQL files lexically, and reports **0 fail / 0 warn** findings. Informational orphan notes are retained for files that are manifest evidence but not directly registry/queue roots.

OPEN QUESTIONS:

- Integrity hashing proves artifact identity and references, not that broad scientific claims are corpus-wide.
- SQL scans remain lexical; live selector execution still requires scheduler clearance.
- Selector runner execution mode remains gated by `CX1_RUN_QUEUE`; dry-run evidence is not a live selector result.

NEXT ACTION:

- Keep all control-plane artifacts refreshed after each CX1 workstream change; do not use a stale queue/preflight/integrity pass to justify live DB or vector work.

## WORKSTREAM A — Full Corpus Intelligence Census

STATE: PHASE 1 COMPLETE; DB-heavy phases pending scheduler clearance  
STARTED: 2026-08-17 16:12 Asia/Dubai  
LAST CHECKPOINT: 2026-08-17 16:15 Asia/Dubai  
INPUT: `docs/HC_METADATA_SURVEY.json`, source Parquet metadata, existing `judgments` / classification / paragraph / citation tables  
OUTPUT: `docs/ai/CX1_FULL_CORPUS_CENSUS.md`, `docs/ai/cx1-corpus-census/metadata-coverage.json`, `docs/ai/cx1-corpus-census/metadata-coverage.csv`  
MEASURED FACTS:

- NEW2 measured exact High Court source universe at **20,529,203** documents, **7,257,726** held, **35.4%** coverage for HC scope.
- Supreme Court held rows explain the **38,342** difference between HC held count and all `judgments`.
- Plain-variant sample: **44.5% unclassified**, all in `DISPOSED*` / `CLOSED` residue in the sample; no safe deterministic relabel yet.
- CX1 phase 1 reproduced the HC coverage base metadata-only: **7,257,726 / 20,529,203 = 35.4%**, with band and court-year outputs.
- CX1 prepared a read-only DB sample harness at `scripts/cx1-db-sample-census.mjs`; default mode writes SQL/plan docs only and does not query PostgreSQL.

OPEN QUESTIONS:

- Corpus-wide document-class proportions remain unmeasured beyond existing samples.
- Judgment-share of the plain corpus is unknown; document count is not authority count.

NEXT ACTION:

- Run the prepared DB sample harness only after scheduler pressure clears; current SQL measures text length, citation density, chunk coverage, enrichment coverage, Devanagari screen, class slices, and court/year slices.

## WORKSTREAM B — Embedding Eligibility Census

STATE: PHASE 1 COMPLETE; DB/legal-object phases pending  
STARTED: 2026-08-17 16:19 Asia/Dubai  
LAST CHECKPOINT: 2026-08-17 16:21 Asia/Dubai  
INPUT: Workstream A census, legal-object tables, vector coverage  
OUTPUT: `docs/ai/CX1_EMBEDDING_ELIGIBILITY_CENSUS.md`, `docs/ai/cx1-embedding-eligibility/population-scenarios.json`, `docs/ai/cx1-embedding-eligibility/population-scenarios.csv`  
MEASURED FACTS:

- `halfvec` capacity is promising but quality is unknown.
- The likely model-eligible `DISPOSED*` / `CLOSED` residue may be millions of documents, not the earlier ~1.5M local-classified figure.
- Phase 1 scenarios, using measured CX1 storage constants and the 200-document HC plain-variant class sample:
  - MINIMAL: **1,743,908 vectors** → **22.38 GiB fp32**, **9.05 GiB halfvec**.
  - BALANCED: **2,651,123 vectors** → **34.02 GiB fp32**, **13.76 GiB halfvec**.
  - AGGRESSIVE: **5,880,811 vectors** → **75.46 GiB fp32**, **30.51 GiB halfvec**.
  - BALANCED_PLUS_OBJECTS: **10,604,493 vectors** → **136.08 GiB fp32**, **55.02 GiB halfvec**.
- A/B DB sample harness is prepared but not run; its outputs will replace some phase-1 estimates with measured sampled citation/chunk/enrichment density.

OPEN QUESTIONS:

- The phase 1 scenarios are projections, not exact eligibility: the HC class sample was spread-selected, not a random corpus estimator.
- TIER_B verified legal-object counts, TIER_C paragraph counts, citation density, duplicate collapse, and existing vector coverage by court/year remain unmeasured.

NEXT ACTION:

- Execute `node scripts/cx1-db-sample-census.mjs --run` only when the scheduler permits MEDIUM work without active main-lane readers.

## WORKSTREAM C — Halfvec Semantic Fidelity

STATE: C1/C2 COMPLETE ON 5,000-VECTOR SAMPLE; C3/C4 pending  
STARTED: 2026-08-17 16:21 Asia/Dubai  
LAST CHECKPOINT: 2026-08-17 16:24 Asia/Dubai  
INPUT: copied embeddings from disposable cluster; NEW1 gold only if idle/unlocked  
OUTPUT: `scripts/cx1-halfvec-fidelity.py`, `docs/ai/CX1_HALFVEC_FIDELITY.md`, `docs/ai/cx1-vector-results/halfvec-fidelity.json`  
MEASURED FACTS:

- Capacity benchmark measured **13,778.58 bytes/vector fp32 combined** vs **5,571.26 bytes/vector halfvec combined** at ~600k scale.
- C1/C2 representation-only sample: **5,000 copied vectors**, **100,000 vector pairs**, **200 exact-NN queries**, no HNSW.
- Distance distortion: absolute-error **p50 0.00000763**, **p95 0.00002235**, **p99 0.00002980**, max **0.00005448**.
- Exact-NN overlap: top-5 mean overlap **0.9990**, top-10 **0.9995**, top-20 **1.0000**, top-50 **0.9998**; first-result disagreement **0.0000** at all measured k.
- Verdict candidate for this sample: **NO_MEASURABLE_DEGRADATION**.
- Copied vector CSV was removed after the result was written.

OPEN QUESTIONS:

- Larger sample remains useful.
- C3 HNSW ANN recall remains unmeasured.
- C4 NEW1 gold impact remains unmeasured.

NEXT ACTION:

- Re-check scheduler; if `VECTOR_EXCLUSIVE`, run C3 HNSW ANN recall or a larger C1/C2 sample. Do not claim production approval; NEW1 owns the quality decision.

## WORKSTREAM D — HNSW Parameter Lab

STATE: PLAN PREPARED; execution pending VECTOR_EXCLUSIVE  
STARTED: 2026-08-17 16:44 Asia/Dubai  
LAST CHECKPOINT: 2026-08-17 16:44 Asia/Dubai  
INPUT: disposable fp32/halfvec populations  
OUTPUT: `scripts/cx1-hnsw-parameter-plan.mjs`, `docs/ai/CX1_HNSW_PARAMETER_LAB.md`, `docs/ai/cx1-vector-results/hnsw-parameter-plan.json`, `docs/ai/cx1-vector-results/hnsw-parameter-matrix.csv`  
MEASURED FACTS:

- Existing production-style settings are `m=16`, `ef_construction=64`.
- Local envelope says one HNSW build at a time and vector maintenance should be isolated.
- Offline HNSW matrix contains **270** rows across fp32/halfvec, 100k/300k/600k scales, `m` values 8/16/24, `ef_construction` 32/64/128, and `ef_search` 20/40/80/160/320.
- D0/D1/D2 priority frontiers are prepared but not run. Heuristic index storage estimates scale measured `m=16` bytes linearly by `m/16`; this is a planning prior, not evidence.

OPEN QUESTIONS:

- Pareto frontier across `m`, `ef_construction`, and `ef_search`.
- ANN recall and NEW1 retrieval-gold impact remain unmeasured.

NEXT ACTION:

- Run only under `VECTOR_EXCLUSIVE`, one HNSW build at a time in a disposable lab cluster, with exact neighbours computed from the same copied population.

## WORKSTREAM E — Retrieval Matrix

STATE: PREPARED / EXISTING CONTROLLED SUMMARY; execution pending scheduler clearance  
STARTED: 2026-08-17 17:40 Asia/Dubai  
LAST CHECKPOINT: 2026-08-17 17:40 Asia/Dubai  
INPUT: NEW1 harness source and fixtures, `arms-checkpoint.jsonl`, `services/harness/baseline.json`, `docs/ai/PRE_MIGRATION_RETRIEVAL_BASELINE.md`  
OUTPUT: `scripts/cx1-retrieval-matrix.mjs`, `docs/ai/CX1_RETRIEVAL_MATRIX.md`, `docs/ai/cx1-retrieval-matrix/matrix-plan.json`, `docs/ai/cx1-retrieval-matrix/completed-controlled-summary.csv`, `docs/ai/cx1-retrieval-matrix/planned-configs.csv`  
MEASURED FACTS:

- Existing NEW1 `arms-checkpoint.jsonl` contains **849** CONTROLLED rows: **283 queries x 3 arms** (`sparse`, `dense`, `hybrid`).
- On that controlled Supreme Court haystack pass: dense success@5 **21.6%**, recall@20 **40.6%**, MRR **0.151**, nDCG@20 **0.207**.
- Hybrid measured success@5 **18.4%**, recall@20 **38.9%**, MRR **0.121**, nDCG@20 **0.180**.
- Sparse measured success@5 **10.2%**, recall@20 **17.0%**, MRR **0.070**, nDCG@20 **0.093**.
- CX1 hashed the harness source, fixture files, baseline, and checkpoint in `matrix-plan.json`; no retrieval command, embedding call, DB query, or NEW1 gold edit ran.

OPEN QUESTIONS:

- The uncontrolled production-haystack pass is not complete in this artifact.
- Halfvec retrieval impact, HNSW `ef_search` frontier impact, exact-route probe behavior, and High Court retrieval quality remain unmeasured.
- Sparse mode is PostgreSQL `ts_rank`, not BM25; no BM25 arm has run.

NEXT ACTION:

- When `MEDIUM_CLEAN` clears, run at most one bounded retrieval command at a time and preserve checkpoints. When `VECTOR_EXCLUSIVE` clears, do C3/D disposable vector work before halfvec retrieval arms.

## WORKSTREAM F — Devanagari / OCR Validation

STATE: SCALE PLAN PREPARED; selector/PDF/OCR execution pending  
STARTED: adopted 2026-08-17  
LAST CHECKPOINT: 2026-08-17 16:40 Asia/Dubai  
INPUT: `docs/DEVANAGARI_EXTRACTION_DEFECTS.md`, existing CX1 bake-off artifacts  
OUTPUT: `docs/ai/CX1_DEVANAGARI_BAKEOFF.md`, `scripts/cx1-devanagari-scale-plan.mjs`, `docs/ai/CX1_DEVANAGARI_SCALE_VALIDATION.md`, `docs/ai/cx1-devanagari-results/scale-validation-plan.json`, `docs/ai/cx1-devanagari-results/scale-validation-selector.sql`  
MEASURED FACTS:

- NEW2 measured roughly **0.54-0.58%** of documents carrying Devanagari; in a 1% sample, **65.1%** of Devanagari-bearing documents had one of three defects.
- CX1 bake-off found Poppler retained **0%** of Devanagari tokens in 32/32 sampled documents.
- CX1 prepared an offline scale-validation plan for **148** documents across **9** court/role strata. It prioritizes citation-bearing documents so OCR citation preservation can be measured rather than inferred.

OPEN QUESTIONS:

- OCR citation preservation was not proven because the routed subset contained no expected database citation strings.
- The prepared selector has not run; no additional PDFs were fetched and no additional OCR was run.

NEXT ACTION:

- Run the prepared selector and any OCR only after scheduler clearance; OCR promotion still needs citation preservation and five-state citation-harness verification.

## WORKSTREAM G — Silver Production Prototype

STATE: PROTOTYPE SMOKE AND SYNTHETIC FAILURE SMOKE COMPLETE; real replay pending  
STARTED: adopted 2026-08-17  
LAST CHECKPOINT: 2026-08-17 16:33 Asia/Dubai  
INPUT: `docs/ai/CX1_REAL_SILVER_BENCHMARK.md`, NEW2 follow-up compression/dictionary measurements  
OUTPUT: `scripts/cx1_silver_lib.py`, `scripts/cx1-silver-writer.py`, `scripts/cx1-silver-compact.py`, `scripts/cx1-silver-smoke.py`, `scripts/cx1-silver-failure-smoke.py`, `docs/ai/CX1_SILVER_PRODUCTION_PROTOTYPE.md`, `docs/ai/cx1-silver-results/prototype-smoke.json`, `docs/ai/cx1-silver-results/failure-smoke.json`  
MEASURED FACTS:

- Real Silver benchmark recommends court partitioning, year/date sorting, ZSTD 9, 128 MiB target objects, 32 MiB row groups.
- NEW2 later measured text compression on source-PDF extracted text at about **3-4x**, not synthetic **117.88x**; compact objects are mainly a request-count decision.
- Offline writer/compactor prototype is fenced to `C:/lawmind/cx1-lab` by default and writes only disposable lab payloads.
- Smoke fixture wrote **24 synthetic JSONL rows**, produced **12** writer objects, reran as `already_complete`, and compacted to **6** objects while preserving row count.
- Failure-injection fixture wrote **18 synthetic JSONL rows** after injecting stale final and temp manifests; writer and compactor repaired stale final manifests, removed stale temp directories, and refused an outside-lab output path.

OPEN QUESTIONS:

- Failure-injection coverage is synthetic and narrow; interrupted-process and disk-full cases remain untested.
- Real-corpus replay remains pending behind scheduler clearance and lane pressure.

NEXT ACTION:

- Add bounded real-corpus replay and failure injection under `C:/lawmind/cx1-lab`; keep it offline and do not integrate with Gold.

## WORKSTREAM H — Document-Classification Audit

STATE: OFFLINE SAMPLE AUDIT COMPLETE; larger selector prepared not run  
STARTED: 2026-08-17 17:04 Asia/Dubai  
LAST CHECKPOINT: 2026-08-17 17:07 Asia/Dubai  
INPUT: `docs/ai/new2-silver-proof/hc-class-sample-20260817.json`, `docs/ai/cx1-corpus-census/metadata-coverage.json`, `docs/HC_ORDER_TYPES.json`, `services/ingest/src/hc-classify.ts`, `services/ingest/src/hc-adjudicate.ts`  
OUTPUT: `scripts/cx1-document-classification-audit.mjs`, `docs/ai/CX1_DOCUMENT_CLASSIFICATION_AUDIT.md`, `docs/ai/cx1-classification-audit/classification-audit.json`, `docs/ai/cx1-classification-audit/sample-plan.json`, `docs/ai/cx1-classification-audit/residue-projection.csv`, `docs/ai/cx1-classification-audit/sample-selector.sql`  
MEASURED FACTS:

- The existing 200-document plain-variant sample remains the evidence base: **89/200 = 44.5%** unclassified, all from `DISPOSED*` / `CLOSED` methods.
- Plain HC source universe is **19,237,684** documents; if the spread-sample rate held, the unclassified residue would project to about **8,560,769** plain-source documents. This is indicative, not a corpus rate.
- The largest projected residue is `DISPOSED OFF`: **65/200 = 32.5%**, about **6,252,247** plain-source documents if the sample rate held.
- The held-corpus difficult subset recorded by the owner lane is about **1.72M** rows, including `DISPOSED OFF` 687,076, `DISPOSED OF` 497,294, `DISPOSED` 227,304, `DISPOSED OF NO COSTS` 115,541, `CLOSED` 54,241, and `ORDERED` 34,422.
- Existing owner-lane model pilot on 40 difficult documents span-verified **31/40** and found **7/40** quoted spans not present in the source; model labels remain candidate evidence only.
- CX1 prepared a read-only stratified selector by residue method, length band, citation band, and Devanagari-risk marker. It has not run.

OPEN QUESTIONS:

- Larger difficult-subset proportions by court/year/length/citation/script strata remain unmeasured.
- No additional model adjudication ran; no candidate labels were produced.
- Whether LCC/NEW2 should add a canonical candidate table remains an owner-lane decision after larger evidence, not a CX1 decision.

NEXT ACTION:

- Run `docs/ai/cx1-classification-audit/sample-selector.sql` only when scheduler permits `MEDIUM_CLEAN`; write selector stdout to disposable CX1 evidence and do not promote labels.

## WORKSTREAM I — Legal-Object Efficiency Audit

STATE: OFFLINE TRIAGE AUDIT COMPLETE; DB selectors prepared not run  
STARTED: 2026-08-17 17:14 Asia/Dubai  
LAST CHECKPOINT: 2026-08-17 17:20 Asia/Dubai  
INPUT: `.agents/triage-arguments.json`, `.agents/triage-authorities.json`, `.agents/triage-case_structure.json`, `.agents/triage-holding.json`, `.agents/triage-topics.json`, `docs/ai/LEGAL_OBJECT_PROGRAM.md`, `docs/ai/ENRICHMENT_REJECTION_TRIAGE.md`, `docs/SCHEMA_TRUTH.md`  
OUTPUT: `scripts/cx1-legal-object-efficiency.mjs`, `docs/ai/CX1_LEGAL_OBJECT_EFFICIENCY.md`, `docs/ai/cx1-legal-object-efficiency/triage-summary.json`, `docs/ai/cx1-legal-object-efficiency/router-proposal.json`, `docs/ai/cx1-legal-object-efficiency/task-summary.csv`, `docs/ai/cx1-legal-object-efficiency/kind-risk.csv`, `docs/ai/cx1-legal-object-efficiency/efficiency-selector.sql`, `docs/ai/cx1-legal-object-efficiency/llm-cost-selector.sql`  
MEASURED FACTS:

- Existing post-fix legal-object triage covers **4,119** candidate quote claims across `case_structure`, `holding`, `arguments`, `authorities`, and `topics`.
- **3,374 / 4,119 = 81.9%** claims verified; **745** rejected by span verification.
- Owner-labelled rejected mix is ingest **514**, model **216**, verifier **15**. The separate unexplained-drift bucket count is **219**.
- Fabrications caught and dropped by span verification total **35 / 4,119 = 0.85%** overall, concentrated in `case_structure`: **30 / 1,289 = 2.33%**.
- `case_structure.fact` is the highest-risk kind: **74 / 313 = 23.6%** rejected, **10 / 313 = 3.19%** fabrication, and **28 / 313 = 8.95%** model-owned bucket rate.
- CX1 recommendation candidate: keep `holding`, `arguments`, `authorities`, and `topics` eligible for the existing 1,000-document expansion plan; hold `case_structure` at 100 pending prompt/router rework and remeasurement.
- Single-grant runtime envelope on the **233,656** classified substantive baseline: all five tasks are about **5,192.4 hours** at 16s/document-task; running the four cleared tasks is about **4,153.9 hours**, deferring about **1,038.5 hours** of `case_structure` spend.

OPEN QUESTIONS:

- Live enrichment/token/latency slices by court/year/class/text-length remain unmeasured; selector SQL is prepared but not run.
- Per-task cost attribution remains not-yet-KNOW because `llm_calls` has no direct foreign key to `document_enrichments`; the prepared cost selector is coarse by day/model for `feature = extract`.
- Whether to change prompts, split `case_structure.fact`, or widen any task is an owner-lane decision, not a CX1 promotion.

NEXT ACTION:

- Run `docs/ai/cx1-legal-object-efficiency/efficiency-selector.sql` and optionally `llm-cost-selector.sql` only when scheduler permits `MEDIUM_CLEAN`; write stdout to disposable CX1 evidence and do not change prompts, enrichment rows, retrieval, or product behavior.

## WORKSTREAM J — Citation Graph Census

STATE: PREPARED NOT RUN; offline snapshot inventory complete  
STARTED: 2026-08-17 17:56 Asia/Dubai  
LAST CHECKPOINT: 2026-08-17 18:04 Asia/Dubai  
INPUT: `docs/SCHEMA_TRUTH.md`, `docs/TREATMENT_GRAPH_GAP.md`, `docs/ai/DATA_MOAT_PROGRAM.md`, `docs/ai/RETRIEVAL_PROGRAM.md`, `docs/ai/PRE_MIGRATION_RETRIEVAL_BASELINE.md`, `services/ingest/src/citations-cli.ts`, `services/ingest/src/citation-keys-cli.ts`, graph/currentness source files  
OUTPUT: `scripts/cx1-citation-graph-census.mjs`, `docs/ai/CX1_CITATION_GRAPH_CENSUS.md`, `docs/ai/cx1-citation-graph-census/citation-graph-census.json`, `docs/ai/cx1-citation-graph-census/snapshot-inventory.csv`, `docs/ai/cx1-citation-graph-census/priority-regions.csv`, `docs/ai/cx1-citation-graph-census/graph-census-selector.sql`  
MEASURED FACTS:

- CX1 did not query PostgreSQL or run citation extraction/resolution; this is an offline snapshot inventory and selector-preparation artifact.
- Existing measured snapshots are now hashed and validated from source docs. They are explicitly snapshot-aware because citation counts moved across 11-15 Aug corpus growth and migration work.
- Sentinel rows remain the first denominator hazard: schema truth records **625,748** sentinels, **598,759** real unresolved rows, and **112,241** resolved rows in one 13 Aug snapshot; sentinel rows are not unresolved citations.
- The highest-priority graph region remains unresolved currentness/treatment targets: `docs/TREATMENT_GRAPH_GAP.md` records **32** unresolved overruled/overruled_in_part/doubted targets after two fixes, down from 34.
- The prepared selector emits citation base counts, sentinel invariants, relationship distribution, degree buckets, court/year unresolved density, unresolved high-risk treatment targets, citation-key coverage, external-citation gaps, unresolved-key buckets, ambiguous-key buckets, yearless-key prevalence, parallel-alias multiplicity, and isolated held-authority counts.

OPEN QUESTIONS:

- The live graph census has not run; no corpus-current degree distribution, unresolved-key distribution, ambiguous-key distribution, yearless-key prevalence, parallel-alias multiplicity, isolated-authority count, or court/year density has been measured by CX1.
- Citation count is diagnostic only. It is not legal authority, ranking approval, or a substitute for citation verification/currentness.
- Do not duplicate LCC's active citation-key population job; `judgment_citation_keys` is derived state and must be measured without write work.

NEXT ACTION:

- Run `docs/ai/cx1-citation-graph-census/graph-census-selector.sql` only when scheduler permits `MEDIUM_CLEAN`; write stdout to disposable CX1 evidence and do not write aliases, citation rows, treatment rows, overruled status, or graph-ranking behavior.

## WORKSTREAM K — Premium Data Backend Shadow Lab

STATE: COMPLETE SAMPLE; synthetic only  
STARTED: 2026-08-17 17:48 Asia/Dubai  
LAST CHECKPOINT: 2026-08-17 17:51 Asia/Dubai  
INPUT: synthetic matters and observations for listings, duplicate source rows, unlinked observations, order upload, bench change, private filing, disposal, late-arriving old listing, and same-advocate same-date conflict  
OUTPUT: `scripts/cx1-premium-backend-lab.mjs`, `docs/ai/CX1_PREMIUM_DATA_BACKEND_LAB.md`, `docs/ai/cx1-premium-backend-lab/premium-backend-lab.json`, `docs/ai/cx1-premium-backend-lab/scenario-summary.csv`, `docs/ai/cx1-premium-backend-lab/hearing-pack-readiness.csv`  
MEASURED FACTS:

- Synthetic fixture covers **10** observations over **3** adopted matters and **1** unlinked court/CNR observation; no real party data, uploaded document, DB query, provider fetch, or model call is involved.
- Projection produced **8** linked timeline events, collapsed **1** duplicate observation, retained **1** unlinked observation outside adopted matter timelines, and projected **2** legal-document records.
- Latest-state projection detected **1** new order, **2** tomorrow hearing triggers for fixed date `2026-08-17`, and **1** same-advocate same-date conflict.
- Eight assertions pass: duplicate collapse, unlinked retention, next-hearing trigger, bench update, new-order detection, non-citable procedural order, citable judgment classification, disposed terminal state, and same-advocate conflict detection.
- The proposed shadow shape tested observation-first storage, matter-event projection after linking, latest-state cache derivation, and procedural/citable document separation.

OPEN QUESTIONS:

- The harness is synthetic and proves behavior shape only; it is not production evidence for matcher quality, provider reliability, notification safety, or premium product value.
- Owner lanes still need to decide observation schema, matcher confidence threshold, retention for unlinked observations, notification/API contract, and hearing-pack readiness surface.
- No canonical schema, API, UI, eCourts grant scope, matter row, `matter_events` row, briefing row, or citation state changed.

NEXT ACTION:

- If scheduler and owner lanes allow later, build a read-only replay selector/export around real adopted matters and cause-list/order observations; keep output disposable until LCC/RCC accept contracts.

## WORKSTREAM L — Disaster Recovery Drill

STATE: PREPARED NOT RUN; restore drill not executed  
STARTED: 2026-08-17 18:08 Asia/Dubai  
LAST CHECKPOINT: 2026-08-17 18:10 Asia/Dubai  
INPUT: `docs/ops/LOW_COST_BACKUP_ARCHITECTURE.md`, `docs/ai/CX1_ARCHITECTURE_PACKET_V2.md`, `docs/ops/migration/compare-final.json`, `docs/ops/migration/smoke-local.json`  
OUTPUT: `scripts/cx1-disaster-recovery-drill.mjs`, `docs/ai/CX1_DISASTER_RECOVERY_DRILL.md`, `docs/ai/cx1-disaster-recovery-drill/drill-plan.json`, `docs/ai/cx1-disaster-recovery-drill/acceptance-checklist.csv`, `docs/ai/cx1-disaster-recovery-drill/restore-smoke.sql`  
MEASURED FACTS:

- CX1 did not download R2 objects, run `pg_basebackup`, run `pg_verifybackup`, restore a data directory, start PostgreSQL, query Gold, or perform provider operations.
- The offline generator validates the existing Stage A rule: a backup is accepted only after `pg_verifybackup`, full restore into a different data directory, and LawMind smoke tests against the restored cluster.
- The generated checklist has **8** acceptance steps: source selection, object readback/hash, `pg_verifybackup`, disposable restore, restored-cluster smoke SQL, baseline comparison, RTO/RPO measurement, and cleanup.
- Existing migration compare baseline records **0 fail / 2 warn / 1 info** at `2026-08-17T01:59:41.871Z`.
- Existing local smoke baseline records **11 pass / 1 fail / 1 informational-null**; the full-text GIN-index planner choice remains a known baseline caveat, not DR proof.
- The prepared `restore-smoke.sql` is read-only and bounded for a restored disposable cluster. It emits database shape, extension versions, relation estimates, representative table samples, generated columns, citation alias probe, full-text probe, and vector readiness probe.

OPEN QUESTIONS:

- R2 object readback throughput, restored bytes, WAL replay duration, RTO, RPO, disk peak, and operator failure points remain unmeasured.
- A migration compare, local smoke, and object hash manifest are not enough to prove recoverability.
- The restore-smoke SQL must not be run against Gold; it belongs on a restored cluster on a non-production port.

NEXT ACTION:

- Run the Workstream L acceptance checklist only during a true `HEAVY` idle window with disposable restore storage under `C:/lawmind/cx1-lab/dr-restore`; do not clean up any canonical backup or Gold path until restore evidence is written.

## Global Open Questions

- Do not resume any high-write or heavy full-table work until the local cutover/freeze state is explicitly safe for it.
- Do not send bus handoffs for adopted results unless a main lane needs an actionable correction.
- Do not treat any CX1 population label as legal truth; NEW1/NEW2/LCC own final promotion decisions.
