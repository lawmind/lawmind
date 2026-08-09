-- Structured search — the indexes and the one table that make field search
-- possible, and the reason each exists.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS MIGRATION EXISTS AT ALL
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Manupatra and SCC Online — what advocates actually use — are built on field,
-- Boolean and citation search: party, judge, act, section, court, period. We had
-- semantic search and four filters, and every field an advocate would search by
-- is present in `judgments` with **no index on it**: `case_title`, `bench`,
-- `neutral_citation`, `case_number`. A `party:` search today is a sequential
-- scan over 38,341 rows.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGRAM, NOT btree, FOR NAMES — AND THE REASON IS INDIAN
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A btree serves prefixes. Names in this corpus do not arrive as clean prefixes:
-- the same judge is printed `S.K. DAS` and `S. K. DAS`; parties are
-- transliterated inconsistently across 76 years of reporting; and an advocate
-- searching for a party usually remembers one word out of nine. Trigram
-- similarity handles substrings and near-misses, which is what the data needs.
--
-- The cost is honest: trigram indexes are larger and slower to build than btree.
-- On 38,341 rows that is a rounding error.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Party search ────────────────────────────────────────────────────────────
-- `case_title` is 100% populated and every row contains a party separator. Note
-- the corpus prints `versus`, not `v.` — the application handles both forms, and
-- the index is on the whole title so either works.
CREATE INDEX IF NOT EXISTS judgments_case_title_trgm
  ON judgments USING gin (case_title gin_trgm_ops);

-- ── Case-number search ──────────────────────────────────────────────────────
-- 100% populated, e.g. `CRIMINAL APPEAL No. 19/1955`. Trigram rather than btree
-- because an advocate types `19/1955`, not the full prefix.
CREATE INDEX IF NOT EXISTS judgments_case_number_trgm
  ON judgments USING gin (case_number gin_trgm_ops);

-- ── Citation lookup ─────────────────────────────────────────────────────────
-- The expression is EXACTLY `citationLookupKey()` in
-- `services/api/src/search/query-shape.ts`: upper-case, strip everything that is
-- not a letter or a digit. One rule, expressed identically in JS and in SQL, so
-- the two cannot drift — `(2019) 4 S.C.C. 221`, `[2019] 4 SCC 221` and
-- `(2019)4 SCC  221` all collapse to `20194SCC221`.
--
-- 127 rows carry a null `neutral_citation`, so `coalesce` is load-bearing: a
-- null would otherwise drop those judgments out of the index entirely and a
-- `cite:` search would silently never find them.
CREATE INDEX IF NOT EXISTS judgments_neutral_citation_key
  ON judgments (upper(regexp_replace(coalesce(neutral_citation, ''), '[^A-Za-z0-9]', '', 'g')));

-- Reporter citations are an array and every row has at least one. GIN over the
-- array serves containment; the normalised comparison is done by unnesting in
-- the query, because an expression index cannot be built over an array's
-- elements.
CREATE INDEX IF NOT EXISTS judgments_reporter_citations_gin
  ON judgments USING gin (reporter_citations);

