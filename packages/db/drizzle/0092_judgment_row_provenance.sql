-- 0092 — PER-ROW PROVENANCE ON judgments: SOURCE, EDITION, AUTHORIZATION BASIS
--
-- Owner: LCC. Additive, nullable, backfill-free. No existing row is read or
-- written by this migration.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY, AND WHY source_url IS NOT ALREADY THIS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `judgments.source_url` is NOT NULL and it is the uniqueness/resumability key
-- (SCHEMA_TRUTH §"Unique: source_url"). It is NOT a licence key, and it was
-- never designed to be one. Audited 28 Aug 2026 on the live table: judgments
-- carries 38 columns and not one of them names a source, an edition or an
-- authorization basis. The only provenance available today is INFERRED from a
-- URL prefix — a hash-ordered sample of 20,000 rows resolves to exactly two
-- hosts, both AWS Open Data:
--
--     https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com    19,967
--     https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com     33
--
-- That works only for as long as one licence family covers the whole corpus.
-- The moment a second source arrives, or two grants serve from the same host,
-- the prefix stops identifying anything and there is no second signal.
--
-- The precondition this exists to satisfy: **the SCR counsel outcome, and any
-- future licensed ingest, must be remediable by WHERE clause and not by
-- re-ingest.** After this migration that sentence is literally true:
--
--     DELETE FROM judgments WHERE source_id = 'x' AND source_edition = 'reporter_edited';
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE EDITION AXIS IS THE ONE NOTHING COULD EXPRESS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- CLAUDE.md §6: there is no copyright in a judgment (Copyright Act
-- s. 52(1)(q)(iv)); what IS protected is a reporter's COPY-EDITED version —
-- headnotes, editorial numbering — per *Eastern Book Company v. D.B. Modak*.
-- So the question that decides whether a row is safe to hold is "whose edition
-- is this text", and no column answered it. `text_extraction_method` records
-- HOW the text was extracted (pdftotext, OCR); it says nothing about WHOSE
-- edition was extracted, and the two have been confused before.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NULL MEANS UNRECORDED. IT NEVER MEANS SAFE.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every column here is nullable and every row is NULL on the day it lands.
-- That is a deliberate refusal to backfill an assertion nobody made: this repo
-- has already measured what happens when a NULL is read as a pass — 94.1% of
-- one tier was admitted on the absence of evidence rather than the presence of
-- it. A consumer that wants "safe to hold" must test for the VALUE, never for
-- the absence of a refusal.
--
-- The vocabulary is 0090's, extended, rather than a second parallel one.
-- `authorization_basis` is the SAME value set as
-- `official_source_artifact.authorization_basis`; two spellings of one fact is
-- how a licence boundary becomes unqueryable.

SET LOCAL lock_timeout = '3s';

ALTER TABLE judgments
  ADD COLUMN IF NOT EXISTS source_id              text,
  ADD COLUMN IF NOT EXISTS source_edition         text,
  ADD COLUMN IF NOT EXISTS authorization_basis    text,
  ADD COLUMN IF NOT EXISTS provenance_recorded_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE CONSTRAINTS ARE `NOT VALID`, AND WHY THAT IS NOT A SHORTCUT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A plain `ADD CONSTRAINT ... CHECK` validates by scanning the table under an
-- ACCESS EXCLUSIVE lock. `judgments` is 18,698,984 rows in a 151 GB relation
-- (22 GB heap), and this migration runs under `lock_timeout = 3s` — so a
-- validating scan would either block the whole factory or abort the migration.
--
-- `NOT VALID` enforces the check on every INSERT and UPDATE from this point on.
-- The only thing it does not do is re-check rows that already existed — and
-- those are provably all NULL, because the column is created in the statement
-- above and NULL satisfies every check below. So validation here would scan
-- 151 GB to confirm a fact the DDL already guarantees.
--
-- Left NOT VALID deliberately rather than forgotten. `VALIDATE CONSTRAINT`
-- takes only SHARE UPDATE EXCLUSIVE and can be run in any maintenance window
-- once real values exist:
--
--     ALTER TABLE judgments VALIDATE CONSTRAINT judgments_source_id_check;

