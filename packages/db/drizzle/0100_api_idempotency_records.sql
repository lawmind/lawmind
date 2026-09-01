-- 0100 — ONE IDEMPOTENCY LEDGER FOR THE SIX CURRENT-V1 CREATE WRITES
--
-- Owner: LCC. Implements the persistence half of contract revision R16
-- (`docs/product/RCC_V1_API_CONTRACT_R16_AMENDMENT.md`, NEW3 bus 1691).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY ONE TABLE AND NOT SIX COLUMNS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `Idempotency-Key` is request metadata, not a property of an annotation, a
-- matter, an event, a consent or a privacy request. Six per-domain key columns
-- would be six uniqueness rules to get right, six replay shapes to keep in step
-- with their handlers, and six places for the next create route to forget. The
-- scope R16 defines — authenticated principal + method + canonical route
-- template + key — is identical at all six, so it is expressed once.
--
-- It is also NOT content de-duplication and must never become it. Nothing here
-- hashes annotation text, a quote, a paragraph number, a date, a case title, a
-- CNR or a party name for its meaning. Two identical annotations under two
-- different keys are two intentional writes, and merging them would silently
-- drop an advocate's second note.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE ROW ONLY EVER EXISTS COMPLETE — THE LOST-RESPONSE BUG, CLOSED
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The failure being fixed: a request arrives, the domain row commits, the
-- response is lost in transit, the client retries, and a second durable row
-- appears. The naive fix — commit the domain write, then best-effort record the
-- key — recreates the same bug one crash-window earlier.
--
-- So the domain mutation and the completed idempotency result commit in ONE
-- transaction. There is no `in_progress` state persisted anywhere, because
-- there is no second transaction for a crash to land between. Measured against
-- this cluster before the table was written:
--
--   * `INSERT ... ON CONFLICT DO NOTHING` BLOCKS on a concurrent uncommitted
--     duplicate (observed 645 ms wait), then returns zero rows, and the
--     winner's committed row is immediately visible to the loser. That is the
--     database-selected executor the contract asks for — no application-level
--     read-then-insert race.
--   * When the executor's transaction ROLLS BACK instead, the waiter's insert
--     SUCCEEDS (observed). A crashed executor therefore leaves no claim behind
--     and the retry simply becomes the executor. This is why no time-to-live,
--     no reaper and no stale-claim sweep exists here — none is needed, and
--     inventing a silent TTL is forbidden while the retention policy is
--     undecided (`IDEMPOTENCY_RETENTION_POLICY = UNDECIDED_REQUIRES_NEW3`).
--   * `SET LOCAL lock_timeout` converts that wait into SQLSTATE 55P03, which is
--     how a follower that cannot wait within its budget answers
--     `409 IDEMPOTENCY_IN_PROGRESS` with `Retry-After: 1` instead of hanging.
--
-- The deferred constraint trigger below makes "a committed record is a complete
-- record" a DATABASE invariant rather than a property of one code path. A
-- future writer that inserts the claim and forgets to fill in the result fails
-- at COMMIT, which is exactly when the domain write it was supposed to be
-- coupled to would otherwise have become durable on its own.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY IT LIVES BESIDE users AND NOT BESIDE judgments
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Gate C requires corpus rollback WITHOUT user/matter rollback. This table has
-- exactly one foreign key, to `users`, and none to `judgments`, `judgment_*`,
-- `statutes` or any other canonical legal-data table. The judgment id in
-- `POST /judgments/:id/annotations` reaches this table only inside the opaque
-- fingerprint hash and inside the replayed response body — never as a reference
-- a corpus restore could break. Restoring or rolling back the corpus therefore
-- cannot invalidate a single row here, and rolling this table back cannot touch
-- a byte of legal data.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IS STORED, AND THE ONE DUPLICATION THAT IS UNAVOIDABLE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Key identity, an opaque fingerprint, the outcome, the replayable result, one
-- timestamp. Nothing else. The request body is NOT stored — only its SHA-256 —
-- so a matter's client name, an annotation's quote and a correction note never
-- land here on the request side.
--
-- `response_body` is the exception and it is required, not convenient: R16 §4
-- says a replay returns "the original success HTTP status and success body,
-- including the original resource id and mutation timestamp". A pointer cannot
-- satisfy that without re-deriving six different read paths, and a re-derived
-- body is not the original body. Because that copy can contain the advocate's
-- own words, the row is deleted with them: `services/api/src/auth/erasure.ts`
-- deletes by `user_id` and `erasure-fixture.test.ts` asserts the outcome GONE.

