/**
 * Evidence regression check — Stage 13's own invariant, measured against real
 * production data rather than assumed from the unit tests.
 *
 *   pnpm --filter @lawmind/api verify:exact-span [--n 500]
 *
 * `resolveExactSpan`/`locateParagraphByOffset` are pure and unit-tested, but a
 * pure function is only as good as what it is fed — the bug this guards
 * against (`docs/CURRENT_PLAN.md` Q1.22, `chunk.ts`'s old `text.indexOf`
 * fallback silently writing `char_offset: 0` for a chunk that was not
 * actually at position 0) was invisible to every unit test in the repo,
 * because `chunk.ts` was internally self-consistent — it reproduced the same
 * wrong offset every time it was asked. It only showed up against real rows.
 *
 * Two checks, both on a random SAMPLE (not a corpus-wide sweep — `full_text`
 * for the whole table is the cost `paragraph-quality-sample.ts` already
 * documents avoiding):
 *
 *   1. THE SIGNATURE. `char_offset = 0 AND chunk_index > 0` is unambiguous —
 *      offset 0 is only ever correct for the first chunk — so this is
 *      checked against the FULL table, not the sample: it is one indexed
 *      count query, not a `full_text` fetch.
 *   2. THE INVARIANT. For a random sample of chunks carrying a non-null
 *      offset: `resolveExactSpan` must recover a slice that is a SUFFIX of
 *      the stored `chunk_text` (the stored text is overlap + body; the
 *      exact span is the body only — see `chunk.ts`'s `Chunk.text` doc).
 *      Any row failing this is print with enough identity to look up by hand.
 *
 * Exit code 1 if either check finds a failure — wireable into CI once a
 * migration-verification job exists for this repo (none does yet, per
 * `docs/CURRENT_PLAN.md` Q1.6).
 */
import postgres from 'postgres';

import { resolveExactSpan } from './paragraphs.ts';

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const nArg = process.argv.indexOf('--n');
  const n = nArg === -1 ? 500 : Number(process.argv[nArg + 1] ?? 500);

  const sql = postgres(url, { max: 2, ssl: url.includes('localhost') ? false : 'require' });
  let exitCode = 0;
  try {
    const [signature] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM judgment_chunks
      WHERE char_offset = 0 AND chunk_index > 0
    `;
    const signatureCount = Number(signature?.n ?? 0);
    console.log(`chunks matching the known bug's signature (char_offset=0, chunk_index>0): ${signatureCount}`);
    if (signatureCount > 0) {
      console.log('  NOT ZERO — a chunk carries an offset that cannot be correct.');
      exitCode = 1;
    }

    const rows = await sql<
      { judgment_id: string; chunk_index: number; chunk_text: string; char_offset: number; char_length: number; full_text: string }[]
    >`
      SELECT c.judgment_id, c.chunk_index, c.chunk_text, c.char_offset, c.char_length, j.full_text
      FROM judgment_chunks c JOIN judgments j ON j.id = c.judgment_id
      WHERE c.char_offset IS NOT NULL
      ORDER BY random()
      LIMIT ${n}
    `;
    console.log(`\nexact-span invariant, sampled n=${rows.length} (requested ${n}):`);

    let ok = 0;
    let boundsFailed = 0;
    let suffixFailed = 0;
    for (const row of rows) {
      const span = resolveExactSpan(row.full_text, row.char_offset, row.char_length);
      if (!span) {
        boundsFailed++;
        console.log(`  BOUNDS FAIL judgment=${row.judgment_id} chunk=${row.chunk_index} offset=${row.char_offset} length=${row.char_length} full_text.length=${row.full_text.length}`);
        continue;
      }
      if (!row.chunk_text.endsWith(span.text)) {
        suffixFailed++;
        console.log(`  SUFFIX FAIL judgment=${row.judgment_id} chunk=${row.chunk_index}`);
        continue;
      }
      ok++;
    }

    console.log(`  ${ok}/${rows.length} passed`);
    console.log(`  ${boundsFailed} failed the bounds check (offset/length invalid against current full_text)`);
    console.log(`  ${suffixFailed} passed bounds but the span is not a suffix of the stored chunk_text`);
    if (boundsFailed > 0 || suffixFailed > 0) exitCode = 1;
  } finally {
    await sql.end();
  }
  process.exitCode = exitCode;
}

await main();
