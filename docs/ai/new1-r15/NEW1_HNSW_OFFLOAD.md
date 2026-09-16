# NEW1 — HNSW OFFLOAD PACKAGE

**Lane:** NEW1 · **Written:** 16 September 2026 · **Status:** `OFFLOAD_REQUIRED`

This is the whole specification for building the production HNSW index on a
high-memory host. It exists because the index cannot be built on this
workstation, and because the reason it cannot is a measured number rather than an
impression.

**Nothing here provisions, selects or purchases a host.** It states what a host
must have, and what to run on it once one exists.

---

## 1. WHY THIS IS NOT BUILT LOCALLY

`LOCAL_FULL_HNSW_BUILD = PROHIBITED_BY_MEASURED_RAM_CONSTRAINT`

| quantity                       | value                                   | source                                                    |
| ------------------------------ | --------------------------------------- | --------------------------------------------------------- |
| Rows to index                  | 7,673,717 at the 15 Sep cut             | `docs/ai/new1-r14/hnsw-final-build.json`                   |
| Bytes per vector, **measured** | 2,731 B                                 | `docs/ai/new1-r10/hnsw-build-measurements.json`            |
| Finished index size            | **19.52 GiB**                           | 7,673,717 × 2,731 B                                        |
| Machine total RAM              | 31.75 GiB                               | measured 16 Sep 2026                                       |
| Machine **free** physical RAM  | **14.2 GiB**                            | measured 16 Sep 2026                                       |
| `shared_buffers` on this box   | 2 GiB                                   | `pg_settings`                                              |

A no-spill build needs the whole graph resident in `maintenance_work_mem`. 19.52
GiB does not fit in 14.2 GiB, and it did not fit in the 11.7 GiB free on 15
September either. **The mismatch is unchanged; it has moved by 2.5 GiB in the
right direction and is still 5.3 GiB short of the minimum.**

### The two attempts, and what they measured

Both are recorded in full in `docs/ai/new1-r14/HNSW_BUILD_COST_AT_SCALE.md` and
`docs/ai/new1-r14/HNSW_BUILD_ATTEMPT_LOGS.md`.

- **Attempt 1** — `maintenance_work_mem = 4GB`, 4 workers. Ran 4h55m, cancelled
  at **52.5%** (4,026,507 of 7,673,717 tuples). The spill notice fired at
  1,571,661 tuples against a predicted 1,571,676 — the memory model is right to
  within 15 tuples.
- **Attempt 2** — `maintenance_work_mem = 8GB`, 10 workers. Ran 50m47s, cancelled
  at **41.2%** (3,163,115 of 7,673,717). Spill notice at 3,144,795 tuples against
  a predicted 8 GiB ÷ 2,731 B = 3,146,443 — right again, to within 1,650 tuples.

**The memory model predicted both spill points in advance** — to 1 part in
105,000 at 4 GB and 1 part in 1,900 at 8 GB. Doubling `maintenance_work_mem`
doubled the tuples that fit and changed nothing else. That is what makes the
19.52 GiB requirement a prediction the machine has already confirmed twice,
rather than a figure extrapolated from a failure.

The decisive measurement is the **post-spill rate collapse**, seen identically in
both runs:

| run | pre-spill | first post-spill sample | steady post-spill |
| --- | ---: | ---: | ---: |
| Attempt 1, 4 GB | 2,695–3,249 /s | 233 /s | **24.7 /s at 4.03M, still falling** |
| Attempt 2, 8 GB | 1,303–1,644 /s | 221 /s | **24.2 /s at 3.15M** |

At those rates the remaining tuples needed **41 to 52 hours** on a straight-line
read of a curve that was bending the wrong way. Diagnosed at the time as
**read-concurrency bound** — 58–76 MB/s at 0.00 avg sec/read, CPU 27% across five
processes, roughly 9,500 random 8 KiB reads/s — not bandwidth, latency or
arithmetic bound. More workers do not fix it; more memory does.

