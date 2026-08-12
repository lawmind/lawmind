-- Recovers the exact character span each chunk occupies in `judgments.full_text`
-- -- Stage 13 of `docs/ai/STAGES_9_20_PLAN.md`, "evidence retrieval: authority +
-- paragraph + exact span."
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE DATA ALREADY EXISTED AND WAS BEING THROWN AWAY
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `services/embed/src/chunk.ts`'s `chunkJudgment` computes an exact character
-- offset for every chunk's body at ingest time -- "lets a citation point back
-- at the span" is the comment it has always carried. Nothing has ever written
-- that offset to this table; `services/embed/src/cli.ts` discarded it before
-- the INSERT. So every read path that wants to show an advocate the exact text
-- a result rests on has had to re-derive an approximate location by fuzzy
-- substring search (`services/api/src/judgments/paragraphs.ts#locateParagraph`)
-- instead of reading a number that was already computed and correct.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY TWO COLUMNS, NOT ONE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `char_offset` alone is not enough to recover an exact span: `chunk_text`
-- itself is LONGER than the chunk's own body whenever it carries a previous
-- chunk's overlap tail (`chunk.ts`'s `overlapChars`), so `chunk_text.length`
-- cannot be used as the span length. `char_length` is the body's own length,
-- and `full_text[char_offset : char_offset + char_length]` is exactly the
-- body -- verbatim by construction, never approximated.
--
-- Nullable, deliberately. 616,197 existing chunks were embedded before this
-- column existed and cannot be assumed correct without independent
-- verification -- `services/embed/src/backfill-offsets-cli.ts` re-derives them
-- by re-chunking each judgment's stored `full_text` and matching chunk_text
-- byte-for-byte before trusting the derived offset, exactly the discipline
-- `SCHEMA_TRUTH.md`'s own standing rule expects of a backfill. A NULL means
-- "not yet backfilled or could not be verified", never "no span exists" -- the
-- read path must treat NULL as "exact span unavailable, fall back to the
-- located paragraph", never invent one.
ALTER TABLE judgment_chunks
  ADD COLUMN IF NOT EXISTS char_offset integer,
  ADD COLUMN IF NOT EXISTS char_length integer,
  ADD CONSTRAINT judgment_chunks_char_offset_non_negative
    CHECK (char_offset IS NULL OR char_offset >= 0),
  ADD CONSTRAINT judgment_chunks_char_length_positive
    CHECK (char_length IS NULL OR char_length > 0);
