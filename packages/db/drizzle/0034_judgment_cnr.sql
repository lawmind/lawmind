-- judgments.cnr — the eCourts Case Number Record, the canonical cross-source
-- identity key (docs/DATA_ADVANTAGE.md: "CNR is what eCourts resolves").
--
-- Found present in BOTH source metadata schemas this corpus ingests from
-- (SciMetadataRow.cnr for the Supreme Court, HcMetadataRow.cnr for the High
-- Courts — services/ingest/src/sci.ts, services/ingest/src/harvest/hc-load.ts)
-- and read by neither mapping function into JudgmentRecord — silently
-- discarded before it ever reached the database, for the entire corpus.
-- schema.ts's own comment on judgments_source_url_key already named the gap
-- this column exists to close: "this does NOT deduplicate the same judgment
-- arriving from two different sources — that is citation-level identity".
--
-- Partial index, not a unique constraint: data quality across 25+ courts is
-- not yet proven clean enough to enforce uniqueness without risking a
-- rejected ingest write on a legitimate edge case — the same caution already
-- applied to content_hash in migration 0031.
ALTER TABLE judgments
  ADD COLUMN IF NOT EXISTS cnr text;

CREATE INDEX IF NOT EXISTS judgments_cnr_idx
  ON judgments (cnr)
  WHERE cnr IS NOT NULL;
