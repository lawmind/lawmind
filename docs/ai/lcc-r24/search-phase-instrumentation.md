# LCC R24 — where a `/search` request's time actually goes

`HEAD_START = 9ab5ca82`. Local, no network, no paid infrastructure, no migration.

## The blind spot this round closed

RCC measured a cold `POST /search` at **15,334 ms** on a physical Galaxy S24
(bus 1652) and **15,243 ms** again the next day (bus 1690), against warm requests
of 90–771 ms on the same device and build. `app.ts` logged `duration_ms`;
`search_events` logged `latency_ms`. Neither could name a phase, and the open
question was specifically **pool acquisition/queue wait versus actual SQL time**.

`POST /search` now emits one structured log line per request —
`event: "search_phase_timing"`, in the same `finally` as the telemetry row, so a
request that threw is measured too. No query text, matching `search/event.ts`
and migration `0075`.

A real line from this round, verbatim:

```json
{"event":"search_phase_timing","query_class":"party_name","query_chars":43,
 "result_count":5,"degraded":[],"status":200,"admitted":true,
 "pool_wait_ms":null,"pool_wait_measured":false,
 "structuredMs":0,"classificationMs":0,"pinsMs":611,"sparseMs":12590,
 "armsMs":12590,"dedupMs":12,"hydrateMs":6,"edgesMs":1,"fallbackMs":142,
 "retrievalMs":13362,"bookkeepingMs":2,"unpopulatedMs":1,"serializationMs":1,
 "unattributed_ms":0,"total_ms":13367}
```

13,367 ms, of which 12,590 ms is one ranker. That is the question answered.

## `poolWaitMs` is measured or it is null. It is never derived.

The brief is explicit that `total − known phases` must not be relabelled as pool
wait, and it is not.

**Measurement point:** `sql.reserve()` on the **research** pool, immediately
after admission and immediately before retrieval.

**Why that point and not another.** `postgres.js` 3.4.9 pushes a query onto the
pool's private `queries` list the moment it is awaited and exposes no hook for
"this query has been handed a connection" — `handler()`, `go()` and `onopen()`
in `src/index.js` are all private and the queues are not on the `Sql` object. So
the wait the *arms* experience cannot be read directly. `reserve()` is public and
resolves at exactly the acquisition boundary: instantly when a connection is idle
(`open.shift()`), otherwise only when one frees or a new one finishes connecting.

**Two limits that travel with every use of the number:**

1. it is a **sample at that instant**, not the wait the two rankers paid a moment
   later;
2. on a **cold** pool it includes TCP + TLS + startup, because `reserve()` on an
   unconnected pool opens a connection. Deliberate — a cold first search is the
   event under diagnosis — but a large value then means "acquire including
   connect", never "queued behind other searches".

**Off by default** (`SEARCH_POOL_PROBE=1`). The probe takes a connection out of
the pool and puts it straight back; under contention that would cost the very
queueing it is measuring, and a probe that perturbs its own subject is worse than
no probe. The Gate-S1 harness sets it for itself.

## The residual has its own name, and getting that right caught a bug

`unattributed_ms = total − Σ(top-level phases)`. It is **not** pool wait: it also
holds GC, event-loop scheduling behind the other 25 Node processes on this box,
and any phase added later and not wired in.

The phases nest — `retrievalMs ⊃ armsMs ⊃ sparseMs` — and the first version of
the clock summed **every** recorded phase. Measured on the real route:
**79,244 ms of "phases" against a 26,711 ms request.** `unattributed_ms` would
then have floored at zero on every request and reported "fully accounted for" on
exactly the slow ones it exists to explain. `SEARCH_TOP_LEVEL_PHASES` is the fix
and `timings.test.ts` asserts both the arithmetic and the nesting.

A depth counter was the obvious alternative and is wrong here: the two rankers
run concurrently under `Promise.all`, so increment-on-enter/decrement-on-exit
interleaves across awaits and would mis-attribute nesting under load — the one
condition that matters.
