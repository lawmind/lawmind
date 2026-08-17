-- Document frequency per lexeme, so the sparse arm can ask a discriminating
-- question instead of a long one.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS TABLE EXISTS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `sparseAny()` in `services/api/src/search/retrieve.ts` caps its OR'd tsquery
-- at 40 terms and picks them with `ORDER BY length(lexeme) DESC`. That comment
-- called itself "a weak proxy for rarest first" and then asserted the proxy
-- holds in this corpus. **NEW1 measured it and it does not** (bus 0664):
--
--     court      5 chars   90.6% of documents      attun   5 chars   0.0%
--     state      5 chars   73.3%                   impos   5 chars   0.0%
--     present    7 chars   52.6%                   delin   5 chars   0.3%
--
-- Of the 40 terms chosen by length, 3 appear in at least half the corpus and 21
-- in under 5%. The terms that actually discriminate are five characters, which
-- is exactly the length the rule discards, while `court` at 90.6% is retained
-- and accounts for essentially the whole match set on its own.
--
-- The cost is not subtle: an OR'd tsquery matching 6,866,609 of 7,296,068 rows
-- (94.1%) took **781,289 ms** with `ORDER BY ts_rank(...)` and **4.47 ms**
-- without it. `ts_rank` must read the `tsvector` of every matching row, so the
-- ranking is the expense, not the probe. Selecting the 8 rarest terms instead
-- matches 492,127 rows, 6.75% — 14x narrower.
--
-- `ts_rank` has no IDF of its own. Nothing in PostgreSQL's full-text ranking
-- knows that `court` is worthless here and `attun` is decisive. So the corpus
-- has to be measured once and the answer stored, which is this table.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- IT IS A SAMPLE, AND THE COLUMNS SAY SO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `document_count` is a count within `sampled_documents`, never a corpus-wide
-- count, because `ts_stat` over 7.3M rows reads every `tsvector` in the table —
-- the same read that makes the query above cost 781 seconds. The ratio is what
-- the query planner-side rule needs, and a ratio from a large random sample is
-- stable enough for "is this term in half the corpus".
--
-- Storing `sampled_documents` on every row rather than in a side table is
-- deliberate: a frequency without its denominator is a number nobody can check,
-- and the builder can be re-run at a different sample size without invalidating
-- rows it has not rewritten.
CREATE TABLE IF NOT EXISTS "lexeme_document_frequency" (
  "lexeme"            text PRIMARY KEY,
  -- Documents IN THE SAMPLE containing this lexeme at least once.
  "document_count"    bigint NOT NULL,
  -- The denominator that `document_count` was measured against.
  "sampled_documents" bigint NOT NULL,
  "built_at"          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "lexeme_document_frequency_counts_sane"
    CHECK ("document_count" > 0 AND "document_count" <= "sampled_documents")
);

-- The access path is "give me the frequency of these 40 lexemes", which the
-- primary key already serves. This index serves the other direction — "which
-- lexemes are too common to be worth querying" — used when building the
-- diagnostic and when a human wants to see what the rule is discarding.
CREATE INDEX IF NOT EXISTS "lexeme_document_frequency_ratio_idx"
  ON "lexeme_document_frequency" (("document_count"::numeric / "sampled_documents"));

COMMENT ON TABLE "lexeme_document_frequency" IS
  'Sampled document frequency per lexeme, for sparse-arm term selection. Derived and '
  'safe to drop and rebuild with services/ingest/src/lexeme-frequency-cli.ts. Asserts '
  'nothing about the law and is never an authority. An ABSENT lexeme means "not seen in '
  'the sample", which the query path must treat as RARE -- dropping an unmeasured term '
  'would silently cost recall, and recall failures are invisible.';
