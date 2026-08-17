-- The structured legal object: five new `document_enrichments.task` values.
--
-- 0045 chose `text NOT NULL` with a CHECK over an enum for exactly this moment:
-- "a new task is a normal weekly event and must not need a migration that
-- rewrites a type, which is the lesson of `llm_feature` needing 0044." This is
-- that weekly event, and it costs one constraint swap rather than a type
-- rewrite over 28,728 rows.
--
-- WHAT THE FIVE ARE, AND WHY THEY ARE NOT SUMMARISATION
--
--   case_structure  facts · issues · procedural history · chronology · relief sought
--   holding         holdings · reasoning · relief granted · propositions of law
--   arguments       each side's contentions, attributed, kept apart from the holding
--   authorities     the authorities and provisions the court RELIED ON, and what for
--   topics          subject taxonomy and the queries the judgment should answer
--
-- Every item these tasks produce is a VERBATIM QUOTE from the judgment, and the
-- quote is what `verifyClaims` checks — the same full-strength check a citation
-- gets, not the weakened `LABEL_KINDS` path. The model's own gloss rides in
-- `parsed_output` and is never promoted. `services/ingest/src/enrich.ts`
-- carries the full reasoning under "THE STRUCTURED LEGAL OBJECT".
--
-- NOTHING HERE CHANGES WHAT THE PRODUCT READS. 0045's boundary is untouched:
-- no route joins `document_enrichments`, and promotion into a canonical table
-- remains a separate, measured, deliberate step this migration does not build.
--
-- The old constraint is dropped and replaced rather than added alongside,
-- because two CHECKs on one column both have to pass and the old one would
-- reject every new task while looking, from the table definition, like it had
-- been superseded.
ALTER TABLE document_enrichments
  DROP CONSTRAINT IF EXISTS document_enrichments_task_check;

ALTER TABLE document_enrichments
  ADD CONSTRAINT document_enrichments_task_check CHECK (task IN (
    -- 0045's set, unchanged.
    'citation_extraction', 'metadata', 'treatment', 'text_quality',
    'classification', 'statute_reference', 'amendment_event', 'evidence_span',
    -- The structured legal object.
    'case_structure', 'holding', 'arguments', 'authorities', 'topics'
  ));

-- The staged rollout (100 -> 1,000 -> 10,000 -> ...) reads "how did the last
-- stage verify" constantly, and `document_enrichments_task_idx` is
-- (task, verification_state) with no time component, so that question is a
-- scan of every row a task has ever produced. This makes it a range read.
CREATE INDEX IF NOT EXISTS document_enrichments_task_created_idx
  ON document_enrichments (task, created_at DESC);
