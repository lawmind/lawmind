# NEW1 R14 — FINALIZATION

**Lane:** NEW1 · **Written:** 15 September 2026 · **HEAD at start:** `c36c853f`

The round the founder asked for: *is the embedding programme finished, and if so,
finalize it.* **It was finished.** The index that was supposed to follow it was
not built, and could not be on this machine — that is a measurement with a
mechanism, not an exhausted attempt. This records how both were established and
what the evidence does **not** say.

---

## 1. THE HYPOTHESIS WAS TRUE, AND THE OLD DENOMINATOR WAS NOT

The directive carried a last-known state of *"approximately 5.87M vectors"*.
That was stale in the favourable direction. Measured live this round:

```
new1_doc_vector_stage, all rows                8,160,672
  current generation 5b5d02384b46c96c          7,673,717
  legacy, SQL NULL (UNIDENTIFIED_LEGACY_V1)      486,955
```

The directive also said not to reuse the 7,654,179 denominator unless current
eligibility recomputes to that exact population. **It does not.** That number is
the 27 August representative cut, frozen. Recomputed against the deployed
`judgment_embedding_eligibility` view this round, eligible distinct content
identities are **7,673,702** — 19,523 larger, which is exactly the post-cut
delta the incremental queue produced. Both are reported below; the current one
is the one used.

### The four states, against LIVE eligibility

Measured in one pass, 13m00s, zero other active backends:

| state | value |
| --- | ---: |
| ELIGIBLE, documents | 8,442,638 |
| ELIGIBLE, distinct content identities | 7,673,702 |
| EMBEDDED, documents | 7,673,717 |
| EMBEDDED, distinct content identities | **7,673,702** |
| CONTENT_HASH_ALREADY_COVERED | 768,921 |
| QUEUED | 0 |
| EXPLICITLY_REFUSED *(inside the eligible population — see 3c)* | 0 |
| **UNNAMED_RESIDUAL** | **0** |

**The accounting closes exactly**: 7,673,717 + 768,921 + 0 + 0 = 8,442,638.

`uncovered_distinct_content = 0` and `uncovered_documents = 0`. Not "close to
zero" — zero, against a denominator recomputed at the moment of measurement.

**This is CASE A.** The snapshot is terminal. No residual to chase, no
eligibility relaxed, no row marked embedded that was not.

---

## 2. THE BACKGROUND WORK WAS ALREADY RETIRED, AND THE LEASE WAS NOT

A prior NEW1 session retired the completed workers on 10 September, correctly
and with reasons, in `.agents/jobs/registry.jsonl`:

```
new1-coarse-walk        FINISHED   "Full coarse embedding frontier is complete"
new1-doc-vector-embed   FINISHED   "8,156,545 staged rows; future arrivals use the delta queue"
new1-gpu-sidecar        FINISHED   "delta-queue now starts and stops an owned sidecar"
new1-sidecar-keeper     FINISHED
new1-coarse-telemetry   FINISHED
new1-delta-queue        RUNNING    <- the incremental path, deliberately kept
```

Task Scheduler agrees: `Lawmind-new1-coarse-walk`, `-coarse-telemetry`,
`-sidecar-keeper` and `-worker-truth` are **Disabled**; `-delta-queue` is Ready
and fires every 15 minutes.

### The incremental queue proved itself by working, not by idling

For most of this round the queue reported `queue_nothing_to_embed` with
`QUEUED: 0` every fifteen minutes, which is the weakest possible evidence of
health — a dead queue and an idle one produce the same line.

Then NEW2 ingested. At **16:59:04Z** the queue emitted **109** documents, started
an owned GPU sidecar, embedded them and stopped the sidecar again; at
**17:14:06Z** it emitted **849** more. The watermark advanced from
`2026-09-14T14:08:10.740Z` to `2026-09-15T17:06:22.540Z` and the stage table grew
from 8,160,672 rows to **8,161,630** (current generation 7,673,717 -> 7,674,675).

So `INCREMENTAL_QUEUE = HEALTHY` is a statement about observed work: new
judgments arrived, were picked up within one tick, embedded, and the GPU was
released again. The bounded sidecar lifecycle that replaced the persistent keeper
on 10 September did exactly what it was retired in favour of doing.

**A consequence worth stating plainly: the census in section 1 is a SNAPSHOT and
the corpus has already moved past it.** That is correct behaviour, not drift —
`terminal-census.json` carries `measuredAt`, and "terminal" describes the coarse
backfill reaching its frontier, never a corpus that has stopped growing.

