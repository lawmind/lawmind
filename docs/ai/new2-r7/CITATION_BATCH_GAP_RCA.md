# CITATION_BATCH_GAP_RCA — the 293 real citations in nine never-walked batches

**Lane:** NEW2 · **Round:** R7 §10 · **25 August 2026**
**Status:** root cause proven from evidence, repaired, verified **293 → 0**, prevented in code, regression test added.

---

## Summary

Nine ingest batches from **17 Aug 2026, 16:41:48Z–16:44:42Z** were never walked
by the citation-key builder. 899 judgments; 293 of them carry a real neutral
citation and therefore had no key row, so the resolver answered
`TARGET_NOT_HELD` for citations to judgments we hold.

The cause is not a bug in the cursor arithmetic. It is that
**`judgments.created_at` defaults to `now()`, and `now()` is transaction START
time, not commit time** — so a loader transaction that begins at 16:43:23.94 and
commits 250 ms later writes rows stamped 16:43:23.94 that were invisible to every
reader until 16:43:24.19. The builder's keyset cursor is monotonic, so a row that
becomes visible *below* the cursor is below it forever.

This could only bite while the builder was running at the live edge. It was, for
**four minutes and fifty-two seconds, once, in the corpus's entire history**.

---

## 1. The population, measured

`OBSERVED_BY_LIVE_DB`. Judgments carrying a neutral citation that is not a
registry despatch stamp, with no `source='neutral'` row in
`judgment_citation_keys`:

```
real_citation_judgments   1,370,251
missing_key_rows                293
distinct ingest batches           9
earliest missing          2026-08-17 16:41:48.689161+00
latest missing            2026-08-17 16:44:42.110750+00
```

The nine batches, with the count of citation-bearing rows in each:

```
2026-08-17 16:41:48.689161+00   100 rows,  83 with a citation   Allahabad High Court
2026-08-17 16:42:41.177795+00    99 rows,  14                   High Court of Punjab and Haryana
2026-08-17 16:43:23.942824+00   100 rows,  24                   Bombay High Court
2026-08-17 16:43:30.293477+00   100 rows,  48                   High Court of Karnataka
2026-08-17 16:43:39.149195+00   100 rows,   1                   Madras High Court
2026-08-17 16:43:48.146028+00   100 rows,  53                   High Court of Karnataka
2026-08-17 16:44:05.717339+00   100 rows,  39                   High Court of Karnataka
2026-08-17 16:44:21.160398+00   100 rows,   1                   Madras High Court
2026-08-17 16:44:42.110750+00   100 rows,  30                   High Court of Karnataka
                                899 rows, 293
```

This confirms and completes the previous session's finding (bus 1140): the
shortfall was **734 = 439 correctly-unkeyed despatch stamps + 293 unwalked + 0
lag**, and the 293 are the only part that was ever a defect.

---

## 2. Two hypotheses tested and rejected before the third was accepted

Recording these because each *looked* right and each was wrong, and the next
person will think of them in the same order.

**Rejected — "the cursor skipped a contiguous range."** It did not. The nine
batches are *interleaved* with fully-keyed neighbours, at millisecond distance:

```
ingest 16:43:23.702508   14 of 14 citation rows keyed
ingest 16:43:23.905982   49 of 49 keyed
ingest 16:43:23.942824    0 of 24 keyed     <-- skipped
ingest 16:43:24.034365   48 of 48 keyed
```

A range skip cannot produce that shape.

**Rejected — "the rows are distinguishable in some way the builder rejects."**
They are not. Profiled against their walked neighbours on `source_url`,
`source_document_type`, `text_extraction_method`, `hc_class_method`,
`parties_extraction_method` and citation shape, they are ordinary AWS Open Data
High Court rows carrying ordinary neutral citations (`2024:AHC-LKO:85127`). Every
one of them passes the despatch-stamp gate and the length constraints. Had the
builder seen them, it would have keyed them.

**Rejected — an `xmin` ordering anomaly.** `xmin` on these rows is dominated by
later enrichment UPDATEs (`xmin_max ≈ 1,014,000` on every batch in the window),
and the insert-time `xmin_min` values sit in ordinary sequence with their
neighbours. `xmin` records transaction *start* order, not commit order, so it
cannot answer this question either way. Recorded so nobody re-runs it.

---

## 3. The cause, proven from `judgment_citation_keys.created_at`

The key rows carry their own `created_at`, which reconstructs the walk minute by
minute. Over the 17 Aug ingest window:

```
ingest 16:38:00 .. 16:40:42   ->  keys written 16:41:03 .. 16:41:04     (walk ~3 min BEHIND)
ingest 16:41:30               ->  keys written 16:41:30.322             (walk 177 ms behind)
ingest 16:43:23.905982        ->  keys written 16:43:24.027307          (121 ms behind)
ingest 16:43:24.034365        ->  keys written 16:43:24.165038          (131 ms behind)
ingest 16:46:00.566559        ->  keys written 16:46:00.702279          (136 ms behind)
ingest 16:46:04.853821        ->  keys written 2026-08-24 18:39:42      (the catch-up, 7 days later)
```

The builder caught up to live ingest and rode it with **121–250 ms of lag**. For
the Bombay batch at 16:43:23.942824 to be missed, its transaction must still have
been uncommitted when the page covering 16:43:24.034365 ran at 16:43:24.165 —
i.e. it ran for at least 222 ms. A hundred-row insert taking 222 ms is
unremarkable; it is the *walker being 131 ms behind live* that is unusual.

**And it is unusual exactly once.** Corpus-wide distribution of the gap between a
judgment's `created_at` and its first key row:

