-- ───────────────────────────────────────────────────────────────────────────
-- SCRIPT QUALITY, AND THE EMBEDDING ELIGIBILITY CONTRACT
-- ───────────────────────────────────────────────────────────────────────────
--
-- Two things that have to land together, because each is useless alone: a place
-- to record what we know about a document's TEXT, and a definition of which
-- documents are worth a vector that can read it.
--
-- ── WHY `script_quality` IS A COLUMN AND NOT A NUMBER IN `text_quality`
--
-- `judgments.text_quality` already exists and scores Latin-token plausibility.
-- Three extraction failure modes are now measured, and it catches only one:
--
--   1. missing or bad text layer          — caught: the score collapses.
--   2. Poppler silently DELETING Devanagari — NOT caught. What survives is
--      clean Latin text, so the score is HIGH and the document is half gone.
--      NEW2 measured Rajasthan at 95.3% Devanagari-defective this way.
--   3. legacy Kruti Dev / non-Unicode Hindi fonts — NOT caught, and worse:
--      the bytes are valid ASCII, so every character-class metric reads clean
--      while the text is meaningless. NEW3, 18 Aug 2026.
--
-- Modes 2 and 3 both produce a HIGH `text_quality` on a document that must not
-- be embedded. A second scalar squeezed into the same column would have to mean
-- two incompatible things, so this is a separate, nullable verdict with its own
-- provenance — the shape NEW2 asked for in bus 0681 and did not write alone.
--
-- ── NULL MEANS "NEVER ASSESSED", AND THAT IS NOT "BAD"
--
-- 51.2% of everything ever assessed for `hc_document_class` could not be
-- classified (NEW2, bus 0714), and 93.4% of the corpus has never been looked at
-- at all. A contract that reads NULL as a failure blocks on a classification
-- run that measurably will not converge. So every axis below treats NULL as
-- "unknown, not disqualifying", and only a KNOWN-BAD verdict excludes.
--
-- `script_quality_method` carries HOW the verdict was reached, deliberately
-- mirroring `hc_class_method` — which is the column that let NEW2 tell "looked
-- at and could not judge" apart from "never looked", and the reason NEW1 can
-- use it as a selector at all.
--
-- ── PROCESS STATE IS NOT A QUALITY VERDICT
--
-- `ocr_candidate` and `ocr_repaired` describe where a document is in a WORKFLOW.
-- They are not values of `script_quality` and must never be added to it: a
-- document queued for OCR and a document whose script was destroyed are the same
-- row for a scheduler and opposite rows for a retriever.

-- ── THIS MIGRATION MUST BE ABLE TO GIVE UP, AND HERE IS WHY
--
-- Run once without this guard, 18 Aug 2026. `ALTER TABLE judgments` needs
-- ACCESS EXCLUSIVE. It could not get it — a 1,683-second UPDATE held the table
-- — so it joined the lock queue. **A waiting ACCESS EXCLUSIVE request blocks
-- every lock request made after it**, so within seconds twelve ingest INSERTs
-- and a paragraph write were stalled behind a migration that had not acquired
-- anything and had changed nothing. The fleet stopped for two minutes because a
-- DDL statement was POLITELY WAITING.
--
-- `lock_timeout` inverts that: the ALTER waits three seconds, and if the table
-- is busy it fails and takes its place in the queue with it. A failed migration
-- is re-runnable. A stalled fleet is not recoverable by waiting, because the
-- queue behind the DDL only grows.
--
-- LOCAL, so it reverts with the transaction and never leaks to another session.
SET LOCAL lock_timeout = '3s';

ALTER TABLE judgments ADD COLUMN IF NOT EXISTS script_quality text;
ALTER TABLE judgments ADD COLUMN IF NOT EXISTS script_quality_method text;
ALTER TABLE judgments ADD COLUMN IF NOT EXISTS script_quality_at timestamptz;

-- The vocabulary is closed and checked. An unrecognised verdict is a silent
-- selector change — a value nobody excludes on becomes an inclusion by default,
-- which is the exact way garbage reaches an index.
--
-- NOT an enum type: NEW2 owns the detectors and will add verdicts as modes are
-- found, and adding a value to a CHECK is a one-line migration while altering a
-- pg enum under a 15M-row table is not.
ALTER TABLE judgments DROP CONSTRAINT IF EXISTS judgments_script_quality_check;
-- NOT VALID, and that is not a shortcut. A validating CHECK scans all 15M rows
-- while holding the lock above, which is the same fleet stall in a slower form.
-- Every existing row is NULL — the column was created three statements ago — so
-- there is nothing to validate, and NOT VALID still enforces the constraint on
-- every INSERT and UPDATE from this moment on. That is the whole job: the
-- vocabulary is closed for future writes.
ALTER TABLE judgments ADD CONSTRAINT judgments_script_quality_check CHECK (
  script_quality IS NULL OR script_quality IN (
    -- Text is what the court published, in whatever script it published it.
    'clean',
    -- Devanagari was present at source and is absent from our text. Poppler.
    'devanagari_deleted',
    -- Valid ASCII bytes that are not words — Kruti Dev and its relatives.
    'legacy_font_ascii',
    -- Latin and Devanagari both present and both plausible.
    'mixed_script_ok',
    -- Assessed and found damaged in a way none of the above names. Excluded
    -- like the others; exists so a detector never has to lie to record a
    -- failure it cannot classify.
    'damaged_other'
  )
) NOT VALID;

