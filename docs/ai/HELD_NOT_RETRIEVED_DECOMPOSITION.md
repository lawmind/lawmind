# WHERE THE GOLD JUDGMENT FALLS OUT — the 48.6% decomposed

**Owner: NEW1.** Measured 14 August 2026. Every number here was produced by
`pnpm --filter @lawmind/harness held:decompose`
(`services/harness/src/held-not-retrieved-cli.ts`), against the existing gold
set. **No new gold labels were invented for this work.**

---

## 0 · CORPUS SNAPSHOT AT MEASUREMENT TIME

A moving corpus invalidates a naive before/after comparison, so it is recorded
with the result rather than remembered.

| | |
| --- | --- |
| `judgments` | ~3,622,046 (pg_class estimate) |
| `judgment_chunks` | ~599,379 estimate · **620,300 embedded, exact** |
| `judgment_citations` | ~1,275,661 estimate |
| `judgment_paragraphs` | ~21,883,048 estimate |
| measured at | 2026-08-14T18:01:14Z |
| gold set | 288 classified queries, `failure-classify-checkpoint.jsonl` |
| benchmark generation | the run that produced 17.4% SUCCESS / 34.0% BADLY_RANKED / 48.6% HELD_NOT_RETRIEVED |

**Correction accepted from NEW3 (bus 0483):** the `judgment_citations` figure
above is a `reltuples` estimate and understates a fast-growing table — NEW3's
exact `count(*)` was **1,336,773** at 17:30 the same day. The estimates are
labelled as estimates in the tool's own output and are fine for orientation;
**an exact `count(*)` is what belongs in any benchmark denominator.** The
apparent 61k "drop" is estimate-vs-exact drift, not a deletion.

---

## 1 · THE TWO CUT POINTS, READ OUT OF THE CODE FIRST

`dense()` in `services/api/src/search/retrieve.ts` is a two-stage funnel, and
the stages truncate on **different units**:

| stage | constant | unit |
| --- | --- | --- |
| ANN fetch | `annDepth = CANDIDATE_DEPTH * 4` = **200** | **chunks** |
| judgment collapse | `CANDIDATE_DEPTH` = **50** | **judgments** |

The dense arm returns gold **iff `chunkRank <= 200` AND `judgmentRank <= 50`**.
Two independent failure modes wearing one name, with completely different fixes
— one is an integer, the other is a model. The whole point of this measurement
was to stop conflating them.

Ranks are computed by **sequential scan against ground truth**, not by asking
HNSW: at `ef_search = 200` the index's own recall@50 is ~96.9%, so an
ANN-derived rank would fold the index's miss rate into the number and make it
unattributable.

---

## 2 · THE RESULT

**140 of 140 `AUTHORITY_HELD_BUT_NOT_RETRIEVED` queries measured.**

| mechanism | n | % |
| --- | --- | --- |
| `SEMANTIC_RANKED_LOW` — genuinely far in embedding space | **124** | **88.6%** |
| `DENSE_OK_BUT_MISSED` — exact says in-pool, pipeline lost it | **16** | **11.4%** |
| `CANDIDATE_TRUNCATED_BY_ANN_DEPTH` | **0** | **0.0%** |
| `GOLD_NOT_EMBEDDED` | 0 | 0.0% |
| `UNKNOWN_CAP_SATURATED` | 0 | 0.0% |

### 2a · THE CHEAP FIX IS DEAD, AND IT WAS THE FAVOURITE

**`CANDIDATE_TRUNCATED_BY_ANN_DEPTH` is exactly zero.** Not one of the 140
misses is a case where the ranker scored gold inside the top 50 judgments and
the 200-chunk ANN fetch threw it away.

This was the hypothesis worth betting on before measuring — `annDepth` is a
single constant, `HNSW_EF_SEARCH` already equals it with "no margin at all" by
`retrieve.ts`'s own admission, and raising an integer is the cheapest
intervention imaginable. **It would have fixed nothing.** Recorded plainly
because the next person will have the same idea.

### 2b · `GOLD_NOT_EMBEDDED` is zero, which validates the benchmark's construction

Every gold judgment has embedded chunks, as `build-queries.ts`'s `embedded` CTE
requires. The benchmark is not quietly measuring the embedding backlog.

---

## 3 · HOW FAR OUT THE 124 ACTUALLY ARE — the actionable table

`judgmentRank` = gold's exact rank among all judgments by dense distance.

