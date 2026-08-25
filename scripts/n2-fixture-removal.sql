-- NEW2 — R8.1 §7.1 / §8.8 synthetic fixture removal, BY EXACT ID.
--
-- Owner of execution: LCC (§8.8 owns DB-side cascade correctness).
-- Author: NEW2. Generated from docs/ai/new2-r8/fixture-manifest.json,
-- state PROVEN, two independent safe predicates agreeing on the same 16 rows.
--
-- ============================ READ THIS FIRST ============================
-- This script does NOT use a court-name predicate, and must never be edited
-- into one. `case_title LIKE 'SYNTHETIC%'` matches EIGHT REAL JUDGMENTS,
-- including Synthetics & Chemicals Ltd. v. State of U.P., 1989 INSC 321 —
-- a Constitution Bench authority. The sixteen IDs below are the manifest.
--
-- It opens a transaction and ends with ROLLBACK. To execute for real, change
-- the final ROLLBACK to COMMIT deliberately, having read the pre/post counts.
--
-- OPEN DECISION FOR LCC — citation_checks. Five audit rows in
-- `citation_checks` reference these fixtures with judgment_id_matched
-- NO ACTION, so the delete WILL FAIL until they are handled. All five are
-- test traffic from 25 Aug 07:45–13:56 (surface = judgment_detail,
-- verification_state = verified, verified_by_source = corpus,
-- shown_to_user = true). NEW2 does not choose between:
--   (A) delete the five audit rows   — chosen below, as they record test
--       traffic rather than advocate traffic;
--   (B) NULL judgment_id_matched     — creates the FIRST nulls that column
--       has ever held (0 of 14,029 rows are null today) and asserts
--       "matched nothing", which is false;
--   (C) retain the fixtures, excluded at every surface instead.
-- Section 3 implements (A). Replace it if LCC decides otherwise.
-- =========================================================================

BEGIN;

-- ---------------------------------------------------------------- 0. Frame
CREATE TEMP TABLE n2_fixture_ids (id uuid PRIMARY KEY) ON COMMIT DROP;

INSERT INTO n2_fixture_ids (id) VALUES
  ('6fd21632-11bb-4aec-be28-3de62befb65f'),  -- SYNTHETIC — Assembly Fixture
  ('d4ca2129-d6f8-44c6-b9f9-b8a913bad0b8'),  -- SYNTHETIC — Authorities Fixture
  ('194290da-dcb2-4d0f-bd78-e51880a522fd'),  -- SYNTHETIC — Replacement Fixture
  ('00d958ce-6d32-4599-8516-5a6cc0379bc3'),  -- SYNTHETIC — Set Aside Fixture
  ('d990e6a7-209a-4e1f-b1d1-c46792b05ea6'),  -- SYNTHETIC — Still Good Law For Now
  ('7d75f737-4834-4f8d-9ea5-c0f5ba3f6d03'),  -- SYNTHETIC — Reporter Citation Only
  ('9ba4769c-2e15-41f7-9dab-1e329579ef62'),  -- SYNTHETIC — Authorities Fixture
  ('bb39ea0b-d154-41c8-85c9-2393f306f0b0'),  -- SYNTHETIC — Replacement Fixture
  ('1c8cd748-35f4-4055-b3eb-6bc79f107611'),  -- SYNTHETIC — Set Aside Fixture
  ('44f68fce-8774-4ae6-9d0c-28c1ec6dbcce'),  -- SYNTHETIC — Still Good Law For Now
  ('3292c5dd-2c99-4ccf-9667-8d97b9373b88'),  -- SYNTHETIC — Reporter Citation Only
  ('c90239ff-7b82-4d07-8e77-f45a04b15a90'),  -- SYNTHETIC — Authorities Fixture
  ('83e59641-eff9-4b35-b76a-09bc4645c77e'),  -- SYNTHETIC — Replacement Fixture
  ('70a6ecbc-49f0-42a3-850b-1c00815977f0'),  -- SYNTHETIC — Set Aside Fixture
  ('2293139d-198c-4486-a4e1-ca66388b274b'),  -- SYNTHETIC — Still Good Law For Now
  ('54626473-6e3b-48e4-a30f-facbc2c75982');  -- SYNTHETIC — Reporter Citation Only

-- ------------------------------------------------- 1. Refuse a wrong frame
-- Every id must still carry all four synthetic markers AT EXECUTION TIME.
-- If the corpus moved under this manifest, stop rather than delete.
DO $$
DECLARE
  n_ids       int;
  n_matching  int;
BEGIN
  SELECT count(*) INTO n_ids FROM n2_fixture_ids;

  SELECT count(*) INTO n_matching
  FROM judgments j
  JOIN n2_fixture_ids f ON f.id = j.id
  WHERE j.court = 'Test Court'
    AND j.source_url LIKE 'test://%'
    AND j.case_title LIKE 'SYNTHETIC %'
    AND j.content_hash IS NULL;

  IF n_ids <> 16 THEN
    RAISE EXCEPTION 'manifest is not 16 ids (got %) — refusing', n_ids;
  END IF;

  IF n_matching <> n_ids THEN
    RAISE EXCEPTION
      'MANIFEST_DRIFT: % of % ids no longer carry all four synthetic markers — refusing to delete',
      n_matching, n_ids;
  END IF;

  RAISE NOTICE 'frame check PASS: % ids, all four markers intact', n_ids;
END $$;

