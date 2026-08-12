-- Paragraph-level evidence for every judgment, WITHOUT embeddings.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE DECISION THIS IMPLEMENTS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Founder call, 13 Aug 2026: **fund chunk-text coverage now, start embeddings
-- only once every court's data is held, every case and citation is in, and the
-- corpus is structured.** Data first, vectors second.
--
-- The measurement behind it: NEW1 found 94.5% of successfully-retrieved queries
-- returning an empty `operativeParagraph`. Root cause was not the evidence layer
-- but chunk coverage -- **40,161 of 600,073 judgments had chunks (6.7%)** -- and
-- the corpus had grown 7x underneath a table that only ever covered the Supreme
-- Court.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A NEW TABLE AND NOT MORE ROWS IN `judgment_chunks`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `judgment_chunks` is the VECTOR table. `retrieve.ts`'s dense query is
-- `ORDER BY c.embedding <=> $1 LIMIT n` over it, with **no `WHERE embedding IS
-- NOT NULL`** -- checked, not assumed. Adding ~550,000 embedding-less rows would
-- grow that table roughly 15x and invite the planner to abandon the HNSW index
-- for a sequential scan, degrading production search to buy evidence display.
-- Paying for one feature with another's latency is not a trade worth making
-- silently.
--
-- Separate table, so the vector table stays exactly as small and as fast as it
-- is today. When embeddings are eventually funded, chunks can be derived FROM
-- these paragraphs rather than re-split from scratch.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY PARAGRAPHS RATHER THAN FIXED-SIZE WINDOWS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The Supreme Court's own July 2023 direction requires that **"all paragraphs
-- should be numbered sequentially commencing with the initial paragraph"**, so
-- an Indian judgment carries its own citable units and we do not have to invent
-- them. That gives a pinpoint reference an advocate can actually use -- "para
-- 14" is what goes in a filing -- and it matches the retrieval literature:
-- structure-preserving segmentation outperforms sequential fixed-size chunking
-- on legal text, where a provision's meaning is bound to its heading and
-- numbering.
--
-- `char_offset`/`char_length` are stored so every paragraph resolves back to a
-- byte-exact span of `judgments.full_text`. A paragraph that cannot be located
-- in the source is not evidence, and this table exists to serve evidence.
CREATE TABLE IF NOT EXISTS judgment_paragraphs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judgment_id uuid NOT NULL REFERENCES judgments(id) ON DELETE CASCADE,

  -- Position in the document, always present, 0-based. This is the ordering
  -- key; it exists even when the judgment prints no numbers at all.
  paragraph_index integer NOT NULL,
  -- The number the COURT printed, when one was printed. NULL is a real and
  -- common answer -- a cause title, a coram line and an unnumbered preamble
  -- have no paragraph number, and inventing one would put a false pinpoint
  -- reference in front of an advocate.
  paragraph_number integer,

  -- Byte-exact span in `judgments.full_text`. Never approximate.
  char_offset integer NOT NULL,
  char_length integer NOT NULL,
  paragraph_text text NOT NULL,

  -- Hash of the source text this was derived from, so a re-extracted or
  -- repaired judgment invalidates its own paragraphs rather than leaving spans
  -- pointing into text that no longer exists. The Bombay repair moved 2,401
  -- documents' text by roughly double; this is the column that makes that
  -- detectable instead of silent.
  source_text_hash text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT judgment_paragraphs_unique UNIQUE (judgment_id, paragraph_index),
  CONSTRAINT judgment_paragraphs_span_check CHECK (char_offset >= 0 AND char_length > 0)
);

CREATE INDEX IF NOT EXISTS judgment_paragraphs_judgment_idx
  ON judgment_paragraphs (judgment_id, paragraph_index);
-- Answers "give me paragraph 14 of this judgment" directly, which is the
-- pinpoint an advocate cites.
CREATE INDEX IF NOT EXISTS judgment_paragraphs_number_idx
  ON judgment_paragraphs (judgment_id, paragraph_number)
  WHERE paragraph_number IS NOT NULL;

ANALYZE judgment_paragraphs;
