-- Content hash, text quality and source-stated document type on `judgments`.
--
-- `docs/ai/tasks/003-corpus-inventory.md` / RETRIEVAL_PROGRAM §003, and the
-- autonomous-execution charter's §10: before the paused High Court ingest can
-- resume, the loader needs to track content hash, duplicate status and
-- extraction confidence per document — none of which `judgments` carried.
-- `docs/HC_CORPUS_SURVEY.md` found the AWS bucket's two metadata variants
-- share ZERO CNRs, so the same underlying judgment can plausibly reach this
-- table twice under two different `source_url`s. `source_url` uniqueness
-- catches a re-fetch of the same document; it cannot catch that.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THESE THREE AND NOT MORE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `content_hash` — a cheap, honest dedup signal: sha256 of `full_text`. Two
-- rows sharing a hash are the same text, independent of source_url, court
-- code, or which metadata variant produced them. It answers "is this a
-- duplicate", not "which one is canonical" — that judgement stays a human or
-- ingest-design decision, this just makes the collision visible.
--
-- `text_quality` — the SAME measured proxy already on `judgment_chunks`
-- (`docs/SCHEMA_TRUTH.md` §judgment_chunks), applied at the judgment level.
-- It measures visible OCR/extraction damage, never correctness — a
-- confidently-wrong character scores a clean 1.000. This is deliberately
-- the existing metric, not a new one: `services/embed/src/quality.ts`
-- computes it and this migration gives judgments a place to hold it.
--
-- `source_document_type` — verbatim, from the source metadata's own
-- `order_type` column where the source publishes one (today: the AWS High
-- Court bucket's mobile variant, 4 of 25 courts, `HC_CORPUS_SURVEY.md` §2).
-- **Stored exactly as the source wrote it, never classified or guessed** —
-- `View Judgement/Order` stays `View Judgement/Order` rather than being
-- resolved to one side of an ambiguity nobody can resolve from metadata
-- alone. `DOMAIN_TRUTH.md`: render only what is stored, and the same
-- discipline applies to what gets stored in the first place.
--
-- All three are NULL-capable and NULL means exactly what it means everywhere
-- else in this schema: not computed, not a negative result. Existing rows are
-- NOT backfilled by this migration — `services/ingest/src/backfill-provenance.ts`
-- (dry-by-default) does that separately, over text already in Postgres, no
-- re-fetch required.
ALTER TABLE judgments
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS text_quality numeric(4,3),
  ADD COLUMN IF NOT EXISTS source_document_type text;

-- Partial: a dedup check ("does this hash already exist") is the only query
-- this index serves, and NULL is the majority for as long as any row has not
-- been backfilled.
CREATE INDEX IF NOT EXISTS judgments_content_hash_idx
  ON judgments (content_hash) WHERE content_hash IS NOT NULL;
