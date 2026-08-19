/**
 * `pnpm --filter @lawmind/embed backfill:offsets` — recovers `char_offset`/
 * `char_length` for the 616,197 chunks embedded before migration `0046`
 * added those columns. Stage 13 of `docs/ai/STAGES_9_20_PLAN.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS SAFE TO DERIVE RATHER THAN NEEDING A RE-EMBED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `chunkJudgment` is a pure function of `full_text` and `defaultChunkOptions` —
 * neither has changed since these chunks were written. So re-running it and
 * matching the result back to the stored rows by `(judgment_id, chunk_index)`
 * recovers the exact same offsets that would have been written at embed time,
 * with no model call and no re-embedding.
 *
 * **Never trusted blind.** For every matched pair, the freshly computed
 * `chunk.text` must equal the stored `chunk_text` BYTE FOR BYTE before its
 * offset is written. A judgment whose text was re-ingested, re-OCR'd, or
 * whose row was touched by any process since it was chunked would silently
 * fail this check — mismatched rows are counted and skipped, never forced.
 * `char_offset`/`char_length` stay NULL for anything unverified, which the
 * read path already treats as "exact span unavailable", never as zero.
 *
 * Dry by default; `--apply` writes. Resumable: only judgments with at least
 * one un-backfilled chunk are selected, so a re-run picks up where the last
 * one stopped.
 */
import postgres from 'postgres';

import { chunkJudgment } from './chunk.ts';
import { sslFor } from './db-ssl';

const APPLY = process.argv.includes('--apply');
const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};

const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}

const sql = postgres(url, { ssl: sslFor(url), max: 3 });

console.log('CHUNK OFFSET BACKFILL');
console.log('='.repeat(74));
if (!APPLY) console.log('DRY RUN — nothing will be written. Re-run with --apply.\n');

const limit = arg('--limit', 100_000);
const pageSize = arg('--page-size', 100);

const [before] = await sql<{ total: number; backfilled: number }[]>`
  SELECT count(*)::int AS total, count(*) FILTER (WHERE char_offset IS NOT NULL)::int AS backfilled
  FROM judgment_chunks`;
console.log(`before: ${before?.backfilled.toLocaleString()} / ${before?.total.toLocaleString()} chunks carry an offset`);

const pendingIds = await sql<{ id: string }[]>`
  SELECT DISTINCT c.judgment_id AS id
  FROM judgment_chunks c
  WHERE c.char_offset IS NULL
  LIMIT ${limit}
`;
console.log(`judgments with at least one un-backfilled chunk: ${pendingIds.length}\n`);

let judgmentsProcessed = 0;
let judgmentsChunkCountMismatch = 0;
let chunksMatched = 0;
let chunksTextMismatch = 0;
let chunksOffsetUnverified = 0;
let chunksUpdated = 0;

for (let i = 0; i < pendingIds.length; i += pageSize) {
  const ids = pendingIds.slice(i, i + pageSize).map((r) => r.id);

  const judgments = await sql<{ id: string; full_text: string }[]>`
    SELECT id, full_text FROM judgments WHERE id = ANY(${ids})`;
  const existingRows = await sql<{ judgment_id: string; chunk_index: number; chunk_text: string }[]>`
    SELECT judgment_id, chunk_index, chunk_text FROM judgment_chunks
    WHERE judgment_id = ANY(${ids}) AND char_offset IS NULL`;

  const existingByJudgment = new Map<string, Map<number, string>>();
  for (const row of existingRows) {
    const m = existingByJudgment.get(row.judgment_id) ?? new Map();
    m.set(row.chunk_index, row.chunk_text);
    existingByJudgment.set(row.judgment_id, m);
  }

  const updates: { judgment_id: string; chunk_index: number; char_offset: number; char_length: number }[] = [];

  for (const j of judgments) {
    judgmentsProcessed++;
    const existing = existingByJudgment.get(j.id);
    if (!existing) continue;

    const recomputed = chunkJudgment(j.full_text);
    if (recomputed.length !== existing.size) {
      // The stored row count and a fresh chunk of the SAME full_text disagree —
      // chunkJudgment or defaultChunkOptions changed since these were written,
      // or the row set is otherwise not what this backfill assumes. Recorded as
      // a category, not silently reconciled by index.
      judgmentsChunkCountMismatch++;
    }

    for (const chunk of recomputed) {
      const storedText = existing.get(chunk.index);
      if (storedText === undefined) continue;
      chunksMatched++;
      if (storedText !== chunk.text) {
        chunksTextMismatch++;
        continue;
      }
      // chunk.ts verifies its own offset before returning it and reports -1
      // when that verification failed (a merged chunk whose synthesised
      // separator did not match the source's real gap). Left NULL here too,
      // same as an unmatched or text-mismatched chunk -- never written as a
      // literal -1, which would pass a bounds check and read as a real
      // position.
      if (chunk.offset < 0) {
        chunksOffsetUnverified++;
        continue;
      }
      updates.push({
        judgment_id: j.id,
        chunk_index: chunk.index,
        char_offset: chunk.offset,
        char_length: chunk.bodyLength,
      });
    }
  }

  if (APPLY && updates.length > 0) {
    // One statement per page, not one per chunk — the lesson resolve-cli.ts
    // already paid for: thousands of single-row updates over the Railway proxy
    // is how a run dies at a timeout rather than a bug.
    // `sql.json(updates)`, NOT `${JSON.stringify(updates)}::jsonb` -- the
    // latter double-encodes under this driver (`postgres` 3.4.9): the cast
    // sees a JS string and re-serialises it, producing a jsonb SCALAR STRING
    // containing escaped JSON rather than a jsonb ARRAY, so
    // `jsonb_to_recordset` refuses it outright with "cannot call ... on a
    // non-array". Confirmed by direct repro before this fix, not guessed at.
    await sql`
      UPDATE judgment_chunks c
      SET char_offset = u.char_offset, char_length = u.char_length
      FROM (
        SELECT * FROM jsonb_to_recordset(${sql.json(updates)})
          AS x(judgment_id uuid, chunk_index int, char_offset int, char_length int)
      ) u
      WHERE c.judgment_id = u.judgment_id AND c.chunk_index = u.chunk_index
    `;
  }
  chunksUpdated += updates.length;

  console.log(
    `[${Math.min(i + pageSize, pendingIds.length)}/${pendingIds.length}] judgments · ` +
      `matched ${chunksMatched} · text-mismatch ${chunksTextMismatch} · ` +
      `${APPLY ? 'updated' : 'would update'} ${chunksUpdated}`,
  );
}

console.log('');
console.log('RESULTS');
console.log('='.repeat(74));
console.log(`judgments processed              ${judgmentsProcessed}`);
console.log(`judgments with a chunk-count mismatch (not backfilled from) ${judgmentsChunkCountMismatch}`);
console.log(`chunks matched by (judgment, index) ${chunksMatched}`);
console.log(`chunks with a chunk_text mismatch, SKIPPED ${chunksTextMismatch}`);
console.log(`chunks whose offset failed chunk.ts's own self-check, SKIPPED ${chunksOffsetUnverified}`);
console.log(`chunks ${APPLY ? 'updated' : 'that WOULD be updated'} ${chunksUpdated}`);

if (APPLY) {
  const [after] = await sql<{ total: number; backfilled: number }[]>`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE char_offset IS NOT NULL)::int AS backfilled
    FROM judgment_chunks`;
  console.log(`\nafter: ${after?.backfilled.toLocaleString()} / ${after?.total.toLocaleString()} chunks carry an offset`);
} else {
  console.log('\nDRY RUN — nothing written. Re-run with --apply.');
}

await sql.end();
