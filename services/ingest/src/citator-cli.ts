/**
 * Build the citator from the reporters' own treatment notes.
 *
 *   pnpm --filter @lawmind/ingest citator          # measure, write nothing
 *   pnpm --filter @lawmind/ingest citator --apply  # write relationships + status
 *
 * **Dry by default, and that is not a convenience.** Writing `set_aside` raises
 * the LAW MOVED mark and disables add-to-matter. A wrong one tells an advocate a
 * good authority is dead, so the default has to be the safe one.
 */
import postgres from 'postgres';

import { type Treatment, readTreatment } from './treatment.ts';
import { sslFor } from './db-ssl';

const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('CORPUS_DATABASE_URL is not set.');
  process.exit(2);
}
const apply = process.argv.includes('--apply');
const sql = postgres(url, { ssl: sslFor(url), max: 4 });

/** Strongest wins when several judgments treat the same authority differently. */
const RANK: Record<string, number> = { set_aside: 3, partly_set_aside: 2, doubted: 1 };

try {
  console.log(`reading treatments${apply ? '' : ' (DRY RUN)'}…`);

  const rows = await sql<
    { id: string; cited: string; citation_text: string; after: string; relationship: string }[]
  >`
    SELECT jc.id, jc.cited_judgment_id AS cited, jc.citation_text, jc.relationship,
           substring(j.full_text FROM greatest(1, jc.char_offset - 40) FOR 200) AS after
      FROM judgment_citations jc
      JOIN judgments j ON j.id = jc.citing_judgment_id
     WHERE jc.cited_judgment_id IS NOT NULL`;
  console.log(`  ${rows.length} resolved citation edges to read`);

  const found = new Map<string, { t: Treatment; cited: string }>();
  const tally: Record<string, number> = {};
  for (const r of rows) {
    const t = readTreatment(r.citation_text, r.after);
    if (!t) continue;
    found.set(r.id, { t, cited: r.cited });
    tally[t.relationship] = (tally[t.relationship] ?? 0) + 1;
  }

  console.log(`\n  ${found.size} edges carry a treatment the reporter printed:`);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(20)} ${v}`);
  }

  // Strongest status per cited judgment.
  const status = new Map<string, { s: string; evidence: string }>();
  for (const { t, cited } of found.values()) {
    if (!t.overruled) continue;
    const prev = status.get(cited);
    if (!prev || (RANK[t.overruled] ?? 0) > (RANK[prev.s] ?? 0)) {
      status.set(cited, { s: t.overruled, evidence: t.evidence });
    }
  }

  const bySt: Record<string, number> = {};
  for (const v of status.values()) bySt[v.s] = (bySt[v.s] ?? 0) + 1;
  console.log(`\n  JUDGMENTS whose status would change: ${status.size}`);
  for (const [k, v] of Object.entries(bySt)) console.log(`    ${k.padEnd(20)} ${v}`);
  console.log(`  currently flagged in the database   : 22`);

  console.log('\n  a sample, with the words that justified each:');
  for (const [id, v] of [...status].slice(0, 8)) {
    console.log(`    ${id.slice(0, 8)}  ${v.s.padEnd(16)} "${v.evidence.slice(0, 76)}"`);
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  } else {
    const CHUNK = 500;
    /**
     * `evidence` is written alongside `relationship`, always. The column already
     * exists on `judgment_citations` and its own comment says why: *"The court's
     * own phrase that justified the relationship. Auditable."* A relationship
     * recorded without the words that justified it is an assertion nobody can
     * check — and this citator is going to tell advocates that authorities are
     * dead.
     *
     * `relationship` is a plain `text` column, not an enum. The first attempt
     * cast to `::citation_relationship` and Postgres answered 42704, type does
     * not exist — a good failure, since it is loud and immediate.
     */
    const edges = [...found].map(([id, { t }]) => ({
      id,
      relationship: t.relationship,
      evidence: t.evidence.slice(0, 300),
    }));
    let n = 0;
    for (let i = 0; i < edges.length; i += CHUNK) {
      const batch = edges.slice(i, i + CHUNK);
      await sql`
        UPDATE judgment_citations jc
           SET relationship = b.relationship, evidence = b.evidence
          FROM (VALUES ${sql(batch.map((e) => [e.id, e.relationship, e.evidence]))})
                 AS b(id, relationship, evidence)
         WHERE jc.id = b.id::uuid`;
      n += batch.length;
      process.stdout.write(`\r  relationships written ${n}/${edges.length}`);
    }
    console.log('');

    /**
     * `overruled_status_changed_at` is set in the SAME write, always. Without it
     * the stale-overruled rate cannot separate a badge that was wrong when drawn
     * from one the world invalidated afterwards — `judgments`' own comment says
     * so, and it is the difference between a metric and a number.
     */
    let s = 0;
    for (const [cited, v] of status) {
      await sql`
        UPDATE judgments
           SET overruled_status = ${v.s}::overruled_status,
               overruled_status_changed_at = now(),
               overruled_note = ${`Reporter treatment: ${v.evidence.slice(0, 240)}`}
         WHERE id = ${cited} AND overruled_status = 'none'`;
      s++;
    }
    console.log(`  statuses written ${s}`);
  }
} finally {
  await sql.end();
}
