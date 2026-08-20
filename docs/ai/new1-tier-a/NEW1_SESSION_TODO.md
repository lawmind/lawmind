# NEW1 SESSION TODO — 20 Aug 2026

State machine per item: `TODO` · `RUNNING` · `DONE` (observed) · `BLOCKED` (with
evidence). This file exists because a plan held in a todo tool does not survive
compaction. Update it as items move.

## P0 — adopt the GPU run

| # | task | state | evidence |
| --- | --- | --- | --- |
| 0.1 | Inspect for an existing embed job; adopt, do not duplicate | DONE | `nvidia-smi` 0% util, 977 MiB (desktop only), no `node`/`python` embed process. Run was DEAD, not running. |
| 0.2 | Find why it died | DONE | GPU sidecar on :8799 unreachable (`curl` exit 7). Last batch line `stage-embed.log` 07:16:20Z batch 00088 at 800/9990. No sidecar log existed — cause of death unrecoverable. |
| 0.3 | Restart sidecar WITH a log this time | DONE | `.agents/logs/new1-sidecar.log`, `/health` → `{"ok": true, "providers": ["CUDAExecutionProvider", ...]}` |
| 0.4 | Resume walk from batch 88 | DONE | `stage-runner.log` `=== 11:32:20 START lcc-00088` |
| 0.5 | Sidecar keeper — restart on death, so an 11-day run survives one | DONE | `services/harness/src/sidecar-keeper.mjs`, running; `.agents/logs/new1-sidecar-keeper.log` `keeper up — polling …/health every 20s` |
| 0.7 | **THE HOLE** — 67 batches (10..76) inside the walked range hold ZERO vectors | DONE (found) | `stage-coverage.json`: 888 files, **23 complete**, 8,622,700 rows missing. `stage-embed.log` has 100 STAGE START, 29 STAGE DONE, 69 FAILED. These are the batches the dead sidecar ate on 20 Aug. |
| 0.8 | Replace the RANGE walk with a COVERAGE walk so a hole can never survive again | DONE | `stage-coverage-census.mjs` (new) + `stage-runner.sh` `USE_COVERAGE=1` branch |
| 0.9 | Relaunch the walk on the worklist | RUNNING | |
| 0.6 | Record measured throughput / vectors / malformed at adoption | DONE | 220,259 staged rows at batch 87 end; 8,676 tok/s; `nonUnitNormVectors: 0`; recipe `HEAD:4800`; model BGE-M3 onnx fp32 CLS-pooled L2-normalised |

## P1 — do not blindly embed an impure population

| # | task | state | evidence |
| --- | --- | --- | --- |
| 1.1 | Quantify what fraction of the Tier-A manifest is admitted ONLY by `decided_brief` | DONE | **ZERO.** All 205,731 `decided_brief` rows are in bands `stub` (105,236) and `brief` (100,495); Tier A takes only `standard`/`full`/`substantial`. Confirmed independently by a 409,647-row manifest sample: 0 occurrences. NEW2's "it is inside Tier A" is wrong. |
| 1.2 | What the manifest IS made of | DONE | uniform n=2,089: **82.5% never looked at** (class null, method null) · 8.5% a rule ran and declined (`unclassified_disposal:*`) · **6.9% `decided`** · 1.8% `bail_order` · 0.1% `procedural_disposal`. `docs/ai/new1-tier-a/purity-census.json` |
| 1.3 | The manifest is STALE against a moving predicate — 1.9% of it now carries a refused class | DONE | fixed at embed time: `doc-vector-embed.mjs` re-reads `hc_document_class` and skips the four refused classes, counted in `skippedNowIneligible` |
| 1.4 | Already-staged rows carrying a refused class | TODO | 29,236 `bail_order` + 5,021 `procedural_disposal` of 217,756 manifest-sourced staged rows (15.7%) — delete or quarantine |
| 1.5 | The 82.5% unclassified population has NEVER been audited for precision | TODO | this, not `decided_brief`, is the real purity exposure |

## P2 — one vector per canonical decision

| # | task | state | evidence |
| --- | --- | --- | --- |
| 2.1 | Confirm the running manifest is 1 vector per exact-canonical decision, not 15.45 | TODO | LCC 0826: 8,846,550 representatives covering 9,691,284 identities — ratio looks right, verify against the stage table |

## P3 — GPU scale milestones (100k / 250k / 500k / 1M / 2M)

| # | task | state | evidence |
| --- | --- | --- | --- |
| 3.1 | 100k | DONE | 0822: 100,489 vectors, 40/40 exact self-retrieval, 0 malformed |
| 3.2 | 250k — verify attempted/written/dup/invalid/model/recipe/self-retrieval/util/tok-s/batch-time | TODO | 220,259 at adoption; ~3 batches away |
| 3.3 | 500k | TODO | |
| 3.4 | 1M | TODO | |
| 3.5 | 2M | TODO | |

## P4 — adaptive multi-vector policy

