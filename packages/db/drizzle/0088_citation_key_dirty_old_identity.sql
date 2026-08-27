-- 0088 — DIRTY WORK MUST REMEMBER THE OLD CITATION, NOT ONLY THE ROW
--
-- Owner: LCC (server/DB/release). Round: R8.3 §10 LCC-3.
-- Closes: FIFTH bus 1354, the inverse of the mutation 0087 closed.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT 0087 GOT RIGHT, AND THE HALF IT COULD NOT SEE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 0087 records WHICH JUDGMENT the citation index does not reflect, and the
-- resolver canonicalises that judgment's citations in JS to decide which keys to
-- stop calling UNIQUE. Deliberately: putting the canonicalisation in a trigger
-- would be a third definition of citation identity, and two is already one too
-- many.
--
-- That works whenever the mutation ADDS a claim. It cannot work when the
-- mutation REMOVES one, and FIFTH proved it on the real path:
--
--     target                    8f101d4e-2b37-439b-9618-26871b72e677
--     old citation              1950 INSC 1          before: UNIQUE
--     UPDATE neutral_citation   9999 INSC 999999
--     dirty row                 CITATION_MUTATED     <- the trigger fired
--     current old-key claimants 0
--     old key-table candidates  1                    <- the index still has it
--     after                     UNIQUE  heldCandidates=1
--
-- The trigger did its job. The READ could not: `dirtyKeysBlockingUnique()` joins
-- the judgment and canonicalises the citations it has NOW, and the old citation
-- is no longer among them. So the stale materialised key in
-- `judgment_citation_keys` is never implicated, and the resolver hands back a
-- confident UNIQUE for a citation that judgment no longer claims.
--
-- The asymmetry is the point: an ADDED claim is still on the row and can be
-- re-derived; a REMOVED claim exists nowhere except in the index that is wrong.
-- If the trigger does not remember it at the moment it disappears, nothing can.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SO THE TRIGGER STORES THE CITATION TEXTS, AND STILL NOT THE KEYS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `citation_texts` is the union of the citation strings seen on both sides of
-- the mutation — `OLD` and `NEW` — as the source wrote them. Raw text, never a
-- canonical key. The resolver canonicalises them with the same `keyOf` it
-- already passes to `collidingKeysInUnwalkedWindow`, so there is still exactly
-- ONE definition of citation identity in the resolution path and this migration
-- adds no second one.
--
-- A DELETE trigger is added for the same reason. Removing a judgment leaves its
-- key rows behind until the builder walks again, and a keyset walk over
-- `created_at` never revisits a row that is gone. Deletes are rare, so this is a
-- per-row trigger and costs nothing on any hot path.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- AND THE OVER-CAP CASE FAILS CLOSED, WHICH IT DID NOT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- FIFTH's second finding in the same message: the read was `LIMIT 50000` with no
-- ORDER BY. Above the cap the resolver was reasoning over an arbitrary subset
-- and still answering UNIQUE — a silent partial check, which is worse than no
-- check because it looks like one. That is fixed in
-- `citation-key-dirty.ts` rather than here: over the cap, EVERY key in the batch
-- is blocked. The count is exact and cheap, so the decision to fail closed is
-- made on a number that is never itself truncated.

SET LOCAL lock_timeout = '5s';

-- Nullable: rows written by 0087 have no texts and stay valid. The read treats
-- a NULL as "no remembered text", which is exactly the 0087 behaviour, so the
-- migration cannot make an existing dirty row less blocking than it was.
ALTER TABLE citation_key_dirty
  ADD COLUMN IF NOT EXISTS citation_texts text[];

