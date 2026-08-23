-- ───────────────────────────────────────────────────────────────────────────
-- DELETING ONE JUDGMENT SEQUENTIALLY SCANS 151 GB, AND THE CAUSE IS A MISSING
-- INDEX ON A SELF-REFERENCING FOREIGN KEY
-- ───────────────────────────────────────────────────────────────────────────
--
-- Found 23 Aug 2026 by LCC, by sampling `pg_stat_activity` while a test suite
-- hung rather than by guessing at the code:
--
--   pid 13464  00:03:15  DELETE FROM judgments WHERE id = ANY($1::uuid[])
--
-- Five fixture rows. Three minutes and counting.
--
-- `judgments` is referenced by **22 foreign keys**, and Postgres must check
-- every one of them before it may remove a row. Three of the referencing
-- columns have no index leading with them:
--
--   judgments.overruled_by_judgment_id   NO ACTION   <- 18.7M rows, 151 GB
--   judgment_annotations.judgment_id     CASCADE
--   alerts.judgment_id                   NO ACTION
--
-- The first is the one that costs three minutes. It is SELF-referencing, so
-- proving that no judgment records the doomed row as its overruler means
-- scanning the whole of `judgments` — the largest relation in the database —
-- once per delete. The other two are small tables and are cheap today; they are
-- included because an unindexed foreign key is a landmine that goes off when the
-- table grows, not when it is created.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHY THIS IS NOT A TEST-ONLY PROBLEM
-- ───────────────────────────────────────────────────────────────────────────
--
-- A hanging test is how it was FOUND, not what it costs.
--
-- `docs/FOUNDER_QUEUE.md` FQ-DUPLICATE-DOCUMENTS records **194,577 judgment
-- rows that are the same document held more than once**, and deduplication is a
-- queued product decision. At three minutes a row that is not a long job, it is
-- an impossible one — roughly **406 days** of sequential scanning. The decision
-- has been discussed as a product question while its implementation was silently
-- blocked by a missing index nobody had looked for.
--
-- ───────────────────────────────────────────────────────────────────────────
-- PARTIAL, FOR THE SAME REASON `0073` IS PARTIAL
-- ───────────────────────────────────────────────────────────────────────────
--
-- `0073` measured it: exactly 98 judgments carry a non-`none` overruled status,
-- so `overruled_by_judgment_id` is NULL for essentially the entire corpus. A
-- full index would be 18.7M entries to answer a question about ~100 rows.
--
-- A partial index still serves the referential check. The check Postgres runs is
-- `WHERE overruled_by_judgment_id = $1` with `$1` a real id, and the planner can
-- prove that implies `IS NOT NULL` — the same reasoning that lets
-- `judgment_citations_cited_idx`, already partial on this pattern, serve its own
-- foreign key today.
--
-- ───────────────────────────────────────────────────────────────────────────
-- NOT CONCURRENTLY HERE. THE LIVE INDEX IS BUILT BY HAND.
-- ───────────────────────────────────────────────────────────────────────────
--
-- Verbatim the lesson `0073` paid for: `CREATE INDEX CONCURRENTLY` cannot run
-- inside a transaction and the Drizzle migrator wraps every migration in one, so
-- this file stays plain — correct for building a schema from empty, which is
-- what `ci:local` does against a scratch database.
--
-- It is WRONG for a live 18.7M-row corpus with the ingest fleet writing: a plain
-- build takes the SHARE lock, and `0073` measured four fleet writers stacking up
-- behind one within 130 seconds. On the live database, run these by hand,
-- outside any transaction:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS judgments_overruled_by_idx
--     ON judgments (overruled_by_judgment_id)
--     WHERE overruled_by_judgment_id IS NOT NULL;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS judgment_annotations_judgment_idx
--     ON judgment_annotations (judgment_id);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS alerts_judgment_idx
--     ON alerts (judgment_id) WHERE judgment_id IS NOT NULL;
--
-- `IF NOT EXISTS` then makes this migration a no-op wherever that has already
-- happened, which is exactly what it should be.

SET LOCAL lock_timeout = '3s';

CREATE INDEX IF NOT EXISTS judgments_overruled_by_idx
  ON judgments (overruled_by_judgment_id)
  WHERE overruled_by_judgment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS judgment_annotations_judgment_idx
  ON judgment_annotations (judgment_id);

CREATE INDEX IF NOT EXISTS alerts_judgment_idx
  ON alerts (judgment_id)
  WHERE judgment_id IS NOT NULL;

COMMENT ON INDEX judgments_overruled_by_idx IS
  'LCC, 23 Aug 2026. Not for querying -- for DELETING. Without it, removing one '
  'judgment sequentially scans all 18.7M rows to satisfy the self-referencing '
  'foreign key, measured at 3m15s for five fixture rows. Partial because 0073 '
  'measured only ~98 judgments carry an overruler.';

-- ───────────────────────────────────────────────────────────────────────────
-- WHAT ACTUALLY HAPPENED ON THE LIVE DATABASE, 23 AUG 2026 — READ THIS
-- ───────────────────────────────────────────────────────────────────────────
--
-- Built by hand with CONCURRENTLY, as above, on a CONTENDED box (ingest fleet
-- writing, another agent session mid-suite). Outcome, verified against
-- `pg_index.indisvalid` rather than assumed from the absence of an error:
--
--   judgments_overruled_by_idx          VALID    16 kB   <- the one that mattered
--   judgment_annotations_judgment_idx   INVALID          <- see below
--   alerts_judgment_idx                 not created
--
-- **The important one is done and proven.** The referential check Postgres runs
-- before deleting a judgment now plans as:
--
--   Index Only Scan using judgments_overruled_by_idx  (cost=0.14..2.36 rows=1)
--
-- against a sequential scan of 18.7M rows before it. Measured with a
-- PARAMETERISED EXPLAIN, never an inlined one -- this repository has already
-- been lied to once by an inlined EXPLAIN that hid a 9,255,009-cost plan.
--
-- 16 kB, exactly as the partial-index reasoning above predicted.
--
-- ───────────────────────────────────────────────────────────────────────────
-- THE INVALID INDEX IS DEBRIS I LEFT, AND IT IS NOT HARMLESS
-- ───────────────────────────────────────────────────────────────────────────
--
-- `judgment_annotations_judgment_idx` was killed mid-build by a client-side
-- timeout. **An INVALID index is never used by a query and IS still maintained
-- on every write** -- pure cost, no benefit. `DROP INDEX CONCURRENTLY` was then
-- attempted and itself blocked: it must wait for every transaction that could be
-- using the index, and the fleet holds long ones.
--
-- Recorded here rather than left silent, because an invalid index is invisible
-- to anything except `indisvalid` and nobody looks there without a reason.
--
-- ON A QUIET BOX, run:
--
--   DROP INDEX CONCURRENTLY IF EXISTS judgment_annotations_judgment_idx;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS judgment_annotations_judgment_idx
--     ON judgment_annotations (judgment_id);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS alerts_judgment_idx
--     ON alerts (judgment_id) WHERE judgment_id IS NOT NULL;
--
--   SELECT c.relname, i.indisvalid FROM pg_class c
--     JOIN pg_index i ON i.indexrelid = c.oid
--    WHERE c.relname IN ('judgments_overruled_by_idx',
--                        'judgment_annotations_judgment_idx',
--                        'alerts_judgment_idx');
--
-- Both remaining tables are small, so both builds are seconds once nothing is
-- holding a long transaction open.