ALTER TABLE judgments DROP CONSTRAINT IF EXISTS judgments_source_id_check;
ALTER TABLE judgments
  ADD CONSTRAINT judgments_source_id_check CHECK (
    source_id IS NULL OR source_id IN (
      -- AWS Open Data, CC-BY-4.0, raw court text. What the corpus holds today.
      'aws_hc',
      'aws_sc',
      -- Official court hosts, matching 0090's artifact sources.
      'sci_homepage',
      'sci_search',
      'sci_pdf',
      'ecourts',
      -- Named in CLAUDE.md §6a as authorized through 13 Nov 2029.
      'bharatlaw',
      -- CLAUDE.md §6a naming rule: "Supreme AI and Supreme Today are different
      -- sources." NEW3's bus 0094 asserted they are the same and that identity
      -- is NOT settled here. Two values, deliberately, so a row records which
      -- name it actually came from and the question stays answerable later.
      -- Recording one does not assert anything about the other.
      'supreme_ai',
      'supreme_today'
    )
  ) NOT VALID;

ALTER TABLE judgments DROP CONSTRAINT IF EXISTS judgments_source_edition_check;
ALTER TABLE judgments
  ADD CONSTRAINT judgments_source_edition_check CHECK (
    source_edition IS NULL OR source_edition IN (
      -- The court's own text. s. 52(1)(q)(iv): no copyright in it.
      'court_raw',
      -- A law reporter's copy-edited version. EBC v. D.B. Modak: protected.
      'reporter_edited',
      -- Known to contain both and not separated. NOT a synonym for unknown:
      -- this is a positive finding that the document mixes them, which is a
      -- different remediation from "nobody looked".
      'mixed_unseparated'
    )
  ) NOT VALID;

ALTER TABLE judgments DROP CONSTRAINT IF EXISTS judgments_authorization_basis_check;
ALTER TABLE judgments
  ADD CONSTRAINT judgments_authorization_basis_check CHECK (
    authorization_basis IS NULL OR authorization_basis IN (
      -- Identical to official_source_artifact.authorization_basis (0090).
      'public_official',
      'sci_written_grant',
      'ecourts_registrar_grant',
      'aws_open_data',
      -- Added here: the founder-declared source agreements of CLAUDE.md §6a.
      'founder_declared_grant'
    )
  ) NOT VALID;

-- ─────────────────────────────────────────────────────────────────────────────
-- NO INDEXES HERE, DELIBERATELY
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The obvious thing to write is three partial indexes
-- (`WHERE source_id IS NOT NULL`) so that remediation is a bounded index scan.
-- They are NOT created here, and the reason is worth stating because "cost
-- nothing while every row is NULL" is wrong and sounds right.
--
-- A partial index whose predicate excludes every row is EMPTY, but building it
-- still reads every heap page to evaluate the predicate — 2,822,704 pages,
-- 22 GB — under a lock that blocks writes to `judgments` for the duration.
-- Measured IO on this box puts that at roughly 40 s per index. So the three
-- would buy an empty structure for two minutes of a blocked factory, today,
-- and the query they exist to accelerate cannot be run until there are values
-- to match.
--
-- `CREATE INDEX CONCURRENTLY` is the right tool and cannot run inside a
-- migration's transaction. So the indexes are deferred to the moment the first
-- provenance is actually written, and the statements are recorded here rather
-- than left to be rediscovered:
--
--     CREATE INDEX CONCURRENTLY judgments_source_id_idx
--       ON judgments (source_id) WHERE source_id IS NOT NULL;
--     CREATE INDEX CONCURRENTLY judgments_source_edition_idx
--       ON judgments (source_edition) WHERE source_edition IS NOT NULL;
--     CREATE INDEX CONCURRENTLY judgments_authorization_basis_idx
--       ON judgments (authorization_basis) WHERE authorization_basis IS NOT NULL;
--
-- Until then every statement in this migration is metadata-only: a nullable
-- ADD COLUMN with no default has not rewritten a table since PostgreSQL 11, and
-- a NOT VALID constraint does not scan. This migration is instant by
-- construction, which is what lets it run against a live 151 GB table at all.

COMMENT ON COLUMN judgments.source_id IS
  'Which source this row was acquired from. NULL means UNRECORDED, never safe. '
  'source_url is the uniqueness key and is not a substitute: a URL prefix stops '
  'identifying a source as soon as two grants share a host.';
COMMENT ON COLUMN judgments.source_edition IS
  'Whose edition of the text this is: court_raw | reporter_edited | '
  'mixed_unseparated. The EBC v. D.B. Modak axis, and the one nothing in the '
  'schema could express before. NULL means UNRECORDED, never court_raw.';
COMMENT ON COLUMN judgments.authorization_basis IS
  'The permission this row is held under. Same vocabulary as '
  'official_source_artifact.authorization_basis (0090), deliberately, so a '
  'licence boundary is one WHERE clause across both tables.';
COMMENT ON COLUMN judgments.provenance_recorded_at IS
  'When the three columns above were set. Separate from created_at because '
  'provenance can be recorded long after ingest, and a claim with no date is '
  'not checkable.';
