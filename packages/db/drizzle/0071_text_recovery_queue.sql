-- ───────────────────────────────────────────────────────────────────────────
-- TEXT RECOVERY — a queue for the documents worth 3.7 seconds a page, and a
-- place to put the OCR that never overwrites the court's own text
-- ───────────────────────────────────────────────────────────────────────────
--
-- NEW2 measured the whole decision (`docs/ops/new2/TEXT_RECOVERY_POLICY.md`):
--
--     40 PDFs, page 1, CPU only, three readings of the SAME file
--       stored readable   0 / 20 suspects      10/10 + 10/10 controls
--       MuPDF  readable   0 / 20 suspects      10/10 + 10/10 controls
--       OCR    readable  20 / 20 suspects      10/10 + 10/10 controls
--
-- A different extractor recovers NOTHING — the subset-embedded fonts carry no
-- `/ToUnicode` map, so there is no character mapping for any extractor to find.
-- OCR recovers all twenty, verified against case number (20/20) and date (18/18)
-- that arrive as source metadata and therefore cannot agree by construction.
--
-- **And 6 of 20 render a year with the letter O for zero — `2O17` — every one of
-- the six Karnataka.** So recovered text is reliable for PROSE and unreliable for
-- DIGITS, which is why `digit_trust` exists below and defaults to the unsafe
-- value.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHY A QUEUE AND NOT A CORPUS-WIDE PASS
-- ───────────────────────────────────────────────────────────────────────────
--
-- 8.65% of 18.7M rows at 3.7 s a page is ~69 CPU-days for ONE page each, and a
-- document is many pages. The directive is explicit — *do NOT OCR 18.7M
-- documents* — and the policy document already declined to propose it.
--
-- What is worth paying for is the intersection of PROVEN damage with what
-- retrieval actually reaches. That intersection is a query, and this table is
-- where the query's answer is written down so the spend is auditable per
-- document and per reason rather than being one number in a log.
--
-- ───────────────────────────────────────────────────────────────────────────
-- THE ORIGINAL EXTRACTION IS NEVER TOUCHED
-- ───────────────────────────────────────────────────────────────────────────
--
-- `judgment_text_recovery` sits BESIDE `judgments.full_text`, never in place of
-- it. Three reasons, and the third is the one that matters:
--
--   1. the glyph dump is the evidence that recovery was needed;
--   2. an engine version can be superseded, and the row it wrote must then be
--      re-runnable — impossible if it destroyed its own input;
--   3. `CLAUDE.md`: *OCR output is never trusted silently.* Text that the court
--      never published cannot be allowed to occupy the column that every surface
--      renders as the court's words.
--
-- A consumer that wants recovered text asks for it by name and gets `method`,
-- `engine_version` and `digit_trust` in the same row. There is no path by which
-- it arrives unlabelled.
--
-- ───────────────────────────────────────────────────────────────────────────
-- NO FOREIGN KEY TO `judgments`, AND THE REASON IS A FAILED ATTEMPT
-- ───────────────────────────────────────────────────────────────────────────
--
-- The first version of this migration declared
-- `REFERENCES judgments(id) ON DELETE CASCADE` on both tables and died:
--
--     PostgresError 55P03: canceling statement due to lock timeout
--
-- Adding a foreign key takes SHARE ROW EXCLUSIVE on the REFERENCED table, which
-- blocks every writer on it. `judgments` currently has four — LCC's text-safety
-- screen, the classifier, the withdrawn re-stale pass and NEW2's damage persist
-- — and none of them goes quiet. Waiting for that lock means stalling all four;
-- taking it under a longer timeout means the same thing for longer.
--
-- The constraint is also buying very little here. Nothing deletes from
-- `judgments` — there is no delete path in any writer in the repo — so the
-- CASCADE half is dead weight, and both tables are populated exclusively by our
-- own writers from ids they just read out of `judgments`. An orphan needs a
-- delete that does not exist.
--
-- If `judgments` ever gets a delete path, this becomes a real gap and the fix is
-- `ADD CONSTRAINT ... NOT VALID` during a maintenance window, followed by
-- `VALIDATE CONSTRAINT`, which takes only a SHARE UPDATE EXCLUSIVE.
--
SET LOCAL lock_timeout = '3s';

