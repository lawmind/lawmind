/**
 * NEW2 P2c — THE PINS ALREADY IN THE GRAPH, AND THE CONCORDANCE TABLE.
 *
 * §8's requirement is not only "what would a backfill do" but "what is already
 * written". Two populations:
 *
 *   1. `judgment_citations.cited_judgment_id` that is non-null and points into a
 *      shared-neutral group. Those pins were written before this lane measured
 *      the groups. A pin into a group is not automatically wrong — it is wrong
 *      exactly when the group holds genuinely different documents — so the
 *      severity split is carried through from `new2_neutral_dupe_groups`.
 *
 *   2. `citation_concordance_resolutions`. §8: ensure unvalidated / model-selected
 *      candidates cannot automatically become canonical writes. That is a
 *      question about columns and rows, not about intentions, so both are read.
 *
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';

import postgres from 'postgres';

const OUT = 'docs/ai/new2/resolver-ingraph-audit.json';

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  statement_timeout: 900000,
  idle_timeout: 0,
  onnotice: () => {},
});

const steps = [];
async function step(name, fn) {
  const [{ active: before }] = await sql`
    SELECT count(*) FILTER (WHERE state='active')::int AS active FROM pg_stat_activity WHERE datname=current_database()`;
  const t = Date.now();
  const rows = await fn();
  const ms = Date.now() - t;
  steps.push({ name, ms, pg_active_before: before, rows });
  console.log(`\n== ${name}  ${ms}ms  pg_active_before ${before}`);
  console.log(JSON.stringify(rows, null, 1).slice(0, 4000));
  return rows;
}

try {
  await step('citation_edge_totals', () => sql`
    SELECT count(*)::int AS edges,
           count(*) FILTER (WHERE cited_judgment_id IS NOT NULL)::int AS pinned,
           count(*) FILTER (WHERE relationship <> 'cites')::int AS treated,
           count(*) FILTER (WHERE cited_judgment_id IS NOT NULL AND relationship <> 'cites')::int AS pinned_and_treated
      FROM judgment_citations`);

  // A pin lands in a shared group when the TARGET's own neutral citation is one
  // of the 155,388. Joined on the normalised key, the same convention the
  // resolver and the census both use.
  await step('pins_into_shared_groups', () => sql`
    WITH pinned AS (
      SELECT c.cited_judgment_id AS jid
        FROM judgment_citations c
       WHERE c.cited_judgment_id IS NOT NULL
    ), keyed AS (
      SELECT p.jid,
             upper(regexp_replace(coalesce(j.neutral_citation,''), '[^A-Za-z0-9]', '', 'g')) AS k
        FROM pinned p JOIN judgments j ON j.id = p.jid
    )
    SELECT count(*)::int AS pins,
           count(*) FILTER (WHERE keyed.k <> '')::int AS pins_with_neutral,
           count(*) FILTER (WHERE g.k IS NOT NULL)::int AS pins_into_shared_group,
           count(*) FILTER (WHERE g.distinct_content_hashes = 1)::int AS into_byte_identical_group,
           count(*) FILTER (WHERE g.distinct_content_hashes > 1 AND g.distinct_case_numbers = 1)::int AS into_same_matter_group,
           count(*) FILTER (WHERE g.distinct_content_hashes > 1 AND g.distinct_case_numbers > 1)::int AS into_different_document_group
      FROM keyed LEFT JOIN new2_neutral_dupe_groups g ON g.k = keyed.k`);

  await step('pins_into_shared_groups_by_relationship', () => sql`
    WITH keyed AS (
      SELECT c.relationship,
             upper(regexp_replace(coalesce(j.neutral_citation,''), '[^A-Za-z0-9]', '', 'g')) AS k
        FROM judgment_citations c JOIN judgments j ON j.id = c.cited_judgment_id
       WHERE c.cited_judgment_id IS NOT NULL AND c.relationship <> 'cites'
    )
    SELECT keyed.relationship,
           count(*)::int AS pins,
           count(*) FILTER (WHERE g.k IS NOT NULL)::int AS into_shared_group,
           count(*) FILTER (WHERE g.distinct_content_hashes > 1 AND g.distinct_case_numbers > 1)::int AS into_different_document_group
      FROM keyed LEFT JOIN new2_neutral_dupe_groups g ON g.k = keyed.k
     GROUP BY 1 ORDER BY 2 DESC`);

  await step('concordance_columns', () => sql`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_name = 'citation_concordance_resolutions' ORDER BY ordinal_position`);

  await step('concordance_rows', () => sql`
    SELECT count(*)::int AS n FROM citation_concordance_resolutions`);

  await step('concordance_tables_present', () => sql`
    SELECT tablename FROM pg_tables
     WHERE schemaname='public' AND tablename LIKE 'citation_concordance%' ORDER BY 1`);

  writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), steps }, null, 2));
  console.log(`\nwrote ${OUT}`);
} finally {
  await sql.end({ timeout: 10 });
}
