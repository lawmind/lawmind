# V3.1 — THE BENCHMARK, FROZEN

**Date:** 25 Aug 2026 · **Lane:** NEW1 · **Deliverable:** convergence sprint V2 §7 NEW1-1
**Instrument:** `services/harness/src/v31-freeze-cli.ts`
**Artifact:** `docs/ai/new1-tier-a/V31_MANIFEST.json` (1.3 MB)
**Drift probe:** `services/harness/src/v31-pool-drift-probe.mjs`

---

## Outcome, first sentence

**V3 could not be replayed, the fix is not a random seed, and the reason is that
the benchmark's distractor pool is drawn from a table the embedding walk is
actively writing to** — so V3.1 freezes the *identity* of every query, target,
cluster and pool member into an artifact, and replay reads the artifact instead
of re-drawing.

---

## 1. What was actually non-deterministic

V3's gold loading was already deterministic — it takes a **stride**, not a
sample, and says so. Two sites were not, both found by reading the source rather
than by re-running it:

| site | what it does | consequence |
| --- | --- | --- |
| `representation-lab-v3-cli.ts:359` | `bootstrapCi()` calls `Math.random()` | every re-run publishes a **different confidence interval** for the same data |
| `representation-lab-v3-cli.ts:623` | pool fill is `TABLESAMPLE SYSTEM (3)`, no `REPEATABLE` | every re-run scores against a **different pool** |

The second one is the one that matters, because V3's own headline finding is that
**pool composition changes the answer by roughly 3×** — arm B fell 73.3% → 24.4%
at the same pool size on the same tasks, purely because V2's hard negatives were
silently empty. A benchmark whose most load-bearing variable is re-randomised on
every run cannot be used to compare two runs.

## 2. Why `REPEATABLE (seed)` is the wrong fix

This is the part worth keeping.

`TABLESAMPLE SYSTEM` samples **physical pages**. `REPEATABLE` fixes *which pages
are chosen* — it does not fix *what is on them*.

The fill source is `new1_doc_vector_stage`, and the HEAD walk writes to that
table continuously. Measured this session:

```
T0  2026-08-25T03:19:49Z   1,996,134 rows
T1  2026-08-25T03:25:20Z   1,997,735 rows      +1,601 rows in 330.6 s
```

So a seeded replay a day later reads the same page numbers out of a **bigger
table** and gets a different pool — while reporting, via its seed, that nothing
changed. **A seed would convert visible drift into silent drift**, which is
strictly worse than the bug it replaces.

V3.1 therefore uses seeded drawing exactly **once**, to build the manifest. After
that the manifest *is* the benchmark. A frozen list of ids cannot drift when a
table grows underneath it.

## 3. What is frozen

| | value |
| --- | --- |
| seed / bootstrap seed | `lawmind-new1-v3.1-2026-08-25` / `…#bootstrap` |
| tasks | **295** — 45 POSED, 250 LIFTED |
| query text | SHA-256 per query (text itself not copied) |
| distinct targets | **213** |
| target clusters | **211** |
| pool | **25,000** ids — 213 gold + 24,787 distractors |
| segmentation version | `harness/chunk.ts@HEAD:4800+salient4+multi3+allchunks` |
| embedder | `.models/Xenova/bge-m3`, 1024-d, per-file digests |
| strata | by task class and by court |
| `contentSha256` | `b2b38c68…` (compare THIS across freezes) |

## 4. Three denominators, and why n is not 295

NEW1-1 forbids inflating n by counting many queries against one authority as
independent authorities. The manifest carries all three and names them:

```
tasks              295
distinct targets   213
target clusters    211
```

A cluster is the set of tasks sharing **any** target, closed transitively
(union-find). Here the three are close — 295 → 211 — so V3's task-level intervals
were not badly inflated. **That is a finding, not a formality:** it had to be
measured, because it could have been 295 → 30, and the honest denominator is
cheap to compute and impossible to recover after the fact.

