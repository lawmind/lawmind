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

const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('CORPUS_DATABASE_URL is not set.');
  process.exit(2);
}
const apply = process.argv.includes('--apply');
const sql = postgres(url, { ssl: url.includes('localhost') ? false : 'require', max: 4 });

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

  for (let offset = 0; offset < total; offset += PAGE) {
    const page = await sql<{ id: string; full_text: string }[]>`
      SELECT id, full_text FROM judgments ORDER BY id LIMIT ${PAGE} OFFSET ${offset}`;

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
  console.log(`\n\n  judgments with at least one section reference : ${withAny} (${((withAny / total) * 100).toFixed(1)}%)`);
  console.log(`  (judgment, act, section) rows                 : ${rowsFound}`);
  console.log('\n  most-referenced acts:');
  for (const [act, n] of [...byAct].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`    ${String(n).padStart(6)}  ${act}`);
  }

  console.log(apply ? '\nWRITTEN.' : '\nDRY RUN — nothing written. Re-run with --apply.');
} finally {
  await sql.end();
}
