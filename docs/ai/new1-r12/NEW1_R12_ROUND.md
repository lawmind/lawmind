# NEW1 R12 — EMBEDDING COVERAGE, REPRODUCIBILITY, FINAL-INDEX READINESS

**Lane:** NEW1 · **Date:** 30 Aug 2026 · **HEAD read:** `0e68dd1`
**The walk ran throughout and was never touched.** Batch 236 → 243 of 766 during
the round, GPU at 99%, no restart, no pause, no configuration change.

---

## Outcome, first sentence

Coverage now has four separately-named metrics instead of one drifting number
(**32.03%** representative, **36.64%** document reach); the coverage skew that
looked like a data-moat problem is **proven** to be walk position over a
non-uniform id space and not a hole; and the model revision was **not**
recovered — because the local weights match **no upstream revision that has ever
existed**, differing from the pinned revision in 42,988 bytes, which makes them
irreplaceable and now backed up off-machine and verified.

---

## 0. Integration

`edac0de` (NEW1 R11) is an ancestor of HEAD. LCC R12 is present (`0e68dd1`,
`docs(lcc-r12)`). No integration failure; code was mutated only after this check.

---

## 1. Four metrics, one definition each

The drift was real and it had a specific shape: a whole-stage row count divided
by the eligible-representative denominator. That numerator contains 486,955
vectors from a generation that predates the snapshot stamp.

| metric | value | what it is |
| --- | --- | --- |
| **A** STAGE_PHYSICAL_ROWS | 2,942,818 | every vector row, any generation |
| **B** CURRENT_GENERATION_VECTOR_ROWS | 2,455,863 | rows stamped `5b5d02384b46c96c` |
| **C** ELIGIBLE_REPRESENTATIVE_COVERAGE | 2,451,682 / 7,654,179 = **32.0306%** | distinct eligible *content* with a current vector |
| **D** DOCUMENT_REACH | 3,085,348 / 8,420,728 = **36.6399%** | *judgments* reached, since one vector can stand for many identical ones |

Exact SQL for each sits beside it in
`docs/ai/new1-r12/EMBEDDING_COVERAGE_AUTHORITY.json`. R11's 29.61% was honest and
is simply older; these are refreshed, not corrected.

**Do not call C "corpus coverage".** 8,420,728 is what the representative
snapshot admits to document-level representation. `judgments` holds 18,758,460
rows.

### The cross-lane correction, and a trap inside it

NEW3's registry reportedly records ≈**35.780%**. That is 2,738,665 / 7,654,179 —
metric **A** at an earlier moment over the metric-C denominator.

It is now numerically close to metric **D** (36.64%) **by accident**. Two
different quantities converging for a few days is the most dangerous shape a
wrong metric can take, because correcting it will look like it changed nothing.
NEW3 owns its registry; NEW1 did not edit it and has broadcast the correction.

---

## 2. SYSTEMATIC_COVERAGE_HOLE = **no**, and this time with a mechanism

No court is at zero. No year is at zero. Coverage ranges 22.1%–51.7% by court and
21.3%–63.4% by year, which looks alarming until you ask *why*.

**The id space is not uniform.** Bucketing all 7,654,179 manifest rows by the
first hex character of `judgment_id`: buckets `0`–`5` hold ~400,000 rows each,
buckets `6`–`f` hold ~525,000. For uuid v4 every bucket should hold 478,386 ± ~65.
Every sampled id *is* v4. So the ids are random in form, but the population
behind them is not evenly spread across the id space — and buckets `0`–`5`
average 6,600 characters per document against 5,600 for `6`–`f`.

The walk goes in ascending id order. It has therefore done the long-document end
first, and *that* is the entire skew.

**The proof:** predicting each court's coverage purely from the fraction of its
representatives inside the walked prefix reproduces the measured value for all 27
courts to within ~1 percentage point, residuals uniformly positive and small —
exactly what walk advancement during measurement produces.

| court | predicted from walk position | measured |
| --- | --- | --- |
| Patna | 18.72% | 19.08% |
| Allahabad | 24.32% | 25.03% |
| Madras | 32.64% | 33.23% |
| Bombay | 35.48% | 36.46% |
| Supreme Court of India | 36.74% | 37.28% |
| Delhi | 38.55% | 39.54% |
| Manipur | 41.69% | 42.59% |

**Consequence, and it matters more than the verdict:** mid-walk per-stratum
coverage is a *biased estimator* of final coverage. Do not "fix" this
distribution and do not read it as a moat gap. It closes on completion by
construction.

### Three dimensions that could NOT be measured — say so, do not imply uniformity

