-- Model-derived enrichment candidates, and the evidence for each one.
--
-- `docs/ai/CITATION_CONCORDANCE_EVALUATION.md` measured what happens when a
-- model is trusted to answer where the corpus is silent: with the true answer
-- removed from its options it invented an authority 10.8% of the time, and two
-- of those four inventions carried its own `high` confidence. So this table
-- exists to hold what a model SAYS, permanently separate from what LawMind
-- KNOWS -- the same boundary `citation_concordance_resolutions` draws for
-- authority identity, applied to every other enrichment task.
--
-- NOTHING HERE IS READ BY THE PRODUCT. No route joins it, no retrieval path
-- consults it, and promotion into `judgments`, `judgment_citations`,
-- `judgment_citation_aliases` or `judgment_judges` is a separate, measured,
-- deliberate step that this migration does not build.
--
-- THE COLUMN THAT MATTERS IS `verification_state`, and it is decided by
-- STRING-MATCHING THE MODEL'S CLAIMED EVIDENCE AGAINST THE SOURCE TEXT, never
-- by the model's own confidence. A claim whose supporting span cannot be found
-- in the document is `rejected` with the reason recorded. `CLAUDE.md` §2: the
-- model never emits a fact from memory, it only points at text we already hold.
CREATE TABLE IF NOT EXISTS document_enrichments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judgment_id uuid NOT NULL REFERENCES judgments(id) ON DELETE CASCADE,

  -- Which enrichment was attempted. Kept as text with a CHECK rather than an
  -- enum: a new task is a normal weekly event and must not need a migration
  -- that rewrites a type, which is the lesson of `llm_feature` needing 0044.
  task text NOT NULL,
  -- Bumped whenever the prompt changes. The unique key below includes it, so a
  -- prompt revision re-runs the document instead of silently reusing an answer
  -- produced by different instructions.
  prompt_version text NOT NULL,
  model text NOT NULL,

  -- Idempotency. `input_hash` covers task + prompt version + the exact excerpt
  -- sent; `source_text_hash` covers the document text the excerpt came from, so
  -- a re-extracted or OCR-corrected document invalidates its own enrichments
  -- rather than keeping answers about text that no longer exists.
  input_hash text NOT NULL,
  source_text_hash text NOT NULL,

  raw_output text,
  parsed_output jsonb,

  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer,
  attempts integer NOT NULL DEFAULT 1,

  -- `ok` means the call returned and parsed. It says NOTHING about whether the
  -- content is true -- that is `verification_state`'s job, and conflating the
  -- two is how a transport success becomes a legal fact.
  status text NOT NULL,
  error text,

  -- Set by source verification, never by the model.
  --   verified  -- every claim's evidence span was located in the source
  --   partial   -- some claims verified, some rejected
  --   rejected  -- no claim could be grounded in the source
  --   unverified -- not yet checked, or uncheckable
  verification_state text NOT NULL DEFAULT 'unverified',
  verified_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  rejection_reasons jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT document_enrichments_task_check CHECK (task IN (
    'citation_extraction', 'metadata', 'treatment', 'text_quality',
    'classification', 'statute_reference', 'amendment_event', 'evidence_span'
  )),
  CONSTRAINT document_enrichments_status_check CHECK (status IN (
    'ok', 'call_failed', 'unparseable'
  )),
  CONSTRAINT document_enrichments_verification_check CHECK (verification_state IN (
    'verified', 'partial', 'rejected', 'unverified'
  )),
  -- The cache key. A repeat of the same task, prompt and excerpt is a lookup,
  -- never a second call against a rate-limited free pool.
  CONSTRAINT document_enrichments_cache_key UNIQUE (judgment_id, task, prompt_version, input_hash)
);

CREATE INDEX IF NOT EXISTS document_enrichments_task_idx
  ON document_enrichments (task, verification_state);
CREATE INDEX IF NOT EXISTS document_enrichments_judgment_idx
  ON document_enrichments (judgment_id);

ANALYZE document_enrichments;
