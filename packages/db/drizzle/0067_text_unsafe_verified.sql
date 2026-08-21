-- ───────────────────────────────────────────────────────────────────────────
-- TEXT_UNSAFE_VERIFIED — positively proven damage becomes a QUERYABLE state
-- ───────────────────────────────────────────────────────────────────────────
--
-- NEW1 measured the ARTEFACT rather than the population (bus 0936): of the
-- 542,980 vectors actually written into `new1_doc_vector_stage`, **50,108 —
-- 9.23% — are over text a person cannot read.** Punjab and Haryana 56.0%,
-- Karnataka 49.7%, computed over the same span that was embedded. NEW2 reached
-- 8.9% corpus-wide by a different method on a different population (bus
-- 0910/0915), and the three headline court figures agree within two points.
--
-- `axis_b_text` admits every one of them, because `text_quality >= 0.85` is
-- satisfied — NEW2 measured the median of known-unreadable rows at **1.000**.
-- The column certifies garbage.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHAT THIS MIGRATION DOES, AND THE MUCH LARGER THING IT REFUSES TO DO
-- ───────────────────────────────────────────────────────────────────────────
--
-- It adds ONE column, `text_safety`, and changes no predicate. Every existing
-- column is byte-identical to the deployed 0066 definition
-- (`5efa4c8decef699ebdfd30cfa67f87998f73a4d3cc083548c430a5e7f2bbee7e`).
--
--     UNKNOWN           `script_quality IS NULL` — 18,640,353 rows, 99.7%.
--                       **Still admitted, deliberately.** Nothing has looked at
--                       these; absence of evidence is not evidence of damage,
--                       and excluding them would discard most of the corpus on
--                       a screen that never ran.
--
--     SCREENED_OK       something with a second extraction or the PDF's own
--                       font dictionary in hand ruled the text faithful.
--
--     UNSAFE_VERIFIED   a screen POSITIVELY PROVED the text is not usable
--                       language. This is the founder's `TEXT_UNSAFE_VERIFIED`.
--
--     SCREENED_OTHER    a stored value neither list recognises. It is refused by
--                       `axis_b_text` — the allow-list has always been
--                       fail-closed and stays that way — but it is NOT called
--                       UNSAFE_VERIFIED, because "we do not recognise this
--                       label" and "we proved this document is damaged" are
--                       different facts and only one of them is evidence.
--
-- **The exclusion is not new and needs no predicate change.** `axis_b_text` has
-- always been an allow-list: `script_quality IS NULL OR IN ('clean',
-- 'mixed_script_ok')`. Any stored damage verdict already refuses the row. What
-- was missing was not a rule but a WRITER — 99.7% of the corpus has no verdict
-- at all — and a NAME, so a consumer can tell "excluded because proven damaged"
-- from "excluded because `text_quality` was low", which the four axis booleans
-- cannot distinguish.
--
-- ───────────────────────────────────────────────────────────────────────────
-- THE EVIDENCE VALUE AND THE CONTRACT STATE ARE DELIBERATELY DIFFERENT WORDS
-- ───────────────────────────────────────────────────────────────────────────
--
-- `script_quality` stores WHAT WAS PROVEN — `legacy_font_ascii`,
-- `devanagari_deleted`, `damaged_other` — paired with `script_quality_method`,
-- which names the screen that ruled. The pair is the evidence: `damaged_other`
-- + `english_density_screen_v1` is "no Devanagari at all AND English
-- function-word density below the measured floor of 12 per thousand", which is
-- a different finding from `damaged_other` + anything else and groups
-- separately in every query. **No new vocabulary value was added**: doing so
-- meant an ALTER TABLE on an 18.7M-row table that four live writers never let
-- go quiet, and the pair already carries what a new value would have said.
-- `text_safety` states the CONSEQUENCE for semantic use. One row of evidence can
-- outlive three revisions of what the product does about it, and a schema that
-- writes the consequence into the evidence column cannot revise the second
-- without destroying the first. Same discipline as `verification_state` versus
-- `overruled_status`.
--
-- The density verdict is written ONLY by `text-safety-screen-cli.ts`, only where
-- `script_quality IS NULL`, and only when `quality-state.ts` — NEW2's module,
-- imported rather than reimplemented, so there is exactly one definition of the
-- floor — returns `OCR_CANDIDATE`. It never overwrites a stored verdict.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHAT IS NOT CLAIMED
-- ───────────────────────────────────────────────────────────────────────────
--
-- `UNSAFE_VERIFIED` is not `deleted`. The document, its text and any vectors
-- already staged over it are kept. 76.9% of the suspects declare fonts with no
-- `/ToUnicode` map, so re-extraction cannot recover them — but OCR can, and a
-- repaired document must be able to walk back into the corpus by clearing one
-- column. Quarantine, never delete.
--
-- `UNKNOWN` is not `SCREENED_OK`. Nothing in this migration lets an unscreened
-- document be reported as verified-good.
--
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE VIEW judgment_embedding_eligibility AS
SELECT
  id,
  court,
  judgment_date,
  content_hash,
  hc_document_class,
  hc_class_method,
  script_quality,
  text_quality,
  length(full_text) AS text_length,

  ((content_hash IS NOT NULL)
    AND (case_number IS NOT NULL)
    AND (judgment_date IS NOT NULL)
    AND (court IS NOT NULL)
    AND (length(COALESCE(case_title, ''::text)) > 3)) AS axis_a_identity,

  -- UNCHANGED from 0066, character for character. The allow-list already
  -- refuses every damage verdict; this migration supplies the writer and the
  -- name, not a new rule.
  ((full_text IS NOT NULL)
    AND (COALESCE(text_quality, (0)::numeric) >= 0.85)
    AND ((script_quality IS NULL)
      OR (script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text])))) AS axis_b_text,

  ((hc_document_class IS NULL)
    OR (hc_document_class <> ALL (ARRAY[
      'procedural_disposal'::text,
      'reference_stub'::text,
      'decided_brief'::text]))) AS axis_c_role,

  (NOT (hc_document_class IS DISTINCT FROM 'bail_order'::text)) AS is_bail_order,

  -- NEW. Three honest states and a fail-closed fourth. Never inferred from the
  -- absence of a verdict.
  CASE
    WHEN script_quality IS NULL THEN 'UNKNOWN'::text
    WHEN script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text])
      THEN 'SCREENED_OK'::text
    WHEN script_quality = ANY (ARRAY[
      'legacy_font_ascii'::text,
      'devanagari_deleted'::text,
      'damaged_other'::text]) THEN 'UNSAFE_VERIFIED'::text
    ELSE 'SCREENED_OTHER'::text
  END AS text_safety,

  CASE
    WHEN (length(full_text) >= 8000) THEN 'substantial'::text
    WHEN (length(full_text) >= 4000) THEN 'full'::text
    WHEN (length(full_text) >= 2000) THEN 'standard'::text
    WHEN (length(full_text) >= 1000) THEN 'brief'::text
    ELSE 'stub'::text
  END AS value_band,

  CASE
    WHEN NOT (
      ((content_hash IS NOT NULL) AND (case_number IS NOT NULL)
        AND (judgment_date IS NOT NULL) AND (court IS NOT NULL)
        AND (length(COALESCE(case_title, ''::text)) > 3))
      AND ((full_text IS NOT NULL) AND (COALESCE(text_quality, (0)::numeric) >= 0.85)
        AND ((script_quality IS NULL)
          OR (script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text]))))
      AND (length(full_text) >= 2000)
    ) THEN 'NOT_ELIGIBLE'::text

    WHEN hc_document_class = 'bail_order'::text THEN 'BAIL_ORDER_REACHABLE'::text

    WHEN hc_document_class = ANY (ARRAY[
      'decided_brief'::text, 'procedural_disposal'::text, 'reference_stub'::text])
      THEN 'UNRESOLVED_EXPERIMENTAL'::text

    WHEN hc_document_class = 'decided'::text
      AND script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text])
      THEN 'VERIFIED_SEMANTIC_CORE'::text

    ELSE 'BROAD_SEARCHABLE'::text
  END AS semantic_tier

FROM judgments j;

COMMENT ON VIEW judgment_embedding_eligibility IS
  'Semantic eligibility: four axes, text_safety, value_band and semantic_tier. '
  'text_safety added 21 Aug 2026 after NEW1 found 50,108 of 542,980 staged '
  'vectors were over text nobody can read (bus 0936) and text_quality scored '
  'them at a median of 1.000. UNSAFE_VERIFIED requires a POSITIVE finding; '
  'UNKNOWN is 99.7% of the corpus and is still admitted, because absence of '
  'evidence is not evidence of damage. No predicate changed here: the '
  'axis_b_text allow-list already refused every damage verdict, what was '
  'missing was a writer for it. VERIFIED_SEMANTIC_CORE remains near-empty and '
  'that is the honest state.';
