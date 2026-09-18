/**
 * `pnpm --filter @lawmind/ingest corruption:scan` — sweeps the corpus with
 * `text-corruption.ts` and reports how many documents are genuinely damaged.
 *
 * READ-ONLY. It writes nothing: the point is to size the repair job and to name
 * the documents that need it, not to mutate text on the strength of a
 * heuristic. Deterministic and local — no model, no network beyond the database.
 *
 * It also reports what `text_quality` said about each document it condemns,
 * because that comparison is the argument for the module existing.
 */
import postgres from 'postgres';

import { classifyCorruption } from './text-corruption.ts';
import { sslFor } from './db-ssl';

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(dbUrl, { ssl: sslFor(dbUrl), max: 2 });

const BATCH = 2_000;

console.log('CORPUS CORRUPTION SCAN');
console.log('='.repeat(74));

/**
 * KEYSET PAGINATION, not OFFSET. The High Court ingest runs concurrently and is
 * actively inserting rows, so an OFFSET walk over a growing table re-reads and
 * skips unpredictably — the first attempt at this scan reported 104,000
 * documents against a 79,322-row corpus before dying. Paging on the last id
 * seen is stable under concurrent insert.
 *
 * The retry exists for the same reason the first run needed one: a scan of the
 * whole corpus outlives a Railway connection, and losing 100,000 rows of
 * progress to one dropped socket is not acceptable for a read-only report.
 */
let cursor = '00000000-0000-0000-0000-000000000000';
let scanned = 0;
let corrupt = 0;
let tooShort = 0;
let missedByTextQuality = 0;
let reconnects = 0;
const worst: { title: string; tq: string; ratio: number; head: string }[] = [];

for (;;) {
  let rows: { id: string; caseTitle: string; textQuality: string | null; fullText: string }[];
  try {
    rows = await sql`
      SELECT id, case_title AS "caseTitle", text_quality::text AS "textQuality", full_text AS "fullText"
      FROM judgments
      WHERE full_text IS NOT NULL AND id > ${cursor}::uuid
      ORDER BY id
      LIMIT ${BATCH}`;
  } catch (err) {
    if (reconnects >= 8) throw err;
    reconnects++;
    process.stdout.write(`\n  connection lost, resuming from cursor (${reconnects}/8)\n`);
    await new Promise((r) => setTimeout(r, Math.min(30_000, 2000 * 2 ** reconnects)));
    continue;
  }
  if (rows.length === 0) break;
  cursor = rows[rows.length - 1]!.id;

  for (const r of rows) {
    const v = classifyCorruption(r.fullText);
    if (v === null) continue;
    scanned++;
    if (v.signals.tokens < 40) tooShort++;
    if (!v.corrupt) continue;
    corrupt++;
    // The comparison that justifies this module: what did the old metric say?
    if (r.textQuality !== null && Number(r.textQuality) > 0.95) missedByTextQuality++;
    if (worst.length < 12) {
      worst.push({
        title: (r.caseTitle ?? '').slice(0, 40),
        tq: r.textQuality ?? 'null',
        ratio: v.signals.singleCharRatio,
        head: r.fullText.replace(/\s+/g, ' ').slice(0, 70),
      });
    }
  }

  process.stdout.write(`\r  scanned ${scanned.toLocaleString()} · corrupt ${corrupt}`);
  if (rows.length < BATCH) break;
}

console.log('');
console.log('');
console.log('RESULTS');
console.log('='.repeat(74));
console.log(`documents scanned          ${scanned.toLocaleString()}`);
console.log(
  `too short to judge         ${tooShort.toLocaleString()} (reported UNKNOWN, never corrupt)`,
);
console.log(
  `CORRUPT                    ${corrupt.toLocaleString()} (${((100 * corrupt) / Math.max(scanned, 1)).toFixed(3)}%)`,
);
console.log(
  `  of which text_quality > 0.95  ${missedByTextQuality} — invisible to the existing metric`,
);
console.log('');
console.log('worst offenders, with the score the current metric gives them:');
for (const w of worst) {
  console.log(
    `  tq=${w.tq.padEnd(6)} single=${w.ratio.toFixed(2)} ${w.title.padEnd(40)} :: ${w.head.slice(0, 56)}`,
  );
}

await sql.end();