CREATE TABLE api_idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The PRINCIPAL, not the access token, refresh token, device or session:
  -- token refresh stays inside one scope. `users.id`, the profile — every one
  -- of the six routes resolves its caller to a profile id before writing.
  user_id uuid NOT NULL REFERENCES users (id),

  -- Uppercase, as sent. Part of the scope so that a future PUT and POST on one
  -- path cannot collide on a key.
  method text NOT NULL,

  -- The canonical route TEMPLATE (`/matters/:id/events`), never the concrete
  -- path. Supplied explicitly by each mount site rather than read from the
  -- router, so "which scope is this" is answerable by reading `app.ts`.
  route text NOT NULL,

  -- Opaque, case-sensitive, 8-128 visible ASCII. Validated at the edge; a
  -- malformed key is rejected before any mutation and consumes nothing.
  idempotency_key text NOT NULL,

  -- SHA-256 over the canonical route parameters, the fully validated body and
  -- any operation-significant query values. Its job is to detect key REUSE,
  -- never to merge similar writes.
  request_fingerprint text NOT NULL,

  -- 'success' or 'refusal'. A deterministic business refusal after validation
  -- is recorded so the same request replays that refusal and a different
  -- fingerprint still conflicts — it is not a success and creates no resource.
  outcome text,

  response_status integer,
  response_body jsonb,

  -- When the coupled transaction completed. There is no separate "claimed at":
  -- a claim that never completed never became a row.
  completed_at timestamptz,

  CONSTRAINT api_idempotency_records_outcome_check
    CHECK (outcome IN ('success', 'refusal')),
  CONSTRAINT api_idempotency_records_status_check
    CHECK (response_status BETWEEN 100 AND 599)
);

-- The uniqueness boundary the contract requires to be in the database. It is
-- what selects the executor under concurrency; nothing in application code
-- decides it.
CREATE UNIQUE INDEX api_idempotency_records_scope_key_unique
  ON api_idempotency_records (user_id, method, route, idempotency_key);

-- THE ROW IS RE-READ BY ID, AND `NEW` IS DELIBERATELY NOT TRUSTED.
--
-- A deferred AFTER-INSERT row trigger fires at COMMIT carrying the tuple AS IT
-- WAS AT INSERT TIME, not as it is at commit. Measured here before this was
-- written: one transaction that inserts `done = NULL` and then updates it to
-- 'yes' fires the deferred trigger twice, and the first firing reports
-- `NEW.done = NULL` while `SELECT done FROM t WHERE id = NEW.id` in the same
-- firing reports 'yes'.
--
-- That is exactly the executor's shape — insert the claim, do the domain write,
-- fill in the result — so a guard written against `NEW` rejects every correct
-- transaction and permits nothing extra. It is a self-inflicted outage wearing
-- an invariant's clothes, and it is why this reads the live row.
--
-- The `EXISTS` half matters too: a row inserted and then deleted inside one
-- transaction has committed nothing, and must not be complained about.
CREATE FUNCTION api_idempotency_record_is_complete() RETURNS trigger AS $trg$
DECLARE
  live api_idempotency_records%ROWTYPE;
BEGIN
  SELECT * INTO live FROM api_idempotency_records WHERE id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF live.outcome IS NULL
     OR live.response_status IS NULL
     OR live.response_body IS NULL
     OR live.completed_at IS NULL THEN
    RAISE EXCEPTION
      'api_idempotency_records % committed without a completed result: the domain mutation and the idempotency result must commit together',
      NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$trg$ LANGUAGE plpgsql;

-- DEFERRABLE INITIALLY DEFERRED on purpose: the executor legitimately inserts
-- the claim first (that insert is what blocks its rivals) and fills the result
-- in once its own domain write has succeeded. The check therefore has to run at
-- COMMIT, not at statement time.
CREATE CONSTRAINT TRIGGER api_idempotency_records_complete_at_commit
  AFTER INSERT OR UPDATE ON api_idempotency_records
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION api_idempotency_record_is_complete();
