-- 0102 — CROSS-ROLE FOREIGN KEYS BECOME SOFT CORPUS REFERENCES
--
-- Owner: LCC. Implements the database half of NEW3 R20's frozen Gate-C boundary
-- (bus 1723): `CROSS_DB_REFERENCE_MODEL = SOFT_CORPUS_REFERENCE`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A FOREIGN KEY CANNOT SURVIVE THE SPLIT, AND WHY THAT IS THE POINT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Gate C requires that a corpus rollback cannot roll back an advocate's matters.
-- The two roles therefore become two physically separate PostgreSQL databases,
-- and PostgreSQL has no cross-database referential integrity: a `REFERENCES`
-- clause is scoped to one database and there is no version of it that spans two.
--
-- The tempting repairs are both refused by R20 and by the round brief. A
-- `postgres_fdw` foreign table would make the constraint compile again and would
-- recreate the coupling the split exists to remove — worse, it would make remote
-- writes and a remote `TRUNCATE` reachable from the user database. And a shadow
-- `judgments` table in the user role would be a second copy of the corpus that
-- nothing keeps current.
--
-- So the reference becomes what it always semantically was: an opaque, immutable
-- judgment UUID, validated by the application on write and reconciled by report
-- rather than by cascade.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IS DELIBERATELY *NOT* CHANGED
-- ─────────────────────────────────────────────────────────────────────────────
--
-- **Not one row of user data is written, moved or marked.** R20: *"No
-- reconciliation or corpus rollback may delete, rewrite, remove, or mark removed
-- any user row."* This migration drops constraints. It touches no values.
--
-- **Every column keeps its type, its nullability and its index.** All ten
-- columns below were already indexed before this migration — verified from
-- `pg_index` at this HEAD, not assumed — so the soft reference is an INDEXED
-- soft reference from the moment the constraint goes, and no lookup gets slower.
-- PostgreSQL never creates an index for a foreign key, so none of these indexes
-- was a side effect of the constraint being there.
--
-- **`judgments` is untouched.** The corpus side of each relationship neither
-- knew nor cared about these children.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE ONE BEHAVIOUR THIS REMOVES ON PURPOSE: judgment_annotations' CASCADE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `judgment_annotations_judgment_fk` was `ON DELETE CASCADE`: deleting a judgment
-- deleted the advocate's notes on it. Under a single database that was a tidy
-- invariant. Under the release model R20 froze it is a data-loss bug waiting for
-- its first rollback, because a judgment absent from the newly activated corpus
-- generation is not a judgment that ceased to exist — it is a judgment this
-- release does not carry, and the next one may.
--
-- Dropping the constraint is therefore not a loosening. It is the removal of a
-- deletion path that R20 forbids.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SINGLE-DATABASE DEVELOPMENT IS UNAFFECTED
-- ─────────────────────────────────────────────────────────────────────────────
--
-- With `DB_SPLIT_MODE=single` the two roles resolve to one database and every
-- query in the API is unchanged. What is lost locally is the database's
-- enforcement of a reference the application now enforces itself — which is
-- exactly the property a split deployment has, so local development stops being
-- accidentally stricter than production. `services/api/src/judgments/hydrate.ts`
-- holds the application-side check.

BEGIN;

-- ── user -> judgments (eight; R20's named set, plus alerts) ────────────────
ALTER TABLE alerts               DROP CONSTRAINT IF EXISTS alerts_judgment_id_fkey;
ALTER TABLE citation_checks      DROP CONSTRAINT IF EXISTS citation_checks_judgment_id_matched_judgments_id_fk;
ALTER TABLE citation_copies      DROP CONSTRAINT IF EXISTS citation_copies_judgment_id_fkey;
ALTER TABLE citation_disputes    DROP CONSTRAINT IF EXISTS citation_disputes_judgment_id_fkey;
ALTER TABLE citation_fanouts     DROP CONSTRAINT IF EXISTS citation_fanouts_judgment_id_fkey;
ALTER TABLE judgment_annotations DROP CONSTRAINT IF EXISTS judgment_annotations_judgment_fk;
ALTER TABLE matter_authorities   DROP CONSTRAINT IF EXISTS matter_authorities_judgment_id_fkey;
ALTER TABLE verification_cache   DROP CONSTRAINT IF EXISTS verification_cache_judgment_id_judgments_id_fk;

-- ── user -> ecourts_observation (two) ──────────────────────────────────────
--
-- `ecourts_transition` records a change an advocate is monitoring on THEIR
-- matter, so it is user-owned; `ecourts_observation` is the raw grant-scope
-- harvest and carries no user reference, so it is corpus-owned. That the pair
-- crosses the boundary is not an accident of classification — it is the
-- monitoring feature reading corpus observations, which is exactly a soft
-- reference. Both tables hold zero rows today, so this costs nothing to do now
-- and would cost a backfill later.
ALTER TABLE ecourts_transition DROP CONSTRAINT IF EXISTS ecourts_transition_from_observation_id_fkey;
ALTER TABLE ecourts_transition DROP CONSTRAINT IF EXISTS ecourts_transition_to_observation_id_fkey;

COMMIT;
