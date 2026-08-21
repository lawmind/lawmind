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

---

# NEW1 SESSION — 21 Aug 2026 (evening)

## S0 — adoption, not duplication

| # | task | state | evidence |
| --- | --- | --- | --- |
| S0.1 | Exactly ONE GPU sidecar | DONE | pid 23660 `services/embed/gpu/server.py --port 8799`; `/health` → `{"ok":true,"providers":["CUDAExecutionProvider",...]}`. The count of 5 my first query returned was my own PowerShell matching its own command text — the known self-match trap |
| S0.2 | Exactly ONE keeper | DONE | pid 26100 `sidecar-keeper.mjs`, parent 25924 (the dead launcher) |
| S0.3 | Exactly ONE logical coverage walk | DONE | ONE `stage-runner.sh` (pid 17320) and one batch worker beneath it. Lineage resolved: 25924 → 16232 → 27552 → 17320, Git-bash re-exec pairs are the same logical process, not duplicates |
| S0.4 | GPU utilization | DONE | 100% / 7,075 MiB at adoption; dips to ~59% only while my own DB queries contend |
| S0.5 | Staged-vector delta | DONE | 673,361 → **687,589** observed rising across the session, exact `count(*)`, not an estimate |
| S0.6 | Contract hash asserted | DONE | `5efa4c8decef699e` on every batch, 8 consecutive assertions before adoption |
| S0.7 | Coverage worklist, not highest batch | DONE | worklist **48/864**, batch lcc-00057. The batch NUMBER is 57 and the worklist POSITION is 48 — they are not the same and only the second is progress |
| S0.8 | Production-route benchmark: at most one | DONE | ZERO alive. `production-route-benchmark.json` complete (228 case_title + 228 exact_citation). Finite job, finished once. **Not relaunched** — per the standing rule it does not become permanent background load |
| S0.9 | Nothing launched | DONE | this session started no background job. Everything running was adopted |

## S1 — zero silent holes, proved rather than assumed

| # | task | state | evidence |
| --- | --- | --- | --- |
| S1.1 | Per-batch accounting closes | DONE | for every instrumented `STAGE DONE`: `inserted + alreadyStaged + nowIneligible + noText == rowsInBatch`. **114 of 114 close, 0 open.** 13 older records predate the counters and are excluded, not counted as passes |
| S1.2 | Explain the `inserted: 0` batches | DONE — NOT a hole | batches 10–36 show `inserted 0` with `alreadyStaged ≈ 9,750` and the arithmetic closing. That is correct dedup on a re-walk. The same batches earlier showed `alreadyStaged 8,396 / ineligible 1,597`; ineligible then fell to ~236 and 1,359 rows inserted — bail orders becoming reachable under LCC 0066, which is the 29,349 vectors restored in bus 0930 |

## S2 — trust composition (P2). NEW1 invents no tier and no private filter

| # | task | state | evidence |
| --- | --- | --- | --- |
| S2.1 | Use the CANONICAL vocabulary | DONE | `judgment_embedding_eligibility.semantic_tier` is a **VIEW**, so ELIGIBILITY_CONTRACT_V2 is read live. Vocabulary: `VERIFIED_SEMANTIC_CORE · BAIL_ORDER_REACHABLE · BROAD_SEARCHABLE · UNRESOLVED_EXPERIMENTAL · NOT_ELIGIBLE` |
| S2.2 | Composition of staged vectors | DONE | n=27,477 deterministic sample. **BROAD_SEARCHABLE 86.37% · BAIL_ORDER_REACHABLE 13.61% · UNRESOLVED_EXPERIMENTAL 0.03% · VERIFIED_SEMANTIC_CORE 0.00%.** `staged-trust-composition.json` |
| S2.3 | **Why VERIFIED_SEMANTIC_CORE is zero** | DONE — root cause found | **`script_quality` is NULL on 100% of the sampled staged rows.** The tier requires `decided` AND `script_quality IN ('clean','mixed_script_ok')`; NULL never matches, so all 38.06% of staged rows already classified `decided` fall through to BROAD_SEARCHABLE. The zero is an UNPOPULATED INPUT, not a quality verdict |
| S2.4 | Can canonical evidence identify the damaged rows today? | DONE — **NO** | the mid-turn instruction asked exactly this before any pause. `script_quality` is the canonical column and it is NULL for every staged row sampled, so it identifies nothing. My own 0936 estimate (50,108 of 542,980 unreadable, ~9.2%) came from an English-density method, which is precisely the private semantics I have been told not to act on |
| S2.5 | Pause the walk for known text damage? | DONE — **NO, keep running** | evidence-driven: there is no canonical predicate to exclude ON, so a pause would stop ~91% good work to avoid ~9% waste with nothing to resume against. Decision recorded, not assumed. **On `TEXT_UNSAFE_CONTRACT_READY`: recompute coverage → quarantine affected vectors (never delete) → resume from the census.** Precondition asked of LCC/NEW2: populate `script_quality` on the staged ids |

