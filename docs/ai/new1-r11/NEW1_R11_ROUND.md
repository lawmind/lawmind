# NEW1 R11 — the walk was healthy and the bus said the box was free

**29 August 2026.** Continuation round. The coarse v2 embedding walk was already
running when this session opened and **was not interrupted at any point**: it has
held the single GPU lock continuously, and every measurement below was taken
around it rather than instead of it.

The round found one thing genuinely broken, one thing quietly ambiguous, and one
thing recorded nowhere. None of them was the walk.

---

## 0. What was true when the session opened

| | |
|---|---|
| walk | running, batch 222/766, GPU 100%, ~28,400 vectors/hour, zero-output windows 0 |
| `NEW1` lane lease | **DEAD** — heartbeat 711 minutes old |
| `HEAVY_BOX` | **HELD (process DEAD)** — same |
| delta queue | draining, but its two contention failures that afternoon left no record |
| embedding identity | reconstructable only by reading four files and one hand-applied `ALTER TABLE` |

The walk had been producing for eleven hours while the bus told every other lane
the box was occupied by a dead process. That is the round's headline: **a lease
that answers "is that agent alive" cannot be asked "is the box busy", and this one
was being asked exactly that.**

---

## 1. The coarse walk — untouched, and healthy

Verified rather than assumed:

- **One logical GPU writer.** `.agents/logs/new1-gpu-embed.lock` is an `open(wx)`
  token held by one `doc-vector-embed.mjs` at a time, and the lock's holder pid is
  in the process table. The Python sidecar (pid 13404, since 08:48) is the GPU
  *server*, not a second writer.
- **The pid changes every batch and that is correct.** `stage-runner.sh` spawns one
  process per batch on purpose, so the stage is idempotent per document and a crash
  costs one batch rather than the run. A pid that differs from an old report is not
  evidence of a restart, and no restart was performed.
- **No zero-output window, no refusal spike, no repeated failing batch.** Batch
  00222 finished 9,967 inserted of 10,000, the other 33 already staged; refusals
  across the run: 0 ineligible, 0 unsafe, 0 no-text, 0 failures.
- **The worklist cursor is single and monotonic** — 218 → 224 across the session.

### Live numbers

Measured against `embedding_content_representative` (the exact snapshot
population, 7,654,179 rows, definition hash `5b5d02384b46c96c`) rather than
against the stage table's own row count.

```
SNAPSHOT        document-vectors-v2
DEFINITION_HASH 5b5d02384b46c96c
MANIFEST_HASH   524ece8a42544b5e4cea9cff95bb8e72ba8a91e1d819a553d81c238472b5a5f7

ELIGIBLE        7,654,179
EMBEDDED        2,266,321
REMAINING       5,387,858
PERCENT         29.61 %
RATE            28,416 vectors/hour (run average), ~30,300/h recent window
ETA             ~7.9 days
WORKLIST        224 / 766
GPU_UTIL        100 %      VRAM 5,587 / 8,188 MiB
DISK            C: 245.7 GB free (pgdata)   D: 768.3 GB free
RAM             31.7 GB total, 11.8 GB free
```

**One correction to earlier reporting.** The 15-minute telemetry prints
`alreadyEmbedded` as `count(*)` over the whole stage table — 2,757,466 — which
includes 486,955 vectors from the superseded v1 generation. Divided by the v2
denominator that reads as 36 %. The honest figure is **29.61 %**, and the
difference is 490 thousand vectors that belong to a population this snapshot does
not claim. The telemetry's *ETA* is unaffected: it subtracts run progress from a
census-derived remainder, not from that count.

---

## 2. Delta coverage — bounded, and now legible

### The residual nobody named

The ledger had been printing pairs like `pending 57 / alreadyCovered 42`, and then
`73 / 49`. The gap was being explained by inference. It should never have needed
inference: `pending` counts every judgment in the window, `alreadyCovered` counts
only *eligible representatives* already covered, and the difference is whatever
the eligibility view refused — which the manifest could read and simply did not.

`delta-manifest.mjs` now decomposes the window **exhaustively and disjointly**, in
the order the walk itself applies its rules, using the deployed view's own columns
as the reason names. Measured over everything ingested since 28 Aug:

