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
| 0.9 | Relaunch the walk on the worklist | RUNNING (relaunched 3x) | 864 files; started at batch 00010 which is the hole. Relaunched a second time at 17:06Z after nohup let it die with the session — now started via PowerShell Start-Process and watched by the keeper on SILENCE |
| 0.6 | Record measured throughput / vectors / malformed at adoption | DONE | 220,259 staged rows at batch 87 end; 8,676 tok/s; `nonUnitNormVectors: 0`; recipe `HEAD:4800`; model BGE-M3 onnx fp32 CLS-pooled L2-normalised |

## P1 — do not blindly embed an impure population

| # | task | state | evidence |
| --- | --- | --- | --- |
| 1.1 | Quantify what fraction of the Tier-A manifest is admitted ONLY by `decided_brief` | DONE | **ZERO.** All 205,731 `decided_brief` rows are in bands `stub` (105,236) and `brief` (100,495); Tier A takes only `standard`/`full`/`substantial`. Confirmed independently by a 409,647-row manifest sample: 0 occurrences. NEW2's "it is inside Tier A" is wrong. |
| 1.2 | What the manifest IS made of | DONE | uniform n=2,089: **82.5% never looked at** (class null, method null) · 8.5% a rule ran and declined (`unclassified_disposal:*`) · **6.9% `decided`** · 1.8% `bail_order` · 0.1% `procedural_disposal`. `docs/ai/new1-tier-a/purity-census.json` |
| 1.3 | The manifest is STALE against a moving predicate — 1.9% of it now carries a refused class | DONE | fixed at embed time: `doc-vector-embed.mjs` re-reads `hc_document_class` and skips the four refused classes, counted in `skippedNowIneligible` |
| 1.4 | Already-staged rows carrying a refused class | DONE | 34,370 moved to `new1_doc_vector_stage_refused` with `refused_class`, never deleted. Vindicated at 250k: 12 of 250 citation-verified gold authorities ARE bail orders |
| 1.5 | The 82.5% unclassified population has NEVER been audited for precision | TODO | this, not `decided_brief`, is the real purity exposure |

## P2 — one vector per canonical decision

| # | task | state | evidence |
| --- | --- | --- | --- |
| 2.1 | Confirm 1 vector per canonical decision, not 15.45 | DONE | 442,342 rows, 442,342 distinct `judgment_id` — the primary key enforces it. 441,996 distinct `content_hash`, so 346 rows (0.078%) are byte-identical texts that still got separate vectors; the old 15+/document design is gone |

## P3 — GPU scale milestones (100k / 250k / 500k / 1M / 2M)

| # | task | state | evidence |
| --- | --- | --- | --- |
| 3.1 | 100k | DONE | 0822: 100,489 vectors, 40/40 exact self-retrieval, 0 malformed |
| 3.2 | 250k | DONE | `milestone-250k.json`: 255,989 staged · 0 non-unit-norm · 0 null/zero-token · one recipe HEAD:4800 one model · 26 courts · self-retrieval 20/20 nearest, 20/20 top-3 |
| 3.3 | 500k | DONE | `milestone-520k.json`: 537,306 staged · 0 non-unit-norm · 0 null/zero-token · 26 courts · one recipe · self-retrieval 10/10 nearest and 10/10 top-3 |
| 3.4 | 1M | TODO | |
| 3.5 | 2M | TODO | |

## P4 — adaptive multi-vector policy

| # | task | state | evidence |
| --- | --- | --- | --- |
| 4.1 | Stratify by document band | DONE | four length bands over 228 HC proposition queries, 8,815 documents re-embedded in 5 positional windows each |
| 4.2 | 1-vector vs multi-vector, per band | DONE | rescoring the top-50 pool. ALL: s@5 21.49% -> 24.56%, MRR 0.1749 -> 0.1984, but **14 better against 18 worse** (sign p=0.597). No band significant: short p=0.146 (directionally WORSE), medium 0.453, long 1.000, very_long 1.000 |
| 4.3 | Name the bands that benefit | DONE — **NONE** | At these sample sizes no band shows a detectable benefit. Multi-vector makes ranking MORE VARIABLE: a few large rescues, rather more small demotions. Also 133 of 228 golds are outside the top-50 pool, so only 74 queries could move at all. `docs/ai/NEW1_MULTIVECTOR_BANDS.md` |

