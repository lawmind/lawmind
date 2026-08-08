/**
 * How much of a citator do we actually have?
 *
 * Written for the Supreme Today teardown, and kept because the answer is a
 * standing product number rather than a one-off. `PRODUCT_BRIEF.md` treats
 * "the law has moved" as a differentiator and `CITATION_HARNESS.md` puts a zero
 * threshold on stale-overruled rate. Both are claims about a table, and a claim
 * about a table should be checkable in one command.
 *
 *   pnpm --filter @lawmind/harness citator
 */
import postgres from 'postgres';

const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('CORPUS_DATABASE_URL is not set.');
  process.exit(2);
}

const sql = postgres(url, { ssl: url.includes('localhost') ? false : 'require', max: 2 });

try {
  const [j] = await sql<{ total: number; moved: number; with_note: number; with_paras: number }[]>`
    SELECT count(*)::int                                                AS total,
           count(*) FILTER (WHERE overruled_status <> 'none')::int      AS moved,
           count(*) FILTER (WHERE overruled_note IS NOT NULL)::int      AS with_note,
           count(*) FILTER (WHERE overruled_paras IS NOT NULL)::int     AS with_paras
      FROM judgments`;

  const rel = await sql<{ relationship: string; n: number }[]>`
    SELECT relationship, count(*)::int AS n
      FROM judgment_citations
     GROUP BY relationship ORDER BY n DESC`;

  const [edges] = await sql<{ total: number; resolved: number; with_evidence: number }[]>`
    SELECT count(*)::int                                             AS total,
           count(*) FILTER (WHERE cited_judgment_id IS NOT NULL)::int AS resolved,
           count(*) FILTER (WHERE evidence IS NOT NULL)::int          AS with_evidence
      FROM judgment_citations`;

  console.log('judgments');
  console.log(`  total                 ${j!.total.toLocaleString('en-IN')}`);
  console.log(
    `  law has moved         ${j!.moved} ` +
      `(${((j!.moved / j!.total) * 100).toFixed(4)}% of the corpus)`,
  );
  console.log(`  carrying a note       ${j!.with_note}`);
  console.log(`  carrying paragraphs   ${j!.with_paras}`);

  console.log('');
  console.log('citation edges');
  console.log(`  total                 ${edges!.total.toLocaleString('en-IN')}`);
  console.log(`  resolved to a judgment ${edges!.resolved.toLocaleString('en-IN')}`);
  console.log(`  carrying evidence     ${edges!.with_evidence.toLocaleString('en-IN')}`);
  console.log('');
  console.log('  treatment breakdown');
  for (const r of rel) {
    console.log(`    ${r.relationship.padEnd(16)} ${r.n.toLocaleString('en-IN')}`);
  }

  /**
   * The comparison that matters, stated rather than left to be inferred.
   *
   * A citator whose only populated relationship is `cites` is a citation index,
   * not a citator. It answers "who mentioned this" and not "is it still good
   * law", and only the second question is the one an advocate is standing up
   * with.
   */
  const nonCites = rel.filter((r) => r.relationship !== 'cites').reduce((a, r) => a + r.n, 0);
  console.log('');
  console.log(
    nonCites === 0
      ? '  VERDICT: every edge is a bare `cites`. This is a citation index, not a\n' +
          '  citator. "The law has moved" cannot be answered from it at scale.'
      : `  ${nonCites.toLocaleString('en-IN')} edges carry a treatment other than a bare mention.`,
  );

  /**
   * **The gap that matters: extracted, but never applied.**
   *
   * `judgment_citations` records that one judgment overruled another.
   * `judgments.overruled_status` is what every surface actually renders from —
   * `CITATION_HARNESS.md` step 9, read live, never cached. The two are filled by
   * different processes, so the second can lag the first indefinitely and
   * nothing looks wrong: the edge is in the table, the badge is not on the
   * screen, and the advocate relies on an authority a later court has already
   * set aside.
   *
   * That is the stale-overruled failure arriving through the back door. The
   * harness's `staleOverruledRate` cannot catch it either — that measures
   * whether a status CHANGE reaches the next read, not whether a status that
   * should exist was ever written.
   */
  const [gap] = await sql<{ targets: number; unflagged: number }[]>`
    WITH overruling AS (
      SELECT DISTINCT cited_judgment_id AS id
        FROM judgment_citations
       WHERE cited_judgment_id IS NOT NULL
         AND relationship IN ('overruled', 'overruled_in_part', 'doubted')
    )
    SELECT count(*)::int AS targets,
           count(*) FILTER (WHERE j.overruled_status = 'none')::int AS unflagged
      FROM overruling o JOIN judgments j ON j.id = o.id`;

  console.log('');
  console.log('  applied to judgments.overruled_status?');
  console.log(`    judgments an edge says were overruled/doubted  ${gap!.targets}`);
  console.log(`    of those, still reading 'none'                 ${gap!.unflagged}`);
  if (gap!.unflagged > 0) {
    console.log('');
    console.log(
      `    ${gap!.unflagged} judgments are recorded in the citation graph as having been\n` +
        '    overruled or doubted, and every surface still renders them as good law.\n' +
        '    The extraction ran; the propagation to `judgments` did not.',
    );
  }
} finally {
  await sql.end();
}
