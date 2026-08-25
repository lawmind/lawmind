-- 0085 — resolver safety stops depending on somebody remembering to re-run a job.
--
-- WHY
-- ────────────────────────────────────────────────────────────────────────────
-- NEW2 graded the resolver against independent truth and found the false-UNIQUE
-- rate was 15.63% — 33,013 shared-neutral groups collapsing to a single
-- confident answer. The rules were not wrong. The INDEX they read was
-- 309,130 neutral citations behind its own cursor, and had been since 17 August.
-- Re-running the existing builder repaired 33,001 of the 33,013.
--
-- That is the dangerous shape: nothing failed, nothing errored, and the resolver
-- kept answering UNIQUE with total confidence about a corpus it had only half
-- seen. A one-time catch-up fixes the number for a day. It cannot stop the same
-- gap reopening the moment ingest moves again.
--
-- WHY THE CURSOR AND NOT A SUBTRACTION
-- ────────────────────────────────────────────────────────────────────────────
-- The obvious freshness measure — newest judgment that HAS a key, versus newest
-- judgment — is wrong here, and wrong in the direction that reads healthy. A
-- judgment citing nothing never gets a key row at all, so the "frontier" derived
-- that way sits wherever the last citing judgment happened to land and says
-- nothing about how far the walk actually got.
--
-- The builder already knows the true answer: its `(created_at, id)` keyset
-- cursor. Until now it kept that in a FILE, in the ingest service's working
-- directory, where no API process and no alert rule can read it. This table is
-- that cursor, written where the thing that must act on it can see it.
--
-- THE OTHER HALF: WHEN WAS THE RISK SET LAST REPLAYED
-- ────────────────────────────────────────────────────────────────────────────
-- Freshness answers "has the index seen everything". It does not answer "does
-- the index still resolve the hard cases correctly", which is a different
-- question that only a replay of an adjudicated truth set can answer. NEW2 owns
-- that set; this table records WHEN it last ran and WHAT it said, so a stale
-- validation is as visible as a stale index.

SET LOCAL lock_timeout = '5s';

-- One row. The keyset cursor the citation-key builder has actually reached.
CREATE TABLE IF NOT EXISTS citation_key_frontier (
  -- Deliberately a fixed primary key rather than a serial: there is exactly one
  -- frontier, and a table that can hold two of them is a table where somebody
  -- eventually reads the wrong one.
  id             boolean     PRIMARY KEY DEFAULT true CHECK (id),

  cursor_at      timestamptz NOT NULL,
  cursor_id      uuid        NOT NULL,
  /** Rows the builder has walked in total. Its own count, not a re-derivation. */
  scanned        bigint      NOT NULL DEFAULT 0,
  /** When the builder last wrote this row — the heartbeat of the walk itself. */
  updated_at     timestamptz NOT NULL DEFAULT now(),
  /** Which run wrote it, so two overlapping builders are visible rather than silent. */
  run_id         text
);

COMMENT ON TABLE citation_key_frontier IS
  'The citation-key builder keyset cursor, in the database rather than only in a checkpoint file, so the resolver and the alert poller can read how far the walk has actually got. Never derive this by subtracting keyed judgments from all judgments: a judgment that cites nothing never gets a key row and would silently move the apparent frontier.';

-- Every replay of the adjudicated risk set, append-only.
CREATE TABLE IF NOT EXISTS resolver_risk_replay (
  id                      bigserial   PRIMARY KEY,
  ran_at                  timestamptz NOT NULL DEFAULT now(),
  /** Which truth set, so a replay of a smaller set cannot silently reset the clock. */
  truth_set               text        NOT NULL,
  records                 integer     NOT NULL,
  false_unique            integer     NOT NULL,
  materially_unsafe       integer     NOT NULL,
  /** The frontier AT THE TIME, so a good result can be tied to the index that produced it. */
  frontier_at             timestamptz,
  notes                   text
);

CREATE INDEX IF NOT EXISTS resolver_risk_replay_time_idx
  ON resolver_risk_replay (ran_at DESC);

COMMENT ON TABLE resolver_risk_replay IS
  'When the adjudicated resolver risk set was last replayed and what it said. A fresh index that has never been graded is not a safe index; this is the other half of the question.';
