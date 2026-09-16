# NEW1 R15 — TERMINAL RECEIPT

**Lane:** NEW1 · **Measured:** 16 September 2026 · **Reproduce:**
`pnpm --filter @lawmind/harness new1:terminal`

R14 established that the embedding programme was finished. This round re-proves
it against the live database, adds the two pieces of evidence R14 did not carry,
and — the part that actually mattered — **gets the result off this workstation.**

---

## 0. WHY THIS ROUND EXISTS

R14's terminal result was correct. It was also invisible. Three commits
(`7887c00a`, `cd613abf`, `3a30b3fc`) sat on the local `main` and never reached
`origin`, so the only copy of the finalization evidence was on one machine.

**A receipt that exists on one workstation is a receipt for one workstation.** If
the box had failed, the measurement would have had to be taken again — a 31-minute
full-corpus scan, re-derived from nothing, by an agent with no record of what the
answer had been.

Two further gaps, both real — and neither is the one it first looked like.

**1. The integrity evidence was asserted but not reproducible.** R14 did measure
the full generation: its finalization document records `INVALID_DIMENSION 0`,
`NONFINITE_VECTOR 0` and fp32 norms spanning 0.9999998–1.0000002 across all
7,673,717 rows. That is a real measurement and it is not being second-guessed
here. What did not exist was **any script that reproduces it** — the numbers live
in prose, and the only committed machine-readable integrity artifact
(`docs/ai/new1-r12/stage-integrity-and-generation.json`) describes 2,455,863
current-generation rows, a population a third the size. A figure a later agent
cannot regenerate is a figure that cannot be checked when it matters.
`new1-vector-integrity.mjs` is that measurement as a command.

**2. R14's own hash chain was broken by R14, and nothing noticed.**
`NEW1_FINALIZATION_RECEIPT.json` binds five artifacts by sha256. One of them,
`terminal-census.json`, is bound as `3fef6cba…af3b74ad`.

```
7887c00a  3fef6cba0c59070a5e45caea902e7f67c7adb3d88b642a0cc8690d71af3b74ad   ← matches the binding
cd613abf  99f410293877fd95ff82abe2a3fc6a469b7500d3ec249458fb55f86d0196dc8e   ← does not
3a30b3fc  99f410293877fd95ff82abe2a3fc6a469b7500d3ec249458fb55f86d0196dc8e   ← does not
```

The binding was correct at `7887c00a`. The **next commit of the same round**
annotated the census with a `supersededByOngoingIngest` block — an honest and
useful annotation — and did not update the binding.

**Nothing about the corpus was wrong.** What was wrong is worse than a wrong
number: the round shipped a receipt asserting an intact chain, the chain was
broken by the round itself, and there was no check that could have said so. **A
binding nobody verifies is worse than no binding, because the next agent trusts
it.** `new1-evidence-manifest.mjs --verify` is that check; it was tested by
injecting a one-line change into a committed artifact and confirming it reports
`DRIFTED` and exits non-zero.

**3. Nothing was one command.** Reproducing the census meant knowing which
scripts to run, in which order, with which environment variable set. That is a
recipe held in one agent's head, and the head does not survive compaction.

---

## 1. THE FOUR STATES, RE-MEASURED LIVE

Measured `2026-09-16T07:08:29Z`, one pass, **883.1 s**, **zero** other active
backends. Denominator recomputed from the deployed `judgment_embedding_eligibility`
view at run time — not the frozen 27-August cut.

| state | value |
| --- | ---: |
| `CURRENT_ELIGIBLE_DOCUMENTS` | 8,444,960 |
| `CURRENT_ELIGIBLE_CONTENT_IDENTITIES` | 7,675,588 |
| `EMBEDDED_DOCUMENTS` | 7,675,603 |
| `EMBEDDED_CONTENT_IDENTITIES` | **7,675,588** |
| `CONTENT_HASH_ALREADY_COVERED` | 769,357 |
| `QUEUED` | **0** |
| `EXPLICITLY_REFUSED_INSIDE_ELIGIBLE` | **0** |
| `UNNAMED_RESIDUAL` | **0** |

**The accounting closes exactly:** 7,675,603 + 769,357 + 0 + 0 = **8,444,960**.

