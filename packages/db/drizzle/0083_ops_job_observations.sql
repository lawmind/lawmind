-- 0083 — the process control plane's readings, in the database.
--
-- WHY A TABLE AND NOT JUST THE JSONL FILE
-- ────────────────────────────────────────────────────────────────────────────
-- `.agents/jobs/observations.jsonl` is where `scripts/job-health.mjs` keeps the
-- previous fingerprint it needs in order to tell a moving checkpoint from a
-- frozen one. That file is enough for a human running one command.
--
-- It is NOT enough for paging. `ops/alert-poller.ts` evaluates conditions out of
-- `admin/metrics.ts`, which reads SQL and nothing else, and the whole point of
-- the alerting design is that there is exactly ONE place a condition is judged.
-- Giving the poller a filesystem reader would create the second copy that
-- `metrics.ts` exists to prevent.
--
-- So the file remains the control plane's working memory and this table is its
-- published reading. Same numbers, one direction of flow: job-health writes,
-- metrics reads, nothing writes back.
--
-- APPEND-ONLY, and the reason is the same one that makes `registry.jsonl`
-- append-only: several lanes' jobs land here and a row that is UPDATE-ed in
-- place destroys the history that answers "when did it actually stop moving".
-- `ops_job_current` is the latest-row-per-job view for anyone who wants the
-- present tense.

-- `apply-migration-online.mjs` requires a lock_timeout on every migration and it
-- is right to, even here. This one only CREATEs, so it queues behind nothing an
-- advocate is waiting on — but a migration that is exempt "because it is safe"
-- is how the rule stops being a rule, and the runner refuses the file without it.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS ops_job_observations (
  id                   bigserial PRIMARY KEY,
  job_id               text        NOT NULL,
  owner_lane           text        NOT NULL,
  observed_at          timestamptz NOT NULL DEFAULT now(),

  -- The seven states of the control plane. Deliberately text with a CHECK
  -- rather than an enum: `pg_dump -t` omits enum types, so an enum-bearing
  -- table cannot be restored from a table-scoped dump, and this table is one of
  -- the things a release rehearsal will want to carry.
  state                text        NOT NULL
    CHECK (state IN ('RUNNING_PROGRESSING','RUNNING_STALLED','STARTING',
                     'PAUSED','STOPPED','FAILED','UNKNOWN')),

  -- What the owning lane DECLARED, recorded next to what was OBSERVED. Where
  -- they disagree that disagreement is the finding, so both are kept.
  declared_status      text,

  pid                  integer,
  pid_alive            boolean,
  pid_created_at       timestamptz,
  parent_pid           integer,
  startup_mechanism    text,
  resource_class       text,
  restart_count        integer,

  -- The content hash of the job's own checkpoint (and log tail). Two readings
  -- with the same fingerprint mean nothing moved between them; that comparison,
  -- not liveness, is what `last_progress_at` is derived from.
  progress_fingerprint text,
  progress_metric      text,
  last_progress_at     timestamptz,

  checkpoint           text,
  log                  text,

  -- Whether a stall here should wake a human. LCC owns this judgement because
  -- LCC owns paging; it does NOT make LCC the owner of the job.
  critical             boolean     NOT NULL DEFAULT false,

  why                  text,
  observer             text        NOT NULL
);

-- The only two access patterns: "latest per job" and "the recent window".
CREATE INDEX IF NOT EXISTS ops_job_observations_job_time_idx
  ON ops_job_observations (job_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS ops_job_observations_time_idx
  ON ops_job_observations (observed_at DESC);

-- Latest reading per job. DISTINCT ON rides the index above.
CREATE OR REPLACE VIEW ops_job_current AS
SELECT DISTINCT ON (job_id) *
  FROM ops_job_observations
 ORDER BY job_id, observed_at DESC;

COMMENT ON TABLE ops_job_observations IS
  'Append-only readings from scripts/job-health.mjs. A process being alive does not prove progress; last_progress_at is derived from a CHANGE in progress_fingerprint between two readings, never from liveness or from a file mtime.';
