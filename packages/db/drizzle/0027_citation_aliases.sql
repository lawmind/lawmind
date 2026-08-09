-- The concordance — the names advocates actually use.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A SEPARATE TABLE AND NOT MORE `reporter_citations`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `judgments.reporter_citations` is what the SOURCE published. Every row in this
-- corpus carries exactly one, always S.C.R., because that is what our source
-- digitised. Appending derived aliases to that column would destroy the
-- distinction between "the reporter printed this" and "we worked this out", and
-- once destroyed it cannot be recovered.
--
-- The distinction matters because provenance has to stay answerable. *"Who says
-- this judgment is AIR 1952 SC 343?"* must have an answer, and here the answer
-- is **"fifty-nine Supreme Court judgments printed it beside the S.C.R.
-- citation we hold"** — which is a stronger claim than a database column, and
-- worth being able to make.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY IT EXISTS AT ALL, MEASURED 9 AUGUST 2026
-- ─────────────────────────────────────────────────────────────────────────────
--
-- An advocate searching `AIR 1973 SC 1461` — the ordinary way to cite
-- *Kesavananda* — got nothing, because we knew it only as `1973 INSC 91` and
-- `[1973] SUPP. 1 S.C.R. 1`. A zero result reads as "no such case", which is the
-- worst failure available to a product whose promise is that a citation is real.
--
-- Meanwhile 93,235 AIR and SCC citations sat unresolved in our own judgment
-- text. 31,664 of them are printed BESIDE an S.C.R. citation of the same year —
-- a concordance the courts asserted themselves.

CREATE TABLE IF NOT EXISTS judgment_citation_aliases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judgment_id    uuid NOT NULL REFERENCES judgments(id) ON DELETE CASCADE,
  -- As printed: `AIR 1973 SC 1461`. Shown to a human checking the derivation.
  alias          text NOT NULL,
  -- Upper-cased, non-alphanumerics removed. The SAME rule as citationLookupKey()
  -- in query-shape.ts and as the expression migration 0026 indexes, so a lookup
  -- finds the alias whatever the typesetting.
  alias_key      text NOT NULL,
  alias_reporter text NOT NULL CHECK (alias_reporter IN ('AIR', 'SCC')),
  -- How many separate citing judgments printed this pairing. Two is the floor:
  -- one sighting could be a single OCR slip in a single judgment, and an alias
  -- nobody can trace is worse than no alias.
  corroborations integer NOT NULL CHECK (corroborations >= 2),
  -- The span of text that justified it, kept verbatim. An alias whose evidence
  -- cannot be read is an assertion, and this table does not make assertions.
  evidence       text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ONE ALIAS, ONE JUDGMENT. A citation string names exactly one case; if the
-- extraction ever produced two targets for one alias the constraint refuses the
-- second rather than letting an advocate's search become ambiguous. The resolver
-- already drops contradicted aliases before this point — 640 of them on the
-- first run — and this is the database saying the same thing independently.
CREATE UNIQUE INDEX IF NOT EXISTS judgment_citation_aliases_key
  ON judgment_citation_aliases (alias_key);

CREATE INDEX IF NOT EXISTS judgment_citation_aliases_judgment_idx
  ON judgment_citation_aliases (judgment_id);