**What was stale was the lease, not the work.** `HEAVY_BOX` still read `HELD` by
NEW1 session `bff58c23`, pid 2136 — a process not in the table, heartbeat 5.9
days old, describing a walk that had since completed. Re-taken by the same lane
with the reason recorded.

> A running PID is not proof of unfinished work and an absent PID is not proof
> of completion. Here the registry, the scheduler and the durable row count all
> said the same thing and the lease said something else. The lease was wrong.

---

## 3. THE FINAL PREDICATE — every clause, measured this round

| clause | verdict | evidence |
| --- | --- | --- |
| `SNAPSHOT_HASH_SCHEMA_REPRODUCIBLE` | **YES** | `sha256(pg_get_viewdef(judgment_embedding_eligibility, true))[0:16]` recomputed live -> `5b5d02384b46c96c` |
| `SNAPSHOT_HASH_WRITER_EXPLICIT` | **YES** | `doc-vector-embed.mjs` names `snapshot_hash` in the INSERT column list; `information_schema` reports **no column default** |
| `ACTIVE_SNAPSHOT_ID_IMMUTABLE` | **YES** | one non-null label in the table; `embedding_snapshot` holds exactly one `ACTIVE` row; two triggers enforce bind + freeze |
| `MODEL_REVISION` | **UNKNOWN** | not recoverable — see 3a |
| `MODEL_LOCAL_FILES_HASHED` | **YES** | all five re-hashed this round, byte-identical to the R12 manifest |
| `CURRENT_SNAPSHOT_DUPLICATE_IDENTITY` | **0** | `judgment_id` is UNIQUE by primary key — enforced, not observed. See 3b for the separate content-hash finding |
| `INVALID_DIMENSION` | **0** | all 7,673,717 rows `vector_dims = 1024` |
| `NONFINITE_VECTOR` | **0** | no NULL, no zero-norm, no non-finite |
| `UNEXPECTED_NONUNIT_VECTOR` | **0** | fp32 norms span 0.9999998–1.0000002; halfvec norms 0.99991–1.00009 |
| `UNNAMED_RESIDUAL` | **0** | section 1 |
| `DELTA_OLDEST_PENDING_AGE` | **none** | watermark `2026-09-14T14:08:10.740Z` **equals** `max(judgments.created_at)` to the microsecond |
| `ONE_GPU_WRITER` | **ZERO** | embedding has terminated; there is no GPU writer at all |
| disk headroom | **PASS** | 160.8 GiB free on the NVMe holding `C:/lawmind/pgdata`, against a projected 19.47 GiB index |
| memory | **PASS, and this is the clause that mattered** | 10.0 GiB free at the decision; `maintenance_work_mem` set **session-locally** to 4 GB, never globally |

`HNSW_BUILD_AUTHORIZED = YES`.

**A note on the memory clause, written after the fact and kept here rather than
quietly corrected.** The directive's test is *"derive session-local maintenance
memory from CURRENT machine headroom"*, and that is what was done: 10.0 GiB free,
4 GB allocated, session-local. The clause passed on its own terms and the build
was authorised correctly.

What the clause does **not** ask, and what nobody had asked before this round, is
whether the available headroom is enough for the build to **finish**. It was not,
and the gap is a factor of 1.7. That question was only answerable by building —
the requirement (19.52 GiB) and the ceiling (11.7 GiB available) were both
measured during the attempts, not before them. A predicate that authorises a
start is not a predicate that predicts an end, and section 4 is what happened
next.

### 3a. `MODEL_REVISION` is UNKNOWN, and the fallback condition is met

The directive permits UNKNOWN provided off-machine model identity evidence is
established. It is. The reason the revision cannot be recovered is stronger than
a missing note: the local `onnx/model.onnx_data` matches **no** upstream
revision — it is the pinned-revision file with 42,988 of 2,266,820,608 bytes
different. Four of five files pin cleanly to
`4de13258303883538bd53b696b452bf8099f0858`; the weights do not, so recovery is
not claimed (`docs/ai/new1-r12/model-revision-recovery.json`).

The corpus is sound — stored vectors reproduce at cosine 1.000000 from the local
weights — and the pack is off-machine in R2, 7 files, 2.13 GB, every object
downloaded back and compared byte-for-byte with 0 differences. **The risk is
query-corpus divergence, not corpus damage:** a fresh container fetching
upstream would embed queries into a measurably different space and nothing would
error.

