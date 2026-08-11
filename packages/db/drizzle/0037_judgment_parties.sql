-- Structured parties — docs/ai/LEGAL_STRUCTURE.md, Stage 5 of the DATA ->
-- RETRIEVAL EXECUTION PROGRAM.
--
-- Two methods, both deterministic, never an LLM:
--
--   source_metadata  the court's own filed petitioner/respondent fields,
--                     present on the Supreme Court source metadata and never
--                     threaded into JudgmentRecord until this migration --
--                     the same class of gap as the cnr column found dropped
--                     for the whole corpus, task 007.
--   title_parsed     deterministic case_title separator splitting
--                     (services/ingest/src/parties.ts) -- the only method
--                     available for every held High Court row, since the
--                     plain-variant metadata (the only variant actually
--                     ingested) carries no petitioner/respondent field.
--   unknown           neither method found a usable value.
--
-- case_title remains the display source of truth. These columns are a
-- queryable, structured view of it -- never a replacement, never a claim of
-- higher accuracy than the source itself supports.

CREATE TYPE parties_extraction_method AS ENUM ('source_metadata', 'title_parsed', 'unknown');

ALTER TABLE judgments ADD COLUMN IF NOT EXISTS petitioner text;
ALTER TABLE judgments ADD COLUMN IF NOT EXISTS respondent text;
ALTER TABLE judgments ADD COLUMN IF NOT EXISTS parties_extraction_method parties_extraction_method;