| lag band | ingest batches | earliest | latest |
| --- | ---: | --- | --- |
| under 1 s | **100** | 2026-08-17 16:41:08 | 2026-08-17 16:46:00 |
| 1–5 s | 6 | 2026-08-17 16:41:00 | 2026-08-17 16:44:54 |
| 5–60 s | 27 | 2026-08-17 16:40:07 | 2026-08-17 16:40:53 |
| 1 min – 1 h | 1,467 | 2026-08-17 15:53:32 | 2026-08-17 16:40:01 |
| over 1 day | 27,571 | 2026-08-04 15:28:36 | 2026-08-23 09:14:34 |

**The exposure window is the whole of the sub-60-second band: 17 Aug 16:40:07 to
16:46:00.** Nothing else in the corpus's history was ever keyed within a minute
of being ingested, so nothing else could have been raced. The class is closed.

The 24 Aug catch-up ran from cursor 16:46Z forward and *could not* have repaired
these no matter how far it walked — they are below its starting point.

---

## 4. The part that is `UNKNOWN`, and why it is the more important half

Inside the same exposure window:

| state | batches | judgments | citation-bearing rows |
| --- | ---: | ---: | ---: |
| WALKED — produced key rows | 147 | 14,471 | 6,629 |
| **SKIPPED — provable** | **9** | **899** | **293** |
| **UNKNOWN — no citation in the batch, so walked and skipped are observationally identical** | **493** | **48,281** | **0** |

**The builder keeps no record of what it walked.** Coverage is *inferred from
output*, and a batch that produced no key rows is indistinguishable from a batch
it never saw. We know about these nine only because 293 of their rows happened to
carry a neutral citation.

Those 48,281 judgments are harmless *today* — they would have produced no keys
either way. They stop being harmless the moment anything backfills a citation
onto one of them, at which point it strands silently and nothing reports it.

This is the same shape as NEW1's finding in bus 1183 — a freshness guarantee
placed one step downstream of the thing that goes stale — and it is recorded as
`UNKNOWN` rather than closed.

---

## 5. The repair

`services/ingest/src/citation-keys-cli.ts` gains `--recheck <fromISO> <toISO>`:
a bounded re-walk of a `created_at` range using the identical derivation, which
**moves neither the checkpoint file nor `citation_key_frontier`**. A repair is
not progress, and a repair that advanced the frontier would report the index as
fresher than the walk has actually made it.

Run over `2026-08-17T16:39:00Z .. 2026-08-17T16:47:00Z`:

```
judgment_citation_keys   1,412,697  ->  1,412,990     (+293, exactly the stranded population)
checkpoint file          byte-identical before and after
citation_key_frontier    cursor_at 2026-08-24 18:59:19.088+00, unchanged
```

Post-repair, re-running the §1 measurement verbatim:

```
real_citation_judgments   1,370,251
missing_key_rows                  0
distinct ingest batches           0
```

`--rebuild` would also have fixed it, at the cost of truncating the index and
re-deriving 27.7 million rows to recover 899.

---

## 6. The prevention — an exact bound, not a guessed interval

The obvious fix is `created_at < now() - interval '5 minutes'`. It is a guess: too
slow for the resolver *and* still wrong for any loader transaction that runs six
minutes.

PostgreSQL can answer the question exactly. Every transaction that could still
insert a row below some timestamp is, by definition, **already running**, and its
`now()` is its `pg_stat_activity.xact_start`. So the oldest `xact_start` among
*other* backends in this database is a hard floor: no row can ever appear below
it that is not already visible. A transaction that has not begun yet will take
its `now()` after the reading, so it is above the bound too.

```
safe frontier = min(xact_start) over pg_stat_activity
                where pid <> pg_backend_pid() and datname = current_database()
              , or now() if no other transaction is open
```

Our own backend is excluded deliberately — this walk's own statement appears in
`pg_stat_activity`, and including it would pin the bound to the present instant
and provide no safety at all.

**Recomputed every page**, not once, so the bound advances as the slow loader
commits rather than freezing at whatever was running when the walk launched.

**When the exact bound is unavailable, the walk says so.** A role without
`pg_read_all_stats` sees other backends' `xact_start` as NULL, which is
indistinguishable from "nothing is running" and would silently restore the unsafe
behaviour. The query detects that case — peers exist but none is readable — and
falls back to a fixed interval while **printing which rule it is using**. A safety
bound whose provenance nobody can tell is not a safety bound.

Observed on this database (`OBSERVED_BY_EXECUTION`):

```
bound   2026-08-25 11:14:53.896102+00   exact=true   peers=7   readable=7
```

The bound was the census job's transaction start — correctly conservative.

**Cost, stated plainly:** the key index is now bounded by the oldest open
transaction rather than by the newest row. While a long read-only transaction is
open (a full-corpus scan, a backup), the index frontier stops advancing. That is
visible in `citation_key_frontier.cursor_at`, which is what consumers already
read for freshness — so the effect is *reported*, not hidden. **LCC: this is the
ingest-side half of `RESOLVER_CORRECTNESS_FRESHNESS_V3` and it changes the shape
of your freshness bound from "how far behind is the walk" to "how old is the
oldest open transaction". Worth an exchange before you finalise the numeric gate.**

---

## 7. Regression test

`services/ingest/src/citation-keys-frontier.test.ts` — see that file. It asserts
the property that actually failed rather than the symptom: with a transaction
open, the safe frontier is at or before that transaction's start; a row inserted
inside it is above the bound and therefore not skippable; and `--recheck` moves
neither cursor.