### 3b. Fifteen content-hash collisions, named rather than deleted

`DUPLICATE_IDENTITY` on the table's own row identity is zero and cannot be
otherwise: `new1_doc_vector_stage_pkey` is UNIQUE on `judgment_id`.

A **different** count is 15: fifteen `content_hash` values carry two rows each
in the current generation, 30 rows in all, 0.0002% of the generation. Every pair
is two **distinct** judgments with byte-identical text, embedded days apart,
where `embedding_content_representative.member_count` reads 1 — the
representative row names one of them and the other already had a vector from an
earlier pass.

These were **not deleted.** Deleting the non-representative row of each pair
would satisfy a metric by costing fifteen real documents their reachability,
which is the wrong trade in a corpus whose whole failure mode is a document held
and invisible. They are recorded here, in the census artifact, and in the
completion receipt.

---


## 3c. `EXPLICITLY_REFUSED = 0` does not mean nothing was refused

The four-state census reports `EXPLICITLY_REFUSED = 0`, and read alone that
sentence is wrong in a dangerous direction. It counts refusals **inside the
eligible population**, and there are none because every eligible document is
covered.

The walk refused **72,099** documents and every one of them has a named row in
`new1_doc_vector_stage_refused`:

```
text_unsafe:damaged_other   67,071
procedural_disposal          5,021
legacy_font_ascii                5
damaged_other                    2
```

Measured separately this round: of those 72,099, **0 are Tier-A eligible under
the live predicate** and **0 lack an eligibility row**. So the walk's refusal
classes and the view's axes agree on all 72,099 — two independent mechanisms,
same verdict, no document sitting in the gap between them. That is the check
worth having; the bare zero is not.

---

## 4. THE INDEX — one abandoned attempt, and what it measured

Form copied, not chosen — identical to the R10 probe indexes and to the four
measured builds, so the measured 2,731 bytes/vector describes the same object:

```sql
CREATE INDEX new1_doc_vector_stage_hnsw ON new1_doc_vector_stage
  USING hnsw (((embedding)::halfvec(1024)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE (snapshot_hash = '5b5d02384b46c96c');
```

The partial predicate is what keeps the 486,955 pre-stamp legacy rows out. They
are a SEALED generation of unknown provenance, and mixing them into the graph
would put unidentified vectors into the same search space as the corpus.

**Plain `CREATE INDEX`, not `CONCURRENTLY`.** The policy leaves this open and
names the question that decides it: must the delta queue keep writing during the
build? It must not — the walk is terminal and the queue has emitted zero rows on
every pass for over a day. This was then **observed rather than assumed**: the
queue fired at 09:59:10Z, mid-build, and completed a normal empty pass, and has
kept firing every fifteen minutes since.

### Attempt 1 — 4 GB, 4 workers — CANCELLED at 52.5%

`INDEX_CUT_AT 2026-09-15T09:51:39.174Z`. Ran 4h55m, reached 4,026,507 of
7,673,717 tuples, and was cancelled deliberately because it was **not going to
finish**. Measured clean, with no other active backends:

| tuples done | tuples/s |
| ---: | ---: |
| 1.61M → 1.68M | 233 |
| 4.00M → 4.01M | 31 |
| 4.02M → 4.03M | **24.7** |

A 9.4x decay between 1.6M and 4.0M elements, still falling. At 24.7/s the
remaining 3.65M tuples needed **41 hours and rising**.

**The R10/R11 projection of 0.67h–2.91h does not describe a 7.65M-row build.**
Its "fully spilling" endpoint extrapolates a 1M-row rate as if the post-spill
insert rate were constant; it is a function of how large the graph already is and
decays inside a single build. The memory model was exact — the spill fired at
1,571,661 tuples against a prediction of 1,571,676, fifteen tuples out — so only
the rate model was wrong. Full correction and the diagnosis:
`HNSW_BUILD_COST_AT_SCALE.md`.

The cancel was a clean `pg_cancel_backend`, and the table was verified intact
afterwards: 8,160,672 rows, 7,673,717 current-generation, and
`new1_doc_vector_stage_pkey` the only index. Nothing was dropped or corrupted.

### Attempt 2 — 8 GB, 10 workers

The diagnosis, not the disappointment, chose the second configuration. During the
slow phase attempt 1 read at **58–76 MB/s with 0.00 avg sec/read and 27% CPU
across five processes** — roughly 9,500 random 8 KiB reads per second, far below
both the NVMe's ceiling and CPU saturation. It was limited by **read
concurrency**, so more parallel workers convert directly into more concurrent
reads, and a larger `maintenance_work_mem` moves more of the work off that path
entirely.