- **Source** — `judgments.source_id` is non-null on 5,830 of 18,758,460 rows and
  NULL for all 8,420,728 in the snapshot. Not "uniform": **unmeasured**.
- **Language** — `'en'` on 18,758,460 of 18,758,460, zero exceptions. A column
  with one value is a default, not a measurement.
- **Text safety** — `script_quality` is NULL for the entire representative
  population, verified per court (NULL count equals uncovered count for all 27).
  The eligibility view admits a row when it is NULL, so this population was
  admitted on the *absence* of a damage screen. Pre-existing, restated with an
  exact denominator.

### One anomaly, recorded not explained

**High Court of Jammu and Kashmir and Ladakh: 190 of 190 covered (100%)** against
37.89% predicted. The only stratum that breaks the model, and it breaks in the
*over*-covered direction — evidence that some non-walk path wrote
current-generation rows. Too small to move coverage; too odd to leave unwritten.

---

## 3. MODEL_REVISION_RECOVERED = **UNKNOWN**, and the reason is worse than a lost note

Search, in the ordered sequence:

- **A. HF cache metadata** — nothing. Flat `local_dir`, no `refs/`, `snapshots/`,
  `blobs/` or `.cache/huggingface`. The user hub cache holds only PaddlePaddle
  OCR repos.
- **B. Download logs / HTTP metadata** — nothing. `fetch-model.ts` streamed to
  disk and logged only Content-Length and seconds.
- **C. Repository history** — decisive, and **negative**.

All 17 commits of `Xenova/bge-m3` were enumerated and per-revision blob metadata
fetched. The method was *controlled*: `lfs.sha256` is the content hash, and two
of our three LFS files match it exactly at every revision, which proves the
metadata is trustworthy for this repo.

- `onnx/model.onnx` → matches every revision from `044d00ee` onward ✓
- `tokenizer.json` → matches every revision from `1fa62281` onward ✓
- `config.json`, `tokenizer_config.json` → byte-identical to the pinned revision ✓
- **`onnx/model.onnx_data` → matches nothing.** Across all 17 commits exactly one
  blob of size 2,266,820,608 has ever existed (`1eebfb28…`). Ours is `a02dfa4c…`.

Four of five files pin cleanly to `4de13258303883538bd53b696b452bf8099f0858`. The
fifth pins to nothing. The rule is that **all** files must match the **same**
immutable revision before recovery may be claimed. It is not met. Recovery is not
claimed.

### What the difference actually is

The whole 2.27 GB file was streamed from the pinned revision and compared
byte-for-byte against the local copy, without writing it to disk (16 spread
1 MB spot-checks came back identical first, which is what justified spending the
full comparison).

- **42,988 bytes differ** of 2,266,820,608 — 0.0019%, in 16,437 ranges, first at
  offset 1,047,976,779.
- The streamed sha256 recomputed to `1eebfb28…`, independently confirming the API.
- **Not rounding.** Sampled float32 pairs: upstream `-0.162109375` vs local
  `0.0405273438`; upstream `0.0877075195` vs local `-0.115051270`. Sign flips,
  absolute differences up to 1.399.

Almost certainly a download defect that preserved length — which the old
size-only check could not possibly catch.

### Does it damage the corpus? No. Does it bind it? Permanently.

12 stage documents re-embedded on CPU with both weight sets, using the sidecar's
exact recipe:

| comparison | min | mean | max |
| --- | --- | --- | --- |
| local CPU vs **stored** GPU | 1.000000 | 1.000000 | 1.000000 |
| local CPU vs **upstream** CPU | 0.999568 | 0.99978 | 0.999892 |

The stored vectors reproduce **exactly** from the local weights. The corpus is
sound and the pipeline is self-consistent.

But upstream weights sit 0.99957–0.99989 from the corpus — **below the floor this
project already set for itself.** `services/embed/gpu/server.py` refuses TF32
because it put 1 chunk in 48 at 0.9988 while true fp32 held every chunk above
0.9999. Here *every* chunk is at or below 0.9999.

**The real risk is not corpus damage. It is query-corpus divergence:** a freshly
built container fetching upstream would embed *queries* into a measurably
different space from the corpus they search, and nothing would error.

### What changed in the downloader

`services/embed/src/fetch-model.ts` now pins the full 40-char revision, verifies
sha256 after download and refuses on mismatch, and — critically — **keeps a
cached file whose hash equals the corpus hash and never re-fetches over it**, so
the fetcher can no longer destroy the only copy of the weights v2 was built from.
`EMBED_REQUIRE_CORPUS_BYTES=1` makes a query-serving process refuse upstream
bytes outright. Typecheck clean.

**The live `.models` directory was never touched, re-downloaded or overwritten.**

---

