-- ───────────────────────────────────────────────────────────────────────────
-- TEXT_SAFETY_GRADE — a density is a density, and the column said VERIFIED
-- ───────────────────────────────────────────────────────────────────────────
--
-- NEW2 ran both detectors over the same 1,500 uniform draws (bus 0980):
--
--     both fire                                    99
--     NEW2 only — the density screen MISSES        32   P&H 27 · Bombay 5
--     LCC only  — NEW2 will not convict            11   Rajasthan 4 · Chhattisgarh 2 · …
--     neither                                   1,358
--
-- **43 of 142 disagree.** The 32 misses are glyph dumps that are 28–63% C0
-- control characters, and the English-density screen reads them as fine because
-- *the digital-signature appliance's footer is real English and lifts the rate
-- above the floor*. The 11 fire the density screen alone; NEW2 sampled them,
-- believes they are genuine damage, and still will not call them VERIFIED —
-- because a density is the same class of evidence that convicted twelve
-- perfectly readable Kerala writ petitions on an earlier screen.
--
-- `0067` mapped `damaged_other` straight to `text_safety = 'UNSAFE_VERIFIED'`.
-- **That word overclaims for a screen verdict**, and NEW2's ask was exact: *"a
-- definite column value written from a density screen should say which screen
-- made it… the fix may be nothing more than `text_safety` distinguishing
-- SCREENED from VERIFIED rather than collapsing them."*
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHY A NEW COLUMN AND NOT A NEW VALUE — the reason is a live consumer
-- ───────────────────────────────────────────────────────────────────────────
--
-- Renaming `UNSAFE_VERIFIED` would have been the tidier fix and it would have
-- broken something live. NEW1 has **64,083 vectors already quarantined** on the
-- predicate `text_safety = 'UNSAFE_VERIFIED'` (bus 0991), read from this view
-- rather than from a copy of anyone's threshold — which is exactly what we asked
-- them to do. Changing the value under them would not raise an error. It would
-- silently stop matching, the quarantine would stop advancing, and the GPU would
-- go back to embedding glyph dumps with every dashboard still green.
--
-- So `text_safety` keeps its values and its meaning — **this text is not safe
-- for semantic use** — which is true of both grades and is the question the
-- exclusion actually asks. `text_safety_grade` answers the second question:
-- HOW WELL PROVEN.
--
--     NONE     the document is not in an unsafe state at all
--     SCREEN   a text screen convicted it. Enough to refuse a GPU batch;
--              NOT enough to tell a person their document is corrupt
--     PROOF    the byte stream or the PDF's own font dictionary convicted it
--
-- ───────────────────────────────────────────────────────────────────────────
-- `PROOF` IS CURRENTLY UNREACHABLE, AND THAT IS THE HONEST STATE
-- ───────────────────────────────────────────────────────────────────────────
--
-- No writer produces a proof-grade verdict INTO THIS COLUMN today. NEW2's
-- `text-damage.ts` convicts on `controlDensity`, `longestControlRun` and
-- `longLetterRunShare` and emits **JSONL** — 1,380,635 rows over 14,981,000
-- walked as of tonight — not a column value. So every unsafe row grades `SCREEN`
-- and the column has one value across the whole corpus.
--
-- A check that returns the same answer for every input is normally worthless,
-- and this one is a deliberate exception: it is the SHAPE that has to exist
-- before the distinction can be made, and it becomes load-bearing the moment
-- NEW2's method string appears in `PROOF_METHODS` — one line, no consumer
-- change. Recording it as "currently uniform" beats leaving two incomparable
-- kinds of evidence collapsed into a word that flatters one of them.
--
-- The method allow-list is explicit rather than a default, so an unrecognised
-- writer grades `SCREEN` and never accidentally inherits `PROOF`.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHAT DOES NOT CHANGE
-- ───────────────────────────────────────────────────────────────────────────
--
-- No predicate. `axis_b_text` still refuses every non-null verdict, both grades,
-- exactly as it has since `0056`. A screen-grade suspicion is more than enough
-- reason not to spend GPU time; it is only not enough to tell a person their
-- document is corrupt. `semantic_tier` is untouched, `is_cited_authority` is
-- untouched, and `text_safety` returns the same value for every row it did
-- yesterday.
--
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE VIEW judgment_embedding_eligibility AS
SELECT
  j.id,
  j.court,
  j.judgment_date,
  j.content_hash,
  j.hc_document_class,
  j.hc_class_method,
  j.script_quality,
  j.text_quality,
  length(j.full_text) AS text_length,

  ((j.content_hash IS NOT NULL)
    AND (j.case_number IS NOT NULL)
    AND (j.judgment_date IS NOT NULL)
    AND (j.court IS NOT NULL)
    AND (length(COALESCE(j.case_title, ''::text)) > 3)) AS axis_a_identity,

  ((j.full_text IS NOT NULL)
    AND (COALESCE(j.text_quality, (0)::numeric) >= 0.85)
    AND ((j.script_quality IS NULL)
      OR (j.script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text])))) AS axis_b_text,

  ((j.hc_document_class IS NULL)
    OR (j.hc_document_class <> ALL (ARRAY[
      'procedural_disposal'::text,
      'reference_stub'::text,
      'decided_brief'::text]))) AS axis_c_role,

  (NOT (j.hc_document_class IS DISTINCT FROM 'bail_order'::text)) AS is_bail_order,

  CASE
    WHEN (length(j.full_text) >= 8000) THEN 'substantial'::text
    WHEN (length(j.full_text) >= 4000) THEN 'full'::text
    WHEN (length(j.full_text) >= 2000) THEN 'standard'::text
    WHEN (length(j.full_text) >= 1000) THEN 'brief'::text
    ELSE 'stub'::text
  END AS value_band,

  CASE
    WHEN NOT (
      ((j.content_hash IS NOT NULL) AND (j.case_number IS NOT NULL)
        AND (j.judgment_date IS NOT NULL) AND (j.court IS NOT NULL)
        AND (length(COALESCE(j.case_title, ''::text)) > 3))
      AND ((j.full_text IS NOT NULL) AND (COALESCE(j.text_quality, (0)::numeric) >= 0.85)
        AND ((j.script_quality IS NULL)
          OR (j.script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text]))))
    ) THEN 'NOT_ELIGIBLE'::text

    WHEN length(j.full_text) < 2000
      THEN CASE WHEN ca.judgment_id IS NOT NULL
                THEN 'CITED_AUTHORITY_REACHABLE'::text
                ELSE 'NOT_ELIGIBLE'::text END

    WHEN NOT j.hc_document_class IS DISTINCT FROM 'bail_order'::text
      THEN 'BAIL_ORDER_REACHABLE'::text

    WHEN j.hc_document_class = ANY (ARRAY[
      'decided_brief'::text, 'procedural_disposal'::text, 'reference_stub'::text])
      THEN CASE WHEN ca.judgment_id IS NOT NULL
                THEN 'CITED_AUTHORITY_REACHABLE'::text
                ELSE 'UNRESOLVED_EXPERIMENTAL'::text END

    WHEN j.hc_document_class = 'decided'::text
      AND j.script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text])
      THEN 'VERIFIED_SEMANTIC_CORE'::text

    ELSE 'BROAD_SEARCHABLE'::text
  END AS semantic_tier,

  -- UNCHANGED. NEW1's quarantine predicate reads this and 64,083 vectors depend
  -- on it returning what it returned yesterday.
  CASE
    WHEN j.script_quality IS NULL THEN 'UNKNOWN'::text
    WHEN j.script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text])
      THEN 'SCREENED_OK'::text
    WHEN j.script_quality = ANY (ARRAY[
      'legacy_font_ascii'::text,
      'devanagari_deleted'::text,
      'damaged_other'::text]) THEN 'UNSAFE_VERIFIED'::text
    ELSE 'SCREENED_OTHER'::text
  END AS text_safety,

  (ca.judgment_id IS NOT NULL) AS is_cited_authority,

  -- APPENDED, like every column added to this view since 0067. `CREATE OR
  -- REPLACE VIEW` matches columns to the original BY POSITION.
  CASE
    WHEN j.script_quality IS NULL
      OR j.script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text])
      THEN 'NONE'::text
    -- The allow-list is explicit and currently EMPTY of proof methods. An
    -- unrecognised writer grades SCREEN and can never inherit PROOF by default.
    WHEN j.script_quality_method = ANY (ARRAY[]::text[]) THEN 'PROOF'::text
    ELSE 'SCREEN'::text
  END AS text_safety_grade

FROM judgments j
LEFT JOIN cited_authority ca ON ca.judgment_id = j.id;

COMMENT ON VIEW judgment_embedding_eligibility IS
  'Semantic eligibility: four axes, text_safety + text_safety_grade, '
  'is_cited_authority, value_band and semantic_tier. text_safety_grade added '
  '21 Aug 2026 after NEW2 ran both detectors over 1,500 uniform draws and they '
  'disagreed on 43 of 142: the English-density screen MISSES 32 glyph dumps whose '
  'digital-signature footer lifts the English rate above the floor, and fires on '
  '11 that byte-stream evidence will not convict. So a density verdict is SCREEN '
  'grade, not PROOF. text_safety keeps its values because NEW1 has 64,083 vectors '
  'quarantined on UNSAFE_VERIFIED and a renamed value would silently stop '
  'matching rather than error. No predicate changed: axis_b_text refuses both '
  'grades, as it has since 0056. PROOF is currently unreachable and that is the '
  'honest state -- NEW2 emits JSONL, not a column value.';