## P5 — halfvec verdict at REAL conditions (ef_search=200)

| # | task | state | evidence |
| --- | --- | --- | --- |
| 5.1 | Rebuild fp32 + halfvec probe arms | DONE | `probe-snapshot.mjs`; `new1_probe_fp32_250k` / `new1_probe_half_250k`, 256,998 rows each, m=16 ef_construction=64 |
| 5.2 | fp32 vs halfvec at ef_search=200 | DONE | paired sign test: no difference on any query type (p = 0.267 / 0.688 / 0.804); 94-97% of queries identical rank |
| 5.3 | Report task metrics, latency, index bytes | DONE (ANN recall still owed) | index 669 MB vs 2006 MB (3.0x) · p50 14 vs 41 ms · p95 232 vs 519 ms. ANN recall vs exact ground truth NOT measured — needs an exact scan on ~100 queries |
| 5.4 | Scoped verdict | DONE | `HALFVEC_QUALITY_PASS_AT_TEST_SCALE`, n=256,998. NOT production-ready: 34x smaller than Tier A. `docs/ai/new1-halfvec/VERDICT_250K.md` |

## P6 — HNSW build discipline

| # | task | state | evidence |
| --- | --- | --- | --- |
| 6.1 | Staging continuous, HNSW only at checkpoints | DONE | one build at the 250k checkpoint, on SNAPSHOTS, so the live stage table carries no index and keeps its insert rate |

## P7 — reranker reset

| # | task | state | evidence |
| --- | --- | --- | --- |
| 7.1 | Stop tuning the contaminated setup | DONE | 0831: 278/278 gold inbound-cited; 0853: three reranking routes, nothing gained |
| 7.2 | Consume NEW3 leakage-aware gold | DONE | uncited-authority gold (0899) loaded through the contract as `legal_object_claim` + `own_text_span`; statute-transition gold (0897) scored 11/11 |

## P8 — gold provenance / leakage contract

| # | task | state | evidence |
| --- | --- | --- | --- |
| 8.1 | Contract carries all P8 fields | DONE | `gold-contract.ts` + `new3-gold-adapter.ts`, 16 tests green |
| 8.2 | Enforce mechanically | DONE | `assertFeatureAllowed` THROWS `LeakageError`; pooling the three query types loses 3 of 8 feature families and the report says so |

## P9 — non-circular gold

| # | task | state | evidence |
| --- | --- | --- | --- |
| 9.1 | Guard legal-object gold against circularity | DONE (rule) | `legal_object_claim` provenance prohibits `verified_legal_object_match`. LCC manifest not yet loaded |
| 9.2 | Strip target identifiers; tag variants; group families | DONE | NEW3 redacts before emitting (`provenance.redacted`); the contract records the construction and `splitByFamily` groups on the authority. `own_text_span` added for the uncited set, which CANNOT strip — the query is the target own words — and it CAUTIONS dense as an upper bound |

## P10 — query-relative negatives

| # | task | state | evidence |
| --- | --- | --- | --- |
| 10.1 | Query-relative negatives | DONE (type) · population TODO | `Negative` in `gold-contract.ts`; no global negative id is representable. No negative population built yet — needs a gold with adverse-authority query types, which neither set has (all edges are `cites`) |

## P11 — leakage-safe reranker baseline

| # | task | state | evidence |
| --- | --- | --- | --- |
| 11.1 | Interpretable rescoring, allowed features only | DONE | `leakage-safe-rerank.mjs`. Best held gain +4.3pt s@5 on 70 queries = three queries; train delta 7.6pt, so half is fitting. sparseOnly BEATS denseOnly on s@5 and r@20 while losing on MRR — complementarity, argues for fusion not reranking. `docs/ai/new1-rerank/LEAKAGE_SAFE_BASELINE.md` |
| 11.2 | Candidate pools 50 / 100 / 200 | DONE | third independent replication: pool 50→200 lifts gold PRESENCE 31.4%→38.6% and leaves denseOnly success@5 at 22.86% at every depth |

## P12 — retrieval architecture

| # | task | state | evidence |
| --- | --- | --- | --- |
| 12.1 | The architecture, argued from measurements | DONE | `docs/ai/NEW1_RETRIEVAL_ARCHITECTURE.md`. Exact routes ALREADY EXIST and are pinned in every mode — I had said otherwise and corrected it in bus 0927/0928. The one box worth spending on is the fusion WEIGHT, and it must not default to 50/50: dense is better at rank 1, sparse at ranks 2-20 |

