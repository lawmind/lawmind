-- ─────────────────────────────────────────────────────────────────────────────
-- FACTORY SCHEMA 0001 — VECTOR SNAPSHOT IDENTITY  (REPRO_DEBT_1)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHY THIS IS A FACTORY SCHEMA AND NOT A PRODUCT MIGRATION
--
-- `new1_doc_vector_stage` is FACTORY SCRATCH, established from the tree and
-- recorded in `services/api/src/ops/release-export-cli.ts` and bus 1546: no
-- CREATE TABLE migration exists, it is absent from the Drizzle schema, and no
-- serving code reads it — every reader is in `services/harness`. Roadmap v7.1
-- §7 excludes dense vectors from the remote serving plane, and
-- `vectorExportRefusal()` already refuses to export it.
--
-- Putting it in `packages/db/drizzle` would therefore create a vector(1024)
-- staging table on the production serving plane that the product does not read
-- and the export contract refuses. So it gets a COMMITTED schema — reproducible
-- from HEAD, idempotent, fresh-install proven — that is applied to the factory
-- database only, by `packages/db/factory/apply.mjs`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE DEFECT THIS CLOSES, MEASURED 30 AUGUST 2026
-- ─────────────────────────────────────────────────────────────────────────────
--
--   snapshot_hash | text | NULLABLE | DEFAULT '5b5d02384b46c96c'::text
--
--   3,074,721 rows   2,587,766 stamped '5b5d02384b46c96c'   486,955 NULL
--
-- The label came ENTIRELY from the schema. `doc-vector-embed.mjs` — the live
-- writer — named `snapshot_hash` zero times. So on the day the definition moves,
-- the writer keeps stamping the OLD generation's hash and nothing errors: two
-- snapshots wearing one label, in a table that looks perfectly consistent, and
-- an HNSW index built over a population that is not the one it claims.
--
-- A constant default is not an identity. What replaces it is a REGISTRY of
-- immutable generations with at most one ACTIVE, and triggers that refuse every
-- write which cannot say — truthfully — which generation produced it.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IS DELIBERATELY NOT DONE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The 486,955 NULL rows are NOT rewritten. They are NEW1's pre-identity v1
-- generation; a mass UPDATE of half a million rows under a live GPU writer buys
-- neatness and costs bloat. They are instead NAMED — `UNIDENTIFIED_LEGACY_V1`,
-- registered and SEALED — so the residual class is named rather than silent, and
-- frozen by the UPDATE trigger so nothing can ever relabel them.

-- Transaction is opened by packages/db/factory/apply.mjs, which wraps this file
-- together with any bootstrap generation registration in ONE transaction: the
-- binding trigger refuses every write while no generation is ACTIVE, so the
-- schema and its first ACTIVE row must land or fail together.

-- ── the registry ────────────────────────────────────────────────────────────
-- One row per embedding generation. Rows are immutable except ACTIVE -> SEALED.

CREATE TABLE IF NOT EXISTS embedding_snapshot (
  snapshot_hash       text PRIMARY KEY,
  generation          text        NOT NULL,
  definition_version  text        NOT NULL,
  manifest_sha256     text,
  model_identity      text        NOT NULL,
  recipe              text        NOT NULL,
  dimensions          integer     NOT NULL,
  metric              text        NOT NULL,
  state               text        NOT NULL,
  -- Exactly one row may stand for rows that carry SQL NULL. See the header.
  represents_sql_null boolean     NOT NULL DEFAULT false,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  sealed_at           timestamptz,
  CONSTRAINT embedding_snapshot_state_known
    CHECK (state IN ('ACTIVE', 'SEALED')),
  CONSTRAINT embedding_snapshot_sealed_at_matches_state
    CHECK ((state = 'SEALED') = (sealed_at IS NOT NULL))
);

-- At most one ACTIVE generation. This is the whole safety property: "which
-- generation is being produced right now" has exactly one answer, or writes stop.
CREATE UNIQUE INDEX IF NOT EXISTS embedding_snapshot_one_active
  ON embedding_snapshot ((true)) WHERE state = 'ACTIVE';

-- At most one row may represent SQL NULL.
CREATE UNIQUE INDEX IF NOT EXISTS embedding_snapshot_one_null_proxy
  ON embedding_snapshot ((true)) WHERE represents_sql_null;

-- ── rollout policy ──────────────────────────────────────────────────────────
-- A single row. `require_explicit_writer_identity` is the difference between
-- "the registry resolves an omitted identity" and "an omitted identity is a hard
-- error". A FRESH install starts strict, because a fresh install has no writer
-- that predates the column. A live box may spend one batch boundary at false
-- while the writers are updated, and `apply.mjs --strict` closes it.

CREATE TABLE IF NOT EXISTS embedding_snapshot_policy (
  id                               boolean PRIMARY KEY DEFAULT true,
  require_explicit_writer_identity boolean NOT NULL,
  note                             text,
  updated_at                       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT embedding_snapshot_policy_single_row CHECK (id)
);

