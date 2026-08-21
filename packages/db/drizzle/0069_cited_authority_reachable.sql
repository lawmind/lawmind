-- ───────────────────────────────────────────────────────────────────────────
-- CITED_AUTHORITY_REACHABLE — the length floor yields to positive evidence
-- ───────────────────────────────────────────────────────────────────────────
--
-- Migration `0066` accepted a loss and wrote it down rather than pretending it
-- away: *"The 2,000-char floor deliberately does NOT move despite refusing a
-- larger 7.2% — the brief band is 4.3M rows and 91.5% of standard-band documents
-- cite nothing at all; that loss is accepted and recorded, not overlooked."*
--
-- That reasoning is still right, and it is a statement about a POPULATION. It
-- says nothing about a document a judge actually reached for.
--
-- ───────────────────────────────────────────────────────────────────────────
-- THE AUDIT, 21 AUG 2026 — every remaining refused gold authority, one by one
-- ───────────────────────────────────────────────────────────────────────────
--
-- NEW1's 228-authority citation-derived gold, run through the deployed contract
-- after `0066` made bail orders reachable. 16 still refused, and the binding
-- clause of each was read rather than tallied
-- (`docs/ai/lcc-reachability/p4-refused-gold-audit.json`):
--
--     12   LENGTH_UNDER_2000 alone        724c .. 1,897c, every one cited
--      3   ROLE + LENGTH_UNDER_2000       decided_brief / procedural class
--      1   TEXT                           text_quality 0.777 on a 10,639c
--                                         document — refused by the axis NEW2
--                                         has since proved invalid
--
-- **Twelve of sixteen are refused by length alone, and a judge cited every one
-- of them.**
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHAT THIS ADMITS, MEASURED CORPUS-WIDE BEFORE IT WAS WRITTEN
-- ───────────────────────────────────────────────────────────────────────────
--
--     distinct cited judgments                     35,890
--     identity- and text-sound                     35,834
--     newly named by this migration                 7,935
--       of which refused only by length             7,894
--       of which refused only by role class            41
--       under 1,000 characters                      2,424
--
-- **7,935 documents. 0.04% of the corpus.** The floor is not removed, blanket or
-- otherwise: a short order nobody ever cited stays exactly as unreachable as it
-- was this morning. What changed is that being cited is now admissible evidence,
-- and it outranks a length heuristic and our own derived class label — the
-- latter deliberately, because `decided_brief` was measured at 15.6% precision
-- and a judge's citation is better evidence than our classifier's guess.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHAT THE NAME PROMISES, AND WHAT IT REFUSES TO PROMISE
-- ───────────────────────────────────────────────────────────────────────────
--
-- REACHABLE, exactly as `BAIL_ORDER_REACHABLE` is reachable. It is its own tier
-- so that a consumer includes or excludes it ON PURPOSE. Folding these into
-- `BROAD_SEARCHABLE` would destroy the distinction the audit bought, and calling
-- them substantive precedent would be the false claim P4 explicitly forbids: a
-- 724-character order that one judge cited once is retrievable, and it is not
-- authority for anything.
--
-- Identity and text NEVER yield. A cited judgment whose text we cannot read, or
-- whose identity is incomplete, is still `NOT_ELIGIBLE` — the first branch is
-- unchanged and is checked first. Being cited cannot rescue a document we do not
-- actually hold.
--
-- A cited BAIL ORDER stays `BAIL_ORDER_REACHABLE`. 0066's reasoning applies
-- unchanged: a bail order is a bail order and should not fall through into some
-- other label. 730 of the cited set are bail orders and none of them move.
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
    -- UNCHANGED and FIRST. Identity and text never yield to anything, including
    -- to a citation. Being cited cannot rescue a document we cannot read.
    WHEN NOT (
      ((j.content_hash IS NOT NULL) AND (j.case_number IS NOT NULL)
        AND (j.judgment_date IS NOT NULL) AND (j.court IS NOT NULL)
        AND (length(COALESCE(j.case_title, ''::text)) > 3))
      AND ((j.full_text IS NOT NULL) AND (COALESCE(j.text_quality, (0)::numeric) >= 0.85)
        AND ((j.script_quality IS NULL)
          OR (j.script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text]))))
    ) THEN 'NOT_ELIGIBLE'::text

    -- The floor still refuses everything it refused this morning EXCEPT the
    -- documents a judge actually cited. 7,894 rows move here; the other 4.3M
    -- brief and stub rows do not.
    WHEN length(j.full_text) < 2000
      THEN CASE WHEN ca.judgment_id IS NOT NULL
                THEN 'CITED_AUTHORITY_REACHABLE'::text
                ELSE 'NOT_ELIGIBLE'::text END

    -- NULL-SAFE, and that is a TEST FIX rather than a style preference.
    -- `eligibility-null-safety.test.ts` forbids the substring
    -- `hc_document_class = 'bail_order'` anywhere in the deployed view, and 0066
    -- put it back inside this CASE -- so that guard has been RED since 0066
    -- landed, before this migration touched anything. Inside a CASE the bare
    -- form is harmless (NULL falls through exactly as false does), but a guard
    -- that is red for a harmless reason is a guard nobody reads.
    WHEN NOT j.hc_document_class IS DISTINCT FROM 'bail_order'::text
      THEN 'BAIL_ORDER_REACHABLE'::text

    -- 41 rows. `decided_brief` was measured at 15.6% precision, so a judge's
    -- citation is better evidence about this document than our own label is.
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

  -- APPENDED, like `text_safety` before it. `CREATE OR REPLACE VIEW` matches
  -- columns to the original by POSITION, so a column inserted anywhere else
  -- renames every column after it and the statement is rejected.
  (ca.judgment_id IS NOT NULL) AS is_cited_authority

FROM judgments j
LEFT JOIN cited_authority ca ON ca.judgment_id = j.id;

COMMENT ON VIEW judgment_embedding_eligibility IS
  'Semantic eligibility: four axes, text_safety, is_cited_authority, value_band '
  'and semantic_tier. CITED_AUTHORITY_REACHABLE added 21 Aug 2026 after an audit '
  'of every gold authority the contract still refused: 12 of 16 were refused by '
  'the 2,000-character floor alone and a judge had cited every one. The floor is '
  'NOT removed -- a short order nobody cited is as unreachable as it was; being '
  'cited is now admissible evidence and outranks both the length heuristic and '
  'our own hc_document_class, which was measured at 15.6% precision for '
  'decided_brief. 7,935 documents, 0.04% of the corpus. REACHABLE means '
  'retrievable, never substantive precedent. Identity and text never yield.';