Intervals get reported over all three from here on.

## 5. Reachability is captured before the pool touches it

`reachabilityAtFreeze` records, **before** the pool force-includes gold:

```
gold total                     213
gold with a production vector  201
NOT_IN_INDEX                    12    (5.6%)
```

with the 12 ids listed. This is the line between the two metrics NEW1-2 demands:

- **END-TO-END success** must count those 12 as **misses**.
- **CONDITIONAL ranking** may exclude them, and must say that it did.

Forcing gold into the index without counting it is what the plan calls
*artificial reachability*, and the manifest makes it impossible to do by
accident.

## 6. Two checksums, because one was useless

Two independent freezes seven minutes apart produced **byte-identical** tasks,
clusters, strata, seeds, config, embedder digests, and all **25,000** pool ids:

| component | freeze #1 | freeze #2 | same |
| --- | --- | --- | :---: |
| tasks | `cc29462b864cf43c` | `cc29462b864cf43c` | ✅ |
| clusters | `af5ed2548e00f7a7` | `af5ed2548e00f7a7` | ✅ |
| strata | `e1df97478510f653` | `e1df97478510f653` | ✅ |
| seeds | `27ca6ec6de04980a` | `27ca6ec6de04980a` | ✅ |
| config | `9b701b722f84e8ad` | `9b701b722f84e8ad` | ✅ |
| embedder | `de03df5bc1f3f5f1` | `de03df5bc1f3f5f1` | ✅ |
| pool.ids (25,000) | `01748dcf530e14dc` | `01748dcf530e14dc` | ✅ |

…and they **still** disagreed on `manifestSha256`, for the sole reason that
`builtAt` was inside the hashed body. A checksum that always reports "different"
answers no question. So:

- `contentSha256` — **excludes** `builtAt`. Answers *"is this the same
  benchmark?"*. This is the one to compare.
- `manifestSha256` — includes it. File integrity only.

## 7. What the drift probe currently says, and what it does not

`v31-pool-drift-probe.mjs` re-runs the draw against the table as it stands and
diffs it against the frozen pool. Run at 03:47Z:

```
stage rows at freeze  1,999,841
stage rows now        1,999,841   (+0)
entered the pool      0
displaced from pool   0
VERDICT  table did not grow — this run tests DETERMINISM only, not drift.
         determinism: HOLDS (identical draw)
```

**This does not confirm drift and the probe refuses to pretend it does.** The
table was static because the walk was retrying an already-staged batch, so every
row it touched was a duplicate skip. Zero drift observed against zero new rows is
evidence of nothing.

What *is* established:

- **determinism holds** — same table, same draw, twice;
- **the growth rate is real** — +1,601 rows/331 s, measured directly (§2).

Drift itself remains **inferred from those two facts, not observed.** Re-run the
probe after the walk clears a batch to convert it into a measurement. The freeze
design does not depend on the outcome: freezing identity is correct whether the
table grows fast or slowly, and only the *urgency* of the argument changes.

## 8. What V3.1 does NOT yet do

Stated plainly so nobody reads more into the artifact than is in it:

- The manifest is frozen; **`representation-lab-v3-cli.ts` has not yet been
  rewired to consume it.** The lab still draws its own pool and still calls
  `Math.random()` in `bootstrapCi`. V3.1 is the contract; the replay wiring is
  the next step and is not done.
- **Hard-negative ids are not in this manifest.** V3 draws them by ANN from arm
  A's own neighbours, which requires the GPU sidecar and a query embedding pass.
  That pass was deliberately not run: the sidecar is shared with the live HEAD
  walk, and §13 forbids overlapping decision-critical GPU work. The manifest's
  pool is gold + identity-seeded distractors; hard negatives must be drawn and
  appended in the quiet window, and until they are, **this pool is easier than
  V3's** and any number scored on it would be optimistic.
- Therefore **no scores were produced against V3.1 in this session**, and none
  should be quoted.
