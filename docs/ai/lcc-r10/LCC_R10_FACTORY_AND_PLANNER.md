# LCC R10 — THE FACTORY, THE PLANNER, AND TWO HYPOTHESES THAT WERE BOTH JUDGED TOO EARLY

**28–29 August 2026.** Lane LCC. Leases used: `MIGRATION_SLOT` (0092, 0093),
`GIT_COMMIT`. **`HEAVY_BOX` was NOT taken** — see §2.4.

---

## 1. THE FACTORY: WHAT THE DELTA ACTUALLY REACHES

NEW2's scheduled `new2-daily-delta` cycle ran unattended at
**2026-08-29T04:51:24Z → 05:00:33Z**, `outcome: ok`, 4 scopes owned
(`hc-boot-27_1-y2026`, `hc-boot-27_1`, `hc-boot-19_16-y2026`, `hc-boot-19_16`),
upstream manifest `objects 1494 · new 0 · grown 9 · shrunk 1`. Receipt in
`.agents/ops/n2-daily-delta-receipts.jsonl`.

It wrote **1,334 judgments**. Measured against every named downstream consumer:

| consumer | reached | of eligible | state |
| --- | ---: | ---: | --- |
| exact / lexical (`full_text_tsv`) | 1,334 | 1,334 | **AT FRONTIER** |
| `lcc-citations-extract` | 1,334 | 1,334 | **AT FRONTIER** |
| `lcc-paragraphs-apply` | 1,334 | 1,334 | **AT FRONTIER** |
| `lcc-citation-keys` | 95 | **95** | **AT FRONTIER** |
| statute-reference | 0 | 1,334 | **NOT WIRED** |
| NEW1 embedding (coarse / chunks / tranche) | 0 | 1,334 | **NOT WIRED** |

**The citation-key row is the one that would have been misread.** 95 of 1,334 is
7.1% and looks like a stalled worker. It is not: `judgment_citation_keys` only
holds rows for a judgment that HAS a citation, and exactly **95** of the 1,334
carry a `neutral_citation` or a non-empty `reporter_citations`. The builder is at
**95 of 95**. The denominator was checked before the number was reported, which
is the only reason this is not filed as a defect.

Both durable LCC cursors sit **exactly on** the delta's own frontier — same
timestamp, same row id, no lag at all:

```
judgments   max(created_at)  2026-08-29 04:55:22.134122+00
citation-keys.json  cursorAt 2026-08-29 04:55:22.134122+00  id ee04adc0-35b0-4b23-b454-6d1da92d0a83
paragraphs-0_1.json cursorAt 2026-08-29T04:55:22.134Z       id ee04adc0-35b0-4b23-b454-6d1da92d0a83
```

That is the proof §4 asked for: **one scheduled cycle, work handed to and fully
consumed by every consumer that is wired to it.**

### 1.1 The two that are not wired, and why it matters

- **Statute-reference.** `judgment_statute_refs` holds 862,594 rows and its
  newest is **2026-08-13 12:38** — sixteen days old, zero written in the last
  24 hours. The linker is `scripts/n2-statute-link-apply.mts` /
  `n2-statute-exact-date.mts`, run by hand. There is no durable queue behind it,
  so a delta does not reach it and never has.
- **NEW1 embedding.** 0 of 1,334. Not a stall: the coarse walk is driven by a
  Tier-A manifest built at a point in time, not by a live frontier. A judgment
  ingested after the manifest was cut is invisible to it until the next census.

Neither is LCC's to wire — the scripts and the walk belong to NEW2 and NEW1 —
and both are reported on the bus rather than fixed across a lane boundary. What
matters is that "the delta automatically queues statute-reference and NEW1
embedding work" is **not true today**, and a job table that did not say so would
be the reassuring kind of wrong.

### 1.2 The one-line job table

Regenerate with `pnpm job:health`. `docs/ops/JOB_TABLE.md` carries the ownership
record; this is the R10 observation.

