-- judgments.native_text — whether the source PDF had a usable text layer,
-- per docs/ai/AWS_CORPUS_INVENTORY.md §6.
--
-- The classifier is not new: services/ingest/src/harvest/hc-extract.ts's
-- measureExtraction() already computed characters-per-page against a
-- 100-char floor and validated it against real High Court PDFs in the
-- extraction-cost benchmark (docs/CURRENT_PLAN.md §A3.3). It was never wired
-- to persist a value per judgment — this column and the loader changes in
-- the same commit close that gap for every future write.
--
-- NULL means not computed (a row whose text arrived some other way than the
-- real ingest's fetchPdfText path, or every one of the 79,321 rows that
-- predate this migration), never a guess at scan-vs-native. Unlike
-- content_hash/text_quality, this cannot be backfilled from what is already
-- in Postgres — computing it needs the source PDF's page count, which
-- requires re-fetching the PDF, not just re-reading already-stored text.
ALTER TABLE judgments
  ADD COLUMN IF NOT EXISTS native_text boolean;
