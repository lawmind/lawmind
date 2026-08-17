-- The two exact-lookup hot paths in `services/api/src/search/retrieve.ts`, both
-- of which read the whole 7,296,068-row `judgments` table today.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `exactCitation` — THE INDEX ALREADY EXISTED. THE `OR` WAS POISONING IT.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- This was filed as a missing-index problem and it is not one. `judgments_
-- neutral_citation_key` is already exactly the right expression index, already
-- built, and only 70 MB:
--
--   btree (upper(regexp_replace(COALESCE(neutral_citation, ''), '[^A-Za-z0-9]', '', 'g')))
--
-- The predicate is `neutral_citation_key = $1 OR EXISTS (SELECT 1 FROM
-- unnest(reporter_citations) rc WHERE <normalised rc> = $1)`. **A correlated
-- EXISTS over `unnest()` cannot use any index, ever** — the array is expanded
-- per row, so answering it requires visiting the row. And because the two arms
-- are `OR`ed, PostgreSQL cannot satisfy the first with an index scan and the
-- second some other way: a row failing the first arm might still pass the
-- second, so **every row has to be read**. One unindexable arm discards a
-- perfectly good index across the whole table.
--
-- The fix is therefore not more disk. It is (a) making the second arm indexable
-- and (b) splitting the `OR` into a `UNION` of two separately-indexable branches,
-- which is done in `retrieve.ts` alongside this migration.
--
-- `lawmind_citation_keys()` produces the same normalised key `citationLookupKey`
-- produces, for every element of the array. IMMUTABLE is required to index it and
-- is honest here: `upper()` and `regexp_replace()` are both immutable, which is
-- already proven by `judgments_neutral_citation_key` existing and using them.
--
-- NOT STRICT, deliberately. A STRICT function returns NULL for a NULL array, and
-- while `NULL @> ARRAY[key]` is correctly not-true, an always-array return means
-- the containment operator behaves identically for "no citations" and "empty
-- citations" instead of relying on three-valued logic to land the right way.
CREATE OR REPLACE FUNCTION lawmind_citation_keys(citations text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT coalesce(
    (SELECT array_agg(upper(regexp_replace(rc, '[^A-Za-z0-9]', '', 'g')))
     FROM unnest(coalesce(citations, '{}'::text[])) AS rc
     WHERE rc IS NOT NULL),
    '{}'::text[]
  )
$$;

COMMENT ON FUNCTION lawmind_citation_keys(text[]) IS
  'Normalised citation lookup keys for an array of reporter citations. Must stay '
  'byte-identical to citationLookupKey() in @lawmind/ingest/citations and to the '
  'expression in judgments_neutral_citation_key — three copies of one rule, and '
  'a divergence shows up as a citation that silently stops resolving.';

-- Tiny, because reporter citations are sparse: measured 20 of 3,760 sampled rows
-- carry any at all (0.53%), and the existing `judgments_reporter_citations_gin`
-- over the RAW array is only 12 MB. That sparsity is the sharpest part of the
-- finding — an arm that matches under 1% of rows was costing a full scan on 100%
-- of citation lookups.
CREATE INDEX IF NOT EXISTS "judgments_reporter_citation_keys_gin"
  ON "judgments" USING gin (lawmind_citation_keys("reporter_citations"));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. `exactCaseTitle` — a genuinely missing index, found by NEW1 (bus 0575)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `WHERE lower(btrim(regexp_replace(case_title, '\s+', ' ', 'g'))) = <same of $1>`.
-- The only index on the column is `judgments_case_title_trgm`, `gin (case_title
-- gin_trgm_ops)`, 653 MB — over the BARE column. The predicate's left side is a
-- function of the column, so no match is possible whatever gin_trgm_ops supports.
-- Sequential scan of 7,296,068 rows, on `/search`, inside Gate S1's 3s budget.
--
-- This is not a rare path. `CASE_NAME_RE` classifies 161 of 283 gold queries as
-- case-name shape, so ~57% of searches fire it (CURRENT_PLAN Q1.25). Tightening
-- that regex is worth doing on its own merits and is NEW1's item — but it only
-- changes how OFTEN the scan happens. The genuine case-name lookups still each
-- pay 7.3M rows, and those are precisely the queries where the advocate already
-- knows what they want.
--
-- btree, not hash, and the trade was measured rather than assumed. Normalised
-- titles average 49.6 characters (max 174), so this lands around 500 MB where a
-- hash index would be roughly a third of that. Disk is not the binding
-- constraint here (486 GB free, database 120 GB) and btree buys ordering,
-- range and prefix use for whatever needs the normalised title next, where a
-- hash index answers equality and nothing else. If disk ever becomes the
-- constraint this is the first index to reconsider.
CREATE INDEX IF NOT EXISTS "judgments_case_title_normalised_idx"
  ON "judgments" (
    (lower(btrim(regexp_replace("case_title", '\s+', ' ', 'g'))))
  );

-- Plain CREATE INDEX, not CONCURRENTLY, for the reason given in
-- `0050_judgments_created_at_idx.sql`: a migration runs inside a transaction and
-- CONCURRENTLY cannot. Both were built CONCURRENTLY out of band against the
-- local cluster first, so `IF NOT EXISTS` makes this a no-op there. Any future
-- rebuild against a populated database must be done out of band too.