| judgment rank band | n | chunkRank p50 | chunkRank p90 | chunkRank max |
| --- | --- | --- | --- | --- |
| 1–50 (the `DENSE_OK` 16) | 16 | 50 | 86 | 164 |
| 51–100 | 20 | 110 | 155 | 570 |
| 101–200 | 24 | 224 | 412 | 693 |
| 201–500 | 21 | 455 | 780 | 1,023 |
| 501–2,000 | 26 | 2,172 | 3,926 | 5,095 |
| 2,001+ | 33 | ≥20,001 (scan cap) | — | — |

**Cumulative exposure — how many of the 140 misses land in the candidate pool
at a given depth:**

| `CANDIDATE_DEPTH` | misses now in-pool | | `annDepth` | gold chunk in ANN pool |
| --- | --- | --- | --- | --- |
| 50 *(today)* | 16 / 140 · 11.4% | | 200 *(today)* | 40 / 140 · 28.6% |
| 100 | 36 / 140 · 25.7% | | 500 | 68 / 140 · 48.6% |
| 200 | 60 / 140 · 42.9% | | 1,000 | 82 / 140 · 58.6% |
| 500 | 81 / 140 · 57.9% | | 2,000 | 92 / 140 · 65.7% |
| 1,000 | 93 / 140 · 66.4% | | 5,000 | 109 / 140 · 77.9% |
| 2,000 | 107 / 140 · 76.4% | | 10,000 | 117 / 140 · 83.6% |

**Both constants have to move together.** A judgment at rank 51–100 sits at
chunk rank ~110 (p50) but up to 570 (max), so `CANDIDATE_DEPTH = 100` with
`annDepth` left at 200 would still lose the tail of that very band.

### 3a · WHAT DEEPENING DOES AND DOES NOT BUY — state this before anyone builds it

Deepening converts an **invisible** failure into a **rankable** one. It does
not, by itself, put a single additional correct authority in front of an
advocate: a gold judgment moved from "absent" to "candidate rank 137" is still
not in the top 5.

> **Deepening the pool is a PRECONDITION for reranking to pay, not a fix.**

That is the honest framing, and it is also why the pairing matters: Q1.43
separately measured that `BADLY_RANKED` skews hard to near-misses (64/98 = 65%
at rank 6–20), which is the signal that a reranker has real headroom on this
corpus. Deepening feeds that same reranker 44 more reachable golds at
`CANDIDATE_DEPTH = 200` (60 vs 16).

**Neither is this lane's to ship.** `RING_PROGRAM.md` §NEW1.3 — *"Do not tune
RRF or fusion weights until a measurement settles it."* This measurement
settles where the failures are, not what the constants should be. It reports to
LCC as a measurement with a costed option, not as a change request.

### 3b · THE COST SIDE, HONESTLY INCOMPLETE

Not measured here, and required before any depth change ships:

- **Latency.** `retrieve.ts` records 10.7 ms median for the ANN at
  `ef_search = 200`. Under this session's live load the same shape took
  **19.2 s** — that is contention with NEW2's ingest fleet, not the algorithm,
  but it means a latency measurement taken today measures the fleet.
- **`ef_search` must rise with `annDepth`**, or pgvector silently returns fewer
  rows than the LIMIT (§5 below). Higher `ef_search` costs graph traversal.
- **Reranker cost scales linearly with pool size.** A cross-encoder over 200
  candidates is 4x the model time of 50, against Gate S1's 3-second budget.

---

## 4 · THE 16 THAT SHOULD HAVE BEEN IMPOSSIBLE

`DENSE_OK_BUT_MISSED`: gold whose nearest chunk is the **17th, 22nd, 29th,
40th** nearest chunk in a 620,300-chunk corpus, at **judgment rank 15, 18, 25**
— inside both cut points by a wide margin — and the pipeline returned neither.

A retrieval system losing a document it ranked 15th is not a ranking problem. It
is a defect, an index that is lying, or **a measurement artifact**. Three
candidate causes, each distinguishable:

1. **HNSW approximation loss.** ~3% expected at this setting; would not
   obviously produce 11.4%.
2. **RRF fusion displacement.** Arithmetic says a dense rank-15 judgment should
   survive to fused rank ~39 of 50 — but arithmetic said these 16 were
   retrievable too.
3. **`content_hash` duplicate collapse — and this one would be a
   BENCHMARK-VALIDITY finding, not a retrieval defect.** `hybridSearch` keeps
   one row per *document* (`if (seenHash.has(r.content_hash)) continue`). Its
   comment argues correctly that this is a collapse and not a silent drop: the
   kept row is byte-identical by sha256, so nothing an advocate could act on is
   lost. **But the benchmark compares IDs, not documents.** If a duplicate row
   of the gold judgment outranks it, the duplicate's *different* id survives the
   collapse, the gold id never appears, and the query is scored
   `AUTHORITY_HELD_BUT_NOT_RETRIEVED` — when the advocate was in fact shown the
   correct document. NEW2's ingest is known to carry duplicates.

