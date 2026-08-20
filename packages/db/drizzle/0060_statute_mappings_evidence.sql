-- ───────────────────────────────────────────────────────────────────────────
-- `statute_mappings` GETS ITS EVIDENCE, AND THE KEY THAT MAKES A RELOAD SAFE
-- ───────────────────────────────────────────────────────────────────────────
--
-- The table has been EMPTY since it was created, and `CURRENT_PLAN.md` recorded
-- why: the BPRD correspondence parser is report-only, per the founder's "report
-- first". The founder's 20 Aug direction opens the write path — *"begin
-- populating only from authoritative sources already held/discovered"* — and
-- adds a requirement the table could not meet: **every mapping carries its
-- evidence**.
--
-- It could not, because `note` is free text with no stated meaning, and there was
-- nothing at all to say WHERE a row came from or WHEN it took effect.
--
--   source          the document that asserts the correspondence, by URL
--   source_line     the 1-based line in the extracted text — provenance a human
--                   can walk back to, not a claim that a parse happened
--   evidence        the row AS PRINTED, verbatim. A mapping whose evidence does
--                   not read as a correspondence is a parser bug, visible
--   effective_date  when the new provision commenced. READ from `statutes`,
--                   never typed here: `transition.ts` refuses to name a regime
--                   when the commencement rows disagree, and a date hard-coded in
--                   a second place is how those two stop agreeing
--   parser_version  which reading produced the row. `statute-correspondence.ts`
--                   is at v2 and its coverage is 6.4%/42.4%/70.6% by pair; a v3
--                   that reads more must be able to find what v2 wrote
--
-- ───────────────────────────────────────────────────────────────────────────
-- THE UNIQUE KEY IS THE PAIR OF SECTIONS, NOT THE NEW SECTION
-- ───────────────────────────────────────────────────────────────────────────
--
-- **The correspondence is not 1:1 and the schema must not pretend it is.**
-- BNS 5 corresponds to IPC 54, 55 AND 55A — three rows, one new section. BPRD
-- prints `55A` on a continuation line in the old-section column, which is why
-- the parser is column-aware; mapping BNS 5 to IPC 54 alone would be a partial
-- mapping presented as complete, which is fabrication arriving by omission.
--
-- So the key is `(old_act, old_section, new_act, new_section)`: it permits many
-- old sections under one new one and many new under one old, and still makes a
-- reload idempotent rather than duplicating every row on the second run.
--
-- `old_section` is NOT NULL on this table, and that is left alone. A provision
-- the source marks `New` therefore CANNOT be represented, and is NOT loaded: the
-- loader counts those rows and reports them rather than inventing a placeholder
-- old section to satisfy a constraint. `no_equivalent` stays in the relationship
-- vocabulary for a mapping that names a real old section with no new counterpart,
-- which is the direction the constraint permits.
SET LOCAL lock_timeout = '3s';

ALTER TABLE statute_mappings
  ADD COLUMN IF NOT EXISTS source         text,
  ADD COLUMN IF NOT EXISTS source_line    integer,
  ADD COLUMN IF NOT EXISTS evidence       text,
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS parser_version integer,
  ADD COLUMN IF NOT EXISTS created_at     timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS statute_mappings_pair_key
  ON statute_mappings (old_act, old_section, new_act, new_section);

COMMENT ON COLUMN statute_mappings.evidence IS
  'The correspondence row AS PRINTED in the official source, verbatim. A mapping '
  'is only as good as the line that asserts it, and a mapping with no evidence is '
  'not loaded at all.';

COMMENT ON COLUMN statute_mappings.effective_date IS
  'Commencement of the NEW provision, read from `statutes.enforcement_date`. Never '
  'typed literally — transition.ts refuses to name a regime when the commencement '
  'rows disagree, and a second hard-coded copy is how they start disagreeing.';
