-- 0083 — QUALITY SCREEN RUNS: make completed screen coverage answerable by
-- query instead of by rescanning 18.7 million rows.
--
-- Owner: NEW2 (data truth / provenance). Round: LAUNCH CONVERGENCE SPRINT V2 §8
-- / NEW2-3. Evidence: docs/ai/new2/BODY_TEXT_EVIDENCE_STATE_V1.md.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE QUESTION THIS ANSWERS, AND THE ONE IT REFUSES TO ANSWER
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Today LawMind cannot distinguish "we looked at this document and found no
-- damage" from "we have never looked at this document". Both read as an absent
-- verdict. 16.9 million documents were screened on 21-22 August and the corpus
-- has no memory of it.
--
-- The three states this makes queryable:
--
--   PROVEN_DAMAGED             a proof-grade detector convicted it
--   SCREENED_DAMAGED           a weaker screen convicted it
--   SCREENED_NO_DAMAGE_FOUND   a named screen ran over this document and did not convict
--   NEVER_SCREENED             no screen has ever run over it
--
-- `SCREENED_NO_DAMAGE_FOUND` IS NOT "CLEAN" AND MUST NEVER BE RENDERED AS
-- CLEAN. The English-density screen missed 32 of 43 glyph dumps whose signature
-- footer lifts the English rate, and `text_quality >= 0.85` certifies documents
-- that are pure garbage. A screen that did not convict has FOUND NO DAMAGE; it
-- has not certified the text. Renaming UNKNOWN to CLEAN is the failure this
-- whole table exists to prevent, and doing it one level further down would be
-- the same mistake wearing a better name.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ONE ROW PER RUN, NOT ONE ROW PER DOCUMENT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- An earlier design proposed `(judgment_id, method, ...)` — 18.7M rows per pass.
-- That table CANNOT BE POPULATED from the evidence we hold: the screen's
-- checkpoint records counts and a cursor, and names no ids. A run-level record
-- is what the evidence actually supports, and it is three orders of magnitude
-- smaller.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `started_at` IS THE WATERMARK, AND THE CURSOR IS DELIBERATELY NOT A COLUMN
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Coverage is established by `judgments.created_at < run.started_at`, never by
-- comparing against the walk's id cursor.
--
-- `judgments.id` is a uuid v4. Of the 16 documents created after that run
-- finished, ALL 16 sit BELOW its final id cursor — so an id watermark would
-- have certified 16 of 16 documents the screen never saw. That is not a
-- hypothetical; it is measured, in BODY_TEXT_EVIDENCE_STATE_V1 §3.
--
-- The cursor is therefore absent from this table ON PURPOSE, so that it cannot
-- be used by accident by someone who did not read this comment.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `covers_corpus` IS A COLUMN AND NOT AN INFERENCE FROM `scope`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A run that walked a SUBSET establishes no coverage at all, however recent its
-- `started_at`. `text-damage-v2.0` is exactly that case: its checkpoint records
-- 1,626,762 rows read against a corpus of 18.7 million, so its verdicts are a
-- FLOOR on damage and its silence means nothing.
--
-- Recording such a run is still worth doing — it is how PROVEN_DAMAGED coverage
-- gets priced — but only `covers_corpus = true` may move a document out of
-- NEVER_SCREENED. Storing that as a boolean rather than inferring it from a
-- scope string means a future scope name cannot quietly acquire corpus
-- authority.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS MIGRATION DOES NOT TOUCH `judgment_quality_contract`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- That view is LCC's, `body-text-safety.test.ts` pins its `body_text_safe`
-- expression against `pg_get_viewdef`, and 0081 is the standing warning about
-- what rewriting a view from a stale migration file nearly cost: the file was
-- ten columns behind the deployed object and PostgreSQL refused with 42P16.
--
-- So the new state is exposed as its OWN additive view. Nothing existing
-- changes, no tripwire moves, no column count can fall. Folding the column into
-- `judgment_quality_contract` is a one-expression change that belongs to LCC,
-- and the expression is right here for them to lift.

