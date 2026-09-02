# LCC R27 — R17 conformance, the concurrency envelope, and the corpus activation gate

Integration base `f0d1490c` (NEW3 R21, bus 1730), verified an ancestor of HEAD
with `git merge-base --is-ancestor` rather than read off a log.

## 1 · The two R17 server divergences NEW3 R21 §3 recorded

Both were reproduced against a failing check before any source moved.

### 1a · `POST /matters/:id/authorities` on a target this generation does not carry

Reproduced with two physically separate corpus generations on one server —
generation A carries judgment J, generation B does not — and the real user
database wearing the USER role
(`services/api/src/matters/authorities-corpus-split.test.ts`).

| | before | after |
| --- | --- | --- |
| absent target, no live saved row | `404 NOT_FOUND` "no judgment with that id" | `409 CORPUS_TARGET_UNAVAILABLE` |
| absent target, same live saved row | `404 NOT_FOUND` "no judgment with that id" | `200 { unavailableAuthority }` |
| `matter_authorities` rows written | 0 | 0 |

No row is written on either branch. The shell carries the six R20 fields and no
fabricated corpus metadata — the test asserts `caseTitle`, `neutralCitation` and
`verificationState` are all absent from it.

A → B → A holds one row throughout: same `authorityId`, same `addedAt`, no
duplicate, no rewrite. `authorities.test.ts`'s single-database `404` assertion
was updated to the same `409`, so the shape does not depend on how a deployment
is wired.

### 1b · `total` on a refused search

`services/api/src/search/refusal-total.test.ts` drives both arms through the real
Hono route with the fake `sql` `structured-bound.test.ts` established.

| | before | after |
| --- | --- | --- |
| `sparse_unbounded` | `total: 0` | key absent |
| `sparse_timeout` | `total: 0` | key absent |
| `emptyBecause` on timeout | absent | absent (unchanged) |
| `retrievalOutcome.reasons` on timeout | `timeout` | `timeout` (unchanged) |

The test asserts the KEY is absent, not merely `undefined` after `JSON.parse` —
`total: null` would be read by an ignorant consumer exactly as `total: 0` is, so
the raw response text is checked. The successful-search `total` is untouched;
`route.test.ts`'s `total === 2` still passes.

## 2 · Concurrency envelope — capacity evidence, not a gate

`pnpm --filter @lawmind/api measure:round -- --concurrency 1,2,3,5 --repeat 3`.
Same frozen 36-request Gate-S1 stream at every level, same order; only the
parallelism differs.

```
max_worker_processes             20
max_parallel_workers             12
max_parallel_workers_per_gather   4
parallel_leader_participation     on
work_mem                        32MB
research pool max                 6      (RESEARCH_CONCURRENCY 3 × 2 statements)
admission limit                   3
logical CPUs                     20
```

Warm, ascending (`search-concurrency-envelope.json`):

| conc | p50 | p95 | max | req/s | refused | timeouts | workers/leader | workers total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 18 ms | 627 ms | 664 ms | 4.52 | 0 | 0 | 4 | 4 |
| 2 | 47 ms | 651 ms | 701 ms | 8.82 | 0 | 0 | 4 | 8 |
| 3 | 136 ms | 682 ms | 694 ms | 12.04 | 0 | 0 | 4 | 8 |
| 5 | 461 ms | 1,044 ms | 1,088 ms | 10.06 | 0 | 0 | 4 | 12 |

Warm, DESCENDING (`search-concurrency-envelope-reversed.json`) — the falsifier
for level ordering:

| conc | p50 | p95 | max | req/s | workers/leader |
| --- | --- | --- | --- | --- | --- |
| 5 | 252 ms | 836 ms | 904 ms | 13.73 | 4 |
| 3 | 35 ms | 740 ms | 750 ms | 10.86 | 4 |
| 2 | 23 ms | 631 ms | 648 ms | 8.66 | 4 |
| 1 | 22 ms | 557 ms | 580 ms | 4.94 | 4 |

**`CONCURRENCY_ENVELOPE = DEGRADES_GRADUALLY`. No cliff through 5.** p95 rises
monotonically with concurrency in BOTH orders and never exceeds 1,044 ms — under
half the single-request Gate-S1 p95. Throughput rises with concurrency. Zero
timeouts, zero admission refusals, zero temp spill at every level.

**`WORKER_STARVATION_CAUSAL = NO`, measured rather than inferred.** Workers per
leader is 4 at every level in every run, which is `max_parallel_workers_per_gather`
and is what concurrency 1 launches with nothing competing — so what was planned
was launched. `pg_stat_activity` is sampled every 200 ms from a connection doing
no work of its own; an `EXPLAIN` beside the load would have been a different
statement with different bind values and its own plan.

**The doorstep is visible and is a sizing fact.** Total parallel workers reached
**12** at concurrency 5 — exactly `max_parallel_workers`. Three simultaneous
gathers consume the whole cluster allowance. That is the number remote-alpha
sizing has to provide for, and it is why concurrency 8 was measured too
(`search-concurrency-envelope-c8.json`):

| conc | p50 | p95 | max | req/s | refused | timeouts | workers/leader |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 47 ms | 702 ms | 705 ms | 13.56 | 0 | 0 | 4 |
| 5 | 199 ms | 1,128 ms | 1,158 ms | 10.83 | 0 | 0 | 4 |
| 8 | 640 ms | 1,533 ms | 1,643 ms | 9.29 | 0 | 0 | 4 |

