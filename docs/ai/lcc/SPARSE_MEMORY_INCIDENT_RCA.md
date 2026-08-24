# SPARSE-SEARCH MEMORY INCIDENT — RCA

**Lane:** LCC · **Task:** LCC-4 (P0) · **Date:** 24 Aug 2026
**Status:** **NOT reproduced on demand.** Root cause classified on measured
evidence; two proposed mechanisms refuted; a bound shipped that does not depend
on either.

---

## 1. The event

Surfaced by a full-suite run, not by looking for it:

```
PostgresError: out of memory
  code 53200
  detail "Failed on request of size 100663296 in memory context \"ExecutorState\""
  mcxt.c:1167
  at sparseAny (services/api/src/search/retrieve.ts:438)
```

100663296 is exactly 96 MiB, and it is a **single allocation request**, not a
running total. It failed with 13.9 GiB of physical RAM free.

---

## 2. Two mechanisms proposed, both refuted

### REFUTED — "one pathological judgment whose tsvector detoasts to ~96 MiB"

LCC's own first theory. NEW1 measured the corpus (bus 1063):

```
pg_column_size(full_text_tsv) > 64 MiB  →  0 rows
                              > 16 MiB  →  0 rows
                              >  4 MiB  →  0 rows
max octet_length (0.5% sample)          →  397,102 bytes (388 KiB detoasted)
```

`pg_column_size` was checked against `octet_length` first, so "nothing large" is
not a TOAST-pointer artefact. **The largest tsvector in the corpus is ~247 times
smaller than the allocation.** No such judgment exists.

### REFUTED — "the `ORDER BY ts_rank` sort growing its memtuples array"

The successor theory, and it was mine. 96 MiB / 24 bytes per `SortTuple` =
exactly 2²² = 4,194,304 tuples, which is a seductive fit for a match set.

Measured instead. `EXPLAIN (ANALYZE, BUFFERS)` on the real shape:

```
Limit (actual time=9017.915..9017.922 rows=50 loops=1)
  ->  Sort (actual time=9017.914..9017.918 rows=50 loops=1)
        Sort Key: ts_rank(j.full_text_tsv, ...) DESC
        Sort Method: top-N heapsort  Memory: 31kB
        ->  Nested Loop (actual time=154.698..9005.733 rows=13492 loops=1)
              ->  Bitmap Heap Scan on judgments j (actual time=148.106..1064.592 rows=13492)
                    Heap Blocks: exact=13602
                    Buffers: shared hit=693 read=14315
                    ->  Bitmap Index Scan on judgments_full_text_idx (rows=13932)
Execution Time: 9018.191 ms
```

**`Sort Method: top-N heapsort  Memory: 31kB`.** The `LIMIT` bounds the sort, it
holds ~2×50 tuples, and it is three orders of magnitude too small to be the
allocation. The arithmetic was a coincidence of magnitudes, which is exactly what
this repo has been caught by before.

---

## 3. Root cause — planner misestimate, by construction

Of the plan's candidate list (candidate explosion, planner misestimate,
sort/hash expansion, materialisation, query expansion, concurrency
multiplication), the evidence selects **planner misestimate** — and the reason is
structural rather than statistical.

The tsquery is built **inside** the query, from a bind parameter:

```sql
q AS (SELECT to_tsquery('english', string_agg(quote_literal(lexeme), ' & ')) AS tsq FROM lex)
...
WHERE j.full_text_tsv @@ q.tsq
ORDER BY ts_rank(j.full_text_tsv, q.tsq) DESC
LIMIT 50
```

So the planner never sees the lexemes. `EXPLAIN` with bound parameters returns
the **identical plan and the identical estimate for every query**:

```
Sort (cost=105535.70..105747.56 rows=84744 ...)
```

Against measured upper bounds, from `lexeme_document_frequency` — the terms are
ANDed, so the match set cannot exceed the rarest term's document count:

| query | rarest lexeme df | upper bound | planner estimate | ratio |
| --- | --- | --- | --- | --- |
| anticipatory bail / dowry / harassment | `dowri` 0.0158 | 295,681 | 84,744 | 3.5× |
| appeal / judgment | `appeal` 0.1963 | 3,670,878 | 84,744 | **43×** |
| court | `court` 0.9073 | 16,965,472 | 84,744 | **200×** |

There is **no statistics fix and no plan hint**: `ANALYZE` cannot help a
predicate whose operand does not exist at plan time. Every plan is sized for
84,744 rows and executes against anything up to ~17 million.

What the measured plan also shows is that the cost is carried by `ts_rank`
detoasting every matching row: **13,492 matched rows → 9,018 ms and 42,797
blocks read (~334 MB)**, i.e. ~0.67 ms per ranked row. Extrapolated to the
all-common case that is over ten minutes of `ts_rank`, and every executor
structure in the plan that scales with the match set lives in `ExecutorState` —
the context the error names.