CREATE TABLE IF NOT EXISTS quality_screen_runs (
  method            text        NOT NULL,   -- 'english_density_screen_v1'
  scope             text        NOT NULL,   -- 'all' | 'staged' | a named subset
  covers_corpus     boolean     NOT NULL,   -- see above. ONLY true establishes coverage.
  started_at        timestamptz NOT NULL,   -- THE WATERMARK
  finished_at       timestamptz NOT NULL,
  rows_screened     bigint      NOT NULL,
  convicted         bigint      NOT NULL,
  source_checkpoint text,                   -- the file this row was imported from
  checkpoint_sha256 text,                   -- ...and its digest, so the import is auditable
  imported_at       timestamptz NOT NULL DEFAULT now(),
  note              text,
  PRIMARY KEY (method, scope, started_at),
  CONSTRAINT quality_screen_runs_window_ck   CHECK (finished_at >= started_at),
  CONSTRAINT quality_screen_runs_counts_ck   CHECK (rows_screened >= 0 AND convicted >= 0
                                                    AND convicted <= rows_screened)
);

COMMENT ON TABLE quality_screen_runs IS
  'One row per COMPLETED quality-screen pass. started_at is the coverage watermark: '
  'a document is covered when judgments.created_at < started_at AND covers_corpus. '
  'The walk cursor is deliberately NOT a column -- judgments.id is a uuid v4 and an '
  'id watermark certified 16 of 16 documents the screen never saw (measured, '
  'BODY_TEXT_EVIDENCE_STATE_V1 section 3).';

COMMENT ON COLUMN quality_screen_runs.covers_corpus IS
  'true only for a pass that walked the WHOLE corpus. A subset run establishes no '
  'coverage however recent it is; text-damage-v2.0 read 1,626,762 of 18.7M rows, so '
  'its verdicts are a floor on damage and its silence means nothing.';

-- Only corpus-covering runs are consulted for coverage, so index for that read.
CREATE INDEX IF NOT EXISTS quality_screen_runs_coverage_idx
  ON quality_screen_runs (started_at DESC) WHERE covers_corpus;

-- ── The exposed state ──────────────────────────────────────────────────────
--
-- Additive and standalone. Shipping it BEFORE any run row is imported is safe
-- in the only direction that matters: with the table empty every unconvicted
-- document reads NEVER_SCREENED, so the contract can afterwards become more
-- generous as evidence arrives, never less.
--
-- `script_quality` currently only ever holds convictions ('damaged_other',
-- 'legacy_font_ascii'); 'clean' and 'mixed_script_ok' are contemplated by 0072
-- and unobserved. They are excluded here anyway, because a future writer that
-- records a non-conviction in that column must not have every such row silently
-- relabelled DAMAGED.

CREATE OR REPLACE VIEW judgment_body_text_evidence AS
SELECT
  j.id,
  j.created_at,
  CASE
    WHEN j.script_quality IS NOT NULL
     AND j.script_quality NOT IN ('clean', 'mixed_script_ok')
     AND j.script_quality_method = 'text-damage-v2.0'          THEN 'PROVEN_DAMAGED'
    WHEN j.script_quality IS NOT NULL
     AND j.script_quality NOT IN ('clean', 'mixed_script_ok')  THEN 'SCREENED_DAMAGED'
    WHEN EXISTS (SELECT 1 FROM quality_screen_runs r
                  WHERE r.covers_corpus
                    AND j.created_at < r.started_at)           THEN 'SCREENED_NO_DAMAGE_FOUND'
    ELSE                                                            'NEVER_SCREENED'
  END AS body_text_evidence
FROM judgments j;

COMMENT ON VIEW judgment_body_text_evidence IS
  'PROVEN_DAMAGED / SCREENED_DAMAGED / SCREENED_NO_DAMAGE_FOUND / NEVER_SCREENED. '
  'SCREENED_NO_DAMAGE_FOUND IS NOT "clean" -- a named screen ran and did not convict, '
  'and the same screen missed 32 of 43 glyph dumps. It refuses nothing and certifies '
  'nothing. Documents ingested after a completed run stay NEVER_SCREENED until a pass '
  'covers them, which is correct behaviour and not a gap.';