CREATE OR REPLACE FUNCTION citation_key_dirty_on_insert() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO citation_key_dirty (judgment_id, reason, citation_texts)
  SELECT n.id,
         'INSERT_AT_OR_BELOW_CURSOR',
         array_remove(
           array_cat(ARRAY[n.neutral_citation], coalesce(n.reporter_citations, '{}')),
           NULL)
    FROM newrows n
   WHERE (n.neutral_citation IS NOT NULL
          OR coalesce(array_length(n.reporter_citations, 1), 0) > 0)
     AND n.created_at <= (SELECT f.cursor_at FROM citation_key_frontier f LIMIT 1)
  ON CONFLICT (judgment_id) DO UPDATE
    SET reason = excluded.reason,
        noticed_at = now(),
        -- UNION, never replace. A judgment mutated twice before the builder
        -- catches up must block every key it has ever claimed in that window.
        citation_texts = (
          SELECT array_agg(DISTINCT t)
            FROM unnest(coalesce(citation_key_dirty.citation_texts, '{}') ||
                        coalesce(excluded.citation_texts, '{}')) AS t);
  RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION citation_key_dirty_on_update() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.neutral_citation   IS DISTINCT FROM OLD.neutral_citation
     OR NEW.reporter_citations IS DISTINCT FROM OLD.reporter_citations
     OR NEW.created_at         IS DISTINCT FROM OLD.created_at THEN
    INSERT INTO citation_key_dirty (judgment_id, reason, citation_texts)
    VALUES (
      NEW.id,
      'CITATION_MUTATED',
      -- BOTH sides. The OLD half is the whole point of this migration: after the
      -- statement commits it exists nowhere but here and in the stale index.
      (SELECT array_agg(DISTINCT t) FROM unnest(array_remove(
          ARRAY[OLD.neutral_citation, NEW.neutral_citation] ||
          coalesce(OLD.reporter_citations, '{}') ||
          coalesce(NEW.reporter_citations, '{}'), NULL)) AS t))
    ON CONFLICT (judgment_id) DO UPDATE
      SET reason = excluded.reason,
          noticed_at = now(),
          citation_texts = (
            SELECT array_agg(DISTINCT t)
              FROM unnest(coalesce(citation_key_dirty.citation_texts, '{}') ||
                          coalesce(excluded.citation_texts, '{}')) AS t);
  END IF;
  RETURN NULL;
END $fn$;

-- A deleted judgment's key rows survive it. The keyset walk orders by
-- `created_at` and can never revisit a row that no longer exists, so without
-- this the index keeps answering for an authority the corpus has dropped.
CREATE OR REPLACE FUNCTION citation_key_dirty_on_delete() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF OLD.neutral_citation IS NOT NULL
     OR coalesce(array_length(OLD.reporter_citations, 1), 0) > 0 THEN
    INSERT INTO citation_key_dirty (judgment_id, reason, citation_texts)
    VALUES (
      OLD.id,
      'JUDGMENT_DELETED',
      array_remove(
        ARRAY[OLD.neutral_citation] || coalesce(OLD.reporter_citations, '{}'),
        NULL))
    ON CONFLICT (judgment_id) DO UPDATE
      SET reason = excluded.reason,
          noticed_at = now(),
          citation_texts = (
            SELECT array_agg(DISTINCT t)
              FROM unnest(coalesce(citation_key_dirty.citation_texts, '{}') ||
                          coalesce(excluded.citation_texts, '{}')) AS t);
  END IF;
  RETURN NULL;
END $fn$;

ALTER TABLE citation_key_dirty
  DROP CONSTRAINT IF EXISTS citation_key_dirty_reason_known;
ALTER TABLE citation_key_dirty
  ADD CONSTRAINT citation_key_dirty_reason_known
  CHECK (reason IN ('INSERT_AT_OR_BELOW_CURSOR', 'CITATION_MUTATED',
                    'JUDGMENT_DELETED', 'MANUAL'));

DROP TRIGGER IF EXISTS judgments_citation_key_dirty_del ON judgments;
CREATE TRIGGER judgments_citation_key_dirty_del
  AFTER DELETE ON judgments
  FOR EACH ROW EXECUTE FUNCTION citation_key_dirty_on_delete();
