#!/usr/bin/env node
/**
 * NEW2 — EXACT-CONTENT DUPLICATE GROUPS, EXPORTED FOR LCC.
 *
 * ---------------------------------------------------------------------------
 * EXACT ONLY. NOTHING FUZZY, AND NO IDENTITY IS DELETED.
 * ---------------------------------------------------------------------------
 *
 * Grouping is by `content_hash` — byte-identical extracted text — and by nothing
 * else. Near-duplicate clustering is deliberately absent: this corpus contains
 * roughly two thousand genuine citation conflicts, where two different decisions
 * carry the same reporter citation, and a fuzzy merge deletes one of them from
 * the corpus while every count still reads healthy.
 *
 * Nor does anything here collapse a case. Every petition keeps its `judgments`
 * row, its caption, its case number and its parties. What a group says is that
 * one EMBEDDING can serve all of them, and that a retrieval hit on the
 * representative must fan back out to its members before display — otherwise an
 * advocate searching their own case number finds the decision filed under
 * somebody else's name, or does not find it at all.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE GROUPS COME FROM
 * ---------------------------------------------------------------------------
 *
 * `embedding_content_representative`, built by the Tier-A census. It carries the
 * hash, the chosen representative, the member count, and the definition hash it
 * was built under. This tool does not rebuild it — a second definition of
 * "duplicate" is exactly what a corpus should not have — it exports it, adds the
 * court and year of the representative, and pulls member ids for the extreme
 * groups only.
 *
 * Member ids for ALL groups would be 845,876 rows of pure identifier. The
 * question that needs them is "what does a 7,118-member group actually contain",
 * and that is answered by the extremes. The map back for any other group is one
 * indexed lookup: `WHERE content_hash = $1`.
 *
 *   node --env-file=.env scripts/migration/new2-duplicate-groups.mjs \
 *     [--extreme 40] [--members 200] [--out docs/ops/migration/new2-duplicate-groups.json]
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { sslFor } from './new2-ssl.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const EXTREME = Number(arg('extreme', '40'));
const MEMBERS = Number(arg('members', '200'));
const OUT = arg('out', join(ROOT, 'docs', 'ops', 'migration', 'new2-duplicate-groups.json'));

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL not set — run with node --env-file=.env');
  process.exit(2);
}
const sql = postgres(url, {
  ssl: sslFor(url),
  max: 1,
  idle_timeout: 5,
  connect_timeout: 30,
  prepare: false,
});

try {
  /* Both aggregates ride `embedding_content_representative_multi_idx`, which is
   * partial on `member_count > 1`. Neither touches `judgments` or detoasts a
   * single `full_text`. */
  const [totals] = await sql`
    SELECT count(*)::bigint                                           AS groups_total,
           count(*) FILTER (WHERE member_count > 1)::bigint            AS groups_multi,
           sum(member_count)::bigint                                   AS members_total,
           sum(member_count - 1) FILTER (WHERE member_count > 1)::bigint AS vectors_saved,
           max(member_count)::bigint                                   AS largest_group,
           min(definition_hash)                                        AS definition_hash,
           min(definition_version)                                     AS definition_version
      FROM embedding_content_representative`;

  const histogram = await sql`
    SELECT member_count::int AS members, count(*)::bigint AS groups
      FROM embedding_content_representative
     WHERE member_count > 1
     GROUP BY member_count
     ORDER BY member_count
     LIMIT 200`;

  /* The extremes, with the representative's court and year attached. The join is
   * a primary-key probe per row, `--extreme` rows deep, so it stays bounded. */
  const extremes = await sql`
    SELECT r.content_hash,
           r.representative_judgment_id,
           r.member_count::int AS member_count,
           j.court,
           extract(year FROM j.judgment_date)::int AS judgment_year,
           j.case_number,
           left(j.case_title, 160)                 AS case_title
      FROM embedding_content_representative r
      JOIN judgments j ON j.id = r.representative_judgment_id
     WHERE r.member_count > 1
     ORDER BY r.member_count DESC
     LIMIT ${EXTREME}`;

  /* Member ids for the extremes only, capped per group. `judgments_content_hash_idx`
   * makes each of these an index probe rather than a scan. */
  for (const g of extremes) {
    const members = await sql`
      SELECT id, court, case_number, judgment_date
        FROM judgments
       WHERE content_hash = ${g.content_hash}
       ORDER BY judgment_date NULLS LAST, id
       LIMIT ${MEMBERS}`;
    g.memberSample = members;
    g.memberSampleTruncated = g.member_count > MEMBERS;
    /* Courts represented inside one group. A group that spans courts is a
     * different thing from a common order inside one registry, and the count is
     * the cheapest way to tell which this is. */
    g.distinctCourtsInSample = new Set(members.map((m) => m.court)).size;
  }

  const out = {
    generatedAt: new Date().toISOString(),
    lane: 'NEW2',
    source: 'embedding_content_representative',
    grouping: 'exact content_hash only — no fuzzy clustering, no case identity collapsed',
    definitionVersion: totals.definition_version,
    definitionHash: totals.definition_hash,
    totals: {
      groupsTotal: Number(totals.groups_total),
      groupsWithMoreThanOneMember: Number(totals.groups_multi),
      membersTotal: Number(totals.members_total),
      vectorsSavedByExactDedup: Number(totals.vectors_saved),
      largestGroup: Number(totals.largest_group),
    },
    histogram: histogram.map((h) => ({ members: h.members, groups: Number(h.groups) })),
    extremeGroups: extremes,
    caveats: [
      'The representative row carries ONE petition case_title, case_number and judgment_date while the TEXT is a common order naming a different petitioner. That is what a common order is, not a defect.',
      'A retrieval hit on a representative must fan out to its members before display. The map back is WHERE content_hash = $1 against judgments_content_hash_idx.',
      'Grouping is on the EXTRACTED text. Two documents whose PDFs differ but whose extraction collapsed to the same bytes group together here — for a damaged extraction that is a signal worth reading, not a duplicate.',
      'The table was built under the definition hash recorded above. Rows ingested after that build are absent from it; membersTotal is the Tier-A population at build time, not the corpus today.',
    ],
  };
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  console.log(
    [
      `groups                 ${out.totals.groupsTotal.toLocaleString()}`,
      `  with >1 member       ${out.totals.groupsWithMoreThanOneMember.toLocaleString()}`,
      `members                ${out.totals.membersTotal.toLocaleString()}`,
      `vectors saved          ${out.totals.vectorsSavedByExactDedup.toLocaleString()}`,
      `largest group          ${out.totals.largestGroup.toLocaleString()}`,
      `extremes exported      ${extremes.length} (member sample capped at ${MEMBERS})`,
      `written                ${OUT}`,
    ].join('\n'),
  );
} finally {
  await sql.end({ timeout: 5 });
}
