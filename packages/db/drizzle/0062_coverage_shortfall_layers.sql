-- ───────────────────────────────────────────────────────────────────────────
-- `coverage_cell` — WHY a cell is short, which is a different question from
-- whether it is short
-- ───────────────────────────────────────────────────────────────────────────
--
-- Migration 0059 built this table so *"we have no law"* and *"we have no data"*
-- would stop being the same screen. It answered half the question: `source_state`
-- says a cell is `PARTIAL`, and `held_share` says by how much. Neither says
-- **why**, and measured today the why is the load-bearing part.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHAT THE MEASUREMENT SAID, 20 AUG 2026
-- ───────────────────────────────────────────────────────────────────────────
--
-- Over the 888 cells with a positive source denominator, 257 carry a shortfall:
--
--   179 cells   the shortfall is ENTIRELY `permanentAbsent` + `retryable`
--    40 cells   partly
--    38 cells   wholly unexplained
--
--   1,579,075 rows of shortfall
--     217,794  permanently absent at source — there is no PDF to fetch
--      12,777  retryable
--   1,348,714  unexplained
--
-- **Those 179 cells are reported to an advocate as `PARTIAL` — "we are missing
-- law" — about documents the court never published.** Bombay 2006 is short 6,276
-- and its `permanentAbsent` is 6,275. Bombay 2007 is short 6,706 and its
-- `permanentAbsent` is 6,706, exactly. That is the confusion migration 0059
-- exists to prevent, arriving through a column that was never added rather than
-- through the state machine, which is correct.
--
-- ───────────────────────────────────────────────────────────────────────────
-- AND 88.6% OF THE "UNEXPLAINED" IS A DENOMINATOR, NOT A GAP
-- ───────────────────────────────────────────────────────────────────────────
--
-- Allahabad supplies 1,195,510 of the 1,348,714 unexplained rows. Its 2018 cell
-- reads **50.03%** and its 2019 cell **50.29%**:
--
--   2018   456,951 source rows -> 228,653 documents   ratio 1.998
--   2019   468,045 source rows -> 235,385 documents   ratio 1.988
--
-- A coverage figure does not land on 50.0% twice. **That is a two-rows-per-
-- document ratio**, and migration 0059's own header already named the cause:
-- `HC_METADATA_SURVEY` counts parquet ROWS, not documents, and Allahabad 2023's
-- 220,443-row "gap" was duplicate listings. The frontier confirms it from the
-- other side — those cells are `WALKED` with `remainingRows: 0`, so every source
-- row was visited, and the ingest ledger holds only 22,407 failures for the whole
-- court. Half a million walked rows produced no document and no failure, which
-- leaves only one thing they can have been: rows for documents already held.
--
-- So the product currently tells an advocate we hold **half of Allahabad** when
-- we hold essentially all of it. Three courts — Allahabad, Chhattisgarh, Andhra
-- Pradesh — are 99.7% of the unexplained total.
--
-- ───────────────────────────────────────────────────────────────────────────
-- THE DECISION: A SECOND AXIS, NOT A RENAMED FIRST ONE
-- ───────────────────────────────────────────────────────────────────────────
--
-- `source_state` is NOT changed and its five values are NOT renamed. NEW1's
-- `NEW1_COVERAGE_STATE_CONTRACT.md` reads them, the contract is frozen for the
-- sprint, and the five already encode the honest categories: `UNKNOWN`,
-- `SOURCE_HAS_ZERO`, `KNOWN_GAP`, `PARTIAL`, `COVERED`. Renaming them to say the
-- same things differently would break a live contract to buy vocabulary.
--
-- What was missing is orthogonal, so it is added orthogonally. `shortfall_reason`
-- answers *"why is this cell not COVERED"* and is meaningless without
-- `source_state` beside it — the same relationship `overruled_status` has to
-- `verification_state`: two independent questions, two independent fields, and
-- what renders is derived from both at render time.
--
-- **`UNEXPLAINED` is the default and it is not a failure state.** It means the
-- residue has not been attributed. `UNKNOWN` on the acquisition axis and
-- `UNEXPLAINED` on this one are the same discipline: an unmeasured thing must
-- never inherit a confident label.
--
-- **`DENOMINATOR_SUSPECT` is a claim about OUR number, not the court's.** It is
-- set only where the source count is known to count listings rather than
-- documents. It must never be used to make a gap disappear — a cell wearing it
-- still reports its `held_share`, and the flag is what stops that share being
-- read as a percentage of the law.
--
-- The four component counts are stored beside the reason so the attribution can
-- be recomputed and argued with, rather than trusted. A reason with no arithmetic
-- under it is an opinion in a column.
--
SET LOCAL lock_timeout = '3s';

