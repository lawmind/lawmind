/**
 * NEW2 P2b — THE MECHANISM BEHIND EVERY FALSE UNIQUE THE RECONCILIATION FOUND.
 *
 * Grading LCC's resolver against truth set v2 produced 10 false uniques and 24
 * recall misses, and all 34 have one shape: the adjudicated group has two or
 * more members, and `judgment_citation_keys` holds fewer than that. 58 of the 68
 * candidates in those records are reachable only through
 * `judgments.neutral_citation`; 10 through the key table.
 *
 * The resolver reads ONE table. So its AMBIGUOUS state — the whole safety
 * argument, the thing that stops a bench ambiguity being folded to one judgment
 * — is only as good as that table's completeness, and nothing had measured it.
 *
 * This counts, over every shared-neutral group in the corpus, how many members
 * the key table can actually see. A group of 2 that the key table holds once is
 * a resolver UNIQUE where the honest answer is AMBIGUOUS: a false unique
 * MANUFACTURED BY THE INDEX, not by the rules.
 *
 * Severity comes from the group's own evidence, not from a guess:
 *   distinct_content_hashes = 1                   -> duplicate ingestion, BENIGN
 *   hashes > 1 and case numbers = 1               -> same matter, different bytes
 *   hashes > 1 and case numbers > 1               -> DIFFERENT DOCUMENTS, the
 *                                                    class that can show an
 *                                                    advocate the wrong case
 *
 * READ ONLY. `new2_neutral_dupe_groups` is this lane's own census table from
 * 22 Aug; nothing is written.
 */
import { writeFileSync } from 'node:fs';

import postgres from 'postgres';

const OUT = 'docs/ai/new2/resolver-collapse-census.json';

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  statement_timeout: 900000,
  idle_timeout: 0,
  onnotice: () => {},
});

/** Every timing is meaningless without what else held the box. */
async function load() {
  const [r] = await sql`
    SELECT count(*) FILTER (WHERE state = 'active')::int AS active,
           count(*)::int AS total
      FROM pg_stat_activity WHERE datname = current_database()`;
  return r;
}

const steps = [];
async function step(name, fn) {
  const before = await load();
  const t = Date.now();
  const rows = await fn();
  const ms = Date.now() - t;
  const after = await load();
  const rec = { name, ms, pg_active_before: before.active, pg_active_after: after.active, rows };
  steps.push(rec);
  console.log(`${name}  ${ms}ms  pg_active ${before.active}->${after.active}`);
  console.log(JSON.stringify(rows, null, 1).slice(0, 3000));
  return rows;
}

try {
  // 1. Is `k` the same convention as `citation_key`? Asserted, never assumed —
  //    if the two normalisations differ every number below is zero for the wrong
  //    reason, which is exactly the failure this repo has paid for before.
  await step('key_convention_agreement', () => sql`
    SELECT count(*)::int AS groups_probed,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM judgment_citation_keys k WHERE k.citation_key = g.k
           ))::int AS groups_with_at_least_one_key_row
      FROM (SELECT k FROM new2_neutral_dupe_groups ORDER BY k LIMIT 2000) g`);

  // 2. The denominator, re-measured now rather than quoted from 22 August.
  await step('denominators', () => sql`
    SELECT (SELECT count(*)::int FROM new2_neutral_dupe_groups) AS shared_groups,
           (SELECT sum(n)::int FROM new2_neutral_dupe_groups) AS rows_in_shared_groups,
           (SELECT count(DISTINCT judgment_id)::int FROM judgment_citation_keys
             WHERE source = 'neutral') AS judgments_with_neutral_key_row`);

  // 3. The census. One indexed count per group.
  await step('collapse_by_visibility', () => sql`
    WITH vis AS (
      SELECT g.n AS true_size,
             g.distinct_content_hashes AS hashes,
             g.distinct_case_numbers AS case_numbers,
             g.a_court AS court,
             (SELECT count(DISTINCT k.judgment_id)::int
                FROM judgment_citation_keys k WHERE k.citation_key = g.k) AS held
        FROM new2_neutral_dupe_groups g
    )
    SELECT count(*)::int AS groups,
           count(*) FILTER (WHERE held = 0)::int AS invisible_target_not_held,
           count(*) FILTER (WHERE held = 1)::int AS collapses_to_false_unique,
           count(*) FILTER (WHERE held BETWEEN 2 AND true_size - 1)::int AS partial_ambiguous,
           count(*) FILTER (WHERE held >= true_size)::int AS fully_visible,
           count(*) FILTER (WHERE held = 1 AND hashes = 1)::int AS false_unique_benign_duplicate,
           count(*) FILTER (WHERE held = 1 AND hashes > 1 AND case_numbers = 1)::int AS false_unique_same_matter,
           count(*) FILTER (WHERE held = 1 AND hashes > 1 AND case_numbers > 1)::int AS false_unique_different_documents
      FROM vis`);

  // 4. Where it lives. A corpus-wide percentage hides a court-shaped problem —
  //    this repository has been caught by that on embedding coverage already.
  await step('collapse_by_court', () => sql`
    WITH vis AS (
      SELECT g.a_court AS court, g.n AS true_size,
             g.distinct_content_hashes AS hashes, g.distinct_case_numbers AS case_numbers,
             (SELECT count(DISTINCT k.judgment_id)::int
                FROM judgment_citation_keys k WHERE k.citation_key = g.k) AS held
        FROM new2_neutral_dupe_groups g
    )
    SELECT court,
           count(*)::int AS groups,
           count(*) FILTER (WHERE held = 1)::int AS collapses,
           count(*) FILTER (WHERE held = 1 AND hashes > 1 AND case_numbers > 1)::int AS collapses_different_documents,
           count(*) FILTER (WHERE held = 0)::int AS invisible
      FROM vis GROUP BY court
      HAVING count(*) FILTER (WHERE held = 1) > 0
      ORDER BY collapses DESC LIMIT 25`);

  // 5. Named examples of the dangerous class, so the number can be checked by hand.
  await step('different_document_collapse_examples', () => sql`
    WITH vis AS (
      SELECT g.k, g.sample_raw, g.n AS true_size, g.a_court, g.distinct_case_numbers, g.distinct_content_hashes,
             (SELECT count(DISTINCT k2.judgment_id)::int
                FROM judgment_citation_keys k2 WHERE k2.citation_key = g.k) AS held
        FROM new2_neutral_dupe_groups g
       WHERE g.distinct_content_hashes > 1 AND g.distinct_case_numbers > 1
    )
    SELECT k, sample_raw, a_court, true_size, held, distinct_case_numbers, distinct_content_hashes
      FROM vis WHERE held = 1 ORDER BY true_size DESC LIMIT 15`);

  writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), steps }, null, 2));
  console.log(`wrote ${OUT}`);
} finally {
  await sql.end({ timeout: 10 });
}
