-- ============================================================================
-- FOUNDER-EXECUTED. LCC cannot run this: pg_cancel_backend and
-- pg_terminate_backend are both refused by the agent tool sandbox's classifier,
-- and that refusal was NOT worked around.
--
-- WHAT IS WRONG
--   Backend pid 62315 has held one statement since 2026-08-14 23:00:27 UTC.
--   It is the citation resolver's bulk UPDATE, started ~33 minutes after the
--   machine rebooted at 22:27Z, by a session that no longer exists. The same
--   statement's dry run completes in about two minutes.
--
--   It holds row locks on judgment_citations. pg_blocking_pids names it as the
--   exact and only blocker of the ready resolver run (pid 65284).
--
-- WHAT IS AT STAKE
--   131,125 citation edges. Production resolution is 13.63% and the measured
--   post-apply figure is 30.0%. THE 30% IS A DRY-RUN PROJECTION, NOT AN
--   ACHIEVED NUMBER, and must not be quoted as achieved until step 4 confirms
--   it against the live count.
--
-- WHY CANCELLING IS SAFE
--   The UPDATE is uncommitted, so it rolls back cleanly. There is no partial
--   write to repair and nothing to reconcile. The work is fully reproducible --
--   step 3 redoes it. Cancelling is strictly milder than terminating: it ends
--   the query and leaves the connection alive.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 0 -- CONFIRM IT IS STILL THE SAME STUCK BACKEND BEFORE KILLING ANYTHING.
-- A pid is reused by the operating system. Check the start time and the query
-- text match what is described above; if they do not, STOP and re-diagnose
-- rather than cancelling whatever now happens to hold that number.
-- ---------------------------------------------------------------------------
SELECT pid,
       state,
       backend_start,
       xact_start,
       now() - query_start AS running_for,
       left(regexp_replace(query, '\s+', ' ', 'g'), 120) AS query_head
FROM pg_stat_activity
WHERE pid = 62315;

-- Expected: backend_start 2026-08-14 23:00:27+00, state 'active',
-- query_head beginning " WITH corpus AS ( SELECT upper(regexp_replace(rc, ...".

-- ---------------------------------------------------------------------------
-- STEP 1 -- CONFIRM IT IS ACTUALLY BLOCKING SOMETHING.
-- If this returns no rows the blockage has cleared on its own and nothing below
-- needs running.
-- ---------------------------------------------------------------------------
SELECT a.pid,
       now() - a.query_start AS waiting_for,
       pg_blocking_pids(a.pid) AS blocked_by
FROM pg_stat_activity a
WHERE cardinality(pg_blocking_pids(a.pid)) > 0;

-- ---------------------------------------------------------------------------
-- STEP 2 -- CANCEL. This is the mild form; try it first.
-- ---------------------------------------------------------------------------
SELECT pg_cancel_backend(62315);

-- If pg_stat_activity still shows pid 62315 active a minute later, the query is
-- not at a cancellation point. Only then:
--     SELECT pg_terminate_backend(62315);
-- Terminate drops the connection as well as the query. Still safe here -- the
-- transaction is uncommitted either way -- but there is no reason to reach for
-- it first.

-- ---------------------------------------------------------------------------
-- STEP 3 -- LCC RE-RUNS THE RESOLVER. Nothing for the founder to do; recorded so
-- the sequence is complete. Dry run FIRST, always -- the guards (exactly one
-- candidate, the year guard, never-overwrite, no self-citation) are what make
-- this safe, and a dry run is how they are seen to have fired.
--
--   node --import tsx --env-file=.env services/ingest/src/resolve-cli.ts
--   node --import tsx --env-file=.env services/ingest/src/resolve-cli.ts --apply
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- STEP 4 -- THE ONLY NUMBER THAT COUNTS AS ACHIEVED.
-- Run this AFTER the apply. Until it reads ~30%, the figure in every document
-- and every bus message stays a projection.
-- ---------------------------------------------------------------------------
SELECT count(*) FILTER (WHERE cited_judgment_id IS NOT NULL)              AS resolved,
       count(*) FILTER (WHERE citation_text <> '')                        AS real_edges,
       round(100.0 * count(*) FILTER (WHERE cited_judgment_id IS NOT NULL)
             / nullif(count(*) FILTER (WHERE citation_text <> ''), 0), 2) AS pct
FROM judgment_citations;

-- Baseline recorded 2026-08-15 19:10 UTC, before any of the above:
--   resolved 114,748 · real_edges 841,768 · pct 13.63

-- ---------------------------------------------------------------------------
-- STEP 5 -- THE STANDING DEFECT THIS INCIDENT EXPOSED, which outlives it.
-- The bulk sweep is a MANUAL pass with no schedule, while the corpus grows
-- ~170,000 rows/hour. Resolution therefore decays continuously between runs and
-- nothing measures the decay. Clearing pid 62315 fixes today; it does not fix
-- that. docs/CURRENT_PLAN.md Q1.53.
-- ---------------------------------------------------------------------------