ALTER TABLE coverage_cell
  -- The denominator BEFORE the test-fixture subtraction, kept so the correction
  -- is auditable rather than invisible. NEW2 (bus 0887) is right that a
  -- denominator which quietly shrinks is its own defect: `bench=testcase` is
  -- 289,502 rows across 44 Bombay cells, and subtracting it without recording
  -- it would leave nobody able to tell a corrected denominator from a wrong one.
  ADD COLUMN IF NOT EXISTS source_rows_raw   bigint,
  -- What was subtracted, and why it was legitimate to subtract: partitions
  -- `hc-load.ts isTestFixture()` refuses by rule. Never silently dropped.
  ADD COLUMN IF NOT EXISTS source_excluded   bigint,
  -- Source rows walked that yielded no document because the source has no PDF.
  -- These can never be acquired. They are not a gap in our holdings.
  ADD COLUMN IF NOT EXISTS permanent_absent  bigint,
  -- Transient failures. These WILL close, and a cell short only by these is
  -- temporarily short, not missing law.
  ADD COLUMN IF NOT EXISTS retryable         bigint,
  -- shortfall - permanent_absent - retryable. The honest residue.
  ADD COLUMN IF NOT EXISTS unexplained       bigint,
  ADD COLUMN IF NOT EXISTS shortfall_reason  text NOT NULL DEFAULT 'UNEXPLAINED';

ALTER TABLE coverage_cell
  DROP CONSTRAINT IF EXISTS coverage_cell_shortfall_reason_check;

ALTER TABLE coverage_cell
  ADD CONSTRAINT coverage_cell_shortfall_reason_check CHECK (
    shortfall_reason IN (
      -- held >= source. Nothing to explain.
      'NONE',
      -- The whole shortfall is permanently absent at source. NO LAW IS MISSING.
      'SOURCE_ABSENT',
      -- The whole shortfall is retryable. Temporarily short.
      'RETRYABLE',
      -- Part attributed, part not. The residue is in `unexplained`.
      'PARTLY_EXPLAINED',
      -- The source count is known to count listings rather than documents, so
      -- held_share is not a share of the law. A claim about our denominator.
      'DENOMINATOR_SUSPECT',
      -- Not attributed. THE DEFAULT. Not a failure — an unfinished measurement.
      'UNEXPLAINED'
    )
  );

COMMENT ON COLUMN coverage_cell.shortfall_reason IS
  'WHY a cell is not COVERED — orthogonal to source_state, which says WHETHER. '
  'SOURCE_ABSENT means the court never published it and no law is missing; 179 '
  'of 257 shortfall cells were reported PARTIAL on exactly that. '
  'DENOMINATOR_SUSPECT is a claim about OUR number and must never be used to '
  'make a gap disappear. UNEXPLAINED is the default and is an unfinished '
  'measurement, not a failure.';

COMMENT ON COLUMN coverage_cell.source_rows_raw IS
  'Denominator BEFORE the bench=testcase subtraction. Stored so the correction '
  'is auditable: a denominator that quietly shrinks is its own defect.';

COMMENT ON COLUMN coverage_cell.source_excluded IS
  'Rows subtracted because hc-load.ts isTestFixture() refuses them. 289,502 '
  'across 44 Bombay cells. Never silently dropped.';

COMMENT ON COLUMN coverage_cell.unexplained IS
  'shortfall - permanent_absent - retryable. The residue nobody has attributed. '
  '88.6% of it corpus-wide is Allahabad, whose source count is listings not '
  'documents — hence DENOMINATOR_SUSPECT rather than a claimed gap.';
