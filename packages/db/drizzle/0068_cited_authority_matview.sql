-- ───────────────────────────────────────────────────────────────────────────
-- CITED AUTHORITY — the set of judgments another judgment actually cited
-- ───────────────────────────────────────────────────────────────────────────
--
-- **35,890 rows out of 22,322,047 edges.** That ratio is the whole reason this
-- is a materialised view and not a predicate.
--
-- The eligibility view is sometimes scanned in full — something ran
-- `select semantic_tier, count(*) from judgment_embedding_eligibility group by 1`
-- for 45 minutes this evening — and two ways of asking "was this judgment ever
-- cited" inside a view are both wrong at that scale:
--
--   * `EXISTS (SELECT 1 FROM judgment_citations WHERE cited_judgment_id = j.id)`
--     is one index probe per row: 18.7M probes on a full scan.
--   * `LEFT JOIN (SELECT DISTINCT cited_judgment_id FROM judgment_citations)`
--     re-derives the distinct set from 22.3M index entries on EVERY use.
--
-- A 35,890-row materialised view hash-joins in memory and costs effectively
-- nothing per scan.
--
-- ───────────────────────────────────────────────────────────────────────────
-- IT GOES STALE, AND THAT IS A RECALL COST, NEVER A SAFETY COST
-- ───────────────────────────────────────────────────────────────────────────
--
-- A judgment cited for the first time after the last refresh is not reachable
-- until the next one. Nothing is admitted that should not be — staleness can
-- only make this set SMALLER than the truth, never larger, because a row here
-- can only have come from a real resolved edge.
--
-- The unique index exists so `REFRESH MATERIALIZED VIEW CONCURRENTLY` works:
-- a plain refresh takes ACCESS EXCLUSIVE and would block every reader of the
-- eligibility view for the duration.
--
--   REFRESH MATERIALIZED VIEW CONCURRENTLY cited_authority;
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHAT MEMBERSHIP DOES AND DOES NOT MEAN
-- ───────────────────────────────────────────────────────────────────────────
--
-- It means: **a judge, in another judgment in this corpus, cited this one**, and
-- the citation resolved to a corpus identity rather than to a string.
--
-- It does NOT mean the judgment is substantive precedent, is good law, or says
-- anything worth retrieving. A two-line order refusing an adjournment can be
-- cited. `overruled_status` is a different question with a different source and
-- is deliberately not consulted here.
--
SET LOCAL lock_timeout = '3s';

CREATE MATERIALIZED VIEW IF NOT EXISTS cited_authority AS
SELECT DISTINCT jc.cited_judgment_id AS judgment_id
  FROM judgment_citations jc
 WHERE jc.cited_judgment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cited_authority_judgment_id_key
  ON cited_authority (judgment_id);

COMMENT ON MATERIALIZED VIEW cited_authority IS
  'Judgments that another judgment in this corpus actually cited, with the '
  'citation resolved to a corpus identity. 35,890 of 22,322,047 edges as at '
  '21 Aug 2026. Membership is POSITIVE EVIDENCE that a judge reached for this '
  'authority; it is not a claim that the judgment is precedent, is good law, or '
  'is worth retrieving. Refresh with REFRESH MATERIALIZED VIEW CONCURRENTLY -- '
  'a plain refresh takes ACCESS EXCLUSIVE and blocks every reader of '
  'judgment_embedding_eligibility. Staleness shrinks this set and can never '
  'grow it, so it is a recall cost and never a safety one.';
