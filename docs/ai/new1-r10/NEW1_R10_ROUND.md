# NEW1 R10 — the snapshot was re-cut and every finished batch became unfinished, 512 MB was provably too small, and the delta queue was built and never started

**29 August 2026. Lane NEW1. Leases: `NEW1`, `HEAVY_BOX`.**
Artifacts beside this file: `hnsw-build-measurements.json`,
`orphan-exclusion-proof.json`, `tranche-reach-delta.json`,
`coarse-walk-telemetry.jsonl`, `census-v2.log`, `hnsw-probe-builds.log`.

---

## The five things that actually mattered

| | |
| --- | --- |
| The walk had no scheduled task and the GPU sidecar did | the box was powered off at 22:49:57Z and back at 01:16:25Z; the sidecar returned at logon, the walk did not, and stayed dead a further **1 h 00 m** |
| The v2 snapshot re-cut every batch boundary | **0 of 766** files read complete under the new generation; the v1 worklist was measuring a population that no longer existed |
| A per-batch corpus-wide scan cost **63.6 s** and grew linearly | **12.4–26.3 hours** of GPU idling behind it across the remaining run |
| `maintenance_work_mem = 512 MB` is **provably** inadequate | pgvector says so itself: *"hnsw graph no longer fits after 195,122 tuples"*, and the penalty grows with size — 2.0x at 250k, **4.3x at 1M** |
| `delta-queue.mjs` was written in R9 and never started | 2,646 judgments behind, including all 1,334 of NEW2's 29 Aug cycle; LCC's consumer table found it from outside before I found it from inside |

---

## 1. COARSE FACTORY — snapshot semantics

### The snapshot, named so it can be checked rather than described

```
snapshot        docs/ai/embedding-manifests/document-vectors-v2/
definitionHash  5b5d02384b46c96c        (= sha256(pg_get_viewdef(judgment_embedding_eligibility)), live)
manifestHash    524ece8a42544b5e4cea9cff95bb8e72ba8a91e1d819a553d81c238472b5a5f7
cut at          2026-08-27T15:42:07Z    from embedding_content_representative
census cursor   ffffff40-1694-46f8-8dc7-f9532537609d   (tier-census, finished 15:41:43Z)
batches         766          rows 7,654,179
```

`embedding_content_representative` is homogeneous — 7,654,179 rows, all carrying
`5b5d02384b46c96c`, built 13:20:04Z → 15:41:43Z. There is no mixed generation in
it. The previous generation `e76879ab6bbcd452` held **8,854,281**; the deployed
definition holds **7,654,179**. That difference of 1,200,102 is not a loss, it is
the contract having tightened, and it is the whole reason §2 exists.

### The reconciliation, run once, and what it found

`stage-coverage-census.mjs` now takes `MANIFEST_DIR` / `COVERAGE_OUT` /
`INCLUDE_VALUE_BATCHES`, and records `manifestDir`, `definitionHash` and
`manifestHash` **into the census artifact itself** — a worklist with no
generation stamped on it cannot be checked against the walk that consumes it.

Measured over the v2 generation at `COMPLETE_TOLERANCE=25`:

```
batch files            766
manifest rows        7,654,179
accounted in manifest 1,873,292   (24.47%)
missing              5,780,887
files complete             0
files partial            766
files untouched            0
```

**Zero complete files.** Not a regression — the batch boundaries moved. v2 cuts
7.65M rows into 766 batches where v1 cut 8.86M into 886, so no v2 file is any v1
file and every one of them holds a mixture. The R9 worklist had a head at
`tier-a-batch-00229`; under v2 the head is `00000`, and that is correct.

### The R9 tolerance claim, now measured instead of asserted

R9 §3 raised `COMPLETE_TOLERANCE` from 25 to 2,000 because every v1 batch kept a
permanent ~1,200-row refusal residue, and predicted that a manifest rebuilt under
the deployed definition would not contain those rows at all. That was a
prediction. It is now a measurement — the walk's own three refusal rules, run
against all 5,780,887 unstaged rows of the snapshot:

```
residual                                        5,780,887
  outside judgment_embedding_eligibility                0
  text_safety = 'UNSAFE_VERIFIED'                       0
  refused class AND not a cited authority               0
  no text in the first 4,800 characters                 0
```

All four zero, in one query, 8 m 39 s on an otherwise-quiet box.

