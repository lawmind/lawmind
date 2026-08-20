-- ───────────────────────────────────────────────────────────────────────────
-- `coverage_cell` — the two INDEPENDENT coverage axes, per court × year
-- ───────────────────────────────────────────────────────────────────────────
--
-- NEW1's `docs/ai/NEW1_COVERAGE_STATE_CONTRACT.md` (bus 0724) asks the retrieval
-- path for a coverage object on every response and names the reason it cannot be
-- computed per request: the grouped count over `judgments` that produces it took
-- **86.5 seconds** on the live box, and 738 of 1,219 slow statements there are
-- already the retrieval path. So it is a precomputed table read by one indexed
-- lookup, refreshed by a bounded job.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHY TWO AXES AND NOT ONE NUMBER
-- ───────────────────────────────────────────────────────────────────────────
--
-- Every coverage figure in this repo so far answers *"do we hold the document"*.
-- There is a second question that produces the IDENTICAL empty screen: *"can the
-- arm serving this query reach what we hold"*. 40,161 documents of 9,536,254
-- carry any vector — 0.42% — so for 99.58% of the corpus a document we acquired,
-- normalised, stored and indexed is invisible to semantic search.
--
-- A contract carrying only the acquisition axis reports COVERED for a court-year
-- we hold in full and cannot semantically retrieve at all. `reachability` is
-- therefore a separate column and is never folded into `source_state`.
--
-- ───────────────────────────────────────────────────────────────────────────
-- NO PARTIAL THRESHOLD IS ENCODED HERE, DELIBERATELY
-- ───────────────────────────────────────────────────────────────────────────
--
-- Where "materially less than the source" begins is a product judgement about
-- when a result set stops being an answer — Bombay 1997 at 6 documents against a
-- court filing tens of thousands is obviously partial; a year at 85% arguably is
-- not. `PRODUCT_DECISIONS.md` owns that, not this table and not the lane that
-- wrote it.
--
-- So the five states are threshold-free and mechanical:
--
--   UNKNOWN          no source measurement exists for this cell. THE DEFAULT.
--   SOURCE_HAS_ZERO  the source was measured and holds zero. Requires a POSITIVE
--                    measurement — never inferred from having found nothing.
--   KNOWN_GAP        source > 0 and we hold none of it.
--   PARTIAL          we hold some and not all. How partial is `held_share`.
--   COVERED          held >= source.
--
-- `held_share` is stored so a product policy can draw its own line later without
-- this table being rewritten, and `source_provenance` is stored because the
-- estimate has a known defect: `HC_METADATA_SURVEY` counts parquet ROWS, not
-- documents, and Allahabad 2023's 220,443-row "gap" was duplicate listings. A
-- PARTIAL computed against an inflated denominator over-reports.
--
-- ───────────────────────────────────────────────────────────────────────────
-- EVERY AXIS CARRIES ITS OWN `measured_at`, AND THAT IS NOT DECORATION
-- ───────────────────────────────────────────────────────────────────────────
--
-- Coverage changes every time the fleet writes. NEW2's own frontier artefact
-- reports `heldIsStale` when a worker wrote after the held snapshot was taken,
-- which makes every `acquired` a LOWER bound. A cached COVERED outliving its
-- truth is the same class of defect as a cached `overruled_status`, so the three
-- axes timestamp independently: source, held and embedded are measured by
-- different jobs at different cadences and a single `updated_at` would hide
-- which of them is stale.
-- `apply-migration-online.mjs` refuses a file without this, and it is right to:
-- a CREATE TABLE takes no lock anything else holds, but the runner cannot know
-- that from the outside and a blanket rule beats a per-file judgement call.
SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS coverage_cell (
  court                text        NOT NULL,
  year                 integer     NOT NULL,

  -- acquisition axis
  source_rows          bigint,
  source_provenance    text,
  source_measured_at   timestamptz,
  held                 bigint,
  held_measured_at     timestamptz,
  held_share           numeric,
  source_state         text        NOT NULL DEFAULT 'UNKNOWN',

  -- reachability axis
  embedded             bigint,
  eligible             bigint,
  embedded_measured_at timestamptz,
  reachability         text        NOT NULL DEFAULT 'UNKNOWN',

  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT coverage_cell_pkey PRIMARY KEY (court, year),
  CONSTRAINT coverage_cell_source_state_check CHECK (
    source_state IN ('COVERED', 'PARTIAL', 'KNOWN_GAP', 'SOURCE_HAS_ZERO', 'UNKNOWN')
  ),
  CONSTRAINT coverage_cell_reachability_check CHECK (
    reachability IN ('EMBEDDED', 'LEXICAL_ONLY', 'UNKNOWN')
  )
);

-- The retrieval path selects the cells a query's filters actually name — a court
-- and a year range — never the whole table, and never a corpus-wide average.
CREATE INDEX IF NOT EXISTS coverage_cell_year_idx ON coverage_cell (year);

COMMENT ON TABLE coverage_cell IS
  'Precomputed court x year coverage, two INDEPENDENT axes: source_state (do we '
  'hold it) and reachability (can the semantic arm reach it). UNKNOWN is the '
  'default for both and must never render as COVERED. No PARTIAL threshold is '
  'encoded — held_share is stored so product policy can draw that line.';

COMMENT ON COLUMN coverage_cell.source_state IS
  'SOURCE_HAS_ZERO requires a positive source measurement of zero. Inferring it '
  'from having found nothing recreates the failure the state exists to report.';

COMMENT ON COLUMN coverage_cell.reachability IS
  'LEXICAL_ONLY means searchable by words and not by meaning — true for 99.58% '
  'of the corpus today. Never folded into source_state: the two produce the same '
  'empty screen for different reasons and only one of them is an acquisition gap.';
