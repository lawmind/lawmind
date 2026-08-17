# Hot-path exact-lookup measurements — LOCAL cluster

The founder's P2: fix the two measured search-path defects, `cite:` and
`exactCaseTitle`, measuring before and after with `EXPLAIN ANALYZE` on LOCAL
only, with semantic result, citation correctness and title normalisation
unchanged.

Produced by `scripts/migration/hotpath-measure.mjs`. Everything below is read off
the database; nothing is estimated from reading code.

---

## PLAN SHAPES — 17 Aug 2026, before any change

`EXPLAIN` **without** `ANALYZE`, deliberately: NEW1's post-migration gate has been
running against this cluster since 08:12 and executing a multi-million-row scan
beside it would corrupt their latency numbers. Planning alone executes nothing
and competes for nothing.

| query | plan | verdict |
| --- | --- | --- |
| `exactCitation` as written today | **Seq Scan** + Function Scan | full table, 7,296,068 rows |
| `exactCitation`, neutral-citation arm **alone** | **Index Scan using `judgments_neutral_citation_key`** | indexed, and always was |
| `exactCaseTitle` as written today | **Seq Scan** | full table |

### The middle row is the finding

`exactCitation` was filed as a missing index. **It is not.**
`judgments_neutral_citation_key` already exists, already matches the predicate
expression byte-for-byte, and is only **70 MB**:

```
btree (upper(regexp_replace(COALESCE(neutral_citation, ''), '[^A-Za-z0-9]', '', 'g')))
```

Isolate that arm and the planner uses it immediately. Restore the `OR EXISTS
(SELECT 1 FROM unnest(reporter_citations) …)` beside it and the plan collapses to
a sequential scan — because a correlated `EXISTS` over `unnest()` cannot be
indexed at all, and a row failing the first arm might still pass the second, so
every row must be read. **One unindexable arm discards a perfectly good index
across the entire table.**

The sharpest part: measured over a 3,760-row sample, **20 rows (0.53%) carry any
reporter citation at all.** An arm that can match under 1% of the corpus is
costing a full scan on 100% of citation lookups.

### Why the `Total Cost` numbers are not quoted here

They read as 1, 2 and 67 — absurdly low for a sequential scan — because `LIMIT 2`
lets the planner assume it stops after two matching rows. That is a *startup*
estimate, not the cost of the scan, and quoting it would understate the defect by
orders of magnitude. **The plan SHAPE is the evidence at this stage; the real
timings come from the `EXPLAIN ANALYZE` run below, once the cluster is free.**

---

## WHAT IS BUILT AND WAITING

- `packages/db/drizzle/0052_hot_path_exact_lookup_indexes.sql` — the
  `lawmind_citation_keys()` immutable function, a GIN index over the normalised
  reporter-citation array, and a btree over the normalised case title.
- `retrieve.ts` splits the `OR` into a `UNION` of two separately-indexable
  branches. Same rows: `UNION` (not `UNION ALL`) dedupes, which is exactly what
  `OR` does, and the outer `LIMIT 2` preserves the two-matches-means-refuse rule.
- `scripts/migration/hotpath-measure.mjs` compares the two shapes' **output**
  first and **refuses to print timings if the rows differ** — a faster query that
  answers a different question is not an improvement.

Blocked on one thing only: NEW1's gate finishing, so the before/after
`EXPLAIN ANALYZE` measures the fix rather than the two of us measuring each other.

---

## BEFORE / AFTER — `EXPLAIN (ANALYZE, BUFFERS)`

_Appended by `hotpath-measure.mjs --phase before` and `--phase after`._

---

## BEFORE — 2026-08-17T12:25:02.014Z


### exactCitation  (cite: lookup)

probe: `2026RJJP6186`

- rows returned: baseline 1, candidate 1 — **IDENTICAL**
- `baseline` — exec **28.45 s**, planning 0.2 ms, shared blocks read 1048981, hit 24670
  - plan: Seq Scan on judgments + Function Scan
- `candidate` — exec **63.27 s**, planning 0.2 ms, shared blocks read 1048130, hit 25525
  - plan: Index Scan on judgments using judgments_neutral_citation_key + Seq Scan on judgments

### exactCitation  (cite: lookup)

probe: `19953SCR23`

- rows returned: baseline 1, candidate 1 — **IDENTICAL**
- `baseline` — exec **26.80 s**, planning 0.2 ms, shared blocks read 1043681, hit 29970
  - plan: Seq Scan on judgments + Function Scan
- `candidate` — exec **57.78 s**, planning 0.3 ms, shared blocks read 1024559, hit 49084
  - plan: Index Scan on judgments using judgments_neutral_citation_key + Seq Scan on judgments

### exactCaseTitle (case-name lookup)

probe: `RAJASTHAN STATE ROAD TRANSPORT CORPORATION Vs SAMSHER KHAN SON OF SHRI VALI MOHAMMAD KHAN,`

- rows returned: baseline 1, candidate 1 — **IDENTICAL**
- `baseline` — exec **47.85 s**, planning 0.2 ms, shared blocks read 1041943, hit 31708
  - plan: Seq Scan on judgments
- `candidate` — exec **47.16 s**, planning 0.2 ms, shared blocks read 1038851, hit 34800
  - plan: Seq Scan on judgments

---

## AFTER — 2026-08-17T12:44:53.873Z


### exactCitation  (cite: lookup)

probe: `2023AHCLKO85247DB`

- rows returned: baseline 1, candidate 1 — **IDENTICAL**
- `baseline` — exec **15.70 s**, planning 0.1 ms, shared blocks read 1045104, hit 28547
  - plan: Seq Scan on judgments + Function Scan
