/**
 * NEW2 P2/P14 — measure the display-equivalence contract against the corpus.
 *
 * Two questions, kept apart:
 *
 *   1. Of the judgments that SHARE a neutral citation, how do they distribute
 *      across the five classes, weighted by rows rather than by groups? A group
 *      census weights a 2-row duplicate the same as a 253-row common order.
 *
 *   2. How much duplication would actually disappear from a search result page
 *      if only the two document-evidence classes collapse?
 *
 * Read-only. Writes one artifact, no rows.
 *
 *   pnpm --filter @lawmind/ingest exec tsx src/display-group-cli.ts
 */
import { writeFileSync } from 'node:fs';

import postgres from 'postgres';

import { withTransientRetry } from './db-transient.ts';
import { buildGroup, type DisplayGroup, type Member } from './display-group.ts';

const sql = postgres(process.env.DATABASE_URL ?? '', {
  max: 1,
  prepare: false,
  connect_timeout: 30,
  idle_timeout: 0,
});
const OUT = 'docs/ai/new2/display-grouping-measurement.json';
const SAMPLE_GROUPS = Number(process.env.SAMPLE_GROUPS ?? 1200);

type Row = Member & { citation_key: string };

/** Wilson 95% interval, so a share is never quoted as if it were exact. */
function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const p = k / n;
  const z = 1.96;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [+((centre - half) * 100).toFixed(2), +((centre + half) * 100).toFixed(2)];
}

async function main(): Promise<void> {
  console.log('DISPLAY GROUPING — measuring what a result page may fold\n');

  // ---- the population -----------------------------------------------------
  /* Grouped on judgments.neutral_citation, NOT judgment_citation_keys. The key
   * table is still backfilling (1.08M keys against 18.7M judgments), so grouping
   * there measures the backfill's progress rather than the corpus. The 22 Aug
   * census used this same population: 155,388 groups / 361,045 rows. */
  const [pop] = await sql<{ groups: string; rows: string }[]>`
    SELECT count(*)::text AS groups, coalesce(sum(n), 0)::text AS rows
      FROM (
        SELECT neutral_citation, count(*) AS n
          FROM judgments
         WHERE neutral_citation IS NOT NULL AND neutral_citation <> ''
         GROUP BY neutral_citation
        HAVING count(*) > 1
      ) t`;
  console.log(`shared-citation population: ${pop?.groups} groups · ${pop?.rows} rows`);

  // ---- a sample of groups, with every member ------------------------------
  const keys = await sql<{ citation_key: string; n: number }[]>`
    SELECT upper(regexp_replace(neutral_citation, '[^A-Za-z0-9]', '', 'g')) AS citation_key,
           count(*)::int AS n
      FROM judgments
     WHERE neutral_citation IS NOT NULL AND neutral_citation <> ''
     GROUP BY 1
    HAVING count(*) > 1
     ORDER BY md5(upper(regexp_replace(neutral_citation, '[^A-Za-z0-9]', '', 'g')))
     LIMIT ${SAMPLE_GROUPS}`;
  console.log(`sampled groups: ${keys.length}`);

  const byType: Record<string, { groups: number; rows: number; hidden: number }> = {};
  const groups: DisplayGroup[] = [];
  let rowsSeen = 0;
  let rowsHidden = 0;

  /* Membership is matched through the INDEXED expression. There is no index on
   * the raw column — only on upper(regexp_replace(...)) — so an equality on
   * neutral_citation seq-scans 22 GB PER GROUP, which is why the first run of
   * this measurement never finished 900 of them.
   *
   * The retry is for the other failure: this box produces one-off OS read
   * failures on that table under lane contention, and the run before that died
   * on one with 1,200 groups still to read. */
  for (const k of keys) {
    const members = await withTransientRetry(
      `members of ${k.citation_key}`,
      () => sql<Row[]>`
      SELECT j.id, j.content_hash, j.source_url, j.storage_key, j.case_number, j.cnr,
             j.judgment_date::text AS judgment_date, j.court, j.case_title,
             length(j.full_text) AS full_text_chars, j.native_text, j.script_quality,
             ${k.citation_key} AS citation_key
        FROM judgments j
       WHERE upper(regexp_replace(coalesce(j.neutral_citation, ''), '[^A-Za-z0-9]', '', 'g'))
             = ${k.citation_key}
       LIMIT 400`,
    );
    if (members.length < 2) continue;
    const g = buildGroup(members);
    groups.push(g);
    rowsSeen += members.length;
    rowsHidden += g.members_hidden_if_collapsed;
    const t = (byType[g.group_type] ??= { groups: 0, rows: 0, hidden: 0 });
    t.groups += 1;
    t.rows += members.length;
    t.hidden += g.members_hidden_if_collapsed;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    contract: 'docs/ai/new2/DISPLAY_GROUPING_CONTRACT_2026-08-23.md',
    module: 'services/ingest/src/display-group.ts',
    population: { groups: Number(pop?.groups ?? 0), rows: Number(pop?.rows ?? 0) },
    sample: { groups: groups.length, rows: rowsSeen },
    by_type: Object.fromEntries(
      Object.entries(byType).map(([type, v]) => [
        type,
        {
          ...v,
          share_of_sampled_rows_pct: +((v.rows / rowsSeen) * 100).toFixed(2),
          ci95: wilson(v.rows, rowsSeen),
        },
      ]),
    ),
    duplication_removed: {
      rows_sampled: rowsSeen,
      rows_hidden_by_auto_collapse: rowsHidden,
      pct_of_shared_rows_removed: +((rowsHidden / rowsSeen) * 100).toFixed(2),
      ci95: wilson(rowsHidden, rowsSeen),
      meaning:
        'the share of rows that disappear from a result page when ONLY the two document-evidence classes fold. Connected matters and multiple orders stay visible by contract.',
    },
    representative_stability: {
      note: 'representative() is a total order over document properties, ending in content_hash then id. Two runs over the same members return the same id — pinned by display-group.test.ts.',
    },
    examples: groups
      .filter((g) => g.member_ids.length >= 3)
      .slice(0, 8)
      .map((g) => ({
        group_id: g.group_id,
        group_type: g.group_type,
        members: g.member_ids.length,
        representative_id: g.representative_id,
        representative_reason: g.representative_reason,
        evidence: g.evidence,
      })),
  };

  writeFileSync(OUT, JSON.stringify(report, null, 1));
  console.log('\nBY TYPE (weighted by rows)');
  for (const [type, v] of Object.entries(report.by_type)) {
    console.log(
      `  ${type.padEnd(36)} ${String(v.groups).padStart(5)} groups · ${String(v.rows).padStart(6)} rows · ${String(v.share_of_sampled_rows_pct).padStart(6)}%`,
    );
  }
  console.log(
    `\nauto-collapse removes ${rowsHidden} of ${rowsSeen} shared rows = ${report.duplication_removed.pct_of_shared_rows_removed}%`,
  );
  console.log('written ->', OUT);
}

try {
  await main();
} finally {
  await sql.end();
}