Still no starvation at 8, and the reason is the design: the **admission gate**
(`RESEARCH_CONCURRENCY = 3`) is what caps how many searches are actually in a
gather at once, so arriving requests queue in admission rather than competing for
worker slots. Throughput peaks at the admission limit and decays gently past it;
p95 grows because of that queueing, which is truthful and bounded. Zero requests
were refused even at 8 — the 2-second admission wait absorbed the queue.

### The first run was confounded, and is recorded because it was

The first measured run put its WORST p95 at concurrency 1 (2,550 ms) and its best
at 2 (872 ms), which reads as "concurrency makes search faster". It does not:
level 1 ran first and paid every cold cost, then handed a warm database to every
level after it. One full stream is now run and discarded first, and `--no-warmup`
reproduces the confounded numbers. Gate-S1's own mode still KEEPS its cold case —
a cold request is a real request; this mode is asking a different question.

### What was NOT done

`ROUTE_LOCAL_PARALLEL_WORKERS_CHANGED = NO`. §13 applies only if the current
strategy collapses at realistic concurrency, and it does not. No statement
timeout, client timeout, `gin_fuzzy_search_limit`, `work_mem` or cluster worker
setting was touched.

## 3 · Corpus generation activation

`RESTORE → integrity → STATISTICS → SEARCH SMOKE → ACTIVATE`, inside the existing
`ops/release-restore-cli.ts`. No second orchestrator. The rule lives in
`services/api/src/release/activation.ts`; the restore CLI writes `ACTIVATION.json`
beside the pack and now exits non-zero when the gate refuses.

`ANALYZE` was already run by the restore. What is new is that it is **proved**
rather than assumed, and that a generation must answer a search before it may be
activated.

### The planner reads `pg_statistic`, not `last_analyze`

The readiness test is `pg_statistic` rows, with `last_analyze`/`last_autoanalyze`
carried as provenance. Reading either timestamp alone reports an autovacuum-
analysed table as unready — "never manually ANALYZEd" is not "no statistics".

### "Does this table hold rows" took three tries, and the first two were wrong

The verdict reads one field, `hasRows`, and it is an `EXISTS (SELECT 1 FROM t)`
probe. Every cheaper proxy was tried and each fails in a way that makes the gate
wrong about its own instrument:

1. **`pg_stat_user_tables.n_live_tup`** answers **620** for a `judgments` table of
   **129.5 GB** on this box — the statistics collector was reset by a server
   crash. A genuinely populated, unanalysed table would have been classified EMPTY
   and waved through.
2. **`reltuples` / `relpages`** are written BY `VACUUM`/`ANALYZE`, so a freshly
   `COPY`-loaded table reads zero from either — precisely the state the gate
   exists to catch.
3. **`pg_table_size`** counts the TOAST table, the free space map and the
   visibility map, so a relation created seconds ago with nothing in it is already
   several kilobytes. `lcc-corpus-activation-proof.mjs` caught this one: five
   genuinely empty tables were reported as populated-and-unanalysed and a correct
   generation REFUSED to activate. It is now a unit test.

The size and both timestamps are still recorded, as provenance an operator reads.
They are not the test.

### The current main corpus — inspected, not analysed

```
judgments                  129,557,561,344 bytes   reltuples 18,752,608   pg_statistic 42
judgment_citations           2,289,065,984 bytes   reltuples 22,322,064   pg_statistic  9
judgment_chunks              4,685,864,960 bytes   reltuples    620,928   pg_statistic 10
statute_sections                72,769,536 bytes   reltuples     36,663   pg_statistic 10
lexeme_document_frequency        8,249,344 bytes   reltuples    128,243   pg_statistic  4
statutes                           335,872 bytes   reltuples        846   pg_statistic 11
last_analyze = NULL · last_autoanalyze = NULL  (statistics collector reset)
```

`MAIN_CORPUS_STATS_STATE = PRESENT`. The round brief's premise — "reportedly never
manually ANALYZEd" — cannot be settled from `last_analyze` on this box at all,
because the collector was reset; but `pg_statistic` is populated for all six
search-critical tables and `reltuples` is plausible against the known corpus
population. Statistics are therefore neither absent nor materially stale, the
§18 precondition is not met, and **no corpus-wide `ANALYZE` was run.** The working
corpus was left untouched.

### The gate, proved end to end

`node scripts/lcc-corpus-activation-proof.mjs` builds a disposable generation
through the MIGRATIONS — the path every deployment uses, and the only one that
carries the generated `full_text_tsv` column and the indexes the ranker needs —
loads rows and a seeded `lexeme_document_frequency`, and asserts all four
branches. `ACTIVATION_GATE_PROVED`, 5 of 5:

```
loaded, not analysed        -> REFUSE, naming judgments and lexeme_document_frequency
ANALYZE                     -> statistics finding clears
search smoke (real path)    -> exact citation 1 hit · filtered lexical 5 · hybrid 5
                            -> ACTIVATE
lexeme_document_frequency   -> smoke throws on two classes -> REFUSE
  renamed away
```

The "loaded but never analysed" state is produced by deleting the `pg_statistic`
rows rather than by hoping autovacuum has not reached the table yet. A proof that
races a background worker proves nothing.

## Files

```
docs/ai/lcc-r27/search-concurrency-envelope.json           warm, ascending 1,2,3,5
docs/ai/lcc-r27/search-concurrency-envelope-reversed.json  warm, descending 5,3,2,1
docs/ai/lcc-r27/search-concurrency-envelope-c8.json        3,5,8 — where the cliff starts
docs/ai/lcc-r27/gate-s1-after.json                         single-request Gate-S1, after the fix
docs/ai/lcc-r27/corpus-activation-proof.json               the activation gate, both refusals
```
