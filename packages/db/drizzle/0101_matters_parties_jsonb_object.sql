-- 0101 — matters.parties IS AN OBJECT, AND THE ROWS THAT ARE NOT MUST SAY SO
--
-- Owner: LCC. NEW3 bus 1706, ledger CCR-NEW3-R18-01.
--
-- `matters/route.ts` bound `${JSON.stringify(body.parties)}::jsonb`. postgres.js
-- JSON-encodes a JS string parameter bound into a jsonb slot, so what landed in
-- the column was a jsonb STRING SCALAR holding the JSON text — `jsonb_typeof`
-- reads `string`, not `object`. Isolated, not inferred:
--
--   JSON.stringify(obj)::jsonb  ->  jsonb_typeof = string
--   sql.json(obj)               ->  jsonb_typeof = object
--
-- The writer is fixed in the same change. This is the other half, and it is not
-- optional: a code-only fix leaves every matter created before it permanently
-- broken and two shapes coexisting in one column — which is exactly how a client
-- comes to need a defensive JSON.parse forever. RCC has been told not to add
-- one, and this migration is what makes that instruction survivable.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY IT FAILS CLOSED RATHER THAN REPAIRING WHAT IT CAN
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `parties` is the advocate's own case identity. A row whose inner text does not
-- parse, or parses to something that is not an object, is a row we do not
-- understand — and the three obvious "helpful" moves are all worse than
-- stopping: dropping it deletes the identity, `{}` replaces it with a lie that
-- reads as an empty case, and guessing a `description` invents party names into
-- a legal matter. So an unconvertible row aborts the whole migration and NAMES
-- the ids, and a human decides. Nothing is repaired around it: the RAISE rolls
-- back the conversions performed earlier in this block along with everything
-- else, so the column is never left half-migrated.
--
-- Scope is exactly `jsonb_typeof(parties) = 'string'`. An object row is not
-- touched (it is already correct), and a number, boolean, array or jsonb `null`
-- is NOT silently rewritten either — it is reported as unconvertible, because a
-- scalar that is not our writer's output is a fact about the row we did not
-- have. `parties` is NOT NULL (0000, `matters`), and `jsonb_typeof(NULL)` is
-- SQL NULL, so a NULL could not match the filter even if the constraint were
-- dropped tomorrow.
--
-- Re-running is a no-op: after a successful run no row satisfies the filter, so
-- the loop does not execute and nothing is written. Forward-only, per
-- DEPLOYMENT.md §Migrations — this never edits an applied migration.
--
-- Fresh install: the filter selects nothing on an empty `matters` and the block
-- completes silently. It touches no canonical legal-data table — `matters` is
-- USER data, and `judgments`, `citations` and the corpus are not read here.

DO $$
DECLARE
  r           RECORD;
  parsed      jsonb;
  unconvertible uuid[] := '{}';
  converted   integer  := 0;
BEGIN
  FOR r IN SELECT id, parties FROM matters WHERE jsonb_typeof(parties) = 'string' LOOP
    -- `#>> '{}'` unwraps a jsonb string scalar to its raw text. The cast is what
    -- can fail, so it is caught per row: one unparseable row must be REPORTED,
    -- not allowed to abort with a bare `invalid input syntax` naming nothing.
    BEGIN
      parsed := (r.parties #>> '{}')::jsonb;
    EXCEPTION WHEN others THEN
      parsed := NULL;
    END;

    IF parsed IS NULL OR jsonb_typeof(parsed) <> 'object' THEN
      unconvertible := unconvertible || r.id;
    ELSE
      -- Semantically exact: the inner document, unchanged. No key is added,
      -- renamed or defaulted — this migration re-types a value, it does not
      -- interpret one.
      UPDATE matters SET parties = parsed WHERE id = r.id;
      converted := converted + 1;
    END IF;
  END LOOP;

  IF array_length(unconvertible, 1) > 0 THEN
    RAISE EXCEPTION
      'matters.parties: % row(s) hold a jsonb string scalar that is not a JSON object and cannot be converted deterministically. ids: %. Nothing was changed. Inspect each row and decide by hand; this migration will not guess a party name.',
      array_length(unconvertible, 1), array_to_string(unconvertible, ', ');
  END IF;

  RAISE NOTICE 'matters.parties: % string-scalar row(s) converted to jsonb object', converted;
END $$;