```
deltaRowsConsidered              7,187
  EMBEDDED                       4,039
  REFUSED_NOT_ELIGIBLE           2,634
  CONTENT_HASH_ALREADY_COVERED     514
  QUEUED                             0
  REFUSED_NO_ELIGIBILITY_ROW         0
  REFUSED_TEXT_UNSAFE                0
  REFUSED_BAND_EXCLUDED              0
residual.unnamed                     0
residual.predicatesAgree          true
```

`predicatesAgree` is not decoration. The eligibility predicate is spelled twice in
that file — once to emit the batch, once to classify the window — so the manifest
recomputes the queued member count both ways and says so if they ever disagree.

**`DELTA_UNCLASSIFIED = 0`.** No state in that table is inferred, and no refusal
reason is invented: a reason the view cannot supply is not a reason this code is
allowed to make up.

### The fairness question, answered with evidence rather than a redesign

Section 2 of the directive says to introduce bounded fairness **only** if telemetry
cannot already prove delta latency is bounded. It could not, so the first job was
to make it able to.

What actually happened on 29 Aug: NEW2 shipped ~5,700 rows around 14:00Z. The delta
pass at 14:14Z waited 30 minutes for the GPU lock behind a long coarse batch, was
refused, and **died with an uncaught stack trace that wrote nothing to the ledger**.
Same again at 14:44Z. The 14:59Z pass succeeded and embedded 3,479 rows. The
ledger's account of that afternoon therefore jumps from 13:59 straight to 14:59
with the contention invisible.

So: **worst observed delta latency ≈ 45 minutes, and the queue drained on its
own** — the scheduled task fires every 15 minutes and the watermark advances only
on proof, so a refused pass retries the same window rather than stepping over it.
That is bounded. **No fairness scheduling was introduced, and no second GPU writer
exists.** What was added is the missing record:

- a refusal caused by the coarse walk holding the lock is now
  `queue_DEFERRED_GPU_BUSY` in the ledger, carrying the holder's pid and batch
  file, with the watermark explicitly not advanced;
- any other embed failure is `queue_EMBED_FAILED` and still exits non-zero, so the
  task scheduler sees it;
- both records carry the full state decomposition above.

The refusal string this depends on was verified against the real one, not against
memory: a disposable empty batch run with `GPU_LOCK_WAIT_MS=2000` produced
`GPU embed lock held by live pid 27056 (…tier-a-batch-00222.jsonl since …)`, and
the matcher and the pid/batch regex both bind to it.

```
DELTA_PENDING       0 queued
DELTA_OLDEST_AGE    n/a — nothing is queued
DELTA_EMBEDDED      4,517 (cumulative, queue-state.json)
DELTA_UNCLASSIFIED  0
DELTA_FAIRNESS      PASS — bounded at ~45 min observed, and now visible when it binds
```

---

## 3. Embedding identity — written down, including the part that is UNKNOWN

`docs/ai/embedding-manifests/EMBEDDING_IDENTITY_V2.json` is new. It carries the
model, tokenizer and code identities with real sha256 sums (measured, ~2.3 GB
hashed), the pooling and normalisation policy, the intended distance metric, the
text-selection recipe, the refusal taxonomy, and the mapping
`content_hash → embedding version → vector row`. No vectors are committed.

Two findings inside it are worth surfacing here.

**The model revision is UNKNOWN and is going to stay UNKNOWN.**
`services/embed/src/fetch-model.ts` fetches from
`huggingface.co/<id>/resolve/main` — an unpinned ref. The upstream commit these
weights came from was never recorded and cannot be recovered from this repository.
The local sha256 sums are therefore the *only* durable identity of the weights: if
`.models/Xenova/bge-m3` is lost and upstream `main` has moved, this snapshot is
not bit-reproducible. That is stated rather than papered over, and it is the
reason the model files belong in whatever off-machine copy exists.