`EMBEDDED_CONTENT_IDENTITIES` equals `ELIGIBLE_CONTENT_IDENTITIES`, `QUEUED` is
zero and `UNNAMED_RESIDUAL` is zero, so:

```
EMBEDDING_COMPLETE = YES
```

### `UNNAMED_RESIDUAL` is the only number here allowed to be zero and nothing else

Everything else in the table is a quantity. This one is a **predicate**. A
document that is eligible, unembedded, unqueued and unrefused is a silent hole,
and a silent hole in a retrieval corpus is indistinguishable from an absence of
law — the advocate searches, finds nothing, and concludes there is nothing.

### Two runs, 24 minutes apart, identical to the digit

The census ran twice this round: standalone at `06:44:31Z` (872.7 s) and again as
stage 1 of the full command at `07:08:29Z` (883.1 s). **Every figure above is
identical between them.** That is not the same claim as "the number is stable" —
it means no ingest landed in that window, which the delta ledger independently
confirms. What it does establish is that the measurement is deterministic against
an unchanging corpus, which is the only thing a reproducibility command can be
asked to prove.

### The denominator moved since R14, and that is the system working

R14 measured 7,673,702 eligible content identities on 15 September. This round
reads **7,675,588** — **+1,886**, and the embedded side moved with it. NEW2
ingested; the incremental queue picked the arrivals up and embedded them.

**Do not treat any figure here as a constant.** The census carries a `measuredAt`
because it is a snapshot by construction. R14's number was not wrong; it was right
at its own timestamp, and so is this one.

### `EXPLICITLY_REFUSED = 0` does not mean nothing was refused

The walk refused **72,099** documents and every one has a named row in
`new1_doc_vector_stage_refused`. That zero counts refusals *inside the currently
eligible population* — and the live eligibility predicate independently excludes
all 72,099, with `STILL_TIER_A_ELIGIBLE = 0` and `NO_ELIGIBILITY_ROW = 0`. Two
mechanisms, same verdict, on every one of them.

A refusal the current predicate would now admit would be a silent hole wearing a
label, which is why this is measured rather than assumed.

### The 15 content-hash collisions are waste, not corruption

15 pairs of judgment rows share a content hash and both got a vector. The stage is
keyed on `judgment_id`, so this is legal: 15 wasted embeds in 7.68 million.
`JUDGMENT_ID_DUPLICATES` is 0 and cannot be otherwise — `new1_doc_vector_stage_pkey`
is UNIQUE on that column, so it is enforced rather than observed.

**And the 15 reconciles the one gap in the table.** `EMBEDDED_DOCUMENTS` is 15
higher than `EMBEDDED_CONTENT_IDENTITIES`:

```
7,675,603 − 7,675,588 = 15
```

exactly the surplus-row count, arrived at by a different query in the same pass.
Had that difference been anything other than 15, one of the two counts would be
measuring a population the other is not.

---

## 2. SNAPSHOT AND CONTRACT IDENTITY

```
SNAPSHOT_ID    = 5b5d02384b46c96c
SNAPSHOT_HASH  = 5b5d02384b46c96c   (recomputed live from the deployed view)
IDENTITY_MATCH = YES
```

| snapshot_hash | generation | state | dims | metric |
| --- | --- | --- | ---: | --- |
| `5b5d02384b46c96c` | `coarse-v2` | **ACTIVE** | 1024 | cosine |
| `UNIDENTIFIED_LEGACY_V1` | `legacy-v1` | SEALED | 1024 | cosine |

Exactly one `ACTIVE` generation, and it is the one every vector in the production
population is labelled with.

```
MODEL_FILES_HASHED = YES   (5 of 5 present and re-hashed this run)
MODEL_REVISION     = UNKNOWN
```

Model identity: BGE-M3 ONNX fp32, CLS-pooled, L2-normalised, recipe `HEAD:4800`,
1024 dimensions, cosine. Per-file sha256 in `NEW1_TERMINAL_RECEIPT.json`.

### What the snapshot id actually is

The snapshot id **is** the hash of the deployed eligibility definition:

```sql
substr(encode(sha256(pg_get_viewdef('judgment_embedding_eligibility', true)::bytea), 'hex'), 1, 16)
```