-- Partial: 100% of rows are NULL today and will stay mostly NULL for a long
-- time. An index over the assessed minority is small and is the one a selector
-- actually probes.
CREATE INDEX IF NOT EXISTS judgments_script_quality_idx
  ON judgments (script_quality) WHERE script_quality IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- THE ELIGIBILITY VIEW
-- ───────────────────────────────────────────────────────────────────────────
--
-- FOUR INDEPENDENT AXES, never collapsed into one flag. A document can be safe
-- to search but not precedent-grade; precedent-grade but of uncertain class;
-- canonical but textually corrupt. One boolean cannot say any of that, and the
-- moment it tries, the reason a document was excluded stops being answerable.
--
--   A  identity      do we know WHICH decision this is
--   B  text          is the text we hold usable
--   C  role          is this a decision or a piece of court admin
--   D  value         is there enough here for a vector to mean anything
--
-- A VIEW rather than a materialised table or a column on `judgments`:
--   · a column would be a 15M-row UPDATE, i.e. a DB_SCAN plus a rewrite, and
--     would be stale the moment a detector improved;
--   · a materialised table is a second truth that drifts from its definition;
--   · a view is a macro. `WHERE id > $cursor ORDER BY id LIMIT 1000` pushes the
--     keyset predicate straight into `judgments_pkey`, so a consumer walks it
--     incrementally without anything scanning 15M rows.
--
-- The definition is versioned. `docs/ai/EMBEDDING_ELIGIBILITY_CONTRACT.md`
-- carries the version, the measured population and the hash, and a manifest
-- names the version it was generated under. A selector whose definition moved
-- silently is a selector whose measured precision means nothing.
DROP VIEW IF EXISTS judgment_embedding_eligibility;
CREATE VIEW judgment_embedding_eligibility AS
SELECT
  j.id,
  j.court,
  j.judgment_date,
  j.content_hash,
  j.hc_document_class,
  j.hc_class_method,
  j.script_quality,
  j.text_quality,
  length(j.full_text) AS text_length,

  -- ── AXIS A · CANONICAL IDENTITY ────────────────────────────────────────
  -- Measured 18 Aug 2026 on a 0.2% sample (n=30,177): 100% pass. Identity is
  -- not the discriminator in this corpus and the axis is kept anyway, because
  -- the day an ingest lands rows without a case number this is the check that
  -- notices rather than the retriever.
  --
  -- Duplicate collapse is NOT here. 36,310 ambiguous citation keys are ONE
  -- decision each, byte-identical by `content_hash`, covering 104,930 judgments
  -- (`docs/ai/AMBIGUOUS_CITATION_POPULATION.md`). Collapsing them needs a walk
  -- of the whole `content_hash` index, which is DB_SCAN work — so this view
  -- EXPOSES `content_hash` and the consumer collapses. A view that pretended to
  -- collapse within whatever window it was asked for would silently emit one
  -- representative PER WINDOW.
  (
    j.content_hash IS NOT NULL
    AND j.case_number IS NOT NULL
    AND j.judgment_date IS NOT NULL
    AND j.court IS NOT NULL
    AND length(coalesce(j.case_title, '')) > 3
  ) AS axis_a_identity,

  -- ── AXIS B · TEXT QUALITY ──────────────────────────────────────────────
  -- `text_quality >= 0.85` and a script verdict that is not known-bad. NULL
  -- script passes: 100% of the corpus is unassessed today and excluding on
  -- absence would empty the tier.
  (
    j.full_text IS NOT NULL
    AND coalesce(j.text_quality, 0) >= 0.85
    AND (j.script_quality IS NULL OR j.script_quality IN ('clean', 'mixed_script_ok'))
  ) AS axis_b_text,

  -- ── AXIS C · DOCUMENT ROLE ─────────────────────────────────────────────
  -- Only KNOWN court admin is excluded. `bail_order` is broken out rather than
  -- excluded or included: bail orders are practically useful and are not
  -- precedent, so which tier they belong in is a retrieval question and NEW1's
  -- to answer with a measurement, not mine to settle in a WHERE clause.
  (
    j.hc_document_class IS NULL
    OR j.hc_document_class NOT IN ('procedural_disposal', 'reference_stub')
  ) AS axis_c_role,
  (j.hc_document_class = 'bail_order') AS is_bail_order,

  -- ── AXIS D · EMBEDDING VALUE ───────────────────────────────────────────
  -- Length only, and stated as a band rather than a boolean so the threshold
  -- stays the consumer's decision. Measured shares of the corpus passing
  -- A ∧ B ∧ C at each band, 0.2% sample, 18 Aug 2026:
  --   >= 1,000 chars  79.8%
  --   >= 2,000 chars  56.7%
  --   >= 4,000 chars  25.4%
  --   >= 8,000 chars   9.4%
  CASE
    WHEN length(j.full_text) >= 8000 THEN 'substantial'
    WHEN length(j.full_text) >= 4000 THEN 'full'
    WHEN length(j.full_text) >= 2000 THEN 'standard'
    WHEN length(j.full_text) >= 1000 THEN 'brief'
    ELSE 'stub'
  END AS value_band
FROM judgments j;

COMMENT ON VIEW judgment_embedding_eligibility IS
  'Embedding eligibility, four independent axes, contract v1 — see docs/ai/EMBEDDING_ELIGIBILITY_CONTRACT.md. Keyset-friendly: filter on id and ORDER BY id to walk it incrementally. Duplicate collapse is the consumer''s, by content_hash.';
