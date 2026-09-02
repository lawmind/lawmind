# LCC R24 — two red tests: one was the test's fault, one was not

## `packages/db` "audit_log leaves no rows behind" — FIXED, in the TEST

`AUDIT_LOG_TEST_CLASS = SHARED_TABLE_GLOBAL_EMPTINESS`
`AUDIT_LOG_TEST_FIXED = YES`

INTENT: the code (the append-only trigger, plus three cases that each run inside
a rolled-back transaction) leaves no rows of the SUITE'S OWN; the failing check
expected the entire shared `audit_log` table to hold zero rows; the spec — this
test file's own header — says *"Each case runs inside a transaction that is
rolled back, so nothing persists."* The check is the broken side, and the
docstring outranks it.

Measured on the shared local database: **966 rows**, 740 of them carrying a
`reason`, the largest group being 259 rows of `'lcc-2 assertion'`. `audit_log` is
append-only by design — REVOKE'd UPDATE/DELETE plus a raising trigger
(`0002_audit_log_append_only.sql`) — so once anything has ever performed an
audited action on a database, `count(*) = 0` can never be true there again. It is
not a flake; it is permanently red.

The fix is identity, not emptiness. Each seeded row now carries a per-process
`TAG`, and the assertion is that zero rows carry it — plus zero seed users, since
a surviving FK parent means the transaction committed, which is the same defect
under a different table's name. It still goes red for the real defect: a case
that forgot its rollback, or a rollback the trigger let through.

**No audit row was deleted.** The table refuses DELETE and the refusal is the
point. 4/4 green.

## `sparse-bound.test.ts` "admits a globally common term inside a NARROW
court+date population" — the diagnosis was WRONG, and the test is now narrower

`SPARSE_FLAKE_CLASS = WHOLE-PIPELINE WALL CLOCK ON A CONTENDED BOX`
`SPARSE_TEST_CHANGED = YES — narrower, not looser. Threshold unchanged at 5,000 ms.`

Bus 1710 classified this as suite contention: *"Re-run alone: 383 ms, 5/5
pass."* **That no longer reproduces.** Run alone on 2 Sep it failed at
**6,718 ms**, which reads as a broken `MATERIALIZED` fence — the exact regression
the assertion exists to catch.

It is not broken. `EXPLAIN (ANALYZE, BUFFERS)` of the fenced statement, same
scope the test picks (High Court of Karnataka, June 2026, 7,903 documents):

```
CTE eligible -> Index Scan using judgments_date_court_idx (actual rows=7903)
CTE Scan on eligible ... Storage: Memory, Maximum Storage: 373kB
Execution Time: 358.091 ms
```

No BitmapAnd, no 4.5 M postings, 358 ms **at that moment, on a quiet box**. So
the fence is intact and the regression this assertion exists to catch has not
happened.

The assertion now reads `sparseMs` from the phase clock this round added — same
5,000 ms, applied to the arm rather than to the whole of `hybridSearch`, which
also includes the exact-lookup probe, the content-hash collapse, hydration of ten
`full_text` rows and the paragraph fallback. The assertion's own comment claims
it guards the plan fence; it was timing the fence plus four things the fence has
nothing to do with, and on failure it now prints both figures.

**A correction, from the change's own output.** My first reading was that the
6,718 ms failure was ~358 ms of fenced query plus ~6.4 s of pipeline. That was an
inference across two different moments and it is **wrong**. Re-run under
full-suite load, the new message says:

```
the fenced sparse arm must be fast; arm took 5038ms (whole hybridSearch 5095ms)
```

The arm is 5,038 ms of a 5,095 ms call — the non-arm work is ~57 ms. So the same
fenced statement that executes in 358 ms on a quiet box takes seconds under
contention, and **narrowing the assertion did not reduce the flake**, because the
arm was already ~99% of what was being timed. It is a better-aimed assertion and
a more diagnostic failure message; it is not a fix.

State after the change, measured both ways:

- **run alone: 5/5 green**, that case at 437 ms;
- **under the twelve-suite run on this box: still red**, at arm 5,038 ms.

`SPARSE_FLAKE_CLASS` is therefore box contention on the sparse statement itself,
not, as bus 1710 had it, suite contention around a fast query — and not a lost
fence either. The remaining options are to run this suite on a quiet box or to
find deterministic plan evidence that does not require duplicating the module's
SQL or adding a test-only seam to a production module. Neither is available
today, so the threshold stays where it is.

No time budget was inflated. No index was added. No timeout was changed.