### Which of those four zeros carry information — two do, and I checked

Four zeros from four predicates are only worth as much as the predicates are.
A check that returns 0 for every input is not a check, so each was run against a
population that ought to make it fire:

| predicate | can it fire? | evidence |
| --- | --- | --- |
| outside the eligibility view | **NO — vacuous by construction** | `judgment_embedding_eligibility` holds **18,752,608** rows against `judgments`' **18,752,608**. There is a row for every judgment and eligibility is carried in the tier column, not by row presence. This zero says nothing and is **struck**. |
| `text_safety = 'UNSAFE_VERIFIED'` | **yes, and it is large** | **1,792,868** rows corpus-wide, 9.6% of the corpus |
| refused class, not cited | **yes** | **2,893** in a 200,000-row sample of the orphans — 1.45% |
| no text in 4,800 chars | live predicate, **empty population** | 0 in a 375,434-row `TABLESAMPLE` of the whole corpus, and `noText 0` on every batch the walk has ever run. True everywhere, so it distinguishes nothing here. |

**So the claim rests on two informative checks rather than four — and they are
the right two.** The v1 residue that forced the tolerance up to 2,000 was ~850
`UNSAFE_VERIFIED` plus ~350 `procedural_disposal` per 10,000-document batch.
Those are exactly the two predicates proven able to fire, and both are zero
across all 5,780,887 residual rows. The tolerance goes back to **25** and
"missing" means what it says again.

Two proven checks reported as two is worth more than four that read better. The
vacuous one was mine — I put it in the query without asking whether the view
could ever be missing a row.

**Independently confirmed by the walk within the hour, which is the check that
matters.** v1 batch `lcc-00262`, its last before the switch, reported
`ineligible 340 · textUnsafe 825`. v2 batch `lcc-00000` reported
`ineligible 0 · citedAuth 0 · textUnsafe 0 · noText 0`, and every batch since has
too. A prediction, a query, and a running process agreeing is worth more than any
one of them.

**And confirmed a third way, by the census itself, which is the cleanest of the
three.** Re-run at 05:56Z against the same tolerance of 25:

```
accounted in manifest  1,899,680   24.82%
files complete                63
files partial                703
worklist head    tier-a-batch-00063.jsonl
```

**Sixty-three files read COMPLETE at tolerance 25.** Under the v1 generation not
one batch could ever read complete at that tolerance — the ~1,200-row residue
guaranteed it, which is precisely why R9 had to raise the tolerance to 2,000. A
batch the walk has finished now reads finished. That is the whole defect closed,
demonstrated by the mechanism that the defect used to break.

It also means the next restart begins at `tier-a-batch-00063` rather than at
`00000`, so the §7.2 restart cost is not merely bounded by the re-census rule —
it is currently zero.

### Already-embedded ids are excluded, and the exclusion is exact

Batch `lcc-00000` names 10,000 ids; the census said 9,579 staged and 421 missing;
the walk inserted **exactly 421**. The census is not approximate.

The exclusion is per-page inside `doc-vector-embed.mjs` (`judgment_id = ANY(...)`
against the primary key, before the GPU sees anything) and it is cheap — batch
`lcc-00058` scanned 8,800 already-staged rows in 44 s. Their vectors are not
deleted and were never at risk; the mission's "do not delete their existing
vectors" was already the design.

### Live position

```
judgments                                18,752,608
snapshot representatives                  7,654,179
  staged, in snapshot                     1,898,295   24.80%
  remaining                               5,755,884
staged but NOT in snapshot (orphans)        486,955   -- §2
quarantined (proven text damage)             72,099   -- none of them in the snapshot
passage vectors (tranche, untouched)        418,116
statute-section vectors                      36,663
```

### Throughput and ETA, with the shape stated rather than smoothed

The worklist is bimodal and the ETA is meaningless without saying so: **193 files
at the head are ~96% pre-staged** (≈421 real inserts each), and **573 files are
~99.6% empty** (≈8,800 each). The head runs at ~18,900 vectors/hour because most
of its time is the already-staged scan; the body ran at **29,400/hour** measured
over 44 windows in R9.

```
head    130 files left x   421  =    54,730 docs  @ 18,900/h  =   2.9 h
body    573 files      x ~8,800 = 5,042,400 docs  @ 29,400/h  = 171.5 h
                                                     total    ~ 174 h = 7.3 days CONTINUOUS
```