-- Refuse if any advocate-owned row depends on a fixture. Zero today; if that
-- ever changes, a real matter is pointing at a fake authority and THAT is the
-- incident, not this cleanup.
DO $$
DECLARE n int;
BEGIN
  SELECT
    (SELECT count(*) FROM matter_authorities   WHERE judgment_id = ANY (SELECT id FROM n2_fixture_ids))
  + (SELECT count(*) FROM judgment_annotations WHERE judgment_id = ANY (SELECT id FROM n2_fixture_ids))
  + (SELECT count(*) FROM alerts               WHERE judgment_id = ANY (SELECT id FROM n2_fixture_ids))
  INTO n;

  IF n <> 0 THEN
    RAISE EXCEPTION 'USER_DATA_DEPENDS_ON_FIXTURE: % rows across matter_authorities/judgment_annotations/alerts — refusing', n;
  END IF;

  RAISE NOTICE 'user-data check PASS: 0 advocate-owned dependents';
END $$;

-- ------------------------------------------------------- 2. Rollback record
-- Written BEFORE any delete, outside the fixture's own lifetime, so the
-- removal is reversible from evidence rather than from memory.
CREATE TABLE IF NOT EXISTS n2_fixture_removal_rollback (
  removed_at   timestamptz NOT NULL DEFAULT now(),
  table_name   text        NOT NULL,
  row_json     jsonb       NOT NULL
);

INSERT INTO n2_fixture_removal_rollback (table_name, row_json)
SELECT 'judgments', to_jsonb(j) - 'full_text_tsv'
FROM judgments j WHERE j.id IN (SELECT id FROM n2_fixture_ids);

INSERT INTO n2_fixture_removal_rollback (table_name, row_json)
SELECT 'judgment_citations', to_jsonb(c)
FROM judgment_citations c
WHERE c.citing_judgment_id IN (SELECT id FROM n2_fixture_ids)
   OR c.cited_judgment_id  IN (SELECT id FROM n2_fixture_ids);

INSERT INTO n2_fixture_removal_rollback (table_name, row_json)
SELECT 'judgment_citation_keys', to_jsonb(k)
FROM judgment_citation_keys k
WHERE k.judgment_id IN (SELECT id FROM n2_fixture_ids);

INSERT INTO n2_fixture_removal_rollback (table_name, row_json)
SELECT 'citation_checks', to_jsonb(cc)
FROM citation_checks cc
WHERE cc.judgment_id_matched IN (SELECT id FROM n2_fixture_ids);

-- -------------------------------------- 3. Clear the two blocking NO ACTION
-- 3a. judgments.overruled_by_judgment_id — all 6 pointers are fixture->fixture
--     and entirely inside the manifest. No real judgment is marked overruled
--     by a fixture. Verified before nulling.
DO $$
DECLARE n_outside int;
BEGIN
  SELECT count(*) INTO n_outside
  FROM judgments j
  WHERE j.overruled_by_judgment_id IN (SELECT id FROM n2_fixture_ids)
    AND j.id NOT IN (SELECT id FROM n2_fixture_ids);

  IF n_outside <> 0 THEN
    RAISE EXCEPTION
      'REAL_JUDGMENT_OVERRULED_BY_FIXTURE: % rows outside the manifest point at a fixture — escalate, do not null',
      n_outside;
  END IF;
  RAISE NOTICE 'overruled_by check PASS: all pointers are fixture-internal';
END $$;

UPDATE judgments
   SET overruled_by_judgment_id = NULL
 WHERE overruled_by_judgment_id IN (SELECT id FROM n2_fixture_ids);

-- 3b. citation_checks — option (A). Five rows of test traffic, retained in
--     n2_fixture_removal_rollback above before deletion.
DELETE FROM citation_checks
 WHERE judgment_id_matched IN (SELECT id FROM n2_fixture_ids);

-- ---------------------------------------------------- 4. Delete the sixteen
-- CASCADE handles judgment_citations, judgment_citation_keys,
-- judgment_chunks, judgment_paragraphs, judgment_statute_refs,
-- judgment_judges, judgment_annotations, judgment_citation_aliases,
-- document_enrichments, document_duplicate_members, hc_class_candidate.
-- SET NULL handles judgment_citations.cited_judgment_id, external_citations,
-- citation_concordance_resolutions.
DELETE FROM judgments WHERE id IN (SELECT id FROM n2_fixture_ids);

-- ------------------------------------------------------------- 5. Prove zero
DO $$
DECLARE
  n_court int; n_url int; n_title int; n_checks int; n_overruled int;
BEGIN
  SELECT count(*) INTO n_court     FROM judgments WHERE court = 'Test Court';
  SELECT count(*) INTO n_url       FROM judgments WHERE source_url LIKE 'test://%';
  SELECT count(*) INTO n_title     FROM judgments WHERE case_title LIKE 'SYNTHETIC — %';
  SELECT count(*) INTO n_checks    FROM citation_checks cc
    WHERE cc.judgment_id_matched IN (SELECT id FROM n2_fixture_ids);
  SELECT count(*) INTO n_overruled FROM judgments
    WHERE overruled_by_judgment_id IN (SELECT id FROM n2_fixture_ids);

  RAISE NOTICE 'POST: court=Test Court %, source_url test:// %, title SYNTHETIC-em-dash %, orphan checks %, orphan overruled_by %',
    n_court, n_url, n_title, n_checks, n_overruled;

  IF n_court <> 0 OR n_url <> 0 OR n_title <> 0 OR n_checks <> 0 OR n_overruled <> 0 THEN
    RAISE EXCEPTION 'REMOVAL_INCOMPLETE — refusing to leave a partial state';
  END IF;
END $$;

-- ============================== 6. Commit gate ==============================
-- Change to COMMIT deliberately, after reading the NOTICE output above.
ROLLBACK;