That identity is the whole safety property. If the deployed view were edited, the
hash would move and the stored vectors would be labelled with a generation that no
longer matches the predicate that selected them — a corpus describing itself with
a contract it no longer obeys. **The check is not that the number is a particular
number. It is that the two agree.**

`snapshot_hash` on the stage table is not a column default. The writer names it in
the INSERT column list and supplies a value that `assertContractHash()` has already
proven equal to the deployed view for that batch; two triggers then freeze it.
This matters because a constant column DEFAULT with no migration stamps every row
in a fresh install with a value nothing verified.

---

## 3. VECTOR INTEGRITY

```
VECTOR_INTEGRITY = PASS
```

Full scan of all 8,162,558 rows, both generations, `2026-09-16T07:11:12Z`,
**163.5 s**, zero other active backends. Norm tolerance 1e-3.

| generation | rows | null | wrong dims | zero vectors | non-unit > 1e-3 | min norm | max norm |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `5b5d02384b46c96c` *(production)* | 7,675,603 | 0 | 0 | 0 | **0** | 0.9999997615813925 | 1.0000002384185507 |
| `NULL_OLD_GENERATION` *(sealed legacy)* | 486,955 | 0 | 0 | 0 | **0** | 0.9999998211860497 | 1.0000001788139183 |

Every norm in 7.68 million production vectors lies within **2.4 × 10⁻⁷** of unity.
That is fp32 rounding, which is what an L2-normalised embedding should look like
and what a corrupted or truncated one would not.

The production row count here — 7,675,603 — is the same figure the census
reported as `EMBEDDED_DOCUMENTS`, arrived at by a different query in a different
process.

### How the norm is computed, and why not `l2_norm()`

```sql
sqrt(-(embedding <#> embedding))
```

`<#>` is negative inner product, so a vector against itself gives −‖v‖². This is
the exact fp32 dot product pgvector already computes. `l2_norm()` is not used
because two overloads resolve ambiguously on this install and the call errors —
the same substitution R12 made, kept verbatim so the two rounds are **comparable
rather than merely similar**.

This reproduces R14's finding rather than replacing it. R14 measured the same
thing and got the same answer; what is new is that **a command now produces it**,
so the next round does not have to take this one's word for it.

### The two checks that cannot currently fire, and why they stay

- **`wrongDimensions`** cannot be non-zero while the column is typed
  `vector(1024)`.
- **Non-finite values** cannot be stored; pgvector rejects NaN and Infinity at
  input.

Both are kept. A type can be altered and an input path can change, and a check
that could only ever fire *after* such a change is exactly the check worth having.
The norm bounds are the positive evidence in the meantime — and they are the only
thing that would catch a restore that silently truncated a TOASTed vector column,
which produces exactly the right row count with the wrong contents.

---

## 4. BACKGROUND WORK — CLASSIFIED AND RETIRED

| job | registry status | scheduled task | classification |
| --- | --- | --- | --- |
| `new1-coarse-walk` | FINISHED | `Lawmind-new1-coarse-walk` — **Disabled** | COMPLETED_BACKFILL |
| `new1-doc-vector-embed` | FINISHED | *(agent-launched, none)* | COMPLETED_BACKFILL |
| `new1-coarse-telemetry` | FINISHED | `Lawmind-new1-coarse-telemetry` — **Disabled** | COMPLETED_BACKFILL |
| `new1-gpu-sidecar` | FINISHED | *(agent-launched, none)* | COMPLETED_BACKFILL |
| `new1-sidecar-keeper` | FINISHED | `Lawmind-new1-sidecar-keeper` — **Disabled** | COMPLETED_BACKFILL |
| `new1-delta-queue` | RUNNING | `Lawmind-new1-delta-queue` — **Ready** | **ACTIVE_INCREMENTAL** |
| *(none)* | — | `Lawmind-new1-worker-truth` — **Disabled** | STALE_REGISTRATION, harmless |

The last row is a scheduled task with **no registry entry at all** — nothing in
`registry.jsonl` claims it. It is `Disabled`, so it cannot fire and it is not a
risk today. It is listed because the inverse of a stale registry row is a task
nobody has a record of, and that is the one a registry-only audit misses
entirely. Left in place: deleting a scheduled task on the strength of "I could not
find who owns it" is how a lane loses a job it did own.