INSERT INTO embedding_snapshot_policy (id, require_explicit_writer_identity, note)
VALUES (true, true, 'fresh install: strict from the first write')
ON CONFLICT (id) DO NOTHING;

-- ── registry immutability ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION embedding_snapshot_immutable() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'embedding_snapshot is append-only: refusing DELETE of %', OLD.snapshot_hash
      USING ERRCODE = 'check_violation',
            HINT = 'A generation that produced vectors cannot be un-named. Seal it instead.';
  END IF;

  IF NEW.snapshot_hash       IS DISTINCT FROM OLD.snapshot_hash
  OR NEW.generation          IS DISTINCT FROM OLD.generation
  OR NEW.definition_version  IS DISTINCT FROM OLD.definition_version
  OR NEW.manifest_sha256     IS DISTINCT FROM OLD.manifest_sha256
  OR NEW.model_identity      IS DISTINCT FROM OLD.model_identity
  OR NEW.recipe              IS DISTINCT FROM OLD.recipe
  OR NEW.dimensions          IS DISTINCT FROM OLD.dimensions
  OR NEW.metric              IS DISTINCT FROM OLD.metric
  OR NEW.represents_sql_null IS DISTINCT FROM OLD.represents_sql_null
  OR NEW.created_at          IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'embedding_snapshot % is immutable; only state may change (ACTIVE -> SEALED)', OLD.snapshot_hash
      USING ERRCODE = 'check_violation',
            HINT = 'Register a NEW generation rather than editing an existing one. Relabelling is the failure this table exists to prevent.';
  END IF;

  IF OLD.state = 'SEALED' AND NEW.state = 'ACTIVE' THEN
    RAISE EXCEPTION 'snapshot % is SEALED and cannot be reactivated', OLD.snapshot_hash
      USING ERRCODE = 'check_violation',
            HINT = 'Reopening a sealed generation would let later vectors join a population that was already measured and indexed.';
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS embedding_snapshot_immutable_trg ON embedding_snapshot;
CREATE TRIGGER embedding_snapshot_immutable_trg
  BEFORE UPDATE OR DELETE ON embedding_snapshot
  FOR EACH ROW EXECUTE FUNCTION embedding_snapshot_immutable();

-- ── the stage table ─────────────────────────────────────────────────────────
-- `IF NOT EXISTS` because the live table already holds 3M rows. The column list
-- is the one `doc-vector-embed.mjs` creates, plus the identity column it never
-- declared — so a fresh clone and the live box converge on the same shape.

CREATE TABLE IF NOT EXISTS new1_doc_vector_stage (
  judgment_id    uuid PRIMARY KEY,
  content_hash   text,
  court          text,
  year           int,
  member_count   int,
  text_chars     int,
  embedded_chars int,
  tokens         int,
  recipe         text         NOT NULL,
  model          text         NOT NULL,
  embedding      vector(1024) NOT NULL,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  snapshot_hash  text
);

ALTER TABLE new1_doc_vector_stage ADD COLUMN IF NOT EXISTS snapshot_hash text;

-- THE CONSTANT DEFAULT DIES HERE. Identity now comes from the registry or from
-- the writer, never from the schema.
ALTER TABLE new1_doc_vector_stage ALTER COLUMN snapshot_hash DROP DEFAULT;

-- The quarantine table lost identity entirely — it has no snapshot_hash column,
-- so every one of its 72,099 rows would restore into the stage wearing whatever
-- generation happened to be current. Same defect, opposite direction.
CREATE TABLE IF NOT EXISTS new1_doc_vector_stage_refused (
  judgment_id    uuid PRIMARY KEY,
  content_hash   text,
  court          text,
  year           int,
  member_count   int,
  text_chars     int,
  embedded_chars int,
  tokens         int,
  recipe         text         NOT NULL,
  model          text         NOT NULL,
  embedding      vector(1024) NOT NULL,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  refused_class  text,
  quarantined_at timestamptz  NOT NULL DEFAULT now(),
  snapshot_hash  text
);

ALTER TABLE new1_doc_vector_stage_refused ADD COLUMN IF NOT EXISTS snapshot_hash text;
ALTER TABLE new1_doc_vector_stage_refused ALTER COLUMN snapshot_hash DROP DEFAULT;

-- ── the binding trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION new1_doc_vector_stage_bind_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  reg          embedding_snapshot%ROWTYPE;
  strict_mode  boolean;
  active_count integer;
