-- THE COLUMN THE PROVENANCE DECISION NEEDS, WHICHEVER WAY IT GOES.
--
-- NEW2 hand-read all 137 edges behind a LAW MOVED badge (bus 1098,
-- `TREATMENT_PROVENANCE_DECISION_INPUT_V1.md`) and found:
--
--     REPORTER_EDITORIAL_ANNOTATION   131   95.62%
--     COURT_REASONING_EXPLICIT          5    3.65%
--     MODALITY_DEFECT                   1
--
-- 92 of the 98 real judgments carrying a LAW MOVED badge would lose it if
-- reporter evidence may not promote to canonical treatment.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THIS MIGRATION DECIDES NOTHING, AND THAT IS THE POINT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- **No badge changes. No row is rewritten. Nothing reads this column yet.**
--
-- The decision is the founder's, filed as `FQ-TREATMENT-HEADNOTE-PROVENANCE`,
-- and this lane is forbidden from making it three ways over: the round contract
-- says reporter evidence must not become canonical *unless an explicit founder
-- or legal-source policy permits it*; §6 LCC-8 says no treatment mass rewrite;
-- and `CLAUDE.md` says adverse-treatment information is never hidden. Removing
-- 92 warnings is the direction the citation harness is most afraid of, and
-- doing it on my own authority would be worse than the defect.
--
-- What IS mine is the observation NEW2 ended on: **the enforcement point is one
-- line in one file — `propagate-treatment.ts`, the single writer of
-- `overruled_status` — and the column to put in that line does not exist.**
-- `judgment_citations` carries `relationship` and `evidence` and no way to say
-- WHO said it, so no consumer could filter on provenance even if the policy
-- told it to.
--
-- That column is needed under BOTH answers:
--
--   * if reporter evidence may NOT promote, the gate reads this column;
--   * if it MAY, the column is what lets a surface say *"a law reporter's
--     headnote"* rather than implying a court said it.
--
-- So it is not speculative. It is the precondition, and it is additive: a
-- nullable column with no default, no consumer and no backfill.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY TEXT AND NOT AN ENUM
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The vocabulary is NEW2's and it is still moving — they added `MODALITY_DEFECT`
-- by reading, after the screen had already run. A Postgres enum cannot have a
-- value removed and reordering one is a rewrite; a CHECK constraint on text can
-- be widened in a migration and is just as strict at write time. The constraint
-- lists what NEW2 has actually adjudicated, and `NULL` means **not classified**,
-- which is honestly different from every named class.
ALTER TABLE judgment_citations
  ADD COLUMN IF NOT EXISTS treatment_provenance text;

COMMENT ON COLUMN judgment_citations.treatment_provenance IS
  'WHO said the thing `relationship` records. NULL = not classified, which is '
  'not the same as UNKNOWN (a class NEW2 assigns when it has looked and cannot '
  'tell). Nothing reads this column until FQ-TREATMENT-HEADNOTE-PROVENANCE is '
  'answered; it exists so the answer is implementable. NEW2 bus 1098.';

ALTER TABLE judgment_citations
  DROP CONSTRAINT IF EXISTS judgment_citations_treatment_provenance_known;

ALTER TABLE judgment_citations
  ADD CONSTRAINT judgment_citations_treatment_provenance_known
  CHECK (treatment_provenance IS NULL OR treatment_provenance IN (
    -- The court's own reasoning said it. The only class that is unambiguously
    -- safe to promote to canonical treatment under any policy.
    'COURT_REASONING_EXPLICIT',
    -- The operative order did it, as opposed to the discussion.
    'COURT_ORDER_DISPOSITIVE',
    -- A law reporter's headnote, editorial note, or citation apparatus. 95.62%
    -- of what currently drives a LAW MOVED badge.
    'REPORTER_EDITORIAL_ANNOTATION',
    -- Counsel submitted it. Never the court's own view.
    'COUNSEL_ARGUMENT',
    -- The verb is right and the MOOD is wrong: "is sought to be overruled",
    -- "proposed to be delivered". NEW2 found one by reading, in a 1985 Supreme
    -- Court DISSENT that is the sole driver of a live set_aside. Polarity is the
    -- wrong verb; modality is the right verb in the wrong mood, and MARKER_RE
    -- guards neither.
    'MODALITY_DEFECT',
    -- Looked at, cannot tell. Distinct from NULL, which is "not looked at".
    'UNKNOWN'
  ));

-- Partial, because the interesting query is "what is still unclassified" and
-- because a full index on a column that is entirely NULL today would be pages
-- of nothing.
CREATE INDEX IF NOT EXISTS judgment_citations_treatment_provenance_idx
  ON judgment_citations (treatment_provenance)
  WHERE treatment_provenance IS NOT NULL;