`maintenance_work_mem = 8 GB`, session-local, derived from 11.4 GiB of measured
free physical memory after the cancel — never global, so autovacuum and the
retrieval path are untouched. `max_parallel_maintenance_workers = 10`, and ten
workers were confirmed allocated rather than assumed.

**The diagnosis was wrong, and the refutation is the result.** Post-spill, 10
workers ran at **24.2 tuples/s** against attempt 1's 24.7 — while doing 2.3x the
disk reads (21,818/s against ~9,500/s, 180 MB/s against 58–76 MB/s). Two and a
half times the workers, the same throughput. That is a serialisation point, not a
concurrency limit: once the in-memory graph is exhausted the remaining tuples go
in through the ordinary index-insert path and the extra workers contend on the
same structure. Pre-spill they were actively worse — 1,303–1,644 tuples/s against
attempt 1's 2,695–3,249 on four workers.

Cancelled at 15:39:02Z, 41.2%, projecting 43 hours. The table was verified intact
again: 8,160,672 rows, `new1_doc_vector_stage_pkey` the only index.

### The requirement, and the ceiling

The spill point is now confirmed twice and the two agree to four decimal places:
**2,731 bytes per tuple, in memory exactly as on disk.** 4 GiB spilled at
1,571,661 against a prediction of 1,571,676 (15 tuples out); 8 GiB spilled at
3,144,795 against 3,145,346 (551 out, 0.018%).

So the build needs **7,673,717 x 2,731 = 19.52 GiB resident.** Measured on this
box with nothing building: 31.7 GiB total, **11.7 GiB available**, of which
11.6 GiB is reclaimable standby cache; ~20 GiB is in use by processes and kernel.
With 8 GiB committed to the build, free physical memory fell to 4.2 GiB.

`shared_buffers` is 2 GiB and raising it is a **global** PostgreSQL memory change,
which this round is explicitly not permitted to make.

**`HNSW_BUILD = NOT COMPLETED`, and it is not completable on this machine.**
Parallelism is not the lever; residency is the only lever; and the gap between
19.52 GiB required and 11.7 GiB available has no setting that closes it. Full
mechanism and both rate curves: `HNSW_BUILD_COST_AT_SCALE.md`.

A third attempt was **not** spent on another doomed full build. The measurement
already says what any memory setting between 8 and 11 GiB would do — 39 hours and
rising — and re-measuring a known answer is not a recovery attempt. The hardware
requirement is in `docs/FOUNDER_QUEUE.md` as **FQ-NEW1-R14-RAM**, and the lane
kept going.

---

## 5. PHASE 5 AT THE SCALE THAT EXISTS

`new1_probe_hnsw_1000000_hnsw` is 1,000,000 rows of the same generation under the
**identical** index definition — `halfvec(1024)`, `halfvec_cosine_ops`, m=16,
ef_construction=64, partial on `snapshot_hash = '5b5d02384b46c96c'`. It is the
largest object of the approved form that exists, so the exact-vs-ANN evaluation
was run against it rather than skipped.

**It describes the FORM, not the full-generation index.** Recall and latency both
move with graph size. Every artifact records the table, the index and the row
count, and `ann-evaluation-probe1m.json` carries an explicit `scaleWarning` so a
1M figure can never later be read as a 7.67M figure.

Both baselines are taken, because there are two different losses: a sequential
scan in the index's own `halfvec` representation isolates **graph** loss, and a
sequential scan on the stored fp32 vectors gives **total** loss including
half-precision quantisation. `hnsw.ef_search` and `hnsw.iterative_scan` are SET
and read back on every measurement, never inherited — an ad-hoc vector query runs
at pgvector's default 40 while production runs 200.

### 5a. Half precision costs nothing measurable

| `ef_search` | recall@10 | recall@50 | recall@100 | | recall@10 | recall@50 | recall@100 |
| ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| | *vs exact halfvec (graph loss)* | | | | *vs exact fp32 (total loss)* | | |
| 40 | 0.5806 | 0.4942 | 0.3290 | | 0.5806 | 0.4942 | 0.3290 |
| 64 | 0.6424 | 0.5724 | 0.4768 | | 0.6424 | 0.5724 | 0.4768 |
| 100 | 0.7081 | 0.6471 | 0.5996 | | 0.7081 | 0.6471 | 0.5996 |
| 200 | 0.7947 | 0.7555 | 0.7170 | | 0.7947 | 0.7556 | 0.7170 |
| 400 | 0.8668 | 0.8383 | 0.8112 | | 0.8668 | 0.8384 | 0.8113 |