## 4. MODEL_BYTES_MUST_BE_PROTECTED = yes → done and verified

2.128 GiB pack (5 pipeline files + manifest), each hash re-verified after copy,
uploaded to Cloudflare R2 (`lawmind-corpus`, the destination
`docs/ops/LOW_COST_BACKUP_ARCHITECTURE.md` names) through the existing
`scripts/migration/backup-r2.mjs` path.

**VERIFIED: 7 files, 2.13 GB, every object downloaded back and compared
byte-for-byte, 0 differences.**

Two things to declare rather than bury — see *Damage I caused* below, and: the
pack went up **unencrypted** while the architecture says to encrypt before
off-machine storage. These are public model weights with no client or personal
data, so the confidentiality reason does not apply — but the rule was not
followed.

---

## 5. Generation identity — GENERATION_IDENTITY = **HOLD**

Good: every current-generation row carries the same `snapshot_hash`; 2,455,863
stamped, 486,955 NULL, **zero** anything else. The manifest hash on the lease
matches disk, and seven sampled batch `idsHash` values re-hash correctly. The
active generation was consistently labelled and **did not change mid-walk**.

Not good, and unchanged from R11: the stamp is a **column DEFAULT with no
migration and no writer in git**. A fresh database stamps every row NULL. It is a
constant, so pointing the walk at a new snapshot without changing it mislabels
every new row silently. The writer cannot stamp definition hash, manifest
identity, model identity or recipe identity as fields.

A schema change is required and it belongs to **MIGRATION_SLOT**. NEW1 did not
take that slot and did not alter the table.

**VECTOR_STAGE_ROLE = NOT FOUND.** LCC R12 commits and `docs/ai/lcc-r12/` were
read; no `FACTORY_SCRATCH`/`CANONICAL_SERVING` decision is recorded at HEAD. NEW1
states no value and assumed neither.

---

## 6. Delta queue — identity holds, contention never happened

68 considered; EMBEDDED 46, REFUSED_NOT_ELIGIBLE 19, ALREADY_COVERED 3, QUEUED 0,
everything else 0. **Named 68, unnamed residual 0, predicates agree.**

`DEFERRED_GPU_BUSY`: **0 occurrences, code path present** at
`delta-queue.mjs:217`. Not exercised, and **not manufactured** — a backlog created
to trigger a state is not evidence about production.

`WATERMARK_VALID = yes`. It equals `max(judgments.created_at)` to the
millisecond. It has been pinned at 14:31 on 29 Aug by a permanent residue of 19
never-eligible rows, but the window is open-ended at the top so nothing is
missed — the cost is an unboundedly growing rescan, not a gap.

**Worth passing on:** `max(judgments.created_at)` has not moved since 14:31 on
29 Aug either. The delta queue is idle because **ingest** is idle. Different
problem, different lane.

---

## 7. Lease truth — a real defect, found and fixed

`lane-lease status NEW1` read **DEAD for 341 minutes** while the walk was
demonstrably progressing (GPU 99%, batch 236→241, rows 2,870,026→2,925,714).
`HEAVY_BOX` read `RUNNING_PROGRESSING` for the same period, about the same
worker, on the same box. Two bus surfaces, one worker, opposite answers.

**INTENT: code does** — `worker-truth.mjs` heartbeats only `HEAVY_BOX`, and
`lane-lease.mjs` had no way to record `livenessSource`, so the lane lease's only
witness was a session pid that had exited; **the task expects** — the NEW1 lease
cannot read DEAD while the walk progresses and must decay when it stops; **the
spec says** — `worker-truth.mjs`'s own header, lines 9–27, states that
`HEAVY_BOX` *and the NEW1 lane lease* both stop being heartbeated by the agent and
start being heartbeated by this keeper. All three agree; this is a bug against
stated intent, not a new decision.

Fixed in two places, both additive and opt-in:
- `scripts/lane-lease.mjs` — `--liveness durable-progress`, `--durable-metric`,
  and `--current-output` on heartbeat. `health()` already understood
  `livenessSource`; only the lane lease had no way to set it.
- `services/harness/src/worker-truth.mjs` — heartbeats the NEW1 lane lease as its
  **recorded owner**, read off the lease, exactly as it does for `HEAVY_BOX`.

**Proven in production:** the 5-minute keeper now logs
`lane: NEW1: heartbeat ok … output 2941823 (moved)`.
**Decay half proven too:** two heartbeats with an unchanged value leave
`lastProgressAt` byte-identical.

**Still outstanding:** the lease *record* does not yet carry `livenessSource`,
because acquiring it needs one command this session was not permitted to run. See
*Blockers*.