## P13 — expanded HC benchmark at semantic milestones

| # | task | state | evidence |
| --- | --- | --- | --- |
| 13.1 | Consume NEW3 verified semantic gold | DONE | 684 of 750 rows usable through the leakage contract; 66 dropped with recorded reasons |
| 13.2 | Score at each milestone with the full funnel | 250k DONE | funnel 228 source / 200 eligible / 187 embedded. proposition s@5 21.5% · case_title 5.7% · exact_citation 0.9%. **33 of 250 gold authorities (13.2%) are REFUSED by the eligibility contract — a ceiling throughput cannot lift.** Replicated on the uncited set: 3 of 26 (11.5%). `docs/ai/NEW1_EXPANSION_BENCHMARK_250K.md` |

## P14 — legal object layers

| # | task | state | evidence |
| --- | --- | --- | --- |
| 14.1 | document-only vs +holding vs +issue vs +proposition; marginal gain per extra vector | BLOCKED on population | LCC 0912: `verified_legal_object_match` covers **0.12% of judgments** and NOTHING carries a verified semantic role. A marginal-gain-per-extra-vector measurement over 0.12% of the corpus cannot generalise to the other 99.88%. Re-open when the population is material; the contract rule for it (P9.1) is already in place |

## P15 — currentness safety

| # | task | state | evidence |
| --- | --- | --- | --- |
| 15.1 | Hard test: no cached status anywhere in NEW1 | DONE — PASS | `currentness-safety.mjs`: 0 cached-status columns across 5 NEW1 tables, every vector table carries judgment_id, live join returns the status. 98 authorities have moved; 4 embedded so far |
| 15.2 | Keep treatment relation distinct from currentness interpretation | TODO | |

## P16 — BNS/BNSS/BSA

| # | task | state | evidence |
| --- | --- | --- | --- |
| 16.1 | Test pre-date / post-date / date absent / mapping ambiguity | DONE — 11/11 | `statute-transition-gold-cli.ts`. Both NO_PROVEN_MAPPING traps pass: IPC 420 and CrPC 154 return held:false with UNMAPPED wording, not a remembered mapping |

## P17 — cross-lingual

| # | task | state | evidence |
| --- | --- | --- | --- |
| 17.1 | Cross-lingual | DONE (already closed) + follow-up run | The language question was closed 19 Aug. Its open INFER — that a clean issue statement beats a citing passage — was tested and DOES NOT REPRODUCE: all three arms tie at 40% success@5. `docs/ai/new1-crosslingual/QUERY_SHAPE_ARMS.md` |

## P18 — eCourts evaluation

| # | task | state | evidence |
| --- | --- | --- | --- |
| 18.1 | Bounded live-state tests once LCC/NEW2 have valid observations | BLOCKED | no live observations yet; NEW1 does not harvest |

## P19 — product performance gate

| # | task | state | evidence |
| --- | --- | --- | --- |
| 19.1 | Latency for every candidate configuration | PARTIAL | dense-only 250k p50 41ms / p95 519ms; halfvec p50 14ms / p95 232ms; production hybridSearch 0.7s citation, 3.8s case name, 3.5s concept — all on a loaded box, so upper bounds. **One shape does not complete: a 900-char passage kept the sparse arm alive 32 minutes.** Handed to LCC, bus 0927 |


## PENDING AT SESSION END — 21 Aug 2026

| item | state | note |
| --- | --- | --- |
| Tier-A walk | RUNNING | 519,055 vectors staged, batch 00020 of an 864-file worklist, ~9,500 tok/s, contract hash asserted green each batch |
| Production-route benchmark over 456 short queries | RUNNING | killed twice by the session ending; relaunched detached via . The CORRECTION it exists to support is already established by three timed queries (citation 0.7s, case name 3.8s, concept 3.5s) |
| ANN recall vs exact ground truth (P5.3) | TODO | needs an exact scan on ~100 queries against  with the index disabled |
| 500k / 1M / 2M milestones (P3) | TODO |  |
| The 82.5%-unclassified purity audit (P1.5) | TODO | NEW2 is classifying ahead of the walk; the ineligible-rate trend in the milestone report is the signal to watch |
| Scheduled task for the keeper | BLOCKED — founder | admin rights;  |
