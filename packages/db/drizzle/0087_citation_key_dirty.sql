-- 0087 — DURABLE RESOLVER DIRTY-WORK IDENTITY
--
-- Owner: LCC (server/DB/release). Round: R8.3 §10 LCC-3.
-- Closes: FIFTH bus 1313, and the measured 899-judgment loss in
-- `docs/ai/new2-r7/CITATION_BATCH_GAP_RCA.md`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE HOLE A CREATION FRONTIER CANNOT SEE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `citation_key_frontier.cursor_at` is a keyset cursor over `judgments
-- (created_at, id)`. Everything the resolver's safety story rests on is phrased
-- against it: `MAX_LAG_ROWS` counts rows above it, and
-- `collidingKeysInUnwalkedWindow()` reads the rows above it and asks whether any
-- of them claims the key being resolved.
--
-- Both questions are about the region ABOVE the cursor. Neither can see a row
-- that arrives, or changes, BELOW it. FIFTH built exactly that shape on the real
-- `readKeyFreshness()` + `resolveBatch()` path on 26 Aug 2026:
--
--     a second judgment claiming an existing unique neutral citation,
--     created_at = citation_key_frontier.cursor_at - interval '1 day',
--     no materialized key row
--
--     before   UNIQUE
--     after    state CURRENT · lagRows 0 · judgmentsClaimingCitation 2
--              keyTableCandidates 1 · resolverState UNIQUE · because []
--
-- Two judgments claim that citation and the resolver says exactly one, with
-- every gate reporting healthy. Nothing here is a threshold that was set too
-- loosely: `lagRows` is 0 because the row is genuinely not above the cursor, and
-- `because` is empty because nothing was wrong with the index's PROGRESS.
--
-- This is not a hypothetical. The builder's own header records the same shape
-- happening by accident: `now()` is transaction START time, so a loader that
-- begins at 16:43:23.94 and commits 250 ms later writes rows stamped below a
-- cursor that has already passed. 899 judgments were never walked on 17 Aug
-- 2026, 293 of them carrying a real neutral citation, and nothing reported it —
-- a batch that produced no key rows is indistinguishable from a batch that had
-- no citations.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY DIRTY WORK RATHER THAN A WIDER THRESHOLD
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The instinct is to widen the lag bounds until the gate trips. It cannot work
-- and the arithmetic says why: `lagRows` for the falsifier is 0, and there is no
-- bound below zero. A threshold answers "how much damage might there be across
-- the whole corpus", which is the right question for an operator and the wrong
-- one for a single answer handed to an advocate. The advocate's citation does
-- not care that the other 24,999 unwalked rows are irrelevant to it.
--
-- Durable identity answers the advocate's question instead: WHICH judgments does
-- the index provably not reflect? A row here is a standing, restart-surviving
-- statement that one specific judgment's citation identity is not represented in
-- `judgment_citation_keys`. The resolver consults it per key, exactly as it
-- already consults the unwalked window, and refuses UNIQUE — never the candidate
-- — when it is implicated.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE ROW IS A JUDGMENT AND NOT A KEY
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Storing the citation KEY would need the canonicalisation in SQL. There is
-- already one such definition in `citation-keys-cli.ts` and one in
-- `query-shape.ts`; a third, in a trigger, and the resolver would be gated by a
-- notion of identity that no test compares against the one it resolves with.
-- Two definitions of citation identity is how a resolver and its index come to
-- disagree about the same citation.
--
-- So the trigger records WHICH JUDGMENT is unrepresented, and the resolver
-- canonicalises that judgment's citations in JS with the same `keyOf` it passes
-- to `collidingKeysInUnwalkedWindow`. One definition, two consumers.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE INSERT TRIGGER IS PER-STATEMENT AND THE UPDATE TRIGGER IS NOT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `judgments` took 9,423,960 rows in one day on 18 Aug. A per-ROW trigger on
-- that table is a per-row plpgsql call and a per-row read of the frontier, on
-- the hottest write path in the system. Per-STATEMENT triggers with transition
-- tables fire once per statement and do the whole decision as one set operation,
-- so a 5,000-row batch pays one frontier read instead of 5,000.
--
-- The INSERT trigger deliberately marks NOTHING for the ordinary case. A row
-- inserted with `created_at = now()` is above the cursor, which means the
-- existing creation frontier already sees it and the existing machinery already
-- covers it. Only a row landing at or below the live cursor — a backfill, or the
-- transaction-start-time race — is unreachable by the walk and gets marked. On a
-- healthy ingest this trigger writes zero rows.
--
-- The UPDATE trigger is per-ROW, and that is not an inconsistency. PostgreSQL
-- refuses transition tables on a trigger with a column list — `transition tables
-- cannot be specified for triggers with column lists`, observed on 18.6 while
-- applying this file — so the choice is between a statement trigger that fires
-- for EVERY update of `judgments` and a row trigger that fires only for updates
-- naming a citation column. The first would put transition tables on the
-- treatment propagator, the quality screens and the OCR recovery writers, none
-- of which touch citation identity; the second costs nothing at all on those
-- paths and a single INSERT on the rare path that does. `AFTER UPDATE OF` is
-- evaluated against the statement's SET list, so a bulk `UPDATE judgments SET
-- script_quality = ...` never enters this function.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CLEARING IS AN ACT, NOT A TIMEOUT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Nothing here expires. A dirty row is removed when the keys for that judgment
-- have actually been rebuilt — `citation-key-dirty.ts` does that in one
-- transaction with the rebuild, so the clear cannot outrun the work. An
-- age-based clear would be the same class of mistake as the threshold: it would
-- report the index current because time passed, not because anything was done.

-- `apply-migration-online.mjs` requires a lock_timeout on every migration. The
-- two CREATE TRIGGER statements below need ACCESS EXCLUSIVE on `judgments`, the
-- hottest write path in the system; without a timeout this DDL would wait in the
-- lock queue and block every writer queued behind it. 5s, then fail and retry.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS citation_key_dirty (
  -- One row per judgment. Re-marking an already-dirty judgment refreshes the
  -- reason and the timestamp rather than accumulating duplicates.
  judgment_id  uuid PRIMARY KEY,
  -- WHY it is unrepresented. Kept because the two causes want different
  -- operator responses: INSERT_AT_OR_BELOW_CURSOR is a walk that can never
  -- reach the row, CITATION_MUTATED is an index entry that is now wrong.
  reason       text NOT NULL,
  noticed_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT citation_key_dirty_reason_known
    CHECK (reason IN ('INSERT_AT_OR_BELOW_CURSOR', 'CITATION_MUTATED', 'MANUAL'))
);

-- The resolver's read is `WHERE judgment_id = ANY(...)` on the primary key and
-- an existence check. The operator's read is "how much is open, oldest first".
CREATE INDEX IF NOT EXISTS citation_key_dirty_noticed_idx
  ON citation_key_dirty (noticed_at);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION citation_key_dirty_on_insert() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  -- One read of the one-row frontier for the whole statement. When the builder
  -- has never published there is no cursor, so there is no below-cursor region
  -- and nothing is unreachable: the whole corpus is unwalked and
  -- `readKeyFreshness` already returns UNKNOWN, which fails closed on its own.
  INSERT INTO citation_key_dirty (judgment_id, reason)
  SELECT n.id, 'INSERT_AT_OR_BELOW_CURSOR'
    FROM newrows n
   WHERE (n.neutral_citation IS NOT NULL
          OR coalesce(array_length(n.reporter_citations, 1), 0) > 0)
     AND n.created_at <= (SELECT f.cursor_at FROM citation_key_frontier f LIMIT 1)
  ON CONFLICT (judgment_id) DO UPDATE
    SET reason = excluded.reason, noticed_at = now();
  RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION citation_key_dirty_on_update() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  -- `IS DISTINCT FROM` on every column: a NULL-to-value change is exactly the
  -- mutation that adds a claim to an existing key, and a bare `<>` would drop
  -- it. `created_at` is included because moving a row's timestamp below the
  -- cursor removes it from the walk just as surely as inserting it there.
  --
  -- The column list on the trigger says the statement MENTIONED one of these;
  -- this says its value actually MOVED. A no-op rewrite must not manufacture
  -- dirty work, or the resolver would refuse UNIQUE on the strength of an
  -- idempotent backfill.
  IF NEW.neutral_citation   IS DISTINCT FROM OLD.neutral_citation
     OR NEW.reporter_citations IS DISTINCT FROM OLD.reporter_citations
     OR NEW.created_at         IS DISTINCT FROM OLD.created_at THEN
    INSERT INTO citation_key_dirty (judgment_id, reason)
    VALUES (NEW.id, 'CITATION_MUTATED')
    ON CONFLICT (judgment_id) DO UPDATE
      SET reason = excluded.reason, noticed_at = now();
  END IF;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS judgments_citation_key_dirty_ins ON judgments;
CREATE TRIGGER judgments_citation_key_dirty_ins
  AFTER INSERT ON judgments
  REFERENCING NEW TABLE AS newrows
  FOR EACH STATEMENT EXECUTE FUNCTION citation_key_dirty_on_insert();

-- Scoped to the citation-bearing columns AND `created_at`, so the treatment
-- propagator, the quality screens and the OCR recovery writers — all of which
-- update `judgments` in bulk and none of which touch citation identity — never
-- reach this function at all.
DROP TRIGGER IF EXISTS judgments_citation_key_dirty_upd ON judgments;
CREATE TRIGGER judgments_citation_key_dirty_upd
  AFTER UPDATE OF neutral_citation, reporter_citations, created_at ON judgments
  FOR EACH ROW EXECUTE FUNCTION citation_key_dirty_on_update();