**The snapshot stamp exists nowhere in git.** `new1_doc_vector_stage.snapshot_hash`
is populated by a **column default** — `DEFAULT '5b5d02384b46c96c'` — applied by
hand on 28 Aug and recorded only as prose. There is no migration and no code path
that writes it; a repository-wide search for `snapshot_hash` finds no writer at
all. Two consequences: a freshly installed database stamps every row `NULL`, and
pointing the walk at a different snapshot without changing the default would
mislabel every new row with the old one, silently. The manifest records the DDL so
the identity is at least written down. **The durable fix is a migration, and
migrations are not this lane's to write** — `MIGRATION_SLOT` was held elsewhere
during this round. Handed over on the bus rather than done unilaterally.

```
EMBEDDING_IDENTITY_MANIFEST  PASS (written)
MODEL_IDENTITY               BAAI/bge-m3 via Xenova ONNX, fp32, TF32 off,
                             model.onnx_data sha256 a02dfa4c…e109a6c,
                             upstream revision UNKNOWN
DIMENSIONS                   1024
DISTANCE_METRIC              cosine (<=>), halfvec_cosine_ops, production ef_search 200
```

---

## 4. Stage integrity — one full pass, and it is clean

Every row, not a sample.

| check | result |
|---|---|
| total stage rows | 2,757,466 |
| current-snapshot rows | 2,270,511 |
| orphans from the v1 generation (`snapshot_hash IS NULL`) | 486,955 |
| dimension mismatches | 0 — every row is 1024 |
| NULL embeddings | 0 |
| zero vectors | 0 |
| non-finite values | 0 |
| non-unit norms (>0.01 off) | 0; min 0.9999998, max 1.0000002 |
| duplicate `content_hash`, whole table | 3,265 groups / 3,265 extra rows |
| duplicate `content_hash`, **within the current snapshot** | **0** |
| refused rows (ledgered, not dropped) | 72,099 |
| unrepresented eligible representatives | 5,387,858 — the remaining walk, nothing else |

The duplicate finding resolves cleanly: every one of the 3,265 is one v1 row and
one v2 row carrying the same content hash. The current snapshot contains no
duplicate identity at all, which is what the partial index needs to be true.

**`STAGE_INTEGRITY = PASS`.** Nothing was deleted. The clean final-snapshot plan
is `docs/ai/new1-r11/FINAL_SNAPSHOT_PLAN.json`, and its headline is that **no
deletion is required for correctness** — the partial predicate already excludes
the orphans, proven by the R10 probe (40 queries, 0 orphans returned, all 40 plans
using the index, and 358 orphans returned without the predicate so the test is not
vacuous).

The plan also records a trap worth reading before anyone tidies this table: the
obvious predicate — "rows that are not a current representative" — matches 491,145
rows, of which **4,190 are delta vectors for judgments ingested after the
representative table was cut**. They are the *newest* coverage in the corpus. A
cleanup written that way would delete the freshest vectors and keep the stalest.
The correct predicate is `snapshot_hash IS NULL`, and it is exact: zero staged
representatives are unstamped.

---

## 5. Crash recovery — verified from Task Scheduler, and left alone

Read from the live task definitions, not from the historical note:

| task | trigger | logon | StartWhenAvailable | instances |
|---|---|---|---|---|
| `Lawmind-new1-coarse-walk` | every 5 min | **Interactive** | **False** | IgnoreNew |
| `Lawmind-new1-coarse-telemetry` | every 5 min | Interactive | False | IgnoreNew |
| `Lawmind-new1-sidecar-keeper` | every 5 min | Interactive | False | IgnoreNew |
| `Lawmind-new1-delta-queue` | every 15 min | Interactive | False | IgnoreNew |

The historical state **still holds**. `LastResult 2147946720` on the three
continuously-running tasks is `0x800710E0`, "the operator or administrator has
refused the request" — which is `IgnoreNew` declining to start a second instance.
That is the supervisor pattern working, not a fault.

```
RESTART_AFTER_LOGON        yes
HEADLESS_REBOOT_RECOVERY   no
START_WHEN_AVAILABLE       False — left False, deliberately
```

No switch to SYSTEM/S4U was attempted, and therefore no GPU-visibility canary was
needed. The directive permits that change only after proving GPU visibility
non-interactively, and there is no reason to spend that risk on an 8-day
production run that already recovers on logon.