## S3 — GOLD_REACHABILITY_CEILING, now a first-class metric (P9)

`docs/ai/new1-tier-a/gold-reachability-ceiling.json`. The two golds are scored
SEPARATELY and never pooled — their retrieval jobs differ.

| gold | authorities | staged | ceiling | first binding clause |
| --- | --- | --- | --- | --- |
| citation-derived (NEW3 v2) | 228 | **198 (86.8%)** | **16 = 7.0%** | `TEXT_LENGTH_UNDER_2000` 15 · `TEXT_QUALITY_BELOW_0.85` 1 |
| uncited-authority (NEW3 v2) | 175 | **172 (98.3%)** | **0 = 0.0%** | — |

**The ceiling closed from 13.2% to 7.0%** on the citation-derived set. LCC's
BAIL_ORDER_REACHABLE recovered exactly the 12 bail orders bus 0916 priced, and
they now show as a tier rather than a refusal. What remains is almost entirely
the accepted length loss, so the residue is one decision, not a defect list.

## S4 — NEW3 v2 gold, checked before use (P5)

| check | verdict |
| --- | --- |
| arithmetic closes (v1 = v2 + quarantined, by row id) | **PASS** — nothing invented, nothing silently lost, no quarantined row survives |
| the 22 chronologically-impossible authorities from bus 0904 | **PASS** — all 22 quarantined, 66 rows, with reasons |
| mojibake / control chars in surviving query text (my own scan) | **PASS** — 0 survivors |
| date plausibility on survivors | **PASS** — 0 survivors with cited > citing |
| provenance method on every row | **PASS** |
| prohibited feature families on every row | **FAIL on the citation-derived set** — 0 of 684 rows carry them; the uncited set carries them on 175 of 175. Enforcement still happens, but in MY adapter, not in NEW3's file |
| redaction record on every row | **PARTIAL** — 228 `exact_citation` + 228 `case_title` rows have no `redacted` key at all |

## S5 — frontier coupling, per class (the guidance's explicit ask)

Sampled the eight batches the walk reaches NEXT, ~1,200 ids each:

classified 52.5 · 53.7 · 54.8 · 56.6 · 52.0 · 55.6 · 54.3 · 54.4 %

**Flat — no gradient**, and I drew the wrong conclusion from it. I first read
this as "~45% has never been looked at" and sent that to NEW2 in bus 0944. It is
**WRONG** and corrected in bus 0953.

I measured `hc_document_class IS NULL`. NEW2's frontier measures
`hc_class_method IS NULL`. A NULL class is the UNION of two populations — the
classifier never reached the row, or it reached the row and declined to assign a
class — and I reported the union as the first. Split, same batches, ~1,200 ids
each:

| batch | neverLookedAt | lookedButDeclined | classified |
| --- | --- | --- | --- |
| 00058 | 0.7% | 45.7% | 53.7% |
| 00059 | 0.5% | 44.7% | 54.8% |
| 00060 | 0.8% | 42.7% | 56.6% |
| 00061 | 0.7% | 47.3% | 52.0% |

**Never-looked-at is 0.5–0.8%.** NEW2's contiguous frontier holds on my
population and their 0946 lead figure — 14.94 points of id space, 41 hours,
widening 0.85h/h — is correct. Their decision not to raise classifier concurrency
is right on my evidence too.