| job | owner | state | useful output | rate | last progress | startup |
| --- | --- | --- | --- | --- | --- | --- |
| `lcc-citation-keys` | LCC | RUNNING_PROGRESSING | `judgment_citation_keys` | 95/95 eligible in the delta | 29 Aug 04:56:35Z, cursor at frontier | `Lawmind-citation-keys`, 15 min, LOGON |
| `lcc-citations-extract` | LCC | RUNNING_PROGRESSING | `judgment_citations` | 1,334/1,334 of the delta | 29 Aug, frontier clear | `Lawmind-citations`, 15 min, LOGON |
| `lcc-paragraphs-apply` | LCC | RUNNING_PROGRESSING | `judgment_paragraphs` | 1,334/1,334 of the delta | 29 Aug 04:56:26Z, cursor at frontier | `Lawmind-paragraphs`, 15 min, LOGON |
| `lcc-alert-poll` | LCC | RUNNING_PROGRESSING | `.agents/ops/alerts.jsonl` | 1 tick / 10 min | 29 Aug, 49 receipts (+2) | `Lawmind-alert-poll`, 10 min, LOGON |
| `new2-daily-delta` | NEW2 | RUNNING_PROGRESSING | delta receipts + judgments | 1,334 judgments / cycle | 29 Aug 05:00:33Z, ok | SCHEDULED_TASK |
| `new2-hc-upstream-walk` | NEW2 | RUNNING_REPLAYING | upstream manifest | 20,058,317 records / walk | 29 Aug 09:21Z | agent-launched |
| `new1-coarse-walk` | NEW1 | RUNNING_PROGRESSING | `new1_doc_vector_stage` | — | 29 Aug 08:51Z | SCHEDULED_TASK |
| `new1-gpu-sidecar` | NEW1 | consumer-bound | none — stateless HTTP | n/a | `/health` ok | agent-launched |
| statute-reference | NEW2 | **NOT SCHEDULED** | `judgment_statute_refs` | 0 / 24h | **13 Aug 12:38** | manual script |

---

## 2. THE PLANNER: TWO HYPOTHESES, AND A CORRECTION TO MY OWN VERDICT ON THE SECOND

### 2.1 The premise was wrong, and the conclusion was right for another reason

The round opened with "`judgments` (18.7M rows) really lacks usable planner
statistics — probe of 27 Aug found `last_analyze` AND `last_autoanalyze` NULL".

Both NULLs reproduce. The inference from them does not.

```
pg_statistic for judgments   38 columns, with MCVs and histograms
judgment_date histogram      1950-01-01 .. 2026-08-01   (current)
court MCV                    25 courts with frequencies
n_tup_ins                    52,716        on an 18,698,984-row table
stats_reset                  NULL
```

`pg_statistic` is populated and CURRENT. The NULLs are **lost counters**, not
absent statistics: `n_tup_ins` reading 52,716 on an 18.7M-row table means the
cumulative statistics file was discarded — PostgreSQL throws it away rather than
trust it after an unclean shutdown, and this instance took 26 of those between
15 and 24 Aug 2026.

The `EXPLAIN (ANALYZE, BUFFERS)` settles it. On a box verified empty by the same
`pg_stat_activity` sample, 05:56Z:

```
Execution Time: 25,025 ms
Index Only Scan using judgments_court_idx
  estimated 747,959 rows  vs  actual 748,498    <-- 0.07% error
  Heap Fetches: 5,379,222
  Buffers: shared hit=708,774 read=1,932,349    <-- ~15 GB
```

**A row estimate accurate to seven hundredths of a percent is not a planner that
needs ANALYZE.** So the filed diagnosis is refuted on its own evidence.

### 2.2 The second hypothesis — and it was also wrong

The visible cost was `Heap Fetches: 5,379,222`. An index-only scan may skip the
heap only where the visibility map marks a page all-visible, and:

```
judgments  relallvisible 2,120,913 / relpages 2,822,704 = 75.14%
           vacuum_count 0 · autovacuum_count 0 · analyze_count 0
```

**`judgments` had never been vacuumed on this instance.** A quarter of its pages
were not all-visible. The prediction was clear and falsifiable: set the
visibility map, the heap fetches collapse, the query gets fast.

`VACUUM (ANALYZE, INDEX_CLEANUP OFF) judgments`, 165.6 s:

| | before | after | change |
| --- | ---: | ---: | ---: |
| relallvisible | 75.14% | **83.52%** | +8.4 pp |
| Heap Fetches | 5,379,222 | **3,447,267** | **−35.9%** |
| pages read from disk | 1,932,349 | **748,666** | **−61.3%** |
| planner cost estimate | 4,874,135 | 3,145,902 | −35.5% |
| **Execution Time** | **25,025 ms** | **26,156 ms** | **+4.5% — WORSE** |

Thirty-six percent fewer heap fetches, sixty-one percent fewer disk reads, and
the query did not get faster.

**That reading was wrong, and §2.5 below corrects it.** The honest statement at
this point in the round was "heap fetches are not the bottleneck". The honest
statement after the plan was fixed is different: the visibility map's benefit
was **masked** by the serial plan, not absent. Both changes were necessary.