`StartWhenAvailable` was left `False` on reasoning, not by omission: it governs
what happens to a *missed* start, and with a 5-minute repeating trigger the next
start is at most five minutes away regardless. Turning it on buys nothing here and
adds missed-run catch-up bursts. The one task in this repo that sensibly has it
`True` is `new2-daily-delta`, which fires once a day.

**The limitation, stated plainly: this box does not recover the walk after an
unattended reboot.** It recovers it at the next interactive logon. Changing that
means S4U, and S4U means proving CUDA is visible to a non-interactive session
first.

---

## 6. Lease truth — the fix, and the proof

`HEAVY_BOX` records the pid of the *agent session* that acquired it. The walk is
a scheduled task and outlives that session by design. So the lease and the worker
answer different questions, and the bus was publishing the wrong one.

Three changes, all narrow:

1. **`health()` gained an opt-in witness.** A lease carrying
   `livenessSource: 'durable-progress'` with a fresh `lastProgressAt` reports
   `HEALTHY_BY_PROGRESS` instead of `DEAD`. It is opt-in per record, so no existing
   lease changes behaviour, and it only ever moves a verdict *towards* alive — the
   direction of any error is "harder to steal", never "easier".
2. **The force-steal guard refuses it.** `HEALTHY_BY_PROGRESS` sits beside
   `HEALTHY` and `HUNG` in the list `--force` will not take. This is the case where
   stealing does the most damage, because the job you would collide with is
   invisible in the process table under the holder's name.
3. **`services/harness/src/worker-truth.mjs`** (new) derives the walk's liveness
   from three witnesses — the single-writer GPU lock's holder pid, the runner log's
   mtime, and the durable row count — and heartbeats `HEAVY_BOX` **only** on
   `ALIVE`. Not on `HUNG` (a hung worker holding the box is exactly what the lease
   decaying should reveal) and not on `UNKNOWN` (a database it could not reach is
   not evidence in either direction). It runs from a new 5-minute scheduled task,
   `Lawmind-new1-worker-truth`, so it survives this session.

Both halves of the invariant are proven, not asserted —
`docs/ai/new1-r11/lease-liveness-proof.json`:

```
PASS  live session pid, opted in                 -> HEALTHY
PASS  DEAD session pid, opted in, progress fresh -> HEALTHY_BY_PROGRESS
PASS  DEAD session pid, opted in, progress STALE -> DEAD
PASS  DEAD session pid, NOT opted in             -> DEAD
```

The third case is the important one: when the walk stops, nothing advances the
metric, and the lease decays to `DEAD` within one 30-minute window on its own.
Nobody has to remember to release it.

Observed after the change: `HEAVY_BOX: HELD (process HEALTHY)`,
`RUNNING_PROGRESSING 2,756,272 → 2,756,669`.

```
LEASE_TRUTH  PASS
```

---

## 7–9. HNSW — deferred, with the arithmetic written down

**No index was built and none should be for about eight days.** The snapshot is
29.6 % complete; pgvector's own guidance is bulk load first, index after.

The design holds up against the live facts: dimensions are 1024 (halfvec's limit
for an indexable expression is far above that, and the two R10 probe indexes at
exactly this shape are the proof), the metric is cosine, and the production query
path already sets `hnsw.ef_search = 200` inside its transaction. `m = 16`,
`ef_construction = 64`, partial on `snapshot_hash = '5b5d02384b46c96c'`.

**Projection** (`docs/ai/new1-r11/hnsw-final-projection.json`), from four measured
builds at 250k and 1M rows:

- **index size ≈ 19.5 GiB** — 2,731 bytes/vector, and that figure held to within
  one byte across all four measured builds, so it is the strongest number here.
  C: has 245.7 GB free.
- **build time: between 0.67 h and 2.9 h**, and the fast end is not reachable. The
  HNSW graph needs roughly as much memory as the finished index — ~19.5 GiB — and
  this box has 31.7 GiB total with ~11.8 GiB free while the walk runs. **A 7.65M-row
  build will spill whatever `maintenance_work_mem` is set to.**