**Continuous is not calendar.** The box was deliberately powered off at
22:49:57Z on 27 Aug and again on 26 and 25 Aug — roughly 2.5 h a night, from the
Windows event log (`Id 1074`, StartMenuExperienceHost initiated the power off),
not from a crash. At that duty cycle the calendar figure is **~8.1 days**, and
that is the number to quote.

`CAUGHT_UP_TO_SNAPSHOT` is **NOT reached** and will not be this round.
When it is, the value to report is `manifestHash 524ece8a4254…`, not a row count:
a moving corpus makes a count a statement about a moment and a hash a statement
about a population.

### The stall rule is armed, and its first window is not its rate

`coarse-walk-telemetry.mjs` now takes `TELEMETRY_LEDGER` and `COVERAGE_FILE` so
its denominator cannot silently come from a different snapshot than the walk's.
1 zero window notes, 2 alert, 3 kill. Zero windows so far.

Its first sample read `etaDays 27.76`. That is an artefact of opening in the head
region, not a rate — recorded here because the ledger will show it and somebody
will otherwise quote it.

---

## 2. ORPHANS — 486,955, excluded by construction and proven

### What they are, which was not what I expected

```
staged rows not in the v2 snapshot                    486,955
  their content_hash still has a representative        21,772    4.5%
  their content_hash left the eligible population     465,183   95.5%
```

I expected the opposite — that most would be the `--reset` picking a different
representative for the same content. **95.5% are documents whose content dropped
out of eligibility entirely** under the tightened definition. They are genuinely
stale, not merely re-labelled, and excluding them is the right call rather than a
tidy-up.

### Footprint

```
embedding payload            1,904 MB   (measured, sum(pg_column_size))
share of the 13 GB table        20.6%   (486,955 of 2,385,250 rows)
all-in with heap + PK        ~2.68 GB
```

Not reclaimed, per the directive. No physical deletion was done and none is
warranted: they corrupt no active retrieval once excluded, and 2.68 GB against
269 GB free on C: is not storage pressure.

### The exclusion, and why it is a column and not a join

A partial index predicate may only reference the indexed table's own columns, so
"is this row in the current snapshot" has to BE a column. `new1_doc_vector_stage`
gained `snapshot_hash text`, defaulted to the live definition hash for new rows
and back-filled for existing members:

```
ALTER TABLE new1_doc_vector_stage ADD COLUMN IF NOT EXISTS snapshot_hash text;
ALTER TABLE new1_doc_vector_stage ALTER COLUMN snapshot_hash SET DEFAULT '5b5d02384b46c96c';
UPDATE ... FROM embedding_content_representative ...      -- 1,876,252 rows in 24.0 s
```

**24 seconds for a 1.87M-row UPDATE on a table with a `vector(1024)` column**,
because the vector is TOASTed — heap 1,082 MB, TOAST 12 GB — so a tuple update
that does not touch `embedding` repoints the same TOAST chunks instead of
rewriting 4 KB a row. That was checked before running it, not discovered after.

Result: `in_snapshot 1,898,295 · orphan 486,955 · other_snapshot 0`.

### The proof, with orphans planted on purpose

`docs/ai/new1-r10/orphan-exclusion-proof.json`. A probe table of 40,000
in-snapshot rows with **10,000 orphans deliberately planted** — a 20% orphan rate
against the live 20.6% — then the real index built with the real predicate:

```
CREATE INDEX ... USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE snapshot_hash = '5b5d02384b46c96c'
```

```
index tuples                        40,000  of 50,000 table rows   -- matches exactly
plans using the partial index         40/40
rows returned over 40 probe queries    2,000
orphans among them                         0
NON-VACUITY: same vectors, no predicate  358 orphans in 500 rows
VERDICT                    ORPHANS_PROVABLY_EXCLUDED
```

The non-vacuity half is the half that matters. Without it the report says only
that orphans were not returned, which is equally true of an index that returns
nothing at all. A sequential scan over the identical table with the identical
query vectors surfaces the planted orphans at ~72%; the partial index surfaces
none. **The predicate is doing the work, and it was made to prove it against rows
it had to reject.**

The probe table is dropped; its numbers are in the artifact.

---

## 3. COARSE HNSW — halfvec, and 512 MB is not a setting anyone measured

