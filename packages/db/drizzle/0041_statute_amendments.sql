-- Stage 8, the point-in-time foundation. `docs/ai/STATUTE_TEMPORAL_STAGE8.md`.
--
-- Stage 8 asks where amendment/commencement data would come from, with a
-- standing instruction to check indiacode before assuming a new source is
-- needed. It does publish it, and we ingested it on the first pass:
-- `statute_sections.footnote` holds the bare act's own printed amendment notes
-- verbatim for 9,064 of 34,928 sections. Nothing had ever parsed them.
--
-- Measured against production 11 Aug 2026, parsing all 9,064:
--
--   18,590 events    substituted 9,871 · inserted 5,589 · omitted 2,222
--                    renumbered 286 · repealed 170 · commenced 452
--   15,388 carry a real effective date; 3,202 do not, and are stored with a
--          NULL date rather than the amending Act's year -- those are
--          different facts and conflating them dates a legal event by guess.
--    2,708 resolved their amending Act through `ibid` from the entry before
--          them; 1,994 could not be resolved and say so.
--      596 footnote entries yielded no event: editorial cross-references
--          ("See now the Arbitration Act, 1940"), which are recorded as
--          unparsed rather than absorbed into a silent zero.
--
-- WHAT THIS TABLE IS NOT:
--
-- It is NOT a version history of the section text. Knowing clause (a) was
-- substituted on 1-4-1966 is not knowing what clause (a) said before.
-- indiacode publishes only the CURRENT text; the prior wording is sometimes
-- quoted in the note and usually is not. `substituted_text` holds that quoted
-- fragment verbatim and is never assembled into a reconstructed provision --
-- a partial reconstruction served as the law as it stood would be the
-- statutory equivalent of a fabricated citation.
--
-- `amending_act_raw` keeps state prefixes (`Delhi Act 12 of 2011`,
-- `W.B. Act 18 of 1990`) exactly as printed and does NOT resolve them to a
-- jurisdiction. A Central Act amended in one state does not read the same in
-- another, and guessing which prefixes name states would put confident wrong
-- rows in front of advocates.

CREATE TABLE IF NOT EXISTS statute_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statute_section_id uuid NOT NULL REFERENCES statute_sections(id) ON DELETE CASCADE,

  -- The footnote's own printed number, so a row traces back to its note.
  ordinal integer NOT NULL,
  event_type text NOT NULL CHECK (event_type IN
    ('inserted','substituted','omitted','renumbered','repealed','commenced')),

  -- Verbatim, never normalised. NULL where the note names no Act, which is a
  -- real state: an unresolved `ibid`, or a commencement notification.
  amending_act_raw text,
  amending_act_number integer,
  amending_act_year integer,
  amending_section text,

  -- ISO date, or NULL where the source states none. NEVER inferred.
  effective_date date,

  -- The prior wording where the note quotes it. Never assembled into a version.
  substituted_text text,

  -- How the amending Act was established. `ibid_unresolved` is kept as a state
  -- rather than dropped: reaching forward to an Act named later in the note
  -- would be a confident wrong attribution, and a gap is visible where a wrong
  -- answer is not.
  ibid_resolved boolean NOT NULL DEFAULT false,
  ibid_unresolved boolean NOT NULL DEFAULT false,

  -- The entry exactly as printed, so a row is auditable without re-fetching.
  verbatim text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per (section, footnote entry). Re-running the extractor updates
-- rather than duplicating, the same shape every backfill in this repo uses.
CREATE UNIQUE INDEX IF NOT EXISTS statute_amendments_section_ordinal_key
  ON statute_amendments (statute_section_id, ordinal);

-- "What was in force on date X" reads this way.
CREATE INDEX IF NOT EXISTS statute_amendments_effective_date_idx
  ON statute_amendments (effective_date) WHERE effective_date IS NOT NULL;

-- "Which provisions did Act 39 of 2020 touch" -- the citator question, for
-- statutes rather than judgments.
CREATE INDEX IF NOT EXISTS statute_amendments_amending_act_idx
  ON statute_amendments (amending_act_year, amending_act_number)
  WHERE amending_act_number IS NOT NULL;

-- A footnote entry the extractor could not read. Recorded, never dropped: the
-- silent-drop rule from `docs/CITATION_HARNESS.md` applied to statutes, so
-- "how much did we fail to read" is a query rather than a silence.
CREATE TABLE IF NOT EXISTS statute_amendment_unparsed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statute_section_id uuid NOT NULL REFERENCES statute_sections(id) ON DELETE CASCADE,
  verbatim text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS statute_amendment_unparsed_section_idx
  ON statute_amendment_unparsed (statute_section_id);