```
COARSE_BACKFILL             = TERMINAL
INCREMENTAL_QUEUE           = HEALTHY
FULL_BACKFILL_WORKER_RUNNING = NO
SECOND_GPU_WRITER           = NO
HEAVY_BOX                   = RELEASED (2026-09-15T17:28:48Z, by NEW1)
NEW1_LANE_LEASE             = stale on arrival, taken over, released at round end
STALE_REGISTRATION          = none
FAILED                      = none
```

**Both authorities were checked, because they answer different questions.** The
registry records what a lane *intended*; Task Scheduler decides what can still
*fire*. A job marked FINISHED whose task is still `Ready` restarts itself on the
next reboot, and a logon launcher has silently returned this fleet to full width
before. Registry and scheduler agree on all six.

No worker was stopped this round. All six were already in the desired state; this
records that it was **verified** rather than assumed.

### One lease was stale, and it was the lane's own

`.agents/bus/leases/NEW1.json` read `HELD` by session `bff58c23`, pid **2136**,
with this task:

> *"R11 NEW1: keep the coarse v2 walk running, delta fairness telemetry, embedding
> identity manifest, stage integrity, HNSW readiness"*

- pid 2136 is **not in the process table**
- last heartbeat `2026-09-09T12:01:26Z` — seven days old
- the walk it names was retired `FINISHED` on **10 September**, its scheduled task
  `Disabled`

**This is the second round running in which a NEW1 lease outlived its work.** R14
found the same thing on `HEAVY_BOX` and wrote the rule down: *a running PID is not
proof of unfinished work and an absent PID is not proof of completion.* The
registry, the scheduler and the durable row count all agreed; the lease disagreed;
the lease was wrong. It was wrong again here, in the same lane, for the same
reason.

Taken over by this round with the evidence recorded in the takeover reason, and
released at the end of it. It is not a corpus risk — a stale lease makes another
lane defer to work that is not happening, which costs time, not correctness.

---

## 5. THE INCREMENTAL QUEUE, AND A 9-HOUR GAP THAT IS NOT A STALL

```
INCREMENTAL_QUEUE       = HEALTHY
INCREMENTAL_WATERMARK   = 2026-09-15T18:12:59.605Z
max(judgments.created_at) = 2026-09-15T18:12:59.605Z
WATERMARK_AT_FRONTIER   = YES  (equal to the millisecond)
OLDEST_PENDING_DELTA    = none
```

Last pass `2026-09-16T06:59:06Z`, 110 passes, 4,960 documents embedded since the
queue was seeded:

```json
{"kind":"queue_nothing_to_embed","pending":2,"emitted":0,"alreadyCovered":2,
 "states":{"EMBEDDED":2,"QUEUED":0,"CONTENT_HASH_ALREADY_COVERED":0,
           "REFUSED_NO_ELIGIBILITY_ROW":0,"REFUSED_NOT_ELIGIBLE":0,
           "REFUSED_TEXT_UNSAFE":0,"REFUSED_BAND_EXCLUDED":0},
 "residual":{"considered":2,"named":2,"unnamed":0,"predicatesAgree":true}}
```

Every row it considered was classified into a named state, `unnamed` is 0, and
`predicatesAgree` is true — the classification path and the emit path reached the
same verdict on the same rows. **That last field is the one worth reading:** a
queue whose two paths disagree embeds the right count of the wrong documents.

### An idle queue and a dead queue print the same line, so idleness is not the evidence

`queue_nothing_to_embed` every fifteen minutes is the weakest possible signal of
health. The evidence that this queue works is that **it has been observed doing
work**: on 15 September NEW2 ingested and the queue emitted 109 documents at
17:14Z and 849 more shortly after, starting an owned GPU sidecar and stopping it
again each time. The 4,960 lifetime figure above is the accumulation of that.

### The gap

There is a **555-minute hole** in the receipt ledger between `2026-09-15T20:59:02Z`
and `2026-09-16T06:14:01Z`. It is not a stalled job:

