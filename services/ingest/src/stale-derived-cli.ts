/**
 * `pnpm --filter @lawmind/ingest stale:derived` — finds derived data that was
 * computed from text the corpus no longer holds.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS: REPAIRING A DOCUMENT INVALIDATES EVERYTHING DOWNSTREAM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 2,401 Bombay judgments were re-extracted on 12 Aug 2026 and their text roughly
 * DOUBLED — `voc te for t e etitio e` became `advocate for the petitioner`. Every
 * citation, judge and treatment relationship derived from those documents was
 * computed against the broken half. Some of it is simply absent: a citation that
 * was unreadable could not be extracted, so the document looks like it cites
 * nothing.
 *
 * **A repair is therefore not finished when `full_text` is written.** It is
 * finished when everything derived from that text has been recomputed. This
 * reports what is owed; it does not recompute anything.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO DIFFERENT SIGNALS, BECAUSE ONLY ONE TABLE RECORDS ITS INPUT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `document_enrichments.source_text_hash` stores the hash of the exact text the
 * model was shown, so staleness there is EXACT: recompute the hash, compare.
 * That column exists for precisely this moment.
 *
 * `judgment_citations` records no such hash — it predates the idea — so
 * staleness there can only be INFERRED, from a repaired document whose citation
 * pass ran before the repair. Reported separately and labelled as inference,
 * never mixed with the exact signal. `citations --rescan` is the existing tool
 * that fixes it, and it inserts only what is new.
 *
 * READ-ONLY.
 */
import { createHash } from 'node:crypto';

import postgres from 'postgres';
import { sslFor } from './db-ssl';

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(dbUrl, {
  ssl: sslFor(dbUrl),
  max: 2,
  connect_timeout: 120,
});

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

console.log('STALE DERIVED DATA — what a text repair invalidated');
console.log('='.repeat(74));

/* ------------------------------------------- 1 · enrichments, exact signal -- */

/**
 * Walked in pages rather than joined in one query: the comparison needs the
 * document's full text, and pulling that for every enrichment at once is the
 * mistake that killed three workers today.
 */
let cursor = '00000000-0000-0000-0000-000000000000';
let checked = 0;
let stale = 0;
const staleByTask = new Map<string, number>();

for (;;) {
  const rows = await sql<
    { id: string; task: string; sourceTextHash: string; fullText: string | null }[]
  >`
    SELECT e.id, e.task, e.source_text_hash AS "sourceTextHash", j.full_text AS "fullText"
    FROM document_enrichments e
    JOIN judgments j ON j.id = e.judgment_id
    WHERE e.status = 'ok' AND e.id > ${cursor}::uuid
    ORDER BY e.id
    LIMIT 500`;
  if (rows.length === 0) break;
  cursor = rows[rows.length - 1]!.id;

  for (const r of rows) {
    checked++;
    if (r.fullText === null) continue;
    if (sha256(r.fullText) === r.sourceTextHash) continue;
    stale++;
    staleByTask.set(r.task, (staleByTask.get(r.task) ?? 0) + 1);
  }
  process.stdout.write(`\r  enrichments checked ${checked.toLocaleString()} · stale ${stale}`);
}

console.log('');
console.log('');
console.log(`ENRICHMENTS — exact, by stored source_text_hash`);
console.log(`  checked ${checked.toLocaleString()} · STALE ${stale.toLocaleString()}`);
for (const [task, n] of [...staleByTask].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${task.padEnd(22)} ${n}`);
}
if (stale === 0) {
  console.log('  Nothing stale: no enriched document has been re-extracted since.');
}

/* ------------------------------------------ 2 · citations, inferred signal -- */

/**
 * A repaired document whose only citation row is a sentinel (`citation_text =
 * ''`, the extractor's marker for "this document cites nothing") is the case
 * worth surfacing: the citations may well have been in the half that was
 * unreadable. This is INFERENCE, not proof — a bail order genuinely citing
 * nothing looks identical.
 */
const repairedCourts = ['Bombay High Court', 'Allahabad High Court'];
const citationRisk = await sql<{ court: string; sentinelOnly: number; total: number }[]>`
  SELECT j.court,
         count(*) FILTER (
           WHERE EXISTS (SELECT 1 FROM judgment_citations c
                         WHERE c.citing_judgment_id = j.id AND c.citation_text = '')
             AND NOT EXISTS (SELECT 1 FROM judgment_citations c
                             WHERE c.citing_judgment_id = j.id AND c.citation_text <> '')
         )::int AS "sentinelOnly",
         count(*)::int AS total
  FROM judgments j
  WHERE j.court = ANY(${repairedCourts})
  GROUP BY 1 ORDER BY 1`;

console.log('');
console.log('CITATIONS — inferred, because judgment_citations records no input hash');
for (const r of citationRisk) {
  console.log(
    `  ${r.court.padEnd(24)} ${r.sentinelOnly.toLocaleString()} of ${r.total.toLocaleString()} ` +
      `carry ONLY a "cites nothing" marker`,
  );
}
console.log('');
console.log('  These are candidates, not defects: a bail order that genuinely cites');
console.log('  nothing is indistinguishable here. `citations --rescan` re-reads every');
console.log('  judgment and inserts only what is new, which is the safe way to settle it.');

await sql.end();