**A third local attempt is prohibited.** Nothing about the box has changed that
would change the outcome; only the host can change it.

---

## 2. WHAT IS BEING INDEXED

| field                     | value                                                                       |
| ------------------------- | --------------------------------------------------------------------------- |
| Source snapshot ID        | `5b5d02384b46c96c`                                                          |
| Snapshot identity rule    | `substr(encode(sha256(pg_get_viewdef('judgment_embedding_eligibility', true)::bytea),'hex'),1,16)` |
| Table                     | `new1_doc_vector_stage`                                                     |
| Row count at the 15 Sep cut | 7,673,717 (re-measure at build time; the corpus grows)                     |
| Vector column             | `embedding vector(1024)`                                                    |
| Vector form **in the index** | `(embedding)::halfvec(1024)` — an expression, not a stored column         |
| Model                     | BGE-M3 ONNX fp32, CLS-pooled, L2-normalised, recipe `HEAD:4800`             |
| Distance metric           | **cosine** (`halfvec_cosine_ops`)                                           |
| Index predicate           | `WHERE (snapshot_hash = '5b5d02384b46c96c')`                                |

### Why each of those, so a remote operator does not "improve" one

- **`halfvec` expression.** Every measured build (`new1-r10`) and both probe
  indexes (`new1_probe_hnsw_250000_hnsw`, `new1_probe_hnsw_1000000_hnsw`) carry
  this exact form. The 2,731 B/vector figure and the whole build-time model
  describe a `halfvec` graph. Switching to `vector(1024)` doubles the index and
  invalidates every number in §1.
- **The partial predicate.** 486,955 rows in this table belong to the sealed
  `UNIDENTIFIED_LEGACY_V1` generation with `snapshot_hash IS NULL`. Mixing
  vectors of unknown provenance into the production search space is the failure
  the predicate exists to prevent.
- **`m = 16, ef_construction = 64`.** The probe-index parameters. Changing them
  is a legitimate decision, but it is a *new* decision that needs its own
  measurement — not a build-time tweak.

---

## 3. HOST REQUIREMENTS

| requirement                | value                  | why                                                                 |
| -------------------------- | ---------------------- | -------------------------------------------------------------------- |
| PostgreSQL                 | **18.x** (local: 18.6) | The dump/restore path must not cross a major version downward.       |
| pgvector                   | **≥ 0.8.5** (local: 0.8.5) | `halfvec` and parallel HNSW build.                               |
| **Minimum safe RAM**       | **32 GiB, on a host doing nothing else** | 19.52 GiB graph + 2 GiB `shared_buffers` + OS + heap read-ahead. |
| **Recommended RAM target** | **64 GiB**             | Margin for corpus growth and a `maintenance_work_mem` set well above the graph rather than exactly at it. |
| Minimum free disk          | **120 GiB**            | 45 GiB stage table (43 GiB of it TOAST) + 19.52 GiB index + WAL + restore headroom. |
| vCPU                       | ≥ 8                    | `max_parallel_maintenance_workers = 7` needs workers to schedule.    |

> **Read the minimum carefully — it is not a number this box nearly meets.**
> This workstation has **31.75 GiB total**, which looks like a rounding error away
> from the 32 GiB floor. It is not. The floor assumes a host with *nothing else on
> it*; here, 17.5 GiB is already resident in other work, leaving **14.2 GiB free**.
> The gap is 5.3 GiB of *available* memory, not 0.25 GiB of *installed* memory, and
> freeing it would mean stopping everything else on the machine for the duration.
> **Provision by free memory, never by installed memory.**

**The RAM figure is a floor, not a target.** At exactly 32 GiB the build fits but
leaves nothing for the OS page cache that the heap scan wants. 64 GiB is the
number to ask for.

---

## 4. `maintenance_work_mem` STRATEGY

