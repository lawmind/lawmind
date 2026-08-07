-- The citation fan-out — ONE implementation, two triggers.
--
-- When a judgment's overruled status changes, the required work is identical
-- whether an admin upheld a dispute or the nightly re-check noticed it.
-- `ADMIN_SURFACE.md` §15: "Do not build a second fan-out. Two implementations
-- would drift, and the one that drifts is the one that stops notifying."
--
-- The work, in one transaction:
--   1. write the correction to `judgments`
--   2. enqueue re-verification for EVERY citation_checks row referencing it
--   3. notice to every advocate who exported it in a draft — already filed
--   4. notice to every advocate who copied it out of the app
--
-- Partial completion is not acceptable. A half-completed fan-out is the worst
-- state available: the corpus says overruled while the advocate who filed it was
-- never told.

CREATE TYPE citation_fanout_trigger AS ENUM ('dispute_upheld', 'recheck', 'admin_correction');
CREATE TYPE citation_fanout_status AS ENUM ('pending', 'complete', 'failed');

CREATE TABLE citation_fanouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judgment_id uuid NOT NULL REFERENCES judgments (id),
  trigger citation_fanout_trigger NOT NULL,
  -- The dispute id or recheck id that caused it. Null for an ingest-time flip,
  -- which has no referent to point at.
  trigger_ref uuid,
  from_status text NOT NULL,
  to_status text NOT NULL,
  status citation_fanout_status NOT NULL DEFAULT 'pending',

  -- COUNTS ARE NULLABLE, AND THAT IS THE POINT.
  --
  -- Null means the population was never enumerated; 0 means it was enumerated and
  -- was empty. `citation_copies` does not exist yet (deferred at S0), so
  -- `copied_count` is NULL on every row written today — NOT zero. Writing 0 would
  -- assert that nobody copied this citation out of the app, which is a claim we
  -- have no basis for and precisely the "absent check is not a negative result"
  -- failure. A boolean or a zero cannot say "we do not know".
  saved_count integer,
  filed_count integer,
  copied_count integer,
  notified_count integer,

  -- sha256(judgment_id || to_status || trigger || trigger_ref).
  -- This is what makes a double-uphold, or an uphold racing the nightly
  -- re-check, safe: the second insert loses to the unique constraint and no
  -- advocate is notified twice. Being told the same authority moved twice is how
  -- an advocate learns to ignore the notification that matters.
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  CONSTRAINT citation_fanouts_idempotency_key_unique UNIQUE (idempotency_key),
  -- A complete fan-out must say how many people it told. A completed row with a
  -- null count is a fan-out nobody can audit.
  CONSTRAINT citation_fanouts_complete_has_counts
    CHECK (status <> 'complete' OR notified_count IS NOT NULL),
  CONSTRAINT citation_fanouts_complete_has_timestamp
    CHECK ((status = 'complete') = (completed_at IS NOT NULL))
);

CREATE INDEX citation_fanouts_status_created_at_idx ON citation_fanouts (status, created_at);
CREATE INDEX citation_fanouts_judgment_id_idx ON citation_fanouts (judgment_id);

-- The re-check compares live status against the status LAST RENDERED, which
-- lives on citation_checks.overruled_status_shown. Reading that per judgment is
-- the hot path of the nightly job.
CREATE INDEX citation_checks_judgment_shown_idx
  ON citation_checks (judgment_id_matched, overruled_status_shown);
