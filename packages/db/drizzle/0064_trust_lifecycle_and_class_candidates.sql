-- ───────────────────────────────────────────────────────────────────────────
-- THE TRUST LIFECYCLE — "the span exists" is not "the span is the holding"
-- ───────────────────────────────────────────────────────────────────────────
--
-- `document_enrichments.verification_state` answers exactly one question, and
-- answers it well: **does the quoted span actually appear in the document?**
-- That is span verification, and `enrich.ts` does it with a whitespace-tolerant
-- containment check tightened by measurement (a 40-document run refused 8 spans;
-- 7 were genuine fabrication and 1 was the checker's own fault).
--
-- It does NOT answer the question the product depends on. A model output
-- containing a real span does not prove that the span is:
--
--     the holding · an issue · the court's reasoning · a party's argument
--     quoted precedent · dicta · a dissent · a procedural recital
--
-- Those are different objects, and **the most dangerous failure in this factory
-- is a real quotation filed under the wrong role** — a party's contention stored
-- as the court's holding reads perfectly, verifies perfectly, and is wrong in
-- the one way an advocate cannot detect by looking at it.
--
-- Today 17,474 `metadata` rows and 1,198 `holding` rows sit at
-- `verification_state = 'verified'`, and every one of them means *the span is
-- real*. Nothing in the schema distinguishes that from *the span is the
-- holding*, so nothing downstream can either.
--
-- ───────────────────────────────────────────────────────────────────────────
-- FOUR STATES, AND THE GAPS BETWEEN THEM ARE THE POINT
-- ───────────────────────────────────────────────────────────────────────────
--
--   MODEL_PROPOSED           The model returned something. Nothing is checked.
--                            **This is the default**, and it is where a row
--                            stays until work is done on it — not a failure
--                            state, an unstarted one.
--
--   SPAN_VERIFIED            The quote occurs in the source document. This is
--                            what `verification_state = 'verified'` means today
--                            and it is the ceiling of what this factory can
--                            currently reach.
--
--   SEMANTIC_ROLE_VERIFIED   An INDEPENDENT check confirmed the span plays the
--                            role claimed. Independent means: not the model that
--                            proposed it, and not a re-read of the same window
--                            by the same prompt. Nothing reaches this state yet
--                            and the column says so honestly rather than
--                            flattering the pipeline.
--
--   CANONICAL_TRUSTED        Promoted for product use. Requires
--                            SEMANTIC_ROLE_VERIFIED plus whatever the task's own
--                            promotion rule demands.
--
-- **The states are ordered and a row may not skip one.** `trust_rank` exists so
-- that "at least SPAN_VERIFIED" is an inequality rather than an IN-list that
-- someone will forget to extend when a fifth state is added.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHY A NEW COLUMN AND NOT A WIDENED ENUM ON THE OLD ONE
-- ───────────────────────────────────────────────────────────────────────────
--
-- `verification_state` also carries `partial` and `rejected`, which are not
-- points on this ladder — `partial` means *some claims in this row verified and
-- some did not*, which is a property of the ROW's contents rather than of its
-- trust. Overloading one column with both a per-claim tally and a lifecycle is
-- how the citation model would have gone wrong if it had used one enum instead
-- of three fields, and the same reasoning applies here.
--
-- So `verification_state` keeps its meaning untouched and `trust_state` is
-- derived from it once, at backfill, and maintained forward by the pipeline.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHAT "SEMANTIC ROLE VERIFIED" WILL REQUIRE, PER TASK
-- ───────────────────────────────────────────────────────────────────────────
--
-- Recorded here because a lifecycle with an unspecified next step is a lifecycle
-- nothing ever advances along. These are requirements, not implementations:
--
--   holding                  the span must sit AFTER the last "it is contended
--                            / submitted / argued" boundary and inside the
--                            court's own reasoning, not in the recital of
--                            submissions. Position within the document is
--                            evidence; the model's assertion is not.
--   issue                    must be interrogative or framed as a question the
--                            court set itself, and must be answered later in the
--                            same document.
--   reasoning_proposition    must not be inside a block quoted from another
--                            judgment — quoted precedent is that court's
--                            reasoning, not this one's.
--   arguments / party_action must be attributable to a named party, and must NOT
--                            satisfy the holding position test.
--   authorities              the cited case must resolve against a corpus
--                            identity or an external citation, or be marked
--                            unresolved. A plausible-looking citation that
--                            resolves to nothing is the single failure mode this
--                            whole product exists to prevent.
--   statute_reference        the Act and section must exist in `statutes` /
--                            `statute_sections`, and BNS/BNSS/BSA applicability
--                            is a SEPARATE question from the reference being
--                            real.
--   date_event / procedural_event
--                            the date must parse and fall within the case's
--                            plausible lifetime, not merely appear in the text.
--
-- ───────────────────────────────────────────────────────────────────────────
SET LOCAL lock_timeout = '3s';

ALTER TABLE document_enrichments
  ADD COLUMN IF NOT EXISTS trust_state text NOT NULL DEFAULT 'MODEL_PROPOSED',
  -- Ordered rank, so "at least SPAN_VERIFIED" is `trust_rank >= 2` and stays
  -- correct when a state is inserted later. An IN-list would not.
  ADD COLUMN IF NOT EXISTS trust_rank  smallint NOT NULL DEFAULT 0,
  -- WHO or WHAT advanced it, and when. A promotion with no accountable actor is
  -- a promotion nobody can audit or reverse with confidence.
  ADD COLUMN IF NOT EXISTS trust_advanced_by text,
  ADD COLUMN IF NOT EXISTS trust_advanced_at timestamptz;

ALTER TABLE document_enrichments
  DROP CONSTRAINT IF EXISTS document_enrichments_trust_state_check;

ALTER TABLE document_enrichments
  ADD CONSTRAINT document_enrichments_trust_state_check CHECK (
    trust_state IN (
      'MODEL_PROPOSED', 'SPAN_VERIFIED', 'SEMANTIC_ROLE_VERIFIED', 'CANONICAL_TRUSTED')
  );

-- The rank must agree with the state. Two columns that can disagree are one
-- column and a bug.
ALTER TABLE document_enrichments
  DROP CONSTRAINT IF EXISTS document_enrichments_trust_rank_check;

ALTER TABLE document_enrichments
  ADD CONSTRAINT document_enrichments_trust_rank_check CHECK (
    (trust_state = 'MODEL_PROPOSED'         AND trust_rank = 0) OR
    (trust_state = 'SPAN_VERIFIED'          AND trust_rank = 2) OR
    (trust_state = 'SEMANTIC_ROLE_VERIFIED' AND trust_rank = 3) OR
    (trust_state = 'CANONICAL_TRUSTED'      AND trust_rank = 4)
  );

-- Backfill: `verified` is span verification and nothing more. `partial` does NOT
-- advance — a row where some claims failed has not established its span set, and
-- promoting it would let the failed half ride in on the verified half's rank.
UPDATE document_enrichments
   SET trust_state = 'SPAN_VERIFIED',
       trust_rank  = 2,
       trust_advanced_by = 'migration-0064-backfill:verification_state=verified',
       trust_advanced_at = now()
 WHERE verification_state = 'verified'
   AND trust_state = 'MODEL_PROPOSED';

CREATE INDEX IF NOT EXISTS document_enrichments_task_trust_idx
  ON document_enrichments (task, trust_rank);

COMMENT ON COLUMN document_enrichments.trust_state IS
  'MODEL_PROPOSED -> SPAN_VERIFIED -> SEMANTIC_ROLE_VERIFIED -> CANONICAL_TRUSTED. '
  'SPAN_VERIFIED means only that the quote occurs in the document; it does NOT '
  'mean the span is the holding, the issue, or the reasoning. Nothing reaches '
  'SEMANTIC_ROLE_VERIFIED yet and the column says so rather than flattering the '
  'pipeline. Separate from verification_state, which is a per-claim tally.';

-- ───────────────────────────────────────────────────────────────────────────
-- MODEL CLASS CANDIDATES — the table `hc-adjudicate-cli.ts` has been waiting for
-- ───────────────────────────────────────────────────────────────────────────
--
-- `hc-adjudicate-cli.ts` says, in its own header: *"This writes no canonical
-- row … model output lands in a candidate table with an evidence span, and
-- promotion is a separate, measured step. The candidate table needs a
-- migration, which is LCC's to write."* This is it.
--
-- NEW2's manifest (bus 0850) enumerated **190,102 rows** the frozen
-- deterministic screen cannot call either way, against a residue of 1,044,987.
-- Nothing was written to `judgments`; `hc_document_class` is NULL for all of
-- them. The model pass and the write are both this lane's, and they stay
-- separate here.
--
-- **A candidate NEVER writes `judgments.hc_document_class` directly.** NEW2 was
-- explicit about why: the frozen screen's held-out precision is 87.0% at a
-- balanced prior against REGISTRY labels, not human ground truth, and using it
-- to auto-promote contaminates precedent eligibility — the exact thing the
-- exercise exists to protect. Measured per-class precision makes the point
-- sharper still: `decided_brief` is 15.6%, so a model verdict of `decided_brief`
-- is worth less than the screen refusing to guess.
--
-- The candidate carries the model's verbatim quote and the span verdict, because
-- a class assertion with no quotable evidence is an opinion. `span_not_found`
-- rows are KEPT — a fabrication rate is a measurement, and deleting the
-- fabrications is how you stop being able to compute it.
--
CREATE TABLE IF NOT EXISTS hc_class_candidate (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judgment_id        uuid NOT NULL REFERENCES judgments (id) ON DELETE CASCADE,

  -- What the model said, and what it quoted to justify it.
  proposed_class     text,
  evidence           text,
  reasoning          text,
  -- The model's own word about itself. RECORDED, NEVER ACTED ON — a model's
  -- stated confidence is a token distribution, not a calibrated probability,
  -- and treating it as one is how an unmeasured pipeline acquires a number that
  -- looks like a measurement.
  stated_confidence  text,

  -- Did the quote actually occur in the document.
  span_verdict       text NOT NULL,

  -- Provenance, so a candidate can be attributed to the exact pass that made it.
  model              text NOT NULL,
  prompt_version     text NOT NULL,
  input_hash         text NOT NULL,
  -- Which screen refused this row. NEW2's screen is FROZEN and loaded from an
  -- artifact; the residue CLI mines fresh markers on every run, so without this
  -- two passes are not comparable and neither is reproducible.
  screen_version     text,
  -- What the deterministic method said before the model was asked. Kept so a
  -- disagreement between rule and model is answerable without a second read.
  prior_class_method text,

  input_tokens       integer,
  output_tokens      integer,
  latency_ms         integer,

  -- Same ladder as document_enrichments, same reasoning. A candidate that has
  -- only had its span checked is not a classification.
  trust_state        text NOT NULL DEFAULT 'MODEL_PROPOSED',
  trust_rank         smallint NOT NULL DEFAULT 0,

  -- Set only when a candidate is promoted onto `judgments`. NULL means it never
  -- was, which is the expected state for almost every row.
  promoted_at        timestamptz,
  promoted_by        text,

  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hc_class_candidate_class_check CHECK (
    proposed_class IS NULL OR proposed_class IN (
      'decided', 'decided_brief', 'procedural_disposal', 'bail_order', 'reference_stub')
  ),
  CONSTRAINT hc_class_candidate_span_verdict_check CHECK (
    span_verdict IN ('verified', 'span_not_found', 'span_too_short', 'no_evidence_offered')
  ),
  CONSTRAINT hc_class_candidate_confidence_check CHECK (
    stated_confidence IS NULL OR stated_confidence IN ('high', 'low')
  ),
  CONSTRAINT hc_class_candidate_trust_state_check CHECK (
    trust_state IN (
      'MODEL_PROPOSED', 'SPAN_VERIFIED', 'SEMANTIC_ROLE_VERIFIED', 'CANONICAL_TRUSTED')
  ),
  -- A row cannot be promoted without having reached the top of the ladder.
  -- Enforced rather than trusted to the promoting script.
  CONSTRAINT hc_class_candidate_promotion_check CHECK (
    promoted_at IS NULL OR trust_state = 'CANONICAL_TRUSTED'
  )
);

-- Re-running a pass must not re-pay for a verdict already obtained. Content
-- addressed on (judgment, prompt, input) rather than on judgment alone, so a
-- changed prompt is a NEW candidate instead of a silent overwrite of the old
-- one — otherwise two prompt versions become indistinguishable after the fact.
CREATE UNIQUE INDEX IF NOT EXISTS hc_class_candidate_input_key
  ON hc_class_candidate (judgment_id, prompt_version, input_hash);

CREATE INDEX IF NOT EXISTS hc_class_candidate_class_span_idx
  ON hc_class_candidate (proposed_class, span_verdict);

-- The promotion sweep, and the "what is still waiting" read.
CREATE INDEX IF NOT EXISTS hc_class_candidate_unpromoted_idx
  ON hc_class_candidate (created_at)
  WHERE promoted_at IS NULL;

COMMENT ON TABLE hc_class_candidate IS
  'Model class proposals with a verbatim quote and a span verdict. NEVER writes '
  'judgments.hc_document_class — promotion is a separate, measured step and the '
  'CHECK refuses a promoted_at without CANONICAL_TRUSTED. span_not_found rows '
  'are KEPT: a fabrication rate is a measurement, and deleting the fabrications '
  'is how you stop being able to compute it.';

COMMENT ON COLUMN hc_class_candidate.stated_confidence IS
  'The model''s own word about itself. Recorded, never acted on — a stated '
  'confidence is a token distribution, not a calibrated probability.';

COMMENT ON COLUMN hc_class_candidate.screen_version IS
  'Which deterministic screen refused this row. NEW2''s screen is frozen and '
  'loaded from an artifact; the residue CLI mines fresh markers per run, so '
  'without this two passes are neither comparable nor reproducible.';