283 of 283 queries in both arms — **no subsetting**, so there is no sampling
caveat on these figures.

**The two baselines agree to four decimal places at every setting**, differing in
the fourth place twice out of fifteen pairs. Every point of recall lost is lost by
the **graph**; half-precision quantisation costs nothing that this measurement can
detect. That is the question `CX1_HALFVEC_FIDELITY.md` answered on copied vectors
at 100,000 pairs, now answered again end-to-end through a real index.

### 5b. Latency, and what the index is actually worth

| `ef_search` | warm p50 | p95 | p99 | cold-ish p50 | p95 | p99 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 40 | 2 ms | 3 | 4 | 6 ms | 74 | 200 |
| 64 | 3 ms | 4 | 5 | 6 ms | 15 | 19 |
| 100 | 4 ms | 6 | 9 | 10 ms | 20 | 32 |
| 200 | 6 ms | 10 | 16 | 15 ms | 32 | 49 |
| 400 | 11 ms | 32 | 55 | 29 ms | 99 | 171 |

Exact sequential scan over the same million rows, same queries: **halfvec p50
7,196 ms / p95 21,200 ms**, **fp32 p50 3,697 ms / p95 9,057 ms**. At production's
`ef_search = 200` the index is roughly **1,200x faster** than the exact baseline
it approximates.

"cold-ish" is the first touch of each query at that setting and "warm" is an
immediate repeat; the index is 2,603 MB against 2 GiB of `shared_buffers`, so
neither is a true cold cache and both are labelled rather than averaged together.
The ef=40 cold p99 of 200 ms is the first sweep paying for everything the later
sweeps found in cache.

### 5c. FILTERED SEARCH IS THE FINDING

pgvector applies a non-indexed predicate **after** the index scan. Filtered to
one court holding **169,952 of 1,000,000 rows — 17.0%, not a narrow filter**:

| `ef_search` | `iterative_scan = off` | | | | `= relaxed_order` | | |
| ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| | zero results | short of k | mean rows | | zero | short of k | mean rows |
| 40 | **137 / 283** | 146 | 2.68 | | 0 | 0 | 100.00 |
| 64 | **112 / 283** | 171 | 4.43 | | 0 | 0 | 100.00 |
| 100 | **83 / 283** | 200 | 7.25 | | 0 | 0 | 100.00 |
| 200 | **41 / 283** | 240 | 15.44 | | 0 | 0 | 100.00 |
| 400 | **17 / 283** | 249 | 31.90 | | 0 | 0 | 100.00 |

**At production's `ef_search = 200` and pgvector's default `iterative_scan = off`,
41 of 283 filtered queries return nothing at all, and 240 of 283 return fewer
results than asked for — a mean of 15 rows where 100 were requested.** Raising ef
to 400 still leaves 17 queries empty.

`relaxed_order` fixes it completely — 0 empty, 0 short, 100 rows every time — and
costs the latency the speed table was celebrating: p50 **101–170 ms** and p95
**251–1,050 ms**, against 6 ms and 10 ms unfiltered at ef=200. Roughly a hundredfold.

> **This is the failure `NEW1_COVERAGE_STATE_CONTRACT.md` exists to prevent,
> arriving from inside the index instead of from acquisition.** An advocate
> filtering to their own High Court would be shown an empty screen, and nothing
> about that screen would distinguish "we hold no such law" from "the graph
> stopped looking". The contract's rule — that a zero result and an absence of
> authority must never be indistinguishable — is violated by a *default setting*,
> not by a coverage gap.

The remedy is a setting, not a rebuild, and the trade-off is now measured rather
than argued. **This lane is not choosing it here**: it is a latency-versus-
completeness decision that touches the retrieval contract, and the numbers above
are at one million rows.

### 5d. Known-target retention, and what it is not

| `ef_search` | 40 | 64 | 100 | 200 | 400 |
| --- | ---: | ---: | ---: | ---: | ---: |
| gold in top-100 | 0.1702 | 0.2553 | 0.3191 | 0.3191 | 0.3191 |

Over **47 queries**, not 283. Only 47 of the 278 distinct gold judgments are in
this one-million-row sample at all, and a target that was never in the table
cannot be retained — so the other 236 queries are **excluded rather than scored as
misses**. An earlier version of this harness mapped gold to `content_hash` and
compared it against the probe's `judgment_id` identity; that can only ever return
zero, and it did. The corrected figure replaces a 0.0000 that was a bug.