**Session-local. Never global.** A global setting applies to every autovacuum
worker on a box that is also serving the retrieval path.

Set it **above** the finished index size, not at it:

```
maintenance_work_mem      = 24GB       # 19.52 GiB graph + headroom
max_parallel_maintenance_workers = 7
```

The build script takes both from the environment precisely so this is a decision
made from a live free-memory reading on the actual host, not a constant baked
into the repo:

```
NEW1_MAINTENANCE_WORK_MEM=24GB
NEW1_MAINT_WORKERS=7
```

**The one thing that must be watched:** if the spill notice fires at all, the
build is in the regime §1 measured and will not finish in a sensible time. Cancel
it, raise `maintenance_work_mem`, and start again. Do not wait it out.

---

## 5. THE BUILD COMMAND

`services/harness/src/new1-final-hnsw-build.mjs` — unchanged, already written,
already used for both local attempts.

```bash
NEW1_SNAPSHOT_HASH=5b5d02384b46c96c \
NEW1_MAINTENANCE_WORK_MEM=24GB \
NEW1_MAINT_WORKERS=7 \
NEW1_CENSUS_FROM=<ISO timestamp of the census that preceded this build> \
NEW1_RECEIPT_NAME=hnsw-remote-build.json \
NEW1_PROGRESS_NAME=hnsw-remote-progress.jsonl \
node services/harness/src/new1-final-hnsw-build.mjs
```

**Run it detached.** A console signal on the local box has killed Postgres six
times (`0xC000013A`); a multi-hour build must never be attached to an interactive
shell. On Windows use `Start-Process`; on Linux use `systemd-run --scope` or
`setsid`, not `nohup`.

### The four refusals it performs before writing anything

1. `REFUSED_ALREADY_EXISTS` — `new1_doc_vector_stage_hnsw` is already present.
2. `REFUSED_GENERATION_NOT_ACTIVE` — `embedding_snapshot` does not have exactly
   one ACTIVE row equal to the requested snapshot.
3. `REFUSED_VIEW_DRIFT` — the deployed `judgment_embedding_eligibility` no longer
   hashes to the snapshot id. **This is the one that matters most on a restored
   host:** it proves the restore carried the same contract, not just the same
   rows.
4. `REFUSED_RESIDUAL_AT_CUT` — eligible content identities exist that have no
   vector at `INDEX_CUT_AT`.

It captures `INDEX_CUT_AT` from the database before the build and writes it to the
receipt. Rows arriving after the cut are indexed by pgvector's insert path
automatically; the cut exists so "was this row in the original graph" is
answerable rather than guessed.

### The DDL it issues, for the record

```sql
CREATE INDEX new1_doc_vector_stage_hnsw
  ON new1_doc_vector_stage
  USING hnsw (((embedding)::halfvec(1024)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE (snapshot_hash = '5b5d02384b46c96c');
```

Plain `CREATE INDEX`, **not** `CONCURRENTLY`. `CONCURRENTLY` would cost a second
table pass and can leave an INVALID index behind, and it buys nothing **provided
the delta queue is not writing during the build.**

**Do not take that proviso on trust — it is a live condition, not a fact about the
past.** R14 recorded "every pass for over a day has emitted zero rows", and within
hours of writing it the queue embedded 958 documents because NEW2 resumed ingest.
A quiet queue is quiet until the upstream lane wakes up. Check it at build time:

```bash
tail -3 docs/ai/new1-r9/delta/queue-ledger.jsonl
```

Every pass reports `kind`. `queue_nothing_to_embed` with `"emitted": 0` is the
state this section assumes. Anything else means ingest is live, and the right
move is to wait for it to drain rather than to reach for `CONCURRENTLY`.

If the queue **does** find work mid-build it blocks on the ShareLock rather than
failing — its connection sets `statement_timeout = 0`, and the scheduled task is
`IgnoreNew`, so a blocked pass waits the build out and later ticks are dropped
instead of piling up. That is a delay, not a corruption.

