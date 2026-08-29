-- 0093 — AUTOVACUUM THRESHOLDS THE FACTORY CAN ACTUALLY REACH
--
-- Owner: LCC. Storage parameters only. No column, constraint, index or row is
-- touched; `ALTER TABLE ... SET (...)` is a catalogue write and takes no scan.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE FINDING
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Probed 28 Aug 2026 on the live instance:
--
--     judgments   vacuum_count 0 · autovacuum_count 0
--                 analyze_count 0 · autoanalyze_count 0
--                 last_vacuum / last_autovacuum / last_analyze — all NULL
--                 relallvisible 2,120,913 / relpages 2,822,704 = 75.14%
--
-- **`judgments` had never been vacuumed or analyzed on this instance**, across
-- 18,698,984 rows and 151 GB. `judgment_paragraphs`, `judgment_citations` and
-- `judgment_chunks` are in the same state — `judgment_chunks` sat at
-- relallvisible 0.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- IT WAS NOT SUPPRESSION AND IT WAS NOT A BAD SETTING
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `autovacuum` is on. `autovacuum_analyze_scale_factor` was already tuned DOWN
-- to 0.02 from the 0.1 default. No table carried `autovacuum_enabled = false`.
-- Nothing was misconfigured in the ordinary sense.
--
-- The thresholds are PROPORTIONAL, and on tables this size they evaluate to:
--
--     judgments  analyze         50 + 0.02 x 18,698,984 =   374,030 modifications
--                vacuum          50 + 0.05 x 18,698,984 =   934,999 dead tuples
--                insert-vacuum 1000 + 0.20 x 18,698,984 = 3,739,847 inserts
--
-- and the counters those are measured against are **zeroed by every unclean
-- shutdown** — the PostgreSQL cumulative statistics file is discarded rather
-- than trusted after a crash. This instance took 26 of them between 15 and
-- 24 Aug 2026 (six on 20 Aug alone), all `0xC000013A` console-signal kills
-- rather than out-of-memory.
--
-- The proof that the counters do not reflect history: `n_tup_ins` for
-- `judgments` reads **52,716** on an 18,698,984-row table. The bulk load that
-- put 18.7M rows there is not in the counter at all. So autovacuum has never
-- once been told this table needs anything, and would need ~3.7 million inserts
-- to accumulate between two crashes before it ever was.
--
-- The accounting was erased faster than it could accumulate. That is the cause,
-- and no amount of lowering a SCALE FACTOR fixes it — a proportion of 18.7M is
-- large however small the coefficient.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE FIX: ABSOLUTE THRESHOLDS, SCALE FACTOR ZERO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `scale_factor = 0` removes the table's size from the trigger entirely, and the
-- absolute threshold becomes the whole condition. A number that a day or two of
-- real work reaches is a number that survives a crash-and-restart cycle; a
-- proportion of the whole table is not.
--
-- The values are sized from measured throughput, not chosen for roundness:
--
--     judgments            100,000  — NEW2's committed delta was 50,994 rows in
--                                     one cycle, so this is ~2 cycles
--     judgment_paragraphs  500,000  — 503,819 rows written in a single session
--                                     on 28 Aug; ~1 day of work
--     judgment_citations   200,000  — 20,000 rows/pass, 15-minute schedule
--     judgment_chunks       50,000  — 620,300 rows total and low churn
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES NOT CLAIM
-- ─────────────────────────────────────────────────────────────────────────────
--
-- **It does not make `/corpus/coverage` faster, and the vacuum it enables did
-- not either.** That was the hypothesis and it was measured and REFUTED:
-- `VACUUM (ANALYZE, INDEX_CLEANUP OFF) judgments` took the visibility map from
-- 75.14% to 83.52%, cut heap fetches 5,379,222 -> 3,447,267 (-36%) and disk
-- reads 1,932,349 -> 748,666 pages (-61%), and the query went from 25,025 ms to
-- 26,156 ms. Fewer heap fetches were never the bottleneck; a correlated
-- subquery running 25 serial index-only scans was, and that is fixed in
-- `services/api/src/corpus/coverage.ts` instead.
--
-- This migration is worth making on its own terms — a 151 GB table that is never
-- vacuumed accumulates dead tuples, loses its visibility map and drifts its
-- planner statistics, and every sequential consumer pays for it — but it is not
-- the fix for that endpoint and must not be recorded as one.
--
-- Nothing else is tuned. `embedding_content_representative` has
-- `autoanalyze_count` 87 and is being maintained correctly; NEW1's
-- `new1_doc_vector_stage` and `new1_tranche_passages` are that lane's tables and
-- are left alone.

SET LOCAL lock_timeout = '3s';

ALTER TABLE judgments SET (
  autovacuum_analyze_scale_factor       = 0,
  autovacuum_analyze_threshold          = 100000,
  autovacuum_vacuum_scale_factor        = 0,
  autovacuum_vacuum_threshold           = 100000,
  autovacuum_vacuum_insert_scale_factor = 0,
  autovacuum_vacuum_insert_threshold    = 100000
);

ALTER TABLE judgment_paragraphs SET (
  autovacuum_analyze_scale_factor       = 0,
  autovacuum_analyze_threshold          = 500000,
  autovacuum_vacuum_scale_factor        = 0,
  autovacuum_vacuum_threshold           = 500000,
  autovacuum_vacuum_insert_scale_factor = 0,
  autovacuum_vacuum_insert_threshold    = 500000
);

ALTER TABLE judgment_citations SET (
  autovacuum_analyze_scale_factor       = 0,
  autovacuum_analyze_threshold          = 200000,
  autovacuum_vacuum_scale_factor        = 0,
  autovacuum_vacuum_threshold           = 200000,
  autovacuum_vacuum_insert_scale_factor = 0,
  autovacuum_vacuum_insert_threshold    = 200000
);

ALTER TABLE judgment_chunks SET (
  autovacuum_analyze_scale_factor       = 0,
  autovacuum_analyze_threshold          = 50000,
  autovacuum_vacuum_scale_factor        = 0,
  autovacuum_vacuum_threshold           = 50000,
  autovacuum_vacuum_insert_scale_factor = 0,
  autovacuum_vacuum_insert_threshold    = 50000
);
