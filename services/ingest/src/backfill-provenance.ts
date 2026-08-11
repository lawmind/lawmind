/**
 * Back-fill `judgments.content_hash` and `judgments.text_quality` for rows
 * ingested before migration `0031` — task 003's recorded remaining gap
 * (`docs/ai/tasks/003-corpus-inventory.md` §WHAT DID NOT LAND).
 *
 *   pnpm --filter @lawmind/ingest run backfill:provenance [--confirm]
 *
 * All 79,321 rows that predate the migration carry both columns NULL — new
 * writes populate them (`load.ts`'s `upsertBatch`), but nothing repopulates a
 * row that has not been re-ingested since. Without this, "does the mobile
 * High Court variant duplicate the plain one under a different CNR"
 * (`HC_CORPUS_SURVEY.md` §5, the question this whole task exists to answer)
 * cannot be checked on the corpus already held — `content_hash` is the
 * cross-source dedup signal, and it is null everywhere that matters most.
 *
 * **`source_document_type` is deliberately NOT touched here.** It comes from
 * source metadata (`order_type`) that only the original fetch carried; a
 * backfill that only reads `full_text` already in Postgres has no way to
 * recover it without re-fetching, which is explicitly out of scope (task
 * 003: "reads full_text already in Postgres... no re-fetch"). It stays NULL
 * for these rows, honestly, rather than guessed.
 *
 * Keyset pagination on `id`, not `OFFSET`: every row this CLI touches leaves
 * the `WHERE content_hash IS NULL` result set as it writes, so `OFFSET` would
 * skip or repeat rows depending on how the run interleaves with itself.
 */
import { textQuality } from '@lawmind/embed';
import postgres from 'postgres';

import { contentHash } from './load.ts';

const PAGE_SIZE = 500;

type Row = { id: string; full_text: string };

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 10, ssl: 'require' });
  const confirmed = process.argv.includes('--confirm');

  try {
    const [totalRow] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM judgments WHERE content_hash IS NULL`;
    const total = Number(totalRow?.n ?? 0);
    console.log(`judgments missing content_hash/text_quality: ${total}`);

    if (total === 0) {
      console.log('nothing to backfill.');
      return;
    }

    if (!confirmed) {
      const sample = await sql<Row[]>`
        SELECT id, full_text FROM judgments WHERE content_hash IS NULL ORDER BY id LIMIT 5`;
      console.log('\nsample — verify these before trusting the run:');
      for (const r of sample) {
        const quality = textQuality(r.full_text);
        console.log(
          `  ${r.id}  hash=${contentHash(r.full_text).slice(0, 16)}...  ` +
            `quality=${quality === null ? 'null (no alphabetic tokens)' : quality.toFixed(3)}`,
        );
      }
      console.log('\nDRY RUN — nothing written. Re-run with --confirm to apply.');
      return;
    }

    let lastId = '00000000-0000-0000-0000-000000000000';
    let updated = 0;
    for (;;) {
      const page = await sql<Row[]>`
        SELECT id, full_text FROM judgments
         WHERE content_hash IS NULL AND id > ${lastId}
         ORDER BY id LIMIT ${PAGE_SIZE}`;
      if (page.length === 0) break;

      await Promise.all(
        page.map(
          (r) => sql`
            UPDATE judgments
               SET content_hash = ${contentHash(r.full_text)},
                   text_quality = ${textQuality(r.full_text)}
             WHERE id = ${r.id}`,
        ),
      );
      updated += page.length;
      lastId = page[page.length - 1]!.id;
      console.log(`  backfilled ${updated} of ${total}...`);
    }

    console.log(`\nbackfilled ${updated} judgments`);
    const [dupeCheck] = await sql<{ distinct_hashes: string; total_hashed: string }[]>`
      SELECT count(DISTINCT content_hash)::text AS distinct_hashes,
             count(*)::text AS total_hashed
        FROM judgments WHERE content_hash IS NOT NULL`;
    console.log(
      `content_hash now populated on ${dupeCheck?.total_hashed} rows, ` +
        `${dupeCheck?.distinct_hashes} distinct — ` +
        `${Number(dupeCheck?.total_hashed ?? 0) - Number(dupeCheck?.distinct_hashes ?? 0)} exact-text duplicates found`,
    );
  } finally {
    await sql.end();
  }
}

await main();