### The type: halfvec, decided from the existing probes, no new bakeoff

`docs/ai/new1-halfvec/VERDICT_250K.md`, n = 256,998, both arms at production
`ef_search = 200`, paired over 684 shared queries:

```
quality   proposition p=0.267 · exact_citation p=0.688 · case_title p=0.804
          94-97% of queries return the gold at exactly the same rank
cost      index 3.0x smaller · table 2.5x smaller · build 1.34x faster
          latency p50 2.9x faster · p95 2.2x faster
```

No quality difference detected on any family; halfvec wins every measured cost
axis. **Decision: halfvec.**

**As an EXPRESSION index over the `vector(1024)` column, not a column change.**
`CREATE INDEX ... USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops)`.
fp32 casts down to halfvec and halfvec cannot cast back up, so the stage table
stays fp32 while an 8-day walk is still writing to it. This gets the entire
measured index/latency win with none of the irreversibility, and it is what the
VERDICT's own recommendation asked for.

### The memory setting: measured at two sizes and two settings, never one point

`docs/ai/new1-r10/hnsw-build-measurements.json`. m = 16, ef_construction = 64,
`max_parallel_maintenance_workers = 4` held constant, candidate chosen from
measured host headroom (31.7 GB total, 14.6 GB free at 2026-08-28T02:00Z).

| rows | `maintenance_work_mem` | seconds | rows/s | index | B/vec | spilled |
| ---: | --- | ---: | ---: | ---: | ---: | --- |
| 250,000 | **512 MB** (current) | 188.3 | 1,328 | 683 MB | 2,731 | **yes** |
| 250,000 | 4 GB | 94.4 | 2,648 | 683 MB | 2,731 | no |
| 1,000,000 | **512 MB** (current) | 1,367.4 | 731 | 2,730 MB | 2,730 | **yes** |
| 1,000,000 | 4 GB | 317.2 | 3,153 | 2,730 MB | 2,730 | no |

**512 MB is inadequate and pgvector says so in its own words**, twice, at a
reproducible point:

```
hnsw graph no longer fits into maintenance_work_mem after 195,122 tuples   (250k arm)
hnsw graph no longer fits into maintenance_work_mem after 195,110 tuples   (1M arm)
```

Those two numbers are 12 tuples apart across a 4x change in table size, which
makes the build arena a hard constant: **2,752 bytes per tuple**. This is the
direct evidence of adequacy the round asked for. Build time is a proxy for it;
the NOTICE is the thing itself.

**And this is exactly why a single-point extrapolation was forbidden.** From the
250k pair alone the penalty for 512 MB looks like 2.0x. It is not a constant — at
1M it is **4.3x**, because at 512 MB the rate *degrades* with size (1,328 → 731
rows/s) while at 4 GB it *improves* (2,648 → 3,153 rows/s). One size point would
have understated the cost by more than half, and in the wrong direction.

### What the full build actually needs, stated with its uncertainty

At 2,752 B/tuple, an entirely-in-memory build of all 7,654,179 needs **21.07 GB**
of `maintenance_work_mem`. The host has 31.7 GB total and 14.6 GB free.
**A no-spill full build is not achievable on this box at any setting**, so the
question is not whether it spills but how far past capacity it runs:

| setting | capacity (tuples) | overcommit at 7,654,179 | projected |
| --- | ---: | ---: | --- |
| 512 MB (current) | 195,116 | **39.2x** | outside the measured range — **not projectable**, and the trend is still worsening at 5.1x |
| 4 GB | 1,561,000 | 4.90x | ~2.8 h |
| 8 GB (recommended) | 3,122,000 | 2.45x | ~2.0 h |

The 4 GB and 8 GB rows are interpolated log-linearly between the two measured
spilled points (1.28x → 1,328 rows/s, 5.13x → 731 rows/s). **They are estimates
and are labelled as such.** The 512 MB row is deliberately left blank rather than
extrapolated: 39.2x is twenty times beyond anything measured, and inventing a
number there is the failure this section exists to avoid.

**Recommendation: build at 8 GB session-local `SET maintenance_work_mem`**, never
a server-wide change, with the host's free memory re-measured immediately before
and `pg_stat_activity` sampled and recorded alongside.

