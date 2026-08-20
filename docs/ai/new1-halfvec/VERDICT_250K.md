# HALFVEC — the verdict at production settings, and why it is still not `PRODUCTION_READY`

20 Aug 2026. `docs/ai/new1-halfvec/snapshot-250k.json`,
`docs/ai/new1-halfvec/arm-compare-250k.json`,
`docs/ai/new1-tier-a/expansion-benchmark-250k{,-halfvec}.json`.

## VERDICT: `HALFVEC_QUALITY_PASS_AT_TEST_SCALE` — n = 256,998

Not `PRODUCTION_READY`, and the reason is stated before the numbers so it cannot
be read past: the index this was measured on holds **256,998 vectors and
production Tier A is 8,846,550** — 34 times larger. HNSW's error is a function of
graph size. A pass at 257k licenses continuing to write `halfvec`; it does not
license the claim that quality holds at 8.85M, and that claim needs the same
comparison at a representative index.

## What was fixed about the previous attempt

The earlier verdict was `HALFVEC_TASK_FIDELITY_WARN`, taken at `ef_search = 40`.
**40 is the probes' setting. `services/api/src/retrieve.ts` runs 200.** The
question that mattered was never asked. Both arms here run 200.

The arms are also built to be comparable by construction rather than by intention:
one `SELECT` produces the fp32 table, the halfvec table is a cast of that table,
and both graphs are built in the same run with `m = 16, ef_construction = 64`.
They hold the same 256,998 rows, the same recipe (`HEAD:4800`) and the same model.

## Quality: no difference detected, on any query type

Paired over the 684 shared queries — paired because two percentages 1.3 points
apart, each with a standard error near 2.7 points, cannot settle anything:

```
query type       B better  B worse  identical  moved  sign-test p   verdict
proposition          9        4        215       13      0.267     no difference detected
exact_citation       4        2        222        6      0.688     no difference detected
case_title           7        9        212       16      0.804     no difference detected
```

**The story is the `identical` column.** 94-97% of queries return the gold at
exactly the same rank in both arms. The apparent ±1-2 point swings in the raw
rates are thirteen to sixteen queries moving, in both directions, and the sign
test finds no direction in any of them.

For completeness, the unpaired rates that produced those swings — quoted only so
nobody re-derives them and reads a difference into them:

```
                       fp32     halfvec
proposition  success@5  21.5%    22.8%
             recall@20  28.5%    29.8%
case_title   success@5   5.7%     3.5%
exact_citation success@5  0.9%     0.9%
```

## Cost: halfvec wins on every axis that was measured

```
                    fp32        halfvec     ratio
HNSW index         2006 MB       669 MB     3.0x smaller
table              3388 MB      1375 MB     2.5x smaller
index build         440.9 s      329.7 s    1.34x faster
latency p50           41 ms        14 ms    2.9x faster
latency p95          519 ms       232 ms    2.2x faster
```

3.0x on the index is the same ratio measured at 620,300 chunks in the earlier
probe (4,839 MB against 1,613 MB), so the storage side is stable across a 2.4x
change in scale. At the full Tier-A population that is the difference between
roughly 70 GiB and 23 GiB of index, which is why this was ever load-bearing rather
than an optimisation.

The latency figures were taken while the embedding walk held the GPU and another
lane held the database, so they are an upper bound on a busy box, not a clean-room
number. Both arms were measured under the same load, in the same run, minutes
apart.

## What is still owed before `PRODUCTION_READY`

1. **The same comparison at a representative index.** 1M is the next milestone
   where the answer could plausibly change; 2M is where it should be re-taken
   before anything irreversible.
2. **ANN recall against exact ground truth.** This measures TASK metrics — whether
   the gold authority surfaces — which is the question the product asks. It does
   not measure how many true nearest neighbours each graph loses, which is the
   question that predicts when the task metric will start to move. That needs an
   exact scan per query and is affordable on a sample of about 100.
3. **A decision on `case_title` is NOT owed here.** It moved 5 queries out of the
   top 5 and the sign test rejects it, but the route is broken in both arms
   (3.5% and 5.7% success@5) and is going to be replaced by an exact route rather
   than tuned.

## Recommendation

**Keep staging fp32 and keep the halfvec decision open.** The stage table stays
`vector(1024)` for the duration of the walk, exactly as it was designed to: fp32
casts down to halfvec losslessly-in-one-direction and halfvec cannot cast back up,
so writing the lossy form now would pre-decide the question this file exists to
answer at 1M and 2M. The snapshot mechanism makes each milestone's comparison a
query sweep rather than a rebuild, so the cost of waiting is small and the cost of
being wrong at 8.85M is a full re-embed.

Drop `new1_probe_fp32_250k` and `new1_probe_half_250k` when the 1M pair supersedes
them — about 7.4 GB together with their indexes.
