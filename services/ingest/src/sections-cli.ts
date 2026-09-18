/**
 * Build the judgment → statute-section index.
 *
 *   pnpm --filter @lawmind/ingest sections          # measure, write nothing
 *   pnpm --filter @lawmind/ingest sections --apply  # write the rows
 *
 * **Streamed in pages, not loaded whole.** The corpus is 1.3 GB of full text;
 * reading it into memory to scan it would be the kind of job that works on
 * 38,341 judgments and dies on the first million.
 */
import postgres from 'postgres';

import { canonicalAct, extractSectionRefs, foldSectionRefs } from './sections.ts';
import { sslFor } from './db-ssl';

const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('CORPUS_DATABASE_URL is not set.');
  process.exit(2);
}
const apply = process.argv.includes('--apply');
const sql = postgres(url, { ssl: sslFor(url), max: 4 });

const PAGE = 500;

try {
  const [countRow] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM judgments`;
  const total = countRow?.n ?? 0;
  console.log(`${total} judgments to scan${apply ? '' : ' (DRY RUN)'}`);

  let scanned = 0;
  let withAny = 0;
  let rowsFound = 0;
  const byAct = new Map<string, number>();
  const pending: {
    judgment_id: string;
    act_named: string;
    act_key: string;
    section_number: string;
    occurrences: number;
    first_offset: number;
  }[] = [];

  /**
   * KEYSET PAGINATION AND RESUME, because both assumptions this loop was built
   * on have stopped holding.
   *
   * It walked with `LIMIT ... OFFSET`, which is only stable against a table
   * nobody is writing to. NEW2 now runs ten ingest workers and the corpus has
   * gone from ~79,000 rows to 592,027 while this session was open — under
   * concurrent insert an OFFSET walk re-reads some rows and silently skips
   * others, which for an extraction pass means missing documents nobody can
   * identify afterwards.
   *
   * It also rescanned the whole corpus every run. At 25,466 of 592,027
   * documents already carrying refs (4.3%), rescanning all of them to find the
   * 95.7% that need work is most of the cost for none of the benefit.
   *
   * `--resume` skips documents that already have a statute reference. Without
   * it the walk covers everything, which is what a changed extractor needs.
   */
  const RESUME = process.argv.includes('--resume');

  /**
   * `--since <iso>` — the DELTA bound, added 29 Aug 2026 (NEW2 R10).
   *
   * LCC measured (bus 1446) that `judgment_statute_refs` had **no new row in
   * sixteen days** and 0 of the 1,334 judgments from the overnight cycle had
   * reached it. This CLI was the reason: `--resume` skips documents that already
   * carry a ref, which still walks the 95.7% that do not — the whole corpus,
   * every run. That is a shape nothing can put in a daily cycle, so nobody did,
   * and the arm quietly stopped being part of the factory.
   *
   * `--since` bounds the walk to judgments ingested after a timestamp, which is
   * the delta shape the cycle needs. It composes with `--resume`: the cycle
   * passes both, so a re-run over the same window is cheap and idempotent.
   *
   * It bounds on `created_at` — when WE ingested — not on `judgment_date`, which
   * is when the court decided. A 1974 judgment ingested this morning is delta
   * work; a judgment decided this morning that we ingested last week is not.
   */
  const sinceIdx = process.argv.indexOf('--since');
  const SINCE = sinceIdx === -1 ? null : (process.argv[sinceIdx + 1] ?? null);
  if (SINCE && Number.isNaN(Date.parse(SINCE))) {
    console.error(
      `--since ${JSON.stringify(SINCE)} is not a parseable timestamp. Refusing rather than walking everything.`,
    );
    process.exit(2);
  }

  let cursor = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const page = await sql<{ id: string; full_text: string }[]>`
      SELECT id, full_text FROM judgments
      WHERE id > ${cursor}::uuid
        ${SINCE ? sql`AND created_at >= ${SINCE}::timestamptz` : sql``}
        ${RESUME ? sql`AND NOT EXISTS (SELECT 1 FROM judgment_statute_refs r WHERE r.judgment_id = judgments.id)` : sql``}
      ORDER BY id LIMIT ${PAGE}`;
    if (page.length === 0) break;
    cursor = page[page.length - 1]!.id;

    for (const j of page) {
      scanned++;
      const folded = foldSectionRefs(extractSectionRefs(j.full_text));
      if (folded.length === 0) continue;
      withAny++;
      rowsFound += folded.length;
      for (const f of folded) {
        const key = canonicalAct(f.actNamed);
        byAct.set(key, (byAct.get(key) ?? 0) + 1);
        pending.push({
          judgment_id: j.id,
          act_named: f.actNamed.slice(0, 200),
          act_key: canonicalAct(f.actNamed).slice(0, 200),
          section_number: f.section,
          occurrences: f.occurrences,
          first_offset: f.firstOffset,
        });
      }
    }

    if (apply && pending.length >= 2000) {
      await sql`
        INSERT INTO judgment_statute_refs ${sql(pending)}
        ON CONFLICT (judgment_id, act_named, section_number)
          DO UPDATE SET occurrences = EXCLUDED.occurrences`;
      pending.length = 0;
    }
    process.stdout.write(`\r  scanned ${scanned}/${total} · ${rowsFound} refs`);
  }

  if (apply && pending.length > 0) {
    await sql`
      INSERT INTO judgment_statute_refs ${sql(pending)}
      ON CONFLICT (judgment_id, act_named, section_number)
        DO UPDATE SET occurrences = EXCLUDED.occurrences`;
  }

  /**
   * **Coverage reported honestly, always.** A section index covering a small
   * fraction of the corpus is worse than none if it is presented as complete —
   * an advocate searching `section:138` and seeing four results concludes there
   * are four cases, not that the index is thin.
   */
  console.log(
    `\n\n  judgments with at least one section reference : ${withAny} (${((withAny / total) * 100).toFixed(1)}%)`,
  );
  console.log(`  (judgment, act, section) rows                 : ${rowsFound}`);
  console.log('\n  most-referenced acts:');
  for (const [act, n] of [...byAct].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`    ${String(n).padStart(6)}  ${act}`);
  }

  console.log(apply ? '\nWRITTEN.' : '\nDRY RUN — nothing written. Re-run with --apply.');
} finally {
  await sql.end();
}