-- ── The queue ──────────────────────────────────────────────────────────────
--
-- One row per document, ever. `judgment_id` is UNIQUE rather than a plain index:
-- a document can be reached by four different value reasons in the same week and
-- must not be OCR'd four times. The reason that got it in is kept, and a later
-- reason raises the priority instead of inserting again.
CREATE TABLE IF NOT EXISTS judgment_recovery_queue (
  judgment_id       uuid PRIMARY KEY,

  -- WHY this document is worth the CPU. Not a free-text note: the whole point of
  -- the queue is that spend is attributable, and an unconstrained string cannot
  -- be grouped by six weeks later.
  --   CITED_AUTHORITY   another judgment cites it — it is reachable law
  --   BENCHMARK_GOLD    it appears in a launch benchmark or a gold set
  --   MATTER_LINKED     an advocate saved it to a matter
  --   SEARCH_MISS       a real query should have found it and could not
  --   USER_REQUEST      a person asked for this document by name
  reason            text NOT NULL,

  -- Lower runs first. Set from the reason, and raised (never lowered) when a
  -- second reason arrives for a document already queued.
  priority          integer NOT NULL DEFAULT 100,

  -- The verdict that made it a candidate, with the version that made it. A queue
  -- entry written under a superseded detector is identifiable by a WHERE rather
  -- than by memory — the same argument `script_quality_method` settles.
  damage_detector   text NOT NULL,
  damage_reasons    text[] NOT NULL DEFAULT '{}',

  --   QUEUED         waiting
  --   RUNNING        a worker holds it
  --   RECOVERED      readable text exists in judgment_text_recovery
  --   FAILED         the attempt errored (fetch, render, engine) — retryable
  --   UNRECOVERABLE  OCR ran and the output is still not text. NOT the default,
  --                  and never applied to a document OCR has not been tried on:
  --                  0 of 20 failed in the probe, and a label nobody re-tests
  --                  would foreclose 1.6M documents on evidence saying otherwise.
  state             text NOT NULL DEFAULT 'QUEUED',

  attempts          integer NOT NULL DEFAULT 0,
  last_error        text,

  queued_at         timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  finished_at       timestamptz,

  CONSTRAINT judgment_recovery_queue_reason_ck CHECK (reason IN (
    'CITED_AUTHORITY', 'BENCHMARK_GOLD', 'MATTER_LINKED', 'SEARCH_MISS', 'USER_REQUEST')),
  CONSTRAINT judgment_recovery_queue_state_ck CHECK (state IN (
    'QUEUED', 'RUNNING', 'RECOVERED', 'FAILED', 'UNRECOVERABLE'))
);

-- The claim query: next work, priority then arrival. Partial, because QUEUED is
-- a shrinking minority of the table once the queue has been worked.
CREATE INDEX IF NOT EXISTS judgment_recovery_queue_claim_idx
  ON judgment_recovery_queue (priority, queued_at)
  WHERE state = 'QUEUED';

CREATE INDEX IF NOT EXISTS judgment_recovery_queue_state_idx
  ON judgment_recovery_queue (state, reason);

-- ── The recovered text ─────────────────────────────────────────────────────
--
-- Many rows per document allowed, deliberately. A later engine version is a NEW
-- row, so a regression between versions is visible instead of overwritten. The
-- current text for a document is the newest row, which is a query, not a state
-- anybody has to maintain.
CREATE TABLE IF NOT EXISTS judgment_text_recovery (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judgment_id       uuid NOT NULL,

  --   OCR_RENDERED_PAGE   pixels off a rendered page. The only route that does
  --                       not depend on the font's character map existing.
  --   REEXTRACT           a second text extractor on the same bytes. Recorded
  --                       because it is what a future caller will try first, and
  --                       the probe says it recovers 0 of 20.
  method            text NOT NULL,
  engine_version    text NOT NULL,

  -- Provenance of the BYTES that were read, not of the row. A recovery whose
  -- source cannot be named cannot be re-run or disputed.
  source_url        text,
  page_from         integer,
  page_to           integer,
  pages_read        integer,

  recovered_text    text,
  char_count        integer,
  control_density   numeric(6, 4),
  english_rate      numeric(8, 2),

  -- THE KARNATAKA DEFECT, AS A COLUMN.
  --   UNVERIFIED   nothing has checked the digits. The DEFAULT, because 6 of 20
  --                probe pages printed `2O17` and a section number, a year or a
  --                date read wrong is a wrong authority, not a typo.
  --   CROSSCHECKED digits agree with a witness that never came from this text —
  --                source metadata, the filename, the registry
  --   SUSPECT      a witness disagrees, or a known bad glyph shape was found
  digit_trust       text NOT NULL DEFAULT 'UNVERIFIED',
  -- What the crosscheck actually compared, per field, so a CROSSCHECKED verdict
  -- is auditable rather than asserted.
  digit_evidence    jsonb,

  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT judgment_text_recovery_method_ck CHECK (method IN (
    'OCR_RENDERED_PAGE', 'REEXTRACT')),
  CONSTRAINT judgment_text_recovery_digit_trust_ck CHECK (digit_trust IN (
    'UNVERIFIED', 'CROSSCHECKED', 'SUSPECT'))
);

CREATE INDEX IF NOT EXISTS judgment_text_recovery_judgment_idx
  ON judgment_text_recovery (judgment_id, created_at DESC);

COMMENT ON TABLE judgment_recovery_queue IS
  'NEW2. High-value OCR recovery queue for documents text-damage-v2.0 has PROVEN '
  'are not text. Deliberately not corpus-wide: 8.65% of 18.7M rows at 3.7s a page '
  'is ~69 CPU-days for one page each. Entry requires a value reason -- cited '
  'authority, benchmark gold, matter-linked, real search miss, or a user request '
  '-- so the spend is attributable per document. UNRECOVERABLE is never the '
  'default and is never applied to a document OCR has not been tried on.';

COMMENT ON TABLE judgment_text_recovery IS
  'NEW2. Recovered text, BESIDE judgments.full_text and never in place of it: the '
  'glyph dump is the evidence recovery was needed, and OCR text is a derived '
  'artefact of an engine rather than the court''s published words. Many rows per '
  'document allowed so a later engine version is a new row and a regression is '
  'visible. digit_trust defaults to UNVERIFIED because 6 of 20 probe pages '
  'rendered a year as 2O17 -- recovered text is reliable for prose and unreliable '
  'for digits, so no numeric field may be taken from it without a second witness.';