This lane already had a standing note that unclassified is two populations that
want opposite work. I read one column and named the other anyway.

The corrected finding changes OWNER, not size: ~45% of what the walk embeds was
EXAMINED and the rules declined to classify it. That is vocabulary coverage, not
a frontier gap, and no throughput touches it. It is why 48.31% of staged rows
carry a NULL class — that composition number was always right; my reading of it
was not.

It also retires an old NEW1 figure: the purity census's 82.5% "never looked at"
(class null AND method null, n=2,089) is dead at 0.5–0.8% today. P1.5's exposure
is no longer "nobody has audited the unclassified" but "the classifier abstained
on 45% and nobody has asked why".

Per-class refusal, from the walk's own counters, is the reading that matters:
refusals are now **`procedural_disposal` ONLY, steady 2.03–2.65% across 25
batches**. `bail_order` has left the refusal set entirely (48,567 historical
refusals → 0). Pooled, that is a rate that "fell" — per class, nothing degraded
and a policy changed. Exactly the confound bus 0935 corrected.

## S6 — deferred with a reason, not forgotten

| item | why deferred |
| --- | --- |
| halfvec ANN-vs-exact at ef_search=200 (P4) | needs an HNSW build; probe tables were dropped. Build ONCE at the 1M checkpoint and serve BOTH this and S7 from it — P4 says do not rebuild before a meaningful checkpoint |
| expansion benchmark on v2 gold (P5/P6) | same index. `expansion-benchmark-v2.mjs` hardcodes the v1 gold path at lines 57/229 — parameterise before the checkpoint run |
| 1M milestone (P3.4) | ~687,589 now, ~32k/hr → roughly 10h out |

## S7 — the halfvec measurement is deferred BY THE GATE, with reasons

Session target 3 (halfvec ANN/exact closed at meaningful scale) is **not closed**,
and the reason is measured rather than preferred. We are past the `>=500k`
threshold P4 named — 691,874 staged — so scale is no longer the blocker. The
shared gate is:

```
DEFER  VECTOR_BUILD
       - CPU 68.6% > 50%
       - 13 active queries > 2
       - longest active statement 1367s > 120s
       - 17 ingest fleet process(es) writing — an index build wants the box to itself
DEFER  DB_SCAN
       - 13 active queries > 4
       - longest active statement 1367s > 120s
```

Four independent reasons, none of them mine to clear. `GPU_EMBED` also reads
DEFER at GPU 100% — correct, and it means "do not start a SECOND GPU job", not
"stop the adopted one".

**A trap worth recording:** run without `DATABASE_URL` exported and the gate
returns DEFER for both classes on *unreadability* — "PostgreSQL unreadable
(DATABASE_URL unset)". That is a different answer from DEFER on pressure and
must never be filed as the same thing. My first reading had exactly this defect
and the second reading replaced it.

Deferred work is now EXECUTABLE rather than merely postponed:
`docs/ai/new1-tier-a/CHECKPOINT_RUNBOOK_1M.md` — the gate check, snapshot
discipline (never index the live stage table), the one ANN-recall-vs-exact
method still owed, the three benchmark invocations, the funnel, and the
`TEXT_UNSAFE_CONTRACT_READY` procedure.

| session target | state |
| --- | --- |
| 1. GPU sustained with zero silent holes | **MET** — adopted not duplicated; 114/114 batches account closed, 0 open |
| 2. >=1M useful staged vectors | **IN FLIGHT** — 691,874, ~32k/hr, roughly 10h out |
| 3. halfvec ANN/exact closed at meaningful scale | **DEFERRED BY GATE** — scale reached, resources refused, runbook written |
| 4. clean expanded gold benchmark | **GOLD READY, RUN DEFERRED** — v2 verified independently, both sets load 684/175 with 0 dropped; the run needs the index |
| 5. fusion/ranking on leakage-safe diverse gold | **BLOCKED on 4** — same index |
| 6. eligibility ceiling reduced without lowering purity | **MET** — 13.2% -> 7.0%, and the floor was NOT lowered; LCC's bail route did it |
