-- ───────────────────────────────────────────────────────────────────────────
-- BAIL ORDERS BECOME REACHABLE — the measurement eligibility.ts asked for
-- ───────────────────────────────────────────────────────────────────────────
--
-- `services/embed/src/eligibility.ts` has said, since it was written:
--
--     "Broken out rather than excluded by class: bail orders are practically
--      useful and are not precedent, and which tier they belong in is a
--      retrieval measurement nobody has made yet."
--
-- **NEW1 has now made it** (bus 0916, `NEW1_EXPANSION_BENCHMARK_250K.md`). Every
-- one of NEW3's 250 gold authorities is one a real High Court judge really cited,
-- citation-edge verified with no model paraphrase anywhere in its construction.
-- Run through the deployed view:
--
--     ELIGIBLE                        217    86.8%
--     REFUSED too short: brief         13     5.2%
--     REFUSED bail_order               12     4.8%
--     REFUSED too short: stub           5     2.0%
--     REFUSED procedural_disposal       2     0.8%
--     REFUSED axis_b_text               1     0.4%
--                                     ───
--     REFUSED                          33    13.2%
--
-- **13.2% of the authorities judges actually cite are refused before the GPU
-- sees them.** That is a ceiling, not a backlog: no recipe, index type, reranker
-- or amount of throughput moves it.
--
-- ───────────────────────────────────────────────────────────────────────────
-- THE DECISION, AND THE HALF OF IT THAT IS NOT BEING TAKEN
-- ───────────────────────────────────────────────────────────────────────────
--
-- **Bail orders become reachable. The 2,000-character band floor does not move.**
-- Two refusals of similar size, two different answers, because the evidence
-- differs.
--
-- ── WHY BAIL ORDERS GO IN
--
-- The exclusion never rested on evidence. It rested on *"bail orders are not
-- precedent"* — which is true, and which is a statement about **precedential
-- weight**, not about **retrievability**. Those are different axes, and
-- conflating them is the same error `OD-14` is open about and the same one the
-- currentness layer exists to prevent: **return it, and mark it.** An advocate
-- arguing a bail application needs bail orders, and bail is an enormous share of
-- Indian criminal practice.
--
-- Judges cite them at 4.8% of a citation-verified set. `bail_order` is also the
-- largest single class in the corpus at 515,125 rows, so a rule that made it
-- unreachable made the largest labelled population invisible on a guess about
-- its value.
--
-- The cost is close to nothing. NEW1 **quarantined rather than deleted** the
-- 34,370 already-embedded `bail_order` / `procedural_disposal` vectors into
-- `new1_doc_vector_stage_refused` with a `refused_class` column. Restoring them
-- is one `INSERT ... SELECT` at zero GPU cost.
--
-- NEW2's audit is what makes this safe to do narrowly: `bail_order` scored
-- **50/50** on its own precision sample. The label is right. The question was
-- only ever whether a correct label should imply unreachable, and the answer
-- measured here is no.
--
-- ── WHY THE LENGTH FLOOR DOES NOT MOVE, THOUGH IT REFUSES MORE
--
-- Length refuses 18 of 250 — **7.2%**, larger than bail's 4.8%. It stays anyway,
-- and this is a judgement recorded rather than assumed:
--
--   · The population is not comparable. Bail orders are 515,125 rows; the
--     `brief` band alone is **4,328,815**. Lowering the floor to 1,000 roughly
--     doubles the embedding population to buy 7.2%.
--   · NEW2's corrected citation-presence gradient (bus 0913) says what is down
--     there. Documents carrying NO citation-shaped string at all:
--
--         standard      91.5%
--         full          82.5%
--         substantial   66.8%
--
--     A substantial document is roughly three times more likely to cite
--     something than a standard one. The low bands argue from nothing, and the
--     band floor is the only substance proxy the predicate has.
--   · The 7.2% is real and is NOT dismissed. "Short" and "not worth citing" are
--     demonstrably different and 7.2% is the size of the difference. It is a
--     known, measured, accepted loss — recorded here so the next person to look
--     finds a decision rather than an oversight.
--
-- ───────────────────────────────────────────────────────────────────────────
-- A CORRECTION TO MIGRATION 0063, OWED AND STATED PLAINLY
-- ───────────────────────────────────────────────────────────────────────────
--
-- 0063 excluded `decided_brief` from `axis_c_role` and its comment said the
-- change costs "about one percent" of the admitted population.
--
-- **It costs zero rows, and NEW2 caught it (bus 0908).**
-- `disposal_nature_merits_short` caps at `BRIEF_MAX_CHARS = 1500`, which is
-- below the 2,000-character band floor, so **no `decided_brief` row was ever in
-- Tier A**. Verified directly:
--
--     decided_brief rows                       275,048
--     ... at or above the 2,000-char floor           0
--     ... longest document                       1,499 chars
--
-- The one-percent figure came from measuring against `text_length >= 1000`
-- rather than the deployed `>= 2000`. The exclusion itself is still correct as a
-- statement of intent — a class measured at 15.6% should not be admitted by
-- name — and it is now known to be a no-op in practice rather than a saving.
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

  ((hc_document_class IS NULL)
    OR (hc_document_class <> ALL (ARRAY[
      'procedural_disposal'::text,
      'reference_stub'::text,
      'decided_brief'::text]))) AS axis_c_role,

  -- **KEPT, and its meaning is unchanged.** It still identifies bail orders and
  -- it is still null-safe (0058). What changes is that `semantic_tier` no longer
  -- treats it as a disqualification — the flag was never the bug, the policy
  -- reading it was. Consumers that want bail orders out can still say so, and
  -- now have to say so deliberately.
  (NOT (hc_document_class IS DISTINCT FROM 'bail_order'::text)) AS is_bail_order,

  CASE
    WHEN (length(full_text) >= 8000) THEN 'substantial'::text
    WHEN (length(full_text) >= 4000) THEN 'full'::text
    WHEN (length(full_text) >= 2000) THEN 'standard'::text
    WHEN (length(full_text) >= 1000) THEN 'brief'::text
    ELSE 'stub'::text
  END AS value_band,

  CASE
    -- Identity, text and length are the axes that still disqualify outright.
    -- Bail orders are NO LONGER among them.
    WHEN NOT (
      ((content_hash IS NOT NULL) AND (case_number IS NOT NULL)
        AND (judgment_date IS NOT NULL) AND (court IS NOT NULL)
        AND (length(COALESCE(case_title, ''::text)) > 3))
      AND ((full_text IS NOT NULL) AND (COALESCE(text_quality, (0)::numeric) >= 0.85)
        AND ((script_quality IS NULL)
          OR (script_quality = ANY (ARRAY['clean'::text, 'mixed_script_ok'::text]))))
      AND (length(full_text) >= 2000)
    ) THEN 'NOT_ELIGIBLE'::text

    -- Reachable, and named separately rather than folded into BROAD_SEARCHABLE.
    -- Checked BEFORE the role exclusions: a bail order is a bail order, and it
    -- should not fall through into UNRESOLVED_EXPERIMENTAL on some other label.
    -- Its own population, so a consumer can include or exclude it on purpose —
    -- silently merging it would destroy exactly the distinction NEW1's
    -- measurement bought.
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
  'Semantic eligibility, four axes plus semantic_tier. BAIL_ORDER_REACHABLE was '
  'added 21 Aug 2026: judges cite bail orders in 4.8% of a citation-verified gold '
  'set (NEW1 bus 0916) and "not precedent" is a claim about weight, not about '
  'retrievability. Return it and mark it. The 2,000-char floor deliberately does '
  'NOT move despite refusing a larger 7.2% — the brief band is 4.3M rows and '
  '91.5% of standard-band documents cite nothing at all; that loss is accepted '
  'and recorded, not overlooked. VERIFIED_SEMANTIC_CORE is currently EMPTY '
  'because script_quality is written for 58,615 rows of 18.7M — the honest state, '
  'not a bug, and NEW2 reached the same zero independently.';