- `candidate` — exec **20.41 s**, planning 0.3 ms, shared blocks read 1044071, hit 29584
  - plan: Index Scan on judgments using judgments_neutral_citation_key + Seq Scan on judgments

### exactCitation  (cite: lookup)

probe: `20177SCR582`

- rows returned: baseline 1, candidate 1 — **IDENTICAL**
- `baseline` — exec **15.92 s**, planning 0.1 ms, shared blocks read 1042226, hit 31425
  - plan: Seq Scan on judgments + Function Scan
- `candidate` — exec **19.99 s**, planning 0.2 ms, shared blocks read 1040974, hit 32680
  - plan: Index Scan on judgments using judgments_neutral_citation_key + Seq Scan on judgments

### exactCaseTitle (case-name lookup)

probe: `Anil Manjhi Vs The State of Bihar`

- rows returned: baseline 2, candidate 2 — **IDENTICAL**
- `baseline` — exec **0.0 ms**, planning 0.1 ms, shared blocks read 0, hit 6
  - plan: Index Scan on judgments using judgments_case_title_normalised_idx
- `candidate` — exec **0.0 ms**, planning 0.1 ms, shared blocks read 0, hit 6
  - plan: Index Scan on judgments using judgments_case_title_normalised_idx

---

## AFTER — 2026-08-17T12:48:37.169Z


### exactCitation  (cite: lookup)

probe: `2017INSC797`

- rows returned: baseline 1, candidate 1 — **IDENTICAL**
- `baseline` — exec **15.31 s**, planning 0.1 ms, shared blocks read 1041305, hit 32346
  - plan: Seq Scan on judgments + Function Scan
- `candidate` — exec **0.1 ms**, planning 0.3 ms, shared blocks read 0, hit 8
  - plan: Index Scan on judgments using judgments_neutral_citation_key + Bitmap Heap Scan on judgments + Bitmap Index Scan using judgments_reporter_citation_keys_gin

### exactCitation  (cite: lookup)

probe: `20177SCR582`

- rows returned: baseline 1, candidate 1 — **IDENTICAL**
- `baseline` — exec **15.32 s**, planning 0.1 ms, shared blocks read 1038395, hit 35256
  - plan: Seq Scan on judgments + Function Scan
- `candidate` — exec **0.2 ms**, planning 0.2 ms, shared blocks read 4, hit 4
  - plan: Index Scan on judgments using judgments_neutral_citation_key + Bitmap Heap Scan on judgments + Bitmap Index Scan using judgments_reporter_citation_keys_gin

### exactCaseTitle (case-name lookup)

probe: `Anil Manjhi Vs The State of Bihar`

- rows returned: baseline 2, candidate 2 — **IDENTICAL**
- `baseline` — exec **0.0 ms**, planning 0.1 ms, shared blocks read 0, hit 6
  - plan: Index Scan on judgments using judgments_case_title_normalised_idx
- `candidate` — exec **0.0 ms**, planning 0.1 ms, shared blocks read 0, hit 6
  - plan: Index Scan on judgments using judgments_case_title_normalised_idx

---

## VERDICT — 17 Aug 2026, LCC

**Both hot paths are fixed, and the second `AFTER` run above is the real one.
The first is left in place because deleting it would hide the finding.**

| path | before | after | plan after |
| --- | --- | --- | --- |
| `exactCitation` (neutral probe) | **15.31 s** | **0.1 ms** | index scan + bitmap index scan on the GIN |
| `exactCitation` (reporter probe) | **15.32 s** | **0.2 ms** | same, 4 blocks read |
| `exactCaseTitle` | **47.85 s** | **0.0 ms** | index scan on `judgments_case_title_normalised_idx`, 0 blocks read |

Rows compared before timings on every probe, all three **IDENTICAL** between the
old shape and the new one. A faster query that answers a different question is
not an improvement.

Index build, `CONCURRENTLY` and out of band so the resuming ingest fleet was
never blocked on a 65 GB table:

```
judgments_reporter_citation_keys_gin    59.8 s     11 MB   VALID
judgments_case_title_normalised_idx    521.0 s    425 MB   VALID
```

Both sizes came in at or under what `0052` predicted (it estimated "tiny" for the
GIN and "around 500 MB" for the btree).

### The first AFTER run measured a working index that the planner refused to use

Between the two runs the only thing that changed was **`ANALYZE judgments`, 7.5
seconds.** Before it:

```
default             -> Seq Scan                                        est cost 163.86
enable_seqscan=off  -> Bitmap Index Scan using …_reporter_citation_keys_gin  est cost 214.23
pg_statistic rows for the expression index                                    0
```

The index was built, `VALID`, and correct. It was simply never chosen, because a
**new expression index has no statistics until the table is analysed again**, and
with no selectivity estimate for `lawmind_citation_keys(reporter_citations) @>
ARRAY[…]` the planner assumed matches were common. Combined with `LIMIT 2` it
concluded a sequential scan would terminate after a few pages — costing it at
163.86 — when in reality only **0.53%** of rows carry any reporter citation at
all, so it scanned essentially the whole table.

After `ANALYZE`, the same query plans at **7.49** and takes the GIN index.

**This is exactly the trap NEW1 named in bus 0592** — *"confirm ANALYZE ran —
without it the first measurement of your `random_page_cost` prediction would read
as a refutation that is really missing statistics."* I had answered that ANALYZE
had run, and it had; but that was before these two indexes existed, and an
expression index needs its own pass. Had the first AFTER run been reported as the
result, `0052` would have been recorded as a **failed** optimisation and very
possibly reverted.

**Operational consequence, and it outlives this migration: any future expression
index on a populated table must be followed by `ANALYZE` before it is measured or
judged.** `CREATE INDEX` does not do it, and `CREATE INDEX CONCURRENTLY` does not
either.
