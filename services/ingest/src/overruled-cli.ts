/**
 * Back-fill `judgments.overruled_status` from the extracted citation graph.
 *
 *   pnpm --filter @lawmind/ingest run overruled [--confirm]
 *
 * **Why this has to run.** `overruled_status` is `none` on all 38,341 judgments,
 * so no surface in the product can show that the law has moved: the LAW MOVED
 * treatment never renders, the stale-overruled metric reads a trivial 0.0%, and
 * `set_aside` never disables add-to-matter. `docs/CITATION_HARNESS.md` names this
 * blind spot exactly — a corpus that never learned an overruling agrees with
 * itself while advocates see stale badges.
 *
 * **Where the evidence comes from.** Only rows in `judgment_citations` whose
 * relationship was set from the court's OWN printed annotation ("– overruled",
 * "– dissented from"). Never a proximity heuristic: an earlier attempt at that
 * produced 33 overrulings in 300 judgments against 143 in the whole corpus and
 * put a fabricated overruling on N.P. Ponnuswami (1952), whose own passage marked
 * it "referred to".
 *
 * **The enum has no `overruled` value, and that is deliberate.**
 * `docs/SCHEMA_TRUTH.md` gives `none | set_aside | partly_set_aside | doubted`,
 * and `CITATION_HARNESS.md` §9.3 attaches distinct rendering to each:
 * `set_aside` replaces the header in danger red AND disables add-to-matter,
 * `partly_set_aside` must name the affected paragraphs, `doubted` shows no band.
 * So the mapping is:
 *
 *   citation `overruled` -> `set_aside`      the authority is no longer good law
 *   citation `doubted`   -> `doubted`        binding, but expect it contested
 *   anything else        -> unchanged
 *
 * `partly_set_aside` is NOT inferred. It requires `overruled_paras`, and nothing
 * in a "– overruled" annotation says which paragraphs fell. Claiming a partial
 * set-aside without naming the paragraphs would assert a precision we do not
 * have.
 */
import postgres from 'postgres';

type Candidate = {
  cited_judgment_id: string;
  citing_judgment_id: string;
  relationship: string;
  evidence: string | null;
  cited_title: string;
  citing_title: string;
  citing_date: string;
};

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 2, ssl: 'require' });
  const confirmed = process.argv.includes('--confirm');

  try {
    // The most recent bench to have treated an authority is the one that governs
    // its current status. An older overruling superseded by a later reference
    // does not un-overrule it, but where two benches disagree the later one is
    // what an advocate must be shown.
    const candidates = await sql<Candidate[]>`
      SELECT DISTINCT ON (c.cited_judgment_id)
             c.cited_judgment_id, c.citing_judgment_id, c.relationship, c.evidence,
             cited.case_title AS cited_title, citing.case_title AS citing_title,
             citing.judgment_date::text AS citing_date
      FROM judgment_citations c
      JOIN judgments cited  ON cited.id  = c.cited_judgment_id
      JOIN judgments citing ON citing.id = c.citing_judgment_id
      WHERE c.relationship IN ('overruled', 'doubted')
        AND c.cited_judgment_id IS NOT NULL
      ORDER BY c.cited_judgment_id,
               -- overruled outranks doubted for the same authority
               CASE c.relationship WHEN 'overruled' THEN 0 ELSE 1 END,
               citing.judgment_date DESC
    `;

    const target = (r: Candidate) => (r.relationship === 'overruled' ? 'set_aside' : 'doubted');

    console.log(`authorities with a printed overruled/doubted annotation: ${candidates.length}`);
    const byStatus = candidates.reduce<Record<string, number>>((acc, r) => {
      const t = target(r);
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});
    for (const [k, v] of Object.entries(byStatus)) console.log(`  ${k.padEnd(16)} ${v}`);

    console.log('\nsample — verify these against the source text before trusting the run:');
    for (const r of candidates.slice(0, 8)) {
      console.log(`  [${target(r)}] ${r.cited_title.slice(0, 44)}`);
      console.log(
        `      by ${r.citing_title.slice(0, 44)} (${r.citing_date})  evidence="${r.evidence}"`,
      );
    }

    if (!confirmed) {
      console.log('\nDRY RUN — nothing written. Re-run with --confirm to apply.');
      return;
    }

    let updated = 0;
    for (const r of candidates) {
      // One transaction per judgment. `overruled_status_changed_at` is set in the
      // SAME write as the status — without it there is no way to tell a badge
      // that was wrong when rendered from one the world invalidated afterwards,
      // which is the whole basis of the stale-overruled metric.
      const rows = await sql`
        UPDATE judgments
        SET overruled_status = ${target(r)},
            overruled_by_judgment_id = ${r.citing_judgment_id},
            overruled_status_changed_at = now(),
            overruled_note = ${`Recorded from the citing court's own annotation: "${r.evidence ?? ''}"`}
        WHERE id = ${r.cited_judgment_id}
          AND overruled_status IS DISTINCT FROM ${target(r)}
      `;
      updated += rows.count;
    }

    console.log(`\nupdated ${updated} judgments`);
    const [counts] = await sql<{ moved: string; total: string }[]>`
      SELECT count(*) FILTER (WHERE overruled_status <> 'none')::text AS moved,
             count(*)::text AS total FROM judgments`;
    console.log(`judgments with overruled_status <> none: ${counts?.moved} of ${counts?.total}`);
  } finally {
    await sql.end();
  }
}

await main();
