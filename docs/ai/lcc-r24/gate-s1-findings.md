# LCC R24 — Gate-S1 local readiness, and the 15-second event REPRODUCED

`pnpm --filter @lawmind/api measure:round -- --gate-s1 --repeat 3 --json <path>`
`docs/ai/lcc-r24/gate-s1-local.json` · LOCAL_CONTENDED · 2 Sep 2026 · n=36

Every number here is LOCAL, on a box shared with a GPU sidecar at 96% and 26
other Node processes, with **no embedder** — the dense arm does not run, so the
research class measures the lexical half only. V7.2's 3-second p95 target applies
to **staging**; this certifies nothing about staging in either direction.

| class | n | zero | degraded | poolWait max | p50 |
| --- | --- | --- | --- | --- | --- |
| exact citation | 3 | 0 | 0 | **34 ms** | 28 ms |
| CNR | 9 | 0 | 0 | 0 ms | 1 ms |
| case number | 9 | 0 | 0 | 0 ms | 546 ms |
| filtered lexical | 3 | 3 | 0 | 0 ms | **15,094 ms** |
| normal research query | 9 | 1 | 1 | 0 ms | 2,998 ms |
| broad / refused query | 3 | 3 | 3 | 0 ms | 1 ms |

Pooled: p50 381 ms, p95 15,094 ms. p99 is printed as `—` rather than as a
number: a percentile needs at least `1/(1−p)` observations before it is anything
but the largest value in the list, and 36 samples cannot support p99.

## The open question is answered: it is SQL, not pool wait

**`poolWaitMs` max across the whole run is 34 ms**, on the first request of the
run — the cold connection establishment. Every other sample is 0 ms.
**`unattributed_ms` max is 35 ms.** So the fifteen seconds is not connection
queueing, not GC and not scheduling; it is inside a statement, and the phase line
names which one.

## Two 15-second shapes, and they are different defects

**1. `court:"…" AND bail` — 15,094 ms, 3 of 3, HTTP 503, entirely in
`structuredMs`, and `degraded` is EMPTY.**

The structured/qlang path compiles a bare term to
`j.full_text_tsv @@ plainto_tsquery('english','bail')` ANDed with the court
predicate. It has **neither** protection the hybrid path has: no
document-frequency admission (`SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY`, which
refuses the same word corpus-wide **in 1 ms**) and no `MATERIALIZED`
bounded-population fence. It runs to the 15 s `statement_timeout`, the
cancellation is unhandled inside `answerStructured` — every other expensive call
in this route is wrapped in `bounded()` — and `app.onError` turns it into
`503 TIMEOUT`, whose copy says *"Nothing is wrong with the record — the server is
busy."* For this query that sentence is false: the server is not busy, the query
cannot complete, and a retry produces the same 15 seconds.

Not fixed this round, deliberately. The honest repair is to route the structured
path through the same bounded-population mechanism the sparse arm already has
(`rankWithinBoundedPopulation`), and the alternative repair — wrapping it in
`bounded()` — would return a 200 with zero results, which is the silent drop
`CITATION_HARNESS.md` holds at a zero threshold. Both are retrieval-policy
decisions with a response-shape consequence, and R24 was told not to change
response semantics.

**2. A plain research query at 15,013 ms in `sparseMs`, correctly reported as
`degraded: ["sparse_timeout"]`, `retrievalOutcome: coverage_unknown`.**

This is the wire working as designed — the advocate is told the search was
incomplete — and it is the likeliest mechanism behind RCC's 15,334 ms device
measurement. The same query answers in 1,695–8,023 ms across repeats on this box,
so the variance is the box, and the fix is a retrieval-performance question that
belongs to NEW1 rather than a bound that belongs here.

## Reproduction

```
pnpm --filter @lawmind/api measure:round -- --gate-s1 --repeat 3 \
  --json docs/ai/lcc-r24/gate-s1-local.json
```

`--gate-s1` sets `SEARCH_POOL_PROBE=1` for itself. The six classes draw their
identifiers from the live corpus, never hard-coded: a fixed CNR or case number
stops existing the day the corpus is rebuilt, and a class that resolves to
nothing looks exactly like a class that is fast.