**Named next measurement, before committing:** one arm at 1M rows and 2 GB, which
lands at 1.38x overcommit and fills the empty gap between the 1.28x and 5.13x
points the projection currently interpolates across. It costs ~10 minutes and it
is the difference between an interpolation and a curve. Not run this round
because I had told LCC the box was free of my index builds and I would rather
keep that than have a third point today.

### Disk and RAM

```
index bytes per vector      2,730 B   (2,730 and 2,731 measured at 4x apart -- stable)
full coarse halfvec index    20.9 GB   (7,654,179 x 2,730)
the same index as fp32      ~59.8 GB   (at VERDICT_250K's measured 7,806 B/vec)
saved by halfvec            ~38.9 GB
C: free                     269.1 GB      D: free 768.3 GB
```

**The D: tablespace is NOT required for this index.** `FQ-N1-R9-1` asked the
founder to approve one; on these numbers the coarse halfvec index fits on C:
alongside the 13 GB stage table with ~235 GB to spare. That question can be
de-escalated to "wanted for the 935 GB full passage build", which is a different
and much later decision. **The passage question is unchanged; only the coarse one
is answered.**

Query-time RAM behaviour at 20.9 GB against 31.7 GB of host memory and 2 GB of
`shared_buffers` is **UNMEASURED**. The 250k probe's p50 of 14 ms was taken on an
index that fit in cache and does not transfer.

### The build gate — not yet, and the condition is numeric

```
snapshot complete    1,898,295 / 7,654,179 = 24.80%
```

Building now indexes a quarter of the population and throws it away on the next
rebuild. **No full index is built this round.** The condition to build is the
snapshot being sufficiently complete, plus the 2 GB arm above, plus a
speed-checked destination — and the destination question is now answered (C:).

---

## 4. PASSAGES — untouched, deliberately

418,116 passage vectors over 81,720 documents, unchanged. **Tranche V2 was not
started.** Its frozen manifest `idsHash 3592efcbc5165a9f` is preserved.

§5 was supposed to supply V2's decision basis. It did, and the answer it gives is
not the one that was expected — see below. V2 stays frozen and it now has a
stronger reason to than "no evidence yet".

---

## 5. THE WIRED TRANCHE — measured, and it moves this benchmark by one document

LCC's wiring landed. `services/api/src/search/retrieve.ts` unions a
`new1_tranche_passages` arm into `dense()` beside `judgment_chunks`, each in its
own `MATERIALIZED` CTE with its own `ORDER BY ... LIMIT` so both HNSW indexes are
usable. `tranche-reach.test.ts` asserts the gate three ways.

**The internal gate is unchanged and nothing here is a release claim.**
`search.semantic.broad` remains `EXPERIMENTAL_INTERNAL`; no user request reaches
the dense arm. There is no "semantic search over the corpus" anywhere in this
round.

### Why this is a reach measurement and not an A/B

The honest A/B runs the same gold with the tranche arm on and off. The arm is
unconditional inside `dense()`, `retrieve.ts` is LCC's file, and adding a toggle
to it is not this lane's edit. Rather than approximate an A/B, I measured the
thing that needs no toggle and no assumption: **which index can reach each gold
authority at all.** A document in neither index cannot be returned by the dense
arm at any ranking quality whatsoever, so the ceiling is exact.