### 4a · CAUSE 3 IS DEAD — MEASURED, AND IT VALIDATES THE BENCHMARK

Tested directly against the corpus, without running the pipeline at all
(`content_hash` is indexed — `judgments_content_hash_idx`, partial on NOT NULL —
so this is one cheap join, not a scan):

| population | gold ids | with a byte-identical twin | NULL `content_hash` |
| --- | --- | --- | --- |
| `DENSE_OK_BUT_MISSED` | 16 | **0** | 0 |
| `SEMANTIC_RANKED_LOW` | 122 | **0** | 0 |

**Not one gold judgment in the entire failure set has a duplicate, and every one
has a computed hash.** The duplicate-collapse artifact cannot be inflating any
failure rate this lane has published. This was the hypothesis most worth
worrying about — it would have meant the instrument was miscounting — and it is
refuted rather than assumed away. The benchmark is clean on this axis.

### 4b · ANN vs FUSION — STILL OPEN, AND WHY

That leaves causes 1 and 2 for the 16. `held:whymissed`
(`dense-ok-missed-cli.ts`) was built and launched to settle it by re-running the
pipeline in `hybrid` and `dense` modes, **and it did not complete.** Stated
plainly rather than left implied:

- One `hybridSearch` call exceeded **25 minutes** under the session's live load
  — against ~20 s/query for the same shape in Q1.46's arms run earlier the same
  day. CPU delta on the process was **0** with the embedder resident: I/O-blocked
  on the shared proxy, alive, waiting. NEW2 subsequently reported the machine
  had **rebooted at 22:27Z** and that a network fault had stalled the ingest
  fleet for two hours before that, which is consistent with what this run hit.
- The tool is **checkpointless**, so the kill cost nothing already measured.
  **That is a gap worth closing before it is re-run** — the same gap Q1.46 hit
  twice on `arms-cli.ts` and fixed there.

**The cheaper decisive measurement is designed and not yet run**: exact rank
says all 16 sit at `chunkRank <= 164`, so a correct top-200 ANN *must* contain
them. One ANN query per case (~19 s, no full pipeline) answers it —
ANN returns gold ⇒ the index is fine and RRF displaced it; ANN misses ⇒ HNSW
approximation loss at the setting production runs. **~5 minutes of DB time
total, versus the hours the pipeline route was costing.** Next session's first
retrieval task.

## 4c · THE 16, SETTLED — `held:annprobe`, 15 Aug 2026

**§4b's "next session's first task" — done.** `held:whymissed`
(`dense-ok-missed-cli.ts`) had no checkpoint and stalled >25 minutes on one
`hybridSearch` call under live load, per §4b. Built `held:annprobe`
(`services/harness/src/ann-probe-cli.ts`) instead: **one raw ANN query per
case**, production's exact `dense()` SQL and `SET LOCAL`s, no sparse arm, no
`hybridSearch` call. Checked `pg_stat_activity` first (2 active, 0
lock-waiters, 2.7s round trip) — not under severe load. 16 queries,
sequential, checkpointed to `ann-probe-checkpoint.jsonl`, ~4.5 minutes total.

**Result, 16/16, first run:**

| verdict | n |
| --- | --- |
| `ANN_MISS_HNSW_LOSS` | **0** |
| `ANN_HIT_JUDGMENT_COLLAPSED_OUT` | **0** |
| `ANN_HIT_JUDGMENT_IN_POOL` | **16** |

**HNSW approximation loss is RULED OUT for all 16** — the index at production's
`ef_search=200` returns gold's chunk within a few positions of the exact
sequential-scan rank every time (max drift 14, `hindi-a259ece9`: exact chunk 22
→ ANN chunk 36), and the judgment-collapse rank on ANN order alone lands at or
under 50 in all 16 cases (range 14–50, median ~30). **Candidate generation
(ANN-depth truncation) is RULED OUT too** — a second confirmation of
`CANDIDATE_TRUNCATED_BY_ANN_DEPTH = 0/140` from §2, now at chunk-order level.

