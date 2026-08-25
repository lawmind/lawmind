-- 0084 — the per-object erasure lifecycle.
--
-- WHY
-- ────────────────────────────────────────────────────────────────────────────
-- R4 §5: "the DB request becomes completed before R2 objects are deleted", and
-- gate `R2/backup erasure completion` is FALSE and blocks the whole app.
--
-- The shape of the defect is not that anyone forgot. `eraseUser` deliberately
-- RETURNS the keys it cannot remove, and `executeErasure` deliberately names the
-- field `storageKeysStillToDelete`. Both are honest. What was missing is that
-- nothing consumed them and the request was marked `completed` anyway — so the
-- compliance claim was made by the status column while the advocate's uploaded
-- PDFs were still fetchable by key.
--
-- A returned array cannot be retried, cannot be audited, and disappears the
-- moment the HTTP response is discarded. A row can. That is the whole reason
-- this table exists rather than a bigger return value.
--
-- THE FOUR STATES
-- ────────────────────────────────────────────────────────────────────────────
--   PENDING             recorded, not yet deleted. The starting state, written
--                       in the SAME transaction that deletes the rows — so a
--                       crash between the two can never lose a key.
--   DELETED             gone, and CONFIRMED gone. See `receipt`.
--   RETRYABLE_FAILURE   the store said no in a way that may succeed later —
--                       5xx, timeout, throttle. The sweeper will try again.
--   PERMANENT_FAILURE   it will not succeed by retrying: 403, a malformed key,
--                       or the attempt budget is spent. This is the dead
--                       letter, and it needs a human.
--
-- A request may reach `completed` only when every row for it is DELETED.
-- PERMANENT_FAILURE does NOT complete a request — that is the entire point. An
-- erasure that cannot finish must stay visibly unfinished.
--
-- WHY `receipt` IS NOT JUST "we called delete and got a 204"
-- ────────────────────────────────────────────────────────────────────────────
-- S3-compatible DELETE is idempotent and answers 204 whether or not the key was
-- ever there, which makes the response worthless as evidence of absence — it is
-- equally consistent with "deleted" and with "wrong bucket, nothing matched,
-- object still live in the right one". So the sweeper deletes and then HEADs,
-- and stores what the HEAD said. A 404 from HEAD is the receipt.

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS erasure_objects (
  id               bigserial   PRIMARY KEY,

  -- The request this object belongs to. ON DELETE CASCADE is deliberately NOT
  -- used: if a data_requests row were ever removed we would want these to
  -- survive as the record that an object was owed a deletion.
  data_request_id  uuid        NOT NULL REFERENCES data_requests(id),

  -- Which column the key came from, e.g. 'documents.storage_key'. Kept because
  -- "an object survived" and "a whole SOURCE of objects was never collected"
  -- are different bugs, and only provenance can tell them apart. This migration
  -- ships alongside the fix for exactly that: `ocr_jobs.storage_key` is NOT
  -- NULL, its rows were being deleted, and its keys were never captured at all.
  source           text        NOT NULL,

  bucket           text        NOT NULL,
  storage_key      text        NOT NULL,

  state            text        NOT NULL DEFAULT 'PENDING'
    CHECK (state IN ('PENDING','DELETED','RETRYABLE_FAILURE','PERMANENT_FAILURE')),

  attempts         integer     NOT NULL DEFAULT 0,
  last_error       text,
  -- What proved it is gone. Never a bare "204": see the header.
  receipt          text,

  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_attempt_at  timestamptz,
  deleted_at       timestamptz,

  -- One row per key per request. This is what makes the sweep idempotent: a
  -- re-run of the same erasure cannot create a second lifecycle for the same
  -- object, and a re-delete of an already-DELETED row is skipped rather than
  -- re-attempted against a store that would answer 204 either way.
  UNIQUE (data_request_id, storage_key)
);

-- The sweeper's only query: everything not yet finished, oldest attempt first.
CREATE INDEX IF NOT EXISTS erasure_objects_unfinished_idx
  ON erasure_objects (last_attempt_at NULLS FIRST)
  WHERE state IN ('PENDING','RETRYABLE_FAILURE');

CREATE INDEX IF NOT EXISTS erasure_objects_request_idx
  ON erasure_objects (data_request_id, state);

COMMENT ON TABLE erasure_objects IS
  'External object deletions owed by an account erasure. A data request may only reach status=completed when every row here is DELETED; PERMANENT_FAILURE is a dead letter needing a human and never completes a request.';