---

## 6. MONITORING

The build script samples this every `NEW1_PROGRESS_MS` (default 300,000 ms) on a
**second connection** and appends a JSONL line per sample. Run it by hand too:

```sql
SELECT p.phase,
       p.tuples_done,
       p.blocks_done,
       p.blocks_total,
       round(100.0 * p.tuples_done / NULLIF(t.n, 0), 2) AS pct
FROM pg_stat_progress_create_index p
CROSS JOIN (
  SELECT count(*) AS n FROM new1_doc_vector_stage
  WHERE snapshot_hash = '5b5d02384b46c96c'
) t;
```

The denominator is **counted, not pasted**. 7,673,717 was the row count at the
15 September cut and the corpus has grown since; a hardcoded denominator makes the
percentage drift quietly upward and reads as progress.

**Read the rate, not the percentage.** A decaying rate is invisible in a single
end-of-run duration and is the only thing that says early whether a build will
land today or in a week. The script computes `tuplesPerSecond` and
`projectedHoursRemaining` per window for exactly this reason.

**The kill threshold: 1,000 tuples/s.** Both local runs held 1,303–3,249 /s while
resident and fell to 221–233 /s within one sample of spilling. There is no
observed regime in between, so 1,000/s separates the two cleanly. Below it,
cancel — do not wait to see whether it recovers. It did not, twice.

Watch for the spill notice in the log:

```
NOTICE  hnsw graph no longer fits into maintenance_work_mem after N tuples
```

That line is the build failing; it is not a warning.

---

## 7. CANCEL AND RECOVERY

```sql
-- find it. The two extra predicates are not decoration:
--   pid <> pg_backend_pid()  — this very SELECT contains the string 'CREATE INDEX'
--                              and matches itself; cancelling it cancels YOU.
--   leader_pid IS NULL       — parallel maintenance workers share the leader's
--                              query text and query_start. Cancel the LEADER;
--                              the workers end with it.
SELECT pid, state, now() - query_start AS ran_for, left(query, 80) AS q
FROM pg_stat_activity
WHERE query ILIKE '%CREATE INDEX%new1_doc_vector_stage_hnsw%'
  AND pid <> pg_backend_pid()
  AND leader_pid IS NULL;

-- cancel it (NOT pg_terminate_backend, NOT SIGKILL)
SELECT pg_cancel_backend(<leader pid>);
```

**Never SIGKILL the backend and never `pg_terminate_backend` it.** Killing the
client does not kill the statement: on this stack a stall-killed writer leaves its
statement holding locks, and the restart adds a second one. `pg_cancel_backend`
asks the statement to stop and it unwinds properly — both local attempts ended
this way and left nothing behind.

Confirm it actually stopped before doing anything else. Re-run the SELECT above;
zero rows is the answer you want.

After a cancel, `CREATE INDEX` rolls back its own work — there is no partial index
to clean up. Confirm:

```sql
SELECT indexname FROM pg_indexes WHERE indexname = 'new1_doc_vector_stage_hnsw';
-- expected: zero rows after a cancelled build
```

If a row **is** returned after a failure, check validity before trusting it:

```sql
SELECT c.relname, i.indisvalid, i.indisready
FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
WHERE c.relname = 'new1_doc_vector_stage_hnsw';
```

`indisvalid = false` means drop it and start again. An INVALID index is still
consulted by the planner for HOT-update bookkeeping and is worse than no index.

---

## 8. POST-BUILD INTEGRITY CHECKS

Run all five. The build script performs 1–3 itself and writes them to its receipt.

1. **Validity** — `indisvalid = true AND indisready = true`.
2. **Size sanity** — `pg_relation_size` ÷ row count should land near **2,731
   B/vector**. A materially different figure means the index form is not the one
   this document specifies.
