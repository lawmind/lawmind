-- Document deduplication — `docs/ai/CANONICAL_IDENTITY.md`,
-- `docs/ai/DEDUPLICATION.md`. Stage 3 of the DATA -> RETRIEVAL EXECUTION
-- PROGRAM, and the exact gap `docs/ai/tasks/003-corpus-inventory.md` deferred:
-- "resolving [the 937 content_hash duplicate groups] changes what `judgments`
-- rows exist and needs its own task."
--
-- ─────────────────────────────────────────────────────────────────────────────
-- A GROUP TABLE, NOT A PAIRWISE EDGE TABLE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The largest exact-duplicate group already found (task 003, Gujarat 1993,
-- one judgment disposing of 327 tagged-along matters) has 124 members. A
-- pairwise table would need C(124,2) = 7,626 rows to say what one group row
-- says. Groups also match how the data actually arises: content_hash IS the
-- group key for the content_hash method, and a future MinHash/LSH pass
-- produces candidate clusters, not isolated pairs.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NEVER DESTROYS PROVENANCE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- No column here can delete or merge a `judgments` row. `judgment_id`'s only
-- foreign-key action is CASCADE on the MEMBERSHIP row if a judgment is ever
-- removed — never the reverse. Each member keeps its own cnr, case_number and
-- source_url exactly as ingested; this table only says which rows share text.

CREATE TYPE document_duplicate_relationship AS ENUM ('exact_duplicate', 'near_duplicate', 'unknown');
CREATE TYPE document_duplicate_method AS ENUM ('content_hash', 'minhash_lsh', 'manual');

CREATE TABLE IF NOT EXISTS document_duplicate_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship  document_duplicate_relationship NOT NULL,
  method        document_duplicate_method NOT NULL,
  -- The value the method grouped on -- the shared content_hash for the
  -- content_hash method. Opaque for other methods; never re-derived from it.
  group_key     text NOT NULL,
  -- Denormalised at write time, not a live COUNT(*) -- an inserted count, so
  -- "how big are duplicate groups" does not need a join+count on every read.
  member_count  integer NOT NULL,
  evidence      text,
  detected_at   timestamptz NOT NULL DEFAULT now()
);

-- Idempotent re-runs: the same method finding the same key updates one row,
-- never inserts a second group for text already grouped.
CREATE UNIQUE INDEX IF NOT EXISTS document_duplicate_groups_method_key_idx
  ON document_duplicate_groups (method, group_key);

CREATE TABLE IF NOT EXISTS document_duplicate_members (
  group_id     uuid NOT NULL REFERENCES document_duplicate_groups(id) ON DELETE CASCADE,
  judgment_id  uuid NOT NULL REFERENCES judgments(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, judgment_id)
);

CREATE INDEX IF NOT EXISTS document_duplicate_members_judgment_idx
  ON document_duplicate_members (judgment_id);
