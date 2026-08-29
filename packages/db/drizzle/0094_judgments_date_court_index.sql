-- 0094 — judgments (judgment_date, court): THE PAIR EVERY DATE-BOUNDED COURT
-- QUERY NEEDS, AND WHICH NO INDEX COVERED
--
-- Owner: LCC.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE MEASUREMENT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `judgments` carried two single-column indexes and no composite:
--
--     judgments_court_idx           btree (court)
--     judgments_judgment_date_idx   btree (judgment_date)
--
-- `/corpus/freshness/object`'s court x month detail needs BOTH columns for the
-- same rows, so the planner took the date index and then went to the heap for
-- every match. Measured 29 Aug 2026, EXPLAIN (ANALYZE, BUFFERS):
--
--     Index Scan using judgments_judgment_date_idx
--       rows 846,963
--       Buffers: shared hit=215,721 read=613,220     -- 4.8 GB, random
--     Execution Time: 42,353 ms
--
-- 613,220 pages read for 846,963 rows is roughly three quarters of a page per
-- row: random heap access, which is what a two-column need over a one-column
-- index always becomes.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- IT IS NOT A ONE-ENDPOINT INDEX
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `search/retrieve.ts` filters on `j.court` and `j.judgment_date` TOGETHER on
-- every filtered search — `courtWhere()` plus `dateFrom`/`dateTo` are applied to
-- the same rows in both the dense and the sparse arm. That is a core product
-- shape (PD-10 filters), not a reporting one, and it has been paying the same
-- heap-fetch cost.
--
-- Leading with `judgment_date` because the date is the RANGE predicate and the
-- court is the grouping/equality one: a range on the leading column plus
-- equality after it is the order btree can actually use for both. The reverse
-- order would serve `court = ? AND date BETWEEN` and not `date >= ?` alone.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- BUILT CONCURRENTLY ON PRODUCTION, PLAINLY HERE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `CREATE INDEX` takes a lock that blocks writes for the whole build, and on an
-- 18,698,984-row table that is minutes of a blocked factory. So the live index
-- was built with `CREATE INDEX CONCURRENTLY` on 29 Aug 2026, OUTSIDE a
-- migration — `CONCURRENTLY` cannot run inside a transaction and drizzle wraps
-- each migration in one.
--
-- This statement exists for the fresh-install path, where the table is empty and
-- the build is instant. `IF NOT EXISTS` makes it a no-op on the instance that
-- already has it, so the two paths converge on the same schema without the
-- migration ever having to take the heavy lock.
--
-- If a future instance needs it on a populated table, build it CONCURRENTLY by
-- hand first and let this statement no-op — do not remove the `IF NOT EXISTS`.

SET LOCAL lock_timeout = '3s';

CREATE INDEX IF NOT EXISTS judgments_date_court_idx
  ON judgments (judgment_date, court);

COMMENT ON INDEX judgments_date_court_idx IS
  'Serves date-bounded court queries as an index-only scan: the freshness '
  'court x month detail, and every filtered search that narrows by court AND '
  'date. Built CONCURRENTLY on production 29 Aug 2026; this migration is the '
  'fresh-install path and no-ops where it already exists.';