| # | task | state | evidence |
| --- | --- | --- | --- |
| 4.1 | Stratify HC docs: short/medium/long/very long × civil/criminal × court × era | TODO | prior work was SC-heavy; 0807 found TAIL and ISSUE layers contribute nothing |
| 4.2 | 1-vector vs selected structural multi-vector, per band | TODO | |
| 4.3 | Name the bands that measurably benefit; do NOT scale 5/doc globally | TODO | |

## P5 — halfvec verdict at REAL conditions (ef_search=200)

| # | task | state | evidence |
| --- | --- | --- | --- |
| 5.1 | Rebuild fp32 + halfvec probe arms (0881: probe tables were dropped) | TODO | |
| 5.2 | fp32 vs halfvec at ef_search=200, same recipe, same queries, same candidate count | TODO | |
| 5.3 | Report ANN recall@5/10/20/50, success@5, recall@20, MRR, nDCG, tail, p50/p95, index bytes | TODO | |
| 5.4 | Verdict must say `HALFVEC_QUALITY_PASS_AT_TEST_SCALE` unless the index is representative | TODO | |

## P6 — HNSW build discipline

| # | task | state | evidence |
| --- | --- | --- | --- |
| 6.1 | Keep staging continuous; build HNSW only at declared checkpoints | TODO | |

## P7 — reranker reset

| # | task | state | evidence |
| --- | --- | --- | --- |
| 7.1 | Stop tuning the contaminated setup | DONE | 0831: 278/278 gold inbound-cited; 0853: three reranking routes, nothing gained |
| 7.2 | Consume NEW3 leakage-aware gold when it lands | TODO | |

## P8 — gold provenance / leakage contract

| # | task | state | evidence |
| --- | --- | --- | --- |
| 8.1 | Every eval row carries query_id, query_type, gold_authority, gold_provenance_type, evidence, case_family, allowed/prohibited feature families | TODO | |
| 8.2 | Enforce mechanically: a prohibited feature must be refused, not merely documented | TODO | |

## P9 — non-circular gold

| # | task | state | evidence |
| --- | --- | --- | --- |
| 9.1 | Guard LCC legal-object gold against extract→embed→paraphrase→retrieve circularity | TODO | LCC 0890: manifest v2, 7,414 verified claims |
| 9.2 | Strip target case/citation from query; tag variants; group families in one split | TODO | |

## P10 — query-relative negatives

| # | task | state | evidence |
| --- | --- | --- | --- |
| 10.1 | Negatives keyed `(query_id, candidate_id, negative_reason)`; never a global negative id | TODO | |

## P11 — leakage-safe reranker baseline

| # | task | state | evidence |
| --- | --- | --- | --- |
| 11.1 | Interpretable rescoring on leakage-safe gold, allowed features only | TODO | |
| 11.2 | Candidate pools 50 / 100 / 200 — not 2,000 | TODO | 0815: 200→2,000 buys +15.7 pt presence, 0.00 pt success@5 |

## P12 — retrieval architecture

| # | task | state | evidence |
| --- | --- | --- | --- |
| 12.1 | exact routes + dense + sparse → union/dedup → reranker → currentness → evidence | TODO | do not force equal-weight RRF |

## P13 — expanded HC benchmark at semantic milestones

| # | task | state | evidence |
| --- | --- | --- | --- |
| 13.1 | Consume NEW3 verified semantic gold (0820: 250 HC authorities) | TODO | |
| 13.2 | Score at old universe / 250k / 500k / 1M / 2M — present? eligible? embedded? rank? | TODO | 0803: unreachable at 0.8% → 35.8% success@5 once Tier-A gives one vector each |

## P14 — legal object layers

| # | task | state | evidence |
| --- | --- | --- | --- |
| 14.1 | document-only vs +holding vs +issue vs +proposition; marginal gain per extra vector | TODO | LCC 0890 v2 gives the issue population that did not exist before |

## P15 — currentness safety

| # | task | state | evidence |
| --- | --- | --- | --- |
| 15.1 | Hard test: a set-aside authority must never present as currently good | TODO | LCC 0862: 8 edges linked, 6 rows now `set_aside` |
| 15.2 | Keep treatment relation distinct from currentness interpretation | TODO | |

## P16 — BNS/BNSS/BSA

| # | task | state | evidence |
| --- | --- | --- | --- |
| 16.1 | Test pre-date / post-date / date absent / mapping ambiguity | TODO | LCC 0835 `APPLICABILITY_UNRESOLVED`; 0877 `statute_mappings` = 226 rows |

## P17 — cross-lingual

| # | task | state | evidence |
| --- | --- | --- | --- |
| 17.1 | Resume the EXISTING checkpoint only; Hindi-query → English-authority, not OCR quality | TODO | |

## P18 — eCourts evaluation

| # | task | state | evidence |
| --- | --- | --- | --- |
| 18.1 | Bounded live-state tests once LCC/NEW2 have valid observations | BLOCKED | no live observations yet; NEW1 does not harvest |

## P19 — product performance gate

| # | task | state | evidence |
| --- | --- | --- | --- |
| 19.1 | Track quality, p50, p95, timeout rate, candidate count, DB time, rerank time, model time for every candidate production configuration | TODO | |