**It plateaus at ef=100 while recall@100 keeps climbing to 0.81.** So the 68% that
are missing are not missing because the graph stopped looking — they are not in
the top 100 by cosine at all. That is a statement about the representation and
the query set, not about the index, and it is the reason this number is reported
separately from recall rather than folded into it.

### 5e. No `ef_search` is selected, deliberately

The directive says to pick the smallest `ef_search` that meets **the existing**
recall bar, and not to invent one. **There is no existing bar.** Searched:
`NEW1_CX1_BENCHMARK_CONTRACT.md`, `INDEX_CUT_POLICY.md` (which mandates the
measurement and sets no threshold), and the release-gate metrics in
`NEW1_LOCAL_RETRIEVAL_BASELINE.md` and `NEW1_POST_0055_BASELINE.md` — the
threshold-1 gates there are `structuredExactness`, `fieldPrecision` and
`adversarialPassRate`, none of which is ANN recall.

So the Pareto frontier above is the answer and **`SELECTED_EF_SEARCH = NOT
SELECTED`**. Inventing a bar now, on 1M-row numbers, to justify a setting for an
index that does not exist, would be three mistakes in one sentence.

---

## 6. PRODUCT BOUNDARY

**`PUBLIC_SEMANTIC_SEARCH = DISABLED`, by construction rather than by restraint.**

`services/api/src/search/retrieve.ts` reads `judgment_chunks` UNION
`new1_tranche_passages`. **`services/api/src/search/` contains zero references to
`new1_doc_vector_stage`**, and there is no index on that table for it to read.
Nothing in this round could have enabled semantic search even by accident.

Checked rather than assumed, and the check found something better than absence.
The table IS named in `services/api/src/ops/`, in exactly three places and all
three are refusals:

- `db-roles.ts` lists it among the tables a role may not reach past,
- `release-export-cli.ts` calls it *"factory scratch"* and refuses to export it,
  recording that promoting the staged vectors is not approved and that NEW1 owns
  that decision,
- `vector-export-contract.test.ts` asserts that refusal.

So the boundary this round was asked to hold was already enforced by a committed
test before the round started, and nothing here weakened it.

Not changed, and not this lane's to change: the capability registry
(`search.semantic.broad` stays `INTERNAL_EXPERIMENTAL` / `publicState: DISABLED`),
any route, any mobile surface, any coverage claim, any marketing copy. Evidence
went to NEW3 on the bus as 1772; the row was not edited here.

Not changed for a different reason: `shared_buffers`. Raising it from 2 GiB would
have helped the build materially, and it is a global PostgreSQL memory setting
which this round is explicitly not permitted to touch.

---

## 7. WHAT THIS ROUND DID NOT DO, AND WHAT IT DOES NOT CLAIM

- **No migration.** Nothing needed a schema change, so no `LCC_HANDOFF_REQUIRED`
  was raised for one.
- **The scheduled delta queue was not paused.** Pausing it was refused by the
  permission layer; the build did not need it, and that was verified rather than
  assumed — the queue fired every fifteen minutes through both attempts and
  completed normal empty passes each time.
- **The 15 content-hash collisions were not deleted.** Satisfying an identity
  metric by removing fifteen real documents' reachability is the wrong trade in a
  corpus whose defining failure is a document held and invisible.
- **The ANN figures are at 1,000,000 rows and describe the index FORM, not the
  full-generation index.** Recall and latency both move with graph size. Nothing
  here licenses a statement about how a 7.67M-row index would behave, because it
  does not exist.
- **No `ef_search` was selected** — see 5e. There is no existing recall bar and
  none was invented.
- **`knownTargetRetention` is not a quality verdict.** It is over 47 of 283
  queries, because only 47 gold judgments are in the probe population.
- **`MODEL_REVISION` remains UNKNOWN** and is not recoverable — see 3a. The
  fallback the directive allows is met by verified off-machine model identity
  evidence, and the corpus reproduces from the local weights at cosine 1.000000.
- **The raw ANN row dump is not committed.** `ann-eval-ann-probe1m.jsonl` is
  31 MB of per-query result rows across five `ef_search` values. The
  computed metrics are in `ann-evaluation-probe1m.json` and the exact-arm
  checkpoint is committed in full; the dump is reproducible by re-running the
  harness against the same frozen query vectors.