-- ── Case type ───────────────────────────────────────────────────────────────
-- 299 rows are null, and they are EXCLUDED when the filter is applied rather
-- than guessed into a side — the rule `judgments.case_type` already documents.
CREATE INDEX IF NOT EXISTS judgments_case_type_idx ON judgments (case_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- judgment_judges — because `bench` is a LIST, and that changes the shape
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Measured before building: `bench` is comma-delimited. 4,846 of 38,325 rows
-- (12.6%) name more than one judge, up to nine —
-- `BHUVNESHWAR PRASAD SINHA, S.K. DAS, P.B. GAJENDRAGADKAR, …` at 150
-- characters.
--
-- A trigram index on the raw string would FILTER correctly, and would make
-- facets and counts wrong. `D.Y. CHANDRACHUD` appears 572 times as a sole bench
-- string while having sat on many more as part of a larger bench, and
-- `ARIJIT PASAYAT, S.B. SINHA` would face as a different judge from
-- `ARIJIT PASAYAT`. The 1,717 distinct values are **bench compositions, not
-- judges** — so "how many judgments did this judge decide" is unanswerable from
-- that column, and that is a question advocates ask constantly.
--
-- Hence one row per (judgment, judge).
CREATE TABLE IF NOT EXISTS judgment_judges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judgment_id  uuid NOT NULL REFERENCES judgments(id) ON DELETE CASCADE,
  -- As printed in `bench`, trimmed. Kept verbatim for display: an advocate
  -- should see the name the report carries.
  judge_name   text NOT NULL,
  -- Upper-cased, punctuation and internal spacing removed — `S.K. DAS` and
  -- `S. K. DAS` both become `SKDAS`. Used for MATCHING only, never displayed.
  --
  -- Deliberately NOT used to merge two judges into one identity. Two spellings
  -- collapsing to one key is a match; deciding that two different keys are the
  -- same person is a judgement about a human being, and this table does not make
  -- it. There is no `judge_id`, and adding one needs evidence rather than a
  -- similarity score.
  judge_key    text NOT NULL,
  -- Position within the printed bench, 0-based. The presiding judge is listed
  -- first by convention, so this is recoverable information that the split
  -- would otherwise destroy.
  seat_index   integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- A judgment cannot list the same judge twice; if the source does, that is a
-- data defect and the constraint surfaces it rather than double-counting.
CREATE UNIQUE INDEX IF NOT EXISTS judgment_judges_judgment_key
  ON judgment_judges (judgment_id, judge_key);
CREATE INDEX IF NOT EXISTS judgment_judges_judgment_id_idx ON judgment_judges (judgment_id);
CREATE INDEX IF NOT EXISTS judgment_judges_key_idx ON judgment_judges (judge_key);
-- Fuzzy `judge:` search runs against the printed name, so it tolerates the
-- spelling an advocate remembers rather than the one the reporter used.
CREATE INDEX IF NOT EXISTS judgment_judges_name_trgm
  ON judgment_judges USING gin (judge_name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- judgment_statute_refs — "cases on section 138 NI Act", which we cannot answer
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 845 acts and 34,928 sections are already ingested. The link from a judgment to
-- the sections it actually discusses is not, so the single most common shape of
-- advocate query has no answer at all.
--
-- `act_id` is nullable ON PURPOSE and the rule is strict: a section reference
-- with no identifiable act is NOT recorded. A bare "section 5" is as likely to
-- be a clause of a contract or of the judgment's own scheme as a statutory
-- provision, and guessing a default act would put confident wrong rows into the
-- index — which is worse than an empty one, because an empty index is visibly
-- empty.
CREATE TABLE IF NOT EXISTS judgment_statute_refs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judgment_id    uuid NOT NULL REFERENCES judgments(id) ON DELETE CASCADE,
  statute_id     uuid REFERENCES statutes(id) ON DELETE SET NULL,
  -- The act as named IN THE JUDGMENT, e.g. `NI Act`. Kept even when it resolves,
  -- because how a court names an act is itself searchable and because an
  -- unresolved name is evidence for improving resolution later.
  act_named      text NOT NULL,
  -- Text, not integer: sections carry letters (`302A`, `63A`).
  section_number text NOT NULL,
  -- How many times this judgment refers to it. A section mentioned once in
  -- passing and one the judgment turns on are different things, and this is the
  -- cheapest available signal for ranking between them.
  occurrences    integer NOT NULL DEFAULT 1,
  first_offset   integer NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS judgment_statute_refs_unique
  ON judgment_statute_refs (judgment_id, act_named, section_number);
CREATE INDEX IF NOT EXISTS judgment_statute_refs_section_idx
  ON judgment_statute_refs (section_number);
CREATE INDEX IF NOT EXISTS judgment_statute_refs_statute_idx
  ON judgment_statute_refs (statute_id);
CREATE INDEX IF NOT EXISTS judgment_statute_refs_judgment_idx
  ON judgment_statute_refs (judgment_id);
-- `act:"NI Act"` must match however the court wrote it.
CREATE INDEX IF NOT EXISTS judgment_statute_refs_act_trgm
  ON judgment_statute_refs USING gin (act_named gin_trgm_ops);