**By elimination, plus one code read, not a full pipeline re-run:** §4a already
measured duplicate collapse dead (0/16 twins). `failure-classifier-cli.ts`
checks the fused, deduped, **`--depth 50`** output (its own default) — the same
50 `dense()` cuts at. With ANN alone placing gold inside that top 50 on its own
order, and duplicate collapse excluded, the only remaining place to fall out of
the FINAL top-50 is `retrieve.ts`'s `rrf()` step (unions dense + sparse
candidate IDs, scores `1/(RRF_K+rank)` per list, sums on overlap, sorts, slices
to `limit`) or the exact-pin step right after it. A gold judgment present ONLY
in the dense list at a mid-pack rank (14–50, median ~30) contributes a single
term, `1/(60+rank)` ≈ 0.011–0.015 — no better than any sparse-only or
both-list candidate near the top of either arm, and there is room for 50 of
those to outscore it.

**Labelled INFER, not KNOW.** The RRF mechanism was not independently
confirmed by running the sparse arm for these 16 and simulating the actual
fused comparison this session — that is cheap (`hybridSearch(sql, query, null,
{}, limit, 'sparse')`, no ANN) and is the one remaining gap if anyone wants
this closed to KNOW instead of INFER. Reported to LCC and NEW3 as a measurement
with a named mechanism, not a change request — `RING_PROGRAM.md` §NEW1.3
forbids tuning RRF or fusion weights from a measurement.

---

## 5 · A pgvector TRAP THAT COST ME A 7x-WRONG NUMBER — reusable by any lane

`dense()` sets `hnsw.ef_search = 200` and `hnsw.iterative_scan = relaxed_order`
inside its own transaction. A probe that does **not** set them runs pgvector's
**default `ef_search = 40`**, and pgvector then **silently returns fewer rows
than the LIMIT asks for** — no error, no warning.

Measured, same vector, same query, twice:

| session | ANN top-200 → distinct judgments |
| --- | --- |
| without the SET LOCALs (default `ef_search = 40`) | **14** |
| with production's SET LOCALs (`ef_search = 200`) | **93** |

The first number is wrong by 6.6x and looks entirely plausible. It was caught
only because a follow-up `LIMIT 1 OFFSET 400` came back empty — impossible if
the index had really returned what was asked for.

> **If you `ORDER BY embedding <=> $v LIMIT n` outside a transaction that
> `SET LOCAL hnsw.ef_search`, you are not measuring what production does.**

### 5a · AND A NEGATIVE RESULT, so nobody re-runs it

The **uncapped** exact form of the rank query
(`count(*) WHERE embedding <=> $v < $d`, no LIMIT) ran **over 9 minutes without
returning** for ONE query vector under this session's load, against ~19 s for
the ANN top-200 on the same connection. **Uncapped exact KNN ranking over
`judgment_chunks` is not viable on this database right now.**

The capped form (`LIMIT 20001` inside a subquery) answers the same cut-point
question and lets Postgres abort early — which is cheap for exactly this
population, because these are all misses and a far-away gold means matching
rows are dense. Both cut points stay exactly decided; only the *magnitude* of a
saturated case becomes a lower bound, and it is reported as one.

---

## 6 · WHAT IS NOT ON THE PRODUCTION PATH AT ALL

Verified by grep across `services/` and `apps/`, not by assumption:

- **`search/graph-expand.ts` has exactly one importer:
  `services/harness/src/retrieval.ts`.** `route.ts:202` calls `hybridSearch` and
  nothing else. **The citation graph — 1.3M edges — contributes zero candidates
  to production retrieval.** It is measured in the harness as an "enhancement"
  and has never been in the funnel.
- **Reranking is likewise harness-only.** `rerank-passages.ts` is not called by
  `hybridSearch`.

This matters directly to §3a: the reranker that deepening is a precondition for
**does not exist in production yet**. Anyone reasoning about production recall
as though graph expansion or reranking were helping is reasoning about the
harness.

NEW3's bus 0476/0483 adds a fourth path that is upstream of retrieval entirely:
**34.2% of unresolved citation edges point at judgments we already hold and fail
only on alias form.** A gold reachable by citation rather than by text could be
failing before retrieval is even consulted. Not measurable here; worth
re-baselining after LCC lands the ECT loader, and worth **not** attributing to
ranking before then.

---

## 7 · WHAT THIS DOES NOT MEASURE

Stated so the boundary is not mistaken for a result.

- **The sparse arm.** Gold's `ts_rank` position is not measured here. An
  OR-of-40-lexemes sort over 3.6M judgments is a far heavier query than a
  620k-vector scan; mixing them makes both slower and neither clearer.
- **Court / `hc_document_class` segmentation.** Still blocked by the same gate
  Q1.43 named: 238/238 gold judgments are Supreme Court because
  `build-queries.ts` requires an embedded chunk, and no High Court judgment is
  embedded.
- **Whether deepening actually improves anything.** §3 says how many golds
  become *reachable*. It does not say one word about whether they then get
  ranked into the top 5. That is the next experiment, and it needs a reranker.