`docs/ai/new1-r10/tranche-reach-delta.json`, over NEW3's semantic-expansion gold
(750 rows → 684 after the adapter's recorded drops, 228 distinct authorities):

```
corpus reach   judgment_chunks 40,161 · tranche 81,720 · union 111,874 · 2.786x
```

| family | chunks | tranche | union | newly reachable | coarse staged | in v2 snapshot | **reachable when the walk completes** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| proposition | 0 | 1 | 1 | **1** | 177 | 186 | **186 — 81.58%** |
| exact_citation | 0 | 1 | 1 | **1** | 177 | 186 | **186 — 81.58%** |
| case_title | 0 | 1 | 1 | **1** | 177 | 186 | **186 — 81.58%** |

(The three families share one authority set, queried three ways, so the columns
are identical by construction — stated because otherwise it reads as a bug.)

### The finding

**The 2.786x corpus reach is real and it moves this benchmark by one authority
out of 228.** Not because the wiring is weak. 0 and 1 are exactly what a random
draw predicts against indexes covering 0.214% and 0.436% of the corpus — the gold
set is simply not in either passage index. **Any per-query-family rank delta
published on this gold would be noise, and none is published.** That is the
per-family delta the round asked for; it is a null result, and reporting a null
result as a null result is the point.

The number that is not null is the last column. **186 of 228 (81.58%) are in the
coarse snapshot and 177 already have a vector.** The benchmark is movable — by
the coarse walk and its index, not by the tranche. That is the strongest evidence
this round produced for the coarse walk's priority, and it came out of LCC's
wiring, which is why the wiring was worth measuring even though its delta here is
one.

**It is also Tranche V2's decision basis, and it argues against V2.** V2 would
add more passage vectors to a population this gold set barely intersects. The
coarse layer intersects it at 81.58%. V2 stays frozen.

---

## 6. NEW DATA

### Exact and lexical are structural — verified from the catalogue, not the docs

```
judgments.full_text_tsv   attgenerated = 's'   (STORED GENERATED)
                          to_tsvector('english'::regconfig, full_text)
```

`pg_attribute.attgenerated = 's'` is the proof. Every row NEW2 inserts is
full-text searchable in the same statement that writes it, with GIN index
`judgments_full_text_idx` maintained on write. There is no backfill job and there
never was. R9 asserted this; this round read it out of the system catalogue.

### The embedding queue — built in R9, never started, now durable

LCC's 1447 consumer table read **`NEW1 embedding 0 / 1,334 NOT WIRED`** and it
was accurate. Their diagnosis — that a point-in-time manifest cannot see a
judgment ingested after the cut — is right about the mechanism and wrong only
about the remedy, because the remedy already existed.

`delta-queue.mjs` walks `judgments.created_at` (never `id`: a random uuid puts
half of every future row below an id watermark), with a deliberate one-minute
overlap, and advances the watermark only on proof of durable output. **Its
watermark still read `2026-08-27T13:05:10.694Z`.** A tool nobody runs is exactly
as absent as a tool nobody wrote.

First pass, 05:44:36Z:

```
pending 2,646 · emitted 930 · alreadyCoveredByContentHash 137
930 of 930 inserted in 87.2 s at 9,435 tok/s
refusals: noText 0 · ineligible 0 · textUnsafe 0
watermark -> 2026-08-29T04:55:22.134Z     -- NEW2's exact frontier
nonUnitNormVectorsThisRun 0
```

Registered `Lawmind-new1-delta-queue`, every 15 minutes,
`MultipleInstances=IgnoreNew`, STOP-file guarded, registry `new1-delta-queue`.
**No census per delta**, as the round requires.

The gap between 2,646 pending and 1,067 accounted is the eligibility view
refusing brief/stub rows — not a loss.

### Statute sections

36,663 vectors across 849 Acts in `document_vector_staging`, unchanged, on the
existing pipeline behind LCC's migration 0089 `CHECK` widening.

---

## 7. Two production defects found by measurement, both fixed

### 7.1 A per-batch scan of the whole table, 63.6 s and growing

`doc-vector-embed.mjs` ended every batch with

```sql
SELECT count(*) FROM new1_doc_vector_stage WHERE abs(1 - (embedding <#> embedding) * -1) > 0.01
```

`EXPLAIN ANALYZE` at 2,363,367 rows: **63,575 ms**, 4 parallel workers, 20.6M
buffers — because `embedding <#> embedding` detoasts all 13 GB to certify the 431
vectors that batch had just written. It grows linearly: **~206 s a batch** at
the snapshot's 7.65M rows, over ~703 remaining batches — **between 12.4 hours
(if the table never grew) and 26.3 hours (linear mean across the growth)** of GPU
idling behind a scan, plus the IO it takes from everything else. Quoted as a
range because which batch lands where on the growth curve is not knowable in
advance, and a single figure would be a guess wearing a measurement's clothes.

`INTENT: code ran a corpus-wide non-unit-norm scan after every batch; the task
expects continuous production with no healthy-GPU/no-output waste; the spec — the
field's own record, `new1_doc_vector_stage_run` — is a per-run summary of the
vectors that run wrote.`

Scoped to the ids the run inserted. **Stricter per vector**, not weaker: an exact
id list cannot be satisfied by a row somebody else wrote. What is genuinely lost
is an incidental corpus-wide sweep that was never scheduled and never claimed;
it is now available deliberately as `FULL_NORM_CHECK=1`, and
`stage-milestone.mjs` still carries a corpus-wide check where a corpus-wide check
belongs. Keys renamed to `nonUnitNormVectorsThisRun` /
`nonUnitNormVectorsCorpus` so no new summary can be read against an old one as
though they answered the same question.

### 7.2 A restart re-walked everything it had already finished

The scheduled task restarts the runner on exit, which is the point of it. But the
worklist comes from a coverage census **file**, and the runner re-read that file
without asking its age. Batch `lcc-00010` aborted on a sidecar `fetch failed` at
03:03; the task restarted at 03:06; the walk began again at batch `00000`.

That is COARSE_RESTART_R9.md §3's stale-worklist failure one layer further out —
fixed for the *first* start and reappearing on *every restart after it*.
Measured cost at batch 55: **~64 minutes of guaranteed zero output per restart**,
growing with every batch completed.

`stage-runner.sh` now re-censuses when the coverage file is older than
`COVERAGE_MAX_AGE_MIN` (45). The census costs ~7 minutes against a restart cost
that passes 7 minutes once the walk is ~7 batches in, it is skipped when the file
is fresh so a crash-loop cannot become a census loop, and a census **failure**
logs and walks the stale file anyway — slow beats stopped.

### 7.3 And the reason the diagnostic was invisible

`| tail -3`. `CREATE TABLE IF NOT EXISTS` on an existing table is a NOTICE,
`doc-vector-embed.mjs` installs no `onnotice`, and postgres.js prints the whole
object — more than three lines. So the log recorded `routine:
'transformCreateStmt'` and a closing brace while the actual message, `fetch
failed`, was pushed out of the window. Now `tail -20`. A truncation that can hide
the only diagnostic is worse than a long log.

---

## 8. Two writers, one 8 GB GPU

Starting the delta queue created a second continuous GPU consumer, and that was
checked before it was started rather than after:

- `services/embed/gpu/server.py` is a `ThreadingHTTPServer` — two concurrent
  POSTs get two threads and both run ONNX inference.
- Observed VRAM with one consumer peaks at **7,514 MiB of 8,188**.

A second concurrent batch does not queue behind the first; it competes for memory
that is not there, and the caller sees `fetch failed`. **That is the most likely
account of batch `lcc-00010`'s three deaths on 28 Aug** — it had degraded to
64 tok/s against a normal 8,000 while my own 1M index build held the rest of the
box. Stated as the leading hypothesis, not as proven: the sidecar logs no OOM,
and the contention is inferred from the timing and the VRAM headroom.

The token lives in `doc-vector-embed.mjs`, the shared choke point both consumers
reach the GPU through — a lock one of two callers honours is not a lock.
`.agents/logs/new1-gpu-embed.lock`, first-come-first-served with a bounded wait
(a refusal would starve the queue permanently, because the walk always runs),
stale holders cleared via `process.kill(pid, 0)` because `pgrep` does not exist
on this box.

**The lock's first contention was real and it is measured, not assumed.** The
delta queue took the token at 05:44:40 and released it at 05:46:12. Batch
`lcc-00057` reached `STAGE START` at 05:45:17 — inside that window — and
acquired the lock at **05:46:12.492**, 133 ms after the queue's `STAGE DONE` at
05:46:12.359. It waited **55.1 s** and then ran normally. Both jobs completed and
nothing hit the GPU twice.

Acquisition is otherwise free: batches 58 through 62 log `STAGE START` and
`GPU lock acquired` in the same millisecond. The token costs nothing when
uncontended, which is the property that makes it safe to leave on.

Two limits of it, stated because neither is fixed:

- **Pid reuse.** `process.kill(pid, 0)` answers "is some process alive with this
  pid", not "is it my embedder". A recycled pid on a stale lock would make every
  batch wait the full 30-minute bound before proceeding. Not observed; the lock
  file already carries `batchFile` and `at`, so the check can be tightened to
  match the process's command line if it ever is.
- It guards the GPU only between callers that go through `doc-vector-embed.mjs`.
  Anything else that POSTs to port 8799 is outside it.

---

## 9. Durability — the actual root cause of the round's biggest loss

The walk died at **2026-08-27T22:49:45Z**. The box was powered off at 22:49:57Z
and came back at 01:16:25Z — a deliberate nightly shutdown, `Id 1074` in the
Windows System log, matching the same pattern on 26 and 25 August.

The GPU sidecar came back at logon because it **has a scheduled task**. The walk
and its telemetry did not, because they were started with `Start-Process` — which
survives a session and not a reboot, exactly as
`NEW1_GPU_PROCESS_TRUTH_R7.md` §4 said it would.

```
22:49:45 -> 02:16:28   3 h 27 m of GPU idle
  of which 2 h 27 m    the box was off — not recoverable
  of which 1 h 00 m    the walk had no way to restart itself — now fixed
```

Registered, all three STOP-file guarded, `MultipleInstances=IgnoreNew`:

```
Lawmind-new1-coarse-walk        bash services/harness/src/walk-launch.sh        5 min
Lawmind-new1-coarse-telemetry   bash services/harness/src/telemetry-launch.sh   5 min
Lawmind-new1-delta-queue        node services\harness\src\delta-queue.mjs      15 min
```

Verified durable by parentage rather than by liveness: the walk's `cmd.exe` is
pid 26608, parent 2524 — the Task Scheduler service, **not** the agent shell.

The snapshot identity is a **file**, `docs/ai/new1-tier-a/.snapshot.env`, read on
every start including every restart and every reboot, because a scheduled task's
argument list is not somewhere anyone looks to find out which population is being
walked, and `git status` shows when a file changes.

---

## 10. Caveats — what is unverified, assumed, or owed

1. **One of the four residual checks was vacuous**, struck above: the
   eligibility view has a row per judgment, so "outside the view" could never
   fire. The conclusion survives on the two predicates proven able to fire,
   which are the two the v1 residue was actually made of — but the original
   four-zero framing overstated the evidence and is corrected rather than
   quietly kept.
2. **The 8 GB build projection is an interpolation**, between two measured
   spilled points at 1.28x and 5.13x overcommit. The 2 GB arm named in §3 is the
   measurement that would turn it into a curve, and it was not run.
3. **512 MB at full scale is not projected at all.** 39.2x overcommit is twenty
   times past anything measured. The blank in that table is deliberate.
4. **Query-time latency and RAM behaviour for a 20.9 GB index are UNMEASURED.**
   The 250k probe's 14 ms p50 was on an index that fit in cache.
5. **The GPU contention account of `lcc-00010` is a leading hypothesis, not a
   proof.** No OOM appears in the sidecar log; the evidence is timing and VRAM
   headroom.
6. **`script_quality` is NULL on everything being embedded.** The eligibility
   view's `axis_b_text` admits `script_quality IS NULL`, so documents reach the
   GPU on an absence of evidence. NEW2's screen convicts some and leaves the rest
   NOT ASSESSED, and NOT ASSESSED is not a pass. Every coverage number here
   carries it. Not this lane's column.
7. **The reach measurement is a ceiling, not a result.** A reachable authority
   can still rank 400th. Nothing here says the coarse layer will *retrieve* those
   186 well — only that the dense arm cannot retrieve them at all today.
8. **No index build, no gate change, no release claim.** `search.semantic.broad`
   is `EXPERIMENTAL_INTERNAL` and untouched.
9. **The v1 manifest directory is left in place.** 886 files, superseded, not
   deleted, because the running walk's history references it.
10. **Probe cleanup**: `new1_probe_excl`, `new1_probe_fp32_250k` and
   `new1_probe_half_250k` dropped — 5.1 GB, their numbers recorded in the
   artifacts. `new1_probe_hnsw_250000` and `new1_probe_hnsw_1000000` kept (9.9 GB)
   because the 2 GB arm in §3 needs the 1M table; drop both once it is run.

---

## 11. What is queued on someone else

- **LCC** — `resource-lease.mjs` reports `status` from the `.json` and `acquire`
  from the `.lock`, and they disagreed about my own takeover. Handed to LCC in
  1453; I am not in that file. Asked that the repair keep `.lock` as the mutex and
  make `.json` a derived view, rather than writing both.
- **LCC** — the box is theirs for the `judgments` vacuum and the two
  `EXPLAIN (ANALYZE)` runs; I have no index builds queued and will hold the walk
  and the delta queue still for the two EXPLAINs on request.
- **NEW2** — `script_quality` on the delta (caveat 5), and their sequential
  `source_url` read is cleared to run against my lane (1454).
- **Founder** — `FQ-N1-R9-1` (D: tablespace) is **de-escalated, not withdrawn**:
  not needed for the coarse index, still open for the 935 GB passage build.