Both after-numbers were taken on a box confirmed empty of client backends and of
active background workers, and the vacuum's own WAL flush was allowed to settle
first — an earlier attempt at the same measurement read 41,106 ms while the
checkpointer was still writing out the 555,169 pages the vacuum dirtied.

### 2.3 What the bottleneck actually was

The per-loop line is the whole story: `actual time=1002.554 ms · loops=25`. The
correlated subquery makes the planner run **25 SERIAL index-only scans**, one per
court group. A correlated subquery cannot be parallelised.

```sql
-- one aggregate instead of one per court
SELECT court, count(*)::int FROM judgments GROUP BY court;
```

```
Finalize GroupAggregate ... Parallel Index Only Scan, 5 workers
Buffers: shared hit=747,928 read=697,173     (1.44M pages — the SAME)
Heap Fetches: 3,450,457                      (the SAME)
Execution Time: 2,764 ms
```

**26,156 ms → 2,764 ms. 9.5×.** Identical buffer counts and identical heap
fetches: it is not reading less, it is reading the same index **once, in
parallel**.

Applied to `services/api/src/corpus/coverage.ts` as a `WITH held AS (...)` CTE
plus `LEFT JOIN` and `coalesce(..., 0)` — the coalesce matters, because a court
we hold nothing for has no row in the aggregate at all and the correlated form
returned an honest `0` for it.

**Differential test before the switch, 25 court groups:**

```
courts 25 · agree 25 · disagree 0 · old_total 18,713,781 · new_total 18,713,781
```

Observed end to end: the seven `corpus/coverage.test.ts` cases each drive a real
request through the real app and now run at **~2.6 s each, previously ~25 s**.

### 2.4 The box, and standing down from it

The first attempt at the after-measurement was taken while five of NEW1's
`CREATE INDEX new1_probe_hnsw_1000000_hnsw` workers were running. It read
**198.7 s** for a statement that had taken 25.0 s the same morning.

That measurement was discarded, the backend terminated, and **no vacuum had
started** — `relallvisible` was still 2,120,913, byte for byte. NEW1 was told on
the bus (1442) rather than after the fact.

The inference that put me there was wrong in a specific and repeatable way:
NEW1's lease reported `count(*) FROM new1_doc_vector_stage` static at 2,360,247
for four hours, and I read that as a dead job. It was a live job that had moved
on to the index half of its round, where its own durable metric does not move.
**A flat durable-output metric is not evidence of a dead job when the job's
current phase does not write that output.**


### 2.5 THE CORRECTION: THE TWO FIXES ARE MULTIPLICATIVE

After migration 0093 made the thresholds reachable, autovacuum took its own
first-ever pass on `judgments` — completing at 05:48, `n_dead_tup` 700,172 → 0,
`relallvisible` **2,822,669 / 2,822,704 = 100.00%**. Re-measured on a box
confirmed empty:

| plan | visibility map | heap fetches | execution |
| --- | ---: | ---: | ---: |
| correlated, serial | 75.14% | 5,379,222 | 25,025 ms |
| correlated, serial | 83.52% | 3,447,267 | 26,156 ms |
| `GROUP BY`, parallel | 83.52% | 3,450,457 | 2,764 ms |
| **`GROUP BY`, parallel** | **100%** | **256** | **435 ms** |

**57× end to end**, and neither change alone explains it. On the serial plan a
36% cut in heap fetches was worth nothing measurable — which is exactly what
made §2.2 read as a refutation. It was not a refutation; the signal was
**confounded** by a plan whose cost was dominated by running 25 scans in
sequence. Once the plan was parallel, taking the map from 83.52% to 100% drove
heap fetches from 3,450,457 to **256** and the query from 2,764 ms to 435 ms.

The lesson is narrower than "measure": **a change that shows no effect under one
plan has not been shown to have no effect.** §2.2's conclusion was drawn from a
single arm and should have been held open until the other arm existed.

`0093`'s header still states that the vacuum "did not" help. That was true of
every measurement in existence when it was written. Migrations are forward-only
and it is not edited; this section is the correction of record.

---

## 3. AUTOVACUUM: THE CAUSE, NOT THE SYMPTOM

Not suppression, and not a bad setting. `autovacuum` is on,
`autovacuum_analyze_scale_factor` was already tuned DOWN to 0.02, and no table
carried `autovacuum_enabled = false`.

The thresholds are PROPORTIONAL, and on this table they evaluate to:

```
analyze          50 + 0.02 x 18,698,984 =   374,030 modifications
vacuum           50 + 0.05 x 18,698,984 =   934,999 dead tuples
insert-vacuum  1000 + 0.20 x 18,698,984 = 3,739,847 inserts
```

and the counters they are measured against are **zeroed by every unclean
shutdown**. Twenty-six of those between 15 and 24 Aug, six on 20 Aug alone, all
`0xC000013A` console-signal kills. The 18.7M-row bulk load is not in `n_tup_ins`
at all. **Autovacuum was never once told this table needed anything**, and would
have needed 3.7M inserts to accumulate between two crashes before it was.

Lowering the scale factor cannot fix this — a proportion of 18.7M is large
however small the coefficient. Migration **0093** sets `scale_factor = 0` and
absolute thresholds sized from measured throughput, on the four factory-core
tables only:

| table | threshold | sized from |
| --- | ---: | --- |
| `judgments` | 100,000 | NEW2's delta was 50,994 rows in one cycle — ~2 cycles |
| `judgment_paragraphs` | 500,000 | 503,819 rows in one session — ~1 day |
| `judgment_citations` | 200,000 | 20,000/pass on a 15-minute schedule |
| `judgment_chunks` | 50,000 | 620,300 rows, low churn |

Verified applied by reading `pg_class.reloptions` back.
`embedding_content_representative` is maintained correctly (`autoanalyze_count`
87) and NEW1's tables are that lane's — neither is touched.

**Immediate consequence, stated because it is load:** `judgments` carries
**700,125 dead tuples** (the `INDEX_CLEANUP OFF` pass could not reclaim them),
which is above the new 100,000 threshold, so autovacuum will now take a full
pass on its own. That is the correct maintenance for a 151 GB table that has
never had one, and autovacuum's cost throttle
(`autovacuum_vacuum_cost_delay = 2ms`, limit 2000) is what keeps it gentle.

---

## 3b. THE FRESHNESS OBJECT SHIPPED AT 53 SECONDS, AND THAT WAS CAUGHT BY DRIVING THE ROUTE

The unit tests called `buildFreshnessObject()` directly and passed in
milliseconds. Driving `GET /corpus/freshness/object` through the real app
reported `computeMs` **53,314**. A test that exercises the function and not the
route cannot see that, which is the same shape as `built-but-unreachable` from
the other direction: reachable, and unusable.

The cause was the court x month query, and it was a missing composite:

```
Index Scan using judgments_judgment_date_idx
  rows 846,963
  Buffers: shared hit=215,721 read=613,220     -- 4.8 GB, random
Execution Time: 42,353 ms
```

`judgments` carried `(court)` and `(judgment_date)` separately and nothing over
the pair, so a query needing both took the date index and went to the heap for
every match — three quarters of a page per row.

**Migration 0094**, built `CONCURRENTLY` on production and plainly in the
migration for fresh installs:

| | before | after |
| --- | ---: | ---: |
| plan | Index Scan + heap | **Index Only Scan** |
| Heap Fetches | ~846,963 | **141** |
| buffers | 828,941 | **104,955** |
| query | 42,353 ms | **363 ms** (117×) |
| **endpoint `computeMs`** | **53,314 ms** | **1,297 ms** (41×) |

135 MB, not the ~750 MB estimated — btree deduplication compresses
`(judgment_date, court)` heavily because the pair repeats enormously.

**It is not a one-endpoint index.** `search/retrieve.ts` filters on `j.court` and
`j.judgment_date` together on every filtered search — `courtWhere()` plus
`dateFrom`/`dateTo`, in both arms. That is a PD-10 product shape, and it had been
paying the same heap cost unmeasured.

The leading column is `judgment_date` because the date is the RANGE predicate and
the court is the equality/grouping one. The reverse order would serve
`court = ? AND date BETWEEN ?` but not `date >= ?` alone.

---

## 4. WHAT THIS ROUND DOES NOT CLAIM

- §2.2's "the vacuum did not help" is **superseded by §2.5**. It was true of the
  serial plan and false of the parallel one; the two fixes are multiplicative and
  the end-to-end figure is 25,025 ms → 435 ms, 57×.
- `latestUpstreamDecisionDate` is **NOT_MEASURED** and is not substituted.
- `upstreamLocalCompleteness` uses a **parquet-row** denominator, not deduped
  unique records. The specified denominator is not held anywhere today.
- The host-loss restore rehearsal at real scale was **not run** this round; it
  remains a dated backlog item with an owner.
- `retrieve.ts:19` has an unused `precedentialEffect` import that fails lint at
  HEAD. Pre-existing, untouched, reported.
