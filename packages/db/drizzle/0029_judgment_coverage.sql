-- Coverage per court per year — what EXISTS at the source, against what we hold.
--
-- `docs/CURRENT_PLAN.md` §Q1.1 / §A3.6. `CLAUDE.md`: **silence about a gap does
-- the same damage as a fabricated citation** — both let an advocate rely on
-- something absent. Today `SELECT court, count(*) FROM judgments` returns one
-- row, Supreme Court of India, and an advocate practising in a High Court gets a
-- confident-looking result set with nothing saying we do not cover their court.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY NOT `corpus_coverage`, WHICH ALREADY EXISTS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `corpus_coverage` is keyed `source text PRIMARY KEY` — one row per source,
-- holding enumeration state for that source as a whole. It is the right shape
-- for *"has indiacode been fully enumerated"* and it cannot express *"Allahabad,
-- 2024"* without encoding two dimensions into a text key, which would make
-- "count by court" and "count by year" both unanswerable.
--
-- This is a different GRAIN, not a replacement. `corpus_coverage` keeps its job.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- IT STORES DOCUMENTS, NOT JUDGMENTS, AND THE DISTINCTION IS THE POINT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `docs/HC_CORPUS_SURVEY.md`, measured 10 Aug 2026: the AWS High Court bucket
-- holds **15,771,566 documents** in the last decade. **How many are judgments is
-- a RANGE, 0.75% to 18.64%**, because the only label available — `order_type`,
-- published by four of twenty-five courts — has a `View Judgement/Order` value
-- covering 17.89% of rows that does not distinguish the two.
--
-- So the column is `source_documents` and it is named for what it counts. **A
-- column called `source_judgments` would be a number nobody measured**, and
-- rendering "0 of 3,493,695 judgments" when 3,493,695 is a document count is the
-- kind of confident wrong figure this project keeps catching in itself.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IS *NOT* STORED: `held`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- What we hold is derived at query time from `judgments`, never stored, for the
-- same reason `/statutes` derives `held: rows.length` rather than caching it:
-- a stored count drifts the moment an ingest writes a row, and a coverage figure
-- that is stale in the reassuring direction is worse than none. **The expensive
-- half is the source enumeration** — 1,493 parquet footers — and that is the
-- half worth persisting.
CREATE TABLE IF NOT EXISTS judgment_coverage (
  -- Which bucket or feed this row describes, e.g. `aws_high_court`.
  source           text    NOT NULL,
  -- The source's own court code, e.g. `9_13`. Kept because it is the only
  -- stable join back to the bucket's partitions; the display name is not.
  court_code       text    NOT NULL,
  -- As published by the source, e.g. `Allahabad High Court`. Stored rather than
  -- looked up so a rendered gap does not depend on a mapping table nobody owns.
  court_name       text    NOT NULL,
  year             integer NOT NULL,
  -- DOCUMENTS. See above. Judgments are a subset and the ratio is a measured
  -- range, not a known number.
  source_documents integer NOT NULL,
  -- When the source was counted — distinct from when this row was written.
  -- A coverage claim with no date is not checkable.
  enumerated_at    timestamptz NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (source, court_code, year),

  -- A negative count is a bug in the enumerator, and letting one land would make
  -- "sum the coverage" quietly wrong rather than loudly wrong.
  CONSTRAINT judgment_coverage_documents_non_negative CHECK (source_documents >= 0),
  -- Guards against a year parsed out of a malformed partition key. The bucket
  -- runs 1950–2026; the ceiling is deliberately loose, the floor is not.
  CONSTRAINT judgment_coverage_year_plausible CHECK (year BETWEEN 1800 AND 2200)
);

-- "Which courts do we cover, worst first" and "what does year X look like" are
-- the two questions the product asks. Both are cheap at 275 rows, but the index
-- keeps them cheap when every High Court year since 1950 is loaded.
CREATE INDEX IF NOT EXISTS judgment_coverage_court_idx
  ON judgment_coverage (source, court_name);
CREATE INDEX IF NOT EXISTS judgment_coverage_year_idx
  ON judgment_coverage (source, year);
