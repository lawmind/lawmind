-- `text_safety_grade = 'PROOF'` COULD NEVER FIRE.
--
-- NEW1 found it (bus 1079) building their eligibility sampling frame against
-- the deployed view. `0070` shipped the branch as:
--
--     WHEN j.script_quality_method = ANY (ARRAY[]::text[]) THEN 'PROOF'
--
-- `x = ANY (empty array)` is FALSE for every x, so the branch is dead and every
-- damaged document falls through to `ELSE 'SCREEN'`. It produces no error
-- anywhere, which is why it survived: the fallback is a legitimate value.
--
-- The empty array was not a mistake at the time. `0070`'s own comment says the
-- allow-list is "explicit and currently EMPTY of proof methods", written the day
-- NEW2's proof-grade writer did not yet exist. It exists now:
-- `text-damage-persist-cli` writes `script_quality_method = 'text-damage-v2.0'`,
-- and the job registry records its purpose in as many words -- *"makes
-- text_safety_grade='PROOF' reachable"*. It was not.
--
-- NEW1 measured the cost with `TABLESAMPLE SYSTEM (0.2) REPEATABLE (5)`:
--
--     text_safety_grade   sampled rows        script_quality_method   sampled
--     NONE                      33,783        english_density_screen_v1  2,560
--     SCREEN                     3,614        text-damage-v2.0             939
--     PROOF                          0        text_marker_screen_v1        115
--
-- ~470,000 documents (939 x 500, an order of magnitude, not an exact count)
-- carry proof-grade damage evidence that the view reports as a screen.
--
-- WHY THAT MATTERS BEYOND TIDINESS. `PROOF` and `SCREEN` are the difference
-- between "this document is PROVEN damaged" and "a cheap screen suspects it".
-- NEW2's §8 NEW2-3 is exactly that distinction -- PROVEN_DAMAGED versus
-- SCREENED_NO_DAMAGE_FOUND -- and a grade that can only ever say SCREEN
-- collapses the two on the way out of the database.
--
-- ONE MEMBER, NAMED, NOT A PATTERN. `text-damage-v2.0` is the only writer whose
-- evidence is byte-stream proof: NEW2 ran both detectors over 1,500 uniform
-- draws and they disagreed on 43 of 142, with the English-density screen missing
-- 32 glyph dumps whose signature footer lifts the English rate. A density
-- verdict is a screen. A `LIKE 'text-damage-%'` predicate would silently promote
-- a future v3 whose evidence nobody has examined, so the list stays explicit and
-- an unrecognised writer still grades SCREEN.
--
-- NOTHING ELSE CHANGES, AND THE BODY BELOW IS THE LIVE DEFINITION VERBATIM.
--
-- The first attempt at this migration rewrote the view from 0070's text and
-- PostgreSQL refused it with 42P16. That refusal was correct and it saved ten
-- columns: 0070 defined 8, the deployed view has 18, because every migration
-- since has APPENDED to it. Rewriting from the old file would have silently
-- dropped axis_a_identity, axis_b_text, axis_c_role, value_band, semantic_tier
-- and the rest.
--
-- So this body is `pg_get_viewdef` of the live view with ONE substring changed:
-- the empty allow-list. Nothing else in it was typed by hand.
--
-- THE CONTRACT HASH, and the one I got wrong first time. The number every lane
-- reconciles against is
--
--     substr(encode(sha256(pg_get_viewdef('judgment_embedding_eligibility', true)::bytea), 'hex'), 1, 16)
--
--     before  2e7b53afe35fa81c
--     after   5b5d02384b46c96c
--
-- I published `47b2a3d6717bf134` on the bus (1095/1096). That is an MD5 prefix
-- of the NON-pretty `pg_get_viewdef`, i.e. the wrong hash function AND the wrong
-- arguments -- a number nothing reconciles against, so anything trusting it
-- would refuse forever and look like a corpus fault. NEW1 caught it (bus 1106)
-- and proved the diff the right way round: revert this one substring in the
-- LIVE definition and the hash returns to 2e7b53afe35fa81c byte for byte, which
-- is independent evidence that this migration changed nothing else.

