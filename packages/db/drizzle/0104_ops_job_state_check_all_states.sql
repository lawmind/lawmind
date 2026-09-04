-- 0104 - THE CONTROL PLANE COULD NOT PUBLISH WHAT IT HAD LEARNED TO SEE
--
-- Owner: LCC. Repairs the contract between `scripts/job-health.mjs` and the
-- table 0083 created for it.
--
-- -----------------------------------------------------------------------------
-- THE DEFECT, STATED IN ONE SENTENCE
-- -----------------------------------------------------------------------------
--
-- `job-health.mjs` classifies a job into one of THIRTEEN states; the CHECK
-- constraint written in 0083 permits SEVEN; every publish since 1 September 2026
-- has been rejected in full, and the pager has been reading eleven-day-old rows
-- as if they were the present tense.
--
-- -----------------------------------------------------------------------------
-- HOW A CONSTRAINT AND ITS WRITER DRIFTED APART WITHOUT ANYONE NOTICING
-- -----------------------------------------------------------------------------
--
-- 0083 enumerated the seven states the classifier had in August. Two later fixes
-- taught it to stop accusing jobs that were working:
--
--   fa9d22a2  "the bus said DEAD while the GPU ran, and FAILED while three
--              workers were fine"
--   9a4066a8  "progress outranks the process table - job-health stops paging on
--              jobs that are working"                      (1 Sep 2026, 22:25)
--
-- Between them they added RUNNING_BY_PROGRESS, STALE_REGISTRATION,
-- RUNNING_REPLAYING, IDLE_CAUGHT_UP, PRESENT and NOT_DECLARED. Every one is a
-- state the tool now legitimately reports; not one was added here.
--
-- The failure mode is the ugly kind. `publish()` sends every row in ONE INSERT,
-- so a single row carrying a new state rejects the WHOLE reading - including the
-- rows whose states were always legal. And a publish failure is deliberately
-- non-fatal (0083's own reasoning: the matrix must still print when the database
-- is what is down), so it printed one line at the end of a long report and the
-- exit code stayed 0. Nothing was broken loudly enough to be seen.
--
-- MEASURED 5 Sep 2026: `ops_job_current` had not gained a row since
-- 25 Aug 09:40:26Z - 274 hours - while `.agents/jobs/observations.jsonl`, the
-- file half of the same tool, kept being written. Two halves of one control
-- plane, one of them silently declined for eleven days.
--
-- Downstream, `admin/metrics.ts` paged every ten minutes that
-- `new1-doc-vector-embed FAILED` about a job that was producing 34,000 vectors
-- an hour on a GPU pinned at 99%. The rows were true when written. They were
-- simply eleven days old.
--
-- -----------------------------------------------------------------------------
-- WHY THE FULL THIRTEEN, AND NOT THE THREE THAT HAPPEN TO HURT TODAY
-- -----------------------------------------------------------------------------
--
-- Adding only the states currently observed on this box would rebuild exactly
-- the trap this migration exists to remove: the next honest classification the
-- tool learns would reject the whole reading again, silently, for as long as
-- nobody read the last line of the report. The list below is every literal
-- `state:` the classifier can emit, taken from the source rather than from the
-- states this machine happened to produce today.
--
-- The constraint is KEPT rather than dropped. A free-text state column would let
-- a typo publish itself forever, and `metrics.ts` matches state names exactly -
-- 'RUNNING_STALLED ' with a trailing space would read as healthy. The check is
-- the thing that makes a misspelling loud, which is worth more than the trouble
-- it caused here.
--
-- Still text with a CHECK, not an enum, for 0083's original reason: `pg_dump -t`
-- omits enum types, so an enum-bearing table cannot be restored from a
-- table-scoped dump, and this table is one a release rehearsal wants to carry.
--
-- No rewrite of existing rows: every state already stored is still legal, so
-- this only widens. Existing history stays readable exactly as written.

-- Required on every migration by `apply-migration-online.mjs`. This one takes an
-- ACCESS EXCLUSIVE lock to swap a constraint, which is fast (no table scan is
-- needed for a widened CHECK under NOT VALID + VALIDATE, and the table is small
-- enough that a plain re-add is instant) - but a lock without a timeout is how a
-- fast migration becomes an outage behind one slow reader.
SET LOCAL lock_timeout = '5s';

ALTER TABLE ops_job_observations
  DROP CONSTRAINT IF EXISTS ops_job_observations_state_check;

ALTER TABLE ops_job_observations
  ADD CONSTRAINT ops_job_observations_state_check
  CHECK (state IN (
    -- The seven from 0083.
    'RUNNING_PROGRESSING',
    'RUNNING_STALLED',
    'STARTING',
    'PAUSED',
    'STOPPED',
    'FAILED',
    'UNKNOWN',
    -- Absence of a process is not absence of work: the declared durable output
    -- is advancing and only the REGISTRATION is stale.
    'RUNNING_BY_PROGRESS',
    -- No process, and nothing measured. Death is UNPROVEN, and on this box
    -- Win32_Process returns an empty CommandLine for session-0 scheduled-task
    -- workers, so absence proves nothing on its own.
    'STALE_REGISTRATION',
    -- Re-walking ground it has already covered; alive, and not new work.
    'RUNNING_REPLAYING',
    -- The frontier is closed. A worker with nothing to do is not a stalled one,
    -- and conflating them is what made a finished backlog look like a failure.
    'IDLE_CAUGHT_UP',
    -- A live LawMind process that matches no registry job, and a registry job
    -- with no declaration - the two halves of "the registry and the box
    -- disagree", which is a finding rather than a state of any job.
    'PRESENT',
    'NOT_DECLARED'
  ));

COMMENT ON CONSTRAINT ops_job_observations_state_check ON ops_job_observations IS
  'Every literal state scripts/job-health.mjs can emit. WIDEN THIS IN THE SAME COMMIT that teaches the classifier a new state: publish() sends the whole reading in one INSERT and a publish failure is non-fatal by design, so a missing state silently freezes the entire control plane rather than dropping one row.';
