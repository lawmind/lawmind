-- `judgments.bench` held a database slug on half the corpus.
--
-- Measured against production 11 Aug 2026: 40,705 of 79,322 rows (51.3%) carry
-- values like `patnahcucisdb94`, `gujarathc`, `newos`, `kolhcdb` in the column
-- the API sends as the coram and the judgment screen renders as the judges.
-- Every one of them is a High Court row, and ZERO of them have a matching row
-- in `judgment_judges` -- so the slug is not a badly-formatted judge list, it is
-- not a judge list at all.
--
-- ROOT CAUSE, one sentence: `services/ingest/src/harvest/hc-load.ts` wrote
-- `bench: partitions.bench` -- the AWS bucket's S3 PARTITION KEY
-- (`.../court=10_8/bench=patnahcucisdb94/...`), which identifies the court
-- establishment that published the file -- into a column that means the judges
-- who sat. The word is the same in both places and means two different things,
-- which is why it looked correct at every step.
--
-- The partition value is real provenance and is NOT discarded: it moves here.
-- `bench` goes NULL for those rows, which is an existing, already-handled state
-- (16 rows were already NULL before this) and is the honest one -- the plain
-- High Court metadata variant, the only one we hold, publishes no judge field
-- at all.
--
-- This is also the answer to RCC bus 0046's bench-strength filter question:
-- bench strength cannot be derived from this column, because on half the corpus
-- the column was never about judges.

ALTER TABLE judgments ADD COLUMN IF NOT EXISTS source_bench_code text;

COMMENT ON COLUMN judgments.source_bench_code IS
  'The source''s own court-establishment code, verbatim -- the AWS High Court bucket''s bench= partition key. Provenance, never a coram. NULL on Supreme Court rows, which have no such partition.';

COMMENT ON COLUMN judgments.bench IS
  'The judges who sat, as the source printed them. NULL where the source publishes none -- see source_bench_code. Never a court code.';