3. **Definition** — `pg_indexes.indexdef` matches §5 verbatim, predicate included.
4. **Row coverage** — the partial predicate covers every current-generation row:
   ```sql
   SELECT count(*) FROM new1_doc_vector_stage WHERE snapshot_hash = '5b5d02384b46c96c';
   ```
   compared against `rowsToIndex` in the receipt.
5. **Vector integrity, re-run on the restored host** — `pnpm --filter @lawmind/harness new1:integrity`.
   A restore that silently truncated a TOASTed vector column produces exactly the
   right row count with the wrong contents, and only a norm check sees it.

---

## 9. EXACT-VS-ANN EVALUATION

`SELECTED_EF_SEARCH = DEFER_UNTIL_FULL_INDEX_EVALUATION`

The R14 ANN probe findings (`docs/ai/new1-r14/ann-evaluation-probe1m.json`,
`ann-eval-exact-probe1m.jsonl`) are **historical evidence about a 1,000,000-row
index** and are preserved as such. They do **not** describe 7.67M-row recall. An
HNSW graph's recall at a fixed `ef_search` falls as the graph grows, so carrying a
1M figure forward would be a claim nobody measured.

What they did measure, on 1M rows, 283 queries, index form identical to §2:

| `ef_search` | recall@10 | recall@100 | known-target retention | filtered queries returning **nothing** (of 283) |
| ---: | ---: | ---: | ---: | ---: |
| 40  | 0.5806 | 0.3290 | 0.1702 | 137 |
| 64  | 0.6424 | 0.4768 | 0.2553 | 112 |
| 100 | 0.7081 | 0.5996 | 0.3191 |  83 |
| **200** *(production)* | **0.7947** | **0.7170** | **0.3191** | **41** |
| 400 | 0.8668 | 0.8112 | 0.3191 |  17 |

Two things to carry forward, and only these two:

- **The probes ran at `ef_search = 40`; production runs 200.** Any recall figure
  quoted without naming its setting is a figure for a different system.
- **The filtered zero-result column is the product problem, not the recall
  column.** At production's setting, 41 of 283 court-filtered queries returned
  nothing at all. That is `iterative_scan = off`; `relaxed_order` takes it to zero
  at a p50 of 101–170 ms. **This is a retrieval-policy decision, not an index
  parameter**, and building the index does not make it.

Both numbers are expected to get *worse* at 7.67M rows, which is why nothing is
selected now.

After the build, on the host that has the index:

```bash
pnpm --filter @lawmind/harness held:annprobe
pnpm --filter @lawmind/harness ef:sweep       # services/harness/src/ef-search-sweep-cli.mjs
```

**Set `ef_search` explicitly in every evaluation query.** An ad-hoc vector query
runs at 40 while production runs 200, `current_setting` reads NULL when it was
never set, and a recall number taken at the wrong setting is a recall number for a
different system.

Only after that sweep, against the full index, does `SELECTED_EF_SEARCH` get a
value.

---

## 10. PUBLIC SEMANTIC SEARCH STAYS DISABLED

`PUBLIC_SEMANTIC_SEARCH = DISABLED` — **before the build, during it, and after it.**

Building the index does not enable anything. Enabling public semantic search is a
separate decision that requires the §9 evaluation to have run and its recall to
have been judged acceptable, and it is not NEW1's alone to make.

The relevant standing finding: at production's settings, filtered semantic search
returned nothing for **41 of 283** queries (`docs/ai/new1-r14/`, commit
`cd613abf`). An index that makes those queries fast does not make them correct.

---

## 11. WHAT IS STILL OPEN

- **The host.** Not chosen, not priced, not provisioned. `docs/FOUNDER_QUEUE.md`.
- **Getting the data there.** 45 GiB of stage table. Note for whoever does it:
  `pg_dump -t` omits enum types, so a table-only dump of this schema does not
  restore cleanly; and rclone's default multi-threaded copy silently truncates
  large R2 objects — use single-stream.
- **`ef_search`.** Deferred, per §9.