**Labelled INFER, not KNOW:** the specific allocator that asked for 96 MiB was
not identified. It is a match-set-proportional allocation in the bitmap /
executor path; it is *not* one document and *not* the sort, both of which are
now refuted by measurement rather than by argument.

### A note on "13.9 GiB free"

That figure is **physical** memory, and it was used to conclude the machine was
not exhausted. On Windows a `palloc` is a commit, not a page-in: an allocation
fails when the system **commit charge** meets the **commit limit**, which can
happen with physical RAM free. Measured on this box during the RCA: commit limit
45.75 GiB, charged 32.69 GiB, **13.06 GiB of commit headroom** — while a
six-worker ingest fleet and a GPU embedding walk shared the machine. The headroom
is not a constant, and "RAM was free" does not establish that a 96 MiB commit
could succeed. Recorded as a contributing condition, not as the cause.

---

## 4. The fix — bound the ranked set, not the clock

`statement_timeout` bounds TIME. This failure was not slow; it 500'd. The bound
therefore has to be on SIZE, and the data to compute it was already being read by
the same function.

`services/api/src/search/retrieve.ts`:

- the lexeme selection is lifted out of the ranking query, so its answer can be
  **inspected before anything is ranked** (one index scan on
  `lexeme_document_frequency`, single-digit ms);
- because the lexemes are ANDed, the rarest bounds the match set;
- if the rarest exceeds `SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY = 0.05` the arm
  **refuses to rank** and reports a new degraded arm, `sparse_unbounded`.

### Why 0.05, chosen before the outcome was seen

0.05 is ~935,000 documents. At the measured 0.67 ms per ranked row that is over
ten minutes of `ts_rank` — far outside any request budget and inside the region
where a match-set-proportional allocation reaches tens of MiB. The threshold is
an upper bound on a cost measured *before* it was chosen, not fitted to a result
afterwards.

### What it deliberately does not do

**It does not delete the all-common fallback.** NEW1 (bus 1025) measured that
removing it is the worst available arm — 100% timeouts, zero gold. The fallback
still runs and still ranks; it is refused only when its own rarest term is common
enough that the ranking could not have completed anyway.

**It does not silently return less.** `sparse_unbounded` is a distinct value from
`sparse_timeout` because they are different facts: a timeout is a query that ran
out of clock, this is a query that was never attempted. A search that cannot say
it is incomplete is the silent drop this codebase measures at a zero threshold.

---

## 5. Before / after

| query | before | after |
| --- | --- | --- |
| `anticipatory bail in a dowry harassment case` | ranked, ~4.5–6.5 s | **unchanged** — 4,500 ms, 48 results, not degraded |
| long narrative with rare terms | ranked, ~14 s | **unchanged** — 14,202 ms, 44 results, not degraded |
| `court state order petition appeal judgment` | arm A shape measured by NEW1 at p50 15,013 ms / 58% timeouts; the OOM candidate | **8 ms**, `sparse_unbounded` |
| `court` | same | **2 ms**, `sparse_unbounded` |

Memory: the refused queries now allocate nothing in the executor, because no
ranking statement is issued at all.

Regression test: `services/api/src/search/sparse-bound.test.ts`, 3/3 — including
the guard in the other direction, that an ordinary three-concept query is **not**
refused, so a bound cannot quietly become an off switch. 57/57 across
`search/route`, `pagination`, `query-shape`, `structured`. `tsc` clean.

---

## 6. What this does NOT claim

- **The incident was not reproduced.** No query issued during this RCA produced
  the 96 MiB failure. The fix is justified by the mechanism the plan and the
  frequency table establish, not by a reproduction.
- **The exact allocation site is unidentified**, and is labelled INFER above. It
  is bounded now regardless of which structure it was.
- **The unrelated I/O fault stays unexplained.** `could not read blocks
  7799946..7799946 in file "base/81920/16384018": Invalid argument` is a
  different relation, a different call site, and 290 GB of disk free. It is a
  storage-layer failure that the memory theory does not explain, and folding the
  two together because they happened the same afternoon would be exactly the
  same-magnitude error refuted in §2.
- **Broad queries now return less.** A query whose every term is common gets the
  dense arm and a `sparse_unbounded` marker. That is a deliberate recall trade
  against a 500, and it is NEW1's to revisit with retrieval evidence — the
  threshold is one constant with its reasoning attached.
- **`EXPLAIN (ANALYZE)` was run once, on the safe shape only.** The all-common
  and single-common shapes were analysed with `EXPLAIN` alone: executing the
  suspect query to diagnose an out-of-memory is how a diagnosis becomes an
  outage.
