-- ───────────────────────────────────────────────────────────────────────────
-- SEMANTIC ELIGIBILITY — `decided_brief` leaves Tier A, and the admitted
-- population learns to say WHY it was admitted
-- ───────────────────────────────────────────────────────────────────────────
--
-- Two changes, and the second is the larger one.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 1. `decided_brief` IS EXCLUDED. MEASURED, NOT ARGUED.
-- ───────────────────────────────────────────────────────────────────────────
--
-- NEW2's 250-row audit read every row against the DOCUMENT rather than against
-- the rule (bus 0852, `new2-class-precision-sample.json`):
--
--     class                 correct/eval   precision   95% CI (Wilson)
--     bail_order              50/50          100.0%   [92.9, 100.0]
--     reference_stub          50/50          100.0%   [92.9, 100.0]
--     procedural_disposal     49/50           98.0%   [89.5,  99.6]
--     decided                 33/44           75.0%   [60.6,  85.4]
--     decided_brief            7/45           15.6%   [ 7.7,  28.8]
--
-- **`decided_brief` is not a weaker `decided`. It is a different population
-- wearing its name.** 38 of 45 evaluable rows are not decisions at all —
-- withdrawals, non-prosecution, condonation of delay, adjournments ("list on
-- 11.03.2026"), restorations, contempt closures on compliance, bail orders.
--
-- The rule that produces it is `disposal_nature_merits_short`: the same
-- merits-looking disposal string as `decided`, minus the length that gave the
-- text room to disagree with it. Below roughly 1,500 characters the disposal
-- string is carrying the whole decision — and `disposal_nature` is a registry
-- bookkeeping field. On a long judgment the text can contradict it; on a
-- two-paragraph order there is nothing to contradict it with.
--
-- So it joins `procedural_disposal` and `reference_stub` in the exclusion list
-- for exactly the reason they are there: **a class measured to be mostly not
-- law.** This is an exclusion on positive evidence, which is the only direction
-- this sample licenses — NEW2 was explicit that these classes are reliable as
-- EXCLUSIONS and unreliable as INCLUSIONS, and the two have different error
-- costs.
--
-- **The rows are marked, never dropped.** They remain in the view with
-- `axis_c_role = false`, exactly as `procedural_disposal` does. A consumer can
-- still see them and can still count them; what changes is that they stop being
-- admitted by default.
--
-- ── HOW BIG IS THIS, HONESTLY
--
-- NEW2 reported that dropping `decided_brief` "costs 24% of the decided-family
-- row count and takes the selector from 60.9% to 75.0%". **Both figures are
-- correct and both are about the LABELLED subpopulation, which is 5.2% of Tier
-- A.** Measured against the admitted population itself the change is about one
-- percent. It is the right change and it is not the lever it sounds like.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 2. THE ADMITTED POPULATION IS 94% ADMITTED BY *ABSENCE OF EVIDENCE*
-- ───────────────────────────────────────────────────────────────────────────
--
-- Two independent measurements, taken the same day by different lanes and by
-- different methods, agree:
--
--   NEW2, 25,000 uniform draws over the deployed view
--   (`new2-semantic-core-audit.json`, 20 Aug 11:52):
--       admitted                                          13,284 / 25,000 = 53.1%
--       admitted on `no_role_evidence_and_no_script_evidence`  12,537 = 94.4%
--       admitted with `role_decided`                             747 =  5.6%
--
--   LCC, full aggregate over the view, same day:
--       Tier A rows with `hc_document_class IS NULL`                    94.79%
--       ... of which `hc_class_method IS NULL` (never looked at)    12,342,501
--       ... of which a method ran and refused to call it             1,178,908
--
-- Three of the predicate's conjuncts admit on a NULL:
--
--     axis_c_role    class IS NULL OR class NOT IN (...)   — most rows pass on NULL
--     axis_b_text    script_quality IS NULL OR IN (...)    — 99.7% unscreened
--     value_band     length >= 2,000 characters            — the only conjunct
--                                                            that gestures at substance
--
-- That is the correct design — `UNKNOWN` must never mean `BAD`, and 0058 was
-- written precisely because negating a NULL had silently discarded 86.1% of a
-- page. But it means **the precision numbers everybody is quoting describe 5.2%
-- of the population they are being quoted about.** The other 94.8% is unmeasured
-- in both directions, and calling it either good or bad would be inventing a
-- fact.
--
-- ── SO THE ADMITTED POPULATION IS SPLIT THREE WAYS, BY WHAT IS KNOWN ABOUT IT
--
--   VERIFIED_SEMANTIC_CORE      admitted on POSITIVE evidence on every axis:
--                               the class says `decided` AND the script screen
--                               ran and passed. This is the population a purity
--                               gate can sample and a claim can rest on.
--                               Its measured precision is 75.0% [60.6, 85.4] and
--                               that figure must travel with it — "core" names
--                               how it was admitted, NOT that it is proven.
--
--   BROAD_SEARCHABLE            admitted, but on the ABSENCE of evidence — no
--                               class, or no script screen, or neither. Fine for
--                               lexical reach and for ordering an embedding
--                               queue. NEVER sufficient for an authority claim,
--                               because nothing has been established about it.
--
--   UNRESOLVED_EXPERIMENTAL     measured and found wanting (`decided_brief`), or
--                               queued for adjudication. Not admitted; not
--                               condemned either. It is where a row waits.
--
--   NOT_ELIGIBLE                fails an axis outright.
--
-- **`UNKNOWN` is not `BAD` and `UNKNOWN` is not `VERIFIED`.** BROAD_SEARCHABLE
-- exists so that the largest population in the corpus has a name that asserts
-- neither.
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

  ((full_text IS NOT NULL)
    AND (COALESCE(text_quality, (0)::numeric) >= 0.85)
    AND ((script_quality IS NULL)
      OR (script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text])))) AS axis_b_text,

  -- `decided_brief` joins the exclusion list. Still a NEGATIVE selector: a NULL
  -- class passes, because UNKNOWN is not BAD. What changed is that a class we
  -- have MEASURED at 15.6% no longer passes on the strength of its name.
  ((hc_document_class IS NULL)
    OR (hc_document_class <> ALL (ARRAY[
      'procedural_disposal'::text,
      'reference_stub'::text,
      'decided_brief'::text]))) AS axis_c_role,

  -- Null-safe by construction (0058). `NOT is_bail_order` on a NULL class is
  -- NULL, which filters the row out — the bug that cost 86.1% of a page.
  (NOT (hc_document_class IS DISTINCT FROM 'bail_order'::text)) AS is_bail_order,

  CASE
    WHEN (length(full_text) >= 8000) THEN 'substantial'::text
    WHEN (length(full_text) >= 4000) THEN 'full'::text
    WHEN (length(full_text) >= 2000) THEN 'standard'::text
    WHEN (length(full_text) >= 1000) THEN 'brief'::text
    ELSE 'stub'::text
  END AS value_band,

  -- WHY a row was admitted, which is a different question from WHETHER.
  -- Ordered most-specific first: a row that qualifies for the core is reported
  -- as core, never as broad.
  CASE
    WHEN NOT (
      ((content_hash IS NOT NULL) AND (case_number IS NOT NULL)
        AND (judgment_date IS NOT NULL) AND (court IS NOT NULL)
        AND (length(COALESCE(case_title, ''::text)) > 3))
      AND ((full_text IS NOT NULL) AND (COALESCE(text_quality, (0)::numeric) >= 0.85)
        AND ((script_quality IS NULL)
          OR (script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text]))))
      AND (length(full_text) >= 2000)
      AND (NOT (hc_document_class IS NOT DISTINCT FROM 'bail_order'::text))
    ) THEN 'NOT_ELIGIBLE'::text

    -- Measured and found wanting, or waiting on adjudication. Not admitted,
    -- and deliberately not condemned either.
    WHEN hc_document_class = ANY (ARRAY[
      'decided_brief'::text, 'procedural_disposal'::text, 'reference_stub'::text])
      THEN 'UNRESOLVED_EXPERIMENTAL'::text

    -- POSITIVE evidence on both the role axis and the text axis. The only
    -- population on which a precision figure has ever been measured.
    WHEN hc_document_class = 'decided'::text
      AND script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text])
      THEN 'VERIFIED_SEMANTIC_CORE'::text

    -- Admitted on the absence of evidence. The overwhelming majority.
    ELSE 'BROAD_SEARCHABLE'::text
  END AS semantic_tier

FROM judgments j;

COMMENT ON VIEW judgment_embedding_eligibility IS
  'Semantic eligibility, four axes plus semantic_tier. axis_c_role is a NEGATIVE '
  'selector — a NULL class passes, because UNKNOWN is not BAD — and it now '
  'excludes decided_brief on a measured 15.6% precision [7.7, 28.8]. '
  'semantic_tier says WHY a row was admitted: VERIFIED_SEMANTIC_CORE means '
  'positive evidence on every axis and carries a 75.0% [60.6, 85.4] measured '
  'precision, NOT a proof; BROAD_SEARCHABLE means admitted on the absence of '
  'evidence and is 94% of the population, never sufficient for an authority '
  'claim; UNRESOLVED_EXPERIMENTAL is measured-poor or awaiting adjudication and '
  'is neither admitted nor condemned.';