```
LastBootUpTime   2026-09-16 10:07:52 local  (06:07:52Z)
first receipt after boot  2026-09-16T06:14:01Z   — 6 minutes later
LastTaskResult   0
NumberOfMissedRuns  0
```

**The machine was off.** The queue resumed on its own six minutes after boot and
its first pass found nothing outstanding.

### The risk this exposes, which is worth writing down

`Lawmind-new1-delta-queue` runs with `LogonType = Interactive`. It therefore fires
only once a user has logged on, not at boot. It happened to be prompt today. On a
reboot followed by a late logon, this is a silent multi-hour hole in embedding
coverage that looks exactly like the healthy quiet above — **the ledger records a
gap either way, and only the boot time tells them apart.**

Not changed this round: the task's principal is outside NEW1's owned paths and
changing it is a scheduling decision, not an embedding one. Recorded here and in
`docs/FOUNDER_QUEUE.md`.

### Why a flat watermark is correct

The watermark sits at `max(judgments.created_at)`, which is where an **empty pass
advances it to**. A still number is the healthy state. **The stall signal is a
missing receipt, not a flat one** — which is precisely why the gap above was
worth chasing and the flatness was not.

---

## 6. HNSW — OFFLOAD, NOT RETRY

```
LOCAL_FULL_HNSW_BUILD  = PROHIBITED_BY_MEASURED_RAM_CONSTRAINT
HNSW_OFFLOAD_REQUIRED  = YES
SELECTED_EF_SEARCH     = DEFER_UNTIL_FULL_INDEX_EVALUATION
PUBLIC_SEMANTIC_SEARCH = DISABLED
```

| quantity | value |
| --- | ---: |
| `MEASURED_HNSW_RAM_REQUIREMENT` | **19.52 GiB** (7,675,603 × 2,731 B, measured) |
| `CURRENT_SAFE_RAM` (free physical, idle) | 14.2 GiB |
| `CURRENT_SAFE_RAM` (free physical, after the scans) | **12.38 GiB** ← the value in the JSON |
| machine total RAM | 31.75 GiB |
| `shared_buffers` | 2 GiB |
| shortfall | **5.3 – 7.1 GiB**, depending on which reading |
| PostgreSQL / pgvector | 18.6 / 0.8.5 |

**Two free-memory readings, and the receipt records the pessimistic one.** 14.2 GiB
was measured at the start of the round; 12.38 GiB is what the receipt stage read
immediately after two full-corpus scans, with the page cache hot. The JSON carries
12.38 with an explicit caveat that it is a *lower* bound on what a quiesced box
would offer.

**Neither reading changes the answer, which is the point of reporting both.**
Free memory read 11.7 GiB on 15 September; it has moved 0.7–2.5 GiB in the right
direction and the build is still 5.3 to 7.1 GiB short. A conclusion that survives
the spread between two honest measurements does not need the spread resolved.

The requirement is not extrapolated from a failure — it was *predicted in advance
and confirmed twice*. The spill notice fired at 1,571,661 tuples against a
predicted 1,571,676 at 4 GB, and at 3,144,795 against a predicted 3,146,443 at
8 GB. Doubling `maintenance_work_mem` doubled the tuples that fit and changed
nothing else.

What happens past the spill, in both runs: **1,303–3,249 tuples/s while resident,
221–233/s within one sample of spilling, ~24/s and still falling thereafter.** The
remaining work needed 41–52 hours on a straight-line read of a curve bending the
wrong way. Read-concurrency bound — 58–76 MB/s at 0.00 avg sec/read, CPU 27% —
so **more workers do not fix it; more memory does.**

**No index exists and none was attempted this round.** The catalog was asked two
separate questions — does `new1_doc_vector_stage_hnsw` exist, and is *any* `hnsw`
index present on that table under any name. Both answer no. The second question
exists because a partially-completed earlier round leaving an index under a name
nobody is looking for is how a stale graph gets searched.

The full specification for building it on a high-memory host —
index definition, host requirements, `maintenance_work_mem` strategy, monitoring
with a kill threshold, cancel and recovery, post-build integrity checks and the
evaluation that must follow — is **`docs/ai/new1-r15/NEW1_HNSW_OFFLOAD.md`**.

