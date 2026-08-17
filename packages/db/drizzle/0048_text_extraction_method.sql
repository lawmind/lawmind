-- Records HOW a judgment's `full_text` was produced -- 'unpdf' (the default,
-- fast path) or 'pdftotext_fallback' (the repair pass `text.ts`'s
-- `fetchPdfText` runs when `unpdf`'s output fails `classifyCorruption`,
-- `docs/CURRENT_PLAN.md` Q1.27).
--
-- Without this, the corruption-repair fix has no visibility of its own: there
-- is no way to ask "how many documents actually needed the fallback" or "did
-- the fix change anything" without re-running `classifyCorruption` over the
-- whole corpus by hand. Same provenance rationale as the already-established
-- `parties_extraction_method` (migration 0037) -- this is a distinct column,
-- not a reuse of that one, because they answer different questions (how the
-- PARTIES were derived vs how the TEXT was extracted) and a single ingest run
-- can set one without the other.
--
-- Nullable: every row ingested before this migration, and any row written by
-- a path that does not go through `fetchPdfText`, carries NULL -- "not
-- recorded", never "unpdf" by default guess.
ALTER TABLE judgments
  ADD COLUMN IF NOT EXISTS text_extraction_method text;
