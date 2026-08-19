-- ───────────────────────────────────────────────────────────────────────────
-- `is_bail_order` MUST NOT BE NULL — UNKNOWN IS NOT BAD, IN SQL TOO
-- ───────────────────────────────────────────────────────────────────────────
--
-- 0056 spent a paragraph insisting that NULL means "never assessed" and must
-- never disqualify a document, then emitted a column that disqualifies on NULL
-- the moment anybody negates it.
--
--     (j.hc_document_class = 'bail_order') AS is_bail_order
--
-- 16,811,480 of 17,945,147 judgments have `hc_document_class IS NULL` — 93.7%,
-- because NEW2 measured that 51.2% of everything ever assessed could not be
-- classified and most of the corpus has never been looked at. For every one of
-- those rows the expression is **NULL, not false**. And then:
--
--     WHERE ... AND NOT e.is_bail_order      -- NOT NULL is NULL
--                                            -- NULL is not TRUE
--                                            -- the row is filtered OUT
--
-- ── MEASURED 19 AUG 2026, ON A 50,000-ROW PAGE OF TIER-A REPRESENTATIVES
--
--     rows in page                                   50,000
--     surviving `AND NOT is_bail_order`               6,954   (13.9%)
--     surviving `AND coalesce(is_bail_order, false)` 50,000   (100%)
--     dropped purely for having an unknown class     43,046   (86.1%)
--
-- Corpus-wide there are 326,187 bail orders — 1.8%. A predicate that removes
-- 86.1% while intending to remove 1.8% is not filtering, it is a coverage bug
-- wearing a filter's clothes. It produces no error, no warning and a perfectly
-- consistent smaller manifest, which is why nothing caught it: every count
-- downstream agrees with every other count, and all of them are about 13.9% of
-- the intended population.
--
-- ── WHY THE FIX GOES IN THE VIEW AND NOT IN THE CALLERS
--
-- `services/embed/src/eligibility.ts` has this predicate twice, and the new
-- document-vector batch CLI had it a third time. Fixing the three call sites
-- leaves the trap armed for the fourth. This is the same lesson the citation
-- predicates taught twice this week: correct the shared primitive, not the site
-- where the symptom was seen.
--
-- The callers are ALSO made null-safe, deliberately. Defence in depth costs one
-- `coalesce` and means a consumer pointed at an older deployment of the view
-- still selects the right rows.
--
-- ── THIS DOES NOT CHANGE WHAT THE CONTRACT MEANS
--
-- `CONTRACT_VERSION` stays `v1`. The four axes, the bands and the thresholds are
-- untouched; the SQL now expresses the rule the comments always claimed. Per
-- `eligibility.ts`: *"Bumped by hand when the CONTRACT changes meaning, not when
-- the SQL is reformatted."*
--
-- The definition HASH does change, because it is taken from `pg_get_viewdef` and
-- that is exactly its job. The completed census is not invalidated by it: the
-- census walk bucketed rows in JavaScript, where a NULL came back as `null` and
-- `if (r.isBailOrder)` is falsy — i.e. it already behaved as `coalesce(…,
-- false)`. Its 17,945,147 rows were counted under these semantics, not the
-- broken ones. The recorded hash is re-stamped rather than the walk re-run, and
-- this paragraph is the reason.
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

  -- AXIS A · canonical identity. Already NULL-safe: every term is an explicit
  -- IS NOT NULL or a length() over a coalesce.
  (
    j.content_hash IS NOT NULL
    AND j.case_number IS NOT NULL
    AND j.judgment_date IS NOT NULL
    AND j.court IS NOT NULL
    AND length(coalesce(j.case_title, '')) > 3
  ) AS axis_a_identity,

  -- AXIS B · text quality. Already NULL-safe via coalesce, and an unassessed
  -- script passes on purpose.
  (
    j.full_text IS NOT NULL
    AND coalesce(j.text_quality, 0) >= 0.85
    AND (j.script_quality IS NULL OR j.script_quality IN ('clean', 'mixed_script_ok'))
  ) AS axis_b_text,

  -- AXIS C · role. Already NULL-safe — it says `IS NULL OR NOT IN (…)`
  -- explicitly, which is what axis D below failed to do.
  (
    j.hc_document_class IS NULL
    OR j.hc_document_class NOT IN ('procedural_disposal', 'reference_stub')
  ) AS axis_c_role,

  -- THE FIX. `IS NOT DISTINCT FROM` is `=` that treats NULL as an ordinary
  -- value, so an unclassified document is `false` — not a bail order — rather
  -- than NULL. Chosen over `coalesce(j.hc_document_class = 'bail_order', false)`
  -- because it cannot be partially applied: there is no way to write it and
  -- still leak a NULL.
  --
  -- Meaning unchanged and worth restating: this flags KNOWN bail orders. A
  -- document nobody has classified is not asserted to be one, and never was —
  -- that was only ever an artefact of how the flag was consumed.
  (j.hc_document_class IS NOT DISTINCT FROM 'bail_order') AS is_bail_order,

  -- AXIS D · length band. `length()` of a NULL is NULL and would fall to the
  -- ELSE, so a NULL full_text bands as 'stub' — correct, and it is also
  -- excluded by axis B.
  CASE
    WHEN length(j.full_text) >= 8000 THEN 'substantial'
    WHEN length(j.full_text) >= 4000 THEN 'full'
    WHEN length(j.full_text) >= 2000 THEN 'standard'
    WHEN length(j.full_text) >= 1000 THEN 'brief'
    ELSE 'stub'
  END AS value_band
FROM judgments j;

COMMENT ON VIEW judgment_embedding_eligibility IS
  'Embedding eligibility, four independent axes, contract v1 — see docs/ai/EMBEDDING_ELIGIBILITY_CONTRACT.md. Keyset-friendly: filter on id and ORDER BY id to walk it incrementally. Duplicate collapse is the consumer''s, by content_hash. EVERY boolean here is NULL-safe: an unassessed document is never excluded by absence of a verdict (0058).';