The build script is unchanged and already written:
**`services/harness/src/new1-final-hnsw-build.mjs`**. It refuses four ways before
writing anything, and the refusal that matters most on a restored host is
`REFUSED_VIEW_DRIFT` — it proves the restore carried the same *contract*, not just
the same rows.

### Public semantic search stays disabled, and that was verified in code

`services/api/src/release/capabilities.ts`:

- `search.semantic.broad` — `EXPERIMENTAL_INTERNAL`
- `search.semantic.supporting_authority`, `adverse_authority`, `counterarguments`,
  `abstention` — `DISABLED`
- `search.semantic.long_input` — `LIMITED` (a served refusal family, not a stopgap)

`isUserReachable()` returns true only for `ENABLED` and `LIMITED`, so no user
request touches the dense arm. **Building an index would not change any of this.**
Enabling is a separate decision that requires the full-index evaluation to have
run first, and it is not NEW1's alone to make.

---

## 7. WHAT THIS RECEIPT DOES NOT SAY

- **It does not say the corpus stopped growing.** `EMBEDDING_COMPLETE` describes
  the coarse backfill reaching its frontier. New ingest raises the denominator and
  the incremental queue raises the numerator behind it. That is the system working,
  and a later census showing different totals is not a contradiction of this one.
- **It does not recover the model revision.** `UNKNOWN` stays `UNKNOWN`. 42,988 of
  2,266,820,608 bytes of the local weights differ from the pinned-revision file.
  Four of five files pin cleanly; the weights do not. What exists instead is a
  locally hashed identity plus a byte-verified off-machine copy in R2 — a
  different and weaker claim than a recovered revision, and it is not dressed up
  as one.
- **It does not describe 7.67M-row ANN performance.** The R14 probe findings are
  about a 1,000,000-row index and are preserved as history only.
- **It does not claim the index is merely unbuilt-for-now.** Two measured attempts
  failed for a reason that a third local attempt would reproduce exactly.

---

## 8. REPRODUCING THIS

```bash
pnpm --filter @lawmind/harness new1:terminal
```

Four stages, each its own process with its own connection, each writing its
artifact before the next begins. Separate processes are deliberate: sharing one
pool across three full-table scans would make a failure in the third look like a
failure in the first, and a stage that dies leaves the stages before it on disk.

| stage | script | writes |
| --- | --- | --- |
| census | `new1-terminal-census.mjs` | `terminal-census.json` |
| integrity | `new1-vector-integrity.mjs` | `vector-integrity.json` |
| receipt | `new1-terminal-receipt.mjs` | `NEW1_TERMINAL_RECEIPT.json` |
| manifest | `new1-evidence-manifest.mjs` | `manifest.json` |

All relative to `docs/ai/new1-r15/`, overridable with `NEW1_OUT_DIR`.

Individually: `new1:census`, `new1:integrity`, `new1:receipt`, `new1:manifest`.
A subset: `--only census,integrity`. A partial run records `fullRun: false` and
names the stages it ran, so it can never be quoted as a complete one.

### Checking this round's evidence has not been edited since

```bash
pnpm --filter @lawmind/harness new1:manifest:verify
```

`EVIDENCE_MANIFEST=INTACT` and exit 0, or it names every changed, added and
removed file and exits 1. The manifest enumerates the **directory**, not a
hand-written list, so an artifact added later is covered automatically instead of
being silently omitted — which is the same failure one level up.

**This round's artifacts are bound by that manifest. R14's are not**, and this
round does not retro-fit them: `docs/ai/new1-r14/` is left exactly as it was,
including the broken binding, because editing another round's evidence to make a
chain look intact is the problem, not the fix. §0 records what is wrong with it.

**Budget 45–60 minutes and run it detached.** The census alone took 1,871 s on
15 September with five other backends active, and the integrity scan is a full
pass over 8.2M vectors. It is deliberately expensive and deliberately not cached
anywhere the product can read.

It does not re-derive the result — it **re-measures** it. If the corpus has moved,
the output moves with it. A receipt that cannot disagree with the database is not
evidence of anything.

**The census stage writes into `docs/ai/new1-r14/` on purpose.** That is the round
that produced the script and owns its artifact; this round does not overwrite R14's
evidence, it regenerates the census in place and records its own findings under
`new1-r15/`.