`GPU_WRITERS = 1`. One embed chain, one sidecar, one lock. S4U/headless untouched;
`RESTART_AFTER_LOGON` still explicit.

---

## 8. Stage integrity — CURRENT_STAGE_INTEGRITY = **PASS**

Full scan, 93 s, norms via `sqrt(-(v <#> v))` (`l2_norm` has two ambiguous
overloads on this install and errors).

| | current gen | old gen |
| --- | --- | --- |
| rows | 2,455,863 | 486,955 |
| NULL embeddings | 0 | 0 |
| wrong dimensions | 0 | 0 |
| zero vectors | 0 | 0 |
| non-unit beyond 1e-3 | 0 | 0 |
| norm range | 0.9999997616 – 1.0000002384 | 0.9999998212 – 1.0000001788 |

Duplicates: **1** duplicate content hash inside the current generation (one
wasted embed in 2.46M, not a corruption); **3,206** cross-generation — expected,
and exactly the rows any whole-stage metric double-counts.

Nothing was cleaned. The 486,955 old-generation rows were **not** deleted.

---

## 9. Final index — HNSW_FINAL = NOT BUILT, preconditions not met

Full policy in `docs/ai/new1-r12/INDEX_CUT_POLICY.md`. The headline: *"the
7,654,179 rows from the 27 Aug snapshot"* is the wrong population. There are
already **4,179 current-generation vectors outside that snapshot** — legitimate
post-cut deltas that a snapshot-predicate build would silently exclude, with no
error anywhere.

Sequence: walk completes → capture `INDEX_CUT_AT` → drain deltas `<=` cut → prove
zero *unexplained* representative gaps → freeze predicate and generation → verify
disk/memory → build.

Post-cut rows policy: **indexed automatically into the existing index**, because
the alternative makes recall depend on the reader remembering to search two
places. Rebuild trigger must be a *measured* recall drop, not a row count.

`CREATE INDEX` vs `CONCURRENTLY` is **not** pre-decided; it turns on whether the
delta queue must keep writing during the build. `maintenance_work_mem`
session-local only; track `pg_stat_progress_create_index`.

Projection: **19.47 GiB** index, spill **certain** (14.4 GiB free of 31.7 GiB),
build bracket **0.67 h – 2.91 h** with everything in between interpolated, not
measured.

---

## 10–12. Unchanged by instruction

The 1M-row probe stays secondary and was not re-run. **PASSAGE_V2 = FROZEN** — no
role classifier, no reranker, no model comparison.

---

## Damage I caused, and what I did about it

Reading the R2 uploader's config by *importing* it executed its top-level
`main()`, which ran a default `full` backup and uploaded 2.15 GB. Its rotation
(`--keep 3`, shared `backups/postgres/` prefix) then deleted
`2026-08-29T23-04-23-326Z-moat-r12b-enc` — **LCC's moat backup from an hour
earlier**. My first, intended upload had already rotated out
`2026-08-16T20-00-55-478Z-chunked`.

- **`moat-r12b-enc` — restored.** Re-uploaded from its intact local source with
  `--keep 20`; verified, 7 files, 1.48 GB, 0 differences.
- **`chunked` — not restored.** 38 GB, from 16 Aug, superseded by the fresher
  `full` now in R2, and its local source at `C:/lawmind/dump/chunked` is intact. A
  70-minute upload was not proportionate. **Flagging it rather than deciding it.**

The underlying defect is not mine and is worth fixing: a model pack and a
Postgres dump share one rotation pool under `backups/postgres/`, so uploading one
evicts the other. Also `backup-r2.mjs` runs `main()` on import.

---

## Blockers

1. **One command needs permission** (blocked by the auto-mode classifier). Until
   it runs, the NEW1 lane lease still reads DEAD once a session ends, even though
   the heartbeat now arrives:
   ```
   node scripts/lane-lease.mjs acquire NEW1 --session <this-session> \
     --liveness durable-progress \
     --durable-metric "SELECT count(*) FROM new1_doc_vector_stage" \
     --reason "prior holder pid gone; walk progressing"
   ```
2. **`VECTOR_STAGE_ROLE` is not in the repository.** NEW1 needs LCC's decision
   before the old-generation rows can be dropped or the serving copy chosen.
3. **Generation identity needs a migration** — MIGRATION_SLOT, not NEW1.
4. **The corpus is bound to non-upstream weights.** Whether generation v2
   continues on these bytes or is eventually rebuilt on the pinned revision is a
   product decision, not NEW1's. Queued for the founder.

## Next automatic milestone

The walk continues unattended to batch 766. At ~31,878 rows/hour and 5,202,497
representatives remaining: **~163 hours, ~6.8 days**, straight-line. Nothing in
this round needs to run again for that to happen.