- Everything between those two points is **interpolated and explicitly labelled
  unverified**; the 2 GiB row is worse than that, an *extrapolation* below the
  lowest resident fraction ever measured (19.5 %). Two points do not establish the
  shape of that curve.

**`HNSW_1M_2GB_PROBE = DEFERRED.`** Section 8's own default. The coarse walk is at
100 % GPU with continuous inserts, ~11.8 GiB of RAM is free, and the probe's value
is a better estimate for a build that is eight days away. It is not cancelled —
the conditions to run it are recorded, and the two disposable probe tables
(9.9 GB) were deliberately **kept** rather than dropped so it can run without
rebuilding a million-row table first.

**Final-build preconditions, none of which are met yet:** worklist complete · zero
unexplained eligible gaps · stage integrity PASS · delta queue drained or
independently handled · disk headroom · memory plan reviewed · index predicate
frozen · distance function frozen. When they are met the build must use
**session-local** `SET maintenance_work_mem`, never a server-wide change, and
`pg_stat_progress_create_index` is the honest progress view. Whether it needs
`CONCURRENTLY` depends on whether the delta queue is still writing at that moment;
if the stage is genuinely frozen, a normal build is cheaper and should be compared
rather than assumed.

```
HNSW_FINAL                 DEFERRED
PROJECTED_FINAL_INDEX_SIZE ~19.5 GiB (2,731 B/vector, measured)
PROJECTED_BUILD_TIME       0.67 h – 2.9 h bracket; spilling is certain
```

---

## 10–12. Untouched, on purpose

- **ANN quality gate** — nothing to gate. It runs after the index exists, against
  exact search, over the frozen evaluation set, at several `ef_search` values, and
  it must specifically test whether filtered queries lose rows to post-index
  filtering. Broad semantic capability stays disabled until its own evidence gate.
- **Passages** — `PASSAGE_V2 = FROZEN`. No tranche was started, no role classifier
  revived. Free GPU capacity is not a reason, and there is no free GPU capacity.
- **Storage** — vectors stay out of the irreplaceable backup: they are derived, and
  what makes them regenerable is now written down in one place. The model weights,
  by contrast, have become *more* precious than they looked, because the upstream
  ref is unpinned.

---

## INTENT

> **INTENT:** code emitted `deltaRowsConsidered: null` and named only eligible
> representatives, already-covered and emitted, leaving the rest of the window an
> unnamed residual; the directive expects every eligible new judgment to be
> EMBEDDED / QUEUED / CONTENT_HASH_ALREADY_COVERED / EXPLICITLY_REFUSED with no
> unnamed state; the file's own spec says eligibility is read from the deployed
> view and never re-derived. All three agree, so the residual is named from that
> same view and from nowhere else.

> **INTENT:** `health()` treated the holder's session pid as the only witness of
> life; the directive expects liveness derived from the single-writer lock, worker
> heartbeat and progress timestamp rather than pid alone; `process-identity.mjs`'s
> own spec says a pid is not an identity and a failed probe is not a death. The
> change is additive and opt-in, and it only ever moves a verdict towards alive.

---

## Caveats

- **The 29.61 % figure supersedes the telemetry's own percentage**, not its ETA.
  The running telemetry process was deliberately not restarted to correct its
  `alreadyEmbedded` field, because restarting it would reset the run-rate baseline
  and re-read a stale coverage file, making the ETA worse to fix a cosmetic number.
  Corrected here and in this round's artifacts instead.
- **`queue_DEFERRED_GPU_BUSY` has not yet fired in production.** The path was
  proven in two halves — the refusal message was produced for real and the matcher
  binds to it — but the two have not been observed end to end, because that needs
  a delta backlog arriving behind a long coarse batch and none has arrived since
  the change.
- **The build-time projection is a bracket with an interpolated middle.** Only the
  bytes-per-vector figure is solid. The 2 GiB estimate is an extrapolation and is
  the weakest number in this document.
- **The `snapshot_hash` column default is still un-migrated.** Recorded, handed
  over, not fixed here.
- **Headless reboot recovery remains absent**, by decision rather than oversight.