CREATE OR REPLACE VIEW judgment_embedding_eligibility AS
SELECT j.id,
    j.court,
    j.judgment_date,
    j.content_hash,
    j.hc_document_class,
    j.hc_class_method,
    j.script_quality,
    j.text_quality,
    length(j.full_text) AS text_length,
    j.content_hash IS NOT NULL AND j.case_number IS NOT NULL AND j.judgment_date IS NOT NULL AND j.court IS NOT NULL AND length(COALESCE(j.case_title, ''::text)) > 3 AS axis_a_identity,
    j.full_text IS NOT NULL AND COALESCE(j.text_quality, 0::numeric) >= 0.85 AND (j.script_quality IS NULL OR (j.script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text]))) AS axis_b_text,
    j.hc_document_class IS NULL OR (j.hc_document_class <> ALL (ARRAY['procedural_disposal'::text, 'reference_stub'::text, 'decided_brief'::text])) AS axis_c_role,
    NOT j.hc_document_class IS DISTINCT FROM 'bail_order'::text AS is_bail_order,
        CASE
            WHEN length(j.full_text) >= 8000 THEN 'substantial'::text
            WHEN length(j.full_text) >= 4000 THEN 'full'::text
            WHEN length(j.full_text) >= 2000 THEN 'standard'::text
            WHEN length(j.full_text) >= 1000 THEN 'brief'::text
            ELSE 'stub'::text
        END AS value_band,
        CASE
            WHEN NOT (j.content_hash IS NOT NULL AND j.case_number IS NOT NULL AND j.judgment_date IS NOT NULL AND j.court IS NOT NULL AND length(COALESCE(j.case_title, ''::text)) > 3 AND j.full_text IS NOT NULL AND COALESCE(j.text_quality, 0::numeric) >= 0.85 AND (j.script_quality IS NULL OR (j.script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text])))) THEN 'NOT_ELIGIBLE'::text
            WHEN length(j.full_text) < 2000 THEN
            CASE
                WHEN ca.judgment_id IS NOT NULL THEN 'CITED_AUTHORITY_REACHABLE'::text
                ELSE 'NOT_ELIGIBLE'::text
            END
            WHEN NOT j.hc_document_class IS DISTINCT FROM 'bail_order'::text THEN 'BAIL_ORDER_REACHABLE'::text
            WHEN j.hc_document_class = ANY (ARRAY['decided_brief'::text, 'procedural_disposal'::text, 'reference_stub'::text]) THEN
            CASE
                WHEN ca.judgment_id IS NOT NULL THEN 'CITED_AUTHORITY_REACHABLE'::text
                ELSE 'UNRESOLVED_EXPERIMENTAL'::text
            END
            WHEN j.hc_document_class = 'decided'::text AND (j.script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text])) THEN 'VERIFIED_SEMANTIC_CORE'::text
            ELSE 'BROAD_SEARCHABLE'::text
        END AS semantic_tier,
        CASE
            WHEN j.script_quality IS NULL THEN 'UNKNOWN'::text
            WHEN j.script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text]) THEN 'SCREENED_OK'::text
            WHEN j.script_quality = ANY (ARRAY['legacy_font_ascii'::text, 'devanagari_deleted'::text, 'damaged_other'::text]) THEN 'UNSAFE_VERIFIED'::text
            ELSE 'SCREENED_OTHER'::text
        END AS text_safety,
    ca.judgment_id IS NOT NULL AS is_cited_authority,
        CASE
            WHEN j.script_quality IS NULL OR (j.script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text])) THEN 'NONE'::text
            WHEN j.script_quality_method = ANY (ARRAY['text-damage-v2.0'::text]) THEN 'PROOF'::text
            ELSE 'SCREEN'::text
        END AS text_safety_grade
   FROM judgments j
     LEFT JOIN cited_authority ca ON ca.judgment_id = j.id;

COMMENT ON VIEW judgment_embedding_eligibility IS
  'Semantic eligibility. text_safety_grade PROOF became REACHABLE 24 Aug 2026 '
  '(0081): 0070 shipped its allow-list as ARRAY[]::text[], and x = ANY(empty) is '
  'false for every x, so the branch was dead and ~470,000 proof-graded documents '
  'read as SCREEN. NEW1 bus 1079 measured it. The list now names text-damage-v2.0 '
  'and nothing else. No other predicate changed and no column moved.';
