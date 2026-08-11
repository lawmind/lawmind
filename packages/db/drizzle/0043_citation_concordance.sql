-- DeepSeek-adjudicated candidate resolutions for the unresolved High Court
-- citation targets `docs/HC_CITATION_RUN.md` produces -- the concordance gap
-- `docs/ai/AUTHORITY_COVERAGE.md` measured (12.1% safely resolvable by
-- deterministic name+year matching alone; the rest needs a stronger signal).
-- `docs/ai/CITATION_CONCORDANCE_PROGRAM.md` is the authority.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- AN ADJUDICATION AID, NEVER A SOURCE OF TRUTH
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Nothing reads this table to answer a citation query. Only
-- `judgment_citation_aliases` does that, and moving a row's
-- `candidate_judgment_id` there is a separate, explicit, threshold-gated
-- promotion step this table never performs on insert. A model's opinion and a
-- corroborated fact about the corpus are different things and must stay
-- distinguishable -- the same reason `verified_by_source = 'licensed'` exists
-- and ranks below `ecourts_bulk` in `MODEL_STRATEGY.md` §4.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CACHED AND AUDITABLE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `model_input_hash` is the idempotency key: a re-run over the same citation,
-- the same evidence snippet and the same candidate set is a cache lookup, not
-- a second model call -- "never pay twice for the same exact task." Every
-- field the adjudication depended on (`candidates`, `context_evidence`) is
-- stored beside the decision, so a row is reproducible without re-running
-- candidate generation against a corpus that has since grown.
CREATE TABLE IF NOT EXISTS citation_concordance_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which unresolved-citation feed this target came from, e.g. `aws_high_court`.
  source text NOT NULL,
  -- Matches `external_citations.citation_key` -- alphanumeric-only comparison form.
  citation_key text NOT NULL,
  -- As printed, for provenance.
  citation_text text NOT NULL,
  citation_year integer,
  -- A bounded snippet around one sighting -- the case name a court printed
  -- beside the citation. NOT the document: `docs/CITATION_STRATEGY.md`'s
  -- "read as evidence, throw the text away" rule governs the source PDF this
  -- snippet was taken from. The same "evidence span, never the source text"
  -- discipline `judgment_citation_aliases.evidence` already applies.
  context_evidence text NOT NULL,
  -- The candidate set actually shown to the model:
  -- `[{judgmentId, caseTitle, judgmentDate, jaccard}, ...]`.
  candidates jsonb NOT NULL,
  -- Which candidate the model selected, if any. NULL is a real answer -- "none
  -- of these" or "impossible to determine" -- not a gap.
  candidate_judgment_id uuid REFERENCES judgments(id) ON DELETE SET NULL,
  decision text NOT NULL,
  -- HIGH/MEDIUM/LOW/AMBIGUOUS/UNRESOLVED. Thresholds derived from a measured
  -- precision/recall curve on a gold set drawn from the corpus's own already-
  -- corroborated aliases (`docs/ai/CITATION_CONCORDANCE_EVALUATION.md`) --
  -- never invented ahead of that measurement, per the founder's own directive.
  confidence text NOT NULL,
  deterministic_top_score numeric(5, 4),
  deterministic_runner_up_score numeric(5, 4),
  model_used text NOT NULL,
  model_input_hash text NOT NULL,
  model_output_hash text,
  -- The model's own stated reason, verbatim. Never edited, never summarised --
  -- an adjudication whose reasoning cannot be read is an assertion.
  model_reasoning text,
  -- Contradictions the model itself flagged, verbatim. NULL means none reported.
  contradictions text,
  signals_used text[] NOT NULL DEFAULT '{}',
  needs_human_review boolean NOT NULL DEFAULT true,
  -- unvalidated | gold_positive | gold_negative | promoted | rejected.
  -- `promoted` is the ONLY status that means this row's `candidate_judgment_id`
  -- was ever written to `judgment_citation_aliases`, and that write happens
  -- elsewhere, never automatically because a row was inserted here.
  validation_status text NOT NULL DEFAULT 'unvalidated',
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT citation_concordance_resolutions_decision_valid
    CHECK (decision IN
      ('candidate_selected', 'none_of_candidates', 'impossible_to_determine', 'no_candidate_generated')),
  CONSTRAINT citation_concordance_resolutions_confidence_valid
    CHECK (confidence IN ('high', 'medium', 'low', 'ambiguous', 'unresolved')),
  CONSTRAINT citation_concordance_resolutions_validation_status_valid
    CHECK (validation_status IN
      ('unvalidated', 'gold_positive', 'gold_negative', 'promoted', 'rejected')),
  -- The cache key. Re-adjudicating identical evidence is a lookup, not a spend.
  CONSTRAINT citation_concordance_resolutions_cache
    UNIQUE (source, citation_key, model_input_hash)
);

CREATE INDEX IF NOT EXISTS citation_concordance_resolutions_key_idx
  ON citation_concordance_resolutions (citation_key);

CREATE INDEX IF NOT EXISTS citation_concordance_resolutions_candidate_idx
  ON citation_concordance_resolutions (candidate_judgment_id)
  WHERE candidate_judgment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS citation_concordance_resolutions_confidence_idx
  ON citation_concordance_resolutions (confidence);
