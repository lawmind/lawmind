# NEW1 R14 — FINALIZATION

**Lane:** NEW1 · **Written:** 15 September 2026 · **HEAD at start:** `c36c853f`

The round the founder asked for: *is the embedding program finished, and if so,
finalize it.* It was finished. This records how that was established, what was
built on the strength of it, and the one thing the evidence does **not** say.

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
| EMBEDDED, distinct content identities | **7,673,702** |
| QUEUED | 0 |
| **UNNAMED_RESIDUAL** | **0** |

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
| memory | **PASS** | 10.0 GiB free at the decision; `maintenance_work_mem` set **session-locally** to 4 GB, never globally |

`HNSW_BUILD_AUTHORIZED = YES`.

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

---

## 6. PRODUCT BOUNDARY

**`PUBLIC_SEMANTIC_SEARCH = DISABLED`, by construction rather than by restraint.**

`services/api/src/search/retrieve.ts` reads `judgment_chunks` UNION
`new1_tranche_passages`. It does not reference `new1_doc_vector_stage` anywhere,
and there is no index on that table for it to read. Nothing in this round could
have enabled semantic search even by accident.

Not changed, and not this lane's to change: the capability registry
(`search.semantic.broad` stays `INTERNAL_EXPERIMENTAL` / `publicState: DISABLED`),
any route, any mobile surface, any coverage claim, any marketing copy. Evidence
went to NEW3 on the bus; the row was not edited here.

Not changed for a different reason: `shared_buffers`. Raising it would have helped
the build materially and it is a global PostgreSQL memory setting, which this
round is explicitly not permitted to touch.

---

## 7. WHAT THIS ROUND DID NOT DO, AND WHAT IT DOES NOT CLAIM

- **No migration.** Nothing needed a schema change, so no `LCC_HANDOFF_REQUIRED`
  was raised for one.
- **The scheduled delta queue was not paused.** Pausing it was refused by the
  permission layer; the build did not need it, and that was verified rather than
  assumed — the queue fired throughout both attempts and completed normal empty
  passes.
- **The 15 content-hash collisions were not deleted.** Satisfying an identity
  metric by removing fifteen real documents' reachability is the wrong trade in a
  corpus whose defining failure is a document held and invisible.
- **The ANN figures are at 1,000,000 rows and describe the index FORM, not the
  full-generation index.** Recall and latency both move with graph size. Nothing
  in this round licenses a statement about how the 7.67M-row index would behave,
  because it does not exist.
- **`knownTargetRetention` is not a quality measurement here.** The frozen gold
  set is Supreme Court, and the probe table is a one-million-row sample of the
  generation; the artifact records how many gold judgments are in the indexed
  population at all, so a zero cannot be misread as the index losing them.
- **`MODEL_REVISION` remains UNKNOWN** and is not recoverable — see 3a. The
  fallback condition the directive allows is met by verified off-machine model
  identity evidence, and the corpus reproduces from the local weights at cosine
  1.000000.