BEGIN
  IF NEW.snapshot_hash IS NULL THEN
    SELECT require_explicit_writer_identity INTO strict_mode FROM embedding_snapshot_policy WHERE id;
    IF strict_mode IS NULL OR strict_mode THEN
      RAISE EXCEPTION 'no snapshot identity supplied for judgment_id %', NEW.judgment_id
        USING ERRCODE = 'not_null_violation',
              DETAIL  = 'snapshot_hash was omitted. It used to be filled by a constant column DEFAULT, which labelled every future generation as the first one; that default has been removed.',
              HINT    = 'The writer must bind the generation it is producing (doc-vector-embed.mjs supplies RECONCILED_VIEW_HASH). Register it in embedding_snapshot first.';
    END IF;

    SELECT count(*) INTO active_count FROM embedding_snapshot WHERE state = 'ACTIVE';
    IF active_count <> 1 THEN
      RAISE EXCEPTION 'cannot resolve a snapshot identity: % ACTIVE generations are registered', active_count
        USING ERRCODE = 'check_violation',
              HINT    = 'Exactly one generation may be ACTIVE. Seal the old one and register the new one in a single transaction.';
    END IF;
    SELECT snapshot_hash INTO NEW.snapshot_hash FROM embedding_snapshot WHERE state = 'ACTIVE';
  END IF;

  SELECT * INTO reg FROM embedding_snapshot WHERE snapshot_hash = NEW.snapshot_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown snapshot identity % for judgment_id %', NEW.snapshot_hash, NEW.judgment_id
      USING ERRCODE = 'foreign_key_violation',
            DETAIL  = 'An unregistered identity cannot be reproduced: nothing records which model, recipe or manifest produced it.',
            HINT    = 'INSERT the generation into embedding_snapshot before writing vectors under it.';
  END IF;

  IF reg.state <> 'ACTIVE' THEN
    RAISE EXCEPTION 'snapshot % is % — refusing to add rows to a generation that is not the active one', NEW.snapshot_hash, reg.state
      USING ERRCODE = 'check_violation',
            DETAIL  = 'This is the A-stamped-as-B guard: a writer still carrying a previous generation hash is refused rather than silently mixing two populations.',
            HINT    = 'Update the writer to the active generation. Reactivating a sealed one is not available by design.';
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS new1_doc_vector_stage_bind_snapshot_trg ON new1_doc_vector_stage;
CREATE TRIGGER new1_doc_vector_stage_bind_snapshot_trg
  BEFORE INSERT ON new1_doc_vector_stage
  FOR EACH ROW EXECUTE FUNCTION new1_doc_vector_stage_bind_snapshot();

-- ── the freeze trigger ──────────────────────────────────────────────────────
-- An existing row's generation is a historical fact. Nothing may edit it — not
-- a backfill, not a repair script, not a future me at 3am.

CREATE OR REPLACE FUNCTION new1_doc_vector_stage_freeze_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash THEN
    RAISE EXCEPTION 'refusing to relabel judgment_id % from % to %',
      OLD.judgment_id, coalesce(OLD.snapshot_hash, 'NULL'), coalesce(NEW.snapshot_hash, 'NULL')
      USING ERRCODE = 'check_violation',
            DETAIL  = 'Which generation produced a vector is a fact about the past.',
            HINT    = 'Delete and re-embed under the active generation if the vector must move.';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS new1_doc_vector_stage_freeze_snapshot_trg ON new1_doc_vector_stage;
CREATE TRIGGER new1_doc_vector_stage_freeze_snapshot_trg
  BEFORE UPDATE ON new1_doc_vector_stage
  FOR EACH ROW EXECUTE FUNCTION new1_doc_vector_stage_freeze_snapshot();

-- ── the named residual class ────────────────────────────────────────────────
-- NULL is not an unnamed class any more. It is this row.

INSERT INTO embedding_snapshot
  (snapshot_hash, generation, definition_version, manifest_sha256, model_identity,
   recipe, dimensions, metric, state, represents_sql_null, note, sealed_at)
VALUES
  ('UNIDENTIFIED_LEGACY_V1', 'legacy-v1', 'UNKNOWN', NULL, 'UNKNOWN',
   'UNKNOWN', 1024, 'cosine', 'SEALED', true,
   'Rows written before identity binding existed. They carry SQL NULL and are excluded from every named snapshot population. Deliberately not backfilled: a mass UPDATE of half a million rows under a live GPU writer buys neatness and costs bloat.',
   now())
ON CONFLICT (snapshot_hash) DO NOTHING;

-- ── reading the population ──────────────────────────────────────────────────

CREATE OR REPLACE VIEW new1_doc_vector_stage_identity AS
SELECT s.judgment_id,
       s.snapshot_hash,
       coalesce(s.snapshot_hash, 'UNIDENTIFIED_LEGACY_V1') AS resolved_snapshot_hash,
       (s.snapshot_hash IS NULL)                           AS identity_is_legacy_null
  FROM new1_doc_vector_stage s;

-- The HNSW population predicate, generated from a NAMED IMMUTABLE identity and
-- from nothing else. It refuses an identity the registry does not hold, so an
-- index can never be built over a population whose provenance is unrecorded.
CREATE OR REPLACE FUNCTION snapshot_index_predicate(p_snapshot text) RETURNS text
LANGUAGE plpgsql STABLE AS $fn$
DECLARE reg embedding_snapshot%ROWTYPE;
BEGIN
  SELECT * INTO reg FROM embedding_snapshot WHERE snapshot_hash = p_snapshot;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown snapshot identity %: refusing to generate an index predicate for an unregistered population', p_snapshot
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF reg.represents_sql_null THEN
    RETURN 'snapshot_hash IS NULL';
  END IF;
  RETURN format('snapshot_hash = %L', reg.snapshot_hash);
END $fn$;
